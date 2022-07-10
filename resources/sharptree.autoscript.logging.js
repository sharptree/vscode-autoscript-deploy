/* eslint-disable no-redeclare */
/* eslint-disable indent */
/* eslint-disable quotes */
/* eslint-disable no-undef */
// @ts-nocheck

RESTRequest = Java.type("com.ibm.tivoli.oslc.RESTRequest");

Thread = Java.type("java.lang.Thread");

// eslint-disable-next-line no-global-assign
Date = Java.type("java.util.Date");

System = Java.type("java.lang.System");

// eslint-disable-next-line no-global-assign
File = Java.type("java.io.File");
RandomAccessFile = Java.type("java.io.RandomAccessFile");

BufferedReader = Java.type("java.io.BufferedReader");
OutputStreamWriter = Java.type("java.io.OutputStreamWriter");
InputStreamReader = Java.type("java.io.InputStreamReader");

Logger = Java.type("org.apache.log4j.Logger");
LogManager = Java.type("org.apache.log4j.LogManager");
WriterAppender = Java.type("org.apache.log4j.WriterAppender");

FixedLoggers = Java.type("psdi.util.logging.FixedLoggers");
SqlFormat = Java.type("psdi.mbo.SqlFormat");
MXServer = Java.type("psdi.server.MXServer");
Version = Java.type("psdi.util.Version");

var APPENDER_NAME = "logstream";
var PARENT_APPENDER = "Console";

var SECURITY_APP = "LOGGING";
var SECURITY_OPTION = "STREAMLOG";

// The maximum number of seconds that the request will remain open.
var MAX_TIMEOUT = 30;

var SLEEP_INTERVAL = 100;

main();

function main() {
    // the script only works from a web request.
    if (typeof request !== 'undefined' || !request) {
        if (request.getQueryParam("initialize")) {
            initSecurity();
            result = { "status": "success" };
            responseBody = JSON.stringify(result);
            return;
        } else {
            // try {
            var timeout = request.getQueryParam("timeout");

            //TODO check that timeout is a number
            if (typeof timeout === 'undefined' || timeout === null || isNaN(timeout) || timeout > MAX_TIMEOUT) {
                timeout = MAX_TIMEOUT;
            }

            timeout = timeout * 1000;

            if (Version.majorVersion == "8") {
                _handleV8(timeout);
            } else if (Version.majorVersion == "7") {
                _handleV7(timeout);
            } else {
                responseBody = JSON.stringify({ "status": "error", "message": "The major Maximo version " + Version.majorVersion + " is not supported." });
            }
        }
    }
}

function _handleV8(timeout) {

    var logFolder = System.getenv("LOG_DIR");

    if (!logFolder) {
        logFolder = System.getProperty("com.ibm.ws.logging.log.directory");
    }

    if (!logFolder) {
        logFolder = "/logs";
    }

    if (!logFolder.trim().endsWith(File.separator)) {
        logFolder = logFolder + File.separator;
    }

    if (logFolder) {
        logFile = new File(logFolder + "messages.log");
        if (logFile.exists()) {
            // Last known position, starting with the length of the file.
            var lkp = logFile.length();

            var response = request.getHttpServletResponse();
            var output = response.getOutputStream();
            response.setBufferSize(0);
            response.setContentType("text/event-stream");
            response.flushBuffer();

            lkpHeader = request.getHeader("log-lkp");

            if (lkpHeader && !isNaN(lkpHeader) && lkpHeader < lkp) {
                lkp = lkpHeader;
            }

            var line = undefined;

            var start = System.currentTimeMillis();
            var end = start + timeout;

            while (System.currentTimeMillis() < end) {
                // Read file access
                rfa = new RandomAccessFile(logFile, "r");
                rfa.seek(lkp);

                while ((line = rfa.readLine()) && System.currentTimeMillis() < end) {
                    output.println(line);
                }

                lkp = rfa.getFilePointer();
                rfa.close();



                Thread.sleep(SLEEP_INTERVAL);
            }
            output.println("log-lkp=" + lkp);


        } else {
            responseBody = JSON.stringify({ "status": "error", "message": "The log file " + logFile.getPath() + " could not be opened." });
            return;
        }
    } else {
        responseBody = JSON.stringify({ "status": "error", "message": "Could not determine the log folder." });
        return;
    }

}

function _handleV7(timeout) {
    var root = LogManager.getLogger("maximo");

    if (root) {

        var console = root.getAppender(PARENT_APPENDER);

        if (console) {
            if (hasAppOption(SECURITY_APP, SECURITY_OPTION) || isAdmin()) {

                var response = request.getHttpServletResponse();
                var output = response.getOutputStream();
                var writer = new WriterAppender(console.getLayout(), output);
                var appenderName = APPENDER_NAME + userInfo.getUserName();
                writer.setName(appenderName);

                response.setBufferSize(0);
                response.setContentType("text/event-stream");
                response.flushBuffer();

                try {
                    root.addAppender(writer);

                    var start = System.currentTimeMillis();
                    var end = start + timeout;
                    while (System.currentTimeMillis() < end) {
                        Thread.sleep(SLEEP_INTERVAL);
                    }
                } finally {
                    root.removeAppender(appenderName);
                }
            } else {
                responseBody = JSON.stringify({ "status": "error", "message": "The user " + userInfo.getUserName() + " does not have permission to stream the Maximo log. The security option " + SECURITY_OPTION + " on the " + SECURITY_APP + " application is required." });
            }
        } else {
            responseBody = JSON.stringify({ "status": "error", "message": "The standard Console log appender is not configured for the root maximo logger." });
        }
    } else {
        responseBody = JSON.stringify({ "status": "error", "message": "Cannot get the root maximo logger." });
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
            sigoption.setValue("DESCRIPTION", "Stream Log");
            sigoption.setValue("ESIGENABLED", false);
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

// eslint-disable-next-line no-unused-vars
var scriptConfig = {
    "autoscript": "SHARPTREE.AUTOSCRIPT.LOGGING",
    "description": "Stream the log file.",
    "version": "1.0.0",
    "active": true,
    "logLevel": "ERROR"
};