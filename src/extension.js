// @ts-nocheck
import { window, commands, workspace, ProgressLocation } from 'vscode';

import MaximoConfig from './maximo/maximo-config';
import MaximoClient from './maximo/maximo-client';
import { validateSettings } from './settings';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

var password;
var lastUser;
var lastHost;
var lastPort;
var lastContext;

const supportedVersions = ['7608', '7609', '76010', '76011', '7610', '7611', '7612', '7613'];

export function activate(context) {

	let disposableDeploy = commands.registerCommand(
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
			const maximoContext = settings.get('maximo.context');
			const timeout = settings.get('maximo.timeout');

			// if the last user doesn't match the current user then request the password.
			if (lastUser && lastUser !== userName) {
				password = null;
			}

			if (lastHost && lastHost !== host) {
				password = null;
			}

			if (lastPort && lastPort !== port) {
				password = null;
			}

			if (lastContext && lastContext !== maximoContext) {
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
				context: maximoContext,
				connectTimeout: timeout * 1000,
				responseTimeout: timeout * 1000,
				authType: authType,
				allowUntrustedCerts: allowUntrustedCerts,
				ca: ca
			});

			let client;

			try {
				client = new MaximoClient(config);

				if (await login(client)) {
					// Get the active text editor
					const editor = window.activeTextEditor;
					if (editor) {
						let document = editor.document;

						if (document) {
							let fileName = path.basename(document.fileName);
							if (fileName.endsWith('.js') || fileName.endsWith('.py')) {
								// Get the document text
								const script = document.getText();
								if (script && script.trim().length > 0) {
									await new Promise(resolve => setTimeout(resolve, 500));
									var result = await window.withProgress({ cancellable: false, title: `Script`, location: ProgressLocation.Notification },
										async (progress) => {
											progress.report({ message: `Deploying script ${fileName}`, increment: 0 });

											await new Promise(resolve => setTimeout(resolve, 500));
											let result = await client.postScript(script, progress, fileName);

											if (result) {
												if (result.status === 'error') {
													if (result.message) {
														window.showErrorMessage(result.message, { modal: true });
													} else if (result.cause) {
														window.showErrorMessage(`Error: ${JSON.stringify(result.cause)}`, { modal: true });
													} else {
														window.showErrorMessage('An unknown error occurred: ' + JSON.stringify(result), { modal: true });
													}
												} else {
													progress.report({ increment: 100, message: `Successfully deployed ${fileName}` });
													await new Promise(resolve => setTimeout(resolve, 2000));
												}
											} else {
												window.showErrorMessage('Did not receive a response from Maximo.', { modal: true });
											}
											return result;
										});
								} else {
									window.showErrorMessage('The selected Automation Script cannot be empty.', { modal: true });
								}
							} else {
								window.showErrorMessage('The selected Automation Script must have a Javascript (\'.js\') or Python (\'.py\') file extension.', { modal: true });
							}
						} else {
							window.showErrorMessage('An Automation Script must be selected to deploy.', { modal: true });
						}
					} else {
						window.showErrorMessage('An Automation Script must be selected to deploy.', { modal: true });
					}

				}
			} catch (error) {
				if (error && typeof error.message !== 'undefined') {
					window.showErrorMessage(error.message, { modal: true });
				} else {
					window.showErrorMessage('An unexpected error occurred: ' + error, { modal: true });
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

	let disposableExtract = commands.registerCommand(
		"maximo-script-deploy.extract",
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
			const maximoContext = settings.get('maximo.context');
			const timeout = settings.get('maximo.timeout');
			const extractLocation = settings.get('maximo.extractLocation');
			const ca = settings.get("maximo.customCA");

			// if the last user doesn't match the current user then request the password.
			if (lastUser && lastUser !== userName) {
				password = null;
			}

			if (lastHost && lastHost !== host) {
				password = null;
			}

			if (lastPort && lastPort !== port) {
				password = null;
			}

			if (lastContext && lastContext !== maximoContext) {
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
				context: maximoContext,
				connectTimeout: timeout * 1000,
				responseTimeout: timeout * 1000,
				authType: authType,
				allowUntrustedCerts: allowUntrustedCerts,
				ca: ca
			});

			let client;

			try {
				client = new MaximoClient(config);

				if (await login(client)) {
					let extractLoc = extractLocation;
					// if the extract location has not been specified use the workspace folder.
					if (typeof extractLocation === 'undefined' || !extractLocation) {
						if (workspace.workspaceFolders !== undefined) {
							extractLoc = workspace.workspaceFolders[0].uri.fsPath;
						} else {
							window.showErrorMessage('A working folder must be selected or an export folder configured before exporting automation scripts. ', { modal: true });
							return;
						}
					}
					let scriptNames = await window.withProgress({ title: 'Getting script names', location: ProgressLocation.Notification }, async (progress) => {
						return await client.getAllScriptNames(progress);
					})

					if (typeof scriptNames !== 'undefined' && scriptNames.length > 0) {

						await window.showInformationMessage('Do you want to extract ' + (scriptNames.length > 1 ? 'the ' + scriptNames.length + ' automation scripts?' : ' the one automation script?'), { modal: true }, ...['Yes']).then(async (response) => {
							if (response === 'Yes') {
								await window.withProgress({
									title: 'Extracting Automation Script',
									location: ProgressLocation.Notification,
									cancellable: true
								}, async (progress, cancelToken) => {
									let percent = Math.round(((1) / scriptNames.length) * 100);

									let overwriteAll = false;
									let overwrite = false;

									await asyncForEach(scriptNames, async (scriptName, index) => {
										if (!cancelToken.isCancellationRequested) {
											progress.report({ increment: percent, message: `Extracting ${scriptName}` });
											let scriptInfo = await client.getScript(scriptName);

											let fileExtension = getExtension(scriptInfo.scriptLanguage);

											let outputFile = extractLoc + "/" + scriptName.toLowerCase() + fileExtension;

											// if the file doesn't exist then just write it out.
											if (!fs.existsSync(outputFile)) {
												fs.writeFileSync(outputFile, scriptInfo.script);
											} else {

												let incomingHash = crypto.createHash("sha256").update(scriptInfo.script).digest("hex")
												let fileHash = crypto.createHash("sha256").update(fs.readFileSync(outputFile)).digest("hex")

												if (fileHash !== incomingHash) {
													if (!overwriteAll) {
														await window.showInformationMessage(`The script ${scriptName.toLowerCase()}${fileExtension} exists. \nReplace?`, { modal: true }, ...['Replace', 'Replace All', 'Skip']).then(async (response) => {
															if (response === 'Replace') {
																overwrite = true;
															} else if (response === 'Replace All') {
																overwriteAll = true;
															} else if (response === 'Skip') {
																// do nothing
																overwrite = false;
															} else {
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
										window.showInformationMessage('Automation scripts extracted.', { modal: true });
									}
								}
								);
							}
						});

					} else {
						window.showErrorMessage("No scripts were found to extract.", { modal: true });
					}

				}
			} catch (error) {
				if (error && typeof error.reasonCode !== 'undefined' && error.reasonCode === 'BMXAA0021E') {
					password = undefined;
					window.showErrorMessage(error.message, { modal: true });
				} else if (error && typeof error.message !== 'undefined') {
					window.showErrorMessage(error.message, { modal: true });
				} else {
					window.showErrorMessage('An unexpected error occurred: ' + error, { modal: true });
				}

			} finally {
				// if the client exists then disconnect it.
				if (client) {
					await client.disconnect().catch((error) => {
						//do nothing with this
					});
				}
			}
		});

	context.subscriptions.push(disposableDeploy, disposableExtract);

}

async function login(client) {
	let logInSuccessful = await client.connect().then((success) => {
		lastUser = client.config.userName;
		lastHost = client.config.host;
		lastPort = client.config.port;
		lastContext = client.config.maximoContext;
		return true;
	}, (error) => {
		// clear the password on error
		password = null;
		lastUser = null;
		// show the error message to the user.
		if (error.message.includes('ENOTFOUND')) {
			window.showErrorMessage('The host name "' + client.config.host + '" cannot be found.', { modal: true });
		} else if (error.message.includes('ECONNREFUSED')) {
			window.showErrorMessage('Connection refused to host ' + client.config.host + ' on port ' + client.config.port, { modal: true });
		} else {
			window.showErrorMessage(error.message, { modal: true });
		}
		return false;
	});

	if (logInSuccessful) {
		logInSuccessful = await versionSupported(client);
	}

	if (logInSuccessful) {
		if (await installed(client) && await upgraded(client)) {
			return true;
		} else {
			await client.disconnect();
			return false;
		}
	} else {
		return false;
	}
}

async function installed(client) {
	if (!await client.installed()) {
		await window.showInformationMessage('Configurations are required to deploy automation scripts.  Do you want to configure Maximo now?', { modal: true }, ...['Yes']).then(async (response) => {
			if (response === 'Yes') {
				await window.withProgress({
					title: 'Configuring Maximo',
					location: ProgressLocation.Notification
				}, async (progress) => {
					var result = await client.installOrUpgrade(progress, true);
					if (result && result.status === 'error') {
						window.showErrorMessage(result.message, { modal: true });
						return false;
					} else {
						window.showInformationMessage('Maximo configuration successful.', { modal: true });
						return true;
					}
				}
				);
			}
			return false;
		});
	} else {
		return true;
	}
}

async function upgraded(client) {
	if (await client.upgradeRequired()) {
		await window.showInformationMessage('Updated configurations are required to deploy automation scripts.  Do you want to configure Maximo now?', { modal: true }, ...['Yes']).then(async (response) => {
			if (response === 'Yes') {
				await window.withProgress({
					title: 'Configuring Maximo',
					location: ProgressLocation.Notification
				}, async (progress) => {
					var result = await client.installOrUpgrade(progress);
					if (result && result.status === 'error') {
						window.showErrorMessage(result.message, { modal: true });
						return false;
					} else {
						window.showInformationMessage('Maximo configuration successful.', { modal: true });
						return true;
					}
				}
				);
			}
			return false;
		});
		return;
	} else {
		return true;
	}
}


async function versionSupported(client) {
	var version = await client.maximoVersion();

	if (!version) {
		window.showErrorMessage(`Could not determine the Maximo version. Only Maximo 7.6.0.8 and greater are supported`, { modal: true });
		return false;
	} else {
		var checkVersion = version.substr(1, version.indexOf('-') - 1);
		if (!supportedVersions.includes(checkVersion)) {
			window.showErrorMessage(`The Maximo version ${version} is not supported.`, { modal: true });
			return false;
		}
	}
	return true;
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

async function asyncForEach(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array);
	}
}
// this method is called when your extension is deactivated
function deactivate() { }

export default {
	activate,
	deactivate,
};
