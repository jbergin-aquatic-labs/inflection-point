using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using PrinciPal.Application.Abstractions;
using PrinciPal.Server.Configuration;
using PrinciPal.Server.Jobs;
using Quartz;

namespace PrinciPal.Server.Tests.Jobs;

public class SessionReaperJobTests
{
    private readonly ISessionManager _sessionManager = Substitute.For<ISessionManager>();
    private readonly SessionReaperOptions _options;
    private readonly SessionReaperJob _job;
    private readonly IJobExecutionContext _context = Substitute.For<IJobExecutionContext>();

    public SessionReaperJobTests()
    {
        _options = new SessionReaperOptions
        {
            ReaperIntervalSeconds = 30,
            SessionTimeoutSeconds = 90
        };

        _job = new SessionReaperJob(
            _sessionManager,
            Options.Create(_options),
            NullLogger<SessionReaperJob>.Instance);
    }

    [Fact]
    public async Task NoStaleSessions_DoesNotRemoveAnything()
    {
        _sessionManager.GetStaleSessions(Arg.Any<TimeSpan>()).Returns(new List<string>());

        await _job.Execute(_context);

        _sessionManager.DidNotReceive().RemoveSession(Arg.Any<string>());
    }

    [Fact]
    public async Task OnStaleSession_RemovesIt()
    {
        _sessionManager.GetStaleSessions(Arg.Any<TimeSpan>()).Returns(new List<string> { "abc123" });

        await _job.Execute(_context);

        _sessionManager.Received(1).RemoveSession("abc123");
    }

    [Fact]
    public async Task MultipleStaleSessions_RemovesAll()
    {
        _sessionManager.GetStaleSessions(Arg.Any<TimeSpan>())
            .Returns(new List<string> { "abc123", "def456", "ghi789" });

        await _job.Execute(_context);

        _sessionManager.Received(1).RemoveSession("abc123");
        _sessionManager.Received(1).RemoveSession("def456");
        _sessionManager.Received(1).RemoveSession("ghi789");
    }

    [Fact]
    public async Task UsesConfiguredTimeout()
    {
        _sessionManager.GetStaleSessions(Arg.Any<TimeSpan>()).Returns(new List<string>());

        await _job.Execute(_context);

        _sessionManager.Received(1).GetStaleSessions(TimeSpan.FromSeconds(90));
    }

    [Fact]
    public async Task CustomTimeout_IsPassedThrough()
    {
        var customOptions = new SessionReaperOptions { SessionTimeoutSeconds = 45 };
        var job = new SessionReaperJob(
            _sessionManager,
            Options.Create(customOptions),
            NullLogger<SessionReaperJob>.Instance);

        _sessionManager.GetStaleSessions(Arg.Any<TimeSpan>()).Returns(new List<string>());

        await job.Execute(_context);

        _sessionManager.Received(1).GetStaleSessions(TimeSpan.FromSeconds(45));
    }
}
