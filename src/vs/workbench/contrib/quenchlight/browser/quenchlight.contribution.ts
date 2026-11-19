import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { QuenchlightAngularGateContribution } from './quenchlightAngularGate.js';
import { QuenchlightSettings } from './quenchlightSettings.js';

// -- Settings ------------------------------------------------------------------

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'quenchlight',
	order: 100,
	title: localize('quenchlightConfigurationTitle', "Quenchlight"),
	type: 'object',
	properties: {
		[QuenchlightSettings.AngularOnlyInAngularWorkspaces]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('quenchlight.angular.onlyInAngularWorkspaces', "Turn the Angular Language Service off in workspaces that don't use Angular (no `@angular/core` dependency in a root `package.json` and no `angular.json`), so it doesn't start or prompt there.")
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

		// Follow the system appearance: Quenchlight Day in daylight, Quenchlight at night
		'window.autoDetectColorScheme': true,

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

// -- Contributions -------------------------------------------------------------

registerWorkbenchContribution2(QuenchlightAngularGateContribution.ID, QuenchlightAngularGateContribution, WorkbenchPhase.AfterRestored);
