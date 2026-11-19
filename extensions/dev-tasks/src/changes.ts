/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { createStatusBarItem } from './common';
import { getGitApi, getRepository, watchRepositories } from './git';
import type { Repository } from './typings/git';

/**
 * The changes of a repository, by the group they show in under Source Control.
 */
interface ChangeCounts {
	readonly files: number;
	readonly staged: number;
	readonly unstaged: number;
	readonly untracked: number;
	readonly conflicts: number;
}

function countChanges(repository: Repository): ChangeCounts {
	const { mergeChanges, indexChanges, workingTreeChanges, untrackedChanges } = repository.state;
	const files = new Set([...mergeChanges, ...indexChanges, ...workingTreeChanges, ...untrackedChanges].map(change => change.uri.toString()));
	return { files: files.size, staged: indexChanges.length, unstaged: workingTreeChanges.length, untracked: untrackedChanges.length, conflicts: mergeChanges.length };
}

/**
 * Shows how many files the active repository has changed, and opens their diff on click. Saiyan hides the activity
 * bar, so this is the quickest way into the changes.
 */
class GitChanges implements vscode.Disposable {

	private readonly statusBarItem = createStatusBarItem('devTools.git.changes', vscode.l10n.t("Git Changes"), 45);
	private readonly disposables: vscode.Disposable[] = [this.statusBarItem];
	private disposed = false;
	private refreshTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		this.disposables.push(
			vscode.commands.registerCommand('devTools.git.showChanges', () => this.showChanges()),
			vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('devTools.git.changesStatusBar')) {
					this.refresh();
				}
			}),
			{ dispose: () => clearTimeout(this.refreshTimer) },
		);
		this.listenToRepositories();
	}

	private async listenToRepositories(): Promise<void> {
		const watcher = await watchRepositories(() => this.scheduleRefresh());
		if (this.disposed) {
			watcher.dispose();
			return;
		}
		this.disposables.push(watcher);
		this.refresh();
	}

	/** Repository state changes in bursts while Git runs, so coalesce them. */
	private scheduleRefresh(): void {
		clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(() => this.refresh(), 150);
	}

	private async refresh(): Promise<void> {
		const repository = vscode.workspace.getConfiguration('devTools.git').get<boolean>('changesStatusBar') ? await getRepository() : undefined;
		const counts = repository && countChanges(repository);
		if (!counts || counts.files === 0) {
			this.statusBarItem.hide();
			return;
		}
		this.statusBarItem.text = `${counts.conflicts > 0 ? '$(git-merge)' : '$(git-compare)'} ${counts.files}`;
		const parts = [
			counts.conflicts > 0 ? vscode.l10n.t("{0} conflicts", counts.conflicts) : undefined,
			counts.staged > 0 ? vscode.l10n.t("{0} staged", counts.staged) : undefined,
			counts.unstaged > 0 ? vscode.l10n.t("{0} unstaged", counts.unstaged) : undefined,
			counts.untracked > 0 ? vscode.l10n.t("{0} untracked", counts.untracked) : undefined,
		].filter(Boolean);
		this.statusBarItem.tooltip = vscode.l10n.t("{0} changed files ({1}). Click to view the diff.", counts.files, parts.join(', '));
		this.statusBarItem.backgroundColor = counts.conflicts > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
		this.statusBarItem.command = 'devTools.git.showChanges';
		this.statusBarItem.show();
	}

	/**
	 * Opens the changes in the multi-file diff editor, asking which group when there is more than one.
	 */
	private async showChanges(): Promise<void> {
		const repository = await getRepository() ?? await this.pickRepository();
		if (!repository) {
			return;
		}
		const counts = countChanges(repository);
		type Item = vscode.QuickPickItem & { readonly command: string };
		const items: Item[] = [
			counts.conflicts > 0 ? { label: `$(git-merge) ${vscode.l10n.t("Merge Conflicts")}`, description: String(counts.conflicts), command: 'workbench.view.scm' } : undefined,
			counts.unstaged > 0 ? { label: `$(diff) ${vscode.l10n.t("Changes")}`, description: String(counts.unstaged), command: 'git.viewChanges' } : undefined,
			counts.staged > 0 ? { label: `$(diff-added) ${vscode.l10n.t("Staged Changes")}`, description: String(counts.staged), command: 'git.viewStagedChanges' } : undefined,
			counts.untracked > 0 ? { label: `$(new-file) ${vscode.l10n.t("Untracked Changes")}`, description: String(counts.untracked), command: 'git.viewUntrackedChanges' } : undefined,
			{ label: `$(source-control) ${vscode.l10n.t("Open Source Control")}`, command: 'workbench.view.scm' },
		].filter((item): item is Item => !!item);

		// With one kind of change, go straight to its diff.
		const diffs = items.filter(item => item.command !== 'workbench.view.scm' || item.description);
		const picked = diffs.length === 1 ? diffs[0] : await vscode.window.showQuickPick(items, { placeHolder: vscode.l10n.t("Changes in {0}", vscode.workspace.asRelativePath(repository.rootUri) || repository.rootUri.fsPath) });
		if (picked) {
			await vscode.commands.executeCommand(picked.command, ...(picked.command.startsWith('git.') ? [repository.rootUri] : []));
		}
	}

	private async pickRepository(): Promise<Repository | undefined> {
		const git = await getGitApi();
		const repositories = git?.repositories.filter(repository => countChanges(repository).files > 0) ?? [];
		if (repositories.length <= 1) {
			return repositories[0];
		}
		return (await vscode.window.showQuickPick(repositories.map(repository => ({ label: vscode.workspace.asRelativePath(repository.rootUri), description: String(countChanges(repository).files), repository })), { placeHolder: vscode.l10n.t("Repository") }))?.repository;
	}

	dispose(): void {
		this.disposed = true;
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

/**
 * Registers the Git changes status bar item.
 */
export function registerGitChanges(context: vscode.ExtensionContext): void {
	context.subscriptions.push(new GitChanges());
}
