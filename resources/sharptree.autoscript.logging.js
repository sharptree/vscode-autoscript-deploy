// @ts-nocheck
RESTRequest = Java.type("com.ibm.tivoli.oslc.RESTRequest");

Thread = Java.type("java.lang.Thread");

Date = Java.type("java.util.Date");

Logger = Java.type("org.apache.log4j.Logger");
LogManager = Java.type("org.apache.log4j.LogManager");
WriterAppender = Java.type("org.apache.log4j.WriterAppender");

SqlFormat = Java.type("psdi.mbo.SqlFormat");
MXServer = Java.type("psdi.server.MXServer");

var APPENDER_NAME = "logstream";
var PARENT_APPENDER = "Console";

var SECURITY_APP = "LOGGING";
var SECURITY_OPTION = "LOGSTREAM";

main();

function main() {
    // the script only works from a web request.
    if (typeof request !== 'undefined' || !request) {
        if (request.getQueryParam("initialize")) {
            initSecurity();
            result = { "status": "sucess" };
            responseBody = JSON.stringify(result);
            return;
        } else {
            var root = LogManager.getLogger("maximo");
            if (root) {
                var console = root.getAppender(PARENT_APPENDER);

                if (console) {
                    if (hasAppOption(SECURITY_APP, SECURITY_OPTION) || isAdmin()) {

                        var response = request.getHttpServletResponse();
                        response.setBufferSize(0);
                        response.setContentType("text/event-stream");
                        response.flushBuffer();

                        var output = response.getOutputStream();
                        var writer = new WriterAppender(console.getLayout(), output);
                        writer.setName(APPENDER_NAME);
                        try {
                            root.addAppender(writer);
                            var i = 0;
                            while (i < 300) {
                                Thread.sleep(100);
                                output.flush();
                                response.flushBuffer();
                                i++;
                            }
                        } finally {
                            if (root) {
                                root.removeAppender(APPENDER_NAME);
                            }
                            output.flush();
                            response.flushBuffer();
                            output.close();

                        }
                    } else {
                        var result = { "status": "error", "message": "The user " + userInfo.getUserName() + " does not have permission to stream the Maximo log. The security option " + SECURITY_OPTION + " on the " + SECURITY_APP + " application is required." };
                        responseBody = JSON.stringify(result);
                    }
                } else {
                    var result = { "status": "error", "message": "The standard Console log appender is not configured for the root maximo logger." };
                    responseBody = JSON.stringify(result);
                }
            } else {
                var result = { "status": "error", "message": "Cannot get the root maximo logger." };
                responseBody = JSON.stringify(result);
            }
        }
    }
}

function initSecurity() {
    var sigOptionSet;
    var appAuthSet;
    try {
        sigOptionSet = MXServer.getMXServer().getMboSet("SIGOPTION", MXServer.getMXServer().getSystemUserInfo());

        var sqlFormat = new SqlFormat("app = :1 and optionname = :2");
        sqlFormat.setObject(1, "SIGOPTION", "APP", SECURITY_APP);
        sqlFormat.setObject(2, "SIGOPTION", "OPTIONNAME", SECURITY_OPTION);
        sigOptionSet.setWhere(sqlFormat.format());

        if (sigOptionSet.isEmpty()) {
            sigoption = sigOptionSet.add();
            sigoption.setValue("APP", SECURITY_APP);
            sigoption.setValue("OPTIONNAME", SECURITY_OPTION);
            sigoption.setValue("DESCRIPTION", "Allow streaming the log with an automation script.");
            // sigoption.setValue("LANGCODE", "EN");
            sigoption.setValue("ESIGENABLED", false)
            sigOptionSet.save();

            var adminGroup = MXServer.getMXServer().lookup("MAXVARS").getString("ADMINGROUP", null);

            appAuthSet = MXServer.getMXServer().getMboSet("APPLICATIONAUTH", MXServer.getMXServer().getSystemUserInfo());
            appAuth = appAuthSet.add();
            appAuth.setValue("GROUPNAME", adminGroup);
            appAuth.setValue("APP", SECURITY_APP);
            appAuth.setValue("OPTIONNAME", SECURITY_OPTION);

            appAuthSet.save();

        }

    } finally {
        close(sigOptionSet);
        close(appAuthSet);
    }
}

function hasAppOption(app, optionName) {
    return MXServer.getMXServer().lookup("SECURITY")
        .getProfile(userInfo).hasAppOption(app, optionName);
}


function isAdmin() {
    var user = userInfo.getUserName();
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

        return !groupUserSet.isEmpty();

    } finally {
        close(groupUserSet);
    }
}

// Cleans up the MboSet connections and closes the set.
function close(set) {
    if (set) {
        set.cleanup();
        set.close();
    }
}

var scriptConfig = {
    "autoscript": "SHARPTREE.AUTOSCRIPT.LOGGING",
    "description": "Stream the log file.",
    "version": "1.0.0",
    "active": true,
    "logLevel": "ERROR"
};