import * as vscode from "vscode";
import type { IExtensionLogger } from "./abstractions/IExtensionLogger.js";

/**
 * Logs to the VS Code "princiPal" output channel.
 * Equivalent of C# OutputLogger that uses IVsOutputWindowPane.
 */
export class OutputLogger implements IExtensionLogger {
    private readonly _channel: vscode.OutputChannel;

    constructor(channel?: vscode.OutputChannel) {
        this._channel =
            channel ?? vscode.window.createOutputChannel("princiPal");
    }

    log(message: string): void {
        const timestamp = new Date().toLocaleTimeString("en-GB", {
            hour12: false,
        });
        this._channel.appendLine(`[${timestamp}] ${message}`);
    }

    dispose(): void {
        this._channel.dispose();
    }
}
