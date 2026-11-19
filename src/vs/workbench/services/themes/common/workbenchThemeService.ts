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
	export const COLOR_THEME_LIGHT = 'Light 2026';
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
	'foreground': '#dccfbd',
	'descriptionForeground': '#9c8e7d',
	'focusBorder': '#f4c46a55',
	'contrastBorder': '#00000000',
	'selection.background': '#ff6a2b55',
	'widget.shadow': '#00000088',
	'sash.hoverBorder': '#f4c46a',
	'textLink.foreground': '#6fb2f0',
	'textLink.activeForeground': '#f4c46a',
	'icon.foreground': '#afa18f',
	'editor.background': '#16130f',
	'editor.foreground': '#e8dece',
	'editor.lineHighlightBackground': '#241e19',
	'editor.lineHighlightBorder': '#00000000',
	'editor.selectionBackground': '#ff6a2b40',
	'editor.selectionHighlightBackground': '#ff6a2b1f',
	'editor.inactiveSelectionBackground': '#ff6a2b20',
	'editor.wordHighlightBackground': '#6fb2f01f',
	'editor.wordHighlightStrongBackground': '#f4c46a26',
	'editor.findMatchBackground': '#f4c46a66',
	'editor.findMatchBorder': '#f4c46a',
	'editor.findMatchHighlightBackground': '#f4c46a26',
	'editor.rangeHighlightBackground': '#6fb2f012',
	'editorCursor.foreground': '#f4c46a',
	'editorCursor.background': '#16130f',
	'editorLineNumber.foreground': '#4a4037',
	'editorLineNumber.activeForeground': '#f4c46a',
	'editorWhitespace.foreground': '#2e2721',
	'editorIndentGuide.background1': '#2a241e',
	'editorIndentGuide.activeBackground1': '#ff6a2b66',
	'editorRuler.foreground': '#2a241e',
	'editorBracketMatch.background': '#f4c46a22',
	'editorBracketMatch.border': '#f4c46a88',
	'editorBracketHighlight.foreground1': '#f4c46a',
	'editorBracketHighlight.foreground2': '#ff6a2b',
	'editorBracketHighlight.foreground3': '#6fb2f0',
	'editorBracketHighlight.foreground4': '#b48ae6',
	'editorBracketHighlight.foreground5': '#93c97b',
	'editorBracketHighlight.foreground6': '#6b93db',
	'editorBracketHighlight.unexpectedBracket.foreground': '#e5534b',
	'editorBracketPairGuide.activeBackground1': '#f4c46a66',
	'editorBracketPairGuide.activeBackground2': '#ff6a2b66',
	'editorBracketPairGuide.activeBackground3': '#6fb2f066',
	'editorBracketPairGuide.activeBackground4': '#b48ae666',
	'editorBracketPairGuide.activeBackground5': '#93c97b66',
	'editorBracketPairGuide.activeBackground6': '#6b93db66',
	'editorGutter.background': '#16130f',
	'editorGutter.addedBackground': '#93c97b',
	'editorGutter.modifiedBackground': '#ff6a2b',
	'editorGutter.deletedBackground': '#e5534b',
	'editorError.foreground': '#e5534b',
	'editorWarning.foreground': '#e8a33a',
	'editorInfo.foreground': '#6fb2f0',
	'editorHint.foreground': '#a78bdb',
	'editorInlayHint.foreground': '#908272',
	'editorInlayHint.background': '#241e1980',
	'editorCodeLens.foreground': '#85786a',
	'editorLink.activeForeground': '#6fb2f0',
	'editorGhostText.foreground': '#6e6255',
	'editorOverviewRuler.border': '#00000000',
	'editorOverviewRuler.findMatchForeground': '#f4c46a',
	'editorOverviewRuler.modifiedForeground': '#ff6a2b',
	'editorOverviewRuler.addedForeground': '#93c97b',
	'editorOverviewRuler.deletedForeground': '#e5534b',
	'editorOverviewRuler.errorForeground': '#e5534b',
	'editorOverviewRuler.warningForeground': '#e8a33a',
	'editorWidget.background': '#1d1915',
	'editorWidget.border': '#3a3129',
	'editorSuggestWidget.background': '#1d1915',
	'editorSuggestWidget.border': '#3a3129',
	'editorSuggestWidget.foreground': '#dccfbd',
	'editorSuggestWidget.selectedBackground': '#ff6a2b33',
	'editorSuggestWidget.selectedForeground': '#ffffff',
	'editorSuggestWidget.highlightForeground': '#f4c46a',
	'editorSuggestWidget.focusHighlightForeground': '#f4c46a',
	'editorHoverWidget.background': '#1d1915',
	'editorHoverWidget.border': '#3a3129',
	'editorGroup.border': '#2a241e',
	'editorGroup.dropBackground': '#ff6a2b22',
	'editorGroupHeader.tabsBackground': '#0f0d0b',
	'editorGroupHeader.noTabsBackground': '#16130f',
	'editorGroupHeader.tabsBorder': '#00000000',
	'editorStickyScroll.background': '#1a1612',
	'editorStickyScrollHover.background': '#241e19',
	'diffEditor.insertedTextBackground': '#93c97b22',
	'diffEditor.removedTextBackground': '#e5534b22',
	'diffEditor.insertedLineBackground': '#93c97b12',
	'diffEditor.removedLineBackground': '#e5534b12',
	'tab.activeBackground': '#16130f',
	'tab.inactiveBackground': '#0f0d0b',
	'tab.activeForeground': '#f4c46a',
	'tab.inactiveForeground': '#85786a',
	'tab.hoverBackground': '#1d1915',
	'tab.border': '#00000000',
	'tab.activeBorder': '#00000000',
	'tab.activeBorderTop': '#ff6a2b',
	'tab.unfocusedActiveBorderTop': '#ff6a2b55',
	'tab.activeModifiedBorder': '#f4c46a',
	'titleBar.activeBackground': '#0f0d0b',
	'titleBar.inactiveBackground': '#0f0d0b',
	'titleBar.activeForeground': '#e9b98a',
	'titleBar.inactiveForeground': '#5a4e43',
	'titleBar.border': '#ff6a2b33',
	'activityBar.background': '#0f0d0b',
	'activityBar.foreground': '#f4c46a',
	'activityBar.inactiveForeground': '#6e6255',
	'activityBar.activeBorder': '#ff6a2b',
	'activityBar.border': '#00000000',
	'activityBarBadge.background': '#ff6a2b',
	'activityBarBadge.foreground': '#16130f',
	'sideBar.background': '#0f0d0b',
	'sideBar.foreground': '#c4b6a3',
	'sideBar.border': '#2a241e',
	'sideBarTitle.foreground': '#ff6a2b',
	'sideBarSectionHeader.background': '#0f0d0b',
	'sideBarSectionHeader.foreground': '#f4c46a',
	'sideBarSectionHeader.border': '#2a241e',
	'list.activeSelectionBackground': '#ff6a2b2e',
	'list.activeSelectionForeground': '#f4c46a',
	'list.activeSelectionIconForeground': '#f4c46a',
	'list.inactiveSelectionBackground': '#241e19',
	'list.inactiveSelectionForeground': '#e8dece',
	'list.hoverBackground': '#1d1915',
	'list.hoverForeground': '#ffffff',
	'list.focusOutline': '#00000000',
	'list.focusBackground': '#ff6a2b22',
	'list.highlightForeground': '#f4c46a',
	'list.errorForeground': '#ec6f66',
	'list.warningForeground': '#e8a33a',
	'list.dropBackground': '#ff6a2b22',
	'tree.indentGuidesStroke': '#3a3129',
	'gitDecoration.modifiedResourceForeground': '#f08a4b',
	'gitDecoration.addedResourceForeground': '#93c97b',
	'gitDecoration.untrackedResourceForeground': '#93c97b',
	'gitDecoration.deletedResourceForeground': '#e5534b',
	'gitDecoration.conflictingResourceForeground': '#b48ae6',
	'gitDecoration.ignoredResourceForeground': '#5a4e43',
	'statusBar.background': '#0f0d0b',
	'statusBar.foreground': '#c4b6a3',
	'statusBar.border': '#3a3129',
	'statusBar.noFolderBackground': '#4a74c9',
	'statusBar.noFolderForeground': '#ffffff',
	'statusBar.debuggingBackground': '#4a74c9',
	'statusBar.debuggingForeground': '#ffffff',
	'statusBarItem.remoteBackground': '#ff6a2b',
	'statusBarItem.remoteForeground': '#1b120b',
	'statusBarItem.hoverBackground': '#ff6a2b33',
	'statusBarItem.prominentBackground': '#ff6a2b',
	'statusBarItem.prominentForeground': '#1b120b',
	'statusBarItem.errorBackground': '#e5534b',
	'statusBarItem.errorForeground': '#ffffff',
	'panel.background': '#0f0d0b',
	'panel.border': '#ff6a2b44',
	'panelTitle.activeForeground': '#f4c46a',
	'panelTitle.inactiveForeground': '#85786a',
	'panelTitle.activeBorder': '#ff6a2b',
	'terminal.background': '#0f0d0b',
	'terminal.foreground': '#e8dece',
	'terminalCursor.foreground': '#f4c46a',
	'terminal.selectionBackground': '#ff6a2b40',
	'terminal.ansiBlack': '#2a241f',
	'terminal.ansiRed': '#e5534b',
	'terminal.ansiGreen': '#93c97b',
	'terminal.ansiYellow': '#f4c46a',
	'terminal.ansiBlue': '#5a86d6',
	'terminal.ansiMagenta': '#b48ae6',
	'terminal.ansiCyan': '#6fb2f0',
	'terminal.ansiWhite': '#dccfbd',
	'terminal.ansiBrightBlack': '#6e6255',
	'terminal.ansiBrightRed': '#f08a83',
	'terminal.ansiBrightGreen': '#b5dca0',
	'terminal.ansiBrightYellow': '#f8dc9a',
	'terminal.ansiBrightBlue': '#93b4ea',
	'terminal.ansiBrightMagenta': '#cdb0f0',
	'terminal.ansiBrightCyan': '#a6d0f7',
	'terminal.ansiBrightWhite': '#ffffff',
	'quickInput.background': '#1d1915',
	'quickInput.foreground': '#e8dece',
	'quickInputTitle.background': '#241e19',
	'quickInputList.focusBackground': '#ff6a2b33',
	'quickInputList.focusForeground': '#f4c46a',
	'quickInputList.focusIconForeground': '#f4c46a',
	'pickerGroup.foreground': '#ff6a2b',
	'pickerGroup.border': '#3a3129',
	'input.background': '#0f0d0b',
	'input.foreground': '#e8dece',
	'input.border': '#3a3129',
	'input.placeholderForeground': '#6e6255',
	'inputOption.activeBorder': '#f4c46a',
	'inputOption.activeBackground': '#ff6a2b33',
	'inputValidation.errorBorder': '#e5534b',
	'inputValidation.errorBackground': '#2a120d',
	'dropdown.background': '#1d1915',
	'dropdown.border': '#3a3129',
	'checkbox.background': '#1d1915',
	'checkbox.border': '#ff6a2b',
	'button.background': '#ff6a2b',
	'button.foreground': '#1b120b',
	'button.hoverBackground': '#ff8450',
	'button.secondaryBackground': '#3a3129',
	'button.secondaryForeground': '#e8dece',
	'badge.background': '#f4c46a',
	'badge.foreground': '#1b120b',
	'progressBar.background': '#f4c46a',
	'scrollbar.shadow': '#00000000',
	'scrollbarSlider.background': '#ff6a2b1a',
	'scrollbarSlider.hoverBackground': '#ff6a2b40',
	'scrollbarSlider.activeBackground': '#f4c46a66',
	'menu.background': '#1d1915',
	'menu.foreground': '#e8dece',
	'menu.border': '#3a3129',
	'menu.selectionBackground': '#ff6a2b33',
	'menu.selectionForeground': '#f4c46a',
	'menu.separatorBackground': '#3a3129',
	'menubar.selectionBackground': '#ff6a2b33',
	'notifications.background': '#1d1915',
	'notifications.border': '#3a3129',
	'notificationLink.foreground': '#6fb2f0',
	'notificationsInfoIcon.foreground': '#6fb2f0',
	'notificationsWarningIcon.foreground': '#e8a33a',
	'notificationsErrorIcon.foreground': '#e5534b',
	'peekView.border': '#ff6a2b',
	'peekViewTitle.background': '#241e19',
	'peekViewTitleLabel.foreground': '#f4c46a',
	'peekViewEditor.background': '#120f0d',
	'peekViewEditor.matchHighlightBackground': '#f4c46a40',
	'peekViewResult.background': '#0f0d0b',
	'peekViewResult.selectionBackground': '#ff6a2b33',
	'peekViewResult.matchHighlightBackground': '#f4c46a40',
	'breadcrumb.foreground': '#85786a',
	'breadcrumb.focusForeground': '#f4c46a',
	'breadcrumb.activeSelectionForeground': '#ff6a2b',
	'breadcrumbPicker.background': '#1d1915',
	'minimap.background': '#16130f',
	'minimap.selectionHighlight': '#ff6a2b88',
	'minimap.findMatchHighlight': '#f4c46a',
	'minimapGutter.addedBackground': '#93c97b',
	'minimapGutter.modifiedBackground': '#ff6a2b',
	'minimapGutter.deletedBackground': '#e5534b',
	'debugToolBar.background': '#1d1915',
	'welcomePage.tileBackground': '#1d1915',
	'welcomePage.progress.foreground': '#f4c46a',
	'keybindingLabel.background': '#241e19',
	'keybindingLabel.foreground': '#f4c46a',
	'keybindingLabel.border': '#3a3129',
	'keybindingLabel.bottomBorder': '#ff6a2b',
	'settings.headerForeground': '#f4c46a',
	'settings.modifiedItemIndicator': '#ff6a2b',
	'textBlockQuote.background': '#1d1915',
	'textBlockQuote.border': '#ff6a2b',
	'textCodeBlock.background': '#1d1915',
	'textPreformat.foreground': '#f4c46a',
};

export const COLOR_THEME_LIGHT_INITIAL_COLORS = {
	'actionBar.toggledBackground': '#dddddd',
	'activityBar.activeBorder': '#005FB8',
	'activityBar.background': '#F8F8F8',
	'activityBar.border': '#E5E5E5',
	'activityBar.foreground': '#1F1F1F',
	'activityBar.inactiveForeground': '#616161',
	'activityBarBadge.background': '#005FB8',
	'activityBarBadge.foreground': '#FFFFFF',
	'badge.background': '#CCCCCC',
	'badge.foreground': '#3B3B3B',
	'button.background': '#005FB8',
	'button.border': '#0000001a',
	'button.foreground': '#FFFFFF',
	'button.hoverBackground': '#0258A8',
	'button.secondaryBackground': '#E5E5E5',
	'button.secondaryForeground': '#3B3B3B',
	'button.secondaryHoverBackground': '#CCCCCC',
	'chat.slashCommandBackground': '#ADCEFF7A',
	'chat.slashCommandForeground': '#26569E',
	'chat.editedFileForeground': '#895503',
	'checkbox.background': '#F8F8F8',
	'checkbox.border': '#CECECE',
	'descriptionForeground': '#3B3B3B',
	'diffEditor.unchangedRegionBackground': '#f8f8f8',
	'dropdown.background': '#FFFFFF',
	'dropdown.border': '#CECECE',
	'dropdown.foreground': '#3B3B3B',
	'dropdown.listBackground': '#FFFFFF',
	'editor.background': '#FFFFFF',
	'editor.foreground': '#3B3B3B',
	'editor.inactiveSelectionBackground': '#E5EBF1',
	'editor.selectionHighlightBackground': '#ADD6FF80',
	'editorGroup.border': '#E5E5E5',
	'editorGroupHeader.tabsBackground': '#F8F8F8',
	'editorGroupHeader.tabsBorder': '#E5E5E5',
	'editorGutter.addedBackground': '#2EA043',
	'editorGutter.deletedBackground': '#F85149',
	'editorGutter.modifiedBackground': '#005FB8',
	'editorIndentGuide.activeBackground1': '#939393',
	'editorIndentGuide.background1': '#D3D3D3',
	'editorLineNumber.activeForeground': '#171184',
	'editorLineNumber.foreground': '#6E7681',
	'editorOverviewRuler.border': '#E5E5E5',
	'editorSuggestWidget.background': '#F8F8F8',
	'editorWidget.background': '#F8F8F8',
	'errorForeground': '#F85149',
	'focusBorder': '#005FB8',
	'foreground': '#3B3B3B',
	'icon.foreground': '#3B3B3B',
	'input.background': '#FFFFFF',
	'input.border': '#CECECE',
	'input.foreground': '#3B3B3B',
	'input.placeholderForeground': '#767676',
	'inputOption.activeBackground': '#BED6ED',
	'inputOption.activeBorder': '#005FB8',
	'inputOption.activeForeground': '#000000',
	'keybindingLabel.foreground': '#3B3B3B',
	'list.activeSelectionBackground': '#E8E8E8',
	'list.activeSelectionForeground': '#000000',
	'list.activeSelectionIconForeground': '#000000',
	'list.focusAndSelectionOutline': '#005FB8',
	'list.hoverBackground': '#F2F2F2',
	'menu.border': '#CECECE',
	'menu.selectionBackground': '#005FB8',
	'menu.selectionForeground': '#ffffff',
	'notebook.cellBorderColor': '#E5E5E5',
	'notebook.selectedCellBackground': '#C8DDF150',
	'notificationCenterHeader.background': '#FFFFFF',
	'notificationCenterHeader.foreground': '#3B3B3B',
	'notifications.background': '#FFFFFF',
	'notifications.border': '#E5E5E5',
	'notifications.foreground': '#3B3B3B',
	'panel.background': '#F8F8F8',
	'panel.border': '#E5E5E5',
	'panelInput.border': '#E5E5E5',
	'panelTitle.activeBorder': '#005FB8',
	'panelTitle.activeForeground': '#3B3B3B',
	'panelTitle.inactiveForeground': '#3B3B3B',
	'peekViewEditor.matchHighlightBackground': '#BB800966',
	'peekViewResult.background': '#FFFFFF',
	'peekViewResult.matchHighlightBackground': '#BB800966',
	'pickerGroup.border': '#E5E5E5',
	'pickerGroup.foreground': '#8B949E',
	'ports.iconRunningProcessForeground': '#369432',
	'progressBar.background': '#005FB8',
	'quickInput.background': '#F8F8F8',
	'quickInput.foreground': '#3B3B3B',
	'searchEditor.textInputBorder': '#CECECE',
	'settings.dropdownBackground': '#FFFFFF',
	'settings.dropdownBorder': '#CECECE',
	'settings.headerForeground': '#1F1F1F',
	'settings.modifiedItemIndicator': '#BB800966',
	'settings.numberInputBorder': '#CECECE',
	'settings.textInputBorder': '#CECECE',
	'sideBar.background': '#F8F8F8',
	'sideBar.border': '#E5E5E5',
	'sideBar.foreground': '#3B3B3B',
	'sideBarSectionHeader.background': '#F8F8F8',
	'sideBarSectionHeader.border': '#E5E5E5',
	'sideBarSectionHeader.foreground': '#3B3B3B',
	'sideBarTitle.foreground': '#3B3B3B',
	'statusBar.background': '#F8F8F8',
	'statusBar.border': '#E5E5E5',
	'statusBar.debuggingBackground': '#FD716C',
	'statusBar.debuggingForeground': '#000000',
	'statusBar.focusBorder': '#005FB8',
	'statusBar.foreground': '#3B3B3B',
	'statusBar.noFolderBackground': '#F8F8F8',
	'statusBarItem.compactHoverBackground': '#CCCCCC',
	'statusBarItem.errorBackground': '#C72E0F',
	'statusBarItem.focusBorder': '#005FB8',
	'statusBarItem.hoverBackground': '#B8B8B850',
	'statusBarItem.prominentBackground': '#6E768166',
	'statusBarItem.remoteBackground': '#005FB8',
	'statusBarItem.remoteForeground': '#FFFFFF',
	'tab.activeBackground': '#FFFFFF',
	'tab.activeBorder': '#F8F8F8',
	'tab.activeBorderTop': '#005FB8',
	'tab.activeForeground': '#3B3B3B',
	'tab.border': '#E5E5E5',
	'tab.hoverBackground': '#FFFFFF',
	'tab.inactiveBackground': '#F8F8F8',
	'tab.inactiveForeground': '#868686',
	'tab.lastPinnedBorder': '#D4D4D4',
	'tab.selectedBackground': '#E4E6F1',
	'tab.selectedBorderTop': '#68a3da',
	'tab.selectedForeground': '#333333',
	'tab.unfocusedActiveBorder': '#F8F8F8',
	'tab.unfocusedActiveBorderTop': '#E5E5E5',
	'tab.unfocusedHoverBackground': '#F8F8F8',
	'terminal.foreground': '#3B3B3B',
	'terminal.inactiveSelectionBackground': '#E5EBF1',
	'terminal.tab.activeBorder': '#005FB8',
	'terminalCursor.foreground': '#005FB8',
	'textBlockQuote.background': '#F8F8F8',
	'textBlockQuote.border': '#E5E5E5',
	'textCodeBlock.background': '#F8F8F8',
	'textLink.activeForeground': '#005FB8',
	'textLink.foreground': '#005FB8',
	'textPreformat.background': '#0000001F',
	'textPreformat.foreground': '#3B3B3B',
	'textSeparator.foreground': '#21262D',
	'titleBar.activeBackground': '#F8F8F8',
	'titleBar.activeForeground': '#1E1E1E',
	'titleBar.border': '#E5E5E5',
	'titleBar.inactiveBackground': '#F8F8F8',
	'titleBar.inactiveForeground': '#8B949E',
	'welcomePage.tileBackground': '#F3F3F3',
	'widget.border': '#E5E5E5'
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
