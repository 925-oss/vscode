import { disposableTimeout } from '../../../../base/common/async.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

/**
 * Setting keys owned by the Quenchlight contributions.
 */
export const enum QuenchlightSettings {
	GlowEnabled = 'quenchlight.glow.enabled',
	FlashOnSave = 'quenchlight.glow.flashOnSave',
	TemperEnabled = 'quenchlight.temper.enabled',
	AngularOnlyInAngularWorkspaces = 'quenchlight.angular.onlyInAngularWorkspaces',
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
