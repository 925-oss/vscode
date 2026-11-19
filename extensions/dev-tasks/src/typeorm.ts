import * as path from 'path';
import * as vscode from 'vscode';
import { excludedFoldersGlob, exists, findUp, log, pickWorkspaceFolder, readText, registerFileActions, relativePath } from './common';

type MigrationCommand = 'show' | 'run' | 'revert' | 'generate';
const migrationCommands: MigrationCommand[] = ['show', 'run', 'revert', 'generate'];

/**
 * A `typeorm` task as it appears in tasks.json.
 */
interface TypeOrmTaskDefinition extends vscode.TaskDefinition {
	readonly type: 'typeorm';
	/** The project folder, relative to the workspace folder. */
	readonly project: string;
	readonly command: MigrationCommand;
	/** The migration name, for `generate`. */
	readonly name?: string;
}

/** How one migration command of a project is run. */
type Runner =
	| { readonly kind: 'nx'; readonly project: string; readonly target: string; readonly takesName: boolean }
	| { readonly kind: 'script'; readonly script: string; readonly cwd: string }
	| { readonly kind: 'cli'; readonly dataSource: string };

/**
 * A project with TypeORM migrations, and how to run each command for it.
 */
interface MigrationProject {
	readonly folder: vscode.WorkspaceFolder;
	readonly name: string;
	/** Absolute path of the project folder. */
	readonly root: string;
	readonly runners: Map<MigrationCommand, Runner>;
}

const targetPatterns: Record<MigrationCommand, RegExp> = {
	run: /^(db:)?(migrate|migrations?[:-]?(run|up))$/i,
	revert: /^(db:)?migrat(e|ions?)[:-]?(revert|down|rollback)$/i,
	generate: /^(db:)?migrat(e|ions?)[:-]?(generate|gen|create)$/i,
	show: /^(db:)?migrat(e|ions?)[:-]?(show|status)$/i,
};

function commandFor(name: string): MigrationCommand | undefined {
	return migrationCommands.find(command => targetPatterns[command].test(name));
}

interface ProjectJson {
	readonly name?: string;
	readonly targets?: Record<string, { readonly options?: { readonly command?: string; readonly commands?: (string | { readonly command: string })[] } }>;
}

interface PackageJson {
	readonly name?: string;
	readonly scripts?: Record<string, string>;
}

async function readJson<T>(file: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readText(vscode.Uri.file(file))) as T;
	} catch {
		return undefined;
	}
}

/**
 * Finds migration projects from DataSource files and from `migration:*` package scripts.
 */
async function findProjects(folder: vscode.WorkspaceFolder): Promise<MigrationProject[]> {
	const config = vscode.workspace.getConfiguration('devTools.typeorm', folder.uri);
	if (config.get<'on' | 'off'>('autoDetect') !== 'on') {
		return [];
	}
	const projects = new Map<string, MigrationProject>();
	const root = folder.uri.fsPath;

	const candidates = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, config.get<string>('dataSourceFiles')!), excludedFoldersGlob, 100);
	for (const file of candidates) {
		if (/\.(spec|test)\.ts$/.test(file.fsPath) || !/\bnew\s+DataSource\s*\(/.test(await readText(file))) {
			continue;
		}
		const projectRoot = await findUp(path.dirname(file.fsPath), root, directory => exists(path.join(directory, 'project.json')).then(found => found || exists(path.join(directory, 'package.json')))) ?? root;
		if (projects.has(projectRoot)) {
			continue;
		}
		const projectJson = await readJson<ProjectJson>(path.join(projectRoot, 'project.json'));
		const packageJson = await readJson<PackageJson>(path.join(projectRoot, 'package.json'));
		const name = projectJson?.name ?? packageJson?.name ?? path.basename(projectRoot);
		const runners = new Map<MigrationCommand, Runner>();

		for (const [target, definition] of Object.entries(projectJson?.targets ?? {})) {
			const command = commandFor(target);
			if (command && !runners.has(command)) {
				const commandLines = [definition.options?.command, ...(definition.options?.commands ?? []).map(entry => typeof entry === 'string' ? entry : entry.command)];
				runners.set(command, { kind: 'nx', project: name, target, takesName: commandLines.some(line => line?.includes('{args.name}')) });
			}
		}
		for (const [script] of Object.entries(packageJson?.scripts ?? {})) {
			const command = commandFor(script);
			if (command && !runners.has(command)) {
				runners.set(command, { kind: 'script', script, cwd: projectRoot });
			}
		}
		const dataSource = path.relative(projectRoot, file.fsPath);
		for (const command of migrationCommands) {
			if (!runners.has(command)) {
				runners.set(command, { kind: 'cli', dataSource });
			}
		}
		projects.set(projectRoot, { folder, name, root: projectRoot, runners });
	}

	// Repositories with their own migration runner only have package scripts, such as `migration:run`.
	if (!projects.has(root)) {
		const runners = new Map<MigrationCommand, Runner>();
		for (const [script] of Object.entries((await readJson<PackageJson>(path.join(root, 'package.json')))?.scripts ?? {})) {
			const command = commandFor(script);
			if (command && !runners.has(command)) {
				runners.set(command, { kind: 'script', script, cwd: root });
			}
		}
		if (runners.size > 0) {
			projects.set(root, { folder, name: folder.name, root, runners });
		}
	}
	return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The command that starts the workspace's package manager, from its lock file.
 */
async function packageManager(folder: vscode.WorkspaceFolder): Promise<{ readonly run: string[]; readonly exec: string[] }> {
	const root = folder.uri.fsPath;
	if (await exists(path.join(root, 'pnpm-lock.yaml'))) {
		return { run: ['pnpm', 'run'], exec: ['pnpm', 'exec'] };
	}
	if (await exists(path.join(root, 'bun.lock')) || await exists(path.join(root, 'bun.lockb'))) {
		return { run: ['bun', 'run'], exec: ['bunx'] };
	}
	if (await exists(path.join(root, 'yarn.lock'))) {
		return { run: ['yarn', 'run'], exec: ['yarn'] };
	}
	return { run: ['npm', 'run'], exec: ['npx'] };
}

async function findMigrationsFolder(projectRoot: string): Promise<string> {
	const [migration] = await vscode.workspace.findFiles(new vscode.RelativePattern(projectRoot, '**/migrations/*.ts'), excludedFoldersGlob, 1);
	return migration ? path.relative(projectRoot, path.dirname(migration.fsPath)) : path.join('src', 'migrations');
}

async function createExecution(project: MigrationProject, command: MigrationCommand, name: string | undefined): Promise<{ readonly execution: vscode.ShellExecution; readonly detail: string }> {
	const runner = project.runners.get(command);
	const workspaceRoot = project.folder.uri.fsPath;
	if (!runner) {
		throw new Error(vscode.l10n.t("{0} has no way to run migration:{1}.", project.name, command));
	}
	const manager = await packageManager(project.folder);

	if (runner.kind === 'nx') {
		const [executable, ...args] = [...manager.exec, 'nx', 'run', `${runner.project}:${runner.target}`, ...(runner.takesName && name ? [`--name=${name}`] : [])];
		return { execution: new vscode.ShellExecution(executable, args, { cwd: workspaceRoot }), detail: `${executable} ${args.join(' ')}` };
	}
	if (runner.kind === 'script') {
		const [executable, ...args] = [...manager.run, runner.script];
		return { execution: new vscode.ShellExecution(executable, args, { cwd: runner.cwd }), detail: `${executable} ${args.join(' ')}` };
	}

	const modulesRoot = await findUp(project.root, workspaceRoot, directory => exists(path.join(directory, 'node_modules', 'typeorm', 'cli.js')));
	if (!modulesRoot) {
		throw new Error(vscode.l10n.t("TypeORM is not installed for {0}. Install the workspace's dependencies first.", project.name));
	}
	const modules = path.join(modulesRoot, 'node_modules');
	const args: string[] = [];
	for (const hook of ['ts-node/register', 'tsconfig-paths/register']) {
		if (await exists(path.join(modules, hook.split('/')[0]))) {
			args.push('-r', path.join(modules, hook));
		}
	}
	args.push(path.join(modules, 'typeorm', 'cli.js'), `migration:${command}`);
	if (command === 'generate') {
		args.push(path.join(await findMigrationsFolder(project.root), name ?? 'Migration'));
	}
	args.push('-d', runner.dataSource);

	const env: Record<string, string> = { TS_NODE_TRANSPILE_ONLY: 'true' };
	if (await exists(path.join(project.root, 'tsconfig.typeorm.json'))) {
		env.TS_NODE_PROJECT = 'tsconfig.typeorm.json';
	}
	return { execution: new vscode.ShellExecution('node', args, { cwd: project.root, env }), detail: `typeorm migration:${command} -d ${runner.dataSource}` };
}

async function createTask(project: MigrationProject, command: MigrationCommand, name?: string): Promise<vscode.Task> {
	const definition: TypeOrmTaskDefinition = { type: 'typeorm', project: relativePath(project.folder, vscode.Uri.file(project.root)), command, name };
	const { execution, detail } = await createExecution(project, command, name);
	const task = new vscode.Task(definition, project.folder, `${project.name}: migration ${command}`, 'typeorm', execution, []);
	task.detail = detail;
	task.presentationOptions = { panel: vscode.TaskPanelKind.Shared, clear: true };
	return task;
}

async function findProject(folder: vscode.WorkspaceFolder, projectPath: string): Promise<MigrationProject | undefined> {
	const root = path.join(folder.uri.fsPath, projectPath);
	return (await findProjects(folder)).find(project => project.root === root);
}

/**
 * Provides `typeorm` migration tasks. `generate` is left out because it needs a name; use the command instead.
 */
class TypeOrmTaskProvider implements vscode.TaskProvider {

	async provideTasks(): Promise<vscode.Task[]> {
		const tasks: vscode.Task[] = [];
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			if (folder.uri.scheme !== 'file') {
				continue;
			}
			try {
				for (const project of await findProjects(folder)) {
					for (const command of ['show', 'run', 'revert'] as const) {
						// One command that can't run yet, such as the CLI before `pnpm install`, must not hide the others.
						try {
							tasks.push(await createTask(project, command));
						} catch (error) {
							log().info(`Skipping ${project.name}: migration ${command}: ${error instanceof Error ? error.message : error}`);
						}
					}
				}
			} catch (error) {
				log().error(`Detecting TypeORM migrations in ${folder.name} failed: ${error}`);
			}
		}
		return tasks;
	}

	async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
		const definition = task.definition as TypeOrmTaskDefinition;
		if (!task.scope || typeof task.scope === 'number' || typeof definition.project !== 'string') {
			return undefined;
		}
		const project = await findProject(task.scope, definition.project);
		return project && createTask(project, definition.command, definition.name);
	}
}

/**
 * Finds the project a file belongs to: the one with the deepest folder that contains it.
 */
async function projectForFile(file: vscode.Uri): Promise<MigrationProject | undefined> {
	const folder = vscode.workspace.getWorkspaceFolder(file);
	if (!folder) {
		return undefined;
	}
	return (await findProjects(folder))
		.filter(project => file.fsPath.startsWith(project.root + path.sep) || project.root === folder.uri.fsPath)
		.sort((a, b) => b.root.length - a.root.length)[0];
}

async function pickProject(): Promise<MigrationProject | undefined> {
	const active = vscode.window.activeTextEditor?.document.uri;
	const fromEditor = active && await projectForFile(active);
	if (fromEditor && fromEditor.root !== fromEditor.folder.uri.fsPath) {
		return fromEditor;
	}
	const folder = await pickWorkspaceFolder();
	const projects = folder ? await findProjects(folder) : [];
	if (projects.length === 0) {
		vscode.window.showInformationMessage(vscode.l10n.t("No TypeORM data sources or migration scripts found."));
		return undefined;
	}
	if (projects.length === 1) {
		return projects[0];
	}
	return (await vscode.window.showQuickPick(projects.map(project => ({ label: project.name, description: relativePath(project.folder, vscode.Uri.file(project.root)), project })), { placeHolder: vscode.l10n.t("Select a project") }))?.project;
}

async function runCommand(command: MigrationCommand, project: MigrationProject | undefined, name?: string): Promise<void> {
	if (!project) {
		return;
	}
	try {
		await vscode.tasks.executeTask(await createTask(project, command, name));
	} catch (error) {
		vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
	}
}

async function generateMigration(file: vscode.Uri | undefined): Promise<void> {
	const project = (file instanceof vscode.Uri ? await projectForFile(file) : undefined) ?? await pickProject();
	if (!project) {
		return;
	}
	const runner = project.runners.get('generate');
	if (runner?.kind === 'nx' && !runner.takesName) {
		return runCommand('generate', project);
	}
	const name = await vscode.window.showInputBox({
		prompt: vscode.l10n.t("Name of the new migration for {0}", project.name),
		placeHolder: 'AddOrderStatus',
		validateInput: value => /^[A-Za-z][A-Za-z0-9]*$/.test(value) ? undefined : vscode.l10n.t("Use letters and digits only, starting with a letter."),
	});
	if (name) {
		await runCommand('generate', project, name);
	}
}

/** SQL in a migration's `up` that can lose data or lock busy tables. */
const riskySql: { readonly pattern: RegExp; readonly severity: vscode.DiagnosticSeverity; readonly message: string }[] = [
	{ pattern: /\bDROP\s+TABLE\b/gi, severity: vscode.DiagnosticSeverity.Warning, message: vscode.l10n.t("Drops a table. Its data is lost, and a running older version of the service will fail.") },
	{ pattern: /\bDROP\s+COLUMN\b/gi, severity: vscode.DiagnosticSeverity.Warning, message: vscode.l10n.t("Drops a column. Its data is lost, and a running older version of the service that still reads it will fail.") },
	{ pattern: /\bTRUNCATE\b/gi, severity: vscode.DiagnosticSeverity.Warning, message: vscode.l10n.t("Deletes every row of the table.") },
	{ pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/gi, severity: vscode.DiagnosticSeverity.Warning, message: vscode.l10n.t("Changing a column's type rewrites the table under an exclusive lock, and narrowing it can fail or lose data.") },
	{ pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/gi, severity: vscode.DiagnosticSeverity.Information, message: vscode.l10n.t("SET NOT NULL scans the whole table under an exclusive lock, and fails if any row is null.") },
	{ pattern: /\bRENAME\s+(COLUMN\s+"?\w+"?\s+)?TO\b/gi, severity: vscode.DiagnosticSeverity.Warning, message: vscode.l10n.t("Renaming breaks running older versions of the service. Prefer add, backfill, then drop in a later release.") },
	{ pattern: /\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/gi, severity: vscode.DiagnosticSeverity.Information, message: vscode.l10n.t("CREATE INDEX blocks writes to the table while it builds. On large tables, use CREATE INDEX CONCURRENTLY in a migration with transaction = false.") },
	{ pattern: /\bDELETE\s+FROM\s+(?:"\w+"|\w+)(?:\.(?:"\w+"|\w+))?\s*(?:[`'";)]|$)/gim, severity: vscode.DiagnosticSeverity.Warning, message: vscode.l10n.t("DELETE without WHERE removes every row.") },
];

function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
	if (!isMigrationFile(document) || !vscode.workspace.getConfiguration('devTools.typeorm', document.uri).get<boolean>('migrationWarnings')) {
		collection.delete(document.uri);
		return;
	}
	const text = document.getText();
	const upStart = text.search(/\bup\s*\(\s*queryRunner/);
	if (upStart < 0) {
		collection.delete(document.uri);
		return;
	}
	const downStart = text.slice(upStart).search(/\bdown\s*\(\s*queryRunner/);
	const upEnd = downStart < 0 ? text.length : upStart + downStart;
	const up = text.slice(upStart, upEnd);

	const diagnostics: vscode.Diagnostic[] = [];
	for (const { pattern, severity, message } of riskySql) {
		for (const match of up.matchAll(pattern)) {
			const start = document.positionAt(upStart + match.index);
			const diagnostic = new vscode.Diagnostic(new vscode.Range(start, document.positionAt(upStart + match.index + match[0].trimEnd().length)), message, severity);
			diagnostic.source = 'migration';
			diagnostics.push(diagnostic);
		}
	}
	collection.set(document.uri, diagnostics);
}

function isMigrationFile(document: vscode.TextDocument): boolean {
	return document.languageId === 'typescript' && /[\\/]migrations?[\\/]/.test(document.uri.fsPath);
}

/**
 * Registers the `typeorm` task provider, commands and migration warnings.
 */
export function registerTypeOrm(context: vscode.ExtensionContext): void {
	const diagnostics = vscode.languages.createDiagnosticCollection('migration');
	context.subscriptions.push(
		diagnostics,
		vscode.tasks.registerTaskProvider('typeorm', new TypeOrmTaskProvider()),
		vscode.commands.registerCommand('devTools.typeorm.generate', (file?: vscode.Uri) => generateMigration(file)),
		...(['run', 'revert', 'show'] as const).map(command => vscode.commands.registerCommand(`devTools.typeorm.${command}`, async (file?: vscode.Uri) => {
			// The editor title buttons of a migration file pass the file.
			if (file instanceof vscode.Uri) {
				const project = await projectForFile(file);
				if (!project) {
					vscode.window.showInformationMessage(vscode.l10n.t("No TypeORM data source or migration scripts found for this migration."));
					return;
				}
				return runCommand(command, project);
			}
			return runCommand(command, await pickProject());
		})),
		registerFileActions('devTools.typeorm.file', vscode.l10n.t("Migration Actions"), `$(database) ${vscode.l10n.t("Migrations")}`, isMigrationFile, [
			{ label: `$(play) ${vscode.l10n.t("Run Pending Migrations")}`, command: 'devTools.typeorm.run' },
			{ label: `$(discard) ${vscode.l10n.t("Revert Last Migration")}`, command: 'devTools.typeorm.revert' },
			{ label: `$(list-unordered) ${vscode.l10n.t("Show Migrations")}`, command: 'devTools.typeorm.show' },
			{ label: `$(add) ${vscode.l10n.t("Generate Migration…")}`, command: 'devTools.typeorm.generate' },
		]),
		vscode.workspace.onDidOpenTextDocument(document => updateDiagnostics(document, diagnostics)),
		vscode.workspace.onDidChangeTextDocument(event => updateDiagnostics(event.document, diagnostics)),
		vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri)),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('devTools.typeorm.migrationWarnings')) {
				vscode.workspace.textDocuments.forEach(document => updateDiagnostics(document, diagnostics));
			}
		}),
	);
	vscode.workspace.textDocuments.forEach(document => updateDiagnostics(document, diagnostics));
}
