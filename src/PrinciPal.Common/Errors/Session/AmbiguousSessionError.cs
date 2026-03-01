using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Session;

public sealed class AmbiguousSessionError : ErrorBase
{
    public AmbiguousSessionError(string query, string matchDetails)
        : base("Session.Ambiguous",
               $"Multiple sessions named '{query}'. Use the session ID instead:\n{matchDetails}") { }
}
