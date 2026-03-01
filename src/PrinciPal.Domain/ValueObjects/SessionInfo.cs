using System;

namespace PrinciPal.Domain.ValueObjects
{
    public class SessionInfo
    {
        public string SessionId { get; set; } = "";
        public string Name { get; set; } = "";
        public string SolutionPath { get; set; } = "";
        public DateTime ConnectedAt { get; set; }
        public bool HasDebugState { get; set; }
    }
}
