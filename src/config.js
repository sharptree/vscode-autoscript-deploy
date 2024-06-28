// @ts-nocheck
import * as fs from "fs";
import * as path from "path";
// import { SecretStorage } from 'vscode';
import { Buffer } from "node:buffer";

import * as crypto from "crypto";

export default class LocalConfiguration {
    /**
     * @param {String} path
     * @param {SecretStorage} secretStorage
     */
    constructor(path, secretStorage) {
        this.path = path;
        this.secretStorage = secretStorage;
        this.algorithm = "aes-256-cbc";
    }

    get configAvailable() {
        return fs.existsSync(this.path);
    }

    get config() {
        if (!this.configAvailable) {
            return {};
        } else {
            return this.decrypt(JSON.parse(fs.readFileSync(this.path, "utf8")));
        }
    }

    async encryptIfRequired() {
        this.encrypt(JSON.parse(fs.readFileSync(this.path, "utf8")));
        let gitIgnorePath = path.dirname(this.path) + path.sep + ".gitignore";
        if (fs.existsSync(gitIgnorePath)) {
            fs.readFile(gitIgnorePath, function (err, data) {
                if (err) throw err;
                if (data.indexOf(".devtools-config.json") < 0) {
                    fs.appendFile(gitIgnorePath, "\n.devtools-config.json", function (err) {
                        if (err) throw err;
                    });
                }
            });
        } else {
            fs.writeFileSync(gitIgnorePath, ".devtools-config.json");
        }
    }

    async encrypt(config) {
        let encryptKey = await this.secretStorage.get("encryptKey");

        if (!encryptKey) {
            encryptKey = new Buffer.from(crypto.randomBytes(16)).toString("hex") + new Buffer.from(crypto.randomBytes(32)).toString("hex");
            await this.secretStorage.store("encryptKey", encryptKey);
        }

        const iv = Buffer.from(encryptKey.slice(0, 32), "hex");
        const key = Buffer.from(encryptKey.slice(32), "hex");

        if (config.password && !config.password.startsWith("{encrypted}")) {
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            let encPassword = cipher.update(config.password, "utf-8", "hex");
            encPassword += cipher.final("hex");

            config.password = "{encrypted}" + encPassword;
        }
        if (config.apiKey && !config.apiKey.startsWith("{encrypted}")) {
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            let encApiKey = cipher.update(config.apiKey, "utf-8", "hex");
            encApiKey += cipher.final("hex");

            config.apiKey = "{encrypted}" + encApiKey;
        }
        fs.writeFileSync(this.path, JSON.stringify(config, null, 4));
    }

    async decrypt(config) {
        let encryptKey = await this.secretStorage.get("encryptKey");

        if (!encryptKey) {
            return config;
        }

        const iv = Buffer.from(encryptKey.slice(0, 32), "hex");
        const key = Buffer.from(encryptKey.slice(32), "hex");

        if (config.password && config.password.startsWith("{encrypted}")) {
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            let decryptedPassword = decipher.update(config.password.substring(11), "hex", "utf-8");
            decryptedPassword += decipher.final("utf8");
            config.password = decryptedPassword;
        }

        if (config.apiKey && config.apiKey.startsWith("{encrypted}")) {
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            let decryptedApiKey = decipher.update(config.apiKey.substring(11), "hex", "utf-8");
            decryptedApiKey += decipher.final("utf8");
            config.apiKey = decryptedApiKey;
        }
        return config;
    }
}
