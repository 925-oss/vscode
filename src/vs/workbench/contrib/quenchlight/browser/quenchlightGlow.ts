import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { QuenchlightSettings, replayAnimationClass } from './quenchlightSettings.js';

const GLOW_CLASS = 'quenchlight-glow';
const SAVE_FLASH_CLASS = 'quenchlight-save-flash';
const SAVE_FLASH_DURATION = 750;

/**
 * Turns the workbench-wide forge glow on and off, and flashes an editor with
 * heat whenever its file is saved.
 */
export class QuenchlightGlowContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.quenchlightGlow';

	private readonly saveFlash = this._register(new MutableDisposable());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITextFileService textFileService: ITextFileService,
	) {
		super();

		this.updateGlowClass();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuenchlightSettings.GlowEnabled)) {
				this.updateGlowClass();
			}
		}));

		this._register(textFileService.files.onDidSave(e => this.flashEditorsFor(e.model.resource)));
		this._register({ dispose: () => this.layoutService.mainContainer.classList.remove(GLOW_CLASS) });
	}

	private updateGlowClass(): void {
		const enabled = this.configurationService.getValue<boolean>(QuenchlightSettings.GlowEnabled) !== false;
		this.layoutService.mainContainer.classList.toggle(GLOW_CLASS, enabled);
	}

	private flashEditorsFor(resource: URI): void {
		if (this.configurationService.getValue<boolean>(QuenchlightSettings.GlowEnabled) === false
			|| this.configurationService.getValue<boolean>(QuenchlightSettings.FlashOnSave) === false) {
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
