using System.Collections.Generic;

namespace PrinciPal.Domain.ValueObjects
{
    /// <summary>
    /// Represents a local variable in the current debug scope, including nested members.
    /// </summary>
    public class LocalVariable
    {
        public string Name { get; set; } = string.Empty;
        public string Value { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public bool IsValidValue { get; set; }
        public List<LocalVariable> Members { get; set; } = new List<LocalVariable>();
    }
}
