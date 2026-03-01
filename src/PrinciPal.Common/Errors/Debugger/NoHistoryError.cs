using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Debugger;

public sealed class NoHistoryError : ErrorBase
{
    public static readonly NoHistoryError Default = new();
    private NoHistoryError()
        : base("Debugger.NoHistory",
               "No breakpoint history available. Hit some breakpoints first \u2014 each break-mode stop is recorded automatically.") { }
}
