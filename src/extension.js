// @ts-nocheck
import { window, commands, workspace, ProgressLocation, Uri, StatusBarAlignment } from 'vscode';

import MaximoConfig from './maximo/maximo-config';
import MaximoClient from './maximo/maximo-client';
import ServerSourceProvider from './maximo/provider';

import { validateSettings } from './settings';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

import * as temp from 'temp'


temp.track();


var password;
var lastUser;
var lastHost;
var lastPort;
var lastContext;
var logState = false;
var currentLogPath;
var textDocumentMonitor;

var logClient;

const supportedVersions = ['7608', '7609', '76010', '76011', '7610', '7611', '7612', '7613'];

var statusBar;



export function activate(context) {

	const logCommandId = 'maximo-script-deploy.log';
	context.subscriptions.push(commands.registerCommand(logCommandId, toggleLog));

	// create a new status bar item that we can now manage
	statusBar = window.createStatusBarItem(StatusBarAlignment.Right, 100);
	statusBar.command = logCommandId;
	statusBar.text = `$(book) Maximo Log`;
	statusBar.show();

	context.subscriptions.push(statusBar);

	let fetchedSource = new Map();

	context.subscriptions.push(workspace.registerTextDocumentContentProvider('vscode-autoscript-deploy', new ServerSourceProvider(fetchedSource)));

	let disposableCompare = commands.registerCommand(
		"maximo-script-deploy.compare",
		async function () {

			const config = await getMaximoConfig();

			if (!config) {
				return;
			}

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
									var result = await window.withProgress({ cancellable: false, title: `Script`, location: ProgressLocation.Notification },
										async (progress) => {
											progress.report({ message: `Getting script from the server.`, increment: 0 });

											await new Promise(resolve => setTimeout(resolve, 500));
											let result = await client.getScriptSource(script, progress, fileName);

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
													if (result.source) {
														progress.report({ increment: 100, message: `Successfully got script from the server.` });
														await new Promise(resolve => setTimeout(resolve, 2000));
														let localScript = document.uri;
														let serverScript = Uri.parse('vscode-autoscript-deploy:' + fileName);

														fetchedSource[serverScript.path] = result.source;

														commands.executeCommand('vscode.diff', localScript, serverScript, "↔ server " + fileName);
													} else {
														window.showErrorMessage(`The ${fileName} was not found on ${config.host}.\n\nCheck that the scriptConfig.autoscript value matches a script on the server.`, { modal: true });
													}
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
							window.showErrorMessage('An Automation Script must be selected to compare.', { modal: true });
						}
					} else {
						window.showErrorMessage('An Automation Script must be selected to compare.', { modal: true });
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


	let disposableDeploy = commands.registerCommand(
		"maximo-script-deploy.deploy",
		async function () {

			const config = await getMaximoConfig();

			if (!config) {
				return;
			}

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

			const config = await getMaximoConfig();

			if (!config) {
				return;
			}

			let client;

			try {
				client = new MaximoClient(config);

				if (await login(client)) {
					let extractLoc = config.extractLocation;
					// if the extract location has not been specified use the workspace folder.
					if (typeof extractLoc === 'undefined' || !extractLoc) {
						if (workspace.workspaceFolders !== undefined) {
							extractLoc = workspace.workspaceFolders[0].uri.fsPath;
						} else {
							window.showErrorMessage('A working folder must be selected or an export folder configured before exporting automation scripts. ', { modal: true });
							return;
						}
					}

					if (!fs.existsSync(extractLoc)) {
						window.showErrorMessage(`The script extract folder ${extractLoc} does not exist.`, { modal: true });
						return;
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


	context.subscriptions.push(disposableDeploy, disposableExtract, disposableCompare);

}

async function toggleLog() {
	console.log("doing the toggle");
	// if currently logging then stop.
	if (logState) {
		if (logClient) {
			logClient.stopLogging();
			logClient = undefined;
		}
		logState = !logState;
	} else {

		const config = await getMaximoConfig();

		if (!config) {
			return;
		}

		if (logClient) {
			await logClient.disconnect();
			logClient = new MaximoClient(config);
		} else {
			logClient = new MaximoClient(config);
		}

		try {
			if (await login(logClient)) {
				let logConfig = getLoggingConfig();

				let logFilePath = logConfig.outputFile;
				let isAbsolute = false;
				if (logFilePath) {

					isAbsolute = path.isAbsolute(logFilePath);

					if (!isAbsolute) {
						if (workspace.workspaceFolders !== undefined) {
							logFilePath = workspace.workspaceFolders[0].uri.fsPath + path.sep + logFilePath;
						} else {
							window.showErrorMessage('A working folder must be selected or an absolute log file path configured before retrieving the Maximo logs. ', { modal: true });
							return;
						}
					} else {
						let logFolder = path.dirname(logFilePath)
						if (!fs.existsSync(logFolder)) {
							window.showErrorMessage(`The log file folder ${logFolder} does not exist.`, { modal: true });
							return;
						}
					}
				} else {
					logFilePath = temp.path({ suffix: '.log', defaultPrefix: 'maximo' });
				}

				const logFile = isAbsolute ? path.resolve(logFilePath) : path.resolve(__dirname, logFilePath);

				if (!logConfig.append) {
					if (fs.existsSync(logFile)) {
						fs.unlinkSync(logFile);
					}
				}

				if (logConfig.openOnStart) {
					// Touch the log file making sure it is there then open it.
					const time = new Date();

					try {
						fs.utimesSync(logFile, time, time);
					} catch (err) {
						fs.closeSync(fs.openSync(logFile, 'w'));
					}

					workspace.openTextDocument(logFile).then(doc => {
						window.showTextDocument(doc, { preview: true });
					});

				}

				currentLogPath = logFile;

				let timeout = logConfig.timeout;
				let responseTimeout = config.responseTimeout;
				if (timeout && responseTimeout && (timeout * 1000) > responseTimeout) {
					timeout = (responseTimeout / 1000);
				}

				logClient.startLogging(logFile, timeout).catch((error) => {
					if (typeof error !== 'undefined' && typeof error.toJSON === 'function') {
						let jsonError = error.toJSON();
						if (typeof jsonError.message !== 'undefined') {
							window.showErrorMessage(jsonError.message, { modal: true });
						} else {
							window.showErrorMessage(JSON.stringify(jsonError), { modal: true });
						}
					} else if (typeof error !== 'undefined' && typeof error.Error !== 'undefined' && typeof error.Error.message !== 'undefined') {
						window.showErrorMessage(error.Error.message, { modal: true });
					} else if (error instanceof Error) {
						window.showErrorMessage(error.message, { modal: true });
					} else {
						window.showErrorMessage(error, { modal: true });
					}

					if (logState) { toggleLog(); }
				});
				logState = !logState;
			}
		} catch (error) {
			if (logState) {
				toggleLog();
			}

			if (error && typeof error.reasonCode !== 'undefined' && error.reasonCode === 'BMXAA0021E') {
				password = undefined;
				window.showErrorMessage(error.message, { modal: true });
			} else if (error && typeof error.message !== 'undefined') {
				window.showErrorMessage(error.message, { modal: true });
			} else {
				window.showErrorMessage('An unexpected error occurred: ' + error, { modal: true });
			}

			if (logClient) {
				logClient.disconnect();
				logClient = undefined;
			}

		}
	}

	if (logState) {
		statusBar.text = `$(sync~spin) Maximo Log`;
	} else {
		statusBar.text = `$(book) Maximo Log`;
	}
}


async function getMaximoConfig() {
	// make sure we have all the settings.
	if (!validateSettings()) {
		return;
	}

	let settings = workspace.getConfiguration('sharptree');

	let host = settings.get('maximo.host');
	let userName = settings.get('maximo.user');
	let useSSL = settings.get('maximo.useSSL');
	let port = settings.get('maximo.port');
	let apiKey = settings.get("maximo.apiKey");

	let allowUntrustedCerts = settings.get('maximo.allowUntrustedCerts');
	let maximoContext = settings.get('maximo.context');
	let timeout = settings.get('maximo.timeout');
	let ca = settings.get("maximo.customCA");
	let maxauthOnly = settings.get("maximo.maxauthOnly");
	let extractLocation = settings.get("maximo.extractLocation");


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
	if (!apiKey) {
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
			console.log("Returning nothing");
			return undefined;
		}
	}

	return new MaximoConfig({
		username: userName,
		password: password,
		useSSL: useSSL,
		host: host,
		port: port,
		context: maximoContext,
		connectTimeout: timeout * 1000,
		responseTimeout: timeout * 1000,
		allowUntrustedCerts: allowUntrustedCerts,
		ca: ca,
		maxauthOnly: maxauthOnly,
		apiKey: apiKey,
		extractLocation: extractLocation,
	});
}

function getLoggingConfig() {
	let settings = workspace.getConfiguration('sharptree');
	let outputFile = settings.get('maximo.logging.outputFile');
	let openEditorOnStart = settings.get('maximo.logging.openEditorOnStart');
	let append = settings.get('maximo.logging.append');
	let timeout = settings.get("maximo.logging.timeout");

	return {
		"outputFile": outputFile,
		"openOnStart": openEditorOnStart,
		"append": append,
		"timeout": timeout
	}
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
		password = undefined;
		lastUser = undefined;
		// show the error message to the user.
		if (error.message.includes('ENOTFOUND')) {
			window.showErrorMessage('The host name "' + client.config.host + '" cannot be found.', { modal: true });
		} else if (error.message.includes('ECONNREFUSED')) {
			window.showErrorMessage('Connection refused to host ' + client.config.host + ' on port ' + client.config.port, { modal: true });
		} else if (error.isAxiosError && error.response.status == 401) {
			window.showErrorMessage('User name and password combination are not valid. Try again.', { modal: true });
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
function deactivate() {
}

export default {
	activate,
	deactivate,
};
