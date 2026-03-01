using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors;

public sealed class McpError : ErrorBase
{
    public McpError(string code, string description)
        : base(code, description) { }

    public static McpError ServerNotRunning() =>
        new("Mcp.ServerNotRunning", "The MCP server is not running.");

    public static McpError SessionNotFound(string session) =>
        new("Mcp.SessionNotFound", $"Debug session '{session}' was not found.");

    public static McpError NoActiveSession() =>
        new("Mcp.NoActiveSession", "No active debug session.");

    public static McpError NoDebugState() =>
        new("Mcp.NoDebugState", "No debug state available. Is the debugger paused at a breakpoint?");
}
