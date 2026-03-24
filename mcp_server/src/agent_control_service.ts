import type { session_manager } from "./session_manager.js";
import type { agent_command_broker } from "./agent_command_broker.js";

type str_result = { ok: true; value: string } | { ok: false; description: string };

function ok(value: string): str_result {
    return { ok: true, value };
}
function err(description: string): str_result {
    return { ok: false, description };
}

function format_result(body: unknown): str_result {
    if (body === null || body === undefined) return ok("Done (no body).");
    if (typeof body === "string") return ok(body);
    try {
        return ok(JSON.stringify(body, null, 2));
    } catch {
        return ok(String(body));
    }
}

export class agent_control_service {
    constructor(
        private readonly sessions: session_manager,
        private readonly broker: agent_command_broker
    ) {}

    private resolve_session_id(session_query: string): string | undefined {
        return this.sessions.resolve_session_id(session_query);
    }

    private async run_command(
        session_query: string,
        kind: import("./agent_command_broker.js").agent_command_kind,
        payload: Record<string, unknown>,
        timeout_ms: number
    ): Promise<str_result> {
        const session_id = this.resolve_session_id(session_query);
        if (!session_id) {
            return err(
                `Session not found: ${session_query}. The Inflection Point extension must be running and registered (see list_sessions).`
            );
        }
        const { command_id, done } = this.broker.post_command(session_id, kind, payload);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout_p = new Promise<"timeout">((resolve) => {
            timer = setTimeout(() => resolve("timeout"), timeout_ms);
        });
        try {
            const outcome = await Promise.race([done, timeout_p]);
            if (outcome === "timeout") {
                this.broker.abandon(command_id);
                return err(
                    `Command timed out after ${timeout_ms}ms (extension may be disconnected or blocked).`
                );
            }
            const body = outcome;
            if (body && typeof body === "object" && "ok" in body && (body as { ok: boolean }).ok === false) {
                const e = (body as { error?: string }).error ?? "command failed";
                return err(e);
            }
            return format_result(body);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    start_debugging(session: string, launch_config_name: string, timeout_ms: number): Promise<str_result> {
        const name = launch_config_name.trim();
        const session_id = this.resolve_session_id(session);
        if (!session_id) {
            return Promise.resolve(
                err(
                    `Session not found: ${session}. The Inflection Point extension must be running and registered (see list_sessions).`
                )
            );
        }
        const lc = this.sessions.get_launch_control(session_id);
        if (!lc || lc.available.length === 0) {
            return Promise.resolve(
                err(
                    "Launch configurations are not synced from the IDE yet. Open the workspace in Cursor with Inflection Point enabled and ensure .vscode/launch.json exists (see Agent run sidebar)."
                )
            );
        }
        const gate = this.validate_start_allowed(session_id, name);
        if (gate) return Promise.resolve(gate);
        return this.run_command(session, "start_debugging", { launch_config_name: name }, timeout_ms);
    }

    add_editor_breakpoint(
        session: string,
        file_path: string,
        line: number,
        timeout_ms: number
    ): Promise<str_result> {
        return this.run_command(
            session,
            "add_editor_breakpoint",
            { file_path: file_path.trim(), line },
            timeout_ms
        );
    }

    remove_editor_breakpoint(
        session: string,
        file_path: string,
        line: number,
        timeout_ms: number
    ): Promise<str_result> {
        return this.run_command(
            session,
            "remove_editor_breakpoint",
            { file_path: file_path.trim(), line },
            timeout_ms
        );
    }

    debug_continue(session: string, timeout_ms: number): Promise<str_result> {
        return this.run_command(session, "debug_continue", {}, timeout_ms);
    }

    list_launch_configs(session_query: string): str_result {
        const session_id = this.resolve_session_id(session_query);
        if (!session_id) {
            return err(
                `Session not found: ${session_query}. The Inflection Point extension must be running (see list_sessions).`
            );
        }
        const lc = this.sessions.get_launch_control(session_id);
        if (!lc || lc.available.length === 0) {
            return ok(
                "No launch configurations synced yet. Open the Inflection Point sidebar → Agent run (launch) and expand the workspace, or ensure .vscode/launch.json exists."
            );
        }
        const lines = [
            `Launch configs from workspace (${lc.available.length}):`,
            ...lc.available.map((n) => {
                const allowed =
                    lc.mode === "open" ? !lc.blocked.includes(n) : lc.allowed.includes(n);
                const tag = allowed ? "allowed for agent" : "blocked";
                return `  - ${n} (${tag})`;
            }),
        ];
        lines.push("");
        if (lc.mode === "open") {
            lines.push(
                "Mode: open — all listed configs allowed unless unchecked in Agent run (blocklist)."
            );
        } else if (lc.allowed.length === 0) {
            lines.push("Mode: strict — no configs allowed until you check at least one in Agent run.");
        } else {
            lines.push(`Mode: strict — only these may be started: ${lc.allowed.join(", ")}`);
        }
        return ok(lines.join("\n"));
    }

    private validate_start_allowed(session_id: string, name: string): str_result | null {
        if (this.sessions.is_launch_allowed_for_agent(session_id, name)) return null;
        const lc = this.sessions.get_launch_control(session_id);
        if (!lc?.available.includes(name)) {
            return err(
                `Launch configuration "${name}" is not in the synced list from .vscode/launch.json. Use list_launch_configs.`
            );
        }
        if (lc.mode === "open") {
            return err(
                `Launch configuration "${name}" is blocked for the agent. Check it in Inflection Point → Agent run (launch).`
            );
        }
        return err(
            `Launch configuration "${name}" is not in the agent allowlist. Enable it in Inflection Point → Agent run (launch) (strict mode).`
        );
    }
}
