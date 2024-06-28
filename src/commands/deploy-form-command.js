// @ts-nocheck
import * as path from "path";
import * as fs from "fs";

import { window, ProgressLocation } from "vscode";

import MaximoClient from "../maximo/maximo-client";

export default async function deployForm(client, filePath, form) {
    if (!client || client === null || client instanceof MaximoClient === false) {
        throw new Error("The client parameter is required and must be an instance of the MaximoClient class.");
    }

    if (!filePath || filePath === null || !fs.existsSync(filePath)) {
        throw new Error("The filePath parameter is required and must be a valid file path to a inspection form file.");
    }

    if (!form || form === null || form.trim().length === 0) {
        form = fs.readFileSync(filePath, { encoding: "utf8" });
    }

    if (!form || form.trim().length <= 0) {
        window.showErrorMessage("The selected inspection form cannot be empty.", { modal: true });
        return;
    }

    let fileName = path.basename(filePath);

    try {
        let formObject = JSON.parse(form);

        if (typeof formObject.name === "undefined" || !formObject.name) {
            window.showErrorMessage(`File ${fileName} does not have a 'name' attribute and is not a valid inspection form extract.`, {
                modal: true
            });
            return;
        }

        await window.withProgress({ cancellable: false, title: "Inspection Form", location: ProgressLocation.Notification }, async (progress) => {
            progress.report({ message: `Inspection form ${formObject.name}`, increment: 0 });

            await new Promise((resolve) => setTimeout(resolve, 500));

            let result = await client.postForm(formObject, progress);

            if (result) {
                if (result.status === "error") {
                    if (result.message) {
                        window.showErrorMessage(result.message, { modal: true });
                    } else if (result.cause) {
                        window.showErrorMessage(`Error: ${JSON.stringify(result.cause)}`, { modal: true });
                    } else {
                        window.showErrorMessage("An unknown error occurred: " + JSON.stringify(result), { modal: true });
                    }
                } else {
                    progress.report({ increment: 100, message: `Successfully deployed ${formObject.name}` });
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            } else {
                window.showErrorMessage("Did not receive a response from Maximo.", { modal: true });
            }
            return result;
        });
    } catch (error) {
        window.showErrorMessage(`File ${fileName} is not a valid JSON formatted inspection form extract.\n\n${error.message}`, {
            modal: true
        });
        return;
    }
}
