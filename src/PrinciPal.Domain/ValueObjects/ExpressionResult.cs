using System.Collections.Generic;

namespace PrinciPal.Domain.ValueObjects
{
    /// <summary>
    /// Result of evaluating an expression in the debugger.
    /// </summary>
    public class ExpressionResult
    {
        public string Expression { get; set; } = string.Empty;
        public string Value { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public bool IsValid { get; set; }
        public List<LocalVariable> Members { get; set; } = new List<LocalVariable>();
    }
}
