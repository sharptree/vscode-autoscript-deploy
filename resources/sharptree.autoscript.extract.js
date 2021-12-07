// @ts-nocheck
RESTRequest = Java.type("com.ibm.tivoli.oslc.RESTRequest");

MboConstants = Java.type("psdi.mbo.MboConstants");
SqlFormat = Java.type("psdi.mbo.SqlFormat");
MXServer = Java.type("psdi.server.MXServer");

MXException = Java.type("psdi.util.MXException");
MXAccessException = Java.type("psdi.util.MXAccessException");
MXApplicationException = Java.type("psdi.util.MXApplicationException");
RuntimeException = Java.type("java.lang.RuntimeException");
System = Java.type("java.lang.System");

MXLoggerFactory = Java.type("psdi.util.logging.MXLoggerFactory");

var logger = MXLoggerFactory.getLogger("maximo.script." + service.getScriptName());

main();

function main() {
    if (typeof httpMethod !== 'undefined') {
        var response = {};
        try {
            if (httpMethod.toLowerCase() === 'get') {
                var scriptName = getRequestScriptName();
                if (typeof scriptName === 'undefined' || scriptName === null || !scriptName) {
                    throw new ScriptError("missing_script_name", "The script name was not provided.");
                }

                response.status = "success";
                response.script = extractScript(scriptName);
                response.scriptLanguage = getScriptLanguage(scriptName);
                responseBody = JSON.stringify(response);
                return;
            } else {
                throw new ScriptError("only_get_supported", "Only the HTTP GET method is supported when extracting automation scripts.");
            }

        } catch (error) {
            response.status = "error";

            if (error instanceof ScriptError) {
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

            if (typeof httpMethod !== 'undefined') {
                responseBody = JSON.stringify(response);
            }

            log_error(error);

            return;
        }
    }
}

function getScriptLanguage(scriptName) {
    var autoScriptSet;
    try {
        autoScriptSet = MXServer.getMXServer().getMboSet("AUTOSCRIPT", userInfo);
        var sqlf = new SqlFormat("autoscript = :1");
        sqlf.setObject(1, "AUTOSCRIPT", "AUTOSCRIPT", scriptName);

        autoScriptSet.setWhere(sqlf.format());

        if (!autoScriptSet.isEmpty()) {
            var autoScript = autoScriptSet.getMbo(0);

            return autoScript.getString("SCRIPTLANGAUGE");

        } else {
            throw new ScriptError("script_not_found", "The automation script " + scriptName + " was not found.");
        }

    } finally {
        close(autoScriptSet);
    }
}

function extractScript(scriptName) {
    var autoScriptSet;
    try {
        autoScriptSet = MXServer.getMXServer().getMboSet("AUTOSCRIPT", userInfo);
        var sqlf = new SqlFormat("autoscript = :1");
        sqlf.setObject(1, "AUTOSCRIPT", "AUTOSCRIPT", scriptName);

        autoScriptSet.setWhere(sqlf.format());

        if (!autoScriptSet.isEmpty()) {
            var autoScript = autoScriptSet.getMbo(0);

            return autoScript.getString("SOURCE") + "\n\nscriptConfig=" + extractScriptConfiguration(autoScript);

        } else {
            throw new ScriptError("script_not_found", "The automation script " + scriptName + " was not found.");
        }

    } finally {
        close(autoScriptSet);
    }
}

function extractScriptConfiguration(autoScript) {
    var scriptConfig = {};
    scriptConfig.autoscript = autoScript.getString("AUTOSCRIPT");
    scriptConfig.description = autoScript.getString("DESCRIPTION");
    scriptConfig.version = autoScript.getString("VERSION");
    scriptConfig.active = autoScript.getString("ACTIVE");
    scriptConfig.logLevel = autoScript.getString("LOGLEVEL");

    var autoScriptVarsSet = autoScript.getMboSet("AUTOSCRIPTVARS");

    if (!autoScriptVarsSet.isEmpty()) {
        var scriptVars = [];
        var autoScriptVar = autoScriptVarsSet.moveFirst();
        while (autoScriptVar) {
            var scriptVar = {};
            scriptVar.varname = autoScriptVar.getString("VARNAME");
            if (!autoScriptVar.isNull("DESCRIPTION")) {
                scriptVar.description = autoScriptVar.getString("DESCRIPTION");
            }
            if (!autoScriptVar.isNull("VARBINDINGTYPE")) {
                scriptVar.varBindingType = autoScriptVar.getString("VARBINDINGTYPE");
            }
            if (!autoScriptVar.isNull("VARTYPE")) {
                scriptVar.varType = autoScriptVar.getString("VARTYPE");
            }
            if (!autoScriptVar.isNull("ALLOWOVERRIDE")) {
                scriptVar.allowOverride = autoScriptVar.getBoolean("ALLOWOVERRIDE");
            }
            if (!autoScriptVar.isNull("NOVALIDATION")) {
                scriptVar.noValidation = autoScriptVar.getBoolean("NOVALIDATION");
            }
            if (!autoScriptVar.isNull("NOACCESSCHECK")) {
                scriptVar.noAccessCheck = autoScriptVar.getBoolean("NOACCESSCHECK");
            }
            if (!autoScriptVar.isNull("NOACTION")) {
                scriptVar.noAction = autoScriptVar.getBoolean("NOACTION");
            }
            if (!autoScriptVar.isNull("LITERALDATATYPE")) {
                scriptVar.literalDataType = autoScriptVar.getString("LITERALDATATYPE");
            }
            if (!autoScriptVar.isNull("VARBINDINGVALUE")) {
                scriptVar.varBindingValue = autoScriptVar.getString("VARBINDINGVALUE");
            }

            scriptVars.push(scriptVar);

            autoScriptVar = autoScriptVarsSet.moveNext();
        }

        if (scriptVars.length > 0) {
            scriptConfig.autoScriptVars = scriptVars;
        }

    }

    var scriptLaunchPointSet = autoScript.getMboSet("SCRIPTLAUNCHPOINT");

    if (!scriptLaunchPointSet.isEmpty()) {
        var launchPoints = [];
        var scriptLaunchPoint = scriptLaunchPointSet.moveFirst();

        while (scriptLaunchPoint) {
            var launchPoint = {};
            launchPoint.launchPointName = scriptLaunchPoint.getString("LAUNCHPOINTNAME");
            launchPoint.launchPointType = scriptLaunchPoint.getString("LAUNCHPOINTTYPE");
            launchPoint.active = scriptLaunchPoint.getBoolean("ACTIVE");

            if (!scriptLaunchPoint.isNull("DESCRIPTION")) {
                launchPoint.description = scriptLaunchPoint.getString("DESCRIPTION");
            }

            if (launchPoint.launchPointType.toUpperCase() === 'OBJECT') {
                launchPoint.objectName = scriptLaunchPoint.getString("OBJECTNAME");

                if (!scriptLaunchPoint.isNull("CONDITION")) {
                    launchPoint.condition = scriptLaunchPoint.getString("CONDITION")
                }


                switch (scriptLaunchPoint.getInt("EVENTTYPE")) {
                    case 0:
                        launchPoint.initializeValue = true;
                        break;
                    case 1:
                        launchPoint.validateApplication = true;
                        break;
                    case 2:
                        launchPoint.allowObjectCreation = true;
                        break;
                    case 3:
                        launchPoint.allowObjectDeletion = true;
                        break;
                    case 4:
                        launchPoint.save = true;
                        launchPoint.add = scriptLaunchPoint.getBoolean("ADD");
                        launchPoint.update = scriptLaunchPoint.getBoolean("UPDATE");
                        launchPoint.delete = scriptLaunchPoint.getBoolean("DELETE");

                        if (!scriptLaunchPoint.isNull("EVCONTEXT")) {
                            switch (scriptLaunchPoint.getInt("EVCONTEXT")) {
                                case 0:
                                    launchPoint.beforeSave = true;
                                    break;
                                case 1:
                                    launchPoint.afterSave = true;
                                    break;
                                case 2:
                                    launchPoint.afterCommit = true;
                                    break;
                            }
                        }
                        break;
                }
            } else if (launchPoint.launchPointType.toUpperCase() === 'ATTRIBUTE') {

                launchPoint.objectName = scriptLaunchPoint.getString("OBJECTNAME");
                launchPoint.attributeName = scriptLaunchPoint.getString("ATTRIBUTENAME");

                switch (scriptLaunchPoint.getInt("ATTRIBUTEEVENT")) {
                    case 0:
                        launchPoint.initializeAccessRestriction = true;
                        break;
                    case 1:
                        launchPoint.initializeValue = true;
                        break;
                    case 2:
                        launchPoint.validate = true;
                        break;
                    case 3:
                        launchPoint.retrieveList = true;
                        break;
                    case 4:
                        launchPoint.runAction = true;
                        break;
                }
            } else if (launchPoint.launchPointType.toUpperCase() === 'ACTION') {
                if (!scriptLaunchPoint.isNull("ACTIONNAME")) {
                    launchPoint.actionName = scriptLaunchPoint.getString("ACTIONNAME");
                }
                if (!scriptLaunchPoint.isNull("OBJECTNAME")) {
                    launchPoint.objectName = scriptLaunchPoint.getString("OBJECTNAME");
                }
            } else if (launchPoint.launchPointType.toUpperCase() === 'CUSTOMCONDITION') {
                if (!scriptLaunchPoint.isNull("OBJECTNAME")) {
                    launchPoint.objectName = scriptLaunchPoint.getString("OBJECTNAME");
                }
            }


            var launchPointVarsSet = scriptLaunchPoint.getMboSet("LAUNCHPOINTVARS");

            if (!launchPointVarsSet.isEmpty()) {
                pointVars = [];
                var launchPointVars = launchPointVarsSet.moveFirst();

                while (launchPointVars) {
                    var pointVar = {};

                    if (!launchPointVars.isNull("VARNAME")) {
                        pointVar.varName = launchPointVars.getString("VARNAME");
                    }

                    if (!launchPointVars.isNull("VARBINDINGVALUE")) {
                        pointVar.varBindingValue = launchPointVars.getString("VARBINDINGVALUE");
                    }
                    pointVars.push(pointVar);

                    launchPointVars = launchPointVarsSet.moveNext();
                }

                if (pointVars.length > 0) {
                    launchPoint.launchPointVars = pointVars;
                }
            }
            launchPoints.push(launchPoint);

            scriptLaunchPoint = scriptLaunchPointSet.moveNext();
        }

        if (launchPoints.length > 0) {
            scriptConfig.scriptLaunchPoints = launchPoints;
        }
    }

    return JSON.stringify(scriptConfig, null, 4);
}


function getRequestScriptName() {

    var field = RESTRequest.class.getDeclaredField("request");
    field.setAccessible(true);
    var httpRequest = field.get(request);

    var requestURI = httpRequest.getRequestURI();
    var contextPath = httpRequest.getContextPath();
    var resourceReq = requestURI;

    if (contextPath && contextPath !== '') {
        resourceReq = requestURI.substring(contextPath.length());
    }

    if (!resourceReq.startsWith("/")) {
        resourceReq = "/" + resourceReq;
    }

    if (!resourceReq.toLowerCase().startsWith('/oslc/script/' + service.scriptName.toLowerCase())) {
        return null;
    }

    var baseReqPath = '/oslc/script/' + service.scriptName;

    var action = resourceReq.substring(baseReqPath.length);

    if (action.startsWith("/")) {
        action = action.substring(1);
    }

    if (!action || action.trim() === '') {
        return null;
    }

    return action.toLowerCase();
}


// Logging functions provided for compatibility with older versions where service.log_xxxx is not available.
function log_debug(msg) {
    logger.debug(msg);
}

function log_info(msg) {
    logger.info(msg);
}

function log_warn(msg) {
    logger.warn(msg);
}

function log_error(msg) {
    logger.error(msg);
}

// Cleans up the MboSet connections and closes the set.
function close(set) {
    if (set) {
        set.cleanup();
        set.close();
    }
}

function ScriptError(reason, message) {
    Error.call(this, message);
    this.reason = reason;
    this.message = message;
}

// ConfigurationError derives from Error
ScriptError.prototype = Object.create(Error.prototype);
ScriptError.prototype.constructor = ScriptError;
ScriptError.prototype.element;