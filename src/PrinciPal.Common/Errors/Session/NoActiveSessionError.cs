using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Session;

public sealed class NoActiveSessionError : ErrorBase
{
    public static readonly NoActiveSessionError Default = new();
    private NoActiveSessionError()
        : base("Session.NoActive",
               "No active debug session.") { }
}
