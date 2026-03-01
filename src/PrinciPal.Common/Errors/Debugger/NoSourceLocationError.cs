using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Debugger;

public sealed class NoSourceLocationError : ErrorBase
{
    public static readonly NoSourceLocationError Default = new();
    private NoSourceLocationError()
        : base("Debugger.NoSourceLocation",
               "No source location information available.") { }
}
