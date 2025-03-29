/* eslint-disable indent */
import * as fs from 'fs';
import * as crypto from 'crypto';

import { ProgressLocation, window, workspace } from 'vscode';

// get a reference to the Maximo configuration object
import { getMaximoConfig, asyncForEach } from '../extension';

export default async function extractFormsCommand(client) {
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

    let formNames = await window.withProgress(
        {
            title: 'Getting inspection forms',
            location: ProgressLocation.Notification,
        },
        async () => {
            return await client.getAllForms();
        }
    );

    if (typeof formNames !== 'undefined' && formNames.length > 0) {
        await window
            .showInformationMessage(
                'Do you want to extract ' +
                    (formNames.length > 1
                        ? 'the ' + formNames.length + ' inspection forms?'
                        : ' the one inspection form?'),
                { modal: true },
                ...['Yes']
            )
            .then(async (response) => {
                if (response === 'Yes') {
                    await window.withProgress(
                        {
                            title: 'Extracting Inspection Forms',
                            location: ProgressLocation.Notification,
                            cancellable: true,
                        },
                        async (progress, cancelToken) => {
                            let percent = Math.round(
                                (1 / formNames.length) * 100
                            );

                            let overwriteAll = false;
                            let overwrite = false;

                            await asyncForEach(formNames, async (form) => {
                                if (!cancelToken.isCancellationRequested) {
                                    progress.report({
                                        increment: percent,
                                        message: `Extracting ${form.name.toLowerCase()} (${
                                            form.inspformnum
                                        })`,
                                    });
                                    let formInfo = await client.getForm(
                                        form.id
                                    );

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
                                    let source = JSON.stringify(
                                        formInfo,
                                        null,
                                        4
                                    );
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
                                            if (!overwriteAll) {
                                                await window
                                                    .showInformationMessage(
                                                        `The inspection form ${form.name} exists. \nReplace?`,
                                                        { modal: true },
                                                        ...[
                                                            'Replace',
                                                            'Replace All',
                                                            'Skip',
                                                        ]
                                                    )
                                                    .then(async (response) => {
                                                        if (
                                                            response ===
                                                            'Replace'
                                                        ) {
                                                            overwrite = true;
                                                        } else if (
                                                            response ===
                                                            'Replace All'
                                                        ) {
                                                            overwriteAll = true;
                                                        } else if (
                                                            response === 'Skip'
                                                        ) {
                                                            // do nothing
                                                            overwrite = false;
                                                        } else {
                                                            // @ts-ignore
                                                            cancelToken.cancel();
                                                        }
                                                    });
                                            }
                                            if (overwriteAll || overwrite) {
                                                fs.writeFileSync(
                                                    outputFile,
                                                    source
                                                );
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
                                window.showInformationMessage(
                                    'Inspection forms extracted.',
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

function getExtension(scriptLanguage) {
    switch (scriptLanguage.toLowerCase()) {
        case 'python':
        case 'jython':
            return '.py';
        case 'nashorn':
        case 'javascript':
        case 'emcascript':
        case 'js':
            return '.js';
        default:
            return '.unknown';
    }
}
