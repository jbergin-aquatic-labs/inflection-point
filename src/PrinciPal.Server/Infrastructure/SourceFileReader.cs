using PrinciPal.Application.Interfaces;

namespace PrinciPal.Server.Infrastructure;

public class SourceFileReader : ISourceFileReader
{
    public bool FileExists(string path) => File.Exists(path);
    public string[] ReadAllLines(string path) => File.ReadAllLines(path);
}
