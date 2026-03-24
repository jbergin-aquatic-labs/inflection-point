import * as vscode from "vscode";
import { server_lock_file } from "./services/server_lock_file";

export class server_controls_provider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _on_did_change = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._on_did_change.event;

    private _port = 9229;

    set_port(port: number): void {
        this._port = port;
    }

    refresh(): void {
        this._on_did_change.fire();
    }

    getTreeItem(el: vscode.TreeItem): vscode.TreeItem {
        return el;
    }

    async getChildren(): Promise<vscode.TreeItem[]> {
        const port = this._port;
        const items: vscode.TreeItem[] = [];

        let healthy = false;
        try {
            const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
                signal: AbortSignal.timeout(1500),
            });
            healthy = r.ok;
        } catch {
            /* unreachable */
        }

        const lock_pid = server_lock_file.read_lock_pid(port);
        const pid_alive = lock_pid !== undefined && process_alive(lock_pid);

        // ── Status
        const status = new vscode.TreeItem(
            healthy ? "Server: running" : "Server: stopped",
            vscode.TreeItemCollapsibleState.None
        );
        status.description = healthy
            ? `PID ${lock_pid ?? "?"} · port ${port}`
            : `port ${port}`;
        status.iconPath = new vscode.ThemeIcon(
            healthy ? "vm-running" : "vm-outline",
            healthy
                ? new vscode.ThemeColor("testing.iconPassed")
                : new vscode.ThemeColor("testing.iconSkipped")
        );
        items.push(status);

        // ── Action buttons as tree items
        const build_item = make_action(
            "Build server",
            "$(package)",
            "inflection_point.server_build",
            "Compile mcp_server TypeScript and bundle for extension"
        );
        items.push(build_item);

        if (healthy || pid_alive) {
            items.push(
                make_action(
                    "Restart server",
                    "$(debug-restart)",
                    "inflection_point.server_restart",
                    "Stop the running server and start a fresh instance"
                )
            );
            items.push(
                make_action(
                    "Stop server",
                    "$(debug-stop)",
                    "inflection_point.server_stop",
                    "Kill the MCP server process"
                )
            );
        } else {
            items.push(
                make_action(
                    "Start server",
                    "$(play)",
                    "inflection_point.server_start",
                    "Start the MCP server on the configured port"
                )
            );
        }

        return items;
    }
}

function make_action(
    label: string,
    icon_id: string,
    command_id: string,
    tooltip: string
): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(icon_id.replace("$(", "").replace(")", ""));
    item.tooltip = tooltip;
    item.command = { command: command_id, title: label };
    return item;
}

function process_alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}
