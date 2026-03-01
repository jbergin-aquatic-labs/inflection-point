namespace PrinciPal.Common.Errors;

public interface IError
{
    string Code { get; }
    string Description { get; }
}
