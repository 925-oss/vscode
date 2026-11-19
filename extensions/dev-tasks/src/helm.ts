/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { excludedFoldersGlob, log, pickWorkspaceFolder, readText, relativePath, run, showError } from './common';

type HelmCommand = 'lint' | 'template' | 'dependency-update';

/**
 * A `helm` task as it appears in tasks.json.
 */
interface HelmTaskDefinition extends vscode.TaskDefinition {
	readonly type: 'helm';
	/** The chart folder, relative to the workspace folder. */
	readonly chart: string;
	readonly command: HelmCommand;
}

/**
 * A chart found in a workspace folder.
 */
interface Chart {
	readonly folder: vscode.WorkspaceFolder;
	/** Absolute path of the chart folder. */
	readonly directory: string;
	readonly name: string;
	readonly hasDependencies: boolean;
}

function isAutoDetectEnabled(folder: vscode.WorkspaceFolder): boolean {
	return vscode.workspace.getConfiguration('devTools.helm', folder.uri).get<'on' | 'off'>('autoDetect') === 'on';
}

/**
 * Finds the charts of a workspace folder, leaving out subcharts that live inside another chart.
 */
async function findCharts(folder: vscode.WorkspaceFolder): Promise<Chart[]> {
	const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/Chart.yaml'), excludedFoldersGlob, 200);
	const directories = files.map(file => path.dirname(file.fsPath));
	const topLevel = files.filter(file => {
		const directory = path.dirname(file.fsPath);
		return !directories.some(other => other !== directory && directory.startsWith(other + path.sep));
	});
	const charts: Chart[] = [];
	for (const file of topLevel) {
		const text = await readText(file);
		const name = /^name:\s*["']?(?<name>[^"'\s#]+)/m.exec(text)?.groups?.name ?? path.basename(path.dirname(file.fsPath));
		charts.push({ folder, directory: path.dirname(file.fsPath), name, hasDependencies: /^dependencies:/m.test(text) });
	}
	return charts.sort((a, b) => a.directory.localeCompare(b.directory));
}

function helmArguments(definition: HelmTaskDefinition, chartName: string): string[] {
	switch (definition.command) {
		case 'lint': return ['lint', '.'];
		case 'template': return ['template', chartName, '.', '--debug'];
		case 'dependency-update': return ['dependency', 'update', '.'];
	}
}

function createTask(folder: vscode.WorkspaceFolder, definition: HelmTaskDefinition, chartName: string): vscode.Task {
	const args = helmArguments(definition, chartName);
	const cwd = path.join(folder.uri.fsPath, definition.chart);
	const task = new vscode.Task(definition, folder, `${definition.command.replace('-', ' ')} ${chartName}`, 'helm', new vscode.ShellExecution('helm', args, { cwd }), []);
	task.detail = `helm ${args.join(' ')} (${definition.chart})`;
	task.presentationOptions = { panel: vscode.TaskPanelKind.Shared, clear: true };
	return task;
}

/**
 * Provides `helm` tasks for every chart in the workspace.
 */
class HelmTaskProvider implements vscode.TaskProvider {

	async provideTasks(): Promise<vscode.Task[]> {
		const tasks: vscode.Task[] = [];
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			if (folder.uri.scheme !== 'file' || !isAutoDetectEnabled(folder)) {
				continue;
			}
			try {
				for (const chart of await findCharts(folder)) {
					const chartPath = relativePath(folder, vscode.Uri.file(chart.directory));
					const commands: HelmCommand[] = chart.hasDependencies ? ['lint', 'template', 'dependency-update'] : ['lint', 'template'];
					for (const command of commands) {
						tasks.push(createTask(folder, { type: 'helm', chart: chartPath, command }, chart.name));
					}
				}
			} catch (error) {
				log().error(`Detecting Helm charts in ${folder.name} failed: ${error}`);
			}
		}
		return tasks;
	}

	resolveTask(task: vscode.Task): vscode.Task | undefined {
		const definition = task.definition as HelmTaskDefinition;
		if (typeof definition.chart !== 'string' || !task.scope || typeof task.scope === 'number') {
			return undefined;
		}
		return createTask(task.scope, definition, path.basename(definition.chart));
	}
}

/**
 * Asks for a chart and values files, renders the chart with `helm template` and opens the result.
 */
async function renderChart(): Promise<void> {
	const folder = await pickWorkspaceFolder();
	if (!folder) {
		return;
	}
	const charts = await findCharts(folder);
	if (charts.length === 0) {
		vscode.window.showInformationMessage(vscode.l10n.t("No Helm charts found in {0}.", folder.name));
		return;
	}
	const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
	const activeChart = activeFile && charts.find(chart => activeFile.startsWith(chart.directory + path.sep));
	const chart = activeChart || (charts.length === 1 ? charts[0] : (await vscode.window.showQuickPick(charts.map(chart => ({ label: chart.name, description: relativePath(folder, vscode.Uri.file(chart.directory)), chart })), { placeHolder: vscode.l10n.t("Select a chart to render") }))?.chart);
	if (!chart) {
		return;
	}

	const valuesFiles = (await vscode.workspace.findFiles(new vscode.RelativePattern(chart.directory, '{values*.yaml,values*.yml,values/**/*.yaml,ci/*.yaml}'), undefined, 100))
		.map(file => path.relative(chart.directory, file.fsPath))
		.filter(file => file !== 'values.yaml')
		.sort();
	let selectedValues: string[] = [];
	if (valuesFiles.length > 0) {
		const picked = await vscode.window.showQuickPick(valuesFiles.map(file => ({ label: file })), { canPickMany: true, placeHolder: vscode.l10n.t("Select extra values files (values.yaml is always used)") });
		if (!picked) {
			return;
		}
		selectedValues = picked.map(item => item.label);
	}

	const args = ['template', chart.name, '.', ...selectedValues.flatMap(file => ['-f', file])];
	try {
		const output = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Rendering {0}", chart.name), cancellable: true }, (_progress, token) => run('helm', args, { cwd: chart.directory, token }));
		const document = await vscode.workspace.openTextDocument({ language: 'yaml', content: `# helm ${args.join(' ')}\n${output}` });
		await vscode.window.showTextDocument(document, { preview: true });
	} catch (error) {
		await showError(vscode.l10n.t("Rendering {0} failed.", chart.name), error);
	}
}

/**
 * Registers the `helm` task provider and commands.
 */
export function registerHelm(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.tasks.registerTaskProvider('helm', new HelmTaskProvider()),
		vscode.commands.registerCommand('devTools.helm.render', renderChart),
	);
}
