/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { API, GitExtension, Repository } from './typings/git';

let api: Promise<API | undefined> | undefined;

/**
 * The built-in Git extension's API, or undefined when Git is disabled.
 */
export function getGitApi(): Promise<API | undefined> {
	api ??= (async () => {
		const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
		if (!extension) {
			return undefined;
		}
		const exports = extension.isActive ? extension.exports : await extension.activate();
		return exports.enabled ? exports.getAPI(1) : undefined;
	})();
	return api;
}

/**
 * The repository of a file, of the active editor, or the only open repository.
 */
export async function getRepository(file?: vscode.Uri): Promise<Repository | undefined> {
	const git = await getGitApi();
	if (!git) {
		return undefined;
	}
	const target = file ?? vscode.window.activeTextEditor?.document.uri;
	const fromFile = target && git.getRepository(target);
	if (fromFile) {
		return fromFile;
	}
	if (git.repositories.length === 1) {
		return git.repositories[0];
	}
	return undefined;
}

/**
 * The checked out branch of a file's repository.
 */
export async function currentBranch(file?: vscode.Uri): Promise<string | undefined> {
	return (await getRepository(file))?.state.HEAD?.name;
}

/**
 * Calls `onChange` whenever a repository opens, closes or changes state (branch, staged or unstaged files).
 */
export async function watchRepositories(onChange: () => void): Promise<vscode.Disposable> {
	const git = await getGitApi();
	if (!git) {
		return vscode.Disposable.from();
	}
	const listeners = new Map<string, vscode.Disposable>();
	const listen = (repository: Repository) => {
		const id = repository.rootUri.toString();
		if (!listeners.has(id)) {
			listeners.set(id, repository.state.onDidChange(onChange));
		}
	};
	git.repositories.forEach(listen);
	const disposables = [
		git.onDidOpenRepository(repository => {
			listen(repository);
			onChange();
		}),
		git.onDidCloseRepository(repository => {
			listeners.get(repository.rootUri.toString())?.dispose();
			listeners.delete(repository.rootUri.toString());
			onChange();
		}),
		{ dispose: () => listeners.forEach(listener => listener.dispose()) },
	];
	return vscode.Disposable.from(...disposables);
}
