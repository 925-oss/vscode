/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotSkillTelemetry } from '../../node/copilot/copilotSkillTelemetry.js';

suite('Copilot skill telemetry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const appRoot = URI.file('/Applications/Code.app/Contents/Resources/app');
	const runtimePlugin = URI.joinPath(appRoot, 'node_modules.asar.unpacked/@github/copilot-sdk-darwin-arm64/plugins/browser-use');
	const roots = { productRoots: [appRoot], runtimePluginRoots: [runtimePlugin] };
	const classify = (name: string, path: string | undefined, source: string | undefined) => getCopilotSkillTelemetry({ name, path, source }, roots);

	test('names only skills that VS Code or the bundled runtime ship', () => {
		assert.deepStrictEqual([
			classify('pr-stack', '/runtime/builtin/pr-stack/SKILL.md', 'builtin'),
			classify('doctor', URI.joinPath(runtimePlugin, 'skills/doctor/SKILL.md').fsPath, 'plugin'),
			classify('troubleshoot', 'troubleshoot', 'sdk'),
			classify('commit', URI.joinPath(appRoot, 'out/vs/sessions/skills/commit/SKILL.md').fsPath, 'custom'),
			classify('agent-customization', URI.joinPath(appRoot, 'extensions/copilot/assets/prompts/skills/agent-customization/SKILL.md').fsPath, 'plugin'),
		], [
			{ skillSource: 'builtin', skillOrigin: 'runtime', skillName: 'pr-stack' },
			{ skillSource: 'plugin', skillOrigin: 'runtime', skillName: 'doctor' },
			{ skillSource: 'sdk', skillOrigin: 'vscode', skillName: 'troubleshoot' },
			{ skillSource: 'custom', skillOrigin: 'vscode', skillName: 'commit' },
			{ skillSource: 'plugin', skillOrigin: 'vscode', skillName: 'agent-customization' },
		]);
	});

	test('does not name user skills, even when they share a built-in name', () => {
		assert.deepStrictEqual([
			classify('commit', '/Users/me/.copilot/skills/commit/SKILL.md', 'personal-copilot'),
			classify('my-skill', '/repo/.github/skills/my-skill/SKILL.md', 'project'),
			classify('other-sdk-skill', 'other-sdk-skill', 'sdk'),
			classify('relative', 'skills/relative/SKILL.md', 'custom'),
			classify('sibling', '/Applications/Code.app/Contents/Resources/app-other/skills/sibling/SKILL.md', 'custom'),
			classify('launch', URI.joinPath(appRoot, '.agents/skills/launch/SKILL.md').fsPath, 'project'),
		], [
			{ skillSource: 'personal-copilot', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'project', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'sdk', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'custom', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'custom', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'project', skillOrigin: 'other', skillName: undefined },
		]);
	});

	test('bounds the reported source', () => {
		assert.deepStrictEqual([
			classify('a', undefined, undefined).skillSource,
			classify('b', undefined, 'something-new').skillSource,
		], ['unknown', 'other']);
	});
});
