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
import { QuenchlightSettings, replayAnimationClass } from './quenchlightSettings.js';

export const STRIKES_STORAGE_KEY = 'quenchlight.temper.strikes';

const ENTRY_ID = 'quenchlight.temper';

const HEAT_WINDOW_MS = 2000;
const HEAT_KEYSTROKES = 10; // 5 keystrokes a second heats the steel
const HEAT_COOLDOWN_MS = 900;
const PERSIST_DELAY_MS = 2000;
const RENDER_DELAY_MS = 40;
const QUENCH_DURATION_MS = 2200;
const TEMPERING_DURATION_MS = 1600;

/**
 * A temper color the steel takes once it has had more than `over` strikes.
 * The colors follow the order steel shows them as it is heated.
 */
interface ITemper {
	readonly over: number;
	readonly name: string;
}

const TEMPERS: readonly ITemper[] = [
	{ over: 0, name: localize('quenchlight.temper.bright', "Bright Steel") },
	{ over: 10000, name: localize('quenchlight.temper.straw', "Straw Temper") },
	{ over: 50000, name: localize('quenchlight.temper.bronze', "Bronze Temper") },
	{ over: 250000, name: localize('quenchlight.temper.violet', "Violet Temper") },
	{ over: 1000000, name: localize('quenchlight.temper.blue', "Blue Temper") },
];

const TEMPER_CLASSES = TEMPERS.map((_, index) => `quenchlight-temper-${index}`);

function temperIndexFor(strikes: number): number {
	let index = 0;
	for (let i = 0; i < TEMPERS.length; i++) {
		if (strikes > TEMPERS[i].over) {
			index = i;
		}
	}
	return index;
}

/**
 * Counts every keystroke typed in an editor as a hammer strike and shows the
 * total in the status bar. Typing fast heats the steel; crossing a milestone
 * tempers it to the next color.
 */
export class QuenchlightTemperContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.quenchlightTemper';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly editorListeners = this._register(new DisposableMap<ICodeEditor>());
	private readonly animations = this._register(new DisposableStore());

	/** Decorative layer inside the status bar item; carries the heating and quench classes. */
	private readonly glowElement = $('span.quenchlight-temper-glow', { 'aria-hidden': 'true' });

	private readonly persistScheduler = this._register(new RunOnceScheduler(() => this.persist(), PERSIST_DELAY_MS));
	private readonly renderScheduler = this._register(new RunOnceScheduler(() => this.render(), RENDER_DELAY_MS));
	private readonly heatCooldown = this._register(new RunOnceScheduler(() => this.setHeating(false), HEAT_COOLDOWN_MS));

	private strikes: number;
	private temperIndex: number;
	private heating = false;
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

		this.strikes = this.storageService.getNumber(STRIKES_STORAGE_KEY, StorageScope.APPLICATION, 0);
		this.temperIndex = temperIndexFor(this.strikes);

		this._register(this.codeEditorService.onCodeEditorAdd(editor => {
			if (this.enabled) {
				this.watchEditor(editor);
			}
		}));
		this._register(this.codeEditorService.onCodeEditorRemove(editor => this.editorListeners.deleteAndDispose(editor)));

		this.updateEnablement();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuenchlightSettings.TemperEnabled)) {
				this.updateEnablement();
			}
		}));

		// Another window added strikes, or the reset command ran.
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, STRIKES_STORAGE_KEY, this._store)(() => {
			const stored = this.storageService.getNumber(STRIKES_STORAGE_KEY, StorageScope.APPLICATION, 0);
			if (stored !== this.strikes && !this.persistScheduler.isScheduled()) {
				this.strikes = stored;
				this.temperIndex = temperIndexFor(stored);
				this.render();
			}
		}));

		this._register({
			dispose: () => {
				this.persist();
				this.layoutService.mainContainer.classList.remove(...TEMPER_CLASSES);
			}
		});
	}

	private get enabled(): boolean {
		return this.configurationService.getValue<boolean>(QuenchlightSettings.TemperEnabled) !== false;
	}

	private updateEnablement(): void {
		if (!this.enabled) {
			this.entry.clear();
			this.editorListeners.clearAndDisposeAll();
			this.layoutService.mainContainer.classList.remove(...TEMPER_CLASSES);
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
			this.onStrike();
		}));
	}

	private onStrike(): void {
		this.strikes++;

		const now = Date.now();
		this.recentKeystrokes.push(now);
		while (this.recentKeystrokes.length && now - this.recentKeystrokes[0] > HEAT_WINDOW_MS) {
			this.recentKeystrokes.shift();
		}
		if (this.recentKeystrokes.length >= HEAT_KEYSTROKES) {
			this.setHeating(true);
		}
		if (this.heating) {
			this.heatCooldown.schedule();
		}

		const newTemperIndex = temperIndexFor(this.strikes);
		if (newTemperIndex > this.temperIndex) {
			this.temperIndex = newTemperIndex;
			this.reachTemper(TEMPERS[newTemperIndex]);
		}

		this.persistScheduler.schedule();
		if (!this.renderScheduler.isScheduled()) {
			this.renderScheduler.schedule();
		}
	}

	private setHeating(heating: boolean): void {
		if (this.heating === heating) {
			return;
		}
		this.heating = heating;
		this.glowElement.classList.toggle('quenchlight-heating', heating);
		this.render();
	}

	private reachTemper(temper: ITemper): void {
		this.notificationService.info(localize('quenchlight.tempered', "Over {0} hammer strikes: your steel reached {1}.", temper.over.toLocaleString(), temper.name));

		this.animations.clear();
		this.animations.add(replayAnimationClass(this.glowElement, 'quenchlight-quench', QUENCH_DURATION_MS));
		this.animations.add(replayAnimationClass(this.layoutService.mainContainer, 'quenchlight-tempering', TEMPERING_DURATION_MS));
	}

	private persist(): void {
		this.persistScheduler.cancel();
		this.storageService.store(STRIKES_STORAGE_KEY, this.strikes, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private render(): void {
		if (!this.enabled) {
			return;
		}

		const container = this.layoutService.mainContainer;
		container.classList.remove(...TEMPER_CLASSES);
		container.classList.add(TEMPER_CLASSES[this.temperIndex]);

		const entry = this.createEntry();
		if (this.entry.value) {
			this.entry.value.update(entry);
		} else {
			this.entry.value = this.statusbarService.addEntry(entry, ENTRY_ID, StatusbarAlignment.RIGHT, Number.MAX_VALUE);
		}
	}

	private createEntry(): IStatusbarEntry {
		const temper = TEMPERS[this.temperIndex];
		const next = TEMPERS[this.temperIndex + 1];
		const strikes = this.strikes.toLocaleString();
		const icon = this.heating ? '$(flame)' : '$(tools)';

		const tooltip = next
			? localize('quenchlight.temper.tooltip', "{0} hammer strikes · {1}\nReaches {2} after {3} strikes.", strikes, temper.name, next.name, next.over.toLocaleString())
			: localize('quenchlight.temper.tooltipMax', "{0} hammer strikes · {1}\nThe steel is fully tempered.", strikes, temper.name);

		return {
			name: localize('quenchlight.temper.name', "Temper"),
			text: `${icon} ${strikes}`,
			ariaLabel: localize('quenchlight.temper.ariaLabel', "{0} hammer strikes, {1}", strikes, temper.name),
			tooltip,
			content: this.glowElement,
		};
	}
}
