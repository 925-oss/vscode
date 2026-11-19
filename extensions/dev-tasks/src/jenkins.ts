/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { createStatusBarItem, excludedFoldersGlob, exists, log, pickWorkspaceFolder, ProcessError, registerFileActions, relativePath, run, showError } from './common';
import { currentBranch } from './git';

const pipelineGlob = '**/{Jenkinsfile,Jenkinsfile.*,*.jenkinsfile}';
const pipelinePattern = /(^|[\\/])(Jenkinsfile[^\\/]*|[^\\/]+\.jenkinsfile)$/;
const jobLinksKey = 'jenkins.jobs';

/**
 * A `jenkins` task, which builds a job and streams its console log.
 */
interface JenkinsTaskDefinition extends vscode.TaskDefinition {
	readonly type: 'jenkins';
	readonly job: string;
}

/**
 * What it takes to start `jenkins-cli.jar`.
 */
interface CliSetup {
	readonly url: string;
	readonly java: string;
	readonly jar: string;
	/** Read by `jenkins-cli.jar` itself, so the token never appears on a command line. */
	readonly env: Record<string, string>;
}

/**
 * A build parameter declared by a job.
 */
interface JobParameter {
	readonly kind: 'string' | 'choice' | 'boolean' | 'password';
	readonly name: string;
	readonly description?: string;
	readonly defaultValue?: string;
	readonly choices: string[];
}

function unescapeXml(text: string): string {
	return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&#xD;|&#13;/g, '').replace(/&amp;/g, '&');
}

function xmlElement(xml: string, name: string): string | undefined {
	const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
	return match ? unescapeXml(match[1]) : undefined;
}

/**
 * Reads the parameter definitions from a job's config.xml.
 */
function parseParameters(configXml: string): JobParameter[] {
	const parameters: JobParameter[] = [];
	for (const match of configXml.matchAll(/<(?<tag>[\w.$-]+ParameterDefinition)(?:\s[^>]*)?>(?<body>[\s\S]*?)<\/\k<tag>>/g)) {
		const { tag, body } = match.groups!;
		const name = xmlElement(body, 'name');
		if (!name) {
			continue;
		}
		const kind = /Choice/.test(tag) ? 'choice' : /Boolean/.test(tag) ? 'boolean' : /Password/.test(tag) ? 'password' : 'string';
		const choices = [...body.matchAll(/<string>([\s\S]*?)<\/string>/g)].map(choice => unescapeXml(choice[1]));
		parameters.push({ kind, name, description: xmlElement(body, 'description'), defaultValue: xmlElement(body, 'defaultValue'), choices });
	}
	return parameters;
}

/**
 * The web address of a job, from its full name such as `Folder/repo/feature%2Fx`.
 */
function jobUrl(baseUrl: string, job: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/${job.split('/').map(segment => `job/${encodeURIComponent(segment)}`).join('/')}/`;
}

/**
 * Runs `jenkins-cli.jar` with the URL, user and API token from settings and secret storage.
 */
class JenkinsCli {

	private javaChecked: string | undefined;

	constructor(private readonly context: vscode.ExtensionContext) { }

	private get config(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration('devTools.jenkins');
	}

	private tokenKey(url: string, user: string): string {
		return `jenkins.apiToken:${user}@${url}`;
	}

	/**
	 * Asks for the server, user and API token, checks them with `who-am-i`, and saves them.
	 */
	async signIn(): Promise<CliSetup | undefined> {
		const url = await vscode.window.showInputBox({ title: vscode.l10n.t("Jenkins Sign In (1/3)"), prompt: vscode.l10n.t("Jenkins server address"), value: this.config.get<string>('url') || 'https://', ignoreFocusOut: true, validateInput: value => /^https?:\/\/[^/]+/.test(value) ? undefined : vscode.l10n.t("Enter an http or https address.") });
		if (!url) {
			return undefined;
		}
		const user = await vscode.window.showInputBox({ title: vscode.l10n.t("Jenkins Sign In (2/3)"), prompt: vscode.l10n.t("Your Jenkins user ID"), value: this.config.get<string>('user'), ignoreFocusOut: true });
		if (!user) {
			return undefined;
		}
		const token = await vscode.window.showInputBox({ title: vscode.l10n.t("Jenkins Sign In (3/3)"), prompt: vscode.l10n.t("API token (create one under your user > Security > API Token)"), password: true, ignoreFocusOut: true });
		if (!token) {
			return undefined;
		}
		const normalizedUrl = url.replace(/\/+$/, '');
		await this.config.update('url', normalizedUrl, vscode.ConfigurationTarget.Global);
		await this.config.update('user', user, vscode.ConfigurationTarget.Global);
		await this.context.secrets.store(this.tokenKey(normalizedUrl, user), token);

		const setup = await this.setup(false);
		if (!setup) {
			return undefined;
		}
		try {
			const whoAmI = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Checking Jenkins sign-in") }, () => this.run(setup, ['who-am-i']));
			const name = /Authenticated as:\s*(.+)/.exec(whoAmI)?.[1]?.trim() ?? user;
			if (name === 'anonymous') {
				throw new Error(vscode.l10n.t("Jenkins accepted the connection as anonymous. Check the user ID and API token."));
			}
			vscode.window.showInformationMessage(vscode.l10n.t("Signed in to Jenkins as {0}.", name));
			return setup;
		} catch (error) {
			await showError(vscode.l10n.t("Signing in to Jenkins failed."), error);
			return undefined;
		}
	}

	/**
	 * Returns the CLI setup, asking to sign in or install Java when something is missing.
	 */
	async setup(signInIfNeeded = true): Promise<CliSetup | undefined> {
		const url = this.config.get<string>('url')?.replace(/\/+$/, '');
		const user = this.config.get<string>('user');
		const token = url && user ? await this.context.secrets.get(this.tokenKey(url, user)) : undefined;
		if (!url || !user || !token) {
			return signInIfNeeded ? this.signIn() : undefined;
		}
		const java = await this.findJava();
		if (!java) {
			return undefined;
		}
		const jar = await this.findJar(url);
		if (!jar) {
			return undefined;
		}
		return { url, java, jar, env: { JENKINS_URL: url, JENKINS_USER_ID: user, JENKINS_API_TOKEN: token } };
	}

	private async findJava(): Promise<string | undefined> {
		const configured = this.config.get<string>('javaPath');
		const candidates = [configured, process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'), 'java'].filter((candidate): candidate is string => !!candidate);
		for (const candidate of candidates) {
			if (candidate === this.javaChecked) {
				return candidate;
			}
			try {
				await run(candidate, ['-version'], { timeout: 15_000 });
				this.javaChecked = candidate;
				return candidate;
			} catch (error) {
				log().info(`Java at ${candidate} is not usable: ${error}`);
			}
		}
		const install = vscode.l10n.t("Install with Homebrew");
		const openSettings = vscode.l10n.t("Set Java Path");
		const choice = await vscode.window.showErrorMessage(vscode.l10n.t("jenkins-cli.jar needs a Java runtime, and none was found. Install one, or set devTools.jenkins.javaPath."), install, openSettings);
		if (choice === install) {
			const terminal = vscode.window.createTerminal({ name: vscode.l10n.t("Install Java") });
			terminal.show();
			terminal.sendText('brew install --cask temurin');
		} else if (choice === openSettings) {
			vscode.commands.executeCommand('workbench.action.openSettings', 'devTools.jenkins.javaPath');
		}
		return undefined;
	}

	/**
	 * The configured jar, or the server's own copy downloaded into the extension's storage.
	 */
	private async findJar(url: string): Promise<string | undefined> {
		const configured = this.config.get<string>('cliJar');
		if (configured) {
			return configured.replace(/^~(?=$|\/)/, process.env.HOME ?? '~');
		}
		const jar = vscode.Uri.joinPath(this.context.globalStorageUri, 'jenkins-cli.jar');
		if (await exists(jar.fsPath)) {
			return jar.fsPath;
		}
		try {
			await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Downloading jenkins-cli.jar from {0}", url) }, async () => {
				const response = await fetch(`${url}/jnlpJars/jenkins-cli.jar`);
				if (!response.ok) {
					throw new Error(`${response.status} ${response.statusText}`);
				}
				await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
				await vscode.workspace.fs.writeFile(jar, new Uint8Array(await response.arrayBuffer()));
			});
			return jar.fsPath;
		} catch (error) {
			await showError(vscode.l10n.t("Downloading jenkins-cli.jar failed. Set devTools.jenkins.cliJar to a local copy."), error);
			return undefined;
		}
	}

	/** Arguments that start the CLI, before the Jenkins command. */
	cliArguments(setup: CliSetup): string[] {
		return ['-jar', setup.jar, '-webSocket'];
	}

	run(setup: CliSetup, args: string[], options: { input?: string; token?: vscode.CancellationToken } = {}): Promise<string> {
		return run(setup.java, [...this.cliArguments(setup), ...args], { env: setup.env, timeout: 60_000, ...options });
	}

	async forgetJar(): Promise<void> {
		try {
			await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.context.globalStorageUri, 'jenkins-cli.jar'));
		} catch {
			// Not downloaded yet.
		}
	}
}

/**
 * Builds, validates and follows the pipelines of the workspace.
 */
class JenkinsPipelines implements vscode.Disposable {

	private readonly cli: JenkinsCli;
	private readonly diagnostics = vscode.languages.createDiagnosticCollection('jenkins');
	private readonly statusBarItem = createStatusBarItem('devTools.jenkins', vscode.l10n.t("Jenkins Build"), 40);
	private readonly disposables: vscode.Disposable[] = [this.diagnostics, this.statusBarItem];

	constructor(private readonly context: vscode.ExtensionContext) {
		this.cli = new JenkinsCli(context);
		this.disposables.push(
			vscode.commands.registerCommand('devTools.jenkins.signIn', async () => {
				await this.cli.forgetJar();
				await this.cli.signIn();
			}),
			vscode.commands.registerCommand('devTools.jenkins.validate', (file?: vscode.Uri) => this.validate(file)),
			vscode.commands.registerCommand('devTools.jenkins.build', (file?: vscode.Uri) => this.build(file)),
			vscode.commands.registerCommand('devTools.jenkins.followLog', (file?: vscode.Uri) => this.followLog(file)),
			vscode.commands.registerCommand('devTools.jenkins.linkJob', (file?: vscode.Uri) => this.pickPipeline(file).then(pipeline => pipeline && this.linkJob(pipeline, true))),
			vscode.commands.registerCommand('devTools.jenkins.openJob', (file?: vscode.Uri) => this.openJob(file)),
			registerFileActions('devTools.jenkins.file', vscode.l10n.t("Pipeline Actions"), `$(rocket) ${vscode.l10n.t("Jenkins")}`, document => pipelinePattern.test(document.uri.fsPath), [
				{ label: `$(play) ${vscode.l10n.t("Build Pipeline…")}`, command: 'devTools.jenkins.build' },
				{ label: `$(check) ${vscode.l10n.t("Validate Pipeline")}`, command: 'devTools.jenkins.validate' },
				{ label: `$(output) ${vscode.l10n.t("Follow Last Build Log")}`, command: 'devTools.jenkins.followLog' },
				{ label: `$(link-external) ${vscode.l10n.t("Open Job in Browser")}`, command: 'devTools.jenkins.openJob' },
				{ label: `$(link) ${vscode.l10n.t("Link Pipeline to Job…")}`, command: 'devTools.jenkins.linkJob' },
			]),
			vscode.workspace.onDidCloseTextDocument(document => this.diagnostics.delete(document.uri)),
			vscode.tasks.onDidEndTaskProcess(event => this.onBuildEnded(event)),
		);
	}

	private async pickPipeline(file: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
		if (file instanceof vscode.Uri) {
			return file;
		}
		const active = vscode.window.activeTextEditor?.document;
		if (active && pipelinePattern.test(active.uri.fsPath)) {
			return active.uri;
		}
		const folder = await pickWorkspaceFolder();
		if (!folder) {
			return undefined;
		}
		const files = (await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pipelineGlob), excludedFoldersGlob, 50)).sort((a, b) => a.fsPath.localeCompare(b.fsPath));
		if (files.length === 0) {
			vscode.window.showInformationMessage(vscode.l10n.t("No Jenkinsfiles found in {0}.", folder.name));
			return undefined;
		}
		if (files.length === 1) {
			return files[0];
		}
		const links = this.links();
		const picked = await vscode.window.showQuickPick(files.map(file => ({ label: path.basename(file.fsPath), description: relativePath(folder, file), detail: links[file.toString()] && vscode.l10n.t("Job: {0}", links[file.toString()]), file })), { placeHolder: vscode.l10n.t("Select a pipeline") });
		return picked?.file;
	}

	private links(): Record<string, string> {
		return this.context.workspaceState.get<Record<string, string>>(jobLinksKey, {});
	}

	/**
	 * Returns the job a pipeline file builds, asking for it the first time. The answer is kept in workspace state.
	 */
	private async linkJob(pipeline: vscode.Uri, change = false): Promise<string | undefined> {
		const links = this.links();
		const linked = links[pipeline.toString()];
		if (linked && !change) {
			return linked;
		}
		const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(pipeline));
		// Pipelines often name their job in a comment, such as `// Jenkins (jenkins.example.com, job Team/repo)`.
		const mentioned = /^\s*\/\/.*\bjob\s+([^\s,;()]+)/im.exec(text)?.[1];
		const job = await vscode.window.showInputBox({
			title: vscode.l10n.t("Jenkins Job for {0}", path.basename(pipeline.fsPath)),
			prompt: vscode.l10n.t("Full job name, with folders separated by /. For a multibranch pipeline, give the pipeline itself; the current branch is added when building."),
			value: linked ?? mentioned,
			placeHolder: 'Folder/repository',
			ignoreFocusOut: true,
		});
		if (!job) {
			return undefined;
		}
		await this.context.workspaceState.update(jobLinksKey, { ...links, [pipeline.toString()]: job.replace(/^\/+|\/+$/g, '') });
		return job;
	}

	/**
	 * Resolves the job to build: for a multibranch pipeline, the job of the current branch.
	 */
	private async resolveJob(setup: CliSetup, pipeline: vscode.Uri, token: vscode.CancellationToken): Promise<{ readonly job: string; readonly configXml: string } | undefined> {
		const job = await this.linkJob(pipeline);
		if (!job) {
			return undefined;
		}
		const configXml = await this.cli.run(setup, ['get-job', job], { token });
		const root = /<([\w.$-]+)[\s>]/.exec(configXml.replace(/<\?xml[^>]*\?>/, ''))?.[1] ?? '';
		if (!/MultiBranchProject|OrganizationFolder/.test(root)) {
			return { job, configXml };
		}
		const branch = await currentBranch(pipeline);
		if (!branch) {
			throw new Error(vscode.l10n.t("{0} is a multibranch pipeline, and no branch is checked out.", job));
		}
		const branchJob = `${job}/${encodeURIComponent(branch)}`;
		return { job: branchJob, configXml: await this.cli.run(setup, ['get-job', branchJob], { token }) };
	}

	private async askParameters(job: string, parameters: JobParameter[], pipeline: vscode.Uri): Promise<Record<string, string> | undefined> {
		const values: Record<string, string> = {};
		const branch = await currentBranch(pipeline);
		for (const [index, parameter] of parameters.entries()) {
			const title = vscode.l10n.t("Build {0} ({1}/{2}): {3}", job, index + 1, parameters.length, parameter.name);
			let value: string | undefined;
			if (parameter.kind === 'choice' || parameter.kind === 'boolean') {
				const options = parameter.kind === 'boolean' ? (parameter.defaultValue === 'true' ? ['true', 'false'] : ['false', 'true']) : parameter.choices;
				value = (await vscode.window.showQuickPick(options.map(option => ({ label: option })), { title, placeHolder: parameter.description, ignoreFocusOut: true }))?.label;
			} else {
				const defaultValue = /branch/i.test(parameter.name) && branch && !parameter.defaultValue ? branch : parameter.defaultValue;
				value = await vscode.window.showInputBox({ title, prompt: parameter.description, value: defaultValue, password: parameter.kind === 'password', ignoreFocusOut: true });
			}
			if (value === undefined) {
				return undefined;
			}
			values[parameter.name] = value;
		}
		return values;
	}

	private async build(file: vscode.Uri | undefined): Promise<void> {
		const pipeline = await this.pickPipeline(file);
		const setup = pipeline && await this.cli.setup();
		if (!pipeline || !setup) {
			return;
		}
		let resolved: { readonly job: string; readonly configXml: string } | undefined;
		try {
			resolved = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Reading the Jenkins job"), cancellable: true }, (_progress, token) => this.resolveJob(setup, pipeline, token));
		} catch (error) {
			await showError(vscode.l10n.t("Reading the Jenkins job failed."), error);
			return;
		}
		if (!resolved) {
			return;
		}
		const parameters = await this.askParameters(resolved.job, parseParameters(resolved.configXml), pipeline);
		if (!parameters) {
			return;
		}

		const args = [...this.cli.cliArguments(setup), 'build', resolved.job, '-f', '-v', ...Object.entries(parameters).flatMap(([name, value]) => ['-p', `${name}=${value}`])];
		// Parameter values stay out of the definition, which is kept in the recently used tasks.
		const definition: JenkinsTaskDefinition = { type: 'jenkins', job: resolved.job };
		const folder = vscode.workspace.getWorkspaceFolder(pipeline) ?? vscode.TaskScope.Workspace;
		const task = new vscode.Task(definition, folder, vscode.l10n.t("build {0}", resolved.job), 'jenkins', new vscode.ShellExecution(setup.java, args, { env: setup.env }), []);
		task.detail = `jenkins-cli build ${resolved.job}`;
		task.presentationOptions = { panel: vscode.TaskPanelKind.Dedicated, reveal: vscode.TaskRevealKind.Always };
		this.showBuild(resolved.job, setup.url, 'running');
		await vscode.tasks.executeTask(task);
	}

	private onBuildEnded(event: vscode.TaskProcessEndEvent): void {
		const definition = event.execution.task.definition;
		if (definition.type !== 'jenkins') {
			return;
		}
		const job = (definition as JenkinsTaskDefinition).job;
		const url = vscode.workspace.getConfiguration('devTools.jenkins').get<string>('url') ?? '';
		const succeeded = event.exitCode === 0;
		this.showBuild(job, url, succeeded ? 'succeeded' : 'failed');
		const open = vscode.l10n.t("Open in Browser");
		const message = succeeded ? vscode.l10n.t("Jenkins build of {0} succeeded.", job) : vscode.l10n.t("Jenkins build of {0} did not succeed (exit code {1}).", job, String(event.exitCode));
		(succeeded ? vscode.window.showInformationMessage(message, open) : vscode.window.showWarningMessage(message, open)).then(choice => {
			if (choice === open) {
				vscode.env.openExternal(vscode.Uri.parse(`${jobUrl(url, job)}lastBuild/`));
			}
		});
	}

	private showBuild(job: string, url: string, state: 'running' | 'succeeded' | 'failed'): void {
		const icon = state === 'running' ? '$(sync~spin)' : state === 'succeeded' ? '$(pass)' : '$(error)';
		this.statusBarItem.text = `${icon} ${job.split('/').map(segment => decodeURIComponent(segment)).pop()}`;
		this.statusBarItem.tooltip = vscode.l10n.t("Jenkins: {0} ({1}). Click to open the build.", job, state);
		this.statusBarItem.backgroundColor = state === 'failed' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
		this.statusBarItem.command = { title: vscode.l10n.t("Open in Browser"), command: 'vscode.open', arguments: [vscode.Uri.parse(`${jobUrl(url, job)}lastBuild/`)] };
		this.statusBarItem.show();
	}

	private async followLog(file: vscode.Uri | undefined): Promise<void> {
		const pipeline = await this.pickPipeline(file);
		const setup = pipeline && await this.cli.setup();
		if (!pipeline || !setup) {
			return;
		}
		try {
			const resolved = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Reading the Jenkins job"), cancellable: true }, (_progress, token) => this.resolveJob(setup, pipeline, token));
			if (!resolved) {
				return;
			}
			const terminal = vscode.window.createTerminal({ name: vscode.l10n.t("Jenkins: {0}", resolved.job), shellPath: setup.java, shellArgs: [...this.cli.cliArguments(setup), 'console', resolved.job, '-f'], env: setup.env });
			terminal.show();
		} catch (error) {
			await showError(vscode.l10n.t("Reading the Jenkins job failed."), error);
		}
	}

	private async openJob(file: vscode.Uri | undefined): Promise<void> {
		const pipeline = await this.pickPipeline(file);
		const job = pipeline && await this.linkJob(pipeline);
		const url = vscode.workspace.getConfiguration('devTools.jenkins').get<string>('url');
		if (job && url) {
			await vscode.env.openExternal(vscode.Uri.parse(jobUrl(url, job)));
		}
	}

	/**
	 * Checks a declarative pipeline with the server's `declarative-linter` and shows the errors in the file.
	 */
	private async validate(file: vscode.Uri | undefined): Promise<void> {
		const pipeline = await this.pickPipeline(file);
		const setup = pipeline && await this.cli.setup();
		if (!pipeline || !setup) {
			return;
		}
		const document = await vscode.workspace.openTextDocument(pipeline);
		let output: string;
		try {
			output = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t("Validating {0}", path.basename(pipeline.fsPath)) }, () => this.cli.run(setup, ['declarative-linter'], { input: document.getText() }));
		} catch (error) {
			if (!(error instanceof ProcessError) || !/WorkflowScript|Errors encountered/.test(error.stdout + error.message)) {
				await showError(vscode.l10n.t("Validating the pipeline failed."), error);
				return;
			}
			output = `${error.stdout}\n${error.message}`;
		}

		const diagnostics: vscode.Diagnostic[] = [];
		for (const match of output.matchAll(/WorkflowScript: \d+: (?<message>[\s\S]*?) @ line (?<line>\d+), column (?<column>\d+)\./g)) {
			const position = new vscode.Position(Math.max(0, Number(match.groups!.line) - 1), Math.max(0, Number(match.groups!.column) - 1));
			const range = document.getWordRangeAtPosition(position) ?? new vscode.Range(position, position.translate(0, 1));
			const diagnostic = new vscode.Diagnostic(range, match.groups!.message.trim(), vscode.DiagnosticSeverity.Error);
			diagnostic.source = 'jenkins';
			diagnostics.push(diagnostic);
		}
		this.diagnostics.set(pipeline, diagnostics);
		if (diagnostics.length === 0 && /successfully validated/i.test(output)) {
			vscode.window.showInformationMessage(vscode.l10n.t("{0} is a valid declarative pipeline.", path.basename(pipeline.fsPath)));
		} else if (diagnostics.length === 0) {
			log().info(output);
			vscode.window.showWarningMessage(vscode.l10n.t("Jenkins could not validate {0}. Scripted pipelines can't be checked by the declarative linter.", path.basename(pipeline.fsPath)));
		}
	}

	dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

/**
 * Registers the Jenkins commands.
 */
export function registerJenkins(context: vscode.ExtensionContext): void {
	context.subscriptions.push(new JenkinsPipelines(context));
}
