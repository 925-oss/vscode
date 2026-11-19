import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

/** Folders that never hold anything worth detecting. */
export const excludedFoldersGlob = '**/{node_modules,dist,coverage,.git,.nx,.angular,.build,tmp}/**';

let outputChannel: vscode.LogOutputChannel | undefined;

/**
 * The shared log for every Dev Tools feature.
 */
export function log(): vscode.LogOutputChannel {
	outputChannel ??= vscode.window.createOutputChannel(vscode.l10n.t("Dev Tools"), { log: true });
	return outputChannel;
}

/**
 * Options for {@link run}.
 */
export interface RunOptions {
	readonly cwd?: string;
	/** Added to the extension host's environment. */
	readonly env?: Record<string, string>;
	readonly timeout?: number;
	/** Written to the process's standard input. */
	readonly input?: string;
	readonly token?: vscode.CancellationToken;
}

/**
 * A command that could not be started or exited with an error.
 */
export class ProcessError extends Error {
	constructor(message: string, readonly code: number | string | undefined, readonly stdout: string) {
		super(message);
	}

	/** True when the executable itself is missing. */
	get isNotFound(): boolean {
		return this.code === 'ENOENT';
	}
}

/**
 * Runs a command without a shell and returns its standard output.
 */
export function run(command: string, args: readonly string[], options: RunOptions = {}): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = cp.execFile(command, args, {
			cwd: options.cwd,
			env: options.env ? { ...process.env, ...options.env } : undefined,
			timeout: options.timeout ?? 30_000,
			maxBuffer: 64 * 1024 * 1024,
		}, (error, stdout, stderr) => {
			subscription?.dispose();
			if (error) {
				reject(new ProcessError(stderr.trim() || stdout.trim() || error.message, error.code ?? undefined, stdout));
			} else {
				resolve(stdout);
			}
		});
		const subscription = options.token?.onCancellationRequested(() => child.kill());
		child.stdin?.end(options.input);
	});
}

/**
 * Runs a command and parses its standard output as JSON.
 */
export async function runJson<T>(command: string, args: readonly string[], options?: RunOptions): Promise<T> {
	return JSON.parse(await run(command, args, options)) as T;
}

const availableCommands = new Map<string, Promise<boolean>>();

/**
 * Whether a command-line tool can be started. The answer is cached for the session.
 */
export function isAvailable(command: string, versionArgs: readonly string[] = ['--version']): Promise<boolean> {
	let available = availableCommands.get(command);
	if (!available) {
		available = run(command, versionArgs, { timeout: 15_000 }).then(() => true, error => {
			log().info(`${command} is not available: ${error}`);
			return false;
		});
		availableCommands.set(command, available);
	}
	return available;
}

/**
 * Shows an error for a failed command, with a button that opens the log.
 */
export async function showError(message: string, error: unknown): Promise<void> {
	log().error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
	const openLog = vscode.l10n.t("Show Log");
	if (await vscode.window.showErrorMessage(`${message} ${error instanceof Error ? error.message.split('\n')[0] : ''}`, openLog) === openLog) {
		log().show();
	}
}

/**
 * Returns the workspace folder an editor belongs to, the only workspace folder, or asks.
 */
export async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file') ?? [];
	const active = vscode.window.activeTextEditor?.document.uri;
	const activeFolder = active && vscode.workspace.getWorkspaceFolder(active);
	if (activeFolder) {
		return activeFolder;
	}
	if (folders.length <= 1) {
		return folders[0];
	}
	return vscode.window.showWorkspaceFolderPick();
}

/**
 * The path of a file relative to its workspace folder, with forward slashes.
 */
export function relativePath(folder: vscode.WorkspaceFolder, file: vscode.Uri): string {
	return path.relative(folder.uri.fsPath, file.fsPath).split(path.sep).join('/');
}

/**
 * Walks up from `start` to `stop` (inclusive) and returns the first directory for which `test` is true.
 */
export async function findUp(start: string, stop: string, test: (directory: string) => Promise<boolean>): Promise<string | undefined> {
	let directory = start;
	while (true) {
		if (await test(directory)) {
			return directory;
		}
		const parent = path.dirname(directory);
		if (directory === stop || parent === directory || !directory.startsWith(stop)) {
			return undefined;
		}
		directory = parent;
	}
}

/**
 * Whether a file or folder exists.
 */
export async function exists(file: string): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(vscode.Uri.file(file));
		return true;
	} catch {
		return false;
	}
}

/**
 * Reads a UTF-8 file.
 */
export async function readText(file: vscode.Uri): Promise<string> {
	return new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
}

/**
 * Creates a status bar item that is hidden until it has something to show.
 */
export function createStatusBarItem(id: string, name: string, priority: number): vscode.StatusBarItem {
	const item = vscode.window.createStatusBarItem(id, vscode.StatusBarAlignment.Left, priority);
	item.name = name;
	return item;
}

/**
 * Watches a file outside the workspace, such as `~/.kube/config`, and calls `onChange` when it changes.
 */
export function watchFile(file: string, onChange: () => void): vscode.Disposable {
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)));
	watcher.onDidChange(onChange);
	watcher.onDidCreate(onChange);
	watcher.onDidDelete(onChange);
	return watcher;
}

/**
 * An action offered for the file in the active editor.
 */
export interface FileAction {
	readonly label: string;
	readonly command: string;
}

/**
 * Shows a status bar item while the active editor holds a matching file. Clicking it offers the actions for that
 * file. Quenchlight hides editor title actions and CodeLens, so this is where per-file actions live.
 */
export function registerFileActions(id: string, name: string, text: string, matches: (document: vscode.TextDocument) => boolean, actions: readonly FileAction[]): vscode.Disposable {
	const item = createStatusBarItem(id, name, 15);
	const showCommand = `${id}.showActions`;
	const update = () => {
		const document = vscode.window.activeTextEditor?.document;
		if (document && document.uri.scheme === 'file' && matches(document)) {
			item.text = text;
			item.tooltip = name;
			item.command = { title: name, command: showCommand, arguments: [document.uri] };
			item.show();
		} else {
			item.hide();
		}
	};
	const disposables = [
		item,
		vscode.window.onDidChangeActiveTextEditor(update),
		vscode.commands.registerCommand(showCommand, async (file: vscode.Uri) => {
			const picked = await vscode.window.showQuickPick(actions, { placeHolder: path.basename(file.fsPath) });
			if (picked) {
				await vscode.commands.executeCommand(picked.command, file);
			}
		}),
	];
	update();
	return vscode.Disposable.from(...disposables);
}
