/* eslint-disable indent */
// @ts-nocheck
import { window, commands, workspace, ProgressLocation, Uri, StatusBarAlignment, TextEditorRevealType, Range, Position } from 'vscode';
import { parseString } from 'xml2js';
import MaximoConfig from './maximo/maximo-config';
import MaximoClient from './maximo/maximo-client';
import ServerSourceProvider from './maximo/provider';
import * as format from 'xml-formatter';

import { validateSettings } from './settings';
import * as path from 'path';
import * as fs from 'fs';

import * as crypto from 'crypto';

import * as temp from 'temp';
import { TextDecoder, TextEncoder } from 'text-encoding';

import LocalConfiguration from './config';

temp.track();

var password;
var lastUser;
var lastHost;
var lastPort;
var lastContext;
var logState = false;
var currentLogPath;
var currentWindow;
var currentFollow;
var logClient;

const supportedVersions = ['7608', '7609', '76010', '76011', '7610', '7611', '7612', '7613', '8300', '8400', '8500', '8600', '8700'];

var statusBar;
var secretStorage;

export function activate(context) {
	secretStorage = context.secrets;

	context.subscriptions.push(workspace.onDidChangeConfiguration(_onConfigurationChange.bind(workspace)));
	currentWindow = window;
	const logCommandId = 'maximo-script-deploy.log';
	context.subscriptions.push(commands.registerCommand(logCommandId, toggleLog));

	// create a new status bar item that we can now manage
	statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 0);
	statusBar.command = logCommandId;
	// eslint-disable-next-line quotes
	statusBar.text = `$(book) Maximo Log`;
	// eslint-disable-next-line quotes
	statusBar.tooltip = `Toggle Maximo log streaming`;
	statusBar.show();

	context.subscriptions.push(statusBar);

	let fetchedSource = new Map();

	let globalSettings = context.globalStoragePath + path.sep + 'userprefs.json';

	context.subscriptions.push(workspace.registerTextDocumentContentProvider('vscode-autoscript-deploy', new ServerSourceProvider(fetchedSource)));

	let disposableInsert = commands.registerTextEditorCommand('maximo-script-deploy.id', (editor, edit) => {
		let fileName = path.basename(editor.document.fileName);

		// if we are not dealing with an XML file do nothing.
		if (!fileName.endsWith('.xml')) {
			return;
		}

		var currentSelection = editor.selection;
		var regex = /<[^>]+(>)/g;
		let start = editor.document.offsetAt(new Position(currentSelection.start.line, currentSelection.start.character));

		let match;

		let found = false;
		while ((match = regex.exec(editor.document.getText()))) {
			if (start > match.index && start < regex.lastIndex) {
				let tag = match[0];
				let idMatch = /id= *".+?"/.exec(tag);

				if (idMatch) {
					let startId = match.index + idMatch.index;
					let endId = startId + idMatch[0].length;
					edit.replace(new Range(editor.document.positionAt(startId), editor.document.positionAt(endId)), `id="${Date.now()}"`);
					found = true;
				} else {
					let tagMatch = /<.* /.exec(tag);
					if (tagMatch) {
						let startId = match.index + tagMatch.index + tagMatch[0].length;
						edit.insert(editor.document.positionAt(startId), `id="${Date.now()}" `);
						found = true;
					}
				}

				break;
			}
		}

		if (!found) {
			if (fs.existsSync(globalSettings)) {
				workspace.fs.readFile(Uri.file(globalSettings)).then((data) => {
					if (data) {
						let settings = JSON.parse(new TextDecoder().decode(data));
						if (settings && !settings.suppressXMLIdMessage) {
							window.showWarningMessage('Select an XML tag to insert an Id.', 'Don\'t Show Again').then(selection => {
								if (selection == 'Don\'t Show Again') {
									settings.suppressXMLIdMessage = true;
									workspace.fs.writeFile(Uri.file(globalSettings), JSON.stringify(settings, null, 4));
								}
							});
						}
					}
				});
			} else {
				window.showWarningMessage('Select an XML tag to insert an Id.', 'Don\'t Show Again').then(selection => {
					if (selection == 'Don\'t Show Again') {
						let settings = { suppressXMLIdMessage: true };
						workspace.fs.writeFile(Uri.file(globalSettings), new TextEncoder().encode(JSON.stringify(settings, null, 4))).catch(error => console.log(error));

					}
				});
			}


		}
	});

	let disposableCompare = commands.registerCommand(
		'maximo-script-deploy.compare',
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
									await window.withProgress({ cancellable: false, title: 'Script', location: ProgressLocation.Notification },
										async (progress) => {
											progress.report({ message: 'Getting script from the server.', increment: 0 });

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
														progress.report({ increment: 100, message: 'Successfully got script from the server.' });
														await new Promise(resolve => setTimeout(resolve, 2000));
														let localScript = document.uri;
														let serverScript = Uri.parse('vscode-autoscript-deploy:' + fileName);

														fetchedSource[serverScript.path] = result.source;

														commands.executeCommand('vscode.diff', localScript, serverScript, '↔ server ' + fileName);
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
							} else if (fileName.endsWith('.xml')) {
								// Get the document text
								const screen = document.getText();
								let screenName;
								if (screen && screen.trim().length > 0) {

									parseString(screen, function (error, result) {
										if (error) {
											window.showErrorMessage(error.message, { modal: true });
											return;
										} else {
											if (result.presentation) {
												screenName = result.presentation.$.id;
											} else if (result.systemlib) {
												screenName = result.systemlib.$.id;
											} else {
												window.showErrorMessage('Current XML document does not have an root element of "presentation" or "systemlib".', { modal: true });
												return;
											}
										}
									});

									if (!screenName) {
										window.showErrorMessage('Unable to find presentation or systemlib id from current document. Cannot fetch screen from server to compare.', { modal: true });
										return;
									}


									await window.withProgress({ cancellable: false, title: 'Screen', location: ProgressLocation.Notification },
										async (progress) => {
											progress.report({ message: 'Getting screen from the server.', increment: 0 });

											await new Promise(resolve => setTimeout(resolve, 500));
											let result = await client.getScreen(screenName, progress, fileName);

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
													if (result.presentation) {
														progress.report({ increment: 100, message: 'Successfully got screen from the server.' });
														await new Promise(resolve => setTimeout(resolve, 2000));
														let localScreen = document.uri;
														let serverScreen = Uri.parse('vscode-autoscript-deploy:' + fileName);

														fetchedSource[serverScreen.path] = format(result.presentation);

														commands.executeCommand('vscode.diff', localScreen, serverScreen, '↔ server ' + fileName);
													} else {
														window.showErrorMessage(`The ${fileName} was not found on ${config.host}.\n\nCheck that the presentation id attribute value matches a Screen Definition on the server.`, { modal: true });
													}
												}
											} else {
												window.showErrorMessage('Did not receive a response from Maximo.', { modal: true });
											}
											return result;
										});
								} else {
									window.showErrorMessage('The selected Screen Definition cannot be empty.', { modal: true });
								}
							} else {
								window.showErrorMessage('The selected file must have a Javascript (\'.js\') or Python (\'.py\') file extension for an automation script or (\'.xml\') for a Screen Definition.', { modal: true });
							}
						} else {
							window.showErrorMessage('An Automation Script or Screen Definition must be selected to compare.', { modal: true });
						}
					} else {
						window.showErrorMessage('An Automation Script or Screen Definition must be selected to compare.', { modal: true });
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
					await client.disconnect().catch(() => {
						//do nothing with this
					});
				}
			}
		}
	);


	let disposableDeploy = commands.registerCommand(
		'maximo-script-deploy.deploy',
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
							let deployFileName = document.fileName.substring(0, document.fileName.lastIndexOf('.')) + '-deploy' + document.fileName.substring(document.fileName.lastIndexOf('.'));
							let deployJSONFileName = document.fileName.substring(0, document.fileName.lastIndexOf('.')) + '.json';

							if (fileName.endsWith('.js') || fileName.endsWith('.py')) {
								// Get the document text
								const script = document.getText();
								var scriptDeploy;
								if (fs.existsSync(deployFileName)) {
									scriptDeploy = fs.readFileSync(deployFileName);
								}
								if (script && script.trim().length > 0) {
									await window.withProgress({ cancellable: false, title: 'Script', location: ProgressLocation.Notification },
										async (progress) => {
											progress.report({ message: `Deploying script ${fileName}`, increment: 0 });

											await new Promise(resolve => setTimeout(resolve, 500));
											let result = await client.postScript(script, progress, fileName, scriptDeploy);

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
													if(fs.existsSync(deployJSONFileName)){
														let configDeploy = fs.readFileSync(deployJSONFileName);
														await client.postConfig(configDeploy);
													}

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
							} else if (fileName.endsWith('.xml')) {
								const screen = document.getText();
								if (screen && screen.trim().length > 0) {
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
												parseError = { message: 'Current XML document does not have an root element of "presentation" or "systemlib".' };
											}
										}
									});

									if (parseError) {
										window.showErrorMessage(`Error parsing ${fileName}: ${parseError.message}`, { modal: true });
										return;
									}

									if (!screenName) {
										window.showErrorMessage('Unable to find presentation or systemlib id from current document. Cannot fetch screen from server to compare.', { modal: true });
										return;
									}

									await window.withProgress({ cancellable: false, title: 'Screen', location: ProgressLocation.Notification },
										async (progress) => {
											progress.report({ message: `Deploying screen ${fileName}`, increment: 0 });

											await new Promise(resolve => setTimeout(resolve, 500));
											let result = await client.postScreen(screen, progress, fileName);

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
									window.showErrorMessage('The selected Screen Definition cannot be empty.', { modal: true });
								}
							} else if (fileName.endsWith('.json')) {
								const formText = document.getText();
								if (formText && formText.trim().length > 0) {

									try {
										// test parse
										JSON.parse(formText);
									} catch (error) {
										window.showErrorMessage(`File ${fileName} is not a valid JSON formatted inspection form extract.\n\n${error.message}`, { modal: true });
										return;
									}

									let form = JSON.parse(formText);

									if (typeof form.name === 'undefined' || !form.name) {
										window.showErrorMessage(`File ${fileName} does not have a 'name' attribute and is not a valid inspection form extract.`, { modal: true });
										return;
									}

									await window.withProgress({ cancellable: false, title: 'Inspection Form', location: ProgressLocation.Notification },
										async (progress) => {
											progress.report({ message: `Inspection form ${form.name}`, increment: 0 });

											await new Promise(resolve => setTimeout(resolve, 500));
											let result = await client.postForm(form, progress);

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
													progress.report({ increment: 100, message: `Successfully deployed ${form.name}` });
													await new Promise(resolve => setTimeout(resolve, 2000));
												}
											} else {
												window.showErrorMessage('Did not receive a response from Maximo.', { modal: true });
											}
											return result;
										});
								} else {
									window.showErrorMessage('The selected inspection form cannot be empty.', { modal: true });
								}
							} else {
								window.showErrorMessage('The selected file must have a Javascript (\'.js\') or Python (\'.py\') file extension for an automation script, (\'.xml\') for a screen definition or (\'.json\') for an inspection form.', { modal: true });
							}
						} else {
							window.showErrorMessage('An automation script, screen definition or inspection form must be selected to deploy.', { modal: true });
						}
					} else {
						window.showErrorMessage('An automation script, screen definition or inspection form must be selected to deploy.', { modal: true });
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
					await client.disconnect().catch(() => {
						//do nothing with this
					});
				}
			}
		}
	);

	let disposableExtract = commands.registerCommand(
		'maximo-script-deploy.extract',
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
					});

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

									await asyncForEach(scriptNames, async (scriptName) => {
										if (!cancelToken.isCancellationRequested) {
											progress.report({ increment: percent, message: `Extracting ${scriptName}` });
											let scriptInfo = await client.getScript(scriptName);

											let fileExtension = getExtension(scriptInfo.scriptLanguage);

											let outputFile = extractLoc + '/' + scriptName.toLowerCase() + fileExtension;

											// if the file doesn't exist then just write it out.
											if (!fs.existsSync(outputFile)) {
												fs.writeFileSync(outputFile, scriptInfo.script);
											} else {

												let incomingHash = crypto.createHash('sha256').update(scriptInfo.script).digest('hex');
												let fileHash = crypto.createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex');

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
						window.showErrorMessage('No scripts were found to extract.', { modal: true });
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
					await client.disconnect().catch(() => {
						//do nothing with this
					});
				}
			}
		}
	);

	let disposableExtractOne = commands.registerCommand(
		'maximo-script-deploy.extractOne',
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
					});

					if (typeof scriptNames !== 'undefined' && scriptNames.length > 0) {
						scriptNames.sort();
						await window.showQuickPick(scriptNames, { placeHolder: 'Search for script' }).then(async (scriptName) => {
							if (typeof scriptName !== 'undefined') {
								await window.withProgress({
									title: `Extracting ${scriptName}`,
									location: ProgressLocation.Notification,
									cancellable: true
								}, async (progress, cancelToken) => {

									let scriptInfo = await client.getScript(scriptName);

									let fileExtension = getExtension(scriptInfo.scriptLanguage);

									let outputFile = extractLoc + '/' + scriptName.toLowerCase() + fileExtension;

									// if the file doesn't exist then just write it out.
									if (!fs.existsSync(outputFile)) {
										fs.writeFileSync(outputFile, scriptInfo.script);
									} else {
										let incomingHash = crypto.createHash('sha256').update(scriptInfo.script).digest('hex');
										let fileHash = crypto.createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex');

										if (fileHash !== incomingHash) {
											await window.showInformationMessage(`The script ${scriptName.toLowerCase()}${fileExtension} exists. \nReplace?`, { modal: true }, ...['Replace']).then(async (response) => {
												if (response === 'Replace') {
													fs.writeFileSync(outputFile, scriptInfo.script);
												} else {
													cancelToken.cancel();
												}
											});
										}

									}

									if (!cancelToken.isCancellationRequested) {
										window.showInformationMessage(`Automation script "${scriptName}" extracted.`, { modal: true });
									}
								}
								);
							}
						});

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
					await client.disconnect().catch(() => {
						//do nothing with this
					});
				}
			}
		}
	);


	let disposableExtractScreens = commands.registerCommand(
		'maximo-script-deploy.screens',
		async function () {

			const config = await getMaximoConfig();

			if (!config) {
				return;
			}

			let client;

			try {
				client = new MaximoClient(config);

				if (await login(client)) {
					let extractLoc = config.extractLocationScreens;
					// if the extract location has not been specified use the workspace folder.
					if (typeof extractLoc === 'undefined' || !extractLoc) {
						if (workspace.workspaceFolders !== undefined) {
							extractLoc = workspace.workspaceFolders[0].uri.fsPath;
						} else {
							window.showErrorMessage('A working folder must be selected or an export folder configured before exporting screen definitions.', { modal: true });
							return;
						}
					}

					if (!fs.existsSync(extractLoc)) {
						window.showErrorMessage(`The screen extract folder ${extractLoc} does not exist.`, { modal: true });
						return;
					}

					let screenNames = await window.withProgress({ title: 'Getting screen names', location: ProgressLocation.Notification }, async () => {
						return await client.getAllScreenNames();
					});

					if (typeof screenNames !== 'undefined' && screenNames.length > 0) {

						await window.showInformationMessage('Do you want to extract ' + (screenNames.length > 1 ? 'the ' + screenNames.length + ' screen definitions?' : ' the one screen definition?'), { modal: true }, ...['Yes']).then(async (response) => {
							if (response === 'Yes') {
								await window.withProgress({
									title: 'Extracting Screen Definitions',
									location: ProgressLocation.Notification,
									cancellable: true
								}, async (progress, cancelToken) => {
									let percent = Math.round(((1) / screenNames.length) * 100);

									let overwriteAll = false;
									let overwrite = false;

									await asyncForEach(screenNames, async (screenName) => {
										if (!cancelToken.isCancellationRequested) {
											progress.report({ increment: percent, message: `Extracting ${screenName.toLowerCase()}` });
											let screenInfo = await client.getScreen(screenName);

											let fileExtension = '.xml';

											let outputFile = extractLoc + '/' + screenName.toLowerCase() + fileExtension;
											let xml = format(screenInfo.presentation);
											// if the file doesn't exist then just write it out.
											if (!fs.existsSync(outputFile)) {
												fs.writeFileSync(outputFile, xml);
											} else {

												let incomingHash = crypto.createHash('sha256').update(xml).digest('hex');
												let fileHash = crypto.createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex');

												if (fileHash !== incomingHash) {
													if (!overwriteAll) {
														await window.showInformationMessage(`The screen ${screenName.toLowerCase()}${fileExtension} exists. \nReplace?`, { modal: true }, ...['Replace', 'Replace All', 'Skip']).then(async (response) => {
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
														fs.writeFileSync(outputFile, xml);
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
										window.showInformationMessage('Screen definitions extracted.', { modal: true });
									}
								}
								);
							}
						});

					} else {
						window.showErrorMessage('No screen definitions were found to extract.', { modal: true });
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
					await client.disconnect().catch(() => {
						//do nothing with this
					});
				}
			}
		});

	let disposableExtractScreenOne = commands.registerCommand(
		'maximo-script-deploy.screensOne',
		async function () {

			const config = await getMaximoConfig();

			if (!config) {
				return;
			}

			let client;

			try {
				client = new MaximoClient(config);

				if (await login(client)) {
					let extractLoc = config.extractLocationScreens;
					// if the extract location has not been specified use the workspace folder.
					if (typeof extractLoc === 'undefined' || !extractLoc) {
						if (workspace.workspaceFolders !== undefined) {
							extractLoc = workspace.workspaceFolders[0].uri.fsPath;
						} else {
							window.showErrorMessage('A working folder must be selected or an export folder configured before exporting screen definitions.', { modal: true });
							return;
						}
					}

					if (!fs.existsSync(extractLoc)) {
						window.showErrorMessage(`The screen extract folder ${extractLoc} does not exist.`, { modal: true });
						return;
					}

					let screenNames = await window.withProgress({ title: 'Getting screen names', location: ProgressLocation.Notification }, async () => {
						return await client.getAllScreenNames();
					});

					if (typeof screenNames !== 'undefined' && screenNames.length > 0) {
						screenNames.sort();
						await window.showQuickPick(screenNames, { placeHolder: 'Search for screen' }).then(async (screenName) => {
							if (typeof screenName !== 'undefined') {
								await window.withProgress({
									title: `Extracting Screen ${screenName}`,
									location: ProgressLocation.Notification,
									cancellable: true
								}, async (progress, cancelToken) => {

									let screenInfo = await client.getScreen(screenName);

									let fileExtension = '.xml';

									let outputFile = extractLoc + '/' + screenName.toLowerCase() + fileExtension;
									let xml = format(screenInfo.presentation);
									// if the file doesn't exist then just write it out.
									if (!fs.existsSync(outputFile)) {
										fs.writeFileSync(outputFile, xml);
									} else {

										let incomingHash = crypto.createHash('sha256').update(xml).digest('hex');
										let fileHash = crypto.createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex');

										if (fileHash !== incomingHash) {

											await window.showInformationMessage(`The screen ${screenName.toLowerCase()}${fileExtension} exists. \nReplace?`, { modal: true }, ...['Replace']).then(async (response) => {
												if (response === 'Replace') {
													fs.writeFileSync(outputFile, xml);
												} else {
													cancelToken.cancel();
												}
											});

										}
									}

									if (cancelToken.isCancellationRequested) {
										return;
									} else {
										window.showInformationMessage(`Screen "${screenName}" extracted.`, { modal: true });
									}
								}
								);
							}
						});

					} else {
						window.showErrorMessage('No screen definitions were found to extract.', { modal: true });
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
					await client.disconnect().catch(() => {
						//do nothing with this
					});
				}
			}
		});

	let disposableExtractForms = commands.registerCommand(
		'maximo-script-deploy.forms',
		async function () {

			const config = await getMaximoConfig();

			if (!config) {
				return;
			}

			let client;

			try {
				client = new MaximoClient(config);

				if (await login(client)) {
					let extractLoc = config.extractLocationForms;
					// if the extract location has not been specified use the workspace folder.
					if (typeof extractLoc === 'undefined' || !extractLoc) {
						if (workspace.workspaceFolders !== undefined) {
							extractLoc = workspace.workspaceFolders[0].uri.fsPath;
						} else {
							window.showErrorMessage('A working folder must be selected or an export folder configured before exporting inspection forms.', { modal: true });
							return;
						}
					}

					if (!fs.existsSync(extractLoc)) {
						window.showErrorMessage(`The inspection form extract folder ${extractLoc} does not exist.`, { modal: true });
						return;
					}

					let formNames = await window.withProgress({ title: 'Getting inspection forms', location: ProgressLocation.Notification }, async () => {
						return await client.getAllForms();
					});

					if (typeof formNames !== 'undefined' && formNames.length > 0) {

						await window.showInformationMessage('Do you want to extract ' + (formNames.length > 1 ? 'the ' + formNames.length + ' inspection forms?' : ' the one inspection form?'), { modal: true }, ...['Yes']).then(async (response) => {
							if (response === 'Yes') {
								await window.withProgress({
									title: 'Extracting Inspection Forms',
									location: ProgressLocation.Notification,
									cancellable: true
								}, async (progress, cancelToken) => {
									let percent = Math.round(((1) / formNames.length) * 100);

									let overwriteAll = false;
									let overwrite = false;

									await asyncForEach(formNames, async (form) => {
										if (!cancelToken.isCancellationRequested) {
											progress.report({ increment: percent, message: `Extracting ${form.name.toLowerCase()} (${form.inspformnum})` });
											let formInfo = await client.getForm(form.id);

											let fileExtension = '.json';

											let outputFile = extractLoc + '/' + formInfo.name.toLowerCase().replaceAll(' ', '-').replaceAll('/', '-').replaceAll('\\', '-') + fileExtension;
											let source = JSON.stringify(formInfo, null, 4);
											// if the file doesn't exist then just write it out.
											if (!fs.existsSync(outputFile)) {
												fs.writeFileSync(outputFile, source);
											} else {

												let incomingHash = crypto.createHash('sha256').update(source).digest('hex');
												let fileHash = crypto.createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex');

												if (fileHash !== incomingHash) {
													if (!overwriteAll) {
														await window.showInformationMessage(`The inspection form ${form.name} exists. \nReplace?`, { modal: true }, ...['Replace', 'Replace All', 'Skip']).then(async (response) => {
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
														fs.writeFileSync(outputFile, source);
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
										window.showInformationMessage('Inspection forms extracted.', { modal: true });
									}
								}
								);
							}
						});

					} else {
						window.showErrorMessage('No inspection forms were found to extract.', { modal: true });
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
					await client.disconnect().catch(() => {
						//do nothing with this
					});
				}
			}
		});

	let disposableExtractFormsOne = commands.registerCommand(
		'maximo-script-deploy.formsOne',
		async function () {

			const config = await getMaximoConfig();

			if (!config) {
				return;
			}

			let client;

			try {
				client = new MaximoClient(config);

				if (await login(client)) {
					let extractLoc = config.extractLocationForms;
					// if the extract location has not been specified use the workspace folder.
					if (typeof extractLoc === 'undefined' || !extractLoc) {
						if (workspace.workspaceFolders !== undefined) {
							extractLoc = workspace.workspaceFolders[0].uri.fsPath;
						} else {
							window.showErrorMessage('A working folder must be selected or an export folder configured before exporting inspection forms.', { modal: true });
							return;
						}
					}

					if (!fs.existsSync(extractLoc)) {
						window.showErrorMessage(`The inspection form extract folder ${extractLoc} does not exist.`, { modal: true });
						return;
					}

					let formFullNames = await window.withProgress({ title: 'Getting inspection forms', location: ProgressLocation.Notification }, async () => {
						return await client.getAllForms();
					});

					if (typeof formFullNames !== 'undefined' && formFullNames.length > 0) {
						var formNames = formFullNames.map(x => x.name);
						formNames.sort();
						await window.showQuickPick(formNames, { placeHolder: 'Search for form' }).then(async (formName) => {
							if (typeof formName !== 'undefined') {
								var form = formFullNames.find(x => x.name == formName);

								await window.withProgress({
									title: `Extracting Inspection Form ${formName}`,
									location: ProgressLocation.Notification,
									cancellable: true
								}, async (progress, cancelToken) => {
									let formInfo = await client.getForm(form.id);

									let fileExtension = '.json';

									let outputFile = extractLoc + '/' + formInfo.name.toLowerCase().replaceAll(' ', '-').replaceAll('/', '-').replaceAll('\\', '-') + fileExtension;
									let source = JSON.stringify(formInfo, null, 4);
									// if the file doesn't exist then just write it out.
									if (!fs.existsSync(outputFile)) {
										fs.writeFileSync(outputFile, source);
									} else {

										let incomingHash = crypto.createHash('sha256').update(source).digest('hex');
										let fileHash = crypto.createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex');

										if (fileHash !== incomingHash) {

											await window.showInformationMessage(`The inspection form ${form.name} exists. \nReplace?`, { modal: true }, ...['Replace']).then(async (response) => {
												if (response === 'Replace') {
													fs.writeFileSync(outputFile, source);
												} else {
													cancelToken.cancel();
												}
											});


										}
									}

									if (cancelToken.isCancellationRequested) {
										return;
									} else {
										window.showInformationMessage(`Inspection form "${formName}" extracted.`, { modal: true });
									}
								}
								);
							}
						});

					} else {
						window.showErrorMessage('No inspection forms were found to extract.', { modal: true });
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
					await client.disconnect().catch(() => {
						//do nothing with this
					});
				}
			}
		});


	context.subscriptions.push(disposableDeploy, disposableExtract, disposableCompare, disposableExtractScreens, disposableExtractScreenOne, disposableInsert, disposableExtractForms, disposableExtractOne, disposableExtractFormsOne);

}

async function toggleLog() {

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
						let logFolder = path.dirname(logFilePath);
						if (!fs.existsSync(logFolder)) {
							window.showErrorMessage(`The log file folder ${logFolder} does not exist.`, { modal: true });
							return;
						}
					}
				} else {
					logFilePath = temp.path({ suffix: '.log', defaultPrefix: 'maximo' });
				}

				// eslint-disable-next-line no-undef
				const logFile = isAbsolute ? path.resolve(logFilePath) : path.resolve(__dirname, logFilePath);

				currentLogPath = logFile;

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
						window.showTextDocument(doc, { preview: true }).then(function (editor) {
							if (this.follow) {
								let lineCount = editor.document.lineCount;
								editor.revealRange(new Range(lineCount, 0, lineCount, 0), TextEditorRevealType.Default);
							}
						}.bind(logConfig));
					});

					if (logConfig.follow) {
						currentFollow = workspace.onDidChangeTextDocument((e) => {
							let document = e.document;

							// if the file changing is the current log file then scroll
							if (currentWindow && document.fileName == currentLogPath) {
								const editor = currentWindow.visibleTextEditors.find(
									(editor) => editor.document === document
								);
								if (editor) {
									editor.revealRange(new Range(document.lineCount, 0, document.lineCount, 0), TextEditorRevealType.Default);
								}
							}
						});
					} else {
						if (currentFollow) {
							currentFollow.dispose();
						}
					}
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
		statusBar.text = '$(sync~spin) Maximo Log';
	} else {
		statusBar.text = '$(book) Maximo Log';
	}
}

function _onConfigurationChange(e) {
	if (this) {
		if (e.affectsConfiguration('sharptree.maximo.logging.follow')) {
			if (currentFollow) {
				currentFollow.dispose();
			}

			if (this.getConfiguration('sharptree').get('maximo.logging.follow')) {
				currentFollow = this.onDidChangeTextDocument((e) => {
					let document = e.document;

					// if the file changing is the current log file then scroll
					if (currentWindow && document.fileName == currentLogPath) {
						const editor = currentWindow.visibleTextEditors.find(
							(editor) => editor.document === document
						);
						if (editor) {
							editor.revealRange(new Range(document.lineCount, 0, document.lineCount, 0), TextEditorRevealType.Default);
						}
					}
				});
			}
		}
	}

}

function formatXML(sourceXml) {
	var xmlDoc = new DOMParser().parseFromString(sourceXml, 'application/xml');
	var xsltDoc = new DOMParser().parseFromString([
		// describes how we want to modify the XML - indent everything
		'<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
		'  <xsl:strip-space elements="*"/>',
		'  <xsl:template match="para[content-style][not(text())]">', // change to just text() to strip space in text nodes
		'    <xsl:value-of select="normalize-space(.)"/>',
		'  </xsl:template>',
		'  <xsl:template match="node()|@*">',
		'    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
		'  </xsl:template>',
		'  <xsl:output indent="yes"/>',
		'</xsl:stylesheet>',
	].join('\n'), 'application/xml');

	var xsltProcessor = new XSLTProcessor();
	xsltProcessor.importStylesheet(xsltDoc);
	var resultDoc = xsltProcessor.transformToDocument(xmlDoc);
	var resultXml = new XMLSerializer().serializeToString(resultDoc);
	return resultXml;
}

async function getMaximoConfig() {

	try {
		let localConfig = await getLocalConfig();
		if (!localConfig) {
			localConfig = {};
		}

		let settings = workspace.getConfiguration('sharptree');

		let host = localConfig.host ?? settings.get('maximo.host');
		let userName = localConfig.username ?? settings.get('maximo.user');
		let useSSL = typeof localConfig.useSSL !== 'undefined' ? localConfig.useSSL : settings.get('maximo.useSSL');
		let port = localConfig.port ?? settings.get('maximo.port');
		let apiKey = localConfig.apiKey ?? settings.get('maximo.apiKey');

		let allowUntrustedCerts = typeof localConfig.allowUntrustedCerts !== 'undefined' ? localConfig.allowUntrustedCerts : settings.get('maximo.allowUntrustedCerts');
		let maximoContext = localConfig.context ?? settings.get('maximo.context');
		let timeout = localConfig.timeout ?? settings.get('maximo.timeout');
		let ca = localConfig.ca ?? settings.get('maximo.customCA');
		let maxauthOnly = typeof localConfig.maxauthOnly !== 'undefined' ? localConfig.maxauthOnly : settings.get('maximo.maxauthOnly');
		let extractLocation = localConfig.extractLocation ?? settings.get('maximo.extractLocation');
		let extractLocationScreens = localConfig.extractLocationScreens ?? settings.get('maximo.extractScreenLocation');
		let extractLocationForms = localConfig.extractLocationForms ?? settings.get('maximo.extractInspectionFormsLocation');

		// make sure we have all the settings.
		if (!validateSettings({ host: host, username: userName, port: port, apiKey: apiKey })) {
			return;
		}

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

		if (typeof localConfig.password !== 'undefined') {
			password = localConfig.password;
			apiKey = localConfig.apiKey;
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
			extractLocationScreens: extractLocationScreens,
			extractLocationForms: extractLocationForms
		});
	} catch (error) {
		if (error.reason == 'WRONG_FINAL_BLOCK_LENGTH') {
			window.showErrorMessage('An error occurred decrypting the password or API Key from the .devtools-config.json file.', { modal: true });
		} else {
			window.showErrorMessage(error.message, { modal: true });
		}

		return;
	}
}

async function getLocalConfig() {

	if (workspace.workspaceFolders !== undefined) {
		let workspaceConfigPath = workspace.workspaceFolders[0].uri.fsPath + path.sep + '.devtools-config.json';
		if (fs.existsSync(workspaceConfigPath)) {
			let localConfig = new LocalConfiguration(workspaceConfigPath, secretStorage);
			if (localConfig.configAvailable) {
				await localConfig.encryptIfRequired();
				return await localConfig.config;
			}
		}
	}
	return {};
}

function getLoggingConfig() {
	let settings = workspace.getConfiguration('sharptree');
	let outputFile = settings.get('maximo.logging.outputFile');
	let openEditorOnStart = settings.get('maximo.logging.openEditorOnStart');
	let append = settings.get('maximo.logging.append');
	let timeout = settings.get('maximo.logging.timeout');
	let follow = settings.get('maximo.logging.follow');

	return {
		'outputFile': outputFile,
		'openOnStart': openEditorOnStart,
		'append': append,
		'timeout': timeout,
		'follow': follow,
	};
}

async function login(client) {
	let logInSuccessful = await client.connect().then(() => {
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
		} else if (typeof error.code !== 'undefined' && error.code == 'ECONNRESET') {
			window.showErrorMessage(error.message, { modal: true });
		} else if (error.message.includes('ECONNREFUSED')) {
			window.showErrorMessage('Connection refused to host ' + client.config.host + ' on port ' + client.config.port, { modal: true });
		} else if (error.message.includes('EPROTO')) {
			window.showErrorMessage('Connection refused to host ' + client.config.host + ' on port ' + client.config.port + ' because of an SSL connection error.\nAre you sure your server is using SSL or did you specify a non-SSL port?.', { modal: true });
		} else if (error.isAxiosError && error.response && error.response.status && error.response.status == 401) {
			window.showErrorMessage('User name and password combination are not valid. Try again.', { modal: true });
		} else if (client.config.apiKey && error.response.status == 400) {
			window.showErrorMessage('The provided API Key is invalid. Try again.', { modal: true });
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
		window.showErrorMessage('Could not determine the Maximo version. Only Maximo 7.6.0.8 and greater are supported', { modal: true });
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
	currentWindow = undefined;
	currentLogPath = undefined;

}

export default {
	activate,
	deactivate,
};
