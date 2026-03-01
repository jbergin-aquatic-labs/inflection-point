using PrinciPal.Server.Services;

namespace PrinciPal.Server.Endpoints;

internal static class SessionEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/sessions");

        group.MapGet("/", (SessionManager mgr) => Results.Ok(mgr.GetAllSessions()));

        group.MapDelete("/{sessionId}", (SessionManager mgr, string sessionId) =>
        {
            mgr.RemoveSession(sessionId);
            return Results.Ok();
        });
    }
}
