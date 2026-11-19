/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import './media/saiyan.css';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { SaiyanAuraContribution } from './saiyanAura.js';
import { POWER_LEVEL_STORAGE_KEY, SaiyanPowerLevelContribution } from './saiyanPowerLevel.js';
import { SaiyanSettings } from './saiyanSettings.js';

// ── Settings ──────────────────────────────────────────────────────────────────

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'saiyan',
	order: 100,
	title: localize('saiyanConfigurationTitle', "Saiyan"),
	type: 'object',
	properties: {
		[SaiyanSettings.AuraEnabled]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('saiyan.aura.enabled', "Show the aura effects: glowing cursor, energised current line, glowing active tab and status bar shimmer.")
		},
		[SaiyanSettings.FlashOnSave]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('saiyan.aura.flashOnSave', "Flash the editor with a burst of gold energy when a file is saved.")
		},
		[SaiyanSettings.PowerLevelEnabled]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('saiyan.powerLevel.enabled', "Show your power level in the status bar. It rises with every keystroke and transforms you at milestones.")
		}
	}
});

// The minimal layout and look this build ships with. User settings still win.
configurationRegistry.registerDefaultConfigurations([{
	overrides: {
		'workbench.startupEditor': 'none',
		'workbench.tips.enabled': false,
		'workbench.enableExperiments': false,
		'window.titleBarStyle': 'custom',
		'window.commandCenter': false,
		'window.title': '${rootName}${separator}${activeEditorShort}',
		'workbench.layoutControl.enabled': false,
		'workbench.activityBar.location': 'hidden',
		'workbench.sideBar.location': 'right',
		'workbench.secondarySideBar.defaultVisibility': 'hidden',
		'workbench.editor.showTabs': 'single',
		'workbench.editor.editorActionsLocation': 'hidden',
		'workbench.tree.indent': 12,
		'workbench.tree.renderIndentGuides': 'none',
		'breadcrumbs.enabled': false,
		'chat.commandCenter.enabled': false,

		'editor.fontFamily': '\'JetBrainsMono Nerd Font\', \'JetBrains Mono\', Menlo, Monaco, \'Courier New\', monospace',
		'editor.fontSize': 13,
		'editor.lineHeight': 1.7,
		'editor.fontLigatures': true,
		'editor.letterSpacing': 0.2,
		'editor.minimap.enabled': false,
		'editor.lineNumbers': 'relative',
		'editor.folding': false,
		'editor.renderLineHighlight': 'all',
		'editor.guides.indentation': false,
		'editor.guides.bracketPairs': 'active',
		'editor.bracketPairColorization.enabled': true,
		'editor.matchBrackets': 'near',
		'editor.occurrencesHighlight': 'off',
		'editor.hideCursorInOverviewRuler': true,
		'editor.overviewRulerBorder': false,
		'editor.scrollbar.vertical': 'hidden',
		'editor.scrollbar.horizontal': 'hidden',
		'editor.scrollbar.verticalScrollbarSize': 0,
		'editor.stickyScroll.enabled': false,
		'editor.lightbulb.enabled': 'off',
		'editor.codeLens': false,
		'editor.inlayHints.enabled': 'offUnlessPressed',
		'editor.padding.top': 16,
		'editor.cursorStyle': 'block',
		'editor.cursorBlinking': 'expand',
		'editor.cursorSmoothCaretAnimation': 'on',
		'editor.smoothScrolling': true,
		'editor.semanticHighlighting.enabled': true,

		'terminal.integrated.fontFamily': '\'JetBrainsMono Nerd Font\'',
		'terminal.integrated.fontSize': 13,
		'terminal.integrated.lineHeight': 1.3,
		'terminal.integrated.cursorStyle': 'block',
		'terminal.integrated.cursorBlinking': true,
		'terminal.integrated.tabs.enabled': false,

		'explorer.compactFolders': false,
		'explorer.confirmDragAndDrop': false,
		'explorer.decorations.badges': false,
		'files.trimTrailingWhitespace': true,
		'files.insertFinalNewline': true,
		'telemetry.telemetryLevel': 'off',
		'chat.disableAIFeatures': true,
		'update.showReleaseNotes': false,
		'extensions.ignoreRecommendations': true,

		// Icons and nesting tuned for Nx monorepos with Angular and NestJS
		'workbench.iconTheme': 'symbols',
		'explorer.fileNesting.enabled': true,
		'explorer.fileNesting.expand': false,
		'explorer.fileNesting.patterns': {
			'*.ts': '${capture}.js, ${capture}.spec.ts, ${capture}.test.ts, ${capture}.html, ${capture}.scss, ${capture}.css',
			'package.json': 'package-lock.json, yarn.lock, pnpm-lock.yaml, pnpm-workspace.yaml, bun.lockb, bun.lock, .npmrc, .nvmrc, project.json',
			'eslint.config.mjs': '.oxlintrc.json, .oxfmtrc.json, .oxfmtrc.jsonc, .prettierrc, .prettierignore, .editorconfig',
			'justfile': '.common.env, .env*, docker-compose*.yml',
			'Package.swift': 'Package.resolved'
		},
		'files.exclude': {
			'**/.nx': true,
			'**/.angular': true
		},
		'search.exclude': {
			'**/dist': true,
			'**/coverage': true,
			'**/.nx': true,
			'**/.angular': true,
			'**/.build': true
		},
		'typescript.updateImportsOnFileMove.enabled': 'always',

		// Tasks: no tsc task per tsconfig in monorepos, and no problem matcher prompt on every run
		'js/ts.tsc.autoDetect': 'off',
		'task.problemMatchers.neverPrompt': true,

		// Bundled extensions: quiet by default, formatters only where a repo configures them
		'errorLens.enabledDiagnosticLevels': ['error', 'warning'],
		'errorLens.followCursor': 'allLinesExceptActive',
		'errorLens.messageMaxChars': 120,
		'errorLens.fontStyleItalic': true,
		'errorLens.padding': '0 6px',
		'errorLens.borderRadius': '4px',
		'errorLens.messageBackgroundMode': 'message',
		'prettier.requireConfig': true,
		'angular.enable-strict-mode-prompt': false,
		'redhat.telemetry.enabled': false
	}
}]);

// ── Contributions ─────────────────────────────────────────────────────────────

registerWorkbenchContribution2(SaiyanAuraContribution.ID, SaiyanAuraContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SaiyanPowerLevelContribution.ID, SaiyanPowerLevelContribution, WorkbenchPhase.AfterRestored);

// ── Commands ──────────────────────────────────────────────────────────────────

registerAction2(class ResetPowerLevelAction extends Action2 {
	constructor() {
		super({
			id: 'saiyan.resetPowerLevel',
			title: localize2('saiyan.resetPowerLevel', 'Reset Power Level'),
			category: localize2('saiyan.category', 'Saiyan'),
			f1: true
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IStorageService).store(POWER_LEVEL_STORAGE_KEY, 0, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
});
