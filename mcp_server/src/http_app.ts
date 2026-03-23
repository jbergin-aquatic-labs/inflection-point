import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { session_manager } from "./session_manager.js";
import type { debug_query_service } from "./debug_query_service.js";
import { register_debug_tools } from "./mcp_tools.js";
import type { debug_state, expression_result } from "./domain_types.js";

export function create_app(sessions: session_manager, query: debug_query_service): express.Application {
    const app = createMcpExpressApp();
    app.use(express.json({ limit: "50mb" }));

    app.get("/api/health", (_req, res) => {
        res.json({ status: "running" });
    });

    app.get("/api/sessions", (_req, res) => {
        res.json(sessions.get_all_sessions());
    });

    app.post("/api/sessions/:session_id", (req, res) => {
        const name = (req.query.name as string | undefined) ?? undefined;
        const path_q = (req.query.path as string | undefined) ?? undefined;
        sessions.get_or_create_session(req.params.session_id, name, path_q);
        res.sendStatus(200);
    });

    app.delete("/api/sessions/:session_id", (req, res) => {
        sessions.remove_session(req.params.session_id);
        res.sendStatus(200);
    });

    const debug_group = "/api/sessions/:session_id/debug-state";

    app.post(debug_group, (req, res) => {
        const name = (req.query.name as string | undefined) ?? undefined;
        const path_q = (req.query.path as string | undefined) ?? undefined;
        const store = sessions.get_or_create_session(req.params.session_id, name, path_q);
        store.update(req.body as debug_state);
        res.sendStatus(200);
    });

    app.post(`${debug_group}/expression`, (req, res) => {
        const name = (req.query.name as string | undefined) ?? undefined;
        const path_q = (req.query.path as string | undefined) ?? undefined;
        const store = sessions.get_or_create_session(req.params.session_id, name, path_q);
        store.update_expression(req.body as expression_result);
        res.sendStatus(200);
    });

    app.delete(debug_group, (req, res) => {
        const store = sessions.get_session(req.params.session_id);
        store?.clear();
        res.sendStatus(200);
    });

    app.get(`${debug_group}/history`, (req, res) => {
        const store = sessions.get_session(req.params.session_id);
        const history = store?.get_history() ?? [];
        res.json(history);
    });

    app.delete(`${debug_group}/history`, (req, res) => {
        sessions.get_session(req.params.session_id)?.clear_history();
        res.sendStatus(200);
    });

    app.get("/", (_req, res) => {
        res.type("json").send(
            JSON.stringify({
                service: "principal_mcp_server",
                mcp_post: "/mcp",
                health: "/api/health",
            })
        );
    });

    const handle_mcp = async (req: express.Request, res: express.Response): Promise<void> => {
        const server = new McpServer({ name: "principal", version: "1.0.0" });
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

    app.post("/mcp", (req, res) => void handle_mcp(req, res));

    return app;
}
