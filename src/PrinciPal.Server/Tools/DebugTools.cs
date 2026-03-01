using System.ComponentModel;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using PrinciPal.Application.Abstractions;

namespace PrinciPal.Server.Tools;

/// <summary>
/// Thin MCP wrapper that delegates all orchestration to <see cref="IDebugQueryService"/>.
/// Each method catches standard exceptions and wraps them as <see cref="McpException"/>.
/// </summary>
[McpServerToolType]
public class DebugTools
{
    private readonly IDebugQueryService _queryService;

    public DebugTools(IDebugQueryService queryService)
    {
        _queryService = queryService;
    }

    [McpServerTool(Name = "list_sessions", ReadOnly = true)]
    [Description("List all connected Visual Studio debug sessions. Shows session names, IDs, solution paths, and whether each session is currently debugging. Use the name or ID as the 'session' parameter in other tools.")]
    public string ListSessions()
        => Wrap(() => _queryService.ListSessions());

    [McpServerTool(Name = "get_debug_state", ReadOnly = true)]
    [Description("Get the full current debug state from Visual Studio including locals, call stack, and current source location. Use this to understand what is happening at a breakpoint.")]
    public string GetDebugState(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session,
        [Description("Max member expansion depth (0=flat, 2=default)")]
        int depth = 2)
        => Wrap(() => _queryService.GetDebugState(session, depth));

    [McpServerTool(Name = "get_locals", ReadOnly = true)]
    [Description("Get all local variables and their values at the current breakpoint in Visual Studio. Returns variable names, types, values, and nested members.")]
    public string GetLocals(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session,
        [Description("Max member expansion depth (0=flat, 2=default)")]
        int depth = 2)
        => Wrap(() => _queryService.GetLocals(session, depth));

    [McpServerTool(Name = "get_call_stack", ReadOnly = true)]
    [Description("Get the current call stack from Visual Studio debugger. Shows the chain of method calls that led to the current breakpoint.")]
    public string GetCallStack(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session)
        => Wrap(() => _queryService.GetCallStack(session));

    [McpServerTool(Name = "get_source_context", ReadOnly = true)]
    [Description("Get the source code surrounding the current breakpoint location in Visual Studio. Shows approximately 30 lines with the current line highlighted.")]
    public string GetSourceContext(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session)
        => Wrap(() => _queryService.GetSourceContext(session));

    [McpServerTool(Name = "get_breakpoints", ReadOnly = true)]
    [Description("List all breakpoints currently set in Visual Studio, including their file locations, conditions, and enabled status.")]
    public string GetBreakpoints(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session)
        => Wrap(() => _queryService.GetBreakpoints(session));

    [McpServerTool(Name = "get_expression_result", ReadOnly = true)]
    [Description("Get the result of the last expression evaluated in the Visual Studio debugger. The VSIX extension pushes expression results after evaluation.")]
    public string GetExpressionResult(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session,
        [Description("Max member expansion depth (0=flat, 2=default)")]
        int depth = 2)
        => Wrap(() => _queryService.GetExpressionResult(session, depth));

    [McpServerTool(Name = "explain_current_state", ReadOnly = true)]
    [Description("Get a combined view of source code context, local variables, and call stack at the current breakpoint. Ideal for asking the AI to explain what is happening.")]
    public string ExplainCurrentState(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session)
        => Wrap(() => _queryService.ExplainCurrentState(session));

    [McpServerTool(Name = "get_breakpoint_history", ReadOnly = true)]
    [Description("Get a summary list of all breakpoint snapshots captured during this debug session. Each entry shows the snapshot index, timestamp, source location, and local variable count. Use get_snapshot to drill into a specific snapshot.")]
    public string GetBreakpointHistory(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session)
        => Wrap(() => _queryService.GetBreakpointHistory(session));

    [McpServerTool(Name = "get_snapshot", ReadOnly = true)]
    [Description("Get the full debug state for a specific breakpoint snapshot by its index number. Returns locals, call stack, and source location captured at that breakpoint hit. Use get_breakpoint_history first to see available snapshot indices.")]
    public string GetSnapshot(
        [Description("The snapshot index number from get_breakpoint_history")]
        int index,
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session,
        [Description("Detail level: full, changes, summary (default full)")]
        string detail = "full",
        [Description("Max member expansion depth (0=flat, 2=default)")]
        int depth = 2)
        => Wrap(() => _queryService.GetSnapshot(index, session, detail, depth));

    [McpServerTool(Name = "explain_execution_flow", ReadOnly = true)]
    [Description("Get all captured breakpoint snapshots formatted as an execution trace. Ideal for asking the AI to analyze how values change across multiple breakpoints and explain the overall program flow.")]
    public string ExplainExecutionFlow(
        [Description("Session name or ID. Use list_sessions to see options.")]
        string session,
        [Description("Detail level: full=complete state, changes=delta between snapshots (default), summary=location+change names only")]
        string detail = "changes",
        [Description("Max member expansion depth (0=flat, 1=default)")]
        int depth = 1,
        [Description("Start from snapshot index (default 0)")]
        int start = 0,
        [Description("Number of snapshots to show (0=all, default 0)")]
        int count = 0)
        => Wrap(() => _queryService.ExplainExecutionFlow(session, detail, depth, start, count));

    private static string Wrap(Func<string> action)
    {
        try
        {
            return action();
        }
        catch (McpException)
        {
            throw; // Already an MCP exception, rethrow as-is
        }
        catch (Exception ex)
        {
            throw new McpException(ex.Message);
        }
    }
}
