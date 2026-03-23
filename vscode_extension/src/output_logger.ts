import * as vscode from "vscode";
import type { i_extension_logger } from "./abstractions/i_extension_logger";

export class output_logger implements i_extension_logger {
    private readonly channel: vscode.OutputChannel;

    constructor() {
        this.channel = vscode.window.createOutputChannel("Inflection Point");
    }

    log(message: string): void {
        this.channel.appendLine(message);
    }

    dispose(): void {
        this.channel.dispose();
    }
}
