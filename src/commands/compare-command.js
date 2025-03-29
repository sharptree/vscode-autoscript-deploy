import * as path from 'path';
import { parseString } from 'xml2js';
import { commands, ProgressLocation, window, Uri } from 'vscode';

// get a reference to the fetched source object
import { fetchedSource } from '../extension';

// @ts-ignore
import * as format from 'xml-formatter';

export default async function compareCommand(client) {
    // Get the active text editor
    const editor = window.activeTextEditor;

    if (editor) {
        let document = editor.document;

        if (document) {
            let fileName = path.basename(document.fileName);
            let fileExt = path.extname(fileName);
            if (fileExt === '.js' || fileExt === '.py' || fileExt === '.jy') {
                // Get the document text
                const script = document.getText();
                if (script && script.trim().length > 0) {
                    await window.withProgress(
                        {
                            cancellable: false,
                            title: 'Script',
                            location: ProgressLocation.Notification,
                        },
                        async (progress) => {
                            progress.report({
                                message: 'Getting script from the server.',
                                increment: 0,
                            });

                            await new Promise((resolve) =>
                                setTimeout(resolve, 500)
                            );
                            let result = await client.getScriptSource(
                                script,
                                progress,
                                fileName
                            );

                            if (result) {
                                if (result.status === 'error') {
                                    if (result.message) {
                                        window.showErrorMessage(
                                            result.message,
                                            { modal: true }
                                        );
                                    } else if (result.cause) {
                                        window.showErrorMessage(
                                            `Error: ${JSON.stringify(
                                                result.cause
                                            )}`,
                                            { modal: true }
                                        );
                                    } else {
                                        window.showErrorMessage(
                                            'An unknown error occurred: ' +
                                                JSON.stringify(result),
                                            { modal: true }
                                        );
                                    }
                                } else {
                                    if (result.source) {
                                        progress.report({
                                            increment: 100,
                                            message:
                                                'Successfully got script from the server.',
                                        });
                                        await new Promise((resolve) =>
                                            setTimeout(resolve, 2000)
                                        );
                                        let localScript = document.uri;
                                        let serverScript = Uri.parse(
                                            'vscode-autoscript-deploy:' +
                                                fileName
                                        );

                                        fetchedSource[serverScript.path] =
                                            result.source;

                                        commands.executeCommand(
                                            'vscode.diff',
                                            localScript,
                                            serverScript,
                                            '↔ server ' + fileName
                                        );
                                    } else {
                                        window.showErrorMessage(
                                            `The ${fileName} was not found.\n\nCheck that the scriptConfig.autoscript value matches a script on the server.`,
                                            { modal: true }
                                        );
                                    }
                                }
                            } else {
                                window.showErrorMessage(
                                    'Did not receive a response from Maximo.',
                                    { modal: true }
                                );
                            }
                            return result;
                        }
                    );
                } else {
                    window.showErrorMessage(
                        'The selected Automation Script cannot be empty.',
                        { modal: true }
                    );
                }
            } else if (fileExt === '.xml') {
                // Get the document text
                const screen = document.getText();
                let screenName;
                if (screen && screen.trim().length > 0) {
                    parseString(screen, function (error, result) {
                        if (error) {
                            window.showErrorMessage(error.message, {
                                modal: true,
                            });
                            return;
                        } else {
                            if (result.presentation) {
                                screenName = result.presentation.$.id;
                            } else if (result.systemlib) {
                                screenName = result.systemlib.$.id;
                            } else {
                                window.showErrorMessage(
                                    'Current XML document does not have an root element of "presentation" or "systemlib".',
                                    {
                                        modal: true,
                                    }
                                );
                                return;
                            }
                        }
                    });

                    if (!screenName) {
                        window.showErrorMessage(
                            'Unable to find presentation or systemlib id from current document. Cannot fetch screen from server to compare.',
                            { modal: true }
                        );
                        return;
                    }

                    await window.withProgress(
                        {
                            cancellable: false,
                            title: 'Screen',
                            location: ProgressLocation.Notification,
                        },
                        async (progress) => {
                            progress.report({
                                message: 'Getting screen from the server.',
                                increment: 0,
                            });

                            await new Promise((resolve) =>
                                setTimeout(resolve, 500)
                            );
                            let result = await client.getScreen(
                                screenName,
                                progress,
                                fileName
                            );

                            if (result) {
                                if (result.status === 'error') {
                                    if (result.message) {
                                        window.showErrorMessage(
                                            result.message,
                                            { modal: true }
                                        );
                                    } else if (result.cause) {
                                        window.showErrorMessage(
                                            `Error: ${JSON.stringify(
                                                result.cause
                                            )}`,
                                            { modal: true }
                                        );
                                    } else {
                                        window.showErrorMessage(
                                            'An unknown error occurred: ' +
                                                JSON.stringify(result),
                                            { modal: true }
                                        );
                                    }
                                } else {
                                    if (result.presentation) {
                                        progress.report({
                                            increment: 100,
                                            message:
                                                'Successfully got screen from the server.',
                                        });
                                        await new Promise((resolve) =>
                                            setTimeout(resolve, 2000)
                                        );
                                        let localScreen = document.uri;
                                        let serverScreen = Uri.parse(
                                            'vscode-autoscript-deploy:' +
                                                fileName
                                        );

                                        fetchedSource[serverScreen.path] =
                                            format(result.presentation);

                                        commands.executeCommand(
                                            'vscode.diff',
                                            localScreen,
                                            serverScreen,
                                            '↔ server ' + fileName
                                        );
                                    } else {
                                        window.showErrorMessage(
                                            `The ${fileName} was not found.\n\nCheck that the presentation id attribute value matches a Screen Definition on the server.`,
                                            { modal: true }
                                        );
                                    }
                                }
                            } else {
                                window.showErrorMessage(
                                    'Did not receive a response from Maximo.',
                                    { modal: true }
                                );
                            }
                            return result;
                        }
                    );
                } else {
                    window.showErrorMessage(
                        'The selected Screen Definition cannot be empty.',
                        { modal: true }
                    );
                }
            } else {
                window.showErrorMessage(
                    "The selected file must have a Javascript ('.js'), Python ('.py') or Jython ('.jy') file extension for an automation script or ('.xml') for a Screen Definition.",
                    { modal: true }
                );
            }
        } else {
            window.showErrorMessage(
                'An Automation Script or Screen Definition must be selected to compare.',
                { modal: true }
            );
        }
    } else {
        window.showErrorMessage(
            'An Automation Script or Screen Definition must be selected to compare.',
            { modal: true }
        );
    }
}
