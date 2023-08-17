// @ts-nocheck
/* eslint-disable no-undef */
RESTRequest = Java.type("com.ibm.tivoli.oslc.RESTRequest");

RuntimeException = Java.type("java.lang.RuntimeException");
System = Java.type("java.lang.System");

URLDecoder = Java.type("java.net.URLDecoder");
StandardCharsets = Java.type("java.nio.charset.StandardCharsets");

MboConstants = Java.type("psdi.mbo.MboConstants");
SqlFormat = Java.type("psdi.mbo.SqlFormat");
MXServer = Java.type("psdi.server.MXServer");

MXException = Java.type("psdi.util.MXException");
MXAccessException = Java.type("psdi.util.MXAccessException");
MXApplicationException = Java.type("psdi.util.MXApplicationException");

PresentationLoader = Java.type("psdi.webclient.system.controller.PresentationLoader");
WebClientSessionFactory = Java.type("psdi.webclient.system.session.WebClientSessionFactory");
WebClientSessionManager = Java.type("psdi.webclient.system.session.WebClientSessionManager");

MXLoggerFactory = Java.type("psdi.util.logging.MXLoggerFactory");

// MAS removed support for legacy JDOM, switch to JDOM2 and then fall back to legacy JDOM for older versions.  
try {
    Element = Java.type("org.jdom2.Element");
    SAXBuilder = Java.type("org.jdom2.input.SAXBuilder");
    Format = Java.type("org.jdom2.output.Format");
    XMLOutputter = Java.type("org.jdom2.output.XMLOutputter");

} catch (error) {
    if (error instanceof Java.type("java.lang.ClassNotFoundException")) {
        Element = Java.type("org.jdom.Element");
        SAXBuilder = Java.type("org.jdom.input.SAXBuilder");
        Format = Java.type("org.jdom.output.Format");
        XMLOutputter = Java.type("org.jdom.output.XMLOutputter");
    }
}

StringReader = Java.type("java.io.StringReader");
StringWriter = Java.type("java.io.StringWriter");

var logger = MXLoggerFactory.getLogger("maximo.script." + service.getScriptName());

main();

function main() {
    if (typeof httpMethod !== "undefined") {
        var response = {};
        try {
            if (httpMethod.toLowerCase() === "get") {
                var screenName = getRequestScreentName();
                if (typeof screenName === "undefined" || screenName === null || !screenName) {
                    // If nothing is requested then return a list of all screens.
                    var presentationSet;
                    try {
                        presentationSet = MXServer.getMXServer().getMboSet("MAXPRESENTATION", userInfo);

                        var presentations = [];
                        var presentation = presentationSet.getMbo(0);

                        while (presentation) {
                            presentations.push(presentation.getString("APP"));
                            presentationSet.remove(0);
                            presentation = presentationSet.getMbo(0);
                        }

                        response.status = "success";
                        response.screenNames = presentations;
                        responseBody = JSON.stringify(response);
                    } finally {
                        close(presentationSet);
                    }
                } else {
                    response.status = "success";
                    response.presentation = extractScreen(screenName);
                    responseBody = JSON.stringify(response);
                }
                return;
            } else if (httpMethod.toLowerCase() === "post" && typeof requestBody !== "undefined") {
                var screen = new SAXBuilder().build(new StringReader(requestBody));
                var metadata = screen.getRootElement().getChild("metadata");

                if (metadata) {
                    var controlGroups = metadata.getChildren("ctrlgroup");

                    // remove any existing control groups
                    resetControlGroups(screen.getRootElement().getAttributeValue("id"));
                    if (controlGroups) {
                        controlGroups.forEach(function (controlGroupInfo) {
                            createGroupIfNotExists(controlGroupInfo.getChild("group"));
                            createOrUpdateSigOption(controlGroupInfo.getChild("sigoption"));

                            controlConditions = controlGroupInfo.getChildren("ctrlcondition");

                            if (controlConditions) {
                                controlConditions.forEach(function (controlCondition) {
                                    var conditionInfo = controlCondition.getChild("condition");

                                    if (conditionInfo) {
                                        createOrUpdateCondition(conditionInfo);
                                    }
                                });
                            }

                            // add the control groups defined by the application.
                            createControlGroup(controlGroupInfo);
                        });
                    }
                    //Remove the meta data from the XML so the Maximo screen parser doesn't process it.
                    screen.getRootElement().removeChild("metadata");
                }

                var writer = new StringWriter();

                new XMLOutputter(Format.getPrettyFormat()).output(screen, writer);

                var loader = new PresentationLoader();
                var wcsf = WebClientSessionFactory.getWebClientSessionFactory();
                var wcs = wcsf.createSession(request.getHttpServletRequest(), request.getHttpServletResponse());

                loader.importApp(wcs, writer.toString());

                response.status = "success";
                responseBody = JSON.stringify(response);
            } else {
                throw new ScriptError("only_get_supported", "Only the HTTP GET method is supported when extracting automation scripts.");
            }
        } catch (error) {
            response.status = "error";

            if (error instanceof ScreenError) {
                response.message = error.message;
                response.reason = error.reason;
            } else if (error instanceof SyntaxError) {
                response.reason = "syntax_error";
                response.message = error.message;
            } else if (error instanceof Error) {
                response.message = error.message;
            } else if (error instanceof MXException) {
                response.reason = error.getErrorGroup() + "_" + error.getErrorKey();
                response.message = error.getMessage();
            } else if (error instanceof RuntimeException) {
                if (error.getCause() instanceof MXException) {
                    response.reason = error.getCause().getErrorGroup() + "_" + error.getCause().getErrorKey();
                    response.message = error.getCause().getMessage();
                } else {
                    response.reason = "runtime_exception";
                    response.message = error.getMessage();
                }
            } else {
                response.cause = error;
            }

            if (typeof httpMethod !== "undefined") {
                responseBody = JSON.stringify(response);
            }

            logger.error(error);

            return;
        }
    }
}

function resetControlGroups(app) {
    var ctrlGroupSet;
    try {
        ctrlGroupSet = MXServer.getMXServer().getMboSet("CTRLGROUP", userInfo);

        var sqlf = new SqlFormat("app = :1");

        sqlf.setObject(1, "CTRLGROUP", "APP", app);

        ctrlGroupSet.setWhere(sqlf.format());

        ctrlGroupSet.deleteAll();
        ctrlGroupSet.save();
    } finally {
        close(ctrlGroupSet);
    }
}

function createControlGroup(ctrlGroupInfo) {
    var ctrlGroupSet;
    try {
        ctrlGroupSet = MXServer.getMXServer().getMboSet("CTRLGROUP", userInfo);

        var ctrlGroup = ctrlGroupSet.add();
        ctrlGroup.setValue("GROUPNAME", ctrlGroupInfo.getAttributeValue("groupname"));
        ctrlGroup.setValue("OPTIONNAME", ctrlGroupInfo.getAttributeValue("optionname"), MboConstants.NOACCESSCHECK);
        ctrlGroup.setValue("APP", ctrlGroupInfo.getAttributeValue("app"), MboConstants.NOACCESSCHECK);

        // This normally relies on being part of a set that is attached to the application.
        // Since we are confident that the values being added are correct, allow no-validation.
        ctrlGroup.setValue("GROUPSEQ", ctrlGroupInfo.getAttributeValue("groupseq"), MboConstants.NOVALIDATION);

        var ctrlConditionSet = ctrlGroup.getMboSet("CTRLCONDITION");
        var controlConditions = ctrlGroupInfo.getChildren("ctrlcondition");
        if (controlConditions) {
            controlConditions.forEach(function (controlConditionInfo) {
                ctrlCondition = ctrlConditionSet.add();
                ctrlCondition.setValue("CONDITIONNUM", controlConditionInfo.getAttributeValue("conditionnum"));
                ctrlCondition.setValue("CONDITIONSEQ", controlConditionInfo.getAttributeValue("conditionseq"));
                ctrlCondition.setValue("REEVALUATE", controlConditionInfo.getAttributeValue("reevaluate"));

                var controlCondProps = controlConditionInfo.getChildren("ctrlcondprop");

                if (controlCondProps) {
                    var ctrlCondPropSet = ctrlCondition.getMboSet("CTRLCONDPROP");
                    controlCondProps.forEach(function (controlCondPropInfo) {
                        var ctrlCondProp = ctrlCondPropSet.add();
                        ctrlCondProp.setValue("CONDITIONRESULT", controlCondPropInfo.getAttributeValue("conditionresult"));
                        ctrlCondProp.setValue("PROPERTY", controlCondPropInfo.getAttributeValue("property"));
                        ctrlCondProp.setValue("PROPERTYVALUE", controlCondPropInfo.getAttributeValue("propertyvalue"));
                    });
                }
            });
        }

        ctrlGroupSet.save();
    } finally {
        close(ctrlGroupSet);
    }
}

function createOrUpdateCondition(conditionInfo) {
    if (conditionInfo) {
        var conditionSet;
        try {
            conditionSet = MXServer.getMXServer().getMboSet("CONDITION", userInfo);
            var sqlf = new SqlFormat("conditionnum = :1");
            sqlf.setObject(1, "CONDITION", "CONDITIONNUM", conditionInfo.getAttributeValue("conditionnum"));
            conditionSet.setWhere(sqlf.format());

            var condition;

            if (conditionSet.isEmpty()) {
                condition = conditionSet.add();
                condition.setValue("CONDITIONNUM", conditionInfo.getAttributeValue("conditionnum"));
            } else {
                condition = conditionSet.moveFirst();
            }
            condition.setValue("DESCRIPTION", conditionInfo.getAttributeValue("description"));
            condition.setValue("TYPE", conditionInfo.getAttributeValue("type"));
            condition.setValue("EXPRESSION", conditionInfo.getAttributeValue("expression"));
            condition.setValue("CLASSNAME", conditionInfo.getAttributeValue("classname"), MboConstants.NOACCESSCHECK);
            condition.setValue("NOCACHING", conditionInfo.getAttributeValue("nocaching"));

            conditionSet.save();
        } finally {
            close(conditionSet);
        }
    }
}

function createOrUpdateSigOption(sigOptionInfo) {
    if (sigOptionInfo) {
        var sigOptionSet;
        try {
            sigOptionSet = MXServer.getMXServer().getMboSet("SIGOPTION", userInfo);
            var sqlf = new SqlFormat("optionname = :1 and app = :2");
            sqlf.setObject(1, "SIGOPTION", "OPTIONNAME", sigOptionInfo.getAttributeValue("optionname"));
            sqlf.setObject(2, "SIGOPTION", "APP", sigOptionInfo.getAttributeValue("app"));

            sigOptionSet.setWhere(sqlf.format());
            var sigOption;
            var sigOptFlag;
            var sigOptFlagSet;
            if (sigOptionSet.isEmpty()) {
                sigOption = sigOptionSet.add();
                sigOption.setValue("APP", sigOptionInfo.getAttributeValue("app"));
                sigOption.setValue("OPTIONNAME", sigOptionInfo.getAttributeValue("optionname"));
                sigOption.setValue("DESCRIPTION", sigOptionInfo.getAttributeValue("description"));
                sigOption.setValue("ESIGENABLED", sigOptionInfo.getAttributeValue("esigenabled"));
                sigOption.setValue("VISIBLE", sigOptionInfo.getAttributeValue("visible"));
                sigOption.setValue("ALSOGRANTS", sigOptionInfo.getAttributeValue("alsogrants"));
                sigOption.setValue("ALSOREVOKES", sigOptionInfo.getAttributeValue("alsorevokes"));
                sigOption.setValue("PREREQUISITE", sigOptionInfo.getAttributeValue("prerequisite"));
                sigOption.setValue("LANGCODE", sigOptionInfo.getAttributeValue("langcode"));

                sigoptFlagInfo = sigOptionInfo.getChild("sigoptflag");
                if (sigoptFlagInfo) {
                    sigOptFlag = sigOption.getMboSet("SIGOPTFLAG").add();
                    sigOptFlag.setValue("APP", sigoptFlagInfo.getAttributeValue("app"));
                    sigOptFlag.setValue("OPTIONNAME", sigoptFlagInfo.getAttributeValue("optionname"));
                    sigOptFlag.setValue("FLAGNAME", sigoptFlagInfo.getAttributeValue("flagname"));
                    sigOptFlag.setValue("VALUE", sigoptFlagInfo.getAttributeValue("value"));
                }
                sigOptionSet.save();
            } else {
                sigOption = sigOptionSet.moveFirst();
                sigOption.setValue("DESCRIPTION", sigOptionInfo.getAttributeValue("description"));
                sigOption.setValue("ESIGENABLED", sigOptionInfo.getAttributeValue("esigenabled"));
                sigOption.setValue("VISIBLE", sigOptionInfo.getAttributeValue("visible"));
                sigOption.setValue("ALSOGRANTS", sigOptionInfo.getAttributeValue("alsogrants"));
                sigOption.setValue("ALSOREVOKES", sigOptionInfo.getAttributeValue("alsorevokes"));
                sigOption.setValue("PREREQUISITE", sigOptionInfo.getAttributeValue("prerequisite"));

                sigoptFlagInfo = sigOptionInfo.getChild("sigoptflag");
                if (sigoptFlagInfo) {
                    sigOptFlagSet = sigOption.getMboSet("SIGOPTFLAG");
                    if (!sigOptFlagSet.isEmpty()) {
                        sigOptFlag = sigOptFlagSet.moveFirst();
                        sigOptFlag.setValue("FLAGNAME", sigoptFlagInfo.getAttributeValue("flagname"));
                        sigOptFlag.setValue("VALUE", sigoptFlagInfo.getAttributeValue("value"));
                    } else {
                        sigOptFlag = sigOption.getMboSet("SIGOPTFLAG").add();
                        sigOptFlag.setValue("APP", sigoptFlagInfo.getAttributeValue("app"));
                        sigOptFlag.setValue("OPTIONNAME", sigoptFlagInfo.getAttributeValue("optionname"));
                        sigOptFlag.setValue("FLAGNAME", sigoptFlagInfo.getAttributeValue("flagname"));
                        sigOptFlag.setValue("VALUE", sigoptFlagInfo.getAttributeValue("value"));
                    }
                } else {
                    sigOptFlagSet = sigOption.getMboSet("SIGOPTFLAG");
                    if (!sigOptFlagSet.isEmpty()) {
                        sigOptFlagSet.deleteAll();
                    }
                }
            }
        } finally {
            close(sigOptionSet);
        }
    }
}

function createGroupIfNotExists(groupInfo) {
    if (groupInfo) {
        var groupSet;
        try {
            groupSet = MXServer.getMXServer().getMboSet("MAXGROUP", userInfo);
            var sqlf = new SqlFormat("groupname = :1");
            sqlf.setObject(1, "MAXGROUP", "GROUPNAME", groupInfo.getAttributeValue("groupname"));

            groupSet.setWhere(sqlf.format());
            if (groupSet.isEmpty()) {
                var group = groupSet.add();
                group.setValue("GROUPNAME", groupInfo.getAttributeValue("groupname"));
                group.setValue("DESCRIPTION", groupInfo.getAttributeValue("description"));
                group.setValue("PASSWORDDURATION", groupInfo.getAttributeValue("passwordduration"));
                group.setValue("PASSWORDWARNING", groupInfo.getAttributeValue("passwordwarning"));
                group.setValue("INDEPENDENT", groupInfo.getAttributeValue("independent"));
                group.setValue("AUTHALLSITES", groupInfo.getAttributeValue("authallsites"));
                group.setValue("AUTHALLGLS", groupInfo.getAttributeValue("authallgls"));
                group.setValue("AUTHALLSTOREROOMS", groupInfo.getAttributeValue("authallstorerooms"));
                group.setValue("AUTHLABORALL", groupInfo.getAttributeValue("authlaborall"));
                group.setValue("AUTHLABORCREW", groupInfo.getAttributeValue("authlaborcrew"));
                group.setValue("AUTHLABORSELF", groupInfo.getAttributeValue("authlaborself"));
                group.setValue("AUTHLABORSUPER", groupInfo.getAttributeValue("authlaborsuper"));
                group.setValue("LANGCODE", groupInfo.getAttributeValue("langcode"));
                group.setValue(
                    "SCTEMPLATEID",
                    scTemplateExists(groupInfo.getAttributeValue("sctemplateid")) ? groupInfo.getAttributeValue("sctemplateid") : ""
                );
                group.setValue("AUTHPERSONGROUP", groupInfo.getAttributeValue("authpersongroup"));
                group.setValue("NULLREPFAC", groupInfo.getAttributeValue("nullrepfac"));
                group.setValue("AUTHALLREPFACS", groupInfo.getAttributeValue("authallrepfacs"));
                group.setValue("MAXSCHEDREPORT", groupInfo.getAttributeValue("maxschedreport"));
                group.setValue("DFLTAPP", groupInfo.getAttributeValue("dfltapp"));
                group.setValue("ADHOCCREATELIMIT", groupInfo.getAttributeValue("adhoccreatelimit"));
                group.setValue("REPORTSTOPLIMIT", groupInfo.getAttributeValue("reportstoplimit"));
                group.setValue("SIDENAV", groupInfo.getAttributeValue("sidenav"));
                group.setValue("WORKCENTER", groupInfo.getAttributeValue("workcenter"));

                groupSet.save();
            }
        } finally {
            close(groupSet);
        }
    }
}

function scTemplateExists(templateId) {
    if (templateId && templateId != "") {
        var sctemplateSet;
        try {
            sctemplateSet = MXServer.getMXServer().getMboSet("SCTEMPLATE", userInfo);
            var sqlf = new SqlFormat("groupname = :1");
            sqlf.setObject(1, "SCTEMPLATE", "SCTEMPLATEID", templateId);
            sctemplateSet.setWhere(sqlf.format());

            return !sctemplateSet.exists();
        } finally {
            close(sctemplateSet);
        }
    }
}

function extractScreen(screenName) {
    var maxpresentationSet;
    try {
        maxpresentationSet = MXServer.getMXServer().getMboSet("MAXPRESENTATION", userInfo);
        var sqlf = new SqlFormat("app = :1");
        sqlf.setObject(1, "MAXPRESENTATION", "APP", screenName);

        maxpresentationSet.setWhere(sqlf.format());

        if (!maxpresentationSet.isEmpty()) {
            var maxpresentation = maxpresentationSet.moveFirst();
            return addConditionalExpressionsMetaData(maxpresentation.getString("PRESENTATION"), screenName);
        } else {
            throw new ScreenError("screen_not_found", "The screen definition for " + screenName + " was not found.");
        }
    } finally {
        close(maxpresentationSet);
    }
}

function addConditionalExpressionsMetaData(xml, screenName) {
    var screen = new SAXBuilder().build(new StringReader(xml));

    var controlGroupSet;

    try {
        controlGroupSet = MXServer.getMXServer().getMboSet("CTRLGROUP", userInfo);
        var sqlf = new SqlFormat("app = :1");
        sqlf.setObject(1, "CTRLGROUP", "APP", screenName);

        controlGroupSet.setWhere(sqlf.format());

        if (!controlGroupSet.isEmpty()) {
            controlGroup = controlGroupSet.moveFirst();
            var presentation = screen.getRootElement();
            var metadata = new Element("metadata");
            while (controlGroup) {
                metadata.addContent(getControlGroup(controlGroup));
                controlGroup = controlGroupSet.moveNext();
            }
            presentation.addContent(0, metadata);
            var writer = new StringWriter();
            var outputter = new XMLOutputter(Format.getPrettyFormat());
            outputter.output(screen, writer);

            return writer.toString();
        } else {
            return xml;
        }
    } finally {
        close(controlGroupSet);
    }
}

function getControlGroup(controlGroup) {
    var ctrlgroup = new Element("ctrlgroup");
    ctrlgroup.setAttribute("groupname", controlGroup.getString("GROUPNAME"));
    ctrlgroup.setAttribute("optionname", controlGroup.getString("OPTIONNAME"));
    ctrlgroup.setAttribute("app", controlGroup.getString("APP"));
    ctrlgroup.setAttribute("groupseq", controlGroup.getString("GROUPSEQ"));

    var sigoption = new Element("sigoption");
    sigoption.setAttribute("optionname", controlGroup.getString("SIGOPTION.OPTIONNAME"));
    sigoption.setAttribute("app", controlGroup.getString("SIGOPTION.APP"));
    sigoption.setAttribute("description", controlGroup.getString("SIGOPTION.DESCRIPTION"));
    sigoption.setAttribute("esigenabled", controlGroup.getString("SIGOPTION.ESIGENABLED"));
    sigoption.setAttribute("visible", controlGroup.getString("SIGOPTION.VISIBLE"));
    sigoption.setAttribute("alsogrants", controlGroup.getString("SIGOPTION.ALSOGRANTS"));
    sigoption.setAttribute("alsorevokes", controlGroup.getString("SIGOPTION.ALSOREVOKES"));
    sigoption.setAttribute("prerequisite", controlGroup.getString("SIGOPTION.PREREQUISITE"));
    sigoption.setAttribute("langcode", controlGroup.getString("SIGOPTION.LANGCODE"));

    if (!controlGroup.isNull("SIGOPTION.SIGOPTFLAG.OPTIONNAME")) {
        var sigoptFlag = new Element("sigoptflag");
        sigoptFlag.setAttribute("optionname", controlGroup.getString("SIGOPTION.SIGOPTFLAG.OPTIONNAME"));
        sigoptFlag.setAttribute("app", controlGroup.getString("SIGOPTION.SIGOPTFLAG.APP"));
        sigoptFlag.setAttribute("flagname", controlGroup.getString("SIGOPTION.SIGOPTFLAG.FLAGNAME"));
        sigoptFlag.setAttribute("value", controlGroup.getString("SIGOPTION.SIGOPTFLAG.VALUE"));

        sigoption.addContent(sigoptFlag);
    }
    ctrlgroup.addContent(sigoption);

    var group = new Element("group");
    group.setAttribute("groupname", controlGroup.getString("MAXGROUP.GROUPNAME"));
    group.setAttribute("description", controlGroup.getString("MAXGROUP.DESCRIPTION"));
    group.setAttribute("passwordduration", controlGroup.getString("MAXGROUP.PASSWORDDURATION"));
    group.setAttribute("passwordwarning", controlGroup.getString("MAXGROUP.PASSWORDWARNING"));
    group.setAttribute("independent", controlGroup.getString("MAXGROUP.INDEPENDENT"));
    group.setAttribute("authallsites", controlGroup.getString("MAXGROUP.AUTHALLSITES"));
    group.setAttribute("authallgls", controlGroup.getString("MAXGROUP.AUTHALLGLS"));
    group.setAttribute("authallstorerooms", controlGroup.getString("MAXGROUP.AUTHALLSTOREROOMS"));
    group.setAttribute("authlaborall", controlGroup.getString("MAXGROUP.AUTHLABORALL"));
    group.setAttribute("authlaborcrew", controlGroup.getString("MAXGROUP.AUTHLABORCREW"));
    group.setAttribute("authlaborself", controlGroup.getString("MAXGROUP.AUTHLABORSELF"));
    group.setAttribute("authlaborsuper", controlGroup.getString("MAXGROUP.AUTHLABORSUPER"));
    group.setAttribute("langcode", controlGroup.getString("MAXGROUP.LANGCODE"));
    group.setAttribute("sctemplateid", controlGroup.getString("MAXGROUP.SCTEMPLATEID"));
    group.setAttribute("authpersongroup", controlGroup.getString("MAXGROUP.AUTHPERSONGROUP"));
    group.setAttribute("nullrepfac", controlGroup.getString("MAXGROUP.NULLREPFAC"));
    group.setAttribute("authallrepfacs", controlGroup.getString("MAXGROUP.AUTHALLREPFACS"));
    group.setAttribute("maxschedreport", controlGroup.getString("MAXGROUP.MAXSCHEDREPORT"));
    group.setAttribute("dfltapp", controlGroup.getString("MAXGROUP.DFLTAPP"));
    group.setAttribute("adhoccreatelimit", controlGroup.getString("MAXGROUP.ADHOCCREATELIMIT"));
    group.setAttribute("reportstoplimit", controlGroup.getString("MAXGROUP.REPORTSTOPLIMIT"));
    group.setAttribute("sidenav", controlGroup.getString("MAXGROUP.SIDENAV"));
    group.setAttribute("workcenter", controlGroup.getString("MAXGROUP.WORKCENTER"));

    ctrlgroup.addContent(group);

    controlConditionSet = controlGroup.getMboSet("CTRLCONDITION");
    if (!controlConditionSet.isEmpty()) {
        controlCondition = controlConditionSet.moveFirst();

        while (controlCondition) {
            var ctrlcondition = new Element("ctrlcondition");
            ctrlcondition.setAttribute("conditionnum", controlCondition.getString("CONDITIONNUM"));
            ctrlcondition.setAttribute("conditionseq", controlCondition.getString("CONDITIONSEQ"));
            ctrlcondition.setAttribute("reevaluate", controlCondition.getString("REEVALUATE"));

            var condition = new Element("condition");
            condition.setAttribute("conditionnum", controlCondition.getString("CONDITIONNUM"));
            condition.setAttribute("type", controlCondition.getString("CONDITION.TYPE"));
            condition.setAttribute("expression", controlCondition.getString("CONDITION.EXPRESSION"));
            condition.setAttribute("classname", controlCondition.getString("CONDITION.CLASSNAME"));
            condition.setAttribute("description", controlCondition.getString("CONDITION.DESCRIPTION"));
            condition.setAttribute("nocaching", controlCondition.getString("CONDITION.NOCACHING"));

            ctrlcondition.addContent(condition);

            controlCondPropSet = controlCondition.getMboSet("CTRLCONDPROP");
            if (!controlCondPropSet.isEmpty()) {
                var controlCondProp = controlCondPropSet.moveFirst();

                while (controlCondProp) {
                    var ctrlcondprop = new Element("ctrlcondprop");
                    ctrlcondprop.setAttribute("property", controlCondProp.getString("PROPERTY"));
                    ctrlcondprop.setAttribute("propertyvalue", controlCondProp.getString("PROPERTYVALUE"));
                    ctrlcondprop.setAttribute("conditionresult", controlCondProp.getString("CONDITIONRESULT"));

                    ctrlcondition.addContent(ctrlcondprop);

                    controlCondProp = controlCondPropSet.moveNext();
                }
            }
            ctrlgroup.addContent(ctrlcondition);
            controlCondition = controlConditionSet.moveNext();
        }
    }

    return ctrlgroup;
}

function getRequestScreentName() {
    var httpRequest = request.getHttpServletRequest();

    var requestURI = httpRequest.getRequestURI();
    var contextPath = httpRequest.getContextPath();
    var resourceReq = requestURI;

    if (contextPath && contextPath !== "") {
        resourceReq = requestURI.substring(contextPath.length());
    }

    if (!resourceReq.startsWith("/")) {
        resourceReq = "/" + resourceReq;
    }

    var isOSLC = true;

    if (!resourceReq.toLowerCase().startsWith("/oslc/script/" + service.scriptName.toLowerCase())) {
        if (!resourceReq.toLowerCase().startsWith("/api/script/" + service.scriptName.toLowerCase())) {
            return null;
        } else {
            osOSLC = false;
        }
    }

    var baseReqPath = isOSLC ? "/oslc/script/" + service.scriptName : "/api/script/" + service.scriptName;

    var action = resourceReq.substring(baseReqPath.length);

    if (action.startsWith("/")) {
        action = action.substring(1);
    }

    if (!action || action.trim() === "") {
        return null;
    }

    return URLDecoder.decode(action.toLowerCase(), StandardCharsets.UTF_8.name());
}

// Cleans up the MboSet connections and closes the set.
function close(set) {
    if (set) {
        set.cleanup();
        set.close();
    }
}

function ScreenError(reason, message) {
    Error.call(this, message);
    this.reason = reason;
    this.message = message;
}

// ConfigurationError derives from Error
ScreenError.prototype = Object.create(Error.prototype);
ScreenError.prototype.constructor = ScreenError;
ScreenError.prototype.element;

// eslint-disable-next-line no-unused-vars
var scriptConfig = {
    autoscript: "SHARPTREE.AUTOSCRIPT.SCREENS",
    description: "Extract screen definitions.",
    version: "1.0.0",
    active: true,
    logLevel: "ERROR",
};
