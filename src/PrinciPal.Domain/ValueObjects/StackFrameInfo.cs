namespace PrinciPal.Domain.ValueObjects
{
    /// <summary>
    /// Represents a single frame in the debugger call stack.
    /// </summary>
    public class StackFrameInfo
    {
        public int Index { get; set; }
        public string FunctionName { get; set; } = string.Empty;
        public string Module { get; set; } = string.Empty;
        public string Language { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int Line { get; set; }
    }
}
