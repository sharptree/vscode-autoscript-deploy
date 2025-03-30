import * as path from 'path';
import * as fs from 'fs';
import { window } from 'vscode';

import deployScript from './deploy-script-command';
import deployScreen from './deploy-screen-command';
import deployForm from './deploy-form-command';
import deployReport from './deploy-report-command';

export default async function deployCommand(client) {
    // Get the active text editor
    const editor = window.activeTextEditor;

    if (editor) {
        let document = editor.document;

        if (document) {
            let filePath = document.fileName;
            let fileExt = path.extname(filePath);

            if (fileExt === '.js' || fileExt === '.py' || fileExt === '.jy') {
                await deployScript(client, filePath, document.getText());
            } else if (fileExt === '.xml') {
                await deployScreen(client, filePath, document.getText());
            } else if (fileExt === '.json') {
                try {
                    let manifest = JSON.parse(document.getText());
                    if (
                        manifest &&
                        Object.prototype.hasOwnProperty.call(
                            manifest,
                            'manifest'
                        ) &&
                        Array.isArray(manifest.manifest)
                    ) {
                        const directory = path.dirname(filePath);
                        for (const item of manifest.manifest) {
                            let itemValue = item;
                            if (
                                typeof item === 'object' &&
                                Object.prototype.hasOwnProperty.call(
                                    item,
                                    'path'
                                )
                            ) {
                                itemValue = item.path;
                            }

                            if (typeof itemValue === 'string') {
                                let itemPath = fs.existsSync(itemValue)
                                    ? itemValue
                                    : path.join(directory, itemValue);
                                if (fs.existsSync(itemPath)) {
                                    let content = fs.readFileSync(
                                        itemPath,
                                        'utf8'
                                    );
                                    let itemExt = path.extname(itemPath);
                                    if (
                                        itemExt === '.js' ||
                                        itemExt === '.py' ||
                                        itemExt === '.jy'
                                    ) {
                                        await deployScript(
                                            client,
                                            itemPath,
                                            content
                                        );
                                    } else if (itemExt === '.xml') {
                                        await deployScreen(
                                            client,
                                            itemPath,
                                            content
                                        );
                                    } else if (itemExt === '.json') {
                                        await deployForm(
                                            client,
                                            itemPath,
                                            content
                                        );
                                    } else if (itemExt === '.rptdesign') {
                                        await deployReport(
                                            client,
                                            itemPath,
                                            content
                                        );
                                    }
                                }
                            }
                        }
                    } else {
                        await deployForm(client, filePath, document.getText());
                    }
                } catch (error) {
                    window.showErrorMessage('Unexpected Error: ' + error);
                    return;
                }
            } else if (fileExt === '.rptdesign') {
                await deployReport(client, filePath, document.getText());
            } else {
                window.showErrorMessage(
                    // eslint-disable-next-line quotes
                    "The selected file must have a Javascript ('.js') or Python ('.py') file extension for an automation script, ('.xml') for a screen definition, ('.rptdesign') for a BIRT report or ('.json') for an inspection form.",
                    { modal: true }
                );
            }
        } else {
            window.showErrorMessage(
                'An automation script, screen definition, BIRT report or inspection form must be selected to deploy.',
                { modal: true }
            );
        }
    } else {
        window.showErrorMessage(
            'An automation script, screen definition, BIRT report or inspection form must be selected to deploy.',
            { modal: true }
        );
    }
}
