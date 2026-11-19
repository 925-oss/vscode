/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

/**
 * Setting keys owned by the Saiyan contributions.
 */
export const enum SaiyanSettings {
	AuraEnabled = 'saiyan.aura.enabled',
	FlashOnSave = 'saiyan.aura.flashOnSave',
	PowerLevelEnabled = 'saiyan.powerLevel.enabled',
}

/**
 * Restart a CSS animation that is driven by a class on `element`. The class is
 * removed again after `durationMs`; disposing the result removes it early.
 */
export function replayAnimationClass(element: HTMLElement, className: string, durationMs: number): IDisposable {
	element.classList.remove(className);
	void element.offsetWidth; // force a reflow so the animation starts over
	element.classList.add(className);
	const timeout = disposableTimeout(() => element.classList.remove(className), durationMs);
	return {
		dispose: () => {
			timeout.dispose();
			element.classList.remove(className);
		}
	};
}
