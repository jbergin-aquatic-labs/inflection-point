import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { session_manager } from "./session_manager.js";
import type { debug_query_service } from "./debug_query_service.js";
import { register_debug_tools } from "./mcp_tools.js";
import type { debug_state, expression_result } from "./domain_types.js";

/**
 * JSON body parsing is limited to /api only. Global json() breaks MCP streamable HTTP
 * (GET/SSE and POST) because it consumes or rejects the request stream before handleRequest runs.
 */
export function create_app(sessions: session_manager, query: debug_query_service): express.Application {
    const app = createMcpExpressApp();

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

    app.use("/api", api);

    app.get("/about", (_req, res) => {
        res.json({
            service: "inflection_point_mcp_server",
            mcp: "POST or GET / (streamable HTTP); also POST /mcp",
            health: "/api/health",
        });
    });

    const handle_mcp = async (req: express.Request, res: express.Response): Promise<void> => {
        const server = new McpServer({ name: "inflection-point", version: "1.0.0" });
        register_debug_tools(server, query);
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
