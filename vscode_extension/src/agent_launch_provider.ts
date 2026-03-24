import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { workspace_session_identity_from_folder } from "./workspace_session_identity";

const state_key_mode = "inflection_point.agent_launch.mode";
const state_key_blocked = "inflection_point.agent_launch.blocked";
const state_key_allowed = "inflection_point.agent_launch.allowed";

export type launch_mode = "open" | "strict";

export type launch_config_tree_item =
    | { kind: "header" }
    | { kind: "mode" }
    | { kind: "config"; name: string };

export class agent_launch_provider implements vscode.TreeDataProvider<launch_config_tree_item> {
    private readonly _on_did_change = new vscode.EventEmitter<launch_config_tree_item | undefined | void>();
    readonly onDidChangeTreeData = this._on_did_change.event;

    private _names: string[] = [];
    private _port = 9229;

    constructor(private readonly context: vscode.ExtensionContext) {}

    set_port(port: number): void {
        this._port = port;
    }

    refresh(): void {
        this._names = read_launch_config_names();
        void this.push_sync_to_server();
        this._on_did_change.fire();
    }

    getTreeItem(element: launch_config_tree_item): vscode.TreeItem {
        if (element.kind === "header") {
            const item = new vscode.TreeItem(
                "Launch configurations (.vscode/launch.json)",
                vscode.TreeItemCollapsibleState.Expanded
            );
            item.iconPath = new vscode.ThemeIcon("debug-alt");
            item.description = `${this._names.length} found`;
            return item;
        }
        if (element.kind === "mode") {
            const mode = this.get_mode();
            const item = new vscode.TreeItem(
                mode === "open"
                    ? "Mode: open (uncheck to block agent)"
                    : "Mode: strict (check to allow agent)",
                vscode.TreeItemCollapsibleState.None
            );
            item.iconPath = new vscode.ThemeIcon("shield");
            item.command = {
                command: "inflection_point.toggle_agent_launch_mode",
                title: "Toggle mode",
            };
            item.tooltip = "Switch open (default allow) vs strict (default deny).";
            return item;
        }
        const name = element.name;
        const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("debug-breakpoint-data-unverified");
        const mode = this.get_mode();
        const checked =
            mode === "open" ? !this.get_blocked().includes(name) : this.get_allowed().includes(name);
        item.checkboxState = checked
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
        item.tooltip = `Agent may ${checked ? "" : "NOT "}start "${name}" via MCP start_debugging.`;
        return item;
    }

    getChildren(element?: launch_config_tree_item): launch_config_tree_item[] {
        if (!element) {
            return [{ kind: "header" }];
        }
        if (element.kind === "header") {
            return [{ kind: "mode" }, ...this._names.map((n) => ({ kind: "config" as const, name: n }))];
        }
        return [];
    }

    getParent(element: launch_config_tree_item): launch_config_tree_item | undefined {
        if (element.kind === "header") return undefined;
        if (element.kind === "mode" || element.kind === "config") return { kind: "header" };
        return undefined;
    }

    handle_checkbox_change(event: vscode.TreeCheckboxChangeEvent<launch_config_tree_item>): void {
        for (const [el, state] of event.items) {
            if (el.kind !== "config") continue;
            const name = el.name;
            const checked = state === vscode.TreeItemCheckboxState.Checked;
            const mode = this.get_mode();
            if (mode === "open") {
                let blocked = [...this.get_blocked()];
                if (checked) blocked = blocked.filter((n) => n !== name);
                else if (!blocked.includes(name)) blocked.push(name);
                void this.context.workspaceState.update(state_key_blocked, blocked);
            } else {
                let allowed = [...this.get_allowed()];
                if (checked) {
                    if (!allowed.includes(name)) allowed.push(name);
                } else {
                    allowed = allowed.filter((n) => n !== name);
                }
                void this.context.workspaceState.update(state_key_allowed, allowed);
            }
        }
        void this.push_policy_to_server();
        this._on_did_change.fire();
    }

    get_mode(): launch_mode {
        return this.context.workspaceState.get<launch_mode>(state_key_mode) ?? "open";
    }

    async toggle_mode(): Promise<void> {
        const next: launch_mode = this.get_mode() === "open" ? "strict" : "open";
        await this.context.workspaceState.update(state_key_mode, next);
        void this.push_policy_to_server();
        this._on_did_change.fire();
    }

    private get_blocked(): string[] {
        return this.context.workspaceState.get<string[]>(state_key_blocked) ?? [];
    }

    private get_allowed(): string[] {
        return this.context.workspaceState.get<string[]>(state_key_allowed) ?? [];
    }

    private async push_sync_to_server(): Promise<void> {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) return;
        const { session_id } = workspace_session_identity_from_folder(folder);
        try {
            await fetch(
                `http://127.0.0.1:${this._port}/api/sessions/${encodeURIComponent(session_id)}/launch-sync`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ names: this._names }),
                }
            );
        } catch {
            /* server down */
        }
        await this.push_policy_to_server();
    }

    private async push_policy_to_server(): Promise<void> {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) return;
        const { session_id } = workspace_session_identity_from_folder(folder);
        const mode = this.get_mode();
        try {
            await fetch(
                `http://127.0.0.1:${this._port}/api/sessions/${encodeURIComponent(session_id)}/launch-allow`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mode,
                        blocked: this.get_blocked(),
                        allowed: this.get_allowed(),
                    }),
                }
            );
        } catch {
            /* server down */
        }
    }
}

function read_launch_config_names(): string[] {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return [];
    const launch_path = path.join(folder.uri.fsPath, ".vscode", "launch.json");
    try {
        const raw = fs.readFileSync(launch_path, "utf8");
        const parsed = JSON.parse(raw) as { configurations?: { name?: string }[] };
        const cfgs = parsed.configurations ?? [];
        const names: string[] = [];
        for (const c of cfgs) {
            if (c?.name && typeof c.name === "string") names.push(c.name);
        }
        return names;
    } catch {
        return [];
    }
}
