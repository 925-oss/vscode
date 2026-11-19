/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Saiyan Code contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { registerAzure } from './azure';
import { registerGitChanges } from './changes';
import { registerCompose } from './compose';
import { registerHelm } from './helm';
import { registerJenkins } from './jenkins';
import { registerJira } from './jira';
import { registerKubernetes } from './kubernetes';
import { registerPostgres } from './postgres';
import { registerTypeOrm } from './typeorm';

export function activate(context: vscode.ExtensionContext): void {
	registerGitChanges(context);
	registerCompose(context);
	registerHelm(context);
	registerTypeOrm(context);
	registerPostgres(context);
	registerJenkins(context);
	registerKubernetes(context);
	registerAzure(context);
	registerJira(context);
}

export function deactivate(): void { }
