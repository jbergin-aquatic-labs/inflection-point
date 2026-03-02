using PrinciPal.Infrastructure.Services;

namespace PrinciPal.Infrastructure.Tests.Services;

public class SessionManagerTests
{
    private readonly SessionManager _sut = new();

    [Fact]
    public void GetOrCreateSession_SetsLastSeen()
    {
        var before = DateTime.UtcNow;
        _sut.GetOrCreateSession("s1", "name", "path");
        var after = DateTime.UtcNow;

        var sessions = _sut.GetAllSessions();
        Assert.Single(sessions);
        Assert.InRange(sessions[0].LastSeen, before, after);
    }

    [Fact]
    public void GetOrCreateSession_SubsequentCall_UpdatesLastSeen()
    {
        _sut.GetOrCreateSession("s1", "name", "path");
        var first = _sut.GetAllSessions()[0].LastSeen;

        // Small spin to ensure clock advances
        Thread.Sleep(15);

        _sut.GetOrCreateSession("s1");
        var second = _sut.GetAllSessions()[0].LastSeen;

        Assert.True(second > first, "LastSeen should advance on subsequent calls");
    }

    [Fact]
    public void GetStaleSessions_ReturnsOldSessions()
    {
        _sut.GetOrCreateSession("s1", "name1", "path1");

        // Manually verify with a zero timeout — everything is stale
        // We need at least 1 tick to have passed
        Thread.Sleep(15);

        var stale = _sut.GetStaleSessions(TimeSpan.Zero);
        Assert.Contains("s1", stale);
    }

    [Fact]
    public void GetStaleSessions_ExcludesRecentSessions()
    {
        _sut.GetOrCreateSession("s1", "name1", "path1");

        var stale = _sut.GetStaleSessions(TimeSpan.FromMinutes(5));
        Assert.Empty(stale);
    }

    [Fact]
    public void GetStaleSessions_EmptyWhenNoSessions()
    {
        var stale = _sut.GetStaleSessions(TimeSpan.FromSeconds(90));
        Assert.Empty(stale);
    }

    [Fact]
    public void GetStaleSessions_MixedFreshAndStale_ReturnsOnlyStale()
    {
        // Create first session, then let time pass
        _sut.GetOrCreateSession("stale1", "old", "path1");
        Thread.Sleep(20);

        // Touch a second session so it's fresh
        _sut.GetOrCreateSession("fresh1", "new", "path2");

        // Use a timeout that catches the first but not the second.
        // 10ms is enough — stale1 was created 20+ms ago, fresh1 just now.
        var stale = _sut.GetStaleSessions(TimeSpan.FromMilliseconds(10));

        Assert.Contains("stale1", stale);
        Assert.DoesNotContain("fresh1", stale);
    }

    [Fact]
    public void GetAllSessions_IncludesLastSeen()
    {
        _sut.GetOrCreateSession("s1", "name1", "path1");
        Thread.Sleep(15);
        _sut.GetOrCreateSession("s1"); // heartbeat touch

        var sessions = _sut.GetAllSessions();
        Assert.Single(sessions);

        // LastSeen should be recent (within last second), and after ConnectedAt
        Assert.True(sessions[0].LastSeen >= sessions[0].ConnectedAt,
            "LastSeen should be at or after ConnectedAt");
    }

    [Fact]
    public void GetStaleSessions_AfterHeartbeatTouch_SessionIsNoLongerStale()
    {
        _sut.GetOrCreateSession("s1", "name", "path");
        Thread.Sleep(20);

        // Before touch: stale with 10ms timeout
        var staleBefore = _sut.GetStaleSessions(TimeSpan.FromMilliseconds(10));
        Assert.Contains("s1", staleBefore);

        // Touch it (simulates heartbeat)
        _sut.GetOrCreateSession("s1");

        // After touch: no longer stale
        var staleAfter = _sut.GetStaleSessions(TimeSpan.FromMilliseconds(10));
        Assert.DoesNotContain("s1", staleAfter);
    }
}
