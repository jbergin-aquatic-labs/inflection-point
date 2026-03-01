using System.Reflection;
using PrinciPal.Server.Services;

namespace PrinciPal.Server.Extensions;

internal static class ServiceCollectionExtensions
{
    public static IServiceCollection AddPrinciPalServices(this IServiceCollection services)
    {
        var version = Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";

        services.AddSingleton<SessionManager>();

        services.AddMcpServer(options =>
        {
            options.ServerInfo = new()
            {
                Name = "princiPal",
                Version = version,
            };
        })
        .WithHttpTransport()
        .WithToolsFromAssembly();

        return services;
    }
}
