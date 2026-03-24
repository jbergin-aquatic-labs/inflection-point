import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { debug_query_service } from "./debug_query_service.js";
import type { agent_control_service } from "./agent_control_service.js";

function tool_text(r: { ok: true; value: string } | { ok: false; description: string }) {
    if (r.ok) {
        return { content: [{ type: "text" as const, text: r.value }] };
    }
    return {
        content: [{ type: "text" as const, text: r.description }],
        isError: true as const,
    };
}

export function register_debug_tools(
    server: McpServer,
    query: debug_query_service,
    agent_control: agent_control_service
): void {
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

    server.registerTool(
        "get_agent_capabilities",
        {
            description:
                "Describe how to drive the IDE from MCP: launch configs, breakpoints, continue, required extension settings, and REST endpoints. Call first when automating debug.",
            inputSchema: z.object({}),
        },
        async () => tool_text(agent_control.describe_capabilities())
    );

    server.registerTool(
        "list_launch_configs",
        {
            description:
                "List launch.json configuration names synced from the IDE and whether the agent may start each (Inflection Point → Agent run). Use before start_debugging.",
            inputSchema: z.object({
                session: z.string().describe("Session name or ID from list_sessions."),
            }),
        },
        async ({ session }) => tool_text(agent_control.list_launch_configs(session))
    );

    server.registerTool(
        "start_debugging",
        {
            description:
                "Request the Inflection Point extension to start a launch.json configuration by name (same as Run and Debug). Respects allow/block checkboxes in the Agent run sidebar. Waits until the extension runs the command or times out.",
            inputSchema: z.object({
                session: z.string().describe("Session name or ID from list_sessions."),
                launch_config_name: z
                    .string()
                    .describe('Exact "name" from launch.json, e.g. "Pipeline: evaluation".'),
                timeout_ms: z
                    .number()
                    .optional()
                    .default(60_000)
                    .describe("Max wait for the extension (ms). Default 60000."),
            }),
        },
        async ({ session, launch_config_name, timeout_ms }) =>
            tool_text(await agent_control.start_debugging(session, launch_config_name, timeout_ms ?? 60_000))
    );

    server.registerTool(
        "add_editor_breakpoint",
        {
            description:
                "Add a source breakpoint in the IDE at file_path and line (1-based). Extension must be connected.",
            inputSchema: z.object({
                session: z.string().describe("Session name or ID from list_sessions."),
                file_path: z.string().describe("Absolute path to the source file."),
                line: z.number().int().positive().describe("1-based line number."),
                timeout_ms: z.number().optional().default(30_000),
            }),
        },
        async ({ session, file_path, line, timeout_ms }) =>
            tool_text(
                await agent_control.add_editor_breakpoint(session, file_path, line, timeout_ms ?? 30_000)
            )
    );

    server.registerTool(
        "remove_editor_breakpoint",
        {
            description: "Remove source breakpoints at file_path and line (1-based) in the IDE.",
            inputSchema: z.object({
                session: z.string().describe("Session name or ID from list_sessions."),
                file_path: z.string(),
                line: z.number().int().positive(),
                timeout_ms: z.number().optional().default(30_000),
            }),
        },
        async ({ session, file_path, line, timeout_ms }) =>
            tool_text(
                await agent_control.remove_editor_breakpoint(
                    session,
                    file_path,
                    line,
                    timeout_ms ?? 30_000
                )
            )
    );

    server.registerTool(
        "debug_continue",
        {
            description:
                "Execute the Continue debug action in the IDE (resume after a breakpoint). Extension must be connected.",
            inputSchema: z.object({
                session: z.string().describe("Session name or ID from list_sessions."),
                timeout_ms: z.number().optional().default(15_000),
            }),
        },
        async ({ session, timeout_ms }) =>
            tool_text(await agent_control.debug_continue(session, timeout_ms ?? 15_000))
    );
}
