using System.Text;
using PrinciPal.Application.Abstractions;
using PrinciPal.Application.Formatting;
using PrinciPal.Domain.Entities;
using PrinciPal.Domain.ValueObjects;

namespace PrinciPal.Infrastructure.Services;

public class DebugQueryService : IDebugQueryService
{
    private readonly ISessionManager _sessionManager;
    private readonly ISourceFileReader _sourceFileReader;

    public DebugQueryService(ISessionManager sessionManager, ISourceFileReader sourceFileReader)
    {
        _sessionManager = sessionManager;
        _sourceFileReader = sourceFileReader;
    }

    public string ListSessions()
    {
        var sessions = _sessionManager.GetAllSessions();
        if (sessions.Count == 0)
            return "No Visual Studio sessions connected.";

        var sb = new StringBuilder();
        sb.AppendLine($"{sessions.Count} session(s):");
        foreach (var s in sessions)
        {
            var status = s.HasDebugState ? "debugging" : "idle";
            sb.AppendLine($"  {s.Name} [{s.SessionId}] ({status}) - {s.SolutionPath}");
        }
        return sb.ToString();
    }

    public string GetDebugState(string session, int depth = 2)
    {
        var store = ResolveStore(session);
        var state = store.GetCurrentState();
        if (state is null)
            throw new InvalidOperationException("No debug state available. Make sure Visual Studio is stopped at a breakpoint and the PrinciPal extension is running.");

        if (!state.IsInBreakMode)
            throw new InvalidOperationException("Visual Studio is not in break mode. Hit a breakpoint first.");

        var sb = new StringBuilder();

        if (state.CurrentLocation is not null)
        {
            sb.AppendLine("[loc]");
            sb.AppendLine(CompactFormatter.FormatLocation(state.CurrentLocation));
        }

        if (state.Locals.Count > 0)
        {
            sb.AppendLine("[locals]");
            CompactFormatter.FormatVariables(sb, state.Locals, 0, depth);
        }

        if (state.CallStack.Count > 0)
        {
            sb.AppendLine("[stack]");
            CompactFormatter.FormatCallStack(sb, state.CallStack);
        }

        return sb.ToString();
    }

    public string GetLocals(string session, int depth = 2)
    {
        var store = ResolveStore(session);
        var state = GetBreakModeState(store);

        if (state.Locals.Count == 0)
            return "No local variables in the current scope.";

        var sb = new StringBuilder();
        sb.AppendLine("[locals]");
        CompactFormatter.FormatVariables(sb, state.Locals, 0, depth);
        return sb.ToString();
    }

    public string GetCallStack(string session)
    {
        var store = ResolveStore(session);
        var state = GetBreakModeState(store);

        if (state.CallStack.Count == 0)
            return "Call stack is empty.";

        var sb = new StringBuilder();
        sb.AppendLine("[stack]");
        CompactFormatter.FormatCallStack(sb, state.CallStack);
        return sb.ToString();
    }

    public string GetSourceContext(string session)
    {
        var store = ResolveStore(session);
        var state = GetBreakModeState(store);

        if (state.CurrentLocation is null)
            throw new InvalidOperationException("No source location information available.");

        return FormatSourceContext(state);
    }

    public string GetBreakpoints(string session)
    {
        var store = ResolveStore(session);
        var state = store.GetCurrentState();
        if (state is null)
            throw new InvalidOperationException("No debug state available.");

        if (state.Breakpoints.Count == 0)
            return "No breakpoints are set.";

        var sb = new StringBuilder();
        sb.AppendLine("[breakpoints]");
        foreach (var bp in state.Breakpoints)
        {
            var status = bp.Enabled ? "on" : "off";
            sb.Append($"{Path.GetFileName(bp.FilePath)}:{bp.Line} ({status})");
            if (!string.IsNullOrEmpty(bp.FunctionName))
                sb.Append($" {bp.FunctionName}");
            if (!string.IsNullOrEmpty(bp.Condition))
                sb.Append($" when {bp.Condition}");
            sb.AppendLine();
        }

        return sb.ToString();
    }

    public string GetExpressionResult(string session, int depth = 2)
    {
        var store = ResolveStore(session);
        var result = store.GetLastExpression();
        if (result is null)
            throw new InvalidOperationException("No expression result available. Evaluate an expression in Visual Studio first.");

        var sb = new StringBuilder();
        var valid = result.IsValid ? "" : " [!]";
        sb.AppendLine($"expr {result.Expression}:{result.Type}={result.Value}{valid}");

        if (result.Members.Count > 0)
        {
            CompactFormatter.FormatVariables(sb, result.Members, 1, depth);
        }

        return sb.ToString();
    }

    public string ExplainCurrentState(string session)
    {
        var store = ResolveStore(session);
        var sb = new StringBuilder();

        try
        {
            var state = GetBreakModeState(store);
            if (state.CurrentLocation is not null)
                sb.AppendLine(FormatSourceContext(state));
        }
        catch { /* source may not be available */ }

        sb.AppendLine();

        try
        {
            var state = GetBreakModeState(store);
            if (state.Locals.Count == 0)
            {
                sb.AppendLine("No local variables in the current scope.");
            }
            else
            {
                var localsSb = new StringBuilder();
                localsSb.AppendLine("[locals]");
                CompactFormatter.FormatVariables(localsSb, state.Locals, 0, 2);
                sb.AppendLine(localsSb.ToString());
            }
        }
        catch { /* locals may not be available */ }

        sb.AppendLine();

        try
        {
            var state = GetBreakModeState(store);
            if (state.CallStack.Count == 0)
            {
                sb.AppendLine("Call stack is empty.");
            }
            else
            {
                var stackSb = new StringBuilder();
                stackSb.AppendLine("[stack]");
                CompactFormatter.FormatCallStack(stackSb, state.CallStack);
                sb.AppendLine(stackSb.ToString());
            }
        }
        catch { /* call stack may not be available */ }

        var text = sb.ToString().Trim();
        if (string.IsNullOrEmpty(text))
            throw new InvalidOperationException("No debug state available.");

        return text;
    }

    public string GetBreakpointHistory(string session)
    {
        var store = ResolveStore(session);
        var history = store.GetHistory();
        if (history.Count == 0)
            throw new InvalidOperationException("No breakpoint history available. Hit some breakpoints first \u2014 each break-mode stop is recorded automatically.");

        var sb = new StringBuilder();
        var totalCaptured = store.TotalCaptured;
        if (totalCaptured > history.Count)
            sb.AppendLine($"History ({history.Count} of {totalCaptured} captured, showing #{history[0].Index}..#{history[^1].Index})");
        else
            sb.AppendLine($"History ({history.Count} snapshots)");

        foreach (var snapshot in history)
        {
            var loc = snapshot.State.CurrentLocation;
            var file = loc != null ? Path.GetFileName(loc.FilePath) : "unknown";
            var line = loc?.Line ?? 0;
            var func = loc?.FunctionName ?? "unknown";
            var localCount = snapshot.State.Locals.Count;
            var time = snapshot.CapturedAt.ToString("HH:mm:ss.fff");

            sb.AppendLine($"#{snapshot.Index} [{time}] {func} ({file}:{line}) {localCount} locals");
        }

        return sb.ToString();
    }

    public string GetSnapshot(int index, string session, string detail = "full", int depth = 2)
    {
        var store = ResolveStore(session);
        var snapshot = store.GetSnapshot(index);
        if (snapshot is null)
        {
            if (index >= 0 && index < store.TotalCaptured)
            {
                var history = store.GetHistory();
                var oldest = history.Count > 0 ? history[0].Index : store.TotalCaptured;
                throw new KeyNotFoundException($"Snapshot #{index} was evicted (history keeps last {store.MaxHistorySize}). Oldest available: #{oldest}.");
            }
            throw new KeyNotFoundException($"Snapshot #{index} not found. Use get_breakpoint_history to see available snapshots.");
        }

        var state = snapshot.State;
        var sb = new StringBuilder();
        var time = snapshot.CapturedAt.ToString("HH:mm:ss.fff");

        if (state.CurrentLocation is not null)
        {
            sb.AppendLine($"#{snapshot.Index} [{time}] {CompactFormatter.FormatLocation(state.CurrentLocation)}");
        }
        else
        {
            sb.AppendLine($"#{snapshot.Index} [{time}]");
        }

        if (state.Locals.Count > 0)
        {
            sb.AppendLine("[locals]");
            CompactFormatter.FormatVariables(sb, state.Locals, 0, depth);
        }

        if (state.CallStack.Count > 0)
        {
            sb.AppendLine("[stack]");
            CompactFormatter.FormatCallStack(sb, state.CallStack);
        }

        return sb.ToString();
    }

    public string ExplainExecutionFlow(string session, string detail = "changes", int depth = 1, int start = 0, int count = 0)
    {
        var store = ResolveStore(session);
        var history = store.GetHistory();
        if (history.Count == 0)
            throw new InvalidOperationException("No breakpoint history available. Hit some breakpoints first \u2014 each break-mode stop is recorded automatically.");

        var filtered = history.Where(s => s.Index >= start).ToList();
        if (count > 0)
            filtered = filtered.Take(count).ToList();

        var sb = new StringBuilder();

        // Header
        var totalCaptured = store.TotalCaptured;
        var hasEviction = totalCaptured > history.Count;
        var hasPagination = count > 0 || start > 0;
        if (hasEviction || hasPagination)
        {
            var actualStart = filtered.Count > 0 ? filtered[0].Index : start;
            var totalLabel = hasEviction ? $"{history.Count} of {totalCaptured} captured" : $"{history.Count} total";
            sb.AppendLine($"Trace ({totalLabel}, showing {filtered.Count} from #{actualStart})");
        }
        else
            sb.AppendLine($"Trace ({filtered.Count} snapshots)");

        DebugStateSnapshot? prevSnapshot = null;

        foreach (var snapshot in filtered)
        {
            var state = snapshot.State;
            var loc = state.CurrentLocation;
            var file = loc != null ? Path.GetFileName(loc.FilePath) : "unknown";
            var func = loc?.FunctionName ?? "unknown";
            var line = loc?.Line ?? 0;
            var time = snapshot.CapturedAt.ToString("HH:mm:ss.fff");

            sb.AppendLine($"#{snapshot.Index} [{time}] {func} ({file}:{line})");

            switch (detail)
            {
                case "summary":
                    if (prevSnapshot != null)
                    {
                        var summary = CompactFormatter.FormatVariableChangeSummary(
                            prevSnapshot.State.Locals, state.Locals);
                        sb.AppendLine(summary);
                    }
                    break;

                case "full":
                    if (state.Locals.Count > 0)
                    {
                        sb.AppendLine("[locals]");
                        CompactFormatter.FormatVariables(sb, state.Locals, 0, depth);
                    }
                    if (state.CallStack.Count > 0)
                    {
                        sb.AppendLine("[stack]");
                        CompactFormatter.FormatCallStack(sb, state.CallStack);
                    }
                    break;

                case "changes":
                default:
                    if (prevSnapshot == null)
                    {
                        // First snapshot: show full state
                        if (state.Locals.Count > 0)
                        {
                            sb.AppendLine("[locals]");
                            CompactFormatter.FormatVariables(sb, state.Locals, 0, depth);
                        }
                        if (state.CallStack.Count > 0)
                        {
                            sb.AppendLine("[stack]");
                            CompactFormatter.FormatCallStack(sb, state.CallStack);
                        }
                    }
                    else
                    {
                        // Subsequent: show diff
                        CompactFormatter.FormatVariableDiff(sb,
                            prevSnapshot.State.Locals, state.Locals, depth);
                        CompactFormatter.FormatCallStackDiff(sb,
                            prevSnapshot.State.CallStack, state.CallStack);
                    }
                    break;
            }

            sb.AppendLine();
            prevSnapshot = snapshot;
        }

        return sb.ToString();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private DebugStateStore ResolveStore(string session)
    {
        var (store, error) = _sessionManager.ResolveByNameOrId(session);
        if (store is not null)
            return store;
        throw new KeyNotFoundException(error!);
    }

    private static DebugState GetBreakModeState(DebugStateStore store)
    {
        var state = store.GetCurrentState();
        if (state is null || !state.IsInBreakMode)
            throw new InvalidOperationException("No debug state available or not in break mode.");
        return state;
    }

    private string FormatSourceContext(DebugState state)
    {
        var filePath = state.CurrentLocation!.FilePath;
        if (string.IsNullOrEmpty(filePath) || !_sourceFileReader.FileExists(filePath))
            return $"Source file not accessible: {filePath}";

        var lines = _sourceFileReader.ReadAllLines(filePath);
        var currentLine = state.CurrentLocation.Line;
        var startLine = Math.Max(1, currentLine - 15);
        var endLine = Math.Min(lines.Length, currentLine + 15);

        var sb = new StringBuilder();
        sb.AppendLine($"## Source: {Path.GetFileName(filePath)}");
        sb.AppendLine($"**Function**: `{state.CurrentLocation.FunctionName}`");
        sb.AppendLine($"**Line {currentLine}** (showing {startLine}-{endLine})");
        sb.AppendLine();
        sb.AppendLine("```csharp");
        for (int i = startLine; i <= endLine; i++)
        {
            var prefix = i == currentLine ? ">>> " : "    ";
            sb.AppendLine($"{prefix}{i,4}: {lines[i - 1]}");
        }
        sb.AppendLine("```");

        return sb.ToString();
    }
}
