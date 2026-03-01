using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Debugger;

public sealed class NoExpressionResultError : ErrorBase
{
    public static readonly NoExpressionResultError Default = new();
    private NoExpressionResultError()
        : base("Debugger.NoExpressionResult",
               "No expression result available. Evaluate an expression in Visual Studio first.") { }
}
