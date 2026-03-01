using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Server;

public sealed class ServerNotRunningError : ErrorBase
{
    public static readonly ServerNotRunningError Default = new();
    private ServerNotRunningError()
        : base("Server.NotRunning",
               "The MCP server is not running.") { }
}
