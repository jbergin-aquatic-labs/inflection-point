import * as vscode from "vscode";
import * as path from "node:path";

export type status_context = {
    port: number;
    session_label: string;
};

type server_debug_state = {
    is_in_break_mode: boolean;
    current_location: {
        file_path: string;
        line: number;
        column: number;
        function_name: string;
    } | null;
    locals: { name: string; value: string; type: string; members: unknown[] }[];
    call_stack: { index: number; function_name: string; file_path: string; line: number }[];
    breakpoints: { file_path: string; line: number; enabled: boolean; condition: string }[];
};

export class inflection_point_status_provider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _on_did_change = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._on_did_change.event;

    private _context: status_context = { port: 9229, session_label: "—" };

    set_context(ctx: Partial<status_context>): void {
        this._context = { ...this._context, ...ctx };
        this._on_did_change.fire();
    }

    refresh(): void {
        this._on_did_change.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) return (element as tree_parent).children ?? [];
        return this.build_root_items();
    }

    private async build_root_items(): Promise<vscode.TreeItem[]> {
        const port = this._context.port;
        const items: vscode.TreeItem[] = [];

        const [server_ok, debug_state] = await this.fetch_server_state(port);
        const active = vscode.debug.activeDebugSession;
        const stack_item = vscode.debug.activeStackItem;
        const all_bps = vscode.debug.breakpoints;

        // ── Server status
        const server_item = new vscode.TreeItem(
            server_ok ? "MCP server: reachable" : "MCP server: not reachable",
            vscode.TreeItemCollapsibleState.None
        );
        server_item.description = server_ok ? "✓" : "✗";
        server_item.tooltip = `GET /api/health on 127.0.0.1:${port}`;
        items.push(server_item);

        // ── Session
        const sess = new vscode.TreeItem("Session", vscode.TreeItemCollapsibleState.None);
        sess.description = this._context.session_label;
        sess.tooltip = "Registered with the MCP server for tool calls";
        items.push(sess);

        // ── Active debug session
        const dbg = new vscode.TreeItem(
            active ? `Debug: ${active.name}` : "Debug: no session",
            vscode.TreeItemCollapsibleState.None
        );
        dbg.description = active ? (stack_item ? "paused" : "running") : "";
        items.push(dbg);

        // ── Breakpoint location (from server-side state)
        if (debug_state?.is_in_break_mode && debug_state.current_location) {
            const loc = debug_state.current_location;
            const loc_parent = make_parent(
                `Stopped: ${path.basename(loc.file_path)}:${loc.line}`,
                `in ${loc.function_name}`,
                vscode.TreeItemCollapsibleState.Expanded
            );
            const fn_item = new vscode.TreeItem("Function", vscode.TreeItemCollapsibleState.None);
            fn_item.description = loc.function_name;
            const file_item = new vscode.TreeItem("File", vscode.TreeItemCollapsibleState.None);
            file_item.description = loc.file_path;
            const line_item = new vscode.TreeItem("Line", vscode.TreeItemCollapsibleState.None);
            line_item.description = `${loc.line}:${loc.column}`;
            loc_parent.children = [fn_item, file_item, line_item];
            items.push(loc_parent);

            // ── Call stack
            if (debug_state.call_stack.length > 0) {
                const stack_parent = make_parent(
                    `Call stack (${debug_state.call_stack.length})`,
                    "",
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                stack_parent.children = debug_state.call_stack.map((f) => {
                    const frame = new vscode.TreeItem(
                        f.function_name,
                        vscode.TreeItemCollapsibleState.None
                    );
                    frame.description = `${path.basename(f.file_path)}:${f.line}`;
                    return frame;
                });
                items.push(stack_parent);
            }

            // ── Locals
            if (debug_state.locals.length > 0) {
                const locals_parent = make_parent(
                    `Locals (${debug_state.locals.length})`,
                    "",
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                locals_parent.children = debug_state.locals.slice(0, 30).map((v) => {
                    const item = new vscode.TreeItem(v.name, vscode.TreeItemCollapsibleState.None);
                    const val = v.value.length > 60 ? v.value.slice(0, 57) + "…" : v.value;
                    item.description = v.type ? `${v.type} = ${val}` : val;
                    return item;
                });
                if (debug_state.locals.length > 30) {
                    locals_parent.children.push(
                        new vscode.TreeItem(`… +${debug_state.locals.length - 30} more`)
                    );
                }
                items.push(locals_parent);
            }
        } else if (active && stack_item) {
            // Server doesn't have state yet, but VS Code shows paused — show a hint
            const hint = new vscode.TreeItem(
                "Paused (state not yet pushed to server)",
                vscode.TreeItemCollapsibleState.None
            );
            hint.tooltip = "The debug adapter shows a paused state but the MCP server hasn't received it yet.";
            items.push(hint);
        }

        // ── IDE breakpoints
        const source_bps = all_bps.filter((b): b is vscode.SourceBreakpoint => "location" in b);
        if (source_bps.length > 0) {
            const bp_parent = make_parent(
                `IDE breakpoints (${source_bps.length})`,
                "",
                vscode.TreeItemCollapsibleState.Collapsed
            );
            bp_parent.children = source_bps.slice(0, 20).map((bp) => {
                const file = path.basename(bp.location.uri.fsPath);
                const line = bp.location.range.start.line + 1;
                const item = new vscode.TreeItem(
                    `${file}:${line}`,
                    vscode.TreeItemCollapsibleState.None
                );
                item.description = bp.enabled ? "on" : "off";
                if (bp.condition) item.tooltip = `when ${bp.condition}`;
                return item;
            });
            items.push(bp_parent);
        }

        // ── MCP URL
        const mcp_url = `http://127.0.0.1:${port}/`;
        const mcp = new vscode.TreeItem("MCP URL", vscode.TreeItemCollapsibleState.None);
        mcp.description = mcp_url;
        mcp.tooltip = "Put this in Cursor mcp.json as url (streamable HTTP at /)";
        mcp.command = {
            command: "inflection_point.copy_mcp_url",
            title: "Copy URL",
            arguments: [mcp_url],
        };
        items.push(mcp);

        return items;
    }

    private async fetch_server_state(
        port: number
    ): Promise<[boolean, server_debug_state | null]> {
        const session_id = this._context.session_label.match(/\[([a-f0-9]+)\]/)?.[1];
        try {
            const health = await fetch(`http://127.0.0.1:${port}/api/health`, {
                signal: AbortSignal.timeout(1500),
            });
            if (!health.ok) return [false, null];

            if (session_id) {
                const r = await fetch(
                    `http://127.0.0.1:${port}/api/sessions/${encodeURIComponent(session_id)}/debug-state/history`,
                    { signal: AbortSignal.timeout(1500) }
                );
                if (r.ok) {
                    const history = (await r.json()) as { state: server_debug_state }[];
                    if (history.length > 0) {
                        return [true, history[history.length - 1].state];
                    }
                }
            }
            return [true, null];
        } catch {
            return [false, null];
        }
    }
}

class tree_parent extends vscode.TreeItem {
    children: vscode.TreeItem[] = [];
}

function make_parent(
    label: string,
    description: string,
    state: vscode.TreeItemCollapsibleState
): tree_parent {
    const item = new tree_parent(label, state);
    item.description = description;
    return item;
}

export function start_status_refresh(
    provider: inflection_point_status_provider,
    ms: number
): vscode.Disposable {
    const h = setInterval(() => provider.refresh(), ms);
    return new vscode.Disposable(() => clearInterval(h));
}
