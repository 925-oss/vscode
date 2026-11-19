/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { replayAnimationClass, SaiyanSettings } from './saiyanSettings.js';

export const POWER_LEVEL_STORAGE_KEY = 'saiyan.powerLevel.total';

const ENTRY_ID = 'saiyan.powerLevel';

const CHARGE_WINDOW_MS = 2000;
const CHARGE_KEYSTROKES = 10; // 5 keystrokes a second starts charging
const CHARGE_COOLDOWN_MS = 900;
const PERSIST_DELAY_MS = 2000;
const RENDER_DELAY_MS = 40;
const BURST_DURATION_MS = 2200;
const TRANSFORM_DURATION_MS = 1600;

/**
 * A form you transform into once your power level is over `over`.
 */
interface ITransformation {
	readonly over: number;
	readonly name: string;
}

const TRANSFORMATIONS: readonly ITransformation[] = [
	{ over: 0, name: localize('saiyan.form.base', "Base Form") },
	{ over: 9000, name: localize('saiyan.form.ss1', "Super Saiyan") },
	{ over: 50000, name: localize('saiyan.form.ss2', "Super Saiyan 2") },
	{ over: 250000, name: localize('saiyan.form.ss3', "Super Saiyan 3") },
	{ over: 1000000, name: localize('saiyan.form.ui', "Ultra Instinct") },
];

const FORM_CLASSES = TRANSFORMATIONS.map((_, index) => `saiyan-form-${index}`);

function formIndexFor(power: number): number {
	let index = 0;
	for (let i = 0; i < TRANSFORMATIONS.length; i++) {
		if (power > TRANSFORMATIONS[i].over) {
			index = i;
		}
	}
	return index;
}

/**
 * Shows a "power level" in the status bar that rises with every keystroke typed
 * in an editor. Typing fast charges it up; crossing a milestone transforms you.
 */
export class SaiyanPowerLevelContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.saiyanPowerLevel';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly editorListeners = this._register(new DisposableMap<ICodeEditor>());
	private readonly animations = this._register(new DisposableStore());

	/** Decorative layer inside the status bar item; carries the charging and burst classes. */
	private readonly auraElement = $('span.saiyan-power-aura', { 'aria-hidden': 'true' });

	private readonly persistScheduler = this._register(new RunOnceScheduler(() => this.persist(), PERSIST_DELAY_MS));
	private readonly renderScheduler = this._register(new RunOnceScheduler(() => this.render(), RENDER_DELAY_MS));
	private readonly chargeCooldown = this._register(new RunOnceScheduler(() => this.setCharging(false), CHARGE_COOLDOWN_MS));

	private power: number;
	private formIndex: number;
	private charging = false;
	private recentKeystrokes: number[] = [];

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILayoutService private readonly layoutService: ILayoutService,
	) {
		super();

		this.power = this.storageService.getNumber(POWER_LEVEL_STORAGE_KEY, StorageScope.APPLICATION, 0);
		this.formIndex = formIndexFor(this.power);

		this._register(this.codeEditorService.onCodeEditorAdd(editor => {
			if (this.enabled) {
				this.watchEditor(editor);
			}
		}));
		this._register(this.codeEditorService.onCodeEditorRemove(editor => this.editorListeners.deleteAndDispose(editor)));

		this.updateEnablement();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SaiyanSettings.PowerLevelEnabled)) {
				this.updateEnablement();
			}
		}));

		// Another window raised the power level, or the reset command ran.
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, POWER_LEVEL_STORAGE_KEY, this._store)(() => {
			const stored = this.storageService.getNumber(POWER_LEVEL_STORAGE_KEY, StorageScope.APPLICATION, 0);
			if (stored !== this.power && !this.persistScheduler.isScheduled()) {
				this.power = stored;
				this.formIndex = formIndexFor(stored);
				this.render();
			}
		}));

		this._register({
			dispose: () => {
				this.persist();
				this.layoutService.mainContainer.classList.remove(...FORM_CLASSES);
			}
		});
	}

	private get enabled(): boolean {
		return this.configurationService.getValue<boolean>(SaiyanSettings.PowerLevelEnabled) !== false;
	}

	private updateEnablement(): void {
		if (!this.enabled) {
			this.entry.clear();
			this.editorListeners.clearAndDisposeAll();
			this.layoutService.mainContainer.classList.remove(...FORM_CLASSES);
			return;
		}

		for (const editor of this.codeEditorService.listCodeEditors()) {
			this.watchEditor(editor);
		}
		this.render();
	}

	private watchEditor(editor: ICodeEditor): void {
		if (this.editorListeners.has(editor)) {
			return;
		}
		this.editorListeners.set(editor, editor.onDidChangeModelContent(e => {
			// Only count what you type: skip undo/redo, reloads, and edits made
			// by tools (format on save, refactors) while the editor isn't focused.
			if (e.isUndoing || e.isRedoing || e.isFlush || e.isEolChange || !editor.hasTextFocus()) {
				return;
			}
			this.onKeystroke();
		}));
	}

	private onKeystroke(): void {
		this.power++;

		const now = Date.now();
		this.recentKeystrokes.push(now);
		while (this.recentKeystrokes.length && now - this.recentKeystrokes[0] > CHARGE_WINDOW_MS) {
			this.recentKeystrokes.shift();
		}
		if (this.recentKeystrokes.length >= CHARGE_KEYSTROKES) {
			this.setCharging(true);
		}
		if (this.charging) {
			this.chargeCooldown.schedule();
		}

		const newFormIndex = formIndexFor(this.power);
		if (newFormIndex > this.formIndex) {
			this.formIndex = newFormIndex;
			this.transform(TRANSFORMATIONS[newFormIndex]);
		}

		this.persistScheduler.schedule();
		if (!this.renderScheduler.isScheduled()) {
			this.renderScheduler.schedule();
		}
	}

	private setCharging(charging: boolean): void {
		if (this.charging === charging) {
			return;
		}
		this.charging = charging;
		this.auraElement.classList.toggle('saiyan-charging', charging);
		this.render();
	}

	private transform(form: ITransformation): void {
		this.notificationService.info(localize('saiyan.transformed', "Your power level is over {0}! You transformed into {1}.", form.over.toLocaleString(), form.name));

		this.animations.clear();
		this.animations.add(replayAnimationClass(this.auraElement, 'saiyan-burst', BURST_DURATION_MS));
		this.animations.add(replayAnimationClass(this.layoutService.mainContainer, 'saiyan-transform', TRANSFORM_DURATION_MS));
	}

	private persist(): void {
		this.persistScheduler.cancel();
		this.storageService.store(POWER_LEVEL_STORAGE_KEY, this.power, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private render(): void {
		if (!this.enabled) {
			return;
		}

		const container = this.layoutService.mainContainer;
		container.classList.remove(...FORM_CLASSES);
		container.classList.add(FORM_CLASSES[this.formIndex]);

		const entry = this.createEntry();
		if (this.entry.value) {
			this.entry.value.update(entry);
		} else {
			this.entry.value = this.statusbarService.addEntry(entry, ENTRY_ID, StatusbarAlignment.RIGHT, Number.MAX_VALUE);
		}
	}

	private createEntry(): IStatusbarEntry {
		const form = TRANSFORMATIONS[this.formIndex];
		const next = TRANSFORMATIONS[this.formIndex + 1];
		const power = this.power.toLocaleString();
		const icon = this.charging ? '$(flame)' : '$(zap)';

		const tooltip = next
			? localize('saiyan.powerLevel.tooltip', "Power level {0} · {1}\nTransform into {2} when you are over {3}.", power, form.name, next.name, next.over.toLocaleString())
			: localize('saiyan.powerLevel.tooltipMax', "Power level {0} · {1}\nYou have reached the final form.", power, form.name);

		return {
			name: localize('saiyan.powerLevel.name', "Power Level"),
			text: `${icon} ${power}`,
			ariaLabel: localize('saiyan.powerLevel.ariaLabel', "Power level {0}, {1}", power, form.name),
			tooltip,
			content: this.auraElement,
		};
	}
}
