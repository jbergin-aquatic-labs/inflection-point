# Inflection Point (TypeScript)

Bridge **VS Code / Cursor** debug sessions to AI tools over the **Model Context Protocol**. This repo is **TypeScript only**: an **MCP server** and a **VS Code extension**. There is no .NET runtime.

## Repository layout

| Path | Role |
|------|------|
| `mcp_server/` | REST API (`/api/*`) + **streamable MCP** on **`/`** and **`/mcp`** |
| `vscode_extension/` | DAP capture, **Inflection Point** activity bar (server status, MCP URL, copy snippet) |

Naming uses **snake_case** for source files, types, and JSON fields (`is_in_break_mode`, `file_path`, …).

## Prerequisites

- Node.js 18+
- VS Code or Cursor 1.85+

## Build

```bash
npm ci
npm run build
```

Produces `mcp_server/dist`, `vscode_extension/server/inflection_point_mcp_server.cjs` (gitignored), and `vscode_extension/out/extension_entry.js`.

## Cursor / VS Code MCP config

The server speaks **streamable HTTP**. You may set **`url` to the origin** (what Cursor often expects):

```json
{
  "mcpServers": {
    "inflection-point": {
      "url": "http://127.0.0.1:9229/"
    }
  }
}
```

`/mcp` also works. Use **`127.0.0.1`** if `localhost` resolution causes issues.

**Important:** The MCP app must **not** run global `express.json()` over MCP routes — that leads to `stream is not readable`. JSON parsing is scoped to `/api` only in this codebase.

## Run the server alone

```bash
npm run start:server
```

Port **9229** by default; `--port 9333` to override. Health: `GET http://127.0.0.1:9229/api/health`.

## Extension (F5 / VSIX)

1. `npm run build`
2. Open folder **`vscode_extension`**
3. **Run Extension**

The **Inflection Point** icon in the activity bar opens a tree: server reachability, port, debug session, MCP URL (click to copy), and toolbar actions to copy a full `mcp.json` snippet or refresh.

VS Code settings: **`inflection_point.*`** (port, auto-start, capture limits).

## MCP tools

`list_sessions`, `get_debug_state`, `get_locals`, `get_call_stack`, `get_source_context`, `get_breakpoints`, `get_expression_result`, `explain_current_state`, `get_breakpoint_history`, `get_snapshot`, `explain_execution_flow`.

## Package VSIX

```bash
npm run build
cd vscode_extension
npx vsce package --no-dependencies
```

You need a valid `publisher` in `package.json` for the marketplace; for local install, VS Code accepts a local `.vsix` from **Extensions → Install from VSIX**.

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).
