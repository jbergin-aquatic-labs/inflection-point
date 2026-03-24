# Inflection Point (TypeScript)

Bridge **Cursor / VS Code** debug sessions to AI tools over **MCP**. This repo is **TypeScript only**: an MCP server plus an extension. **You can run everything in your normal Cursor window** — no second “Extension Development Host” required if you install the `.vsix`.

---

## Setup (three parts)

### Part 1 — Build everything (from repo root)

```bash
cd /path/to/inflection-point
npm ci
npm run build
```

This:

- Compiles **`mcp_server`**
- Bundles the server into **`vscode_extension/server/inflection_point_mcp_server.cjs`**
- Builds the extension and produces **`vscode_extension/inflection-point.vsix`**

If you only need the VSIX after a code change:

```bash
npm run build -w vscode_extension && npm run vsix -w vscode_extension
```

---

### Part 2 — Add MCP settings (Cursor)

Point Cursor at the local server. In your **MCP config** (often **`~/.cursor/mcp.json`**, or Cursor **Settings → MCP**), add:

```json
{
  "mcpServers": {
    "inflection-point": {
      "url": "http://127.0.0.1:9229/"
    }
  }
}
```

Reload MCP or restart Cursor so it picks this up.

---

### Part 3 — Install the extension **in this Cursor window** and let it start the server

1. In **the same Cursor instance** you use daily: **Command Palette** (`Cmd+Shift+P`) → **Extensions: Install from VSIX…**
2. Choose **`vscode_extension/inflection-point.vsix`** from your clone.
3. **Reload** if Cursor asks.
4. With defaults (**`inflection_point.auto_start`: true**), the extension starts the bundled MCP server when it activates (on window startup). Check **View → Output → “Inflection Point”** if something fails.
5. Use the **Inflection Point** icon in the **activity bar** to see server status, port, and **copy MCP URL / mcp.json snippet**.

Then open your app folder, **start debugging**, hit a **breakpoint**, and use **chat** — models can call MCP tools (`list_sessions`, `get_debug_state`, etc.) against your session.

### Agent-run debugging (MCP controls the IDE)

The extension exposes an **Agent run (launch)** sidebar view: it reads `.vscode/launch.json` and lets you **check or uncheck** which configurations the agent may start. Toggle **open** (default: all allowed unless unchecked) vs **strict** (only checked names allowed). The model can call MCP tools:

- `list_launch_configs` — names and allow/block state  
- `start_debugging` — runs `vscode.debug.startDebugging` for a launch name  
- `add_editor_breakpoint` / `remove_editor_breakpoint` — editor source breakpoints (absolute path, 1-based line)  
- `debug_continue` — Continue in the debug toolbar  

The extension long-polls the server for these commands (disable with **`inflection_point.agent_commands_enabled`: false**).

On the MCP server, call **`get_agent_capabilities`** for the full workflow text, or **`GET http://127.0.0.1:9229/about`** for JSON including `agent_control` REST hints.

**Optional:** run the server yourself instead of auto-start:

```bash
npm run start:server
```

and set **`inflection_point.auto_start`** to `false` in Settings.

---

## Optional: develop the extension (second window)

Only if you are **changing extension code**: open the **repo root** in Cursor and **F5** → **Launch Extension (Dev Host)**. For normal use, **Part 3 + VSIX** is enough.

---

## Layout

| Path | Role |
|------|------|
| `mcp_server/` | REST `/api/*` + streamable MCP on `/` and `/mcp` |
| `vscode_extension/` | Extension + bundled server + **`inflection-point.vsix`** after build |

## Health check

```bash
curl -s http://127.0.0.1:9229/api/health
```

## Troubleshooting MCP (`fetch failed`, `ECONNREFUSED 127.0.0.1:9229`)

The server must **keep listening** while Cursor is open. Earlier builds **exited automatically** when no VS Code extension session was registered for a short grace period, which **killed port 9229** and broke MCP reconnects.

**Current behavior:** the process **does not exit on idle** unless you set:

```bash
export INFLECTION_POINT_EXIT_ON_IDLE=1
```

If MCP drops anyway: confirm the extension **Inflection Point** is enabled, **`inflection_point.auto_start`** is on, and check **Output → Inflection Point**. Or start the server manually: `npm run start:server`.

## Settings

`inflection_point.port`, `inflection_point.auto_start`, `inflection_point.capture.*`, `inflection_point.max_json_payload_chars`

## License

GPL-3.0 — see [LICENSE](LICENSE).
