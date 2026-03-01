using PrinciPal.Server.Endpoints;
using PrinciPal.Server.Services;

namespace PrinciPal.Server.Extensions;

internal static class WebApplicationExtensions
{
    public static WebApplication UseIdleShutdownWatchdog(this WebApplication app)
    {
        var sessionManager = app.Services.GetRequiredService<SessionManager>();
        var thread = new Thread(() =>
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
        thread.Start();

        return app;
    }

    public static WebApplication MapPrinciPalEndpoints(this WebApplication app)
    {
        SessionEndpoints.Map(app);
        DebugStateEndpoints.Map(app);

        app.MapGet("/api/health", () => Results.Ok(new { status = "running" }));
        app.MapMcp();

        return app;
    }
}
