namespace PrinciPal.Domain.ValueObjects
{
    /// <summary>
    /// A single line of source code with metadata.
    /// </summary>
    public class SourceLine
    {
        public int LineNumber { get; set; }
        public string Text { get; set; } = string.Empty;
        public bool IsCurrentLine { get; set; }
    }
}
