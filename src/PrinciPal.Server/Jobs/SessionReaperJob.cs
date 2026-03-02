using Microsoft.Extensions.Options;
using PrinciPal.Application.Abstractions;
using PrinciPal.Server.Configuration;
using Quartz;

namespace PrinciPal.Server.Jobs;

[DisallowConcurrentExecution]
public sealed class SessionReaperJob : IJob
{
    private readonly ISessionManager _sessionManager;
    private readonly SessionReaperOptions _options;
    private readonly ILogger<SessionReaperJob> _logger;

    public SessionReaperJob(
        ISessionManager sessionManager,
        IOptions<SessionReaperOptions> options,
        ILogger<SessionReaperJob> logger)
    {
        _sessionManager = sessionManager;
        _options = options.Value;
        _logger = logger;
    }

    public Task Execute(IJobExecutionContext context)
    {
        var staleSessions = _sessionManager.GetStaleSessions(_options.SessionTimeout);

        foreach (var sessionId in staleSessions)
        {
            _logger.LogInformation("Reaping stale session {SessionId} (no heartbeat for {Timeout}s).",
                sessionId, _options.SessionTimeoutSeconds);
            _sessionManager.RemoveSession(sessionId);
        }

        return Task.CompletedTask;
    }
}
