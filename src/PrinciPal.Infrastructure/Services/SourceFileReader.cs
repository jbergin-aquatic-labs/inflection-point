using PrinciPal.Application.Abstractions;
using PrinciPal.Common.Options;

namespace PrinciPal.Infrastructure.Services;

public class SourceFileReader : ISourceFileReader
{
    public Option<string[]> ReadLines(string path) =>
        File.Exists(path) ? File.ReadAllLines(path) : Option<string[]>.None;
}
