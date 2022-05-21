import { window, workspace, commands } from 'vscode';
import isValidHostname from 'is-valid-hostname';


export function validateSettings() {

    const settings = workspace.getConfiguration('sharptree');

    const host = settings.get("maximo.host");
    const userName = settings.get("maximo.user");
    const useSSL = settings.get("maximo.useSSL");
    const port = settings.get("maximo.port");
    const apiKey = settings.get("maximo.apiKey");

    if (!host) {
        window.showInformationMessage('The Maximo host is missing, set it now?', { modal: true }, ...['Yes']).then((response) => {
            if (response === 'Yes') {
                commands.executeCommand('workbench.action.openSettings', 'maximo');
            }
        });
        return false;
    }

    if (!isValidHostname(host)) {
        window.showInformationMessage('The Maximo host is invalid, fix it now?', { modal: true }, ...['Yes']).then((response) => {
            if (response === 'Yes') {
                commands.executeCommand('workbench.action.openSettings', 'maximo');
            }
        });
        return false;
    }

    if (port < 0 || port > 65535) {
        window.showInformationMessage('The Maximo port must be between 0 and 65535, fix it now?', { modal: true }, ...['Yes']).then((response) => {
            if (response === 'Yes') {
                commands.executeCommand('workbench.action.openSettings', 'maximo');
            }
        });
        return false;
    }

    if (!userName && !apiKey) {
        window.showInformationMessage('The Maximo user name is missing and an API Key was not provided, set it now?', { modal: true }, ...['Yes']).then((response) => {
            if (response === 'Yes') {
                commands.executeCommand('workbench.action.openSettings', 'maximo');
            }
        });
        return false;
    }

    return true;

}
