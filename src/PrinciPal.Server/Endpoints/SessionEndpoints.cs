using PrinciPal.Application.Abstractions;

namespace PrinciPal.Server.Endpoints;

internal static class SessionEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/sessions");

        group.MapGet("/", (ISessionManager mgr) => Results.Ok(mgr.GetAllSessions()));

        group.MapDelete("/{sessionId}", (ISessionManager mgr, string sessionId) =>
        {
            mgr.RemoveSession(sessionId);
            return Results.Ok();
        });
    }
}
