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
                "List all connected Visual Studio debug sessions. Shows session names, IDs, solution paths, and whether each session is currently debugging. Use the name or ID as the 'session' parameter in other tools.",
            inputSchema: z.object({}),
        },
        async () => tool_text(query.list_sessions())
    );

    server.registerTool(
        "get_debug_state",
        {
            description:
                "Get the full current debug state from Visual Studio including locals, call stack, and current source location. Use this to understand what is happening at a breakpoint.",
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
                "Get all local variables and their values at the current breakpoint in Visual Studio. Returns variable names, types, values, and nested members.",
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
                "Get the current call stack from Visual Studio debugger. Shows the chain of method calls that led to the current breakpoint.",
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
                "Get the source code surrounding the current breakpoint location in Visual Studio. Shows approximately 30 lines with the current line highlighted.",
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
                "List all breakpoints currently set in Visual Studio, including their file locations, conditions, and enabled status.",
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
                "Get the result of the last expression evaluated in the Visual Studio debugger. The VSIX extension pushes expression results after evaluation.",
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
                "Get a combined view of source code context, local variables, and call stack at the current breakpoint. Ideal for asking the AI to explain what is happening.",
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
                "Get a summary list of all breakpoint snapshots captured during this debug session. Each entry shows the snapshot index, timestamp, source location, and local variable count. Use get_snapshot to drill into a specific snapshot.",
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
                "Get the full debug state for a specific breakpoint snapshot by its index number. Returns locals, call stack, and source location captured at that breakpoint hit. Use get_breakpoint_history first to see available snapshot indices.",
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
                "Get all captured breakpoint snapshots formatted as an execution trace. Ideal for asking the AI to analyze how values change across multiple breakpoints and explain the overall program flow.",
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
