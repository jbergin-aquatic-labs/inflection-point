import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { debug_query_service } from "./debug_query_service.js";

function tool_text(r: { ok: true; value: string } | { ok: false; description: string }) {
    if (r.ok) {
        return { content: [{ type: "text" as const, text: r.value }] };
    }
    return {
        content: [{ type: "text" as const, text: r.description }],
        isError: true as const,
    };
}

export function register_debug_tools(server: McpServer, query: debug_query_service): void {
    server.registerTool(
        "list_sessions",
        {
            description:
                "List all connected debugger sessions. Shows session names, IDs, workspace paths, and whether each session is currently stopped at a breakpoint. Use the name or ID as the 'session' parameter in other tools.",
            inputSchema: z.object({}),
        },
        async () => tool_text(query.list_sessions())
    );

    server.registerTool(
        "get_debug_state",
        {
            description:
                "Get the full current debug state including locals, call stack, and current source location at a breakpoint.",
            inputSchema: {
                session: z
                    .string()
                    .describe("Session name or ID. Use list_sessions to see options."),
                depth: z
                    .number()
                    .optional()
                    .default(2)
                    .describe("Max member expansion depth (0=flat, 2=default)"),
            },
        },
        async ({ session, depth }) => tool_text(query.get_debug_state(session, depth))
    );

    server.registerTool(
        "get_locals",
        {
            description:
                "Get all local variables and their values at the current breakpoint.",
            inputSchema: {
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
                depth: z.number().optional().default(2).describe("Max member expansion depth (0=flat, 2=default)"),
            },
        },
        async ({ session, depth }) => tool_text(query.get_locals(session, depth))
    );

    server.registerTool(
        "get_call_stack",
        {
            description:
                "Get the current call stack (method chain to the current breakpoint).",
            inputSchema: {
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
            },
        },
        async ({ session }) => tool_text(query.get_call_stack(session))
    );

    server.registerTool(
        "get_source_context",
        {
            description:
                "Get source around the current breakpoint (~30 lines, current line marked).",
            inputSchema: {
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
            },
        },
        async ({ session }) => tool_text(query.get_source_context(session))
    );

    server.registerTool(
        "get_breakpoints",
        {
            description:
                "List breakpoints set in the IDE (file, line, conditions, enabled).",
            inputSchema: {
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
            },
        },
        async ({ session }) => tool_text(query.get_breakpoints(session))
    );

    server.registerTool(
        "get_expression_result",
        {
            description:
                "Get the last evaluated expression result if the extension published one.",
            inputSchema: {
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
                depth: z.number().optional().default(2).describe("Max member expansion depth (0=flat, 2=default)"),
            },
        },
        async ({ session, depth }) => tool_text(query.get_expression_result(session, depth))
    );

    server.registerTool(
        "explain_current_state",
        {
            description:
                "Combined source context, locals, and stack at the current breakpoint.",
            inputSchema: {
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
            },
        },
        async ({ session }) => tool_text(query.explain_current_state(session))
    );

    server.registerTool(
        "get_breakpoint_history",
        {
            description:
                "Summary of captured breakpoint snapshots (index, time, location, local count). Use get_snapshot for detail.",
            inputSchema: {
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
            },
        },
        async ({ session }) => tool_text(query.get_breakpoint_history(session))
    );

    server.registerTool(
        "get_snapshot",
        {
            description:
                "Full state for one snapshot by index (see get_breakpoint_history).",
            inputSchema: {
                index: z.number().describe("The snapshot index number from get_breakpoint_history"),
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
                detail: z
                    .string()
                    .optional()
                    .default("full")
                    .describe("Detail level: full, changes, summary (default full)"),
                depth: z.number().optional().default(2).describe("Max member expansion depth (0=flat, 2=default)"),
            },
        },
        async ({ index, session, detail, depth }) =>
            tool_text(query.get_snapshot(index, session, detail, depth))
    );

    server.registerTool(
        "explain_execution_flow",
        {
            description:
                "Execution trace across snapshots (deltas or full detail).",
            inputSchema: {
                session: z.string().describe("Session name or ID. Use list_sessions to see options."),
                detail: z
                    .string()
                    .optional()
                    .default("changes")
                    .describe(
                        "Detail level: full=complete state, changes=delta between snapshots (default), summary=location+change names only"
                    ),
                depth: z
                    .number()
                    .optional()
                    .default(1)
                    .describe("Max member expansion depth (0=flat, 1=default)"),
                start: z.number().optional().default(0).describe("Start from snapshot index (default 0)"),
                count: z.number().optional().default(0).describe("Number of snapshots to show (0=all, default 0)"),
            },
        },
        async ({ session, detail, depth, start, count }) =>
            tool_text(query.explain_execution_flow(session, detail, depth, start, count))
    );
}
