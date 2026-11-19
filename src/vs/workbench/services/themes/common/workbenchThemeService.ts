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
	export const COLOR_THEME_DARK = 'Saiyan Aura';
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
	'foreground': '#c9cff0',
	'descriptionForeground': '#7a82b8',
	'focusBorder': '#ffd23f55',
	'contrastBorder': '#00000000',
	'selection.background': '#ff8c1a55',
	'widget.shadow': '#00000088',
	'sash.hoverBorder': '#ffd23f',
	'textLink.foreground': '#5ce1ff',
	'textLink.activeForeground': '#ffd23f',
	'icon.foreground': '#8f97cc',
	'editor.background': '#0c0f26',
	'editor.foreground': '#d6dcf5',
	'editor.lineHighlightBackground': '#151a42',
	'editor.lineHighlightBorder': '#00000000',
	'editor.selectionBackground': '#ff8c1a40',
	'editor.selectionHighlightBackground': '#ff8c1a1f',
	'editor.inactiveSelectionBackground': '#ff8c1a20',
	'editor.wordHighlightBackground': '#5ce1ff1f',
	'editor.wordHighlightStrongBackground': '#ffd23f26',
	'editor.findMatchBackground': '#ffd23f66',
	'editor.findMatchBorder': '#ffd23f',
	'editor.findMatchHighlightBackground': '#ffd23f26',
	'editor.rangeHighlightBackground': '#5ce1ff12',
	'editorCursor.foreground': '#ffd23f',
	'editorCursor.background': '#0c0f26',
	'editorLineNumber.foreground': '#2f3670',
	'editorLineNumber.activeForeground': '#ffd23f',
	'editorWhitespace.foreground': '#1f2550',
	'editorIndentGuide.background1': '#1a1f48',
	'editorIndentGuide.activeBackground1': '#ff8c1a66',
	'editorRuler.foreground': '#1a1f48',
	'editorBracketMatch.background': '#ffd23f22',
	'editorBracketMatch.border': '#ffd23f88',
	'editorBracketHighlight.foreground1': '#ffd23f',
	'editorBracketHighlight.foreground2': '#ff8c1a',
	'editorBracketHighlight.foreground3': '#5ce1ff',
	'editorBracketHighlight.foreground4': '#ff7ac6',
	'editorBracketHighlight.foreground5': '#7ee36b',
	'editorBracketHighlight.foreground6': '#6f9dff',
	'editorBracketHighlight.unexpectedBracket.foreground': '#ff4d4d',
	'editorBracketPairGuide.activeBackground1': '#ffd23f66',
	'editorBracketPairGuide.activeBackground2': '#ff8c1a66',
	'editorBracketPairGuide.activeBackground3': '#5ce1ff66',
	'editorBracketPairGuide.activeBackground4': '#ff7ac666',
	'editorBracketPairGuide.activeBackground5': '#7ee36b66',
	'editorBracketPairGuide.activeBackground6': '#6f9dff66',
	'editorGutter.background': '#0c0f26',
	'editorGutter.addedBackground': '#7ee36b',
	'editorGutter.modifiedBackground': '#ff8c1a',
	'editorGutter.deletedBackground': '#ff4d4d',
	'editorError.foreground': '#ff4d4d',
	'editorWarning.foreground': '#ffb020',
	'editorInfo.foreground': '#5ce1ff',
	'editorHint.foreground': '#b48cff',
	'editorInlayHint.foreground': '#6870a8',
	'editorInlayHint.background': '#151a4280',
	'editorCodeLens.foreground': '#5b6399',
	'editorLink.activeForeground': '#5ce1ff',
	'editorGhostText.foreground': '#4b5390',
	'editorOverviewRuler.border': '#00000000',
	'editorOverviewRuler.findMatchForeground': '#ffd23f',
	'editorOverviewRuler.modifiedForeground': '#ff8c1a',
	'editorOverviewRuler.addedForeground': '#7ee36b',
	'editorOverviewRuler.deletedForeground': '#ff4d4d',
	'editorOverviewRuler.errorForeground': '#ff4d4d',
	'editorOverviewRuler.warningForeground': '#ffb020',
	'editorWidget.background': '#11153a',
	'editorWidget.border': '#252b62',
	'editorSuggestWidget.background': '#11153a',
	'editorSuggestWidget.border': '#252b62',
	'editorSuggestWidget.foreground': '#c9cff0',
	'editorSuggestWidget.selectedBackground': '#ff8c1a33',
	'editorSuggestWidget.selectedForeground': '#ffffff',
	'editorSuggestWidget.highlightForeground': '#ffd23f',
	'editorSuggestWidget.focusHighlightForeground': '#ffd23f',
	'editorHoverWidget.background': '#11153a',
	'editorHoverWidget.border': '#252b62',
	'editorGroup.border': '#1a1f48',
	'editorGroup.dropBackground': '#ff8c1a22',
	'editorGroupHeader.tabsBackground': '#090b1e',
	'editorGroupHeader.noTabsBackground': '#0c0f26',
	'editorGroupHeader.tabsBorder': '#00000000',
	'editorStickyScroll.background': '#0f1333',
	'editorStickyScrollHover.background': '#151a42',
	'diffEditor.insertedTextBackground': '#7ee36b22',
	'diffEditor.removedTextBackground': '#ff4d4d22',
	'diffEditor.insertedLineBackground': '#7ee36b12',
	'diffEditor.removedLineBackground': '#ff4d4d12',
	'tab.activeBackground': '#0c0f26',
	'tab.inactiveBackground': '#090b1e',
	'tab.activeForeground': '#ffd23f',
	'tab.inactiveForeground': '#5b6399',
	'tab.hoverBackground': '#11153a',
	'tab.border': '#00000000',
	'tab.activeBorder': '#00000000',
	'tab.activeBorderTop': '#ff8c1a',
	'tab.unfocusedActiveBorderTop': '#ff8c1a55',
	'tab.activeModifiedBorder': '#ffd23f',
	'titleBar.activeBackground': '#090b1e',
	'titleBar.inactiveBackground': '#090b1e',
	'titleBar.activeForeground': '#ffb35c',
	'titleBar.inactiveForeground': '#3b4280',
	'titleBar.border': '#ff8c1a33',
	'activityBar.background': '#090b1e',
	'activityBar.foreground': '#ffd23f',
	'activityBar.inactiveForeground': '#4b5390',
	'activityBar.activeBorder': '#ff8c1a',
	'activityBar.border': '#00000000',
	'activityBarBadge.background': '#ff8c1a',
	'activityBarBadge.foreground': '#0c0f26',
	'sideBar.background': '#090b1e',
	'sideBar.foreground': '#a7aedb',
	'sideBar.border': '#1a1f48',
	'sideBarTitle.foreground': '#ff8c1a',
	'sideBarSectionHeader.background': '#090b1e',
	'sideBarSectionHeader.foreground': '#ffd23f',
	'sideBarSectionHeader.border': '#1a1f48',
	'list.activeSelectionBackground': '#ff8c1a2e',
	'list.activeSelectionForeground': '#ffd23f',
	'list.activeSelectionIconForeground': '#ffd23f',
	'list.inactiveSelectionBackground': '#151a42',
	'list.inactiveSelectionForeground': '#d6dcf5',
	'list.hoverBackground': '#11153a',
	'list.hoverForeground': '#ffffff',
	'list.focusOutline': '#00000000',
	'list.focusBackground': '#ff8c1a22',
	'list.highlightForeground': '#ffd23f',
	'list.errorForeground': '#ff6b6b',
	'list.warningForeground': '#ffb020',
	'list.dropBackground': '#ff8c1a22',
	'tree.indentGuidesStroke': '#252b62',
	'gitDecoration.modifiedResourceForeground': '#ff9f43',
	'gitDecoration.addedResourceForeground': '#7ee36b',
	'gitDecoration.untrackedResourceForeground': '#7ee36b',
	'gitDecoration.deletedResourceForeground': '#ff4d4d',
	'gitDecoration.conflictingResourceForeground': '#ff7ac6',
	'gitDecoration.ignoredResourceForeground': '#3b4280',
	'statusBar.background': '#ff8c1a',
	'statusBar.foreground': '#1a0f00',
	'statusBar.border': '#ffd23f',
	'statusBar.noFolderBackground': '#4f6bff',
	'statusBar.noFolderForeground': '#ffffff',
	'statusBar.debuggingBackground': '#4f6bff',
	'statusBar.debuggingForeground': '#ffffff',
	'statusBarItem.remoteBackground': '#ffd23f',
	'statusBarItem.remoteForeground': '#1a0f00',
	'statusBarItem.hoverBackground': '#ffd23f66',
	'statusBarItem.prominentBackground': '#ffd23f',
	'statusBarItem.prominentForeground': '#1a0f00',
	'statusBarItem.errorBackground': '#ff4d4d',
	'statusBarItem.errorForeground': '#ffffff',
	'panel.background': '#090b1e',
	'panel.border': '#ff8c1a44',
	'panelTitle.activeForeground': '#ffd23f',
	'panelTitle.inactiveForeground': '#5b6399',
	'panelTitle.activeBorder': '#ff8c1a',
	'terminal.background': '#090b1e',
	'terminal.foreground': '#d6dcf5',
	'terminalCursor.foreground': '#ffd23f',
	'terminal.selectionBackground': '#ff8c1a40',
	'terminal.ansiBlack': '#1a1e40',
	'terminal.ansiRed': '#ff4d4d',
	'terminal.ansiGreen': '#7ee36b',
	'terminal.ansiYellow': '#ffd23f',
	'terminal.ansiBlue': '#4f8cff',
	'terminal.ansiMagenta': '#ff7ac6',
	'terminal.ansiCyan': '#5ce1ff',
	'terminal.ansiWhite': '#c9cff0',
	'terminal.ansiBrightBlack': '#4b5390',
	'terminal.ansiBrightRed': '#ff7a7a',
	'terminal.ansiBrightGreen': '#a6f28f',
	'terminal.ansiBrightYellow': '#ffe57a',
	'terminal.ansiBrightBlue': '#82acff',
	'terminal.ansiBrightMagenta': '#ffa3d9',
	'terminal.ansiBrightCyan': '#9aefff',
	'terminal.ansiBrightWhite': '#ffffff',
	'quickInput.background': '#11153a',
	'quickInput.foreground': '#d6dcf5',
	'quickInputTitle.background': '#151a42',
	'quickInputList.focusBackground': '#ff8c1a33',
	'quickInputList.focusForeground': '#ffd23f',
	'quickInputList.focusIconForeground': '#ffd23f',
	'pickerGroup.foreground': '#ff8c1a',
	'pickerGroup.border': '#252b62',
	'input.background': '#090b1e',
	'input.foreground': '#d6dcf5',
	'input.border': '#252b62',
	'input.placeholderForeground': '#4b5390',
	'inputOption.activeBorder': '#ffd23f',
	'inputOption.activeBackground': '#ff8c1a33',
	'inputValidation.errorBorder': '#ff4d4d',
	'inputValidation.errorBackground': '#2a0d1a',
	'dropdown.background': '#11153a',
	'dropdown.border': '#252b62',
	'checkbox.background': '#11153a',
	'checkbox.border': '#ff8c1a',
	'button.background': '#ff8c1a',
	'button.foreground': '#1a0f00',
	'button.hoverBackground': '#ffa340',
	'button.secondaryBackground': '#252b62',
	'button.secondaryForeground': '#d6dcf5',
	'badge.background': '#ffd23f',
	'badge.foreground': '#1a0f00',
	'progressBar.background': '#ffd23f',
	'scrollbar.shadow': '#00000000',
	'scrollbarSlider.background': '#ff8c1a1a',
	'scrollbarSlider.hoverBackground': '#ff8c1a40',
	'scrollbarSlider.activeBackground': '#ffd23f66',
	'menu.background': '#11153a',
	'menu.foreground': '#d6dcf5',
	'menu.border': '#252b62',
	'menu.selectionBackground': '#ff8c1a33',
	'menu.selectionForeground': '#ffd23f',
	'menu.separatorBackground': '#252b62',
	'menubar.selectionBackground': '#ff8c1a33',
	'notifications.background': '#11153a',
	'notifications.border': '#252b62',
	'notificationLink.foreground': '#5ce1ff',
	'notificationsInfoIcon.foreground': '#5ce1ff',
	'notificationsWarningIcon.foreground': '#ffb020',
	'notificationsErrorIcon.foreground': '#ff4d4d',
	'peekView.border': '#ff8c1a',
	'peekViewTitle.background': '#151a42',
	'peekViewTitleLabel.foreground': '#ffd23f',
	'peekViewEditor.background': '#0a0d22',
	'peekViewEditor.matchHighlightBackground': '#ffd23f40',
	'peekViewResult.background': '#090b1e',
	'peekViewResult.selectionBackground': '#ff8c1a33',
	'peekViewResult.matchHighlightBackground': '#ffd23f40',
	'breadcrumb.foreground': '#5b6399',
	'breadcrumb.focusForeground': '#ffd23f',
	'breadcrumb.activeSelectionForeground': '#ff8c1a',
	'breadcrumbPicker.background': '#11153a',
	'minimap.background': '#0c0f26',
	'minimap.selectionHighlight': '#ff8c1a88',
	'minimap.findMatchHighlight': '#ffd23f',
	'minimapGutter.addedBackground': '#7ee36b',
	'minimapGutter.modifiedBackground': '#ff8c1a',
	'minimapGutter.deletedBackground': '#ff4d4d',
	'debugToolBar.background': '#11153a',
	'welcomePage.tileBackground': '#11153a',
	'welcomePage.progress.foreground': '#ffd23f',
	'keybindingLabel.background': '#151a42',
	'keybindingLabel.foreground': '#ffd23f',
	'keybindingLabel.border': '#252b62',
	'keybindingLabel.bottomBorder': '#ff8c1a',
	'settings.headerForeground': '#ffd23f',
	'settings.modifiedItemIndicator': '#ff8c1a',
	'textBlockQuote.background': '#11153a',
	'textBlockQuote.border': '#ff8c1a',
	'textCodeBlock.background': '#11153a',
	'textPreformat.foreground': '#ffd23f',
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
