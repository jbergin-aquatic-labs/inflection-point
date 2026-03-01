using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Debugger;

public sealed class NotInBreakModeError : ErrorBase
{
    public static readonly NotInBreakModeError Default = new();
    private NotInBreakModeError()
        : base("Debugger.NotInBreakMode",
               "Visual Studio is not in break mode. Hit a breakpoint first.") { }
}
