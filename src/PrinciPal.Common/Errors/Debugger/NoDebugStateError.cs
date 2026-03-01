using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Debugger;

public sealed class NoDebugStateError : ErrorBase
{
    public static readonly NoDebugStateError Default = new();
    private NoDebugStateError()
        : base("Debugger.NoState",
               "No debug state available. Is the debugger paused at a breakpoint?") { }
}
