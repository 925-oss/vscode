/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { copilotHostSkillNames } from './copilotBuiltinSkills.js';

/** Who shipped a skill: VS Code, the bundled Copilot runtime, or anyone else. */
export type CopilotSkillOrigin = 'vscode' | 'runtime' | 'other';

/** Where the runtime reports it discovered a skill (`skill.invoked` `source`). */
const runtimeSkillSources: ReadonlySet<string> = new Set(['project', 'inherited', 'personal-copilot', 'personal-agents', 'custom', 'plugin', 'builtin', 'remote', 'sdk']);

/** Sources discovered from the workspace, the user's home or an organization, which never ship with the product even inside its folder (a source checkout). */
const userSkillSources: ReadonlySet<string> = new Set(['project', 'inherited', 'personal-copilot', 'personal-agents', 'remote']);

export interface ICopilotShippedSkillRoots {
	/** Install roots of the product; skills under them ship with VS Code. */
	readonly productRoots: readonly URI[];
	/** Plugin directories bundled with the Copilot runtime. */
	readonly runtimePluginRoots: readonly URI[];
}

export interface ICopilotSkillTelemetry {
	readonly skillSource: string;
	readonly skillOrigin: CopilotSkillOrigin;
	/** The skill name, only for skills VS Code or the bundled runtime ship; any other name could identify a user. */
	readonly skillName: string | undefined;
}

export function getCopilotSkillTelemetry(skill: { readonly name: string; readonly path?: string; readonly source?: string }, roots: ICopilotShippedSkillRoots): ICopilotSkillTelemetry {
	const skillOrigin = getSkillOrigin(skill, roots);
	return {
		skillSource: skill.source === undefined ? 'unknown' : runtimeSkillSources.has(skill.source) ? skill.source : 'other',
		skillOrigin,
		skillName: skillOrigin === 'other' ? undefined : skill.name,
	};
}

function getSkillOrigin(skill: { readonly name: string; readonly path?: string; readonly source?: string }, roots: ICopilotShippedSkillRoots): CopilotSkillOrigin {
	if (skill.source === 'builtin') {
		return 'runtime';
	}
	const location = skill.path && isAbsolute(skill.path) ? URI.file(skill.path) : undefined;
	// Bundled runtime plugins live under the product install, so check them first.
	if (location && roots.runtimePluginRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(location, root))) {
		return 'runtime';
	}
	if (skill.source === 'sdk' && copilotHostSkillNames.has(skill.name)) {
		return 'vscode';
	}
	if (location && !userSkillSources.has(skill.source ?? '') && roots.productRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(location, root))) {
		return 'vscode';
	}
	return 'other';
}
