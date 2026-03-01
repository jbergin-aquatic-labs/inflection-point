using PrinciPal.Application.Abstractions;

namespace PrinciPal.Infrastructure.Services;

public class SourceFileReader : ISourceFileReader
{
    public bool FileExists(string path) => File.Exists(path);
    public string[] ReadAllLines(string path) => File.ReadAllLines(path);
}
