import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createStatusBarItem, isAvailable, log, run, runJson, showError, watchFile } from './common';

interface Subscription {
	readonly id: string;
	readonly name: string;
	readonly isDefault?: boolean;
	readonly user?: { readonly name?: string };
}

interface ManagedCluster {
	readonly name: string;
	readonly resourceGroup: string;
	readonly location?: string;
	readonly version?: string;
	readonly power?: string;
}

function isSignedOut(error: unknown): boolean {
	return /az login|Please run 'az login'|AADSTS|expired/i.test(error instanceof Error ? error.message : String(error));
}

/**
 * Shows the active Azure subscription in the status bar and gets AKS credentials.
 */
class Azure implements vscode.Disposable {

	private readonly statusBarItem = createStatusBarItem('devTools.azure', vscode.l10n.t("Azure Subscription"), 29);
	private readonly disposables: vscode.Disposable[] = [this.statusBarItem];

	constructor() {
		const configDirectory = process.env.AZURE_CONFIG_DIR ?? path.join(os.homedir(), '.azure');
		this.disposables.push(
			watchFile(path.join(configDirectory, 'azureProfile.json'), () => this.refresh()),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('devTools.azure.statusBar')) {
					this.refresh();
				}
			}),
			vscode.commands.registerCommand('devTools.azure.signIn', () => this.signIn()),
			vscode.commands.registerCommand('devTools.azure.switchSubscription', () => this.switchSubscription()),
			vscode.commands.registerCommand('devTools.azure.getAksCredentials', () => this.getAksCredentials()),
		);
		this.refresh();
	}

	async refresh(): Promise<void> {
		if (!vscode.workspace.getConfiguration('devTools.azure').get<boolean>('statusBar') || !await isAvailable('az', ['version', '-o', 'none'])) {
			this.statusBarItem.hide();
			return;
		}
		try {
			const subscription = await runJson<Subscription>('az', ['account', 'show', '-o', 'json']);
			this.statusBarItem.text = `$(azure) ${subscription.name}`;
			this.statusBarItem.tooltip = vscode.l10n.t("Azure: {0} ({1}) as {2}. Click to switch.", subscription.name, subscription.id, subscription.user?.name ?? '');
			this.statusBarItem.command = 'devTools.azure.switchSubscription';
		} catch (error) {
			log().info(`az account show failed: ${error}`);
			this.statusBarItem.text = `$(azure) ${vscode.l10n.t("Sign In")}`;
			this.statusBarItem.tooltip = vscode.l10n.t("Azure CLI is signed out. Click to run az login.");
			this.statusBarItem.command = 'devTools.azure.signIn';
		}
		this.statusBarItem.show();
	}

	private signIn(): void {
		const terminal = vscode.window.createTerminal({ name: 'az login', iconPath: new vscode.ThemeIcon('azure') });
		terminal.show();
		terminal.sendText('az login');
	}

	private async handleError(message: string, error: unknown): Promise<void> {
		if (isSignedOut(error)) {
			const signIn = vscode.l10n.t("Sign In");
			if (await vscode.window.showWarningMessage(vscode.l10n.t("Azure CLI is signed out."), signIn) === signIn) {
				this.signIn();
			}
		} else {
			await showError(message, error);
		}
	}

	private async switchSubscription(): Promise<void> {
		try {
			const subscriptions = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t("Listing Azure subscriptions") }, () => runJson<Subscription[]>('az', ['account', 'list', '-o', 'json']));
			const picked = await vscode.window.showQuickPick(subscriptions.map(subscription => ({
				label: `${subscription.isDefault ? '$(check)' : '$(blank)'} ${subscription.name}`,
				description: subscription.id,
				subscription,
			})), { placeHolder: vscode.l10n.t("Azure subscription"), matchOnDescription: true });
			if (picked && !picked.subscription.isDefault) {
				await run('az', ['account', 'set', '--subscription', picked.subscription.id]);
				await this.refresh();
			}
		} catch (error) {
			await this.handleError(vscode.l10n.t("Switching the Azure subscription failed."), error);
		}
	}

	/**
	 * Merges an AKS cluster's credentials into the kubeconfig and selects its context.
	 */
	private async getAksCredentials(): Promise<void> {
		let clusters: ManagedCluster[];
		try {
			clusters = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Listing AKS clusters") }, () => runJson<ManagedCluster[]>('az', ['aks', 'list', '--query', '[].{name:name, resourceGroup:resourceGroup, location:location, version:kubernetesVersion, power:powerState.code}', '-o', 'json'], { timeout: 60_000 }));
		} catch (error) {
			await this.handleError(vscode.l10n.t("Listing AKS clusters failed."), error);
			return;
		}
		if (clusters.length === 0) {
			vscode.window.showInformationMessage(vscode.l10n.t("No AKS clusters in the current subscription. Switch subscription from the status bar."));
			return;
		}
		const picked = await vscode.window.showQuickPick(clusters.map(cluster => ({
			label: cluster.name,
			description: cluster.resourceGroup,
			detail: [cluster.location, cluster.version && `v${cluster.version}`, cluster.power].filter(Boolean).join(' · '),
			cluster,
		})), { placeHolder: vscode.l10n.t("AKS cluster to connect to"), matchOnDescription: true });
		if (!picked) {
			return;
		}
		try {
			await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Getting credentials for {0}", picked.cluster.name) }, async () => {
				await run('az', ['aks', 'get-credentials', '--resource-group', picked.cluster.resourceGroup, '--name', picked.cluster.name, '--overwrite-existing'], { timeout: 60_000 });
				// Entra ID clusters authenticate through kubelogin. Make it reuse the az login instead of asking for a device code.
				if (await isAvailable('kubelogin', ['--version'])) {
					await run('kubelogin', ['convert-kubeconfig', '--login', 'azurecli', '--context', picked.cluster.name]).catch(error => log().info(`kubelogin convert-kubeconfig: ${error}`));
				}
			});
			vscode.window.showInformationMessage(vscode.l10n.t("kubectl now uses {0}.", picked.cluster.name));
		} catch (error) {
			await this.handleError(vscode.l10n.t("Getting credentials for {0} failed.", picked.cluster.name), error);
		}
	}

	dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

/**
 * Registers the Azure status bar item and commands.
 */
export function registerAzure(context: vscode.ExtensionContext): void {
	context.subscriptions.push(new Azure());
}
