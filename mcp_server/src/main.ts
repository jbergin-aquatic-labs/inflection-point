import type { Server } from "node:http";
import { create_app } from "./http_app.js";
import { session_manager } from "./session_manager.js";
import { debug_query_service } from "./debug_query_service.js";
import { agent_command_broker } from "./agent_command_broker.js";
import { agent_control_service } from "./agent_control_service.js";

function parse_port(args: string[], default_port = 9229): number {
    for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === "--port") {
            const p = parseInt(args[i + 1], 10);
            if (Number.isFinite(p)) return p;
        }
    }
    return default_port;
}

const reaper_interval_ms = 30_000;
const session_stale_ms = 90_000;

/**
 * Optional Quartz-style shutdown (legacy). **Off by default** so Cursor MCP stays up:
 * MCP traffic does not register "sessions" — only the VS Code extension does via /api/sessions.
 * Auto-exit after grace caused 127.0.0.1:9229 ECONNREFUSED when the extension deregistered or
 * heartbeats paused briefly.
 *
 * Set INFLECTION_POINT_EXIT_ON_IDLE=1 to enable:
 * - 5 min with zero extension sessions → exit
 * - after any session existed: zero sessions for 30s grace → exit
 */
function maybe_start_idle_shutdown_watchdog(server: Server, sessions: session_manager): void {
    if (process.env.INFLECTION_POINT_EXIT_ON_IDLE !== "1") {
        return;
    }

    const idle_initial_ms = 300_000;
    const idle_grace_ms = 30_000;
    type watchdog_phase = "waiting_for_first_session" | "active" | "grace_period";

    let phase: watchdog_phase = "waiting_for_first_session";
    const started_at = Date.now();
    let grace_started_at: number | null = null;

    setInterval(() => {
        const n = sessions.session_count;
        const now = Date.now();

        if (phase === "waiting_for_first_session") {
            if (n > 0) {
                phase = "active";
            } else if (now - started_at >= idle_initial_ms) {
                console.error("No session connected within initial timeout; exiting.");
                server.close();
                process.exit(0);
            }
        } else if (phase === "active") {
            if (n === 0) {
                phase = "grace_period";
                grace_started_at = now;
            }
        } else if (phase === "grace_period") {
            if (n > 0) {
                phase = "active";
                grace_started_at = null;
            } else if (grace_started_at !== null && now - grace_started_at >= idle_grace_ms) {
                console.error("Grace period expired with no active sessions; exiting.");
                server.close();
                process.exit(0);
            }
        }
    }, 10_000);
}

function main(): void {
    const port = parse_port(process.argv);
    const sessions = new session_manager();
    const query = new debug_query_service(sessions);
    const broker = new agent_command_broker();
    const agent_control = new agent_control_service(sessions, broker);
    const app = create_app(sessions, query, broker, agent_control);

    const server = app.listen(port, "127.0.0.1", () => {
        console.error(
            `inflection_point_mcp_server listening on http://127.0.0.1:${port}/ (MCP streamable HTTP: GET/POST / or /mcp)`
        );
        console.error(
            "MCP agent tools: get_agent_capabilities, list_launch_configs, start_debugging, add/remove_editor_breakpoint, debug_continue (see GET /about)"
        );
    });

    maybe_start_idle_shutdown_watchdog(server, sessions);

    setInterval(() => {
        for (const id of sessions.get_stale_session_ids(session_stale_ms)) {
            console.error(`Reaping stale session ${id} (no heartbeat for ${session_stale_ms / 1000}s).`);
            sessions.remove_session(id);
        }
    }, reaper_interval_ms);
}

main();
