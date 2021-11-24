// @ts-nocheck
import { window, commands, workspace, ProgressLocation } from 'vscode';

import MaximoConfig from './maximo/maximo-config';
import MaximoClient from './maximo/maximo-client';
import { validateSettings } from './settings';

var password;
var lastUser;

export function activate(context) {

	let disposable = commands.registerCommand(
		"maximo-script-deploy.deploy",
		async function () {

			// make sure we have all the settings.
			if (!validateSettings()) {
				return;
			}

			const settings = workspace.getConfiguration('sharptree');

			const host = settings.get('maximo.host');
			const userName = settings.get('maximo.user');
			const useSSL = settings.get('maximo.useSSL');
			const port = settings.get('maximo.port');
			const authType = settings.get('maximo.authenticationType')
			const allowUntrustedCerts = settings.get('maximo.allowUntrustedCerts');

			// if the last user doesn't match the current user then request the password.
			if (lastUser && lastUser !== userName) {
				password = null;
			}

			if (!password) {
				password = await window.showInputBox({
					prompt: `Enter ${userName}'s password`,
					password: true,
					validateInput: text => {
						if (!text || text.trim() === '') {
							return 'A password is required';
						}
					}
				});
			}

			// if the password has not been set then just return.
			if (!password || password.trim() === '') {
				return;
			}

			const config = new MaximoConfig({
				username: userName,
				password: password,
				useSSL: useSSL,
				host: host,
				port: port,
				authType: authType,
				allowUntrustedCerts: allowUntrustedCerts
			});

			let client;

			try {
				client = new MaximoClient(config);
				var loginSuccessful = await client.connect().then((success) => {
					lastUser = userName;
					return true;
				}, (error) => {
					// clear the password on error
					password = null;
					lastUser = null;
					// show the error message to the user.
					window.showInformationMessage(error.message, { modal: true });
					return false;
				});
				if (loginSuccessful) {
					if (!await client.installed()) {
						await window.showInformationMessage('Configurations are required to deploy automation scripts.  Do you want to configure Maximo now?', { modal: true }, ...['Yes']).then(async (response) => {
							if (response === 'Yes') {
								await window.withProgress({
									title: 'Configuring Maximo...',
									location: ProgressLocation.Notification
								}, async (progress) => {
									var result = await client.install(progress);
									if (result && result.status === 'error') {
										window.showErrorMessage(result.message, { modal: true });
									} else {
										window.showInformationMessage('Maximo configuration successful.', { modal: true });
									}
								}
								);
							}
						});
						return;
					} else {
						// Get the active text editor
						const editor = window.activeTextEditor;
						if (editor) {
							let document = editor.document;

							if (document) {
								let fileName = document.fileName;
								if (fileName.endsWith('.js')) {
									// Get the document text
									const script = document.getText();

									console.log(script);

									if (script && script.trim().length > 0) {
										var result = await client.postScript(script);
										if (result) {
											if (result.status === 'error') {
												window.showErrorMessage(result.message, { modal: true });
											} else {
												window.setStatusBarMessage('Successfully deployed script.', 5000);
											}
										} else {
											window.showErrorMessage('Did not receive a response from Maximo.', { modal: true });
										}
									} else {
										window.showErrorMessage('The selected Automation Script cannot be empty.', { modal: true });
									}
								} else {
									window.showErrorMessage('The selected Automation Script must have a Javascript (\'.js\') file extension.', { modal: true });
								}
							} else {
								window.showErrorMessage('An Automation Script must be selected to deploy.', { modal: true });
							}
						} else {
							window.showErrorMessage('An Automation Script must be selected to deploy.', { modal: true });
						}
					}
				}
			} catch (error) {
				if (error && typeof error.message !== 'undefined') {
					window.showErrorMessage(error.message, { modal: true });
				} else {
					window.showErrorMessage('An unexpected error occured: ' + error, { modal: true });
				}

			} finally {
				// if the client exists then disconnect it.
				if (client) {
					await client.disconnect().catch((error) => {
						//do nothing with this
					});
				}
			}
		}
	);

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
function deactivate() { }

export default {
	activate,
	deactivate,
};
