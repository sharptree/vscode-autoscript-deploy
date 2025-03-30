import * as fs from 'fs';
import * as crypto from 'crypto';

import { ProgressLocation, window, workspace } from 'vscode';

// get a reference to the Maximo configuration object
import { getMaximoConfig } from '../extension';

export default async function extractFormCommand(client) {
    let extractLoc = (await getMaximoConfig()).extractLocationForms;
    // if the extract location has not been specified use the workspace folder.
    if (typeof extractLoc === 'undefined' || !extractLoc) {
        if (workspace.workspaceFolders !== undefined) {
            extractLoc = workspace.workspaceFolders[0].uri.fsPath;
        } else {
            window.showErrorMessage(
                'A working folder must be selected or an export folder configured before exporting inspection forms.',
                {
                    modal: true,
                }
            );
            return;
        }
    }

    if (!fs.existsSync(extractLoc)) {
        window.showErrorMessage(
            `The inspection form extract folder ${extractLoc} does not exist.`,
            { modal: true }
        );
        return;
    }

    let formFullNames = await window.withProgress(
        {
            title: 'Getting inspection forms',
            location: ProgressLocation.Notification,
        },
        async () => {
            return await client.getAllForms();
        }
    );

    if (typeof formFullNames !== 'undefined' && formFullNames.length > 0) {
        var formNames = formFullNames.map((x) => x.name);
        formNames.sort();
        await window
            .showQuickPick(formNames, { placeHolder: 'Search for form' })
            .then(async (formName) => {
                if (typeof formName !== 'undefined') {
                    var form = formFullNames.find((x) => x.name == formName);

                    await window.withProgress(
                        {
                            title: `Extracting Inspection Form ${formName}`,
                            location: ProgressLocation.Notification,
                            cancellable: true,
                        },
                        async (progress, cancelToken) => {
                            let formInfo = await client.getForm(form.id);

                            let fileExtension = '.json';

                            let outputFile =
                                extractLoc +
                                '/' +
                                formInfo.name
                                    .toLowerCase()
                                    .replaceAll(' ', '-')
                                    .replaceAll('/', '-')
                                    .replaceAll('\\', '-') +
                                fileExtension;
                            let source = JSON.stringify(formInfo, null, 4);
                            // if the file doesn't exist then just write it out.
                            if (!fs.existsSync(outputFile)) {
                                fs.writeFileSync(outputFile, source);
                            } else {
                                let incomingHash = crypto
                                    .createHash('sha256')
                                    .update(source)
                                    .digest('hex');
                                let fileHash = crypto
                                    .createHash('sha256')
                                    .update(fs.readFileSync(outputFile))
                                    .digest('hex');

                                if (fileHash !== incomingHash) {
                                    await window
                                        .showInformationMessage(
                                            `The inspection form ${form.name} exists. \nReplace?`,
                                            { modal: true },
                                            ...['Replace']
                                        )
                                        .then(async (response) => {
                                            if (response === 'Replace') {
                                                fs.writeFileSync(
                                                    outputFile,
                                                    source
                                                );
                                            } else {
                                                // @ts-ignore
                                                cancelToken.cancel();
                                            }
                                        });
                                }
                            }

                            if (cancelToken.isCancellationRequested) {
                                return;
                            } else {
                                window.showInformationMessage(
                                    `Inspection form "${formName}" extracted.`,
                                    { modal: true }
                                );
                            }
                        }
                    );
                }
            });
    } else {
        window.showErrorMessage('No inspection forms were found to extract.', {
            modal: true,
        });
    }
}
