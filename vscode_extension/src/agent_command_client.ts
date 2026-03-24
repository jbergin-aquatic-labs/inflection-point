import * as vscode from "vscode";
import type { i_extension_logger } from "./abstractions/i_extension_logger";
import { workspace_session_identity_from_folder } from "./workspace_session_identity";

export type agent_command = {
    id: string;
    kind: string;
    payload: Record<string, unknown>;
};

export class agent_command_client implements vscode.Disposable {
    private stopped = false;

    constructor(
        private readonly port: number,
        private readonly logger: i_extension_logger
    ) {}

    dispose(): void {
        this.stopped = true;
    }

    start(): void {
        void this.loop();
    }

    private async loop(): Promise<void> {
        while (!this.stopped) {
            const folder = vscode.workspace.workspaceFolders?.[0];
            if (!folder) {
                await sleep(2000);
                continue;
            }
            const { session_id } = workspace_session_identity_from_folder(folder);
            const url = `http://127.0.0.1:${this.port}/api/sessions/${encodeURIComponent(session_id)}/agent-commands/next?timeout_ms=55000`;
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(58_000) });
                if (res.status === 204) continue;
                if (!res.ok) {
                    await sleep(1500);
                    continue;
                }
                const cmd = (await res.json()) as agent_command;
                await this.handle_command(session_id, cmd);
            } catch {
                await sleep(2000);
            }
        }
    }

    private async handle_command(session_id: string, cmd: agent_command): Promise<void> {
        try {
            const result = await this.run_command(cmd);
            await this.post_complete(session_id, cmd.id, result);
        } catch (e) {
            await this.post_fail(session_id, cmd.id, String(e));
        }
    }

    private async post_complete(session_id: string, command_id: string, body: unknown): Promise<void> {
        const path = `/api/sessions/${encodeURIComponent(session_id)}/agent-commands/${encodeURIComponent(command_id)}/complete`;
        await fetch(`http://127.0.0.1:${this.port}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? { ok: true }),
        });
    }

    private async post_fail(session_id: string, command_id: string, message: string): Promise<void> {
        const path = `/api/sessions/${encodeURIComponent(session_id)}/agent-commands/${encodeURIComponent(command_id)}/fail`;
        await fetch(`http://127.0.0.1:${this.port}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
        });
    }

    private async run_command(cmd: agent_command): Promise<unknown> {
        switch (cmd.kind) {
            case "start_debugging":
                return this.do_start_debugging(cmd.payload);
            case "add_editor_breakpoint":
                return this.do_add_breakpoint(cmd.payload);
            case "remove_editor_breakpoint":
                return this.do_remove_breakpoint(cmd.payload);
            case "debug_continue":
                return this.do_continue();
            default:
                throw new Error(`unknown command kind: ${cmd.kind}`);
        }
    }

    private async do_start_debugging(payload: Record<string, unknown>): Promise<unknown> {
        const name = String(payload.launch_config_name ?? "").trim();
        if (!name) throw new Error("missing launch_config_name");
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) throw new Error("no workspace folder open");
        const started = await vscode.debug.startDebugging(folder, name);
        if (!started) throw new Error(`startDebugging returned false for "${name}"`);
        return { ok: true, started: true, launch_config_name: name };
    }

    private async do_add_breakpoint(payload: Record<string, unknown>): Promise<unknown> {
        const file_path = String(payload.file_path ?? "").trim();
        const line = Number(payload.line);
        if (!file_path || !Number.isFinite(line) || line < 1) {
            throw new Error("file_path and positive line required");
        }
        const uri = vscode.Uri.file(file_path);
        const loc = new vscode.Location(uri, new vscode.Position(line - 1, 0));
        const bp = new vscode.SourceBreakpoint(loc, true);
        vscode.debug.addBreakpoints([bp]);
        return { ok: true, added: true, file_path, line };
    }

    private async do_remove_breakpoint(payload: Record<string, unknown>): Promise<unknown> {
        const file_path = String(payload.file_path ?? "").trim();
        const line = Number(payload.line);
        if (!file_path || !Number.isFinite(line) || line < 1) {
            throw new Error("file_path and positive line required");
        }
        const uri = vscode.Uri.file(file_path);
        const to_remove = vscode.debug.breakpoints.filter((b) => {
            if (!(b instanceof vscode.SourceBreakpoint)) return false;
            const l = b.location;
            return l.uri.fsPath === uri.fsPath && l.range.start.line === line - 1;
        });
        if (to_remove.length > 0) vscode.debug.removeBreakpoints(to_remove);
        return { ok: true, removed: to_remove.length, file_path, line };
    }

    private async do_continue(): Promise<unknown> {
        await vscode.commands.executeCommand("workbench.action.debug.continue");
        return { ok: true, continued: true };
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
