/* eslint-disable no-redeclare */
/* eslint-disable indent */
/* eslint-disable quotes */
/* eslint-disable no-undef */
// @ts-nocheck
load("nashorn:parser.js");

RESTRequest = Java.type("com.ibm.tivoli.oslc.RESTRequest");

MboConstants = Java.type("psdi.mbo.MboConstants");
SqlFormat = Java.type("psdi.mbo.SqlFormat");
MXServer = Java.type("psdi.server.MXServer");

MXAccessException = Java.type("psdi.util.MXAccessException");
MXApplicationException = Java.type("psdi.util.MXApplicationException");
MXException = Java.type("psdi.util.MXException");
Version = Java.type("psdi.util.Version");

ScriptBinding = Java.type("com.ibm.tivoli.maximo.script.ScriptBinding");

ScriptContext = Java.type("javax.script.ScriptContext");
ScriptEngineManager = Java.type("javax.script.ScriptEngineManager");
SimpleScriptContext = Java.type("javax.script.SimpleScriptContext");
ScriptException = Java.type("javax.script.ScriptException");

Integer = Java.type("java.lang.Integer");
RuntimeException = Java.type("java.lang.RuntimeException");
System = Java.type("java.lang.System");

HashMap = Java.type("java.util.HashMap");

NoSuchMethodException = Java.type("java.lang.NoSuchMethodException");


// Global input variables
scriptSource = "";

MXLoggerFactory = Java.type("psdi.util.logging.MXLoggerFactory");

var logger = MXLoggerFactory.getLogger("maximo.script." + service.getScriptName());

if (typeof httpMethod !== 'undefined') {
    main();
}

function main() {

    var response = {};
    try {
        checkPermissions("SHARPTREE_UTILS", "DEPLOYSCRIPT");

        var action;

        if (typeof requestBody !== 'undefined') {

            action = getRequestAction();

            if (httpMethod != "POST") {
                throw new ScriptError("only_post_supported", "Only the HTTP POST method is supported when deploying automation scripts.");
            }
            scriptSource = requestBody;
            if (!scriptSource) {
                throw new ScriptError("no_script_source", "A script source must be the request body.");
            }

            if (action && action.startsWith("source") && action.split("/").length == 2) {
                scriptSource = requestBody;
                if (!scriptSource) {
                    throw new ScriptError("no_script_source", "A script source must be the request body.");
                }

                var scriptConfig = getConfigFromScript(scriptSource, action.split("/")[1]);

                var sqlf = new SqlFormat("autoscript = :1");
                sqlf.setObject(1, "AUTOSCRIPT", "AUTOSCRIPT", scriptConfig.autoscript);
                var autoScriptSet;
                try {
                    autoScriptSet = MXServer.getMXServer().getMboSet("AUTOSCRIPT", userInfo);
                    autoScriptSet.setWhere(sqlf.format());
                    if (!autoScriptSet.isEmpty()) {
                        response = {};
                        response.source = autoScriptSet.getMbo(0).getString("SOURCE");
                        responseBody = JSON.stringify(response);
                        return;
                    } else {
                        response = {};
                        response.source = "";
                        responseBody = JSON.stringify(response);
                        return;
                    }
                } finally {
                    close(autoScriptSet);
                }
            }
        } else if (httpMethod === 'GET') {
            action = getRequestAction();
            if (action) {
                if (action.startsWith('version')) {
                    var response = { "version": getScriptVersion('SHARPTREE.AUTOSCRIPT.DEPLOY') };
                    responseBody = JSON.stringify(response);
                    return;
                }
            }
        }

        // if the script source is available then call the deploy script.  
        // This allows the deployScript function to be called from the context directly if the script it loaded from another script.
        if (scriptSource) {
            deployScript(scriptSource, action);
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

        service.log_error(error);

        return;
    }

    response.status = "success";
    if (requestBody) {
        responseBody = JSON.stringify(response);
    }
    return;
}

function deployScript(scriptSource, language) {
    var scriptConfig = getConfigFromScript(scriptSource, language);

    if (scriptConfig) {
        validateScriptConfig(scriptConfig);
        var autoScriptSet;

        try {
            autoScriptSet = MXServer.getMXServer().getMboSet("AUTOSCRIPT", userInfo);
            var sqlf = new SqlFormat("autoscript = :1");
            sqlf.setObject(1, "AUTOSCRIPT", "AUTOSCRIPT", scriptConfig.autoscript);

            autoScriptSet.setWhere(sqlf.format());

            var autoscript;

            if (autoScriptSet.isEmpty()) {
                autoscript = autoScriptSet.add();
                autoscript.setValue("AUTOSCRIPT", scriptConfig.autoscript);
                autoscript.setValue("SCRIPTLANGUAGE", language ? language : "nashorn");
                autoscript.setValue("ACTIVE", true);
            } else {
                autoscript = autoScriptSet.getMbo(0);
            }
            autoscript.setValue("SOURCE", scriptSource);

            var autoScriptId = autoscript.getUniqueIDValue();

            // Delete all the launch points to ensure they are recreated correctly.
            // Deleting the launch variables first so the script variables can be deleted without reference errors.
            scriptLaunchPointSet = autoscript.getMboSet("SCRIPTLAUNCHPOINT");
            scriptLaunchPointSet.deleteAll();

            autoScriptSet.save();

            //Refetch the auto script
            autoScriptSet.reset();
            autoscript = autoScriptSet.getMboForUniqueId(autoScriptId);

            // Delete the script variables to ensure they are recreated correctly.
            autoScriptVarsSet = autoscript.getMboSet("AUTOSCRIPTVARS");
            autoScriptVarsSet.deleteAll();

            autoScriptSet.save();

            //Refetch the auto script
            autoScriptSet.reset();
            autoscript = autoScriptSet.getMboForUniqueId(autoScriptId);

            scriptLaunchPointSet = autoscript.getMboSet("SCRIPTLAUNCHPOINT");
            autoScriptVarsSet = autoscript.getMboSet("AUTOSCRIPTVARS");

            if (scriptConfig.description) {
                autoscript.setValue("DESCRIPTION", scriptConfig.description);
            }

            setValueIfAvailable(autoscript, "DESCRIPTION", scriptConfig.description);
            setValueIfAvailable(autoscript, "VERSION", scriptConfig.version);
            setValueIfAvailable(autoscript, "ACTIVE", scriptConfig.active);
            setValueIfAvailable(autoscript, "LOGLEVEL", scriptConfig.logLevel);

            if (typeof scriptConfig.autoScriptVars !== 'undefined') {
                scriptConfig.autoScriptVars.forEach(function (element) {
                    if (typeof element.varname !== 'undefined') {
                        var autoScriptVar = autoScriptVarsSet.add();
                        autoScriptVar.setValue("VARNAME", element.varname);
                        setValueIfAvailable(autoScriptVar, "DESCRIPTION", element.description);
                        setValueIfAvailable(autoScriptVar, "VARBINDINGTYPE", element.varBindingType);
                        setValueIfAvailable(autoScriptVar, "VARTYPE", element.varType);
                        setValueIfAvailable(autoScriptVar, "ALLOWOVERRIDE", element.allowOverride);
                        setValueIfAvailable(autoScriptVar, "NOVALIDATION", element.noValidation);
                        setValueIfAvailable(autoScriptVar, "NOACCESSCHECK", element.noAccessCheck);
                        setValueIfAvailable(autoScriptVar, "NOACTION", element.noAction);
                        setValueIfAvailable(autoScriptVar, "LITERALDATATYPE", element.literalDataType);
                        setValueIfAvailable(autoScriptVar, "VARBINDINGVALUE", element.varBindingValue);
                    }
                });
            }

            if (scriptConfig.scriptLaunchPoints) {
                scriptConfig.scriptLaunchPoints.forEach(function (element) {
                    if (typeof element.launchPointName !== 'undefined' && typeof element.launchPointType !== 'undefined') {
                        var scriptLaunchPoint = scriptLaunchPointSet.add();
                        scriptLaunchPoint.setValue('LAUNCHPOINTNAME', element.launchPointName);
                        scriptLaunchPoint.setValue('LAUNCHPOINTTYPE', element.launchPointType, MboConstants.NOACCESSCHECK);

                        if (typeof element.active !== 'undefined') {
                            scriptLaunchPoint.setValue('ACTIVE', element.active);
                        } else {
                            scriptLaunchPoint.setValue('ACTIVE', true);
                        }

                        setValueIfAvailable(scriptLaunchPoint, "DESCRIPTION", element.description);

                        if (element.launchPointType.toUpperCase() === 'OBJECT') {
                            if (typeof element.objectName === 'undefined') {
                                throw new ScriptError("missing_attribute", "The objectName is a required attribute when defining an Object launch point.");
                            }

                            scriptLaunchPoint.setValue("OBJECTNAME", element.objectName);

                            setValueIfAvailable(scriptLaunchPoint, "CONDITION", element.condition);

                            if (typeof element.initializeValue !== 'undefined' && element.initializeValue) {
                                scriptLaunchPoint.setValue("EVENTTYPE", "0");
                            } else if (typeof element.validateApplication !== 'undefined' && element.validateApplication) {
                                scriptLaunchPoint.setValue("EVENTTYPE", "1");
                            } else if (typeof element.allowObjectCreation !== 'undefined' && element.allowObjectCreation) {
                                scriptLaunchPoint.setValue("EVENTTYPE", "2");
                            } else if (typeof element.allowObjectDeletion !== 'undefined' && element.allowObjectDeletion) {
                                scriptLaunchPoint.setValue("EVENTTYPE", "3");
                            } else if (typeof element.save !== 'undefined' && element.save) {
                                scriptLaunchPoint.setValue("EVENTTYPE", "4");
                                var saveActionAdded = false;
                                if (typeof element.add !== 'undefined' && element.add) {
                                    scriptLaunchPoint.setValue("ADD", true);
                                    saveActionAdded = true;
                                }
                                if (typeof element.update !== 'undefined' && element.update) {
                                    scriptLaunchPoint.setValue("UPDATE", true);
                                    saveActionAdded = true;
                                }
                                if (typeof element.delete !== 'undefined' && element.delete) {
                                    scriptLaunchPoint.setValue("DELETE", true);
                                    saveActionAdded = true;
                                }

                                if (!saveActionAdded) {
                                    throw new ScriptError("missing_save_action", "At least one object save action of either add, update, or delete must be provided.");
                                }

                                var saveWhenAdded = false;
                                if (typeof element.beforeSave !== 'undefined' && element.beforeSave) {
                                    scriptLaunchPoint.setValue("EVCONTEXT", "0");
                                    saveWhenAdded = true;
                                } else if (typeof element.afterSave !== 'undefined' && element.afterSave) {
                                    scriptLaunchPoint.setValue("EVCONTEXT", "1");
                                    saveWhenAdded = true;
                                } else if (typeof element.afterCommit !== 'undefined' && element.afterCommit) {
                                    scriptLaunchPoint.setValue("EVCONTEXT", "2");
                                    saveWhenAdded = true;
                                }

                                if (!saveWhenAdded) {
                                    throw new ScriptError("missing_action_type", "A save action type of beforeSave, afterSave, or afterCommit must be provided.");
                                }

                            } else {
                                throw new ScriptError("missing_attribute", "One of the following attributes is required when defining an Object launch point: initializeValue, validateApplication, allowObjectCreation, allowObjectDeletion, or save.");
                            }

                        } else if (element.launchPointType.toUpperCase() === 'ATTRIBUTE') {
                            if (element.objectName === 'undefined') {
                                throw new ScriptError("missing_attribute", "The objectName is a required attribute when defining an Attribute launch point.");
                            }
                            if (element.attributeName === 'undefined') {
                                throw new ScriptError("missing_attribute", "The attributeName is a required attribute when defining an Attribute launch point.");
                            }
                            scriptLaunchPoint.setValue("OBJECTNAME", element.objectName);
                            scriptLaunchPoint.setValue("ATTRIBUTENAME", element.attributeName);

                            if (typeof element.initializeAccessRestriction !== 'undefined' && element.initializeAccessRestriction) {
                                scriptLaunchPoint.setValue("ATTRIBUTEEVENT", "0");
                            } else if (typeof element.initializeValue !== 'undefined' && element.initializeValue) {
                                scriptLaunchPoint.setValue("ATTRIBUTEEVENT", "1");
                            } else if (typeof element.validate !== 'undefined' && element.validate) {
                                scriptLaunchPoint.setValue("ATTRIBUTEEVENT", "2");
                            } else if (typeof element.retrieveList !== 'undefined' && element.retrieveList) {
                                scriptLaunchPoint.setValue("ATTRIBUTEEVENT", "3");
                            } else if (typeof element.runAction !== 'undefined' && element.runAction) {
                                scriptLaunchPoint.setValue("ATTRIBUTEEVENT", "4");
                            } else {
                                throw new ScriptError("missing_attribute", "One of the following attributes is required when defining an Attribute launch point: initializeAccessRestriction, initializeValue, validate, retrieveList or runAction.");
                            }
                        } else if (element.launchPointType.toUpperCase() === 'ACTION') {
                            if (typeof element.actionName === 'undefined') {
                                throw new ScriptError("missing_attribute", "The actionName is required when defining an Action launch point");
                            }
                            scriptLaunchPoint.setValue("ACTIONNAME", element.actionName);
                            setValueIfAvailable(scriptLaunchPoint, "OBJECTNAME", element.objectName);

                        } else if (element.launchPointType.toUpperCase() === 'CUSTOMCONDITION') {
                            setValueIfAvailable(scriptLaunchPoint, "OBJECTNAME", element.objectName);
                        } else {
                            throw new ScriptError("unknown_launchpoint_type", "The launch point type " + element.launchPointType + " is not supported.");
                        }

                        if (typeof element.launchPointVars !== 'undefined') {

                            var launchPointVarsSet = scriptLaunchPoint.getMboSet("LAUNCHPOINTVARS");

                            if (launchPointVarsSet.isEmpty()) {
                                throw new ScriptError("no_variable_defined", "A launch point variable has been defined, but there are no script variables defined.");
                            }

                            element.launchPointVars.forEach(function (elementChild) {

                                if (typeof elementChild.varName === 'undefined' || typeof elementChild.varBindingValue === 'undefined') {
                                    throw new ScriptError("missing_attribute", "A varName and varBindingValue are required when defining a launch point variable.");
                                }

                                var launchPointVars = launchPointVarsSet.moveFirst();
                                var found = false;
                                while (launchPointVars && !found) {
                                    if (launchPointVars.getString("VARNAME").equalsIgnoreCase(elementChild.varName)) {
                                        launchPointVars.setValue("VARBINDINGVALUE", elementChild.varBindingValue);
                                        found = true;
                                    }

                                    launchPointVars = launchPointVarsSet.moveNext();
                                }

                                if (!found) {
                                    throw new ScriptError("no_variable_defined", "The launch point variable " + elementChild.varName + " has been defined, but there is no corresponding script variable.");
                                }
                            });
                        }
                    } else {
                        throw new ScriptError("missing_attribute", "The launchPointName and launchPointType are required attributes when defining a script launch point.");
                    }
                });
            }

            autoScriptSet.save();

            try {
                // save the configuration details.               
                service.invokeScript("SHARPTREE.AUTOSCRIPT.STORE").createOrUpdateScript(scriptConfig.autoscript.toUpperCase(), scriptSource, userInfo.getUserName());
            } catch (error) {
                log_error("Error saving script configuration history." + JSON.stringify(error));
            }

            var ctx = new HashMap();
            if (scriptConfig.onDeploy) {

                var manager = new ScriptEngineManager();
                var engine = manager.getEngineByName(language ? language : "nashorn");

                var bindings = engine.createBindings();

                if (!bindings.put) {
                    var ctx = new HashMap();
                    ctx.put("service", service);
                    ctx.put("onDeploy", true);
                    bindings = new ScriptBinding(ctx);
                } else {
                    bindings.put("service", service);
                    bindings.put("onDeploy", true);
                }

                engine.getContext().setBindings(bindings, ScriptContext.GLOBAL_SCOPE);

                engine.eval(scriptSource);

                try {
                    engine.invokeFunction(scriptConfig.onDeploy);
                } catch (error) {
                    if (error instanceof NoSuchMethodException) {
                        throw new ScriptError("ondeploy_function_notfound", "The onDeploy function \"" + scriptConfig.onDeploy + "\" was not found.");
                    } else if (error instanceof ScriptException) {
                        throw new ScriptError("error_ondeploy", "Error calling onDeploy function \"" + scriptConfig.onDeploy + "\" :" + error.message);
                    }
                    System.out.println(error);
                }
            }

        } finally {
            close(autoScriptSet);
        }
    } else {
        throw new ScriptError("config_not_found", "Configuration variable scriptConfig was not found in the script.");
    }
}

function setValueIfAvailable(mbo, attribute, value) {
    if (typeof value !== 'undefined') {
        mbo.setValue(attribute, value);
    }
}


function checkPermissions(app, optionName) {
    if (!userInfo) {
        throw new ScriptError("no_user_info", "The userInfo global variable has not been set, therefore the user permissions cannot be verified.");
    }

    if (!MXServer.getMXServer().lookup("SECURITY").getProfile(userInfo).hasAppOption(app, optionName) && !isInAdminGroup()) {
        throw new ScriptError("no_permission", "The user " + userInfo.getUserName() + " does not have access to the " + optionName + " option in the " + app + "  object structure.");
    }
}

// Determines if the current user is in the administrator group, returns true if the user is, false otherwise.
function isInAdminGroup() {
    var user = userInfo.getUserName();
    service.log_info("Determining if the user " + user + " is in the administrator group.");
    var groupUserSet;

    try {
        groupUserSet = MXServer.getMXServer().getMboSet("GROUPUSER", MXServer.getMXServer().getSystemUserInfo());

        // Get the ADMINGROUP MAXVAR value.
        var adminGroup = MXServer.getMXServer().lookup("MAXVARS").getString("ADMINGROUP", null);

        // Query for the current user and the found admin group.  
        // The current user is determined by the implicity `user` variable.
        sqlFormat = new SqlFormat("userid = :1 and groupname = :2");
        sqlFormat.setObject(1, "GROUPUSER", "USERID", user);
        sqlFormat.setObject(2, "GROUPUSER", "GROUPNAME", adminGroup);
        groupUserSet.setWhere(sqlFormat.format());

        if (!groupUserSet.isEmpty()) {
            service.log_info("The user " + user + " is in the administrator group " + adminGroup + ".");
            return true;
        } else {
            service.log_info("The user " + user + " is not in the administrator group " + adminGroup + ".");
            return false;
        }

    } finally {
        close(groupUserSet);
    }
}

function getConfigFromScript(scriptSource, language) {
    if (scriptSource) {
        if (language === 'python' || language === 'jython') {
            var regex = / *scriptConfig.*"""((.|\n|\r)*)"""/gm;
            var found = scriptSource.match(regex);
            if (found.length == 1) {
                var config = found[0];
                config = config.trim().substring(config.indexOf("{"), config.length - 3);
                return JSON.parse(config);
            } else {
                throw new ScriptError("config_not_found", "Configuration variable scriptConfig was not found in the script.");
            }
        } else {
            var ast;
            try {
                ast = parse(scriptSource);
            } catch (error) {
                log_error(JSON.stringify(error));
                throw new ScriptError("parsing_error", "Error parsing script, please see log for details.");
            }
            if (ast.type === "Program" && ast.body) {
                var result;
                ast.body.forEach(function (element) {
                    if (element.type === "VariableDeclaration") {
                        if (element.declarations) {
                            element.declarations.forEach(function (declaration) {
                                if (declaration.id && declaration.id.type === "Identifier" && declaration.id.name === "scriptConfig") {
                                    result = astToJavaScript(declaration.init);
                                }
                            });
                        }
                    }
                });

                if (result) {
                    return result;
                } else {
                    throw new ScriptError("config_not_found", "Configuration variable scriptConfig was not found in the script.");
                }
            } else {
                throw new ScriptError("script_wrong_type", "The script must be of type Program and have a body to be deployed.");
            }
        }
    } else {
        throw new ScriptError("no_script_source", "The script source is required to deploy the script.");
    }
}

function validateScriptConfig(scriptConfig) {
    if (!scriptConfig.autoscript || scriptConfig.autoscript.trim().length === 0) {
        throw new ScriptError("script_name_required", "The auto script name (autoscript) is required in the script configuration.");
    }
}

function astToJavaScript(ast) {
    var javaScript = {};

    if (ast.type === "ObjectExpression" && ast.properties) {
        ast.properties.map(function (property) {
            if (property.value.type == "Literal") {
                javaScript[property.key.value] = property.value.value;
            } else if (property.value.type == "ArrayExpression") {
                var child = [];
                property.value.elements.map(function (element) {
                    child.push(astToJavaScript(element));
                });
                javaScript[property.key.value] = child;
            }
        });
    } else if (ast.type === "Literal" && ast.value) {
        javaScript = JSON.parse(ast.value);
    }

    return javaScript;
}

function getRequestAction() {

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

    var isOSLC = true;

    if (!resourceReq.toLowerCase().startsWith('/oslc/script/' + service.scriptName.toLowerCase())) {
        if (!resourceReq.toLowerCase().startsWith('/api/script/' + service.scriptName.toLowerCase())) {
            return null;
        } else {
            osOSLC = false;
        }
    }

    var baseReqPath = isOSLC ? '/oslc/script/' + service.scriptName : '/api/script/' + service.scriptName;

    var action = resourceReq.substring(baseReqPath.length);

    if (action.startsWith("/")) {
        action = action.substring(1);
    }

    if (!action || action.trim() === '') {
        return null;
    }

    return action.toLowerCase();
}

function getScriptVersion(scriptName) {
    var mboset;
    try {
        mboset = MXServer.getMXServer().getMboSet("AUTOSCRIPT", userInfo);
        var sqlf = new SqlFormat("autoscript = :1");
        sqlf.setObject(1, "AUTOSCRIPT", "AUTOSCRIPT", scriptName);
        mboset.setWhere(sqlf.format());
        if (mboset.isEmpty()) {
            return 'unknown';
        } else {
            return mboset.getMbo(0).getString("VERSION");
        }
    } finally {
        close(mboset);
    }
}

// Logging functions provided for compatibility with older versions where service.log_xxxx is not available.
// eslint-disable-next-line no-unused-vars
function log_debug(msg) {
    logger.debug(msg);
}

// eslint-disable-next-line no-unused-vars
function log_info(msg) {
    logger.info(msg);
}

// eslint-disable-next-line no-unused-vars
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