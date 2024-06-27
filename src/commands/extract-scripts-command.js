import * as fs from "fs";
import * as crypto from "crypto";

import {  ProgressLocation, window, workspace } from "vscode";

// get a reference to the fetched source object
import {getMaximoConfig, asyncForEach} from "../extension";


export default async function extractScriptsCommand(client) {    
    
    let extractLoc = (await getMaximoConfig()).extractLocation;
    // if the extract location has not been specified use the workspace folder.
    if (typeof extractLoc === "undefined" || !extractLoc) {
        if (workspace.workspaceFolders !== undefined) {
            extractLoc = workspace.workspaceFolders[0].uri.fsPath;
        } else {
            window.showErrorMessage("A working folder must be selected or an export folder configured before exporting automation scripts. ", {
                modal: true
            });
            return;
        }
    }

    if (!fs.existsSync(extractLoc)) {
        window.showErrorMessage(`The script extract folder ${extractLoc} does not exist.`, { modal: true });
        return;
    }

    let scriptNames = await window.withProgress({ title: "Getting script names", location: ProgressLocation.Notification }, async (progress) => {
        return await client.getAllScriptNames(progress);
    });

    if (typeof scriptNames !== "undefined" && scriptNames.length > 0) {
        await window
            .showInformationMessage(
                "Do you want to extract " +
                    (scriptNames.length > 1 ? "the " + scriptNames.length + " automation scripts?" : " the one automation script?"),
                { modal: true },
                ...["Yes"]
            )
            .then(async (response) => {
                if (response === "Yes") {
                    await window.withProgress(
                        {
                            title: "Extracting Automation Script",
                            location: ProgressLocation.Notification,
                            cancellable: true
                        },
                        async (progress, cancelToken) => {
                            let percent = Math.round((1 / scriptNames.length) * 100);

                            let overwriteAll = false;
                            let overwrite = false;

                            await asyncForEach(scriptNames, async (scriptName) => {
                                if (!cancelToken.isCancellationRequested) {
                                    progress.report({ increment: percent, message: `Extracting ${scriptName}` });
                                    let scriptInfo = await client.getScript(scriptName);

                                    let fileExtension = getExtension(scriptInfo.scriptLanguage);

                                    let outputFile = extractLoc + "/" + scriptName.toLowerCase() + fileExtension;

                                    // if the file doesn't exist then just write it out.
                                    if (!fs.existsSync(outputFile)) {
                                        fs.writeFileSync(outputFile, scriptInfo.script);
                                    } else {
                                        let incomingHash = crypto.createHash("sha256").update(scriptInfo.script).digest("hex");
                                        let fileHash = crypto.createHash("sha256").update(fs.readFileSync(outputFile)).digest("hex");

                                        if (fileHash !== incomingHash) {
                                            if (!overwriteAll) {
                                                await window
                                                    .showInformationMessage(
                                                        `The script ${scriptName.toLowerCase()}${fileExtension} exists. \nReplace?`,
                                                        { modal: true },
                                                        ...["Replace", "Replace All", "Skip"]
                                                    )
                                                    .then(async (response) => {
                                                        if (response === "Replace") {
                                                            overwrite = true;
                                                        } else if (response === "Replace All") {
                                                            overwriteAll = true;
                                                        } else if (response === "Skip") {
                                                            // do nothing
                                                            overwrite = false;
                                                        } else {
                                                            // @ts-ignore
                                                            cancelToken.cancel();
                                                        }
                                                    });
                                            }
                                            if (overwriteAll || overwrite) {
                                                fs.writeFileSync(outputFile, scriptInfo.script);
                                                overwrite = false;
                                            }
                                        }
                                    }

                                    if (cancelToken.isCancellationRequested) {
                                        return;
                                    }
                                }
                            });

                            if (!cancelToken.isCancellationRequested) {
                                window.showInformationMessage("Automation scripts extracted.", { modal: true });
                            }
                        }
                    );
                }
            });
    } else {
        window.showErrorMessage("No scripts were found to extract.", { modal: true });
    }
}

function getExtension(scriptLanguage) {
    switch (scriptLanguage.toLowerCase()) {
        case "python":
        case "jython":
            return ".py";
        case "nashorn":
        case "javascript":
        case "emcascript":
        case "js":
            return ".js";
        default:
            return ".unknown";
    }
}