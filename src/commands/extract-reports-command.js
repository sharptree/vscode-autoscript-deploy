import * as fs from "fs";
import * as crypto from "crypto";

import { ProgressLocation, window, workspace } from "vscode";
import { writeResources, writeMetaData } from "./extract-report-command";
// get a reference to the Maximo configuration object
import { getMaximoConfig, asyncForEach } from "../extension";

export default async function extractReportsCommand(client) {
    let extractLoc = (await getMaximoConfig()).extractLocationReports;
    // if the extract location has not been specified use the workspace folder.
    if (typeof extractLoc === "undefined" || !extractLoc) {
        if (workspace.workspaceFolders !== undefined) {
            extractLoc = workspace.workspaceFolders[0].uri.fsPath;
        } else {
            window.showErrorMessage("A working folder must be selected or an export folder configured before exporting reports.", {
                modal: true
            });
            return;
        }
    }

    if (!fs.existsSync(extractLoc)) {
        window.showErrorMessage(`The reports extract folder ${extractLoc} does not exist.`, { modal: true });
        return;
    }

    let reportNames = await window.withProgress({ title: "Getting report names", location: ProgressLocation.Notification }, async () => {
        return await client.getAllReports();
    });

    if (typeof reportNames !== "undefined" && reportNames.length > 0) {
        let mappedReportNames = reportNames.map((report) => {
            return report.description + " (" + report.report + ")";
        });

        await window
            .showInformationMessage(
                "Do you want to extract " + (reportNames.length > 1 ? "the " + reportNames.length + " reports?" : " the one report?"),
                { modal: true },
                ...["Yes"]
            )
            .then(async (response) => {
                if (response === "Yes") {
                    await window.withProgress(
                        {
                            title: "Extracting Reports",
                            location: ProgressLocation.Notification,
                            cancellable: true
                        },
                        async (progress, cancelToken) => {
                            let percent = (1 / reportNames.length) * 100;

                            let overwriteAll = false;
                            let overwrite = false;

                            await asyncForEach(mappedReportNames, async (reportName) => {
                                if (!cancelToken.isCancellationRequested) {
                                    progress.report({ increment: percent, message: `Extracting ${reportName}` });
                                    var report = reportNames.find((x) => x.description + " (" + x.report + ")" == reportName);

                                    let reportInfo = await client.getReport(report.reportId);

                                    let outputFile = extractLoc + "/" + reportInfo.reportFolder + "/" + report.report;
                                    if (reportInfo.design) {
                                        let xml = reportInfo.design;
                                        
                                        // if the file doesn't exist then just write it out.
                                        if (!fs.existsSync(outputFile)) {
                                            fs.mkdirSync(extractLoc + "/" + reportInfo.reportFolder, { recursive: true });
                                            fs.writeFileSync(outputFile, xml);
                                        } else {
                                            let incomingHash = crypto.createHash("sha256").update(xml).digest("hex");
                                            let fileHash = crypto.createHash("sha256").update(fs.readFileSync(outputFile)).digest("hex");

                                            if (fileHash !== incomingHash) {
                                                if (!overwriteAll) {
                                                    await window
                                                        .showInformationMessage(
                                                            `The report ${reportName} exists. \nReplace?`,
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
                                                    fs.writeFileSync(outputFile, xml);
                                                    overwrite = false;
                                                }
                                            }
                                            await writeResources(reportInfo, extractLoc);
                                            await writeMetaData(reportInfo, extractLoc);
                                        }

                                        if (cancelToken.isCancellationRequested) {
                                            return;
                                        }
                                    }
                                }
                            });

                            if (!cancelToken.isCancellationRequested) {
                                window.showInformationMessage("Reports extracted.", { modal: true });
                            }
                        }
                    );
                }
            });
    } else {
        window.showErrorMessage("No reports were found to extract.", { modal: true });
    }
}
