import * as vscode from 'vscode';
import { checkModel } from './commands/checkModel';
import { parseModule } from './commands/parseModule';

// Holds all the error messages
let diagnostic: vscode.DiagnosticCollection;

/**
 * Extension entry point.
 */
export function activate(context: vscode.ExtensionContext) {
    diagnostic = vscode.languages.createDiagnosticCollection('tlaplus');
    const cmdParse = vscode.commands.registerCommand('tlaplus.parse', () => parseModule(diagnostic));
    const cmdCheckModel = vscode.commands.registerCommand('tlaplus.model.check', () => checkModel(diagnostic, context));
    context.subscriptions.push(cmdParse);
    context.subscriptions.push(cmdCheckModel);
}

export function deactivate() {}
