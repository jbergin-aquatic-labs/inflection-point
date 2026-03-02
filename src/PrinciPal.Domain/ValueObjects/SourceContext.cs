using System.Collections.Generic;

namespace PrinciPal.Domain.ValueObjects
{
    /// <summary>
    /// Source code context around the current breakpoint location.
    /// </summary>
    public class SourceContext
    {
        public string FilePath { get; set; } = string.Empty;
        public int CurrentLine { get; set; }
        public string FunctionName { get; set; } = string.Empty;
        public List<SourceLine> Lines { get; set; } = new List<SourceLine>();
    }
}
