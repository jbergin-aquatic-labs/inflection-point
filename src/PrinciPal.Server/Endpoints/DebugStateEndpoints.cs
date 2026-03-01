using PrinciPal.Application.Abstractions;
using PrinciPal.Domain.ValueObjects;

namespace PrinciPal.Server.Endpoints;

internal static class DebugStateEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/sessions/{sessionId}/debug-state");

        group.MapPost("/", (ISessionManager mgr, string sessionId, DebugState state, string? name, string? path) =>
        {
            var store = mgr.GetOrCreateSession(sessionId, name, path);
            store.Update(state);
            return Results.Ok();
        });

        group.MapPost("/expression", (ISessionManager mgr, string sessionId, ExpressionResult result, string? name, string? path) =>
        {
            var store = mgr.GetOrCreateSession(sessionId, name, path);
            store.UpdateExpression(result);
            return Results.Ok();
        });

        group.MapDelete("/", (ISessionManager mgr, string sessionId) =>
        {
            var store = mgr.GetSession(sessionId);
            store?.Clear();
            return Results.Ok();
        });

        group.MapGet("/history", (ISessionManager mgr, string sessionId) =>
        {
            var store = mgr.GetSession(sessionId);
            return Results.Ok(store?.GetHistory() ?? new List<DebugStateSnapshot>());
        });

        group.MapDelete("/history", (ISessionManager mgr, string sessionId) =>
        {
            var store = mgr.GetSession(sessionId);
            store?.ClearHistory();
            return Results.Ok();
        });
    }
}
