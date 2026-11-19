/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { Color } from '../../../../base/common/color.js';
import { IColorTheme, IThemeService, IFileIconTheme, IProductIconTheme } from '../../../../platform/theme/common/themeService.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { isBoolean, isString } from '../../../../base/common/types.js';
import { IconContribution, IconDefinition } from '../../../../platform/theme/common/iconRegistry.js';
import { ColorScheme, ThemeTypeSelector } from '../../../../platform/theme/common/theme.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

export const IWorkbenchThemeService = refineServiceDecorator<IThemeService, IWorkbenchThemeService>(IThemeService);

export const THEME_SCOPE_OPEN_PAREN = '[';
export const THEME_SCOPE_CLOSE_PAREN = ']';
export const THEME_SCOPE_WILDCARD = '*';

export const themeScopeRegex = /\[(.+?)\]/g;

export enum ThemeSettings {
	COLOR_THEME = 'workbench.colorTheme',
	FILE_ICON_THEME = 'workbench.iconTheme',
	PRODUCT_ICON_THEME = 'workbench.productIconTheme',
	COLOR_CUSTOMIZATIONS = 'workbench.colorCustomizations',
	TOKEN_COLOR_CUSTOMIZATIONS = 'editor.tokenColorCustomizations',
	SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS = 'editor.semanticTokenColorCustomizations',

	PREFERRED_DARK_THEME = 'workbench.preferredDarkColorTheme',
	PREFERRED_LIGHT_THEME = 'workbench.preferredLightColorTheme',
	PREFERRED_HC_DARK_THEME = 'workbench.preferredHighContrastColorTheme', /* id kept for compatibility reasons */
	PREFERRED_HC_LIGHT_THEME = 'workbench.preferredHighContrastLightColorTheme',
	DETECT_COLOR_SCHEME = 'window.autoDetectColorScheme',
	DETECT_HC = 'window.autoDetectHighContrast',

	SYSTEM_COLOR_THEME = 'window.systemColorTheme'
}

export namespace ThemeSettingDefaults {
	export const COLOR_THEME_DARK = 'Quenchlight';
	export const COLOR_THEME_LIGHT = 'Quenchlight Day';
	export const COLOR_THEME_HC_DARK = 'Default High Contrast';
	export const COLOR_THEME_HC_LIGHT = 'Default High Contrast Light';

	export const FILE_ICON_THEME = 'vs-seti';
	export const PRODUCT_ICON_THEME = 'Default';
}

/**
 * Migrates legacy theme settings IDs to their current equivalents.
 * Theme IDs were simplified: "Default" prefix was removed from built-in themes,
 * and "Experimental" prefix was replaced when VS Code themes became GA.
 */
export function migrateThemeSettingsId(settingsId: string): string {
	switch (settingsId) {
		case 'Default Dark Modern': return 'Dark Modern';
		case 'Default Light Modern': return 'Light Modern';
		case 'Default Dark+': return 'Dark+';
		case 'Default Light+': return 'Light+';
		case 'Experimental Dark':
		case 'VS Code Dark':
			return ThemeSettingDefaults.COLOR_THEME_DARK;
		case 'Experimental Light':
		case 'VS Code Light':
			return ThemeSettingDefaults.COLOR_THEME_LIGHT;
	}
	return settingsId;
}

export const COLOR_THEME_DARK_INITIAL_COLORS = {
	'foreground': '#d2cbc1',
	'descriptionForeground': '#969087',
	'disabledForeground': '#67625c',
	'errorForeground': '#fb817a',
	'focusBorder': '#fc975699',
	'contrastBorder': '#00000000',
	'selection.background': '#94c2f359',
	'widget.shadow': '#00000066',
	'sash.hoverBorder': '#fc975699',
	'textLink.foreground': '#94c2f3',
	'textLink.activeForeground': '#94c2f3',
	'icon.foreground': '#b2aba2',
	'editor.background': '#1e1c19',
	'editor.foreground': '#e5dfd4',
	'editor.lineHighlightBackground': '#25221f',
	'editor.lineHighlightBorder': '#00000000',
	'editor.selectionBackground': '#94c2f34c',
	'editor.selectionHighlightBackground': '#94c2f324',
	'editor.inactiveSelectionBackground': '#94c2f329',
	'editor.wordHighlightBackground': '#b2aba229',
	'editor.wordHighlightStrongBackground': '#b2aba242',
	'editor.findMatchBackground': '#ebb76157',
	'editor.findMatchBorder': '#00000000',
	'editor.findMatchHighlightBackground': '#ebb76138',
	'editor.rangeHighlightBackground': '#94c2f314',
	'editorCursor.foreground': '#fc9756',
	'editorCursor.background': '#1e1c19',
	'editorLineNumber.foreground': '#67625c',
	'editorLineNumber.activeForeground': '#b2aba2',
	'editorWhitespace.foreground': '#322e2b',
	'editorIndentGuide.background1': '#322e2b',
	'editorIndentGuide.activeBackground1': '#514c47',
	'editorRuler.foreground': '#322e2b',
	'editorBracketMatch.background': '#b2aba233',
	'editorBracketMatch.border': '#b2aba28c',
	'editorBracketHighlight.foreground1': '#9cb4cd',
	'editorBracketHighlight.foreground2': '#bbb191',
	'editorBracketHighlight.foreground3': '#9ebaa2',
	'editorBracketHighlight.foreground4': '#9cb4cd',
	'editorBracketHighlight.foreground5': '#bbb191',
	'editorBracketHighlight.foreground6': '#9ebaa2',
	'editorBracketHighlight.unexpectedBracket.foreground': '#fb817a',
	'editorBracketPairGuide.activeBackground1': '#514c47',
	'editorBracketPairGuide.activeBackground2': '#514c47',
	'editorBracketPairGuide.activeBackground3': '#514c47',
	'editorBracketPairGuide.activeBackground4': '#514c47',
	'editorBracketPairGuide.activeBackground5': '#514c47',
	'editorBracketPairGuide.activeBackground6': '#514c47',
	'editorGutter.background': '#1e1c19',
	'editorGutter.addedBackground': '#9ed198',
	'editorGutter.modifiedBackground': '#94c2f3',
	'editorGutter.deletedBackground': '#fb817a',
	'editorError.foreground': '#fb817a',
	'editorWarning.foreground': '#ebb761',
	'editorInfo.foreground': '#94c2f3',
	'editorHint.foreground': '#969087',
	'errorLens.errorForeground': '#fb817a',
	'errorLens.errorMessageBackground': '#fb817a17',
	'errorLens.errorBackground': '#00000000',
	'errorLens.warningForeground': '#ebb761',
	'errorLens.warningMessageBackground': '#ebb76117',
	'errorLens.warningBackground': '#00000000',
	'editorInlayHint.foreground': '#969087',
	'editorInlayHint.background': '#332f2b80',
	'editorCodeLens.foreground': '#969087',
	'editorLink.activeForeground': '#94c2f3',
	'editorGhostText.foreground': '#969087',
	'editorOverviewRuler.border': '#00000000',
	'editorOverviewRuler.findMatchForeground': '#ebb761cc',
	'editorOverviewRuler.modifiedForeground': '#94c2f3',
	'editorOverviewRuler.addedForeground': '#9ed198',
	'editorOverviewRuler.deletedForeground': '#fb817a',
	'editorOverviewRuler.errorForeground': '#fb817a',
	'editorOverviewRuler.warningForeground': '#ebb761',
	'editorWidget.background': '#272421',
	'editorWidget.border': '#322e2b',
	'editorSuggestWidget.background': '#272421',
	'editorSuggestWidget.border': '#322e2b',
	'editorSuggestWidget.foreground': '#d2cbc1',
	'editorSuggestWidget.selectedBackground': '#332f2b',
	'editorSuggestWidget.selectedForeground': '#e5dfd4',
	'editorSuggestWidget.highlightForeground': '#fc9756',
	'editorSuggestWidget.focusHighlightForeground': '#fc9756',
	'editorHoverWidget.background': '#272421',
	'editorHoverWidget.border': '#322e2b',
	'editorGroup.border': '#322e2b',
	'editorGroup.dropBackground': '#fc97561f',
	'editorGroupHeader.tabsBackground': '#181613',
	'editorGroupHeader.noTabsBackground': '#1e1c19',
	'editorGroupHeader.tabsBorder': '#00000000',
	'editorStickyScroll.background': '#1e1c19',
	'editorStickyScrollHover.background': '#25221f',
	'diffEditor.insertedTextBackground': '#9ed19838',
	'diffEditor.removedTextBackground': '#fb817a38',
	'diffEditor.insertedLineBackground': '#9ed1981a',
	'diffEditor.removedLineBackground': '#fb817a1a',
	'tab.activeBackground': '#1e1c19',
	'tab.inactiveBackground': '#181613',
	'tab.activeForeground': '#e5dfd4',
	'tab.inactiveForeground': '#969087',
	'tab.hoverBackground': '#272421',
	'tab.border': '#00000000',
	'tab.activeBorder': '#00000000',
	'tab.activeBorderTop': '#fc9756',
	'tab.unfocusedActiveBorderTop': '#fc975666',
	'tab.activeModifiedBorder': '#ebb761',
	'titleBar.activeBackground': '#181613',
	'titleBar.inactiveBackground': '#181613',
	'titleBar.activeForeground': '#b2aba2',
	'titleBar.inactiveForeground': '#969087',
	'titleBar.border': '#00000000',
	'activityBar.background': '#181613',
	'activityBar.foreground': '#e5dfd4',
	'activityBar.inactiveForeground': '#969087',
	'activityBar.activeBorder': '#fc9756',
	'activityBar.border': '#00000000',
	'activityBarBadge.background': '#fc9756',
	'activityBarBadge.foreground': '#170902',
	'sideBar.background': '#181613',
	'sideBar.foreground': '#d2cbc1',
	'sideBar.border': '#322e2b',
	'sideBarTitle.foreground': '#b2aba2',
	'sideBarSectionHeader.background': '#181613',
	'sideBarSectionHeader.foreground': '#b2aba2',
	'sideBarSectionHeader.border': '#322e2b',
	'list.activeSelectionBackground': '#332f2b',
	'list.activeSelectionForeground': '#e5dfd4',
	'list.activeSelectionIconForeground': '#e5dfd4',
	'list.inactiveSelectionBackground': '#272421',
	'list.inactiveSelectionForeground': '#e5dfd4',
	'list.hoverBackground': '#272421',
	'list.hoverForeground': '#e5dfd4',
	'list.focusOutline': '#00000000',
	'list.focusBackground': '#332f2b',
	'list.highlightForeground': '#fc9756',
	'list.errorForeground': '#fb817a',
	'list.warningForeground': '#ebb761',
	'list.dropBackground': '#fc97561f',
	'tree.indentGuidesStroke': '#322e2b',
	'gitDecoration.modifiedResourceForeground': '#ebb761',
	'gitDecoration.addedResourceForeground': '#9ed198',
	'gitDecoration.untrackedResourceForeground': '#9ed198',
	'gitDecoration.deletedResourceForeground': '#fb817a',
	'gitDecoration.conflictingResourceForeground': '#c6a7eb',
	'gitDecoration.ignoredResourceForeground': '#67625c',
	'statusBar.background': '#181613',
	'statusBar.foreground': '#b2aba2',
	'statusBar.border': '#322e2b',
	'statusBar.noFolderBackground': '#181613',
	'statusBar.noFolderForeground': '#b2aba2',
	'statusBar.debuggingBackground': '#2d5b88',
	'statusBar.debuggingForeground': '#ffffff',
	'statusBarItem.remoteBackground': '#332f2b',
	'statusBarItem.remoteForeground': '#e5dfd4',
	'statusBarItem.hoverBackground': '#332f2b',
	'statusBarItem.prominentBackground': '#332f2b',
	'statusBarItem.prominentForeground': '#e5dfd4',
	'statusBarItem.errorBackground': '#a83634',
	'statusBarItem.errorForeground': '#ffffff',
	'statusBarItem.warningBackground': '#8d621c',
	'statusBarItem.warningForeground': '#ffffff',
	'panel.background': '#181613',
	'panel.border': '#322e2b',
	'panelTitle.activeForeground': '#e5dfd4',
	'panelTitle.inactiveForeground': '#969087',
	'panelTitle.activeBorder': '#fc9756',
	'terminal.background': '#181613',
	'terminal.foreground': '#e5dfd4',
	'terminalCursor.foreground': '#fc9756',
	'terminal.selectionBackground': '#94c2f34c',
	'terminal.ansiBlack': '#3b3734',
	'terminal.ansiRed': '#fb817a',
	'terminal.ansiGreen': '#9ed198',
	'terminal.ansiYellow': '#ebb761',
	'terminal.ansiBlue': '#94c2f3',
	'terminal.ansiMagenta': '#c6a7eb',
	'terminal.ansiCyan': '#85d0d4',
	'terminal.ansiWhite': '#d2cbc1',
	'terminal.ansiBrightBlack': '#969087',
	'terminal.ansiBrightRed': '#fe9b93',
	'terminal.ansiBrightGreen': '#aee1a8',
	'terminal.ansiBrightYellow': '#fcc771',
	'terminal.ansiBrightBlue': '#a8d2ff',
	'terminal.ansiBrightMagenta': '#d6b7fc',
	'terminal.ansiBrightCyan': '#95e0e4',
	'terminal.ansiBrightWhite': '#f8f5ef',
	'quickInput.background': '#272421',
	'quickInput.foreground': '#d2cbc1',
	'quickInputTitle.background': '#272421',
	'quickInputList.focusBackground': '#332f2b',
	'quickInputList.focusForeground': '#e5dfd4',
	'quickInputList.focusIconForeground': '#e5dfd4',
	'pickerGroup.foreground': '#969087',
	'pickerGroup.border': '#322e2b',
	'input.background': '#13110e',
	'input.foreground': '#e5dfd4',
	'input.border': '#322e2b',
	'input.placeholderForeground': '#969087',
	'inputOption.activeBorder': '#fc975699',
	'inputOption.activeBackground': '#fc975638',
	'inputOption.activeForeground': '#e5dfd4',
	'inputValidation.errorBorder': '#fb817a',
	'inputValidation.errorBackground': '#41211e',
	'dropdown.background': '#272421',
	'dropdown.border': '#322e2b',
	'checkbox.background': '#272421',
	'checkbox.border': '#514c47',
	'button.background': '#fc9756',
	'button.foreground': '#170902',
	'button.hoverBackground': '#ffaf78',
	'button.secondaryBackground': '#332f2b',
	'button.secondaryForeground': '#e5dfd4',
	'button.secondaryHoverBackground': '#514c47',
	'badge.background': '#332f2b',
	'badge.foreground': '#e5dfd4',
	'progressBar.background': '#fc9756',
	'scrollbar.shadow': '#00000000',
	'scrollbarSlider.background': '#b2aba229',
	'scrollbarSlider.hoverBackground': '#b2aba247',
	'scrollbarSlider.activeBackground': '#b2aba266',
	'menu.background': '#272421',
	'menu.foreground': '#d2cbc1',
	'menu.border': '#322e2b',
	'menu.selectionBackground': '#332f2b',
	'menu.selectionForeground': '#e5dfd4',
	'menu.separatorBackground': '#322e2b',
	'menubar.selectionBackground': '#272421',
	'notifications.background': '#272421',
	'notifications.border': '#322e2b',
	'notificationLink.foreground': '#94c2f3',
	'notificationsInfoIcon.foreground': '#94c2f3',
	'notificationsWarningIcon.foreground': '#ebb761',
	'notificationsErrorIcon.foreground': '#fb817a',
	'peekView.border': '#514c47',
	'peekViewTitle.background': '#272421',
	'peekViewTitleLabel.foreground': '#e5dfd4',
	'peekViewEditor.background': '#1e1c19',
	'peekViewEditor.matchHighlightBackground': '#ebb7614c',
	'peekViewResult.background': '#181613',
	'peekViewResult.selectionBackground': '#332f2b',
	'peekViewResult.matchHighlightBackground': '#ebb7614c',
	'breadcrumb.foreground': '#969087',
	'breadcrumb.focusForeground': '#e5dfd4',
	'breadcrumb.activeSelectionForeground': '#e5dfd4',
	'breadcrumbPicker.background': '#272421',
	'minimap.background': '#1e1c19',
	'minimap.selectionHighlight': '#94c2f380',
	'minimap.findMatchHighlight': '#ebb761',
	'minimapGutter.addedBackground': '#9ed198',
	'minimapGutter.modifiedBackground': '#94c2f3',
	'minimapGutter.deletedBackground': '#fb817a',
	'debugToolBar.background': '#272421',
	'welcomePage.tileBackground': '#272421',
	'welcomePage.progress.foreground': '#fc9756',
	'keybindingLabel.background': '#272421',
	'keybindingLabel.foreground': '#d2cbc1',
	'keybindingLabel.border': '#322e2b',
	'keybindingLabel.bottomBorder': '#514c47',
	'settings.headerForeground': '#e5dfd4',
	'settings.modifiedItemIndicator': '#fc9756',
	'textBlockQuote.background': '#272421',
	'textBlockQuote.border': '#514c47',
	'textCodeBlock.background': '#272421',
	'textPreformat.foreground': '#e5dfd4',
	'textPreformat.background': '#b2aba224',
};

export const COLOR_THEME_LIGHT_INITIAL_COLORS = {
	'foreground': '#433b35',
	'descriptionForeground': '#7d766e',
	'disabledForeground': '#a9a49c',
	'errorForeground': '#c22826',
	'focusBorder': '#c14f0099',
	'contrastBorder': '#00000000',
	'selection.background': '#2460a859',
	'widget.shadow': '#0000001f',
	'sash.hoverBorder': '#c14f0099',
	'textLink.foreground': '#2460a8',
	'textLink.activeForeground': '#2460a8',
	'icon.foreground': '#685f56',
	'editor.background': '#faf6ef',
	'editor.foreground': '#2c251f',
	'editor.lineHighlightBackground': '#f3efe7',
	'editor.lineHighlightBorder': '#00000000',
	'editor.selectionBackground': '#2460a84c',
	'editor.selectionHighlightBackground': '#2460a824',
	'editor.inactiveSelectionBackground': '#2460a829',
	'editor.wordHighlightBackground': '#685f5629',
	'editor.wordHighlightStrongBackground': '#685f5642',
	'editor.findMatchBackground': '#a96b0080',
	'editor.findMatchBorder': '#00000000',
	'editor.findMatchHighlightBackground': '#a96b0038',
	'editor.rangeHighlightBackground': '#2460a814',
	'editorCursor.foreground': '#c14f00',
	'editorCursor.background': '#faf6ef',
	'editorLineNumber.foreground': '#a9a49c',
	'editorLineNumber.activeForeground': '#685f56',
	'editorWhitespace.foreground': '#ddd9d0',
	'editorIndentGuide.background1': '#ddd9d0',
	'editorIndentGuide.activeBackground1': '#bbb7af',
	'editorRuler.foreground': '#ddd9d0',
	'editorBracketMatch.background': '#685f5633',
	'editorBracketMatch.border': '#685f568c',
	'editorBracketHighlight.foreground1': '#4c6585',
	'editorBracketHighlight.foreground2': '#72613a',
	'editorBracketHighlight.foreground3': '#4a6d51',
	'editorBracketHighlight.foreground4': '#4c6585',
	'editorBracketHighlight.foreground5': '#72613a',
	'editorBracketHighlight.foreground6': '#4a6d51',
	'editorBracketHighlight.unexpectedBracket.foreground': '#c22826',
	'editorBracketPairGuide.activeBackground1': '#bbb7af',
	'editorBracketPairGuide.activeBackground2': '#bbb7af',
	'editorBracketPairGuide.activeBackground3': '#bbb7af',
	'editorBracketPairGuide.activeBackground4': '#bbb7af',
	'editorBracketPairGuide.activeBackground5': '#bbb7af',
	'editorBracketPairGuide.activeBackground6': '#bbb7af',
	'editorGutter.background': '#faf6ef',
	'editorGutter.addedBackground': '#2b7132',
	'editorGutter.modifiedBackground': '#2460a8',
	'editorGutter.deletedBackground': '#c22826',
	'editorError.foreground': '#c22826',
	'editorWarning.foreground': '#a96b00',
	'editorInfo.foreground': '#2460a8',
	'editorHint.foreground': '#7d766e',
	'errorLens.errorForeground': '#c22826',
	'errorLens.errorMessageBackground': '#c2282617',
	'errorLens.errorBackground': '#00000000',
	'errorLens.warningForeground': '#a96b00',
	'errorLens.warningMessageBackground': '#a96b0017',
	'errorLens.warningBackground': '#00000000',
	'editorInlayHint.foreground': '#7d766e',
	'editorInlayHint.background': '#e1dcd280',
	'editorCodeLens.foreground': '#7d766e',
	'editorLink.activeForeground': '#2460a8',
	'editorGhostText.foreground': '#7d766e',
	'editorOverviewRuler.border': '#00000000',
	'editorOverviewRuler.findMatchForeground': '#a96b00cc',
	'editorOverviewRuler.modifiedForeground': '#2460a8',
	'editorOverviewRuler.addedForeground': '#2b7132',
	'editorOverviewRuler.deletedForeground': '#c22826',
	'editorOverviewRuler.errorForeground': '#c22826',
	'editorOverviewRuler.warningForeground': '#a96b00',
	'editorWidget.background': '#fefcf7',
	'editorWidget.border': '#ddd9d0',
	'editorSuggestWidget.background': '#fefcf7',
	'editorSuggestWidget.border': '#ddd9d0',
	'editorSuggestWidget.foreground': '#433b35',
	'editorSuggestWidget.selectedBackground': '#e1dcd2',
	'editorSuggestWidget.selectedForeground': '#2c251f',
	'editorSuggestWidget.highlightForeground': '#c14f00',
	'editorSuggestWidget.focusHighlightForeground': '#c14f00',
	'editorHoverWidget.background': '#fefcf7',
	'editorHoverWidget.border': '#ddd9d0',
	'editorGroup.border': '#ddd9d0',
	'editorGroup.dropBackground': '#c14f001f',
	'editorGroupHeader.tabsBackground': '#f3f0e8',
	'editorGroupHeader.noTabsBackground': '#faf6ef',
	'editorGroupHeader.tabsBorder': '#00000000',
	'editorStickyScroll.background': '#faf6ef',
	'editorStickyScrollHover.background': '#f3efe7',
	'diffEditor.insertedTextBackground': '#2b713238',
	'diffEditor.removedTextBackground': '#c2282638',
	'diffEditor.insertedLineBackground': '#2b71321a',
	'diffEditor.removedLineBackground': '#c228261a',
	'tab.activeBackground': '#faf6ef',
	'tab.inactiveBackground': '#f3f0e8',
	'tab.activeForeground': '#2c251f',
	'tab.inactiveForeground': '#7d766e',
	'tab.hoverBackground': '#ebe7df',
	'tab.border': '#00000000',
	'tab.activeBorder': '#00000000',
	'tab.activeBorderTop': '#c14f00',
	'tab.unfocusedActiveBorderTop': '#c14f0066',
	'tab.activeModifiedBorder': '#a96b00',
	'titleBar.activeBackground': '#f3f0e8',
	'titleBar.inactiveBackground': '#f3f0e8',
	'titleBar.activeForeground': '#685f56',
	'titleBar.inactiveForeground': '#7d766e',
	'titleBar.border': '#00000000',
	'activityBar.background': '#f3f0e8',
	'activityBar.foreground': '#2c251f',
	'activityBar.inactiveForeground': '#7d766e',
	'activityBar.activeBorder': '#c14f00',
	'activityBar.border': '#00000000',
	'activityBarBadge.background': '#c14f00',
	'activityBarBadge.foreground': '#ffffff',
	'sideBar.background': '#f3f0e8',
	'sideBar.foreground': '#433b35',
	'sideBar.border': '#ddd9d0',
	'sideBarTitle.foreground': '#685f56',
	'sideBarSectionHeader.background': '#f3f0e8',
	'sideBarSectionHeader.foreground': '#685f56',
	'sideBarSectionHeader.border': '#ddd9d0',
	'list.activeSelectionBackground': '#e1dcd2',
	'list.activeSelectionForeground': '#2c251f',
	'list.activeSelectionIconForeground': '#2c251f',
	'list.inactiveSelectionBackground': '#ebe7df',
	'list.inactiveSelectionForeground': '#2c251f',
	'list.hoverBackground': '#ebe7df',
	'list.hoverForeground': '#2c251f',
	'list.focusOutline': '#00000000',
	'list.focusBackground': '#e1dcd2',
	'list.highlightForeground': '#c14f00',
	'list.errorForeground': '#c22826',
	'list.warningForeground': '#a96b00',
	'list.dropBackground': '#c14f001f',
	'tree.indentGuidesStroke': '#ddd9d0',
	'gitDecoration.modifiedResourceForeground': '#a96b00',
	'gitDecoration.addedResourceForeground': '#2b7132',
	'gitDecoration.untrackedResourceForeground': '#2b7132',
	'gitDecoration.deletedResourceForeground': '#c22826',
	'gitDecoration.conflictingResourceForeground': '#7847a6',
	'gitDecoration.ignoredResourceForeground': '#a9a49c',
	'statusBar.background': '#f3f0e8',
	'statusBar.foreground': '#685f56',
	'statusBar.border': '#ddd9d0',
	'statusBar.noFolderBackground': '#f3f0e8',
	'statusBar.noFolderForeground': '#685f56',
	'statusBar.debuggingBackground': '#2460a8',
	'statusBar.debuggingForeground': '#ffffff',
	'statusBarItem.remoteBackground': '#e1dcd2',
	'statusBarItem.remoteForeground': '#2c251f',
	'statusBarItem.hoverBackground': '#e1dcd2',
	'statusBarItem.prominentBackground': '#e1dcd2',
	'statusBarItem.prominentForeground': '#2c251f',
	'statusBarItem.errorBackground': '#c22826',
	'statusBarItem.errorForeground': '#ffffff',
	'statusBarItem.warningBackground': '#8a5601',
	'statusBarItem.warningForeground': '#ffffff',
	'panel.background': '#f3f0e8',
	'panel.border': '#ddd9d0',
	'panelTitle.activeForeground': '#2c251f',
	'panelTitle.inactiveForeground': '#7d766e',
	'panelTitle.activeBorder': '#c14f00',
	'terminal.background': '#f3f0e8',
	'terminal.foreground': '#2c251f',
	'terminalCursor.foreground': '#c14f00',
	'terminal.selectionBackground': '#2460a84c',
	'terminal.ansiBlack': '#2c251f',
	'terminal.ansiRed': '#c22826',
	'terminal.ansiGreen': '#2b7132',
	'terminal.ansiYellow': '#a96b00',
	'terminal.ansiBlue': '#2460a8',
	'terminal.ansiMagenta': '#7847a6',
	'terminal.ansiCyan': '#047781',
	'terminal.ansiWhite': '#a9a49c',
	'terminal.ansiBrightBlack': '#685f56',
	'terminal.ansiBrightRed': '#ac0311',
	'terminal.ansiBrightGreen': '#176020',
	'terminal.ansiBrightYellow': '#915b02',
	'terminal.ansiBrightBlue': '#0f4f95',
	'terminal.ansiBrightMagenta': '#663693',
	'terminal.ansiBrightCyan': '#02646d',
	'terminal.ansiBrightWhite': '#d5d0c8',
	'quickInput.background': '#fefcf7',
	'quickInput.foreground': '#433b35',
	'quickInputTitle.background': '#ebe7df',
	'quickInputList.focusBackground': '#e1dcd2',
	'quickInputList.focusForeground': '#2c251f',
	'quickInputList.focusIconForeground': '#2c251f',
	'pickerGroup.foreground': '#7d766e',
	'pickerGroup.border': '#ddd9d0',
	'input.background': '#fefcf7',
	'input.foreground': '#2c251f',
	'input.border': '#ddd9d0',
	'input.placeholderForeground': '#7d766e',
	'inputOption.activeBorder': '#c14f0099',
	'inputOption.activeBackground': '#c14f0038',
	'inputOption.activeForeground': '#2c251f',
	'inputValidation.errorBorder': '#c22826',
	'inputValidation.errorBackground': '#ffe4e1',
	'dropdown.background': '#fefcf7',
	'dropdown.border': '#ddd9d0',
	'checkbox.background': '#fefcf7',
	'checkbox.border': '#bbb7af',
	'button.background': '#c14f00',
	'button.foreground': '#ffffff',
	'button.hoverBackground': '#ab4501',
	'button.secondaryBackground': '#e1dcd2',
	'button.secondaryForeground': '#2c251f',
	'button.secondaryHoverBackground': '#ddd9d0',
	'badge.background': '#e1dcd2',
	'badge.foreground': '#2c251f',
	'progressBar.background': '#c14f00',
	'scrollbar.shadow': '#00000000',
	'scrollbarSlider.background': '#685f5629',
	'scrollbarSlider.hoverBackground': '#685f5647',
	'scrollbarSlider.activeBackground': '#685f5666',
	'menu.background': '#fefcf7',
	'menu.foreground': '#433b35',
	'menu.border': '#ddd9d0',
	'menu.selectionBackground': '#e1dcd2',
	'menu.selectionForeground': '#2c251f',
	'menu.separatorBackground': '#ddd9d0',
	'menubar.selectionBackground': '#ebe7df',
	'notifications.background': '#fefcf7',
	'notifications.border': '#ddd9d0',
	'notificationLink.foreground': '#2460a8',
	'notificationsInfoIcon.foreground': '#2460a8',
	'notificationsWarningIcon.foreground': '#a96b00',
	'notificationsErrorIcon.foreground': '#c22826',
	'peekView.border': '#bbb7af',
	'peekViewTitle.background': '#fefcf7',
	'peekViewTitleLabel.foreground': '#2c251f',
	'peekViewEditor.background': '#faf6ef',
	'peekViewEditor.matchHighlightBackground': '#a96b004c',
	'peekViewResult.background': '#f3f0e8',
	'peekViewResult.selectionBackground': '#e1dcd2',
	'peekViewResult.matchHighlightBackground': '#a96b004c',
	'breadcrumb.foreground': '#7d766e',
	'breadcrumb.focusForeground': '#2c251f',
	'breadcrumb.activeSelectionForeground': '#2c251f',
	'breadcrumbPicker.background': '#fefcf7',
	'minimap.background': '#faf6ef',
	'minimap.selectionHighlight': '#2460a880',
	'minimap.findMatchHighlight': '#a96b00',
	'minimapGutter.addedBackground': '#2b7132',
	'minimapGutter.modifiedBackground': '#2460a8',
	'minimapGutter.deletedBackground': '#c22826',
	'debugToolBar.background': '#fefcf7',
	'welcomePage.tileBackground': '#fefcf7',
	'welcomePage.progress.foreground': '#c14f00',
	'keybindingLabel.background': '#ebe7df',
	'keybindingLabel.foreground': '#433b35',
	'keybindingLabel.border': '#ddd9d0',
	'keybindingLabel.bottomBorder': '#bbb7af',
	'settings.headerForeground': '#2c251f',
	'settings.modifiedItemIndicator': '#c14f00',
	'textBlockQuote.background': '#fefcf7',
	'textBlockQuote.border': '#bbb7af',
	'textCodeBlock.background': '#fefcf7',
	'textPreformat.foreground': '#2c251f',
	'textPreformat.background': '#685f5624',
};

export interface IWorkbenchTheme {
	readonly id: string;
	readonly label: string;
	readonly extensionData?: ExtensionData;
	readonly description?: string;
	readonly settingsId: string | null;
}

export interface IWorkbenchColorTheme extends IWorkbenchTheme, IColorTheme {
	readonly settingsId: string;
	readonly tokenColors: ITextMateThemingRule[];
}

export interface IColorMap {
	[id: string]: Color;
}

export interface IWorkbenchFileIconTheme extends IWorkbenchTheme, IFileIconTheme {
}

export interface IWorkbenchProductIconTheme extends IWorkbenchTheme, IProductIconTheme {
	readonly settingsId: string;

	getIcon(icon: IconContribution): IconDefinition | undefined;
}

export type ThemeSettingTarget = ConfigurationTarget | undefined | 'auto' | 'preview';


export interface IWorkbenchThemeService extends IThemeService {
	readonly _serviceBrand: undefined;
	setColorTheme(themeId: string | undefined | IWorkbenchColorTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchColorTheme | null>;
	getColorTheme(): IWorkbenchColorTheme;
	/** Returns the selected theme and user customizations without window-local overlays. */
	getBaseColorTheme(): IWorkbenchColorTheme;
	getColorThemes(): Promise<IWorkbenchColorTheme[]>;
	getMarketplaceColorThemes(publisher: string, name: string, version: string): Promise<IWorkbenchColorTheme[]>;
	readonly onDidColorThemeChange: Event<IWorkbenchColorTheme>;

	/** Applies window-local colors computed from the base theme, without persisting them or changing the selected theme. */
	registerColorThemeOverlay(getColors: (theme: IWorkbenchColorTheme) => IColorMap): IDisposable;

	getPreferredColorScheme(): ColorScheme | undefined;

	setFileIconTheme(iconThemeId: string | undefined | IWorkbenchFileIconTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchFileIconTheme>;
	getFileIconTheme(): IWorkbenchFileIconTheme;
	getFileIconThemes(): Promise<IWorkbenchFileIconTheme[]>;
	getMarketplaceFileIconThemes(publisher: string, name: string, version: string): Promise<IWorkbenchFileIconTheme[]>;
	readonly onDidFileIconThemeChange: Event<IWorkbenchFileIconTheme>;

	setProductIconTheme(iconThemeId: string | undefined | IWorkbenchProductIconTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchProductIconTheme>;
	getProductIconTheme(): IWorkbenchProductIconTheme;
	getProductIconThemes(): Promise<IWorkbenchProductIconTheme[]>;
	getMarketplaceProductIconThemes(publisher: string, name: string, version: string): Promise<IWorkbenchProductIconTheme[]>;
	readonly onDidProductIconThemeChange: Event<IWorkbenchProductIconTheme>;
}

export interface IThemeScopedColorCustomizations {
	[colorId: string]: string;
}

export interface IColorCustomizations {
	[colorIdOrThemeScope: string]: IThemeScopedColorCustomizations | string;
}

export interface IThemeScopedTokenColorCustomizations {
	[groupId: string]: ITextMateThemingRule[] | ITokenColorizationSetting | boolean | string | undefined;
	comments?: string | ITokenColorizationSetting;
	strings?: string | ITokenColorizationSetting;
	numbers?: string | ITokenColorizationSetting;
	keywords?: string | ITokenColorizationSetting;
	types?: string | ITokenColorizationSetting;
	functions?: string | ITokenColorizationSetting;
	variables?: string | ITokenColorizationSetting;
	textMateRules?: ITextMateThemingRule[];
	semanticHighlighting?: boolean; // deprecated, use ISemanticTokenColorCustomizations.enabled instead
}

export interface ITokenColorCustomizations {
	[groupIdOrThemeScope: string]: IThemeScopedTokenColorCustomizations | ITextMateThemingRule[] | ITokenColorizationSetting | boolean | string | undefined;
	comments?: string | ITokenColorizationSetting;
	strings?: string | ITokenColorizationSetting;
	numbers?: string | ITokenColorizationSetting;
	keywords?: string | ITokenColorizationSetting;
	types?: string | ITokenColorizationSetting;
	functions?: string | ITokenColorizationSetting;
	variables?: string | ITokenColorizationSetting;
	textMateRules?: ITextMateThemingRule[];
	semanticHighlighting?: boolean; // deprecated, use ISemanticTokenColorCustomizations.enabled instead
}

export interface IThemeScopedSemanticTokenColorCustomizations {
	[styleRule: string]: ISemanticTokenRules | boolean | undefined;
	enabled?: boolean;
	rules?: ISemanticTokenRules;
}

export interface ISemanticTokenColorCustomizations {
	[styleRuleOrThemeScope: string]: IThemeScopedSemanticTokenColorCustomizations | ISemanticTokenRules | boolean | undefined;
	enabled?: boolean;
	rules?: ISemanticTokenRules;
}

export interface IThemeScopedExperimentalSemanticTokenColorCustomizations {
	[themeScope: string]: ISemanticTokenRules | undefined;
}

export interface IExperimentalSemanticTokenColorCustomizations {
	[styleRuleOrThemeScope: string]: IThemeScopedExperimentalSemanticTokenColorCustomizations | ISemanticTokenRules | undefined;
}

export type IThemeScopedCustomizations =
	IThemeScopedColorCustomizations
	| IThemeScopedTokenColorCustomizations
	| IThemeScopedExperimentalSemanticTokenColorCustomizations
	| IThemeScopedSemanticTokenColorCustomizations;

export type IThemeScopableCustomizations =
	IColorCustomizations
	| ITokenColorCustomizations
	| IExperimentalSemanticTokenColorCustomizations
	| ISemanticTokenColorCustomizations;

export interface ISemanticTokenRules {
	[selector: string]: string | ISemanticTokenColorizationSetting | undefined;
}

export interface ITextMateThemingRule {
	name?: string;
	scope?: string | string[];
	settings: ITokenColorizationSetting;
}

export interface ITokenColorizationSetting {
	foreground?: string;
	background?: string;
	fontStyle?: string; /* [italic|bold|underline|strikethrough] */
	fontFamily?: string;
	fontSize?: number;
	lineHeight?: number;
}

export interface ISemanticTokenColorizationSetting {
	foreground?: string;
	fontStyle?: string; /* [italic|bold|underline|strikethrough] */
	bold?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	italic?: boolean;
}

export interface ExtensionData {
	extensionId: string;
	extensionPublisher: string;
	extensionName: string;
	extensionIsBuiltin: boolean;
}

export namespace ExtensionData {
	export function toJSONObject(d: ExtensionData | undefined): any {
		return d && { _extensionId: d.extensionId, _extensionIsBuiltin: d.extensionIsBuiltin, _extensionName: d.extensionName, _extensionPublisher: d.extensionPublisher };
	}
	export function fromJSONObject(o: any): ExtensionData | undefined {
		if (o && isString(o._extensionId) && isBoolean(o._extensionIsBuiltin) && isString(o._extensionName) && isString(o._extensionPublisher)) {
			return { extensionId: o._extensionId, extensionIsBuiltin: o._extensionIsBuiltin, extensionName: o._extensionName, extensionPublisher: o._extensionPublisher };
		}
		return undefined;
	}
	export function fromName(publisher: string, name: string, isBuiltin = false): ExtensionData {
		return { extensionPublisher: publisher, extensionId: `${publisher}.${name}`, extensionName: name, extensionIsBuiltin: isBuiltin };
	}
}

export interface IThemeExtensionPoint {
	id: string;
	label?: string;
	description?: string;
	path: string;
	uiTheme?: ThemeTypeSelector;
	_watch: boolean; // unsupported options to watch location
}
