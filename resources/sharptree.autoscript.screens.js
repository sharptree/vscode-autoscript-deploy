// @ts-nocheck
/* eslint-disable no-undef */
RESTRequest = Java.type('com.ibm.tivoli.oslc.RESTRequest');

RuntimeException = Java.type('java.lang.RuntimeException');
System = Java.type('java.lang.System');

URLDecoder = Java.type('java.net.URLDecoder');
StandardCharsets = Java.type('java.nio.charset.StandardCharsets');

MboConstants = Java.type('psdi.mbo.MboConstants');
SqlFormat = Java.type('psdi.mbo.SqlFormat');
MXServer = Java.type('psdi.server.MXServer');

MXException = Java.type('psdi.util.MXException');
MXAccessException = Java.type('psdi.util.MXAccessException');
MXApplicationException = Java.type('psdi.util.MXApplicationException');

PresentationLoader = Java.type('psdi.webclient.system.controller.PresentationLoader');
WebClientSessionFactory = Java.type('psdi.webclient.system.session.WebClientSessionFactory');
WebClientSessionManager = Java.type('psdi.webclient.system.session.WebClientSessionManager');

MXLoggerFactory = Java.type('psdi.util.logging.MXLoggerFactory');

var logger = MXLoggerFactory.getLogger('maximo.script.' + service.getScriptName());

main();

function main() {
    if (typeof httpMethod !== 'undefined') {
        var response = {};
        try {
            if (httpMethod.toLowerCase() === 'get') {
                var screenName = getRequestScreentName();
                if (typeof screenName === 'undefined' || screenName === null || !screenName) {
                    // If nothing is requested then return a list of all screens.
                    var presentationSet;
                    try {
                        presentationSet = MXServer.getMXServer().getMboSet('MAXPRESENTATION', userInfo);

                        var presentations = [];
                        var presentation = presentationSet.getMbo(0);

                        while (presentation) {
                            presentations.push(presentation.getString('APP'));
                            presentationSet.remove(0);
                            presentation = presentationSet.getMbo(0);
                        }

                        response.status = 'success';
                        response.screenNames = presentations;
                        responseBody = JSON.stringify(response);
                    } finally {
                        close(presentationSet);
                    }
                } else {
                    response.status = 'success';
                    response.presentation = extractScreen(screenName);
                    responseBody = JSON.stringify(response);
                }
                return;
            } else if (httpMethod.toLowerCase() === 'post' && typeof requestBody !== 'undefined') {
                var loader = new PresentationLoader();
                var wcsf = WebClientSessionFactory.getWebClientSessionFactory();
                var wcs = wcsf.createSession(request.getHttpServletRequest(), request.getHttpServletResponse());

                loader.importApp(wcs, requestBody);

                response.status = 'success';
                responseBody = JSON.stringify(response);
            } else {
                throw new ScriptError('only_get_supported', 'Only the HTTP GET method is supported when extracting automation scripts.');
            }

        } catch (error) {
            response.status = 'error';

            if (error instanceof ScreenError) {
                response.message = error.message;
                response.reason = error.reason;
            } else if (error instanceof SyntaxError) {
                response.reason = 'syntax_error';
                response.message = error.message;
            } else if (error instanceof Error) {
                response.message = error.message;
            } else if (error instanceof MXException) {
                response.reason = error.getErrorGroup() + '_' + error.getErrorKey();
                response.message = error.getMessage();
            } else if (error instanceof RuntimeException) {
                if (error.getCause() instanceof MXException) {
                    response.reason = error.getCause().getErrorGroup() + '_' + error.getCause().getErrorKey();
                    response.message = error.getCause().getMessage();
                } else {
                    response.reason = 'runtime_exception';
                    response.message = error.getMessage();
                }
            } else {
                response.cause = error;
            }

            if (typeof httpMethod !== 'undefined') {
                responseBody = JSON.stringify(response);
            }

            logger.error(error);

            return;
        }
    }
}

function extractScreen(screenName) {
    var maxpresentationSet;
    try {
        maxpresentationSet = MXServer.getMXServer().getMboSet('MAXPRESENTATION', userInfo);
        var sqlf = new SqlFormat('app = :1');
        sqlf.setObject(1, 'MAXPRESENTATION', 'APP', screenName);

        maxpresentationSet.setWhere(sqlf.format());

        if (!maxpresentationSet.isEmpty()) {
            var maxpresentation = maxpresentationSet.moveFirst();
            return maxpresentation.getString('PRESENTATION');
        } else {
            throw new ScreenError('screen_not_found', 'The screen definition for ' + screenName + ' was not found.');
        }

    } finally {
        close(maxpresentationSet);
    }
}

function getRequestScreentName() {

    var httpRequest = request.getHttpServletRequest();

    var requestURI = httpRequest.getRequestURI();
    var contextPath = httpRequest.getContextPath();
    var resourceReq = requestURI;

    if (contextPath && contextPath !== '') {
        resourceReq = requestURI.substring(contextPath.length());
    }

    if (!resourceReq.startsWith('/')) {
        resourceReq = '/' + resourceReq;
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

    if (action.startsWith('/')) {
        action = action.substring(1);
    }

    if (!action || action.trim() === '') {
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
    'autoscript': 'SHARPTREE.AUTOSCRIPT.SCREENS',
    'description': 'Extract screen definitions.',
    'version': '1.0.0',
    'active': true,
    'logLevel': 'ERROR'
};