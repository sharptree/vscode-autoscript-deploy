import * as path from "path";

import { window } from "vscode";

import deployScript from "./deploy-script-command";
import deployScreen from "./deploy-screen-command";
import deployForm from "./deploy-form-command";

export default async function deployCommand(client) {
    // Get the active text editor
    const editor = window.activeTextEditor;

    if (editor) {
        let document = editor.document;

        if (document) {
            let filePath = document.fileName;
            let fileExt = path.extname(filePath);

            if (fileExt === ".js" || fileExt === ".py") {
                await deployScript(client, filePath, document.getText());
            } else if (fileExt === ".xml") {
                await deployScreen(client, filePath, document.getText());
            } else if (fileExt === ".json") {
                await deployForm(client, filePath, document.getText());
            } else {
                window.showErrorMessage(
                    "The selected file must have a Javascript ('.js') or Python ('.py') file extension for an automation script, ('.xml') for a screen definition or ('.json') for an inspection form.",
                    { modal: true }
                );
            }
        } else {
            window.showErrorMessage("An automation script, screen definition or inspection form must be selected to deploy.", { modal: true });
        }
    } else {
        window.showErrorMessage("An automation script, screen definition or inspection form must be selected to deploy.", { modal: true });
    }
}
