using PrinciPal.Domain.Entities;
using PrinciPal.Domain.ValueObjects;

namespace PrinciPal.Application.Abstractions;

public interface ISessionManager
{
    int SessionCount { get; }
    DebugStateStore GetOrCreateSession(string sessionId, string? name = null, string? solutionPath = null);
    DebugStateStore? GetSession(string sessionId);
    (DebugStateStore? Store, string? Error) ResolveByNameOrId(string query);
    bool RemoveSession(string sessionId);
    List<SessionInfo> GetAllSessions();
}
