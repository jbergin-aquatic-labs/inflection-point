namespace PrinciPal.Application.Abstractions;

public interface ISourceFileReader
{
    bool FileExists(string path);
    string[] ReadAllLines(string path);
}
