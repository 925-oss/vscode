import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createStatusBarItem, exists, isAvailable, log, readText, run, runJson, showError } from './common';
import { getGitApi, getRepository, watchRepositories } from './git';
import type { Jira } from './jira';
import type { Repository } from './typings/git';

/**
 * Someone taking part in a pull request, as `twg -o json` returns it.
 */
interface Participant {
	readonly user: { readonly display_name: string };
	readonly role: 'REVIEWER' | 'PARTICIPANT';
	readonly approved: boolean;
	readonly state: 'approved' | 'changes_requested' | null;
}

/**
 * A build reported on a pull request's latest commit.
 */
interface BuildStatus {
	readonly state: 'SUCCESSFUL' | 'FAILED' | 'INPROGRESS' | 'STOPPED';
	readonly name?: string;
	readonly key?: string;
	readonly url?: string;
}

/**
 * A Bitbucket pull request. `participants` and `_statuses` are only present on a pull request loaded with `get --statuses`.
 */
interface PullRequest {
	readonly id: number;
	readonly title: string;
	readonly draft: boolean;
	readonly comment_count: number;
	readonly task_count: number;
	readonly source: { readonly branch: { readonly name: string } };
	readonly destination: { readonly branch: { readonly name: string } };
	readonly links: { readonly html: { readonly href: string } };
	readonly participants?: readonly Participant[];
	readonly _statuses?: readonly BuildStatus[];
}

/**
 * A pull request in the `twg bitbucket inbox` summary.
 */
interface InboxItem {
	readonly id: number;
	readonly title: string;
	readonly draft: boolean;
	readonly repo: string;
	readonly link: string;
	readonly author: { readonly displayName: string };
	readonly sourceBranch: string;
	readonly destinationBranch: string;
	readonly attention: { readonly needsAction: boolean; readonly approved: boolean };
}

interface Inbox {
	readonly items: readonly InboxItem[];
}

interface PullRequestAction extends vscode.QuickPickItem {
	readonly run: () => Thenable<unknown>;
}

interface LinkItem extends vscode.QuickPickItem {
	readonly link?: string;
}

const cacheMilliseconds = 5 * 60_000;
const templateFiles = ['PULL_REQUEST_TEMPLATE.md', 'pull_request_template.md', '.bitbucket/PULL_REQUEST_TEMPLATE.md', 'docs/PULL_REQUEST_TEMPLATE.md'];
/** The placeholder work item key that pull request templates carry. */
const templateKeyPattern = /\bABC-123\b/g;

function twg<T>(repository: Repository, args: readonly string[], token?: vscode.CancellationToken): Promise<T> {
	return runJson<T>('twg', ['bitbucket', ...args, '-o', 'json', '--output-summary', 'none'], { cwd: repository.rootUri.fsPath, timeout: 60_000, token });
}

/**
 * The name of the remote that points at Bitbucket Cloud, when the repository has one.
 */
function bitbucketRemote(repository: Repository): string | undefined {
	return repository.state.remotes.find(remote => /bitbucket\.org[:/]/.test(remote.fetchUrl ?? remote.pushUrl ?? ''))?.name;
}

/**
 * Brings Bitbucket pull requests into the editor: the pull request of the current branch in the status bar, creating one
 * from the branch, and the pull requests that wait for a review.
 */
class Bitbucket implements vscode.Disposable {

	private readonly cache = new Map<string, { readonly time: number; readonly pullRequest: Promise<PullRequest | undefined> }>();
	private readonly defaultBranches = new Map<string, Promise<string | undefined>>();
	private readonly statusBarItem = createStatusBarItem('devTools.bitbucket', vscode.l10n.t("Pull Request"), 19);
	private readonly disposables: vscode.Disposable[] = [this.statusBarItem];
	private disposed = false;

	constructor(private readonly jira: Jira) {
		this.disposables.push(
			vscode.commands.registerCommand('devTools.bitbucket.createPullRequest', () => this.createPullRequest()),
			vscode.commands.registerCommand('devTools.bitbucket.showPullRequest', () => this.showPullRequest()),
			vscode.commands.registerCommand('devTools.bitbucket.showInbox', () => this.showInbox()),
			vscode.window.onDidChangeActiveTextEditor(() => this.refreshStatus()),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('devTools.bitbucket.statusBar')) {
					this.refreshStatus();
				}
			}),
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

	/**
	 * The open pull request of a branch. Answers are kept for a few minutes, because the repository state changes on
	 * every save and each lookup starts the twg CLI.
	 */
	private getPullRequest(repository: Repository, branch: string, reload = false): Promise<PullRequest | undefined> {
		const key = `${repository.rootUri.toString()}\n${branch}`;
		const cached = this.cache.get(key);
		if (!reload && cached && Date.now() - cached.time < cacheMilliseconds) {
			return cached.pullRequest;
		}
		const pullRequest = this.loadPullRequest(repository, branch).catch(error => {
			log().info(`twg bitbucket pull-requests for ${branch}: ${error}`);
			return undefined;
		});
		this.cache.set(key, { time: Date.now(), pullRequest });
		return pullRequest;
	}

	private async loadPullRequest(repository: Repository, branch: string): Promise<PullRequest | undefined> {
		const [found] = await twg<PullRequest[]>(repository, ['pull-requests', 'query', '--source', branch, '--state', 'OPEN', '--limit', '1']);
		return found && twg<PullRequest>(repository, ['pull-requests', 'get', String(found.id), '--statuses']);
	}

	/**
	 * The branch the remote treats as its main branch, such as `main`.
	 */
	private getDefaultBranch(repository: Repository, remote: string): Promise<string | undefined> {
		const key = repository.rootUri.toString();
		let branch = this.defaultBranches.get(key);
		if (!branch) {
			branch = run('git', ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`], { cwd: repository.rootUri.fsPath }).then(output => output.trim().slice(remote.length + 1) || undefined, () => undefined);
			this.defaultBranches.set(key, branch);
		}
		return branch;
	}

	private async refreshStatus(): Promise<void> {
		const repository = await getRepository();
		const branch = repository?.state.HEAD?.name;
		const remote = repository && bitbucketRemote(repository);
		if (!repository || !branch || !remote || !vscode.workspace.getConfiguration('devTools.bitbucket').get<boolean>('statusBar') || !await isAvailable('twg')) {
			this.statusBarItem.hide();
			return;
		}
		const pullRequest = await this.getPullRequest(repository, branch);
		const defaultBranch = pullRequest ? undefined : await this.getDefaultBranch(repository, remote);
		const current = await getRepository();
		// The Git API hands out a new object per lookup, so repositories are compared by their root.
		if (current?.rootUri.toString() !== repository.rootUri.toString() || current.state.HEAD?.name !== branch) {
			return; // The branch changed while loading; a newer refresh handles it.
		}
		this.statusBarItem.backgroundColor = undefined;
		if (pullRequest) {
			this.showStatus(pullRequest);
		} else if (repository.state.HEAD?.upstream && branch !== defaultBranch) {
			this.statusBarItem.text = '$(git-pull-request-create)';
			this.statusBarItem.tooltip = vscode.l10n.t("Create a pull request for {0}", branch);
			this.statusBarItem.command = 'devTools.bitbucket.createPullRequest';
			this.statusBarItem.show();
		} else {
			this.statusBarItem.hide();
		}
	}

	private showStatus(pullRequest: PullRequest): void {
		const reviewers = pullRequest.participants?.filter(participant => participant.role === 'REVIEWER') ?? [];
		const changesRequested = pullRequest.participants?.some(participant => participant.state === 'changes_requested') ?? false;
		const builds = pullRequest._statuses ?? [];
		const failed = builds.some(build => build.state === 'FAILED');
		const running = builds.some(build => build.state === 'INPROGRESS');

		const parts = [`$(${pullRequest.draft ? 'git-pull-request-draft' : 'git-pull-request'}) ${pullRequest.id}`];
		if (reviewers.length > 0) {
			parts.push(`$(${changesRequested ? 'request-changes' : 'check'}) ${reviewers.filter(reviewer => reviewer.approved).length}/${reviewers.length}`);
		}
		if (builds.length > 0) {
			parts.push(`$(${failed ? 'error' : running ? 'clock' : 'pass'})`);
		}

		const tooltip = new vscode.MarkdownString();
		tooltip.appendMarkdown(`**#${pullRequest.id}** `);
		tooltip.appendText(pullRequest.title);
		tooltip.appendMarkdown('\n\n');
		tooltip.appendText(`${pullRequest.source.branch.name} → ${pullRequest.destination.branch.name}`);
		tooltip.appendMarkdown('\n');
		for (const reviewer of reviewers) {
			const state = reviewer.approved ? vscode.l10n.t("approved") : reviewer.state === 'changes_requested' ? vscode.l10n.t("requested changes") : vscode.l10n.t("not reviewed yet");
			tooltip.appendMarkdown('\n- ');
			tooltip.appendText(`${reviewer.user.display_name}: ${state}`);
		}
		for (const build of builds) {
			tooltip.appendMarkdown('\n- ');
			tooltip.appendText(`${build.name ?? build.key ?? vscode.l10n.t("Build")}: ${build.state.toLowerCase()}`);
		}
		tooltip.appendMarkdown('\n\n');
		tooltip.appendText(vscode.l10n.t("{0} comments, {1} tasks", pullRequest.comment_count, pullRequest.task_count));

		this.statusBarItem.text = parts.join('  ');
		this.statusBarItem.tooltip = tooltip;
		this.statusBarItem.backgroundColor = failed || changesRequested ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
		this.statusBarItem.command = 'devTools.bitbucket.showPullRequest';
		this.statusBarItem.show();
	}

	/**
	 * The Bitbucket repository and branch that commands act on, after telling the user what is missing.
	 */
	private async getTarget(): Promise<{ readonly repository: Repository; readonly remote: string; readonly branch: string } | undefined> {
		if (!await isAvailable('twg')) {
			vscode.window.showErrorMessage(vscode.l10n.t("The twg CLI is not installed."));
			return undefined;
		}
		const repository = await getRepository() ?? (await getGitApi())?.repositories.find(candidate => bitbucketRemote(candidate));
		const remote = repository && bitbucketRemote(repository);
		const branch = repository?.state.HEAD?.name;
		if (!repository || !remote) {
			vscode.window.showInformationMessage(vscode.l10n.t("Open a file from a Bitbucket repository first."));
			return undefined;
		}
		if (!branch) {
			vscode.window.showInformationMessage(vscode.l10n.t("Check out a branch first."));
			return undefined;
		}
		return { repository, remote, branch };
	}

	/**
	 * Offers what can be done with the pull request of the current branch.
	 */
	private async showPullRequest(): Promise<void> {
		const target = await this.getTarget();
		if (!target) {
			return;
		}
		const pullRequest = await this.getPullRequest(target.repository, target.branch);
		if (!pullRequest) {
			const create = vscode.l10n.t("Create Pull Request");
			if (await vscode.window.showInformationMessage(vscode.l10n.t("{0} has no open pull request.", target.branch), create) === create) {
				await this.createPullRequest();
			}
			return;
		}
		const link = pullRequest.links.html.href;
		const actions: PullRequestAction[] = [
			{ label: `$(link-external) ${vscode.l10n.t("Open in Browser")}`, run: () => vscode.env.openExternal(vscode.Uri.parse(link)) },
			{ label: `$(copy) ${vscode.l10n.t("Copy Link")}`, run: () => vscode.env.clipboard.writeText(link) },
		];
		for (const build of pullRequest._statuses ?? []) {
			const url = build.url;
			if (url) {
				actions.push({ label: `$(server-process) ${vscode.l10n.t("Open Build")}`, description: `${build.name ?? build.key ?? ''} · ${build.state.toLowerCase()}`, run: () => vscode.env.openExternal(vscode.Uri.parse(url)) });
			}
		}
		actions.push({
			label: `$(refresh) ${vscode.l10n.t("Refresh")}`, run: async () => {
				await this.getPullRequest(target.repository, target.branch, true);
				await this.refreshStatus();
			}
		});
		const picked = await vscode.window.showQuickPick(actions, { placeHolder: `#${pullRequest.id} ${pullRequest.title}` });
		await picked?.run();
	}

	/**
	 * Creates a pull request for the current branch, pushing it first when needed.
	 */
	private async createPullRequest(): Promise<void> {
		const target = await this.getTarget();
		if (!target) {
			return;
		}
		const { repository, remote, branch } = target;
		const open = vscode.l10n.t("Open in Browser");

		const existing = await this.getPullRequest(repository, branch, true);
		if (existing) {
			if (await vscode.window.showInformationMessage(vscode.l10n.t("{0} already has pull request #{1}.", branch, existing.id), open) === open) {
				await vscode.env.openExternal(vscode.Uri.parse(existing.links.html.href));
			}
			return;
		}

		const head = repository.state.HEAD;
		if (!head?.upstream || (head.ahead ?? 0) > 0) {
			const push = vscode.l10n.t("Push and Continue");
			const message = head?.upstream ? vscode.l10n.t("{0} has commits that are not pushed yet.", branch) : vscode.l10n.t("{0} is not on Bitbucket yet.", branch);
			if (await vscode.window.showWarningMessage(message, { modal: true }, push) !== push) {
				return;
			}
			try {
				await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Pushing {0}", branch) }, () => repository.push(remote, branch, !head?.upstream));
			} catch (error) {
				await showError(vscode.l10n.t("Pushing {0} failed.", branch), error);
				return;
			}
		}

		const destination = await this.pickDestination(repository, remote, branch);
		if (!destination) {
			return;
		}

		const workItem = await this.jira.getWorkItemOfBranch(branch);
		const lastCommit = (await repository.log({ maxEntries: 1 }))[0]?.message.split('\n')[0];
		const title = await vscode.window.showInputBox({
			prompt: vscode.l10n.t("Title of the pull request from {0} into {1}", branch, destination),
			value: workItem ? `${workItem.key}: ${workItem.summary}` : lastCommit ?? branch,
			validateInput: value => value.trim() ? undefined : vscode.l10n.t("The title is required."),
		});
		if (!title) {
			return;
		}

		const template = await this.readTemplate(repository);
		let description = template !== undefined
			? (workItem ? template.replace(templateKeyPattern, workItem.key) : template)
			: await this.listCommits(repository, `${remote}/${destination}`);

		const create: vscode.QuickPickItem = { label: `$(git-pull-request-create) ${vscode.l10n.t("Create Pull Request")}`, description: vscode.l10n.t("Reviewers are notified") };
		const createDraft: vscode.QuickPickItem = { label: `$(git-pull-request-draft) ${vscode.l10n.t("Create as Draft")}` };
		const edit: vscode.QuickPickItem = { label: `$(edit) ${vscode.l10n.t("Edit Description First")}`, description: template !== undefined ? vscode.l10n.t("From the repository's pull request template") : vscode.l10n.t("From the commit messages") };
		// A template still has its questions in it, so editing comes first then.
		const picked = await vscode.window.showQuickPick(template !== undefined ? [edit, create, createDraft] : [create, createDraft, edit], { placeHolder: `${title} (${branch} → ${destination})` });
		if (!picked) {
			return;
		}
		let draft = picked === createDraft;
		if (picked === edit) {
			const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: description });
			await vscode.window.showTextDocument(document);
			const createLabel = vscode.l10n.t("Create Pull Request");
			const createDraftLabel = vscode.l10n.t("Create as Draft");
			const choice = await vscode.window.showInformationMessage(vscode.l10n.t("Edit the description, then create the pull request for {0}.", branch), createLabel, createDraftLabel);
			if (!choice) {
				return;
			}
			draft = choice === createDraftLabel;
			description = document.getText();
		}

		const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pull-request-'));
		try {
			const descriptionFile = path.join(folder, 'description.md');
			await fs.writeFile(descriptionFile, description);
			const args = ['pull-requests', 'create', '--title', title.trim(), '--source', branch, '--dest', destination, '--description-file', descriptionFile];
			await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Creating the pull request") }, () => twg<unknown>(repository, draft ? [...args, '--draft'] : args));
		} catch (error) {
			await showError(vscode.l10n.t("Creating the pull request failed."), error);
			return;
		} finally {
			await fs.rm(folder, { recursive: true, force: true });
		}

		const created = await this.getPullRequest(repository, branch, true);
		await this.refreshStatus();
		const message = created ? vscode.l10n.t("Created pull request #{0}.", created.id) : vscode.l10n.t("Created the pull request.");
		if (await vscode.window.showInformationMessage(message, ...(created ? [open] : [])) === open && created) {
			await vscode.env.openExternal(vscode.Uri.parse(created.links.html.href));
		}
	}

	/**
	 * Asks which branch to merge into, with the remote's main branch first and then the most recently updated ones.
	 */
	private async pickDestination(repository: Repository, remote: string, source: string): Promise<string | undefined> {
		const defaultBranch = await this.getDefaultBranch(repository, remote);
		const prefix = `${remote}/`;
		const recent = (await repository.getBranches({ remote: true, sort: 'committerdate', count: 60, pattern: `remotes/${remote}` }))
			.map(ref => ref.name?.startsWith(prefix) ? ref.name.slice(prefix.length) : undefined)
			.filter((name): name is string => !!name && name !== 'HEAD' && name !== source && name !== defaultBranch);
		const items: vscode.QuickPickItem[] = [
			...(defaultBranch && defaultBranch !== source ? [{ label: defaultBranch, description: vscode.l10n.t("main branch") }] : []),
			...recent.map(label => ({ label })),
		];
		return (await vscode.window.showQuickPick(items, { placeHolder: vscode.l10n.t("Branch to merge {0} into", source) }))?.label;
	}

	private async readTemplate(repository: Repository): Promise<string | undefined> {
		for (const file of templateFiles) {
			const template = path.join(repository.rootUri.fsPath, file);
			if (await exists(template)) {
				return readText(vscode.Uri.file(template));
			}
		}
		return undefined;
	}

	/**
	 * The subjects of the commits a pull request into `base` would add, as a Markdown list.
	 */
	private async listCommits(repository: Repository, base: string): Promise<string> {
		try {
			const commits = await repository.log({ range: `${base}..HEAD`, maxEntries: 50 });
			return commits.map(commit => `- ${commit.message.split('\n')[0]}`).join('\n');
		} catch (error) {
			log().info(`git log ${base}..HEAD: ${error}`);
			return '';
		}
	}

	/**
	 * Lists the open pull requests that wait for my review and the ones I opened, across the Bitbucket workspace.
	 */
	private async showInbox(): Promise<void> {
		const target = await this.getTarget();
		if (!target) {
			return;
		}
		const tokenSource = new vscode.CancellationTokenSource();
		let toReview: Inbox;
		let mine: Inbox;
		try {
			[toReview, mine] = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Loading pull requests"), cancellable: true }, (_progress, token) => {
				token.onCancellationRequested(() => tokenSource.cancel());
				return Promise.all([
					twg<Inbox>(target.repository, ['inbox', '--role', 'reviewer', '--limit', '25'], tokenSource.token),
					twg<Inbox>(target.repository, ['inbox', '--role', 'author', '--limit', '25'], tokenSource.token),
				]);
			});
		} catch (error) {
			// Cancelling stops the twg processes, which then fail; that is not an error to report.
			if (!tokenSource.token.isCancellationRequested) {
				await showError(vscode.l10n.t("Loading pull requests failed."), error);
			}
			return;
		} finally {
			tokenSource.dispose();
		}
		const toItem = (item: InboxItem): LinkItem => ({
			label: `$(${item.draft ? 'git-pull-request-draft' : 'git-pull-request'}) ${item.title}`,
			description: `${item.repo} #${item.id}`,
			detail: `${item.author.displayName} · ${item.sourceBranch} → ${item.destinationBranch}${item.attention.approved ? ` · ${vscode.l10n.t("approved by you")}` : ''}`,
			link: item.link,
		});
		const items: LinkItem[] = [
			{ label: vscode.l10n.t("Waiting for My Review"), kind: vscode.QuickPickItemKind.Separator },
			...toReview.items.filter(item => item.attention.needsAction).map(toItem),
			{ label: vscode.l10n.t("Opened by Me"), kind: vscode.QuickPickItemKind.Separator },
			...mine.items.map(toItem),
		];
		if (items.length === 2) {
			vscode.window.showInformationMessage(vscode.l10n.t("No open pull requests wait for you."));
			return;
		}
		const picked = await vscode.window.showQuickPick(items, { placeHolder: vscode.l10n.t("Pull request to open in the browser"), matchOnDescription: true, matchOnDetail: true });
		if (picked?.link) {
			await vscode.env.openExternal(vscode.Uri.parse(picked.link));
		}
	}

	dispose(): void {
		this.disposed = true;
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

/**
 * Registers the pull request status bar item and the Bitbucket commands.
 */
export function registerBitbucket(context: vscode.ExtensionContext, jira: Jira): void {
	context.subscriptions.push(new Bitbucket(jira));
}
