namespace PrinciPal.Domain.ValueObjects
{
    /// <summary>
    /// Represents a breakpoint set in the Visual Studio debugger.
    /// </summary>
    public class BreakpointInfo
    {
        public string FilePath { get; set; } = string.Empty;
        public int Line { get; set; }
        public int Column { get; set; }
        public string FunctionName { get; set; } = string.Empty;
        public bool Enabled { get; set; }
        public string? Condition { get; set; }
    }
}
