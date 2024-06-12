// @ts-nocheck
ConfigureServiceRemote = Java.type("psdi.app.configure.ConfigureServiceRemote");
AdminModeManager = Java.type("psdi.security.AdminModeManager");
MXServer = Java.type("psdi.server.MXServer");

main();

function main() {
    // if the implicit request variable is present then we are in the context of a REST request
    if (typeof request !== "undefined" && request) {
        var result = {};
        try {
            var action = getRequestAction();

            if (action) {
                action = action.toLowerCase();
            }

            if (action == "adminmodeon" && request.getHttpMethod() == "POST") {
                setAdminModeOn();
                result.adminModeOnStarted = true;
            } else if (action == "adminmodeoff" && request.getHttpMethod() == "POST") {
                setAdminModeOff();
                result.adminModeOffStarted = true;
            } else if (action == "adminmodeon" && request.getHttpMethod() == "GET") {
                result.adminModeOn = isAdminModeOn();
            } else if (action == "adminmodeoff" && request.getHttpMethod() == "GET") {
                result.adminModeOff = isAdminModeOff();
            } else if (action == "configuring" && request.getHttpMethod() == "GET") {
                result.configuring = dbConfigInProgress();
            } else if (action == "configdbrequired" && request.getHttpMethod() == "GET") {
                result.configDBRequired = configDBRequired();
            } else if (action == "configdblevel" && request.getHttpMethod() == "GET") {
                result.configDBLevel = configDBLevel();
            } else if (action == "configdbrequiresadminmode" && request.getHttpMethod() == "GET") {
                result.configDBRequiresAdminMode = configDBRequiresAdmin();
            } else if (action == "applyconfigdb" && request.getHttpMethod() == "POST") {
                applyConfigDB();
                result.configDBStarted = true;
            } else if (action == "configmessages" && request.getHttpMethod() == "GET") {
                result.messages = getConfigurationMessages();
            }
            result.status = "ok";
        } catch (error) {
            result.error = error.toString();
            result.status = "error";
        }

        responseBody = JSON.stringify(result, null, 4);
    }
}

function getConfigurationMessages() {
    var configureService = MXServer.getMXServer().lookup("CONFIGURE");

    var listenerSet = MXServer.getMXServer().getMboSet("PROCESSMONITOR", userInfo);
    try {
        var listener = listenerSet.add();
        configureService.listenToConfigDB(listener, true)  ;

        return listener.getString("STATUS");
    } finally {
        if (listenerSet) {
            try {
                listenerSet.close();
                listenerSet.cleanup();
            } catch (ignored) {}
        }
    }

    var messages = configureService.getConfigurationMessages(userInfo);
    return messages;
}

function setAdminModeOn() {
    if (!MXServer.getMXServer().lookup("SECURITY").getProfile(userInfo).hasAppOption("CONFIGUR", "ADMINMODE")) {
        throw new Error(
            'You do not have permission to manage the system Admin Mode. Make sure you have the "Manage Admin Mode" security permission for the "Database Configuration" application.'
        );
    }
    if (isAdminModeOff()) {
        MXServer.getMXServer().reloadAdminModeByThread(AdminModeManager.ADMIN_ON, null);
    }
}

function setAdminModeOff() {
    if (!MXServer.getMXServer().lookup("SECURITY").getProfile(userInfo).hasAppOption("CONFIGUR", "ADMINMODE")) {
        throw new Error(
            'You do not have permission to manage the system Admin Mode. Make sure you have the "Manage Admin Mode" security permission for the "Database Configuration" application.'
        );
    }
    if (isAdminModeOn()) {
        MXServer.getMXServer().reloadAdminModeByThread(AdminModeManager.ADMIN_OFF, null);
    }
}

function isAdminModeOn() {
    return MXServer.getMXServer().isAdminModeOn(true);
}

function isAdminModeOff() {
    return MXServer.getMXServer().isAdminModeOff(true);
}

function configDBRequired() {
    var configureService = MXServer.getMXServer().lookup("CONFIGURE");
    return configureService.getConfigLevel(userInfo) !== ConfigureServiceRemote.CONFIGDB_NONE;
}

function configDBLevel() {
    var configureService = MXServer.getMXServer().lookup("CONFIGURE");
    return configureService.getConfigLevel(userInfo);
}

function configDBRequiresAdmin() {
    var configureService = MXServer.getMXServer().lookup("CONFIGURE");
    return configureService.getConfigLevel(userInfo) == ConfigureServiceRemote.CONFIGDB_STRUCT;
}

function dbConfigInProgress() {
    var maxVarsService = MXServer.getMXServer().lookup("MAXVARS");
    var configureService = MXServer.getMXServer().lookup("CONFIGURE");
    return maxVarsService.getBoolean("CONFIGURING", null) || configureService.configIsRunning();
}

function applyConfigDB() {
    if (!MXServer.getMXServer().lookup("SECURITY").getProfile(userInfo).hasAppOption("CONFIGUR", "CONFIGURE")) {
        throw new Error(
            'You do not have permission to configure the database. Make sure you have the "Apply Configuration Changes" security permission for the "Database Configuration" application.'
        );
    }

    var set = MXServer.getMXServer().getMboSet("PROCESSMONITOR", userInfo);
    try {
        var monitor = set.add();
        var configureService = MXServer.getMXServer().lookup("CONFIGURE");
        configureService.runConfigDB(monitor);
    } finally {
        try {
            set.close();
            set.cleanup();
        } catch (ignored) {}
    }
}

function getRequestAction() {
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

    return action.toLowerCase();
}

var scriptConfig = {
    "autoscript": "SHARPTREE.AUTOSCRIPT.ADMIN",
    "description": "Sharptree automation script for admin operations",
    "version": "1.0.0",
    "active": true,
    "logLevel": "INFO"
};
