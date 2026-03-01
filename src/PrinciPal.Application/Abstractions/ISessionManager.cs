using PrinciPal.Common.Options;
using PrinciPal.Common.Results;
using PrinciPal.Domain.Entities;
using PrinciPal.Domain.ValueObjects;

namespace PrinciPal.Application.Abstractions;

public interface ISessionManager
{
    int SessionCount { get; }
    DebugStateStore GetOrCreateSession(string sessionId, string? name = null, string? solutionPath = null);
    Option<DebugStateStore> GetSession(string sessionId);
    Result<DebugStateStore> ResolveByNameOrId(string query);
    void RemoveSession(string sessionId);
    List<SessionInfo> GetAllSessions();
}
