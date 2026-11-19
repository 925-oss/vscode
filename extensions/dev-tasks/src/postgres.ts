import * as path from 'path';
import * as vscode from 'vscode';
import { findComposeFiles } from './compose';
import { isAvailable, log, pickWorkspaceFolder, relativePath, runJson } from './common';

/** The SQLTools group that holds the connections made from Compose files. */
const connectionGroup = 'Docker Compose';
const sqlToolsExtension = 'mtxr.sqltools';

interface ComposeConfig {
	readonly services?: Record<string, {
		readonly image?: string;
		readonly environment?: Record<string, string | null>;
		readonly ports?: { readonly target: number; readonly published?: string | number; readonly host_ip?: string }[];
	}>;
}

/**
 * A Postgres service declared in a Compose file.
 */
interface PostgresService {
	readonly folder: vscode.WorkspaceFolder;
	/** The Compose file, relative to the workspace folder. */
	readonly file: string;
	readonly service: string;
	readonly user: string;
	readonly password?: string;
	readonly database: string;
	/** The port published on the host, when there is one. */
	readonly port?: number;
}

interface SqlToolsConnection {
	readonly name: string;
	readonly group?: string;
	readonly [key: string]: unknown;
}

async function findPostgresServices(folder: vscode.WorkspaceFolder): Promise<PostgresService[]> {
	const services: PostgresService[] = [];
	for (const composeFile of await findComposeFiles(folder)) {
		let config: ComposeConfig;
		try {
			config = await runJson<ComposeConfig>('docker', ['compose', '-f', composeFile.fsPath, 'config', '--format', 'json'], { cwd: path.dirname(composeFile.fsPath), timeout: 15_000 });
		} catch (error) {
			log().info(`docker compose config failed for ${composeFile.fsPath}: ${error}`);
			continue;
		}
		for (const [service, definition] of Object.entries(config.services ?? {})) {
			if (!/(^|\/)(postgres|postgis\/postgis|timescale\/timescaledb[\w-]*|pgvector\/pgvector)(:|@|$)/.test(definition.image ?? '')) {
				continue;
			}
			const environment = definition.environment ?? {};
			const user = environment.POSTGRES_USER || 'postgres';
			const published = definition.ports?.find(port => port.target === 5432)?.published;
			services.push({
				folder,
				file: relativePath(folder, composeFile),
				service,
				user,
				password: environment.POSTGRES_PASSWORD ?? undefined,
				database: environment.POSTGRES_DB || user,
				port: published !== undefined ? Number(published) : undefined,
			});
		}
	}
	return services;
}

function connectionName(service: PostgresService, all: PostgresService[]): string {
	const ambiguous = all.filter(other => other.service === service.service).length > 1;
	return ambiguous ? `${service.folder.name}/${service.service} (${service.file})` : `${service.folder.name}/${service.service}`;
}

/**
 * Keeps one SQLTools connection per Compose Postgres service in the user settings, so local databases need no setup.
 */
async function syncConnections(folder: vscode.WorkspaceFolder, services: PostgresService[]): Promise<void> {
	const config = vscode.workspace.getConfiguration('sqltools');
	const current = config.inspect<SqlToolsConnection[]>('connections')?.globalValue ?? [];
	const ownedPrefix = `${folder.name}/`;
	const kept = current.filter(connection => connection.group !== connectionGroup || !connection.name.startsWith(ownedPrefix));
	const generated = services.filter(service => service.port !== undefined).map(service => ({
		name: connectionName(service, services),
		group: connectionGroup,
		driver: 'PostgreSQL',
		previewLimit: 50,
		server: 'localhost',
		port: service.port,
		database: service.database,
		username: service.user,
		...(service.password ? { password: service.password } : { askForPassword: true }),
	}));
	const next = [...kept, ...generated];
	if (JSON.stringify(next) !== JSON.stringify(current)) {
		await config.update('connections', next, vscode.ConfigurationTarget.Global);
		log().info(`Updated ${generated.length} SQLTools connection(s) for ${folder.name}.`);
	}
}

/**
 * Finds Compose Postgres services, keeps SQLTools in step with them, and opens psql.
 */
class Postgres implements vscode.Disposable {

	private readonly disposables: vscode.Disposable[] = [];
	private syncTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		const watcher = vscode.workspace.createFileSystemWatcher('**/{compose,docker-compose}*.{yml,yaml}');
		const scheduleSync = () => this.scheduleSync();
		this.disposables.push(
			watcher,
			watcher.onDidChange(scheduleSync),
			watcher.onDidCreate(scheduleSync),
			watcher.onDidDelete(scheduleSync),
			vscode.workspace.onDidChangeWorkspaceFolders(scheduleSync),
			vscode.extensions.onDidChange(scheduleSync),
			vscode.commands.registerCommand('devTools.postgres.psql', () => this.openPsql()),
			vscode.commands.registerCommand('devTools.postgres.syncConnections', () => this.sync(true)),
			{ dispose: () => clearTimeout(this.syncTimer) },
		);
		this.scheduleSync();
	}

	private scheduleSync(): void {
		clearTimeout(this.syncTimer);
		this.syncTimer = setTimeout(() => this.sync(false), 3_000);
	}

	private async sync(explicit: boolean): Promise<void> {
		if (!vscode.extensions.getExtension(sqlToolsExtension)) {
			if (explicit) {
				vscode.window.showInformationMessage(vscode.l10n.t("SQLTools is not installed."));
			}
			return;
		}
		if (!explicit && !vscode.workspace.getConfiguration('devTools.postgres').get<boolean>('syncSqlToolsConnections')) {
			return;
		}
		if (!await isAvailable('docker')) {
			return;
		}
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			if (folder.uri.scheme === 'file') {
				try {
					await syncConnections(folder, await findPostgresServices(folder));
				} catch (error) {
					log().error(`Syncing SQLTools connections for ${folder.name} failed: ${error}`);
				}
			}
		}
		if (explicit) {
			vscode.window.showInformationMessage(vscode.l10n.t("SQLTools connections are up to date with the Compose files."));
		}
	}

	private async openPsql(): Promise<void> {
		const folder = await pickWorkspaceFolder();
		if (!folder) {
			return;
		}
		const services = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t("Reading Compose files") }, () => findPostgresServices(folder));
		if (services.length === 0) {
			vscode.window.showInformationMessage(vscode.l10n.t("No Postgres services found in the Compose files of {0}.", folder.name));
			return;
		}
		const service = services.length === 1 ? services[0] : (await vscode.window.showQuickPick(services.map(service => ({ label: service.service, description: `${service.database} · ${service.file}`, service })), { placeHolder: vscode.l10n.t("Postgres service") }))?.service;
		if (!service) {
			return;
		}
		const terminal = vscode.window.createTerminal({
			name: `psql: ${service.service}`,
			cwd: folder.uri,
			shellPath: 'docker',
			shellArgs: ['compose', '-f', service.file, 'exec', service.service, 'psql', '-U', service.user, '-d', service.database],
			iconPath: new vscode.ThemeIcon('database'),
		});
		terminal.show();
	}

	dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

/**
 * Registers the Postgres commands and the SQLTools connection sync.
 */
export function registerPostgres(context: vscode.ExtensionContext): void {
	context.subscriptions.push(new Postgres());
}
