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
            mgr.GetSession(sessionId).Switch(
                some: store => store.Clear(),
                none: () => { });
            return Results.Ok();
        });

        group.MapGet("/history", (ISessionManager mgr, string sessionId) =>
        {
            var history = mgr.GetSession(sessionId).Match(
                some: store => store.GetHistory(),
                none: () => new List<DebugStateSnapshot>());
            return Results.Ok(history);
        });

        group.MapDelete("/history", (ISessionManager mgr, string sessionId) =>
        {
            mgr.GetSession(sessionId).Switch(
                some: store => store.ClearHistory(),
                none: () => { });
            return Results.Ok();
        });
    }
}
