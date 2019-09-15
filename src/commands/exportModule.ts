import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import { LANG_TLAPLUS, replaceExtension } from '../common';
import { runTex, ToolProcessInfo } from '../tla2tools';
import { ToolOutputChannel } from '../outputChannels';

export const CMD_EXPORT_TLA_TO_TEX = 'tlaplus.exportToTex';
export const CMD_EXPORT_TLA_TO_PDF = 'tlaplus.exportToPdf';

const CFG_PDF_CONVERT_COMMAND = 'tlaplus.pdf.convertCommand';
const NO_ERROR = 0;

let texOutChannel: ToolOutputChannel | undefined;
let pdfOutChannel: ToolOutputChannel | undefined;

class PdfToolInfo {
    constructor(
        readonly command: string,
        readonly args: string[]
    ) {}
}

/**
 * Runs tla2tex tool on the currently open TLA+ module.
 */
export async function exportModuleToTex(extContext: vscode.ExtensionContext) {
    const doc = getDocumentIfCanRun('LaTeX');
    if (!doc) {
        return;
    }
    generateTexFile(doc.uri.fsPath, true);
}

/**
 * Runs generates a .tex file for the currently open TLA+ module and runs tex-to-pdf converter on it.
 */
export async function exportModuleToPdf(extContext: vscode.ExtensionContext) {
    const doc = getDocumentIfCanRun('PDF');
    if (!doc) {
        return;
    }
    const tlaFilePath = doc.uri.fsPath;
    const texGenerated = await generateTexFile(tlaFilePath, false);
    if (!texGenerated) {
        return;
    }
    generatePdfFile(tlaFilePath);
}

async function generateTexFile(tlaFilePath: string, notifySuccess: boolean): Promise<boolean> {
    const procInfo = await runTex(tlaFilePath);
    getTexOutChannel().bindTo(procInfo);
    return new Promise((resolve, reject) => {
        procInfo.process.on('close', (exitCode: number) => {
            if (exitCode !== NO_ERROR) {
                getTexOutChannel().revealWindow();
                resolve(false);
                return;
            }
            const fileName = path.basename(tlaFilePath);
            const texName = replaceExtension(fileName, 'tex');
            const dviName = replaceExtension(fileName, 'dvi');
            removeTempFiles(tlaFilePath, 'log', 'aux');
            if (notifySuccess) {
                vscode.window.showInformationMessage(`${texName} and ${dviName} generated.`);
            }
            resolve(true);
        });
    });
}

async function generatePdfFile(tlaFilePath: string) {
    const pdfToolInfo = await getPdfToolInfo(path.basename(tlaFilePath));
    if (!pdfToolInfo) {
        return;
    }
    const proc = spawn(
        pdfToolInfo.command,
        pdfToolInfo.args,
        { cwd: path.dirname(tlaFilePath) }
    );
    const cmdLine = [ pdfToolInfo.command ].concat(pdfToolInfo.args).join(' ');
    const procInfo = new ToolProcessInfo(cmdLine, proc);
    getPdfOutChannel().bindTo(procInfo);
    proc.on('error', () => {});  // Without this line, the `close` even doesn't fire in case of invalid command
    proc.on('close', (exitCode: number) => {
        if (exitCode !== NO_ERROR) {
            vscode.window.showErrorMessage(`Error generating PDF: exit code ${exitCode}`);
            getPdfOutChannel().revealWindow();
            return;
        }
        const fileName = path.basename(tlaFilePath);
        const pdfName = replaceExtension(fileName, 'pdf');
        vscode.window.showInformationMessage(`${pdfName} generated.`);
        removeTempFiles(tlaFilePath, 'log', 'aux');
    });
}

async function removeTempFiles(baseFilePath: string, ...extensions: string[]) {
    for (const ext of extensions) {
        await removeFile(replaceExtension(baseFilePath, ext));
    }
}

function removeFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.unlink(filePath, () => resolve());
    });
}

function getTexOutChannel(): ToolOutputChannel {
    if (!texOutChannel) {
        texOutChannel = new ToolOutputChannel('TLA+ to LaTeX');
    }
    return texOutChannel;
}

function getPdfOutChannel(): ToolOutputChannel {
    if (!pdfOutChannel) {
        pdfOutChannel = new ToolOutputChannel('LaTeX to PDF');
    }
    return pdfOutChannel;
}

function getDocumentIfCanRun(format: string): vscode.TextDocument | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(`No editor is active, cannot export a TLA+ module to ${format}.`);
        return undefined;
    }
    if (editor.document.languageId !== LANG_TLAPLUS) {
        vscode.window.showWarningMessage(
            `File in the active editor is not a TLA+ file, it cannot be exported to ${format}.`);
        return undefined;
    }
    return editor.document;
}

async function getPdfToolInfo(texFilePath: string): Promise<PdfToolInfo | undefined> {
    const pdfCmd = (vscode.workspace.getConfiguration().get<string>(CFG_PDF_CONVERT_COMMAND) || '').trim();
    if (pdfCmd === '') {
        vscode.window.showWarningMessage('PDF generation command not specified. Check the extension settings.');
        return Promise.resolve(undefined);
    }
    const srcFile = replaceExtension(path.basename(texFilePath), 'tex');
    const args = [];
    if (pdfCmd.endsWith('pdflatex') || pdfCmd.endsWith('pdflatex.exe')) {
        args.push('-interaction', 'nonstopmode');
    }
    args.push(srcFile);
    return Promise.resolve(new PdfToolInfo(pdfCmd, args));
}