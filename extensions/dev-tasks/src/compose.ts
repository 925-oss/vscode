import * as path from 'path';
import * as vscode from 'vscode';
import { excludedFoldersGlob, log, readText, relativePath, run } from './common';

const composeFileGlob = '**/{compose,docker-compose}*.{yml,yaml}';
const maxComposeFiles = 20;
const listServicesTimeoutMs = 10_000;

type ComposeCommand = 'up' | 'down' | 'restart' | 'logs' | 'ps' | 'pull' | 'build';

/**
 * A `compose` task as it appears in tasks.json.
 */
interface ComposeTaskDefinition extends vscode.TaskDefinition {
	readonly type: 'compose';
	/** The Compose file, relative to the workspace folder. */
	readonly file: string;
	readonly command: ComposeCommand;
	readonly service?: string;
	readonly args?: string[];
}

/** Arguments each command gets before the user's own arguments. */
const commandArguments: Record<ComposeCommand, string[]> = {
	up: ['up', '--detach'],
	down: ['down'],
	restart: ['restart'],
	logs: ['logs', '--follow', '--tail', '200'],
	ps: ['ps'],
	pull: ['pull'],
	build: ['build'],
};

/** Commands offered for the whole file, and for each service in it. */
const fileCommands: ComposeCommand[] = ['up', 'down', 'ps', 'logs', 'pull'];
const serviceCommands: ComposeCommand[] = ['up', 'restart', 'logs'];

function isAutoDetectEnabled(folder: vscode.WorkspaceFolder): boolean {
	return vscode.workspace.getConfiguration('compose', folder.uri).get<'on' | 'off'>('autoDetect') === 'on';
}

/**
 * Reads service names from the top-level `services:` block of a Compose file.
 * Used when the Docker CLI is not available to resolve the file for us.
 */
function parseServiceNames(text: string): string[] {
	const services: string[] = [];
	let inServices = false;
	let serviceIndent: number | undefined;
	for (const line of text.split(/\r?\n/)) {
		if (/^\S/.test(line)) {
			inServices = /^services:\s*(#.*)?$/.test(line);
			serviceIndent = undefined;
			continue;
		}
		if (!inServices) {
			continue;
		}
		const match = /^(?<indent>[ \t]+)(?<name>[A-Za-z0-9._-]+):\s*(#.*)?$/.exec(line);
		if (match?.groups) {
			const indent = match.groups.indent.length;
			serviceIndent ??= indent;
			if (indent === serviceIndent) {
				services.push(match.groups.name);
			}
		}
	}
	return services;
}

async function listServicesWithDocker(composeFile: string): Promise<string[]> {
	const stdout = await run('docker', ['compose', '-f', composeFile, 'config', '--services'], { cwd: path.dirname(composeFile), timeout: listServicesTimeoutMs });
	return stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
}

async function listServices(composeFile: vscode.Uri): Promise<string[]> {
	try {
		return await listServicesWithDocker(composeFile.fsPath);
	} catch (error) {
		log().warn(`Could not list services with \`docker compose config\` for ${composeFile.fsPath}, reading the file instead: ${error}`);
		return parseServiceNames(await readText(composeFile));
	}
}

function createTask(folder: vscode.WorkspaceFolder, definition: ComposeTaskDefinition, name: string): vscode.Task {
	const args = ['compose', '-f', definition.file, ...commandArguments[definition.command], ...(definition.args ?? [])];
	if (definition.service) {
		args.push(definition.service);
	}
	const task = new vscode.Task(definition, folder, name, 'compose', new vscode.ShellExecution('docker', args, { cwd: folder.uri.fsPath }), []);
	task.detail = `docker ${args.join(' ')}`;
	if (definition.command === 'logs') {
		task.isBackground = true;
		task.presentationOptions = { panel: vscode.TaskPanelKind.Dedicated };
	} else {
		task.presentationOptions = { panel: vscode.TaskPanelKind.Shared, clear: true };
	}
	return task;
}

/**
 * Detects Compose tasks for one workspace folder and caches them until a Compose file changes.
 */
class FolderDetector implements vscode.Disposable {

	private readonly watcher: vscode.FileSystemWatcher;
	private tasks: Promise<vscode.Task[]> | undefined;

	constructor(readonly folder: vscode.WorkspaceFolder) {
		this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, composeFileGlob));
		const invalidate = () => this.tasks = undefined;
		this.watcher.onDidCreate(invalidate);
		this.watcher.onDidChange(invalidate);
		this.watcher.onDidDelete(invalidate);
	}

	getTasks(): Promise<vscode.Task[]> {
		if (!isAutoDetectEnabled(this.folder)) {
			return Promise.resolve([]);
		}
		this.tasks ??= this.computeTasks();
		return this.tasks;
	}

	private async computeTasks(): Promise<vscode.Task[]> {
		const composeFiles = await findComposeFiles(this.folder);
		const nameWithFile = composeFiles.length > 1;

		const tasks: vscode.Task[] = [];
		for (const composeFile of composeFiles) {
			const file = relativePath(this.folder, composeFile);
			const prefix = nameWithFile ? `${file}: ` : '';
			for (const command of fileCommands) {
				tasks.push(createTask(this.folder, { type: 'compose', file, command }, `${prefix}${command}`));
			}
			for (const service of await listServices(composeFile)) {
				for (const command of serviceCommands) {
					tasks.push(createTask(this.folder, { type: 'compose', file, command, service }, `${prefix}${command} ${service}`));
				}
			}
		}
		return tasks;
	}

	dispose(): void {
		this.watcher.dispose();
		this.tasks = undefined;
	}
}

/**
 * Finds the Compose files of a workspace folder, sorted by path.
 */
export async function findComposeFiles(folder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
	const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, composeFileGlob), excludedFoldersGlob, maxComposeFiles);
	return files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}

/**
 * Provides `compose` tasks for every trusted workspace folder.
 */
class ComposeTaskProvider implements vscode.TaskProvider, vscode.Disposable {

	private readonly detectors = new Map<string, FolderDetector>();
	private readonly disposables: vscode.Disposable[] = [];

	constructor() {
		this.addFolders(vscode.workspace.workspaceFolders ?? []);
		this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(event => {
			for (const folder of event.removed) {
				this.detectors.get(folder.uri.toString())?.dispose();
				this.detectors.delete(folder.uri.toString());
			}
			this.addFolders(event.added);
		}));
	}

	private addFolders(folders: readonly vscode.WorkspaceFolder[]): void {
		for (const folder of folders) {
			if (folder.uri.scheme === 'file' && !this.detectors.has(folder.uri.toString())) {
				this.detectors.set(folder.uri.toString(), new FolderDetector(folder));
			}
		}
	}

	async provideTasks(): Promise<vscode.Task[]> {
		const results = await Promise.all([...this.detectors.values()].map(detector => detector.getTasks().catch(error => {
			log().error(`Detecting Compose tasks for folder ${detector.folder.name} failed: ${error}`);
			return [];
		})));
		return results.flat();
	}

	resolveTask(task: vscode.Task): vscode.Task | undefined {
		const definition = task.definition as ComposeTaskDefinition;
		if (!definition.file || !commandArguments[definition.command] || !task.scope || typeof task.scope === 'number') {
			return undefined;
		}
		return createTask(task.scope, definition, task.name);
	}

	dispose(): void {
		for (const detector of this.detectors.values()) {
			detector.dispose();
		}
		this.detectors.clear();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}

/**
 * Registers the `compose` task provider.
 */
export function registerCompose(context: vscode.ExtensionContext): void {
	const provider = new ComposeTaskProvider();
	context.subscriptions.push(provider, vscode.tasks.registerTaskProvider('compose', provider));
}
