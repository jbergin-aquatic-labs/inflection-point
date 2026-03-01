using PrinciPal.McpServer.Services;

// Parse CLI args
var port = 9229;

for (int i = 0; i < args.Length - 1; i++)
{
    if (args[i] == "--port" && int.TryParse(args[i + 1], out var p))
        port = p;
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<SessionManager>();

builder.Services.AddMcpServer(options =>
{
    options.ServerInfo = new()
    {
        Name = "princiPal",
        Version = "1.0.0",
    };
})
.WithHttpTransport()
.WithToolsFromAssembly();

var app = builder.Build();

// Idle-shutdown watchdog: exit when all sessions disconnect (after initial connection)
var sessionManager = app.Services.GetRequiredService<SessionManager>();
var idleShutdownThread = new Thread(() =>
{
    // Wait for at least one session to connect
    while (sessionManager.SessionCount == 0)
        Thread.Sleep(5000);

    // Poll: if no sessions remain, wait grace period then exit
    while (true)
    {
        Thread.Sleep(10_000);
        if (sessionManager.SessionCount == 0)
        {
            // Grace period: wait 30s before exiting
            Thread.Sleep(30_000);
            if (sessionManager.SessionCount == 0)
                Environment.Exit(0);
        }
    }
})
{
    IsBackground = true,
    Name = "IdleShutdownWatchdog"
};
idleShutdownThread.Start();

// Session management endpoints
app.MapGet("/api/sessions", (SessionManager mgr) => Results.Ok(mgr.GetAllSessions()));

app.MapDelete("/api/sessions/{sessionId}", (SessionManager mgr, string sessionId) =>
{
    mgr.RemoveSession(sessionId);
    return Results.Ok();
});

// Session-scoped REST endpoints for the VSIX extension to push debug state
app.MapPost("/api/sessions/{sessionId}/debug-state", (SessionManager mgr, string sessionId, PrinciPal.Contracts.DebugState state, string? name, string? path) =>
{
    var store = mgr.GetOrCreateSession(sessionId, name, path);
    store.Update(state);
    return Results.Ok();
});

app.MapPost("/api/sessions/{sessionId}/debug-state/expression", (SessionManager mgr, string sessionId, PrinciPal.Contracts.ExpressionResult result, string? name, string? path) =>
{
    var store = mgr.GetOrCreateSession(sessionId, name, path);
    store.UpdateExpression(result);
    return Results.Ok();
});

app.MapDelete("/api/sessions/{sessionId}/debug-state", (SessionManager mgr, string sessionId) =>
{
    var store = mgr.GetSession(sessionId);
    store?.Clear();
    return Results.Ok();
});

app.MapGet("/api/sessions/{sessionId}/debug-state/history", (SessionManager mgr, string sessionId) =>
{
    var store = mgr.GetSession(sessionId);
    return Results.Ok(store?.GetHistory() ?? new List<PrinciPal.Contracts.DebugStateSnapshot>());
});

app.MapDelete("/api/sessions/{sessionId}/debug-state/history", (SessionManager mgr, string sessionId) =>
{
    var store = mgr.GetSession(sessionId);
    store?.ClearHistory();
    return Results.Ok();
});

app.MapGet("/api/health", () => Results.Ok(new { status = "running" }));

// MCP endpoint (SSE transport)
app.MapMcp();

app.Run($"http://localhost:{port}");

// Needed for integration tests with WebApplicationFactory
public partial class Program { }
