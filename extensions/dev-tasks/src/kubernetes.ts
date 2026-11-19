/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createStatusBarItem, isAvailable, log, run, runJson, showError, watchFile } from './common';

interface KubeConfig {
	readonly 'current-context'?: string;
	readonly contexts?: { readonly name: string; readonly context?: { readonly cluster?: string; readonly namespace?: string } }[];
}

interface KubeList<T> {
	readonly items: T[];
}

interface Pod {
	readonly metadata: { readonly name: string; readonly creationTimestamp?: string };
	readonly spec: { readonly containers: { readonly name: string }[] };
	readonly status: { readonly phase?: string; readonly containerStatuses?: { readonly ready: boolean; readonly restartCount: number }[] };
}

interface Service {
	readonly metadata: { readonly name: string };
	readonly spec: { readonly ports?: { readonly name?: string; readonly port: number; readonly protocol?: string }[] };
}

/**
 * The current context and namespace, as `kubectl` will use them.
 */
interface KubeState {
	readonly context: string;
	readonly namespace: string;
	readonly isProduction: boolean;
	readonly contexts: string[];
}

function kubeconfigFiles(): string[] {
	const fromEnvironment = process.env.KUBECONFIG?.split(path.delimiter).filter(file => file.length > 0);
	return fromEnvironment?.length ? fromEnvironment : [path.join(os.homedir(), '.kube', 'config')];
}

function isProductionContext(context: string): boolean {
	const pattern = vscode.workspace.getConfiguration('devTools.kubernetes').get<string>('productionContextPattern');
	if (!pattern) {
		return false;
	}
	try {
		return new RegExp(pattern, 'i').test(context);
	} catch {
		return false;
	}
}

function age(timestamp: string | undefined): string {
	if (!timestamp) {
		return '';
	}
	const minutes = Math.floor((Date.now() - Date.parse(timestamp)) / 60_000);
	if (minutes < 60) {
		return `${minutes}m`;
	}
	return minutes < 24 * 60 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / (24 * 60))}d`;
}

/**
 * Shows the current kube context in the status bar and offers pod commands for it.
 */
class Kubernetes implements vscode.Disposable {

	private readonly statusBarItem = createStatusBarItem('devTools.kubernetes', vscode.l10n.t("Kubernetes Context"), 30);
	private readonly disposables: vscode.Disposable[] = [this.statusBarItem];
	private state: KubeState | undefined;

	constructor() {
		this.disposables.push(
			...kubeconfigFiles().map(file => watchFile(file, () => this.refresh())),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('devTools.kubernetes')) {
					this.refresh();
				}
			}),
			vscode.commands.registerCommand('devTools.kubernetes.switchContext', () => this.switchContext()),
			vscode.commands.registerCommand('devTools.kubernetes.switchNamespace', () => this.switchNamespace()),
			vscode.commands.registerCommand('devTools.kubernetes.logs', () => this.followLogs()),
			vscode.commands.registerCommand('devTools.kubernetes.shell', () => this.openShell()),
			vscode.commands.registerCommand('devTools.kubernetes.portForward', () => this.portForward()),
			vscode.commands.registerCommand('devTools.kubernetes.describe', () => this.describePod()),
		);
		this.refresh();
	}

	async refresh(): Promise<void> {
		if (!vscode.workspace.getConfiguration('devTools.kubernetes').get<boolean>('statusBar') || !await isAvailable('kubectl', ['version', '--client'])) {
			this.statusBarItem.hide();
			return;
		}
		try {
			const config = await runJson<KubeConfig>('kubectl', ['config', 'view', '-o', 'json']);
			const context = config['current-context'];
			if (!context) {
				this.state = undefined;
				this.statusBarItem.hide();
				return;
			}
			const namespace = config.contexts?.find(entry => entry.name === context)?.context?.namespace ?? 'default';
			this.state = { context, namespace, isProduction: isProductionContext(context), contexts: (config.contexts ?? []).map(entry => entry.name) };
		} catch (error) {
			log().warn(`Reading the kubeconfig failed: ${error}`);
			this.statusBarItem.hide();
			return;
		}
		const { context, namespace, isProduction } = this.state;
		this.statusBarItem.text = `${isProduction ? '$(warning)' : '$(server-environment)'} ${context}${namespace === 'default' ? '' : ` · ${namespace}`}`;
		this.statusBarItem.tooltip = isProduction
			? vscode.l10n.t("Kubernetes: {0}, namespace {1}. This looks like a production cluster.", context, namespace)
			: vscode.l10n.t("Kubernetes: {0}, namespace {1}. Click to switch.", context, namespace);
		this.statusBarItem.backgroundColor = isProduction ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
		this.statusBarItem.command = 'devTools.kubernetes.switchContext';
		this.statusBarItem.show();
	}

	private async currentState(): Promise<KubeState | undefined> {
		if (!this.state) {
			await this.refresh();
		}
		if (!this.state) {
			vscode.window.showInformationMessage(vscode.l10n.t("No Kubernetes context is selected. Get cluster credentials first, for example with Azure: Get AKS Credentials."));
		}
		return this.state;
	}

	private async switchContext(): Promise<void> {
		const state = await this.currentState();
		if (!state) {
			return;
		}
		type Item = vscode.QuickPickItem & { readonly context?: string; readonly action?: () => Promise<void> };
		const items: Item[] = [
			{ label: `$(symbol-namespace) ${vscode.l10n.t("Change Namespace…")}`, description: state.namespace, action: () => this.switchNamespace() },
			{ label: '', kind: vscode.QuickPickItemKind.Separator },
			...state.contexts.map(context => ({ label: `${context === state.context ? '$(check)' : '$(blank)'} ${context}`, description: isProductionContext(context) ? vscode.l10n.t("production") : undefined, context })),
		];
		const picked = await vscode.window.showQuickPick(items, { placeHolder: vscode.l10n.t("Current context: {0}", state.context) });
		if (picked?.action) {
			await picked.action();
		} else if (picked?.context && picked.context !== state.context) {
			try {
				await run('kubectl', ['config', 'use-context', picked.context]);
				await this.refresh();
			} catch (error) {
				await showError(vscode.l10n.t("Switching the Kubernetes context failed."), error);
			}
		}
	}

	private async switchNamespace(): Promise<void> {
		const state = await this.currentState();
		if (!state) {
			return;
		}
		try {
			const namespaces = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t("Listing namespaces") }, () => runJson<KubeList<{ metadata: { name: string } }>>('kubectl', ['get', 'namespaces', '-o', 'json'], { timeout: 20_000 }));
			const picked = await vscode.window.showQuickPick(namespaces.items.map(item => ({ label: item.metadata.name, picked: item.metadata.name === state.namespace, description: item.metadata.name === state.namespace ? vscode.l10n.t("current") : undefined })), { placeHolder: vscode.l10n.t("Namespace for {0}", state.context) });
			if (picked && picked.label !== state.namespace) {
				await run('kubectl', ['config', 'set-context', '--current', `--namespace=${picked.label}`]);
				await this.refresh();
			}
		} catch (error) {
			await showError(vscode.l10n.t("Listing namespaces failed."), error);
		}
	}

	private async pickPod(placeHolder: string): Promise<{ readonly pod: string; readonly container: string } | undefined> {
		const state = await this.currentState();
		if (!state) {
			return undefined;
		}
		let pods: Pod[];
		try {
			pods = (await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t("Listing pods") }, () => runJson<KubeList<Pod>>('kubectl', ['get', 'pods', '-o', 'json'], { timeout: 20_000 }))).items;
		} catch (error) {
			await showError(vscode.l10n.t("Listing pods failed."), error);
			return undefined;
		}
		if (pods.length === 0) {
			vscode.window.showInformationMessage(vscode.l10n.t("No pods in namespace {0} of {1}.", state.namespace, state.context));
			return undefined;
		}
		const picked = await vscode.window.showQuickPick(pods.map(pod => {
			const statuses = pod.status.containerStatuses ?? [];
			const ready = statuses.filter(status => status.ready).length;
			const restarts = statuses.reduce((sum, status) => sum + status.restartCount, 0);
			return {
				label: pod.metadata.name,
				description: `${pod.status.phase ?? ''} · ${ready}/${pod.spec.containers.length}`,
				detail: vscode.l10n.t("{0} restarts · {1} old", restarts, age(pod.metadata.creationTimestamp)),
				pod,
			};
		}), { placeHolder: `${placeHolder} (${state.context} · ${state.namespace})`, matchOnDescription: true });
		if (!picked) {
			return undefined;
		}
		const containers = picked.pod.spec.containers.map(container => container.name);
		const container = containers.length === 1 ? containers[0] : await vscode.window.showQuickPick(containers, { placeHolder: vscode.l10n.t("Container in {0}", picked.label) });
		return container ? { pod: picked.label, container } : undefined;
	}

	private openTerminal(name: string, args: string[]): void {
		const terminal = vscode.window.createTerminal({ name, shellPath: 'kubectl', shellArgs: args, iconPath: new vscode.ThemeIcon('server-environment'), color: this.state?.isProduction ? new vscode.ThemeColor('terminal.ansiRed') : undefined });
		terminal.show();
	}

	private async followLogs(): Promise<void> {
		const target = await this.pickPod(vscode.l10n.t("Pod to follow logs of"));
		if (target) {
			this.openTerminal(vscode.l10n.t("logs: {0}", target.pod), ['logs', '--follow', '--tail=200', target.pod, '-c', target.container]);
		}
	}

	private async openShell(): Promise<void> {
		const target = await this.pickPod(vscode.l10n.t("Pod to open a shell in"));
		if (!target) {
			return;
		}
		if (this.state?.isProduction) {
			const proceed = vscode.l10n.t("Open Shell");
			if (await vscode.window.showWarningMessage(vscode.l10n.t("Open a shell in {0} on production context {1}?", target.pod, this.state.context), { modal: true }, proceed) !== proceed) {
				return;
			}
		}
		this.openTerminal(vscode.l10n.t("shell: {0}", target.pod), ['exec', '-it', target.pod, '-c', target.container, '--', 'sh', '-c', 'command -v bash >/dev/null && exec bash || exec sh']);
	}

	private async portForward(): Promise<void> {
		const state = await this.currentState();
		if (!state) {
			return;
		}
		let services: Service[];
		try {
			services = (await runJson<KubeList<Service>>('kubectl', ['get', 'services', '-o', 'json'], { timeout: 20_000 })).items;
		} catch (error) {
			await showError(vscode.l10n.t("Listing services failed."), error);
			return;
		}
		const picked = await vscode.window.showQuickPick(services.flatMap(service => (service.spec.ports ?? []).map(port => ({
			label: service.metadata.name,
			description: `${port.port}/${port.protocol ?? 'TCP'}${port.name ? ` (${port.name})` : ''}`,
			service: service.metadata.name,
			port: port.port,
		}))), { placeHolder: vscode.l10n.t("Service to forward ({0} · {1})", state.context, state.namespace), matchOnDescription: true });
		if (!picked) {
			return;
		}
		const localPort = await vscode.window.showInputBox({ prompt: vscode.l10n.t("Local port for {0}:{1}", picked.service, picked.port), value: String(picked.port), validateInput: value => /^\d{1,5}$/.test(value) && Number(value) <= 65535 ? undefined : vscode.l10n.t("Enter a port number.") });
		if (localPort) {
			this.openTerminal(vscode.l10n.t("forward: {0} → {1}", localPort, picked.service), ['port-forward', `service/${picked.service}`, `${localPort}:${picked.port}`]);
		}
	}

	private async describePod(): Promise<void> {
		const target = await this.pickPod(vscode.l10n.t("Pod to describe"));
		if (!target) {
			return;
		}
		try {
			const description = await run('kubectl', ['describe', 'pod', target.pod], { timeout: 20_000 });
			const document = await vscode.workspace.openTextDocument({ content: description, language: 'yaml' });
			await vscode.window.showTextDocument(document, { preview: true });
		} catch (error) {
			await showError(vscode.l10n.t("Describing {0} failed.", target.pod), error);
		}
	}

	dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

/**
 * Registers the Kubernetes status bar item and commands.
 */
export function registerKubernetes(context: vscode.ExtensionContext): void {
	context.subscriptions.push(new Kubernetes());
}
