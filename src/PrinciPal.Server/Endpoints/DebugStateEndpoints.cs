using PrinciPal.Contracts;
using PrinciPal.Server.Services;

namespace PrinciPal.Server.Endpoints;

internal static class DebugStateEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/sessions/{sessionId}/debug-state");

        group.MapPost("/", (SessionManager mgr, string sessionId, DebugState state, string? name, string? path) =>
        {
            var store = mgr.GetOrCreateSession(sessionId, name, path);
            store.Update(state);
            return Results.Ok();
        });

        group.MapPost("/expression", (SessionManager mgr, string sessionId, ExpressionResult result, string? name, string? path) =>
        {
            var store = mgr.GetOrCreateSession(sessionId, name, path);
            store.UpdateExpression(result);
            return Results.Ok();
        });

        group.MapDelete("/", (SessionManager mgr, string sessionId) =>
        {
            var store = mgr.GetSession(sessionId);
            store?.Clear();
            return Results.Ok();
        });

        group.MapGet("/history", (SessionManager mgr, string sessionId) =>
        {
            var store = mgr.GetSession(sessionId);
            return Results.Ok(store?.GetHistory() ?? new List<DebugStateSnapshot>());
        });

        group.MapDelete("/history", (SessionManager mgr, string sessionId) =>
        {
            var store = mgr.GetSession(sessionId);
            store?.ClearHistory();
            return Results.Ok();
        });
    }
}
