import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ModelCheckResult, ModelCheckResultSource } from './model/check';
import { CMD_CHECK_MODEL_STOP } from './commands/checkModel';

// Cached HTML template for the WebView
let viewHtml: string | undefined;
let viewPanel: vscode.WebviewPanel | undefined;
let missing: boolean;
let lastCheckResult: ModelCheckResult | undefined;
let panelIsVisible = false;

export function updateCheckResultView(checkResult: ModelCheckResult) {
    if (viewPanel && viewPanel.visible) {
        viewPanel.webview.postMessage({
            checkResult: checkResult
        });
        missing = false;
    } else {
        missing = true;
    }
    lastCheckResult = checkResult;
}

export function revealEmptyCheckResultView(source: ModelCheckResultSource, extContext: vscode.ExtensionContext) {
    revealCheckResultView(extContext, ModelCheckResult.createEmpty(source));
}

export function revealLastCheckResultView(extContext: vscode.ExtensionContext) {
    if (lastCheckResult) {
        revealCheckResultView(extContext, lastCheckResult);
    }
}

function revealCheckResultView(extContext: vscode.ExtensionContext, checkResult: ModelCheckResult) {
    doRevealCheckResultView(extContext);
    updateCheckResultView(checkResult);
}

function doRevealCheckResultView(extContext: vscode.ExtensionContext) {
    if (!viewPanel) {
        createNewPanel();
        ensurePanelBody(extContext);
    } else {
        viewPanel.reveal();
    }
}

function createNewPanel() {
    const title = 'TLA+ model checking';
    viewPanel = vscode.window.createWebviewPanel(
        'modelChecking',
        title,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.resolve(__dirname, '../../resources'))]
        }
    );
    viewPanel.iconPath = {
        dark: vscode.Uri.file(path.resolve(__dirname, '../../resources/images/preview-dark.svg')),
        light: vscode.Uri.file(path.resolve(__dirname, '../../resources/images/preview-light.svg')),
    };
    viewPanel.onDidDispose(() => {
        viewPanel = undefined;
    });
    viewPanel.onDidChangeViewState(e => {
        if (e.webviewPanel.visible && !panelIsVisible && missing && lastCheckResult) {
            // Show what has been missed while the panel was invisible
            updateCheckResultView(lastCheckResult);
        }
        panelIsVisible = e.webviewPanel.visible;
    });
    viewPanel.webview.onDidReceiveMessage(message => {
        if (message.command === 'stop') {
            vscode.commands.executeCommand(CMD_CHECK_MODEL_STOP);
        } else if (message.command === 'openFile') {
            // `One` is used here because at the moment, VSCode doesn't provide API
            // for revealing existing document, so we're speculating here to reduce open documents duplication.
            const viewColumn = message.filePath.endsWith('.out') && viewPanel
                ? viewPanel.viewColumn || vscode.ViewColumn.Active
                : vscode.ViewColumn.One;
            revealFile(message.filePath, viewColumn, message.line, message.character);
        }
    });
    panelIsVisible = true;
}

function ensurePanelBody(extContext: vscode.ExtensionContext) {
    if (!viewPanel) {
        return;
    }
    const resourcesDiskPath = vscode.Uri.file(
        path.join(extContext.extensionPath, 'resources')
    );
    const resourcesPath = resourcesDiskPath.with({ scheme: 'vscode-resource' });
    if (!viewHtml) {
        viewHtml = fs.readFileSync(path.join(resourcesPath.fsPath, 'check-result-view.html'), 'utf8');
    }
    viewHtml = viewHtml.replace(/\${resourcesPath}/g, String(resourcesPath));
    viewPanel.webview.html = viewHtml;
}

function revealFile(filePath: string, viewColumn: vscode.ViewColumn, line: number, character: number) {
    const location = new vscode.Position(line, character);
    const showOpts: vscode.TextDocumentShowOptions = {
        selection: new vscode.Range(location, location),
        viewColumn: viewColumn
    };
    vscode.workspace.openTextDocument(filePath)
        .then(doc => vscode.window.showTextDocument(doc, showOpts));
}
