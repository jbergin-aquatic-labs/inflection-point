using PrinciPal.Common.Options;

namespace PrinciPal.Application.Abstractions;

public interface ISourceFileReader
{
    Option<string[]> ReadLines(string path);
}
