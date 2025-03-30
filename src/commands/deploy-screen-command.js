import * as path from 'path';
import * as fs from 'fs';
import { parseString } from 'xml2js';

import { window, ProgressLocation } from 'vscode';

import MaximoClient from '../maximo/maximo-client';

export default async function deployScreen(client, filePath, screen) {
    if (
        !client ||
        client === null ||
        client instanceof MaximoClient === false
    ) {
        throw new Error(
            'The client parameter is required and must be an instance of the MaximoClient class.'
        );
    }

    if (!filePath || filePath === null || !fs.existsSync(filePath)) {
        throw new Error(
            'The filePath parameter is required and must be a valid file path to a screen file.'
        );
    }

    if (!screen || screen === null || screen.trim().length === 0) {
        screen = fs.readFileSync(filePath, { encoding: 'utf8' });
    }

    if (!screen || screen.trim().length <= 0) {
        window.showErrorMessage(
            'The selected screen definition cannot be empty.',
            { modal: true }
        );
        return;
    }

    let fileName = path.basename(filePath);
    var screenName;
    var parseError;

    parseString(screen, function (error, result) {
        parseError = error;
        if (error) {
            return;
        } else {
            if (result.presentation) {
                screenName = result.presentation.$.id;
            } else if (result.systemlib) {
                screenName = result.systemlib.$.id;
            } else {
                parseError = {
                    message:
                        'Current XML document does not have an root element of "presentation" or "systemlib".',
                };
            }
        }
    });

    if (parseError) {
        // @ts-ignore
        window.showErrorMessage(
            `Error parsing ${fileName}: ${parseError.message}`,
            { modal: true }
        );
        return;
    }

    if (!screenName) {
        window.showErrorMessage(
            'Unable to find presentation or systemlib id from current document. Cannot fetch screen from server to compare.',
            {
                modal: true,
            }
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
                message: `Deploying screen ${fileName}`,
                increment: 0,
            });

            await new Promise((resolve) => setTimeout(resolve, 500));
            let result = await client.postScreen(screen, progress, fileName);

            if (result) {
                if (result.status === 'error') {
                    if (result.message) {
                        window.showErrorMessage(result.message, {
                            modal: true,
                        });
                    } else if (result.cause) {
                        window.showErrorMessage(
                            `Error: ${JSON.stringify(result.cause)}`,
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
                    progress.report({
                        increment: 100,
                        message: `Successfully deployed ${fileName}`,
                    });
                    await new Promise((resolve) => setTimeout(resolve, 2000));
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
}
