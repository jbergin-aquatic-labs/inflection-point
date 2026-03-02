namespace PrinciPal.Server.Configuration;

public sealed class SessionReaperOptions
{
    public int ReaperIntervalSeconds { get; set; } = 30;
    public int SessionTimeoutSeconds { get; set; } = 90;

    public TimeSpan ReaperInterval => TimeSpan.FromSeconds(ReaperIntervalSeconds);
    public TimeSpan SessionTimeout => TimeSpan.FromSeconds(SessionTimeoutSeconds);
}
