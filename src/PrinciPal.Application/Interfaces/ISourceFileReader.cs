namespace PrinciPal.Application.Interfaces;

public interface ISourceFileReader
{
    bool FileExists(string path);
    string[] ReadAllLines(string path);
}
