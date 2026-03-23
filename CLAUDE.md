# principal (TypeScript)

VS Code / Cursor debugger bridge to AI editors via MCP.

## Layout

- `mcp_server/` — Node MCP + REST API (`/api/*`, MCP POST `/mcp`)
- `vscode_extension/` — VS Code extension (esbuild → `out/extension_entry.js`)

## Build

```bash
npm ci
npm run build
```

## Run MCP server only

```bash
npm run start:server
# or
node mcp_server/dist/main.js --port 9229
```

## MCP URL for editors

Use `http://127.0.0.1:9229/mcp` (not the bare origin).

Configuration keys for the extension live under `principal.*` in VS Code settings.
