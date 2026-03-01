using ModelContextProtocol;
using NSubstitute;
using PrinciPal.Application.Abstractions;
using PrinciPal.Common.Errors.Debugger;
using PrinciPal.Common.Results;
using PrinciPal.Server.Tools;

namespace PrinciPal.Server.Tests.Tools;

/// <summary>
/// Verifies the thin MCP wrapper correctly delegates to IDebugQueryService
/// and resolves Results (throwing McpException on failure).
/// </summary>
public class DebugToolsTests
{
    private readonly IDebugQueryService _queryService = Substitute.For<IDebugQueryService>();
    private readonly DebugTools _tools;

    public DebugToolsTests()
    {
        _tools = new DebugTools(_queryService);
    }

    [Fact]
    public void ListSessions_DelegatesToService()
    {
        _queryService.ListSessions().Returns(Result<string>.Success("sessions"));
        Assert.Equal("sessions", _tools.ListSessions());
    }

    [Fact]
    public void GetDebugState_DelegatesToService()
    {
        _queryService.GetDebugState("s1", 3).Returns(Result<string>.Success("state"));
        Assert.Equal("state", _tools.GetDebugState("s1", 3));
    }

    [Fact]
    public void GetLocals_DelegatesToService()
    {
        _queryService.GetLocals("s1", 1).Returns(Result<string>.Success("locals"));
        Assert.Equal("locals", _tools.GetLocals("s1", 1));
    }

    [Fact]
    public void GetCallStack_DelegatesToService()
    {
        _queryService.GetCallStack("s1").Returns(Result<string>.Success("stack"));
        Assert.Equal("stack", _tools.GetCallStack("s1"));
    }

    [Fact]
    public void GetSourceContext_DelegatesToService()
    {
        _queryService.GetSourceContext("s1").Returns(Result<string>.Success("source"));
        Assert.Equal("source", _tools.GetSourceContext("s1"));
    }

    [Fact]
    public void GetBreakpoints_DelegatesToService()
    {
        _queryService.GetBreakpoints("s1").Returns(Result<string>.Success("bp"));
        Assert.Equal("bp", _tools.GetBreakpoints("s1"));
    }

    [Fact]
    public void GetExpressionResult_DelegatesToService()
    {
        _queryService.GetExpressionResult("s1", 2).Returns(Result<string>.Success("expr"));
        Assert.Equal("expr", _tools.GetExpressionResult("s1", 2));
    }

    [Fact]
    public void ExplainCurrentState_DelegatesToService()
    {
        _queryService.ExplainCurrentState("s1").Returns(Result<string>.Success("explained"));
        Assert.Equal("explained", _tools.ExplainCurrentState("s1"));
    }

    [Fact]
    public void GetBreakpointHistory_DelegatesToService()
    {
        _queryService.GetBreakpointHistory("s1").Returns(Result<string>.Success("history"));
        Assert.Equal("history", _tools.GetBreakpointHistory("s1"));
    }

    [Fact]
    public void GetSnapshot_DelegatesToService()
    {
        _queryService.GetSnapshot(5, "s1", "full", 2).Returns(Result<string>.Success("snap"));
        Assert.Equal("snap", _tools.GetSnapshot(5, "s1", "full", 2));
    }

    [Fact]
    public void ExplainExecutionFlow_DelegatesToService()
    {
        _queryService.ExplainExecutionFlow("s1", "changes", 1, 0, 0).Returns(Result<string>.Success("flow"));
        Assert.Equal("flow", _tools.ExplainExecutionFlow("s1", "changes", 1, 0, 0));
    }

    [Fact]
    public void Resolve_ConvertsFailureToMcpException()
    {
        _queryService.GetDebugState("s1", 2)
            .Returns(Result<string>.Failure(NotInBreakModeError.Default));

        var ex = Assert.Throws<McpException>(() => _tools.GetDebugState("s1", 2));
        Assert.Equal("Visual Studio is not in break mode. Hit a breakpoint first.", ex.Message);
    }

    [Fact]
    public void Resolve_ConvertsSessionNotFoundToMcpException()
    {
        _queryService.GetSnapshot(99, "s1", "full", 2)
            .Returns(Result<string>.Failure(new SnapshotNotFoundError(99)));

        var ex = Assert.Throws<McpException>(() => _tools.GetSnapshot(99, "s1", "full", 2));
        Assert.Contains("Snapshot #99 not found", ex.Message);
    }
}
