using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Session;

public sealed class SessionNotFoundError : ErrorBase
{
    public SessionNotFoundError(string session)
        : base("Session.NotFound",
               $"Debug session '{session}' was not found.") { }
}
