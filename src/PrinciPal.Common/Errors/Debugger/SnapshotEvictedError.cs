using PrinciPal.Common.Abstractions;

namespace PrinciPal.Common.Errors.Debugger;

public sealed class SnapshotEvictedError : ErrorBase
{
    public SnapshotEvictedError(int index, int maxSize, int oldestAvailable)
        : base("Debugger.SnapshotEvicted",
               $"Snapshot #{index} was evicted (history keeps last {maxSize}). Oldest available: #{oldestAvailable}.") { }
}
