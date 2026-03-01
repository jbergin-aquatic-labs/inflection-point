using System.Collections.Concurrent;
using PrinciPal.Contracts;

namespace PrinciPal.McpServer.Services;

/// <summary>
/// Manages multiple VS debug sessions. Each session is keyed by a unique ID
/// (short hash of the solution path) and has a friendly name (solution filename).
/// Each session gets its own <see cref="DebugStateStore"/> instance.
/// </summary>
public class SessionManager
{
    private readonly ConcurrentDictionary<string, SessionEntry> _sessions = new(StringComparer.OrdinalIgnoreCase);

    public int SessionCount => _sessions.Count;

    /// <summary>
    /// Gets or creates a session, returning its <see cref="DebugStateStore"/>.
    /// Auto-registers the session on first access.
    /// </summary>
    public DebugStateStore GetOrCreateSession(string sessionId, string? name = null, string? solutionPath = null)
    {
        var entry = _sessions.GetOrAdd(sessionId, id => new SessionEntry
        {
            Store = new DebugStateStore(),
            Info = new SessionInfo
            {
                SessionId = id,
                Name = name ?? "",
                SolutionPath = solutionPath ?? "",
                ConnectedAt = DateTime.UtcNow
            }
        });

        // Update metadata if provided and was previously empty
        if (!string.IsNullOrEmpty(name) && string.IsNullOrEmpty(entry.Info.Name))
            entry.Info.Name = name;
        if (!string.IsNullOrEmpty(solutionPath) && string.IsNullOrEmpty(entry.Info.SolutionPath))
            entry.Info.SolutionPath = solutionPath;

        return entry.Store;
    }

    /// <summary>
    /// Gets a session's store by its unique ID, or null if not found.
    /// </summary>
    public DebugStateStore? GetSession(string sessionId)
    {
        return _sessions.TryGetValue(sessionId, out var entry) ? entry.Store : null;
    }

    /// <summary>
    /// Resolves a query string (name or ID) to a session store.
    /// Returns (store, null) on success, or (null, errorMessage) on failure.
    /// </summary>
    public (DebugStateStore? Store, string? Error) ResolveByNameOrId(string query)
    {
        // Try exact ID match first
        if (_sessions.TryGetValue(query, out var entry))
            return (entry.Store, null);

        // Try name match
        var matches = _sessions.Values
            .Where(e => string.Equals(e.Info.Name, query, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (matches.Count == 1)
            return (matches[0].Store, null);

        if (matches.Count > 1)
        {
            var lines = matches.Select(m => $"  {m.Info.Name} [{m.Info.SessionId}] - {m.Info.SolutionPath}");
            return (null, $"Multiple sessions named '{query}'. Use the session ID instead:\n{string.Join("\n", lines)}");
        }

        return (null, $"Session '{query}' not found. Use list_sessions to see connected VS instances.");
    }

    /// <summary>
    /// Removes a session and all its state.
    /// </summary>
    public bool RemoveSession(string sessionId)
    {
        return _sessions.TryRemove(sessionId, out _);
    }

    /// <summary>
    /// Returns info for all active sessions. HasDebugState is computed dynamically.
    /// </summary>
    public List<SessionInfo> GetAllSessions()
    {
        var result = new List<SessionInfo>();
        foreach (var kvp in _sessions)
        {
            var info = kvp.Value.Info;
            var state = kvp.Value.Store.GetCurrentState();
            result.Add(new SessionInfo
            {
                SessionId = info.SessionId,
                Name = info.Name,
                SolutionPath = info.SolutionPath,
                ConnectedAt = info.ConnectedAt,
                HasDebugState = state is { IsInBreakMode: true }
            });
        }
        return result;
    }

    private class SessionEntry
    {
        public required DebugStateStore Store { get; init; }
        public required SessionInfo Info { get; init; }
    }
}
