// @ts-nocheck
import axios from 'axios';
import https from 'https';
import { wrapper } from 'axios-cookiejar-support';
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
import * as path from 'path'

import MaximoConfig from './maximo-config';

export default class MaximoClient {
    constructor(config) {
        if (!(config instanceof MaximoConfig)) {
            throw "config parameter must be an instance of MaximoConfig";
        }
        this.maxVersion = 'undefined';
        // keep a reference to the config for later use.
        this.config = config;

        this.requiredScriptVersion = '1.6.0';
        this.currentScriptVersion = '1.6.0';

        // Allows untrusted certificates agent.
        let httpsAgent = new https.Agent({
            rejectUnauthorized: false,
        });

        this.jar = new CookieJar();

        this.client = axios.create({
            withCredentials: true,
            httpsAgent: (config.allowUntrustedCerts ? httpsAgent : undefined),
            baseURL: config.baseURL,
            timeout: config.connectTimeout,

        });

        this.client.interceptors.request.use(function (request) {
            // If the requested URL is the login endpoint, the inject the auth headers.            
            if (request.url === "login") {
                if (this.config.authType == 'MAXAUTH') {
                    // Send the maxauth header
                    request.headers.common['maxauth'] = this.config.maxauth;
                } else if (this.config.authType == 'OIDC') {
                    request.validateStatus = function (status) {
                        return status == 200 || status == 302;
                    }
                    request.maxRedirects = 0;
                    request.auth = { 'username': this.config.username, 'password': this.config.password };
                    request.headers.common['maxauth'] = this.config.maxauth;
                } else {
                    // Configure support for HTTP Basic authentication
                    request.auth = { 'username': config.username, 'password': config.password };
                }
            } else if (request.url === this.config.formLoginURL) {
                // add the x-www-form-urlencoded header
                request.headers['content-type'] = 'application/x-www-form-urlencoded';
                request.validateStatus = function (status) {
                    return status == 200 || status == 302;
                }
                request.maxRedirects = 0;

                request.data = `j_username=${this.config.username}&j_password=${this.config.password}`;

            } else {
                // if (request.headers['content-type'] === 'application/x-www-form-urlencoded') {
                // request.headers['content-type'] = 'application/json';
                // }

                // // Add the x-public-uri header to ensure Maximo response URI's are properly addressed for external access.
                // // https://www.ibm.com/docs/en/memas?topic=imam-downloading-work-orders-by-using-maximo-mxapiwodetail-api
                request.headers['x-public-uri'] = this.config.baseURL;
            }

            request.params = { "lean": (this.config.lean ? "true" : "false") };

            this.jar.getCookies((request.url && request.url.startsWith("http")) ? request.url : request.baseURL, function (err, cookies) {
                request.headers['cookie'] = cookies.join('; ');
            });

            return request;
        }.bind(this));

        this.client.interceptors.response.use(
            function (response) {
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
                        this.jar.setCookieSync(cookie, cookie.url ? cookie.url : response.request.protocol + "//" + response.request.host);
                    });
                }

                return response;
            }.bind(this),

            // @ts-ignore
            this._processError.bind(this)
        );

        // When the first created the state of the client is disconnected.
        this._isConnected = false;
    }

    get connected() {
        return this._isConnected;
    }

    async connect() {
        if (this.config.authType === 'FORM') {
            // process the Form authentication
            const maxRedirects = 5;

            var response = await this.client.post(this.config.formLoginURL, { withCredentials: true });
            if (!response) {
                throw new MaximoError(this.config.host + " is not responding for Form authentication.");
            }
            var redirectUri = response.headers['location'];
            for (var i = 0; i < maxRedirects; i++) {
                if (redirectUri == null) {
                    break;
                }
                this.jar.getCookiesSync(redirectUri);
                // make the new request                
                response = await this.client.get(redirectUri, {
                    auth: { 'username': this.config.username, 'password': this.config.password },
                    maxRedirects: 0,
                    validateStatus: function (status) {
                        return (status >= 200 && status < 300) || status == 302 || status >= 400;
                    }
                });

                redirectUri = response.headers['location'];
            }

            this._responseHandler(response);
            // return await this.client.post(this.config.formLoginURL, { withCredentials: true }).then(this._responseHandler.bind(this));
        } else if (this.config.authType === 'OIDC') {
            // process the OIDC authentication
            const maxRedirects = 5;

            var response = await this.client.post("login", { withCredentials: true });
            var redirectUri = response.headers['location'];
            for (var i = 0; i < maxRedirects; i++) {
                if (redirectUri == null) {
                    break;
                }
                this.jar.getCookiesSync(redirectUri);
                // make the new request                
                response = await this.client.get(redirectUri, {
                    auth: { 'username': this.config.username, 'password': this.config.password },
                    maxRedirects: 0,
                    validateStatus: function (status) {
                        return (status >= 200 && status < 300) || status == 302 || status >= 400;
                    }
                });

                redirectUri = response.headers['location'];
            }

            this._responseHandler(response);


        } else {
            return await this.client.post("login", { withCredentials: true }).then(this._responseHandler.bind(this));
        }
    }

    _responseHandler(response) {
        if (response.status == 200) {
            if (response.data && response.data.maxupg) {
                this.maxVersion = response.data.maxupg;
            }
            this._isConnected = true;
        } else if (response.status == 401) {
            this._isConnected = false;
            throw new LoginFailedError("You cannot log in at this time. Contact the system administrator.");
        } else {
            this._isConnected = false;
        }
    }

    async disconnect() {
        // we don't care about the response status because if it fails there is nothing we can do about it.
        if (this._isConnected) {
            await this.client.post("logout", { withCredentials: true });
        }
    }

    async postScript(script, progress, fileName) {

        if (!this._isConnected) {
            await this.connect();
        }

        let isPython = fileName.endsWith('.py');

        progress.report({ increment: 10, message: `Deploying script ${fileName}` });

        const options = {
            url: 'script/sharptree.autoscript.deploy' + (isPython ? '/python' : ''),
            method: MaximoClient.Method.POST,
            headers: {
                'Content-Type': 'ext/plain',
                Accept: 'application/json'
            },
            data: script
        }

        progress.report({ increment: 50, message: `Deploying script ${fileName}` });
        await new Promise(resolve => setTimeout(resolve, 100));
        const result = await this.client.request(options);

        progress.report({ increment: 90, message: `Deploying script ${fileName}` });
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
        }

        // @ts-ignore
        const response = await this.client.request(options);

        if (!response || response.headers['content-type'] !== 'application/json') {
            throw new MaximoError("Received an unexpected response from the server. Content-Type header is not application/json.");
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
        }
        try {
            const response = await this.client.request(options);
            if (typeof response.data.version !== 'undefined') {
                console.log("Current version is " + response.data.version);
                console.log(semver.lt(response.data.version, this.requiredScriptVersion));
                return semver.lt(response.data.version, this.requiredScriptVersion);
            } else {
                return true;
            }
        } catch (error) {
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
        }

        // @ts-ignore
        var response = await this.client.request(options);

        if (response.data.thisserver) {
            options = {
                url: 'members/thisserver/jvm',
                method: MaximoClient.Method.GET,
                headers: { common: headers },
            }

            // @ts-ignore    
            response = await this.client.request(options).catch((error) => {
                // if the user doesn't have access to check the Java version then just skip it.                
                if (typeof error.reasonCode !== 'undefined' && error.reasonCode === 'BMXAA9051E') {
                    return 'no-permission';
                } else {
                    throw error;
                }
            });

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
            }

            // @ts-ignore
            const response = await this.client.request(options);
            this.maxVersion = response.data.maxupg;
            return this.maxVersion;
        }
    }


    async installOrUpgrade(progress, bootstrap) {

        if (!this._isConnected) {
            throw new MaximoError("Maximo client is not connected.");
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

        let source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.deploy.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.deploy', 'Sharptree Automation Script Deploy Script', source, progress, 40);

        source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.filbert.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.filbert', 'Sharptree Automation Script Python Parser', source, progress, 60);

        source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.store.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.store', 'Sharptree Automation Script Storage Script', source, progress, 80);

        source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.extract.js')).toString();
        await this._installOrUpdateScript('sharptree.autoscript.extract', 'Sharptree Automation Script Extract Script', source, progress, 90);

        progress.report({ increment: 100 });

    }

    async getAllScriptNames() {
        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: `os/mxscript?oslc.select=autoscript&oslc.pageSize=10`,
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        }

        var scriptNames = [];
        let hasMorePages = true;

        while (hasMorePages) {
            let response = await this.client.request(options);
            if (response.data.member.length !== 0) {
                response.data.member.forEach(member => {
                    if (!member.autoscript.startsWith("SHARPTREE.AUTOSCRIPT")) {
                        scriptNames.push(member.autoscript.toLowerCase());
                    }
                });
            }
            hasMorePages = typeof response.data.responseInfo.nextPage !== 'undefined'

            if (hasMorePages) {
                let pageNumber = response.data.responseInfo.pagenum + 1;
                options.url = `os/mxscript?oslc.select=autoscript&oslc.pageSize=10&pageno=${pageNumber}`;
            }
        }

        return scriptNames;
    }

    async getPageData(url) {

    }

    async extractScript(script) {

    }

    async getScript(scriptName) {

        const headers = new Map();
        headers['Content-Type'] = 'application/json';

        let options = {
            url: `script/sharptree.autoscript.extract/${scriptName}`,
            method: MaximoClient.Method.GET,
            headers: { common: headers },
        }

        let response = await this.client.request(options);

        if (response.data.status === 'success') {
            return response.data;
        } else {
            throw new Error(response.data.message);
        }
    }


    async _installOrUpdateScript(script, description, source, progress, increment) {
        let scriptURI = await this._getScriptURI(script);

        let headers = new Map();
        headers['Content-Type'] = 'application/json';

        // update if a script uri was found.
        if (scriptURI) {
            let deployScript = {
                "description": description,
                "status": "Active",
                "version": this.currentScriptVersion,
                "source": source
            }

            headers['x-method-override'] = 'PATCH';

            let options = {
                url: scriptURI,
                method: MaximoClient.Method.POST,
                headers: { common: headers },
                data: deployScript
            }

            await this.client.request(options);

            progress.report({ increment: increment, message: `Updated ${script}.` });
            await new Promise(resolve => setTimeout(resolve, 500));

        } else {
            const deployScript = {
                "autoscript": script,
                "description": description,
                "status": "Active",
                "version": this.currentScriptVersion,
                "scriptlanguage": "nashorn",
                "source": source
            }

            const options = {
                url: 'os/mxscript',
                method: MaximoClient.Method.POST,
                headers: { common: headers },
                data: deployScript
            }

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
        }

        let response = await this.client.request(options);
        if (response.data.member.length !== 0) {
            return response.data.member[0].href;
        } else {
            return null;
        }
    }

    async _bootstrap(progress) {
        if (!this._isConnected) {
            throw new MaximoError("Maximo client is not connected.");
        }

        let refUri;
        try {
            const headers = new Map();
            headers['Content-Type'] = 'application/json';

            let source = fs.readFileSync(path.resolve(__dirname, '../resources/sharptree.autoscript.install.js')).toString();

            let options = {
                url: 'os/mxscript?oslc.select=autoscript&oslc.where=autoscript="SHARPTREE.AUTOSCRIPT.INSTALL"',
                method: MaximoClient.Method.GET,
                headers: { common: headers },
            }

            // @ts-ignore
            let response = await this.client.request(options);
            let href;
            if (response.data.member.length === 1) {
                href = response.data.member[0].href;
            }

            progress.report({ increment: 20 });

            if (href) {
                let deployScript = {
                    "description": "Sharptree AutoScript Deploy Bootstrap",
                    "status": "Active",
                    "version": this.currentScriptVersion,
                    "scriptlanguage": "nashorn",
                    "source": source
                }
                headers["x-method-override"] = "PATCH";
                options = {
                    url: href,
                    method: MaximoClient.Method.POST,
                    headers: { common: headers },
                    data: deployScript
                }
            } else {
                let deployScript = {
                    "autoscript": "sharptree.autoscript.install",
                    "description": "Sharptree AutoScript Deploy Bootstrap",
                    "status": "Active",
                    "version": "1.0.0",
                    "scriptlanguage": "nashorn",
                    "source": source
                }
                options = {
                    url: 'os/mxscript',
                    method: MaximoClient.Method.POST,
                    headers: { common: headers },
                    data: deployScript
                }
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
            }

            var result = await this.client.request(options);
            return result.data;

        } finally {
            if (refUri) {
                let options = {
                    url: refUri,
                    method: MaximoClient.Method.DELETE,
                }

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

                if (statusCode == 401 && reasonCode === 'BMXAA7901E') {
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
            }
        } else {
            // If the error is not a Maxiimo error just pass on the error.
            return Promise.reject(error);
        }

    }

    static get Method() {
        return {
            GET: "GET",
            POST: "POST",
            DELETE: "DELETE",
            PUT: "PUT",
        };
    }
}