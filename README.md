# princiPal (TypeScript)

Bridge **VS Code / Cursor** debug sessions to AI tools over the **Model Context Protocol**. The repo is **TypeScript only**: a small **MCP server** plus a **VS Code extension**. There is no .NET runtime.

## Repository layout

| Path | Role |
|------|------|
| `mcp_server/` | HTTP API for debug state + MCP tools on `POST /mcp` |
| `vscode_extension/` | Extension that captures DAP events and POSTs state to the server |

Naming uses **snake_case** for source files, types, and JSON fields (e.g. `is_in_break_mode`, `file_path`).

## Prerequisites

- Node.js 18+
- VS Code or Cursor 1.85+

## Build everything

From the repository root:

```bash
npm ci
npm run build
```

This compiles `mcp_server`, bundles it into `vscode_extension/server/principal_mcp_server.cjs`, and esbuilds the extension to `vscode_extension/out/extension_entry.js`.

## Run the MCP server alone

```bash
npm run start:server
```

Default port **9229**. Override with `--port 9333`.

Health check: `GET http://127.0.0.1:9229/api/health`

## Run / debug the VS Code extension

1. `npm run build` (or at least `npm run build -w mcp_server` + `npm run bundle:server-for-extension` so `server/principal_mcp_server.cjs` exists).
2. Open the `vscode_extension` folder in VS Code.
3. **Run Extension** (F5). In the Extension Development Host, start any debug session and hit a breakpoint.

With **principal: Auto Start** enabled (default), the extension spawns the bundled server. In a monorepo checkout it can also run `mcp_server/dist/main.js` via `node` with the workspace root as cwd.

## Configure your AI editor (MCP)

Point the client at the **streamable HTTP** endpoint:

```json
{
  "mcpServers": {
    "principal": {
      "url": "http://127.0.0.1:9229/mcp"
    }
  }
}
```

The exact config file depends on the product (Cursor MCP settings, Claude Code, etc.).

## MCP tools

Same tool names as before: `list_sessions`, `get_debug_state`, `get_locals`, `get_call_stack`, `get_source_context`, `get_breakpoints`, `get_expression_result`, `explain_current_state`, `get_breakpoint_history`, `get_snapshot`, `explain_execution_flow`.

## VS Code settings (`principal.*`)

- `principal.port` — server port (default 9229)
- `principal.auto_start` — spawn server on activate
- `principal.capture.*` — limits for locals / stack / breakpoints
- `principal.max_json_payload_chars` — guard before POSTing debug state

## Scripts (root)

| Script | Purpose |
|--------|---------|
| `npm run build` | Full pipeline (server + bundle + extension) |
| `npm run build:server` | `tsc` for `mcp_server` only |
| `npm run bundle:server-for-extension` | esbuild server → `vscode_extension/server/` |
| `npm run build:extension` | Extension bundle only |
| `npm run start:server` | Run compiled `mcp_server` |

## Package VSIX

```bash
npm run build
cd vscode_extension
npx vsce package --no-dependencies
```

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).
