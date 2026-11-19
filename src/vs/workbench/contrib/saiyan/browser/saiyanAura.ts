/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { replayAnimationClass, SaiyanSettings } from './saiyanSettings.js';

const AURA_CLASS = 'saiyan-aura';
const SAVE_FLASH_CLASS = 'saiyan-save-flash';
const SAVE_FLASH_DURATION = 750;

/**
 * Turns the workbench-wide aura styling on and off, and flashes an editor
 * with gold energy whenever its file is saved.
 */
export class SaiyanAuraContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.saiyanAura';

	private readonly saveFlash = this._register(new MutableDisposable());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITextFileService textFileService: ITextFileService,
	) {
		super();

		this.updateAuraClass();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SaiyanSettings.AuraEnabled)) {
				this.updateAuraClass();
			}
		}));

		this._register(textFileService.files.onDidSave(e => this.flashEditorsFor(e.model.resource)));
		this._register({ dispose: () => this.layoutService.mainContainer.classList.remove(AURA_CLASS) });
	}

	private updateAuraClass(): void {
		const enabled = this.configurationService.getValue<boolean>(SaiyanSettings.AuraEnabled) !== false;
		this.layoutService.mainContainer.classList.toggle(AURA_CLASS, enabled);
	}

	private flashEditorsFor(resource: URI): void {
		if (this.configurationService.getValue<boolean>(SaiyanSettings.AuraEnabled) === false
			|| this.configurationService.getValue<boolean>(SaiyanSettings.FlashOnSave) === false) {
			return;
		}

		const editor = this.codeEditorService.listCodeEditors().find(candidate =>
			candidate.hasModel() && isEqual(candidate.getModel().uri, resource) && candidate.getDomNode()?.isConnected
		);
		const domNode = editor?.getDomNode();
		if (domNode) {
			this.saveFlash.value = replayAnimationClass(domNode, SAVE_FLASH_CLASS, SAVE_FLASH_DURATION);
		}
	}
}
