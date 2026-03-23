# Inflection Point (TypeScript)

VS Code / Cursor debugger bridge to AI editors via MCP.

## Layout

- `mcp_server/` — Node MCP + REST (`/api/*`, streamable MCP on `/` and `/mcp`)
- `vscode_extension/` — Extension + sidebar status; esbuild → `out/extension_entry.js`

**Do not** apply `express.json()` globally on the MCP app — it breaks streamable HTTP (`stream is not readable`). JSON parsing is only mounted under `/api`.

## Build

```bash
npm ci
npm run build
```

## Cursor `mcp.json`

Use the **server root** URL (trailing slash is fine):

```json
"inflection-point": { "url": "http://127.0.0.1:9229/" }
```

Settings in VS Code: `inflection_point.*`.
