using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using PrinciPal.Common.Results;
using PrinciPal.Domain.ValueObjects;
using PrinciPal.VsExtension.Adapters;
using Xunit;

namespace PrinciPal.VsExtension.Tests.Adapters
{
    public class HttpDebugStatePublisherTests : IDisposable
    {
        private const int Port = 19229;
        private const string SessionId = "abc123";
        private const string SessionName = "TestSolution";
        private const string SolutionPath = @"C:\src\TestSolution.sln";

        private readonly StubHandler _handler;
        private readonly HttpDebugStatePublisher _sut;

        public HttpDebugStatePublisherTests()
        {
            _handler = new StubHandler();
            _sut = new HttpDebugStatePublisher(Port, SessionId, SessionName, SolutionPath, _handler, retryBaseDelayMs: 0, heartbeatIntervalMs: Timeout.Infinite);
        }

        public void Dispose()
        {
            _sut.Dispose();
        }

        [Fact]
        public async Task RegisterSessionAsync_PostsToCorrectUrl()
        {
            var result = await _sut.RegisterSessionAsync();

            Assert.True(result.IsSuccess);
            Assert.Equal(HttpMethod.Post, _handler.LastRequest!.Method);
            Assert.Contains($"/api/sessions/{SessionId}", _handler.LastRequest.RequestUri!.PathAndQuery);
            Assert.Contains($"name={Uri.EscapeDataString(SessionName)}", _handler.LastRequest.RequestUri.Query);
            Assert.Contains($"path={Uri.EscapeDataString(SolutionPath)}", _handler.LastRequest.RequestUri.Query);
        }

        [Fact]
        public async Task PushDebugStateAsync_PostsJsonToCorrectUrl()
        {
            var state = new DebugState
            {
                IsInBreakMode = true,
                CurrentLocation = new SourceLocation { FilePath = "Test.cs", Line = 10 },
                Locals = new List<LocalVariable>
                {
                    new LocalVariable { Name = "x", Value = "42", Type = "int" }
                }
            };

            var result = await _sut.PushDebugStateAsync(state);

            Assert.True(result.IsSuccess);
            Assert.Equal(HttpMethod.Post, _handler.LastRequest!.Method);
            Assert.Contains("/debug-state", _handler.LastRequest.RequestUri!.PathAndQuery);

            Assert.Contains("\"isInBreakMode\":true", _handler.LastRequestBody);
            Assert.Contains("\"filePath\":\"Test.cs\"", _handler.LastRequestBody);
        }

        [Fact]
        public async Task ClearDebugStateAsync_DeletesCorrectUrl()
        {
            var result = await _sut.ClearDebugStateAsync();

            Assert.True(result.IsSuccess);
            Assert.Equal(HttpMethod.Delete, _handler.LastRequest!.Method);
            Assert.Contains($"/api/sessions/{SessionId}/debug-state", _handler.LastRequest.RequestUri!.PathAndQuery);
        }

        [Fact]
        public async Task DeregisterSessionAsync_DeletesCorrectUrl()
        {
            var result = await _sut.DeregisterSessionAsync();

            Assert.True(result.IsSuccess);
            Assert.Equal(HttpMethod.Delete, _handler.LastRequest!.Method);
            Assert.Equal($"/api/sessions/{SessionId}", _handler.LastRequest.RequestUri!.AbsolutePath);
        }

        [Fact]
        public async Task SendAsync_WhenHttpRequestException_ReturnsServerUnreachableError()
        {
            _handler.ThrowOnSend = new HttpRequestException("Connection refused");

            var result = await _sut.RegisterSessionAsync();

            Assert.True(result.IsFailure);
            Assert.Equal("Server.Unreachable", result.Error.Code);
            Assert.Contains("Connection refused", result.Error.Description);
            Assert.Equal(3, _handler.SendCallCount);
        }

        [Fact]
        public async Task SendAsync_WhenTaskCanceled_ReturnsRequestTimedOutError()
        {
            _handler.ThrowOnSend = new TaskCanceledException("Timed out");

            var result = await _sut.RegisterSessionAsync();

            Assert.True(result.IsFailure);
            Assert.Equal("Server.Timeout", result.Error.Code);
            Assert.Contains("Register", result.Error.Description);
            Assert.Equal(3, _handler.SendCallCount);
        }

        [Fact]
        public async Task SendAsync_RetriesThenSucceeds()
        {
            _handler.ThrowOnSend = new HttpRequestException("Connection refused");
            _handler.SucceedAfter = 2;

            var result = await _sut.RegisterSessionAsync();

            Assert.True(result.IsSuccess);
            Assert.Equal(3, _handler.SendCallCount);
        }

        [Fact]
        public async Task SendAsync_TimeoutRetriesThenSucceeds()
        {
            _handler.ThrowOnSend = new TaskCanceledException("Timed out");
            _handler.SucceedAfter = 1;

            var result = await _sut.RegisterSessionAsync();

            Assert.True(result.IsSuccess);
            Assert.Equal(2, _handler.SendCallCount);
        }

        [Fact]
        public async Task DeregisterSessionAsync_DoesNotRetry()
        {
            _handler.ThrowOnSend = new HttpRequestException("Connection refused");

            var result = await _sut.DeregisterSessionAsync();

            Assert.True(result.IsFailure);
            Assert.Equal(1, _handler.SendCallCount);
        }

        [Fact]
        public async Task StartHeartbeat_FiresRegisterEndpoint()
        {
            var handler = new StubHandler();
            using var publisher = new HttpDebugStatePublisher(Port, SessionId, SessionName, SolutionPath, handler, retryBaseDelayMs: 0, heartbeatIntervalMs: 50);
            publisher.StartHeartbeat();

            // Wait long enough for at least one tick
            await Task.Delay(200);
            publisher.StopHeartbeat();

            Assert.True(handler.SendCallCount >= 1, $"Expected at least 1 heartbeat call, got {handler.SendCallCount}");
            Assert.Contains($"/api/sessions/{SessionId}", handler.LastRequest!.RequestUri!.PathAndQuery);
        }

        [Fact]
        public async Task StopHeartbeat_StopsTimerFiring()
        {
            var handler = new StubHandler();
            using var publisher = new HttpDebugStatePublisher(Port, SessionId, SessionName, SolutionPath, handler, retryBaseDelayMs: 0, heartbeatIntervalMs: 50);
            publisher.StartHeartbeat();
            await Task.Delay(100);
            publisher.StopHeartbeat();

            var countAfterStop = handler.SendCallCount;
            await Task.Delay(150);

            Assert.Equal(countAfterStop, handler.SendCallCount);
        }

        [Fact]
        public async Task Heartbeat_IntervalLessThanOrEqualZero_NeverFires()
        {
            var handler = new StubHandler();
            using var publisher = new HttpDebugStatePublisher(Port, SessionId, SessionName, SolutionPath, handler, retryBaseDelayMs: 0, heartbeatIntervalMs: 0);
            publisher.StartHeartbeat();

            await Task.Delay(100);
            publisher.StopHeartbeat();

            Assert.Equal(0, handler.SendCallCount);
        }

        [Fact]
        public async Task Dispose_StopsHeartbeatTimer()
        {
            var handler = new StubHandler();
            var publisher = new HttpDebugStatePublisher(Port, SessionId, SessionName, SolutionPath, handler, retryBaseDelayMs: 0, heartbeatIntervalMs: 50);
            publisher.StartHeartbeat();
            publisher.Dispose();

            var countAfterDispose = handler.SendCallCount;
            await Task.Delay(150);

            Assert.Equal(countAfterDispose, handler.SendCallCount);
        }

        /// <summary>
        /// Minimal HttpMessageHandler stub that records the last request
        /// and optionally throws a configured exception.
        /// Content body is eagerly captured because HttpClient disposes it after SendAsync.
        /// </summary>
        private class StubHandler : HttpMessageHandler
        {
            public HttpRequestMessage? LastRequest { get; private set; }
            public string? LastRequestBody { get; private set; }
            public Exception? ThrowOnSend { get; set; }
            public int SendCallCount { get; private set; }
            public int? SucceedAfter { get; set; }

            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                SendCallCount++;
                LastRequest = request;
                LastRequestBody = request.Content != null
                    ? await request.Content.ReadAsStringAsync()
                    : null;

                if (ThrowOnSend != null && (SucceedAfter == null || SendCallCount <= SucceedAfter))
                    throw ThrowOnSend;

                return new HttpResponseMessage(HttpStatusCode.OK);
            }
        }
    }
}
