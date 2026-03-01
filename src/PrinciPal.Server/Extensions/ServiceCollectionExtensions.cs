using System.Reflection;
using PrinciPal.Application.Interfaces;
using PrinciPal.Application.Services;
using PrinciPal.Server.Infrastructure;

namespace PrinciPal.Server.Extensions;

internal static class ServiceCollectionExtensions
{
    public static IServiceCollection AddPrinciPalServices(this IServiceCollection services)
    {
        var version = Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";

        services.AddSingleton<ISessionManager, SessionManager>();
        services.AddSingleton<ISourceFileReader, SourceFileReader>();
        services.AddSingleton<IDebugQueryService, DebugQueryService>();

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
