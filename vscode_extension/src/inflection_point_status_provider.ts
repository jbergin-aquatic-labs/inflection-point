import * as vscode from "vscode";

export type status_context = {
    port: number;
    session_label: string;
};

/**
 * Sidebar: MCP server reachability, port, and debug session hint.
 */
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

    async getChildren(): Promise<vscode.TreeItem[]> {
        const port = this._context.port;
        let server_ok = false;
        try {
            const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
                signal: AbortSignal.timeout(1500),
            });
            server_ok = r.ok;
        } catch {
            server_ok = false;
        }

        const mcp_url = `http://127.0.0.1:${port}/`;
        const active = vscode.debug.activeDebugSession;

        const items: vscode.TreeItem[] = [];

        const server_item = new vscode.TreeItem(
            server_ok ? "MCP server: reachable" : "MCP server: not reachable",
            vscode.TreeItemCollapsibleState.None
        );
        server_item.description = server_ok ? "✓" : "✗";
        server_item.tooltip = `GET /api/health on 127.0.0.1:${port}`;
        items.push(server_item);

        const port_item = new vscode.TreeItem(`Port`, vscode.TreeItemCollapsibleState.None);
        port_item.description = String(port);
        port_item.tooltip = "inflection_point.port";
        items.push(port_item);

        const dbg = new vscode.TreeItem(
            active ? `Debug: ${active.name}` : "Debug: no session",
            vscode.TreeItemCollapsibleState.None
        );
        dbg.tooltip = "Start debugging; on breakpoint the extension pushes stack/locals to the MCP server.";
        items.push(dbg);

        const sess = new vscode.TreeItem(`Workspace session`, vscode.TreeItemCollapsibleState.None);
        sess.description = this._context.session_label;
        sess.tooltip = "Registered with the MCP server for tool calls (session name / id)";
        items.push(sess);

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
}

export function start_status_refresh(
    provider: inflection_point_status_provider,
    ms: number
): vscode.Disposable {
    const h = setInterval(() => provider.refresh(), ms);
    return new vscode.Disposable(() => clearInterval(h));
}
