/* eslint-disable indent */
/* eslint-disable no-redeclare */
import axios from 'axios';
import https from 'https';
import {
    CookieJar,
    Cookie
} from 'tough-cookie';

import * as semver from 'semver';
import {
    InvalidApiKeyError,
    LoginFailedError,
    MaximoError,
    MxAccessError,
    MxAdminLogoutError,
    MxDuplicateTransactionError,
    PasswordExpiredError,
    PasswordResetFailedError,
    ResourceNotFoundError
} from './errors';

import * as fs from 'fs';
import * as path from 'path';

import MaximoConfig from './maximo-config';
import { TextDecoder } from 'util';

export default class MaximoClient {

    constructor(config) {
        if (!(config instanceof MaximoConfig)) {
            throw 'config parameter must be an instance of MaximoConfig';
        }
        this.maxVersion = 'undefined';
        // keep a reference to the config for later use.
        this.config = config;

        this.requiredScriptVersion = '1.24.0';
        this.currentScriptVersion = '1.24.0';

        if (config.ca) {
            https.globalAgent.options.ca = config.ca;
        }

        https.globalAgent.options.rejectUnauthorized = !config.allowUntrustedCerts;

        // This is the way it is supposed to be done, but in tested Axios seems to ignore the agent.
        // Allows untrusted certificates agent.
        // let httpsAgent = new https.Agent({
        //     rejectUnauthorized: !config.allowUntrustedCerts,
        //     ca: config.ca
        // });


        this.jar = new CookieJar(null, { rejectPublicSuffixes: false });

        this.client = axios.create({
            withCredentials: true,
            // httpsAgent: httpsAgent,
            baseURL: config.baseURL,
            timeout: config.connectTimeout,            
        });

        this.client.interceptors.request.use(function (request) {
            // If the requested URL is the login endpoint, the inject the auth headers.              
            if (request.url === 'login') {

                this._addAuthHeaders(request);

                if (this.config.apiKey) {
                    if (request.params) {
                        request.params.set('apikey', config.apiKey);
                    } else {
                        request.params = { 'apikey': config.apiKey };
                    }
                }

                request.maxRedirects = 0;
                request.validateStatus = function (status) {
                    return status == 200 || status == 302;
                };
            } else {
                // // Add the x-public-uri header to ensure Maximo response URI's are properly addressed for external access.
                // // https://www.ibm.com/docs/en/mema"s?topic=imam-downloading-work-orders-by-using-maximo-mxapiwodetail-api
                request.headers['x-public-uri'] = this.config.baseURL;


                if (this.config.apiKey) {
                    request.params = { 'lean': (this.config.lean ? 'true' : 'false'), 'apikey': this.config.apiKey };
                } else {
                    request.params = { 'lean': (this.config.lean ? 'true' : 'false') };
                }
            }
            
            // @ts-ignore
            this.jar.getCookiesSync(request.baseURL, function (err, cookies) {
                request.headers['cookie'] = cookies.join('; ');
            });

            return request;
        }.bind(this));

        this.client.interceptors.response.use(function (response) {

            const cookies = response.headers['set-cookie'];

            if (cookies) {
                let parsedCookies;

                if (cookies instanceof Array) {
                    // @ts-ignore
                    parsedCookies = cookies.map(Cookie.parse);
                } else {
                    parsedCookies = [Cookie.parse(cookies)];
                }

                parsedCookies.forEach((cookie) => {
                    this.jar.setCookieSync(cookie, response.request.protocol + '//' + response.request.host);
                });
            }

            return response;
        }.bind(this),
            this._processError.bind(this)
        );

        // When the first created the state of the client is disconnected.
        this._isConnected = false;

        this._currentLogFile = undefined;
        this._isLogging = false;
    }

    get connected() {
        return this._isConnected;
    }

    async connect() {
        var response = await this.client.post('login');

        var maxRedirects = 5;

        var redirectUri = response.headers['location'];
        if (response.status == 302 && this._isOIDCAuthRedirectResponse(response)) {

            for (var i = 0; i < maxRedirects; i++) {
                if (redirectUri == null) {
                    break;
                }

                response = await this.client.get(redirectUri, {
                    maxRedirects: 0,
                    withCredentials: true,
                    auth: { 'username': this.config.username, 'password': this.config.password },
                    validateStatus: function (status) {
                        return status == 200 || status == 302;
                    }
                });
                if (response.status == 302) {
                    // get the redirect URL from the header 
                    redirectUri = response.headers['location'];
                } else {
                    break;
                }
            }


        } else if (response.status == 302 && this._isLTPAFormRedirect(response)) {

            for (var i = 0; i < maxRedirects; i++) {
                if (redirectUri == null) {
                    break;
                }

                if (redirectUri.includes('login.jsp?')) {

                    const headers = {
                        'content-type': 'application/x-www-form-urlencoded',
                    };
                    const data = `j_username=${this.config.username}&j_password=${this.config.password}`;

                    response = await this.client.post(this.config.formLoginURL, data, {
                        maxRedirects: 0,
                        headers: headers,
                        withCredentials: true,
                        validateStatus: function (status) {
                            return status == 200 || status == 302;
                        }
                    });

                    await this.client.get(redirectUri);
                    response = await this.client.post('login');
                    break;
                } else if (redirectUri.includes('loginerror.jsp')) {
                    this._isConnected = false;
                    throw new LoginFailedError('You cannot log in at this time. Contact the system administrator.');
                } else {

                    response = await this.client.post(redirectUri, {
                        maxRedirects: 0,
                        withCredentials: true,
                        validateStatus: function (status) {
                            return status == 200 || status == 302;
                        }
                    });
                    if (response.status == 302) {
                        // get the redirect URL from the header 
                        redirectUri = response.headers['location'];
                    } else {
                        break;
                    }
                }
            }

        }
        this._responseHandler(response);
    }

    _addAuthHeaders(request) {

        request.headers.common['maxauth'] = this.config.maxauth;
        if (!this.config.maxauthOnly) {
            request.auth = { 'username': this.config.username, 'password': this.config.password };
        }

        request.withCredentials = true;

    }

    _isLTPAFormRedirect(response) {
        if (!response) {
            return false;
        }

        // Check whether this is a redirect response
        if (response.statusCode < 300 || response.statusCode >= 400) return false;

        const cookies = response.headers['set-cookie'];

        if (cookies) {
            var parsedCookies;
            if (cookies instanceof Array) {
                // @ts-ignore
                parsedCookies = cookies.map(Cookie.parse);
            } else {
                parsedCookies = [Cookie.parse(cookies)];
            }

            if (!parsedCookies || parsedCookies.length == 0) {
                return false;
            }

            // MAS8 sets matching cookies: WASOidcStateXXXXXX and WASReqURLOidcXXXXXX
            // This is from specific observation and may need review/revision
            var wasPostParamName = 'WASPostParam';
            var wasPostParamCookie = parsedCookies.filter((c) => c.key.toLowerCase().startsWith(wasPostParamName.toLowerCase()));
            return (wasPostParamCookie || wasPostParamCookie.length > 0);

        } else {
            return false;
        }
    }

    _isOIDCAuthRedirectResponse(response) {
        if (!response) {
            return false;
        }

        // Check whether this is a redirect response
        if (response.statusCode < 300 || response.statusCode >= 400) return false;

        const cookies = response.headers['set-cookie'];

        if (cookies) {
            var parsedCookies;
            if (cookies instanceof Array) {
                // @ts-ignore
                parsedCookies = cookies.map(Cookie.parse);
            } else {
                parsedCookies = [Cookie.parse(cookies)];
            }

            if (!parsedCookies || parsedCookies.length == 0) {
                return false;
            }

            // MAS8 sets matching cookies: WASOidcStateXXXXXX and WASReqURLOidcXXXXXX
            // This is from specific observation and may need review/revision
            var oidcStateCookieNamePrefix = 'WASOidcState';
            var oidcStateCookie = parsedCookies.filter((c) => c.key.toLowerCase().startsWith(oidcStateCookieNamePrefix.toLowerCase()));
            if (!oidcStateCookie || oidcStateCookie.length == 0) return false;

            // determine the identifier for the corresponding req url cookie name.
            var stateIdentifier = oidcStateCookie[0].key.substring(oidcStateCookieNamePrefix.length);
            var oidcReqUrlCookieNamePrefix = 'WASReqURLOidc';
            var targetCookieName = oidcReqUrlCookieNamePrefix + stateIdentifier;

            // ensure we have a matching req url cookie
            return parsedCookies.filter((c) => c.key.toLowerCase() == targetCookieName.toLowerCase()).length > 0;
        } else {
            return false;
        }
    }


    _responseHandler(response) {
        if (response) {
            if (response.status == 200) {
                if (response.data && response.data.maxupg) {
                    this.maxVersion = response.data.maxupg;
                }
                this._isConnected = true;
            } else if (response.status == 401) {
                this._isConnected = false;
                throw new LoginFailedError('You cannot log in at this time. Contact the system administrator.');
            } else {
                this._isConnected = false;
            }
        }
    }

    async disconnect() {
        // we don't care about the response status because if it fails there is nothing we can do about it.
        if (this._isConnected) {
            try {
                await this.client.post('logout', { withCredentials: true });
            } catch (error) {
                console.error('Warning disconnecting: ' + JSON.stringify(error));
            }
        }
    }

    async getScriptSource(script, progress, fileName) {
        if (!this._isConnected) {
            await this.connect();
        }

        let isPython = fileName.endsWith('.py');
        progress.report({ increment: 10, message: 'Getting script from the server.' });

        const options = {
            url: 'script/sharptree.autoscript.deploy/source/' + (isPython ? '/python' : ''),
            method: MaximoClient.Method.POST,
            headers: {
                'Content-Type': 'text/plain',
                Accept: 'application/json'
            },
            data: script
        };

        progress.report({ increment: 50, message: 'Getting script from the server.' });
        await new Promise(resolve => setTimeout(resolve, 100));
        // @ts-ignore
        const result = await this.client.request(options);

        progress.report({ increment: 90, message: 'Getting script from the server.' });
        return result.data;
    }

    async postScript(script, progress, fileName, deployScript) {

        if (!this._isConnected) {
            await this.connect();
        }

        let isPython = fileName.endsWith('.py');

        progress.report({ increment: 10, message: `Deploying script ${fileName}` });

        if (deployScript) {

            const deployOptions = {
                url: 'script/sharptree.autoscript.deploy' + (isPython ? '/python' : ''),
                method: MaximoClient.Method.POST,
                headers: {
                    'Content-Type': 'text/plain',
                    Accept: 'application/json'
                },
                data: deployScript
            };
            // @ts-ignore
            await this.client.request(deployOptions);
        }


        const options = {
            url: 'script/sharptree.autoscript.deploy' + (isPython ? '/python' : ''),
            method: MaximoClient.Method.POST,
            headers: {
                'Content-Type': 'text/plain',
                Accept: 'application/json'
            },
            data: script
        };

        progress.report({ increment: 50, message: `Deploying script ${fileName}` });
        await new Promise(resolve => setTimeout(resolve, 100));
        // @ts-ignore
        const result = await this.client.request(options);

        progress.report({ increment: 90, message: `Deploying script ${fileName}` });
        return result.data;

    }
    async postScreen(screen, progress, fileName) {

        if (!this._isConnected) {
            await this.connect();
        }

        progress.report({ increment: 10, message: `Deploying screen ${fileName}` });

        const options = {
            url: 'script/sharptree.autoscript.screens',
            method: MaximoClient.Method.POST,
            headers: {
                'Content-Type': 'text/plain',
                Accept: 'application/json'
            },
            data: screen
        };

        progress.report({ increment: 50, message: `Deploying screen ${fileName}` });
        await new Promise(resolve => setTimeout(resolve, 100));
        // @ts-ignore
        const result = await this.client.request(options);

        progress.report({ increment: 90, message: `Deploying screen ${fileName}` });
        return result.data;

    }

    async postForm(form, progress) {

        if (!this._isConnected) {
            await this.connect();
        }

        progress.report({ increment: 10, message: `Deploying inspection form ${form.name}` });

        const options = {
            url: 'script/sharptree.autoscript.form',
            method: MaximoClient.Method.POST,
            headers: {
                'Content-Type': 'text/plain',
                Accept: 'application/json'
            },
            data: JSON.stringify(form, null, 4)
        };

        progress.report({ increment: 50, message: `Deploying inspection form ${form.name}` });
        await new Promise(resolve => setTimeout(resolve, 100));
        // @ts-ignore
        const result = await this.client.request(options);

        progress.report({ increment: 90, message: `Deploying inspection form ${form.name}` });
        return result.data;

    }

    async installed() {
        if (!this._isConnected) {
            await this.connect();
        }

        const headers = new Map();
        headers['Content-Type'] = 'application/json';
        const options = {
            url: 'os/mxscript?oslc.select=autoscript&oslc.where=autoscript="SHARPTREE.AUTOSCRIPT.DEPLOY"',
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };

        // @ts-ignore
        const response = await this.client.request(options);

        if (!response || response.headers['content-type'] !== 'application/json') {
            throw new MaximoError('Received an unexpected response from the server. Content-Type header is not application/json.');
        }

        return response.data.member.length !== 0;
    }

    async upgradeRequired() {
        if (!this._isConnected) {
            await this.connect();
        }

        const headers = new Map();
        headers['Content-Type'] = 'application/json';
        const options = {
            url: 'script/SHARPTREE.AUTOSCRIPT.DEPLOY/version',
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };

        // @ts-ignore
        const response = await this.client.request(options);
        if (typeof response.data.version !== 'undefined') {
            return semver.lt(response.data.version, this.requiredScriptVersion);
        } else if (typeof response.data.status !== 'undefined' && response.data.status === 'error') {
            throw new MaximoError(response.data.message);
        } else {
            return true;
        }


    }

    async javaVersion() {
        if (!this._isConnected) {
            await this.connect();
        }

        const headers = new Map();
        headers['Content-Type'] = 'application/json';
        var options = {
            url: '',
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };

        // @ts-ignore
        var response = await this.client.request(options);

        if (response.data.thisserver) {
            options = {
                url: 'members/thisserver/jvm',
                method: MaximoClient.Method.GET,
                headers: { common: headers },
            };

            // @ts-ignore    
            response = await this.client.request(options).catch((error) => {
                // if the user doesn't have access to check the Java version then just skip it.                
                if (typeof error.reasonCode !== 'undefined' && error.reasonCode === 'BMXAA9051E') {
                    return 'no-permission';
                } else {
                    throw error;
                }
            });

            // @ts-ignore
            if (response === 'no-permission') {
                return response;
            }

            if (typeof response.data !== 'undefined') {
                return response.data.specVersion;
            } else {
                return 'unavailable';
            }
        } else {
            return 'unavailable';
        }
    }

    async maximoVersion() {
        if (!this._isConnected) {
            await this.connect();
        }

        if (typeof this.maxVersion !== 'undefined' && this.maxVersion !== 'unknown' && this.maxVersion !== 'undefined') {
            return this.maxVersion;
        } else {
            const headers = new Map();
            headers['Content-Type'] = 'application/json';
            const options = {
                url: '',
                method: MaximoClient.Method.GET,
                headers: { common: headers },
            };

            // @ts-ignore
            const response = await this.client.request(options);
            this.maxVersion = response.data.maxupg;
            return this.maxVersion;
        }
    }


    async installOrUpgrade(progress, bootstrap) {

        if (!this._isConnected) {
            throw new MaximoError('Maximo client is not connected.');
        }

        progress.report({ increment: 0 });

        if (bootstrap) {
            var result = await this._bootstrap(progress);

            if (result.status === 'error') {
                progress.report({ increment: 100 });
                return result;
            }

            progress.report({ increment: 20, message: 'Performed bootstrap installation.' });
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        let increment = 100 / 7;

        // eslint-disable-next-line no-undef
        let source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.store.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.store', 'Sharptree Automation Script Storage Script', source, progress, increment);

        // eslint-disable-next-line no-undef
        source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.extract.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.extract', 'Sharptree Automation Script Extract Script', source, progress, increment);

        // eslint-disable-next-line no-undef
        source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.logging.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.logging', 'Sharptree Automation Script Log Streaming', source, progress, increment);

        // initialize the logging security.
        result = this._initLogStreamSecurity();

        if (result.status == 'error') {
            throw new MaximoError(result.message);
        }

        // eslint-disable-next-line no-undef
        source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.deploy.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.deploy', 'Sharptree Automation Script Deploy Script', source, progress, increment);

        source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.screens.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.screens', 'Sharptree Screens Script', source, progress, increment);

        source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.form.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.form', 'Sharptree Inspection Forms Script', source, progress, increment);

        await this._fixInspectionFormData();

    }

    // @ts-ignore
    async startLogging(filePath, timeout) {

        if (typeof timeout === 'undefined') {
            timeout = 30;
        }

        this._isLogging = true;

        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: `script/sharptree.autoscript.logging?timeout=${timeout}`,
            method: MaximoClient.Method.GET,
            responseType: 'stream',
            headers: { common: headers }
        };

        let lkp = undefined;
        try {
            while (this._isLogging) {
                // @ts-ignore
                if (typeof lkp !== 'undefined') {
                    lkp = lkp.replace(/(\r\n|\n|\r)/gm, '');
                    options.headers['log-lkp'] = lkp;
                }

                // @ts-ignore
                let response = await this.client.request(options);

                let contentType = response.headers['content-type'];

                if (contentType === 'application/json') {
                    if (typeof response.data !== 'undefined') {
                        var internalError = await new Promise((resolve, reject) => {
                            let completeData = '';
                            response.data.on('data', (data) => {
                                if (!this._isLogging) {
                                    resolve();
                                } else {
                                    completeData += data;
                                }
                            });

                            response.data.on('end', () => {

                                if (completeData) {
                                    try {
                                        resolve(JSON.parse(completeData));
                                    } catch (error) { resolve(); }
                                } else {
                                    resolve();
                                }

                            });

                            response.data.on('error', () => {
                                this.stopLogging();
                                reject();
                            });
                        });
                        if (internalError) {
                            throw new MaximoError(internalError.message);
                        } else {
                            throw new MaximoError('An unexpected JSON response was returned by the server.');
                        }

                    } else {
                        throw new MaximoError('An unexpected JSON response was returned by the server.');
                    }
                } else if (contentType === 'text/event-stream') {

                    lkp = await new Promise((resolve, reject) => {
                        let internalLKP = undefined;
                        if (typeof response.data !== 'undefined') {
                            response.data.on('data', (data) => {
                                if (!this._isLogging) {
                                    resolve();
                                } else {
                                    if (data && data instanceof Uint8Array) {
                                        let decoder = new TextDecoder('utf-8');
                                        let sData = decoder.decode(data);
                                        if (sData.startsWith('log-lkp=')) {
                                            internalLKP = sData.substring(8);
                                        } else if (sData.indexOf('WARNING: Cannot set status. Response already committed.') > 0) {
                                            // do nothing.
                                        } else if (sData === '') {
                                            // do nothing on a blank line
                                        } else {
                                            fs.appendFileSync(filePath, sData);
                                        }
                                    }
                                }
                            });

                            response.data.on('end', () => {
                                resolve(internalLKP);
                            });

                            response.data.on('error', () => {
                                this.stopLogging();
                                reject();
                            });
                        }
                    });

                } else {
                    throw new Error(`Unexpected Content-Type ${contentType} was returned by the server.`);
                }
            }

        } catch (error) {
            if (error instanceof MaximoError) {
                throw error.message;
            }

            var internalError = await new Promise((resolve, reject) => {
                let completeData = '';
                if (typeof error.response !== 'undefined') {
                    error.response.data.on('data', (data) => {
                        if (!this._isLogging) {
                            resolve();
                        } else {
                            completeData += data;
                        }
                    });

                    error.response.data.on('end', () => {

                        if (completeData) {
                            try {
                                resolve(JSON.parse(completeData));
                            } catch (error) { resolve(); }
                        } else {
                            resolve();
                        }
                    });

                    error.response.data.on('error', () => {
                        this.stopLogging();
                        reject();
                    });
                } else {
                    this.stopLogging();
                    resolve();
                }
            });

            if (internalError) {
                throw internalError;
            } else {
                throw error;
            }
        }
    }

    async stopLogging() {
        this._isLogging = false;
        this.disconnect();
    }


    async getAllScriptNames() {
        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: 'os/mxscript?oslc.select=autoscript&oslc.pageSize=10',
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };

        var scriptNames = [];
        let hasMorePages = true;

        while (hasMorePages) {
            // @ts-ignore
            let response = await this.client.request(options);
            if (response.data.member.length !== 0) {
                response.data.member.forEach(member => {
                    if (!member.autoscript.startsWith('SHARPTREE.AUTOSCRIPT')) {
                        scriptNames.push(member.autoscript.toLowerCase());
                    }
                });
            }
            hasMorePages = typeof response.data.responseInfo.nextPage !== 'undefined';

            if (hasMorePages) {
                let pageNumber = response.data.responseInfo.pagenum + 1;
                options.url = `os/mxscript?oslc.select=autoscript&oslc.pageSize=10&pageno=${pageNumber}`;
            }
        }

        return scriptNames;
    }

    async getAllScreenNames() {

        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: 'script/sharptree.autoscript.screens',
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };
        // @ts-ignore
        let response = await this.client.request(options);

        if (response.data.status === 'success') {
            return response.data.screenNames;
        } else {
            throw new Error(response.data.message);
        }
    }

    async getAllForms() {

        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: 'script/sharptree.autoscript.form',
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };
        // @ts-ignore
        let response = await this.client.request(options);

        if (response.data.status === 'success') {
            return response.data.inspectionForms;
        } else {
            throw new Error(response.data.message);
        }
    }

    // @ts-ignore    
    // eslint-disable-next-line no-unused-vars
    async getPageData(url) {

    }

    // @ts-ignore
    // eslint-disable-next-line no-unused-vars
    async extractScript(script) {

    }

    async getScript(scriptName) {

        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: `script/sharptree.autoscript.extract/${scriptName}`,
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };

        // @ts-ignore
        let response = await this.client.request(options);

        if (response.data.status === 'success') {
            return response.data;
        } else {
            throw new Error(response.data.message);
        }
    }

    async getScreen(screenName) {

        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: `script/sharptree.autoscript.screens/${screenName}`,
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };

        // @ts-ignore
        let response = await this.client.request(options);

        if (response.data.status === 'success') {
            return response.data;
        } else {
            throw new Error(response.data.message);
        }
    }

    async getForm(formId) {

        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: `script/sharptree.autoscript.form/${formId}`,
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };

        // @ts-ignore
        let response = await this.client.request(options);

        if (response.data.status === 'success') {
            return response.data.form;
        } else {
            throw new Error(response.data.message);
        }
    }


    async _initLogStreamSecurity() {
        let headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: 'script/sharptree.autoscript.logging?initialize=true',
            method: MaximoClient.Method.GET,
            headers: { common: headers }
        };

        // @ts-ignore
        let response = await this.client.request(options);
        return response.data.status == true;
    }

    async _fixInspectionFormData() {
        let headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: 'script/sharptree.autoscript.form?fix=true',
            method: MaximoClient.Method.POST,
            headers: { common: headers }
        };

        // @ts-ignore
        let response = await this.client.request(options);
        return response.data.status == true;
    }


    async _installOrUpdateScript(script, description, source, progress, increment) {
        let scriptURI = await this._getScriptURI(script);

        let headers = new Map();
        headers['Content-Type'] = 'application/json';

        // update if a script uri was found.
        if (scriptURI) {
            let deployScript = {
                'description': description,
                'status': 'Active',
                'version': this.currentScriptVersion,
                'source': source
            };

            headers['x-method-override'] = 'PATCH';

            let options = {
                url: scriptURI,
                method: MaximoClient.Method.POST,
                headers: { common: headers },
                data: deployScript
            };

            // @ts-ignore
            await this.client.request(options);

            progress.report({ increment: increment, message: `Updated ${script}.` });
            await new Promise(resolve => setTimeout(resolve, 500));

        } else {
            const deployScript = {
                'autoscript': script,
                'description': description,
                'status': 'Active',
                'version': this.currentScriptVersion,
                'scriptlanguage': 'nashorn',
                'source': source
            };

            const options = {
                url: 'os/mxscript',
                method: MaximoClient.Method.POST,
                headers: { common: headers },
                data: deployScript
            };

            // @ts-ignore
            await this.client.request(options);
            progress.report({ increment: increment, message: `Installed ${script}.` });
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    async _getScriptURI(script) {
        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: `os/mxscript?oslc.select=autoscript&oslc.where=autoscript="${script}"`,
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        };

        // @ts-ignore
        let response = await this.client.request(options);
        if (response.data.member.length !== 0) {
            return response.data.member[0].href;
        } else {
            return null;
        }
    }

    async _bootstrap(progress) {
        if (!this._isConnected) {
            throw new MaximoError('Maximo client is not connected.');
        }

        let refUri;
        try {
            const headers = new Map();
            headers['Content-Type'] = 'application/json';

            // eslint-disable-next-line no-undef
            let source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.install.js')).toString();

            let options = {
                url: 'os/mxscript?oslc.select=autoscript&oslc.where=autoscript="SHARPTREE.AUTOSCRIPT.INSTALL"',
                method: MaximoClient.Method.GET,
                headers: { common: headers },
            };

            // @ts-ignore
            let response = await this.client.request(options);
            let href;
            if (response.data.member.length === 1) {
                href = response.data.member[0].href;
            }

            progress.report({ increment: 20 });

            if (href) {
                let deployScript = {
                    'description': 'Sharptree AutoScript Deploy Bootstrap',
                    'status': 'Active',
                    'version': this.currentScriptVersion,
                    'scriptlanguage': 'nashorn',
                    'source': source
                };
                headers['x-method-override'] = 'PATCH';
                options = {
                    url: href,
                    method: MaximoClient.Method.POST,
                    headers: { common: headers },
                    data: deployScript
                };
            } else {
                let deployScript = {
                    'autoscript': 'sharptree.autoscript.install',
                    'description': 'Sharptree AutoScript Deploy Bootstrap',
                    'status': 'Active',
                    'version': '1.0.0',
                    'scriptlanguage': 'nashorn',
                    'source': source
                };
                options = {
                    url: 'os/mxscript',
                    method: MaximoClient.Method.POST,
                    headers: { common: headers },
                    data: deployScript
                };
            }

            // @ts-ignore
            response = await this.client.request(options);
            refUri = response.headers.location;

            progress.report({ increment: 40 });

            if (href && !refUri) {
                refUri = href;
            }

            options = {
                url: 'script/sharptree.autoscript.install',
                method: MaximoClient.Method.POST,
                headers: { common: headers },
            };

            // @ts-ignore
            var result = await this.client.request(options);
            return result.data;

        } finally {
            if (refUri) {
                let options = {
                    url: refUri,
                    method: MaximoClient.Method.DELETE,
                };

                // @ts-ignore
                await this.client.request(options);
            }
        }
    }

    _processError(error) {

        if (error && error.response && error.response.data) {
            const data = error.response.data;

            // if this is a Maximo error then handle it.
            if (data.Error) {
                let message = data.Error.message;
                let reasonCode = data.Error.reasonCode;
                let statusCode = data.Error.statusCode;

                if (statusCode == 401 && (reasonCode === 'BMXAA7901E' || reasonCode === 'BMXAA0021E')) {
                    // BMXAA7901E - You cannot log in at this time. Contact the system administrator.
                    return Promise.reject(new LoginFailedError(message, reasonCode, statusCode));
                } else if (reasonCode === 'BMXAA2283E') {
                    // BMXAA2283E - Your password has expired.
                    return Promise.reject(new PasswordExpiredError(message, reasonCode, statusCode));
                } else if (reasonCode === 'BMXAA7902E') {
                    // BMXAA7902E - You cannot reset your password at this time. Contact the system administrator.
                    return Promise.reject(new PasswordResetFailedError(message, reasonCode, statusCode));
                } else if (reasonCode === 'BMXAA0024E' || reasonCode === 'BMXAA9051E') {
                    // BMXAA0024E - The action {0} is not allowed on object {1}}. Verify the business rules for the object and define the appropriate action for the object.
                    // BMXAA9051E - You are not authorized to view the management metrics that are identified by the URI path element {0}.
                    return Promise.reject(new MxAccessError(message, reasonCode, statusCode));
                } else if (statusCode == 404 && reasonCode === 'BMXAA8727E') {
                    // BMXAA8727E - The OSLC resource {0}} with the ID {1} was not found as it does not exist in the system. In the database, verify whether the resource for the ID exists.
                    return Promise.reject(new ResourceNotFoundError(message, reasonCode, statusCode));
                } else if (reasonCode === 'BMXAA9549E') {
                    // BMXAA9549E - The API key token is invalid. Either the token may have expired or the token has been revoked by the administrator.
                    return Promise.reject(new InvalidApiKeyError(message, reasonCode, statusCode));
                } else if (reasonCode === 'BMXAA5646I' || (message != null && message.includes('BMXAA5646I'))) {
                    // BMXAA5646I - You have been logged out by the system administrator.
                    // This sometimes returns with a null reason code, but the reason code is present in the message.
                    return Promise.reject(new MxAdminLogoutError(message, reasonCode, statusCode));
                } else if (statusCode == 409 && reasonCode === 'BMXAA9524E') {
                    // BMXAA9524E - The transaction ID {0} already exists in the OSLC transaction table with resource ID...
                    // TOOD Implement transaction ID handling.
                    return Promise.reject(new MxDuplicateTransactionError(message, reasonCode, statusCode, error.response.config.url, -1));
                } else {
                    // Return the generic Maximo error
                    return Promise.reject(new MaximoError(message, reasonCode, statusCode));
                }
            } else {
                // If the error is not a Maximo error just pass on the error.
                return Promise.reject(error);
            }
        } else {
            // If the error is not a Maximo error just pass on the error.
            return Promise.reject(error);
        }
    }

    static get Method() {
        return {
            GET: 'GET',
            POST: 'POST',
            DELETE: 'DELETE',
            PUT: 'PUT',
        };
    }
}