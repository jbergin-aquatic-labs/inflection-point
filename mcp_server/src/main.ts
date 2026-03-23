import { create_app } from "./http_app.js";
import { session_manager } from "./session_manager.js";
import { debug_query_service } from "./debug_query_service.js";

function parse_port(args: string[], default_port = 9229): number {
    for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === "--port") {
            const p = parseInt(args[i + 1], 10);
            if (Number.isFinite(p)) return p;
        }
    }
    return default_port;
}

const idle_initial_ms = 300_000;
const idle_grace_ms = 30_000;
const reaper_interval_ms = 30_000;
const session_stale_ms = 90_000;

type watchdog_phase = "waiting_for_first_session" | "active" | "grace_period";

function main(): void {
    const port = parse_port(process.argv);
    const sessions = new session_manager();
    const query = new debug_query_service(sessions);
    const app = create_app(sessions, query);

    const server = app.listen(port, "127.0.0.1", () => {
        console.error(`principal_mcp_server listening on http://127.0.0.1:${port}/ (MCP POST /mcp)`);
    });

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

    setInterval(() => {
        for (const id of sessions.get_stale_session_ids(session_stale_ms)) {
            console.error(`Reaping stale session ${id} (no heartbeat for ${session_stale_ms / 1000}s).`);
            sessions.remove_session(id);
        }
    }, reaper_interval_ms);
}

main();
