import { Throttler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { EnablementState, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { QuenchlightSettings } from './quenchlightSettings.js';

const ANGULAR_EXTENSION = { id: 'angular.ng-template' };

/**
 * Workspace-scoped record of what this contribution did, so it only ever undoes
 * its own change and never overrides a choice made in the Extensions view.
 * - `disabled`: Quenchlight disabled the Angular extension in this workspace.
 * - `userEnabled`: the extension was re-enabled by hand after that; leave it alone.
 */
const GATE_STORAGE_KEY = 'quenchlight.angularGate';

type GateState = 'disabled' | 'userEnabled';

/**
 * Turns the Angular Language Service off in workspaces that don't use Angular,
 * so it neither starts nor asks about the workspace's TypeScript compiler there,
 * and turns it back on once the workspace does use Angular.
 */
export class QuenchlightAngularGateContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.quenchlightAngularGate';

	private readonly throttler = this._register(new Throttler());

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.scheduleUpdate();
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.scheduleUpdate()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuenchlightSettings.AngularOnlyInAngularWorkspaces)) {
				this.scheduleUpdate();
			}
		}));
	}

	private scheduleUpdate(): void {
		this.throttler.queue(() => this.update()).catch(error => this.logService.error('[quenchlight] Angular gate failed', error));
	}

	private async update(): Promise<void> {
		// Workspace enablement needs a workspace.
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return;
		}

		const installed = await this.extensionManagementService.getInstalled();
		const angular = installed.find(extension => areSameExtensions(extension.identifier, ANGULAR_EXTENSION));
		if (!angular || !this.extensionEnablementService.canChangeWorkspaceEnablement(angular)) {
			return;
		}

		const gateState = this.storageService.get(GATE_STORAGE_KEY, StorageScope.WORKSPACE) as GateState | undefined;
		const gateEnabled = this.configurationService.getValue<boolean>(QuenchlightSettings.AngularOnlyInAngularWorkspaces) !== false;

		if (!gateEnabled || await this.workspaceUsesAngular()) {
			if (gateState === 'disabled' && this.extensionEnablementService.getEnablementState(angular) === EnablementState.DisabledWorkspace) {
				await this.extensionEnablementService.setEnablement([angular], EnablementState.EnabledWorkspace);
				this.logService.info('[quenchlight] Re-enabled the Angular Language Service in this workspace.');
			}
			this.storageService.remove(GATE_STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}

		const enabled = this.extensionEnablementService.isEnabled(angular);
		if (gateState === 'disabled' && enabled) {
			this.storageService.store(GATE_STORAGE_KEY, 'userEnabled' satisfies GateState, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			return;
		}
		if (gateState === undefined && enabled) {
			await this.extensionEnablementService.setEnablement([angular], EnablementState.DisabledWorkspace);
			this.storageService.store(GATE_STORAGE_KEY, 'disabled' satisfies GateState, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			this.logService.info('[quenchlight] Disabled the Angular Language Service in this workspace because it does not use Angular.');
		}
	}

	private async workspaceUsesAngular(): Promise<boolean> {
		const results = await Promise.all(this.contextService.getWorkspace().folders.map(folder => this.folderUsesAngular(folder.uri)));
		return results.some(Boolean);
	}

	private async folderUsesAngular(folder: URI): Promise<boolean> {
		if (await this.fileService.exists(joinPath(folder, 'angular.json'))) {
			return true;
		}

		try {
			const content = await this.fileService.readFile(joinPath(folder, 'package.json'));
			const manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> } = JSON.parse(content.value.toString());
			return [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies].some(dependencies => !!dependencies?.['@angular/core']);
		} catch {
			return false; // no package.json, or not valid JSON
		}
	}
}
