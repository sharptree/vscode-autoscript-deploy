import { Buffer } from 'buffer';

export default class MaximoConfig {
    constructor({
        username,
        password,
        host,
        port = 443,
        useSSL = true,
        context = "maximo",
        allowUntrustedCerts = false,
        connectTimeout = 5000,
        responseTimeout = 30000,
        lean = true,
        ca
    }
    ) {
        this.username = username;
        this.password = password;
        this.host = host;
        this.port = port;
        this.useSSL = useSSL;
        this.context = context;
        this.allowUntrustedCerts = allowUntrustedCerts;
        this.connectTimeout = connectTimeout;
        this.responseTimeout = responseTimeout;
        this.lean = lean;
        this.ca = ca;
    }

    get maxauth() {
        return Buffer.from(this.username + ":" + this.password).toString('base64');
    }

    get baseURL() {
        return (
            this.useSSL ? "https://" : "http://") +
            this.host +
            (((this.port === 443 && this.useSSL) || (this.port === 80 && !this.useSSL)) ? "" : ":" + this.port) +
            "/" +
            this.context + "/oslc";
    }

    get formLoginURL() {
        return (
            this.useSSL ? "https://" : "http://") +
            this.host +
            (((this.port === 443 && this.useSSL) || (this.port === 80 && !this.useSSL)) ? "" : ":" + this.port) +
            "/" +
            this.context + "/j_security_check";
    }
}

