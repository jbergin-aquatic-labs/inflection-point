using PrinciPal.Common.Results;

namespace PrinciPal.Application.Abstractions;

public interface IDebugQueryService
{
    Result<string> ListSessions();
    Result<string> GetDebugState(string session, int depth = 2);
    Result<string> GetLocals(string session, int depth = 2);
    Result<string> GetCallStack(string session);
    Result<string> GetSourceContext(string session);
    Result<string> GetBreakpoints(string session);
    Result<string> GetExpressionResult(string session, int depth = 2);
    Result<string> ExplainCurrentState(string session);
    Result<string> GetBreakpointHistory(string session);
    Result<string> GetSnapshot(int index, string session, string detail = "full", int depth = 2);
    Result<string> ExplainExecutionFlow(string session, string detail = "changes", int depth = 1, int start = 0, int count = 0);
}
