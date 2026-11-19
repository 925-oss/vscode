import * as vscode from 'vscode';
import { createStatusBarItem, isAvailable, log, runJson, showError } from './common';
import { getGitApi, getRepository, watchRepositories } from './git';
import type { Repository } from './typings/git';

/**
 * A Jira work item as `twg -o json` returns it.
 */
interface WorkItem {
	readonly key: string;
	readonly summary: string;
	readonly url: string;
	readonly status?: { readonly name: string; readonly statusCategory?: { readonly key: string } };
	readonly issueType?: { readonly name: string } | null;
	readonly priority?: { readonly name: string } | null;
	readonly assignee?: { readonly displayName: string } | null;
}

interface TwgResponse<T> {
	readonly data: T;
}

const keyPattern = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/;
/** Prefixes that look like work item keys but are standards, hashes or encodings. */
const notProjectKeys = new Set(['UTF', 'SHA', 'ISO', 'RFC', 'CVE', 'AES', 'RSA', 'TLS', 'SSL', 'HTTP', 'ES', 'ECMA', 'UTC', 'GMT', 'IPV', 'MD', 'PKCS', 'ARM', 'WCAG', 'OWASP', 'PR', 'BC', 'AD']);
const cacheMilliseconds = 5 * 60_000;

function twg<T>(args: string[], token?: vscode.CancellationToken): Promise<T> {
	return runJson<TwgResponse<T>>('twg', [...args, '-o', 'json', '--output-summary', 'none'], { timeout: 30_000, token }).then(response => response.data);
}

function isProjectKey(key: string): boolean {
	const project = key.slice(0, key.indexOf('-'));
	const configured = vscode.workspace.getConfiguration('devTools.jira').get<string[]>('projectKeys') ?? [];
	return configured.length > 0 ? configured.includes(project) : !notProjectKeys.has(project);
}

function slug(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}

/**
 * Shows Jira work items for keys in code, commit messages and the current branch.
 */
class Jira implements vscode.Disposable, vscode.HoverProvider {

	private readonly cache = new Map<string, { readonly time: number; readonly item: Promise<WorkItem | undefined> }>();
	private readonly statusBarItem = createStatusBarItem('devTools.jira', vscode.l10n.t("Jira Work Item"), 20);
	private readonly disposables: vscode.Disposable[] = [this.statusBarItem];
	private disposed = false;

	constructor() {
		this.disposables.push(
			vscode.languages.registerHoverProvider([{ scheme: 'file' }, { scheme: 'untitled' }, { scheme: 'vscode-scm' }], this),
			vscode.commands.registerCommand('devTools.jira.startWork', () => this.startWork()),
			vscode.commands.registerCommand('devTools.jira.openCurrent', (key?: string) => this.openCurrent(key)),
			vscode.window.onDidChangeActiveTextEditor(() => this.refreshStatus()),
		);
		this.listenToRepositories();
	}

	private async listenToRepositories(): Promise<void> {
		if (!await isAvailable('twg')) {
			return;
		}
		const watcher = await watchRepositories(() => this.refreshStatus());
		if (this.disposed) {
			watcher.dispose();
			return;
		}
		this.disposables.push(watcher);
		this.refreshStatus();
	}

	private getWorkItem(key: string, token?: vscode.CancellationToken): Promise<WorkItem | undefined> {
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.time < cacheMilliseconds) {
			return cached.item;
		}
		const item = twg<WorkItem[]>(['jira', 'workitem', 'get', key], token).then(items => items[0], error => {
			log().info(`twg jira workitem get ${key}: ${error}`);
			return undefined;
		});
		this.cache.set(key, { time: Date.now(), item });
		return item;
	}

	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
		if (!vscode.workspace.getConfiguration('devTools.jira').get<boolean>('hover')) {
			return undefined;
		}
		const range = document.getWordRangeAtPosition(position, keyPattern);
		const key = range && document.getText(range);
		if (!key || !isProjectKey(key) || !await isAvailable('twg')) {
			return undefined;
		}
		const item = await this.getWorkItem(key, token);
		if (!item || token.isCancellationRequested) {
			return undefined;
		}
		const details = [item.issueType?.name, item.status?.name, item.priority?.name && vscode.l10n.t("{0} priority", item.priority.name), item.assignee?.displayName ?? vscode.l10n.t("Unassigned")].filter(Boolean);
		const markdown = new vscode.MarkdownString();
		markdown.appendMarkdown(`$(issues) **[${item.key}](${item.url})** `);
		markdown.appendText(item.summary);
		markdown.appendMarkdown('\n\n');
		markdown.appendText(details.join(' · '));
		markdown.supportThemeIcons = true;
		return new vscode.Hover(markdown, range);
	}

	private async refreshStatus(): Promise<void> {
		const repository = await getRepository();
		const branch = repository?.state.HEAD?.name;
		const key = branch && keyPattern.exec(branch.toUpperCase())?.[0];
		// Branch names such as release/q3-2026 look like keys, so only show work items Jira knows.
		const item = key && isProjectKey(key) ? await this.getWorkItem(key) : undefined;
		if (branch !== (await getRepository())?.state.HEAD?.name) {
			return; // The branch changed while loading; a newer refresh handles it.
		}
		if (!item) {
			this.statusBarItem.hide();
			return;
		}
		this.statusBarItem.text = `$(issues) ${item.key}`;
		this.statusBarItem.command = { title: vscode.l10n.t("Open Work Item"), command: 'devTools.jira.openCurrent', arguments: [item.key] };
		this.statusBarItem.tooltip = `${item.key}: ${item.summary} (${item.status?.name ?? ''})`;
		this.statusBarItem.show();
	}

	private async openCurrent(key: string | undefined): Promise<void> {
		if (!key) {
			return;
		}
		const item = await this.getWorkItem(key);
		if (item) {
			await vscode.env.openExternal(vscode.Uri.parse(item.url));
		} else {
			vscode.window.showWarningMessage(vscode.l10n.t("Could not load {0} with twg. Check that twg is signed in.", key));
		}
	}

	/**
	 * Picks one of my open work items and creates a branch for it.
	 */
	private async startWork(): Promise<void> {
		if (!await isAvailable('twg')) {
			vscode.window.showErrorMessage(vscode.l10n.t("The twg CLI is not installed."));
			return;
		}
		const repository = await getRepository() ?? await this.pickRepository();
		if (!repository) {
			return;
		}
		let items: WorkItem[];
		try {
			items = (await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Loading your Jira work items"), cancellable: true }, (_progress, token) =>
				twg<{ issues: WorkItem[] }>(['jira', 'workitem', 'query', '--jql', 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC', '--limit', '50'], token))).issues;
		} catch (error) {
			await showError(vscode.l10n.t("Loading Jira work items failed."), error);
			return;
		}
		if (items.length === 0) {
			vscode.window.showInformationMessage(vscode.l10n.t("You have no open Jira work items."));
			return;
		}
		const picked = await vscode.window.showQuickPick(items.map(item => ({
			label: item.key,
			description: item.summary,
			detail: [item.issueType?.name, item.status?.name, item.priority?.name].filter(Boolean).join(' · '),
			item,
		})), { placeHolder: vscode.l10n.t("Work item to start"), matchOnDescription: true });
		if (!picked) {
			return;
		}
		const prefix = /bug/i.test(picked.item.issueType?.name ?? '') ? 'bugfix/' : vscode.workspace.getConfiguration('devTools.jira').get<string>('branchPrefix') ?? 'feature/';
		const name = await vscode.window.showInputBox({
			prompt: vscode.l10n.t("Branch for {0}", picked.item.key),
			value: `${prefix}${picked.item.key}-${slug(picked.item.summary)}`,
			validateInput: value => /^[^\s~^:?*[\\]+$/.test(value) && !value.includes('..') ? undefined : vscode.l10n.t("Not a valid branch name."),
		});
		if (!name) {
			return;
		}
		try {
			await repository.createBranch(name, true);
			if (!repository.inputBox.value) {
				repository.inputBox.value = `${picked.item.key}: `;
			}
		} catch (error) {
			await showError(vscode.l10n.t("Creating branch {0} failed.", name), error);
		}
	}

	private async pickRepository(): Promise<Repository | undefined> {
		const git = await getGitApi();
		if (!git || git.repositories.length === 0) {
			vscode.window.showInformationMessage(vscode.l10n.t("Open a Git repository first."));
			return undefined;
		}
		return (await vscode.window.showQuickPick(git.repositories.map(repository => ({ label: vscode.workspace.asRelativePath(repository.rootUri), repository })), { placeHolder: vscode.l10n.t("Repository") }))?.repository;
	}

	dispose(): void {
		this.disposed = true;
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

/**
 * Registers Jira hovers, the branch status bar item and the Start Work command.
 */
export function registerJira(context: vscode.ExtensionContext): void {
	context.subscriptions.push(new Jira());
}
