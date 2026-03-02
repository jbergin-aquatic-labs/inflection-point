# princiPal

Bridges VS 2022 / VS Code debugger state to AI editors via MCP.

## Project Structure

```
src/
  PrinciPal.Domain/          # Domain models and interfaces
  PrinciPal.Application/     # Application logic and services
  PrinciPal.Infrastructure/  # External concerns (persistence, integrations)
  PrinciPal.Common/          # Shared utilities
  PrinciPal.Server/          # ASP.NET host — API + MCP server (localhost:9229)
  PrinciPal.VsExtension/     # VSIX for Visual Studio 2022
  PrinciPal.VsCodeExtension/ # VSIX for VS Code / Cursor
tests/
  unit/                      # Unit tests mirroring src/ projects
  integration/               # Integration tests
  smoke/                     # Smoke tests
```

## Build & Test

```bash
dotnet build          # Build all
dotnet test           # Run all tests
```
