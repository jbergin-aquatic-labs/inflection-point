namespace PrinciPal.Application.Abstractions;

public interface IDebugQueryService
{
    string ListSessions();
    string GetDebugState(string session, int depth = 2);
    string GetLocals(string session, int depth = 2);
    string GetCallStack(string session);
    string GetSourceContext(string session);
    string GetBreakpoints(string session);
    string GetExpressionResult(string session, int depth = 2);
    string ExplainCurrentState(string session);
    string GetBreakpointHistory(string session);
    string GetSnapshot(int index, string session, string detail = "full", int depth = 2);
    string ExplainExecutionFlow(string session, string detail = "changes", int depth = 1, int start = 0, int count = 0);
}
