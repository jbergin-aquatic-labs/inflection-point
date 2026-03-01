namespace PrinciPal.Server;

internal static class CliArgs
{
    public static int ParsePort(string[] args, int defaultPort = 9229)
    {
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == "--port" && int.TryParse(args[i + 1], out var port))
                return port;
        }
        return defaultPort;
    }
}
