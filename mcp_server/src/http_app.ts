import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { session_manager } from "./session_manager.js";
import type { debug_query_service } from "./debug_query_service.js";
import type { agent_command_broker } from "./agent_command_broker.js";
import type { agent_control_service } from "./agent_control_service.js";
import { register_debug_tools } from "./mcp_tools.js";
import type { debug_state, expression_result } from "./domain_types.js";

/**
 * JSON body parsing is limited to /api only. Global json() breaks MCP streamable HTTP
 * (GET/SSE and POST) because it consumes or rejects the request stream before handleRequest runs.
 *
 * We use a plain express() app instead of createMcpExpressApp() for exactly this reason:
 * createMcpExpressApp() applies express.json() globally, which consumes the request body
 * before StreamableHTTPServerTransport.handleRequest() can read it, causing "stream is not readable".
 */
export function create_app(
    sessions: session_manager,
    query: debug_query_service,
    broker: agent_command_broker,
    agent_control: agent_control_service
): express.Application {
    const app = express();

    const api = express.Router();
    api.use(express.json({ limit: "50mb" }));

    api.get("/health", (_req, res) => {
        res.json({ status: "running" });
    });

    api.get("/sessions", (_req, res) => {
        res.json(sessions.get_all_sessions());
    });

    api.post("/sessions/:session_id", (req, res) => {
        const name = (req.query.name as string | undefined) ?? undefined;
        const path_q = (req.query.path as string | undefined) ?? undefined;
        sessions.get_or_create_session(req.params.session_id, name, path_q);
        res.sendStatus(200);
    });

    api.delete("/sessions/:session_id", (req, res) => {
        sessions.remove_session(req.params.session_id);
        res.sendStatus(200);
    });

    api.post("/sessions/:session_id/debug-state", (req, res) => {
        const name = (req.query.name as string | undefined) ?? undefined;
        const path_q = (req.query.path as string | undefined) ?? undefined;
        const store = sessions.get_or_create_session(req.params.session_id, name, path_q);
        store.update(req.body as debug_state);
        res.sendStatus(200);
    });

    api.post("/sessions/:session_id/debug-state/expression", (req, res) => {
        const name = (req.query.name as string | undefined) ?? undefined;
        const path_q = (req.query.path as string | undefined) ?? undefined;
        const store = sessions.get_or_create_session(req.params.session_id, name, path_q);
        store.update_expression(req.body as expression_result);
        res.sendStatus(200);
    });

    api.delete("/sessions/:session_id/debug-state", (req, res) => {
        const store = sessions.get_session(req.params.session_id);
        store?.clear();
        res.sendStatus(200);
    });

    api.get("/sessions/:session_id/debug-state/history", (req, res) => {
        const store = sessions.get_session(req.params.session_id);
        const history = store?.get_history() ?? [];
        res.json(history);
    });

    api.delete("/sessions/:session_id/debug-state/history", (req, res) => {
        sessions.get_session(req.params.session_id)?.clear_history();
        res.sendStatus(200);
    });

    api.post("/sessions/:session_id/launch-sync", (req, res) => {
        const names = (req.body as { names?: string[] })?.names;
        if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) {
            res.status(400).json({ error: "body must be { names: string[] }" });
            return;
        }
        sessions.set_launch_sync(req.params.session_id, names);
        res.sendStatus(200);
    });

    api.post("/sessions/:session_id/launch-allow", (req, res) => {
        const body = req.body as { mode?: string; blocked?: string[]; allowed?: string[] };
        if (body.mode !== "open" && body.mode !== "strict") {
            res.status(400).json({ error: "body.mode must be 'open' or 'strict'" });
            return;
        }
        const blocked = body.blocked;
        const allowed = body.allowed;
        if (!Array.isArray(blocked) || !blocked.every((n) => typeof n === "string")) {
            res.status(400).json({ error: "body must include blocked: string[]" });
            return;
        }
        if (!Array.isArray(allowed) || !allowed.every((n) => typeof n === "string")) {
            res.status(400).json({ error: "body must include allowed: string[]" });
            return;
        }
        sessions.set_launch_policy(req.params.session_id, body.mode, blocked, allowed);
        res.sendStatus(200);
    });

    api.get("/sessions/:session_id/agent-commands/next", async (req, res) => {
        const timeout = Math.min(
            120_000,
            Math.max(1000, parseInt(String(req.query.timeout_ms ?? "55000"), 10) || 55_000)
        );
        try {
            const cmd = await broker.wait_for_command(req.params.session_id, timeout);
            if (!cmd) {
                res.status(204).end();
                return;
            }
            res.json(cmd);
        } catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });

    api.post("/sessions/:session_id/agent-commands/:command_id/complete", (req, res) => {
        const ok = broker.complete_command(req.params.command_id, req.body);
        if (!ok) {
            res.status(404).json({ error: "unknown or already completed command id" });
            return;
        }
        res.sendStatus(200);
    });

    api.post("/sessions/:session_id/agent-commands/:command_id/fail", (req, res) => {
        const message = (req.body as { message?: string })?.message ?? "failed";
        const ok = broker.fail_command(req.params.command_id, message);
        if (!ok) {
            res.status(404).json({ error: "unknown or already completed command id" });
            return;
        }
        res.sendStatus(200);
    });

    app.use("/api", api);

    app.get("/about", (_req, res) => {
        res.json({
            service: "inflection_point_mcp_server",
            mcp: "POST or GET / (streamable HTTP); also POST /mcp",
            health: "/api/health",
            agent_control: {
                description:
                    "MCP tools: get_agent_capabilities, list_launch_configs, start_debugging, add_editor_breakpoint, remove_editor_breakpoint, debug_continue (plus existing debug read tools).",
                extension_poll: "GET /api/sessions/:session_id/agent-commands/next?timeout_ms=55000",
                launch_sync: "POST /api/sessions/:session_id/launch-sync { names: string[] }",
                launch_policy: "POST /api/sessions/:session_id/launch-allow { mode, blocked, allowed }",
            },
        });
    });

    const handle_mcp = async (req: express.Request, res: express.Response): Promise<void> => {
        const server = new McpServer({ name: "inflection-point", version: "1.0.0" });
        register_debug_tools(server, query, agent_control);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            res.on("close", () => {
                void transport.close();
                void server.close();
            });
        } catch (e) {
            console.error("MCP error:", e);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
    };

    // Cursor / clients often set MCP "url" to the server origin without /mcp
    app.get("/", (req, res) => void handle_mcp(req, res));
    app.post("/", (req, res) => void handle_mcp(req, res));
    app.get("/mcp", (req, res) => void handle_mcp(req, res));
    app.post("/mcp", (req, res) => void handle_mcp(req, res));

    return app;
}
