using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Debugger;

public sealed class SnapshotNotFoundError : ErrorBase
{
    public SnapshotNotFoundError(int index)
        : base("Debugger.SnapshotNotFound",
               $"Snapshot #{index} not found. Use get_breakpoint_history to see available snapshots.") { }
}
