import * as vscode from "vscode";
import * as crypto from "node:crypto";
import { output_logger } from "./output_logger";
import { vscode_debugger_adapter } from "./adapters/vscode_debugger_adapter";
import { http_debug_state_publisher } from "./adapters/http_debug_state_publisher";
import { debug_event_coordinator } from "./services/debug_event_coordinator";
import { debug_adapter_tracker_factory } from "./services/debug_adapter_tracker_factory";
import { server_process_manager } from "./services/server_process_manager";
import { load_debug_capture_limits } from "./debug_capture_limits";
import {
    inflection_point_status_provider,
    start_status_refresh,
} from "./inflection_point_status_provider";
import { server_controls_provider } from "./server_controls_provider";
import { create_workspace_session_identity_resolver } from "./workspace_session_identity";

let logger: output_logger | undefined;
let publisher: http_debug_state_publisher | undefined;
let process_manager: server_process_manager | undefined;
let coordinator: debug_event_coordinator | undefined;
let status_provider: inflection_point_status_provider | undefined;
let controls_provider: server_controls_provider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    logger = new output_logger();
    const config = vscode.workspace.getConfiguration("inflection_point");
    const port = config.get<number>("port", 9229);
    const auto_start = config.get<boolean>("auto_start", true);

    const workspace_folders = vscode.workspace.workspaceFolders;
    let primary_session_id: string;
    let session_name: string;
    let workspace_path: string;

    if (workspace_folders && workspace_folders.length > 0) {
        workspace_path = workspace_folders[0].uri.fsPath;
        session_name = workspace_folders[0].name;
        const hash = crypto.createHash("sha256").update(workspace_path.toLowerCase()).digest("hex");
        primary_session_id = hash.substring(0, 8);
    } else {
        primary_session_id = `vscode-${process.pid}`;
        session_name = primary_session_id;
        workspace_path = "";
    }

    const fallback_identity = {
        session_id: primary_session_id,
        session_name,
        workspace_path,
    };
    const resolve_identity = create_workspace_session_identity_resolver(fallback_identity);

    status_provider = new inflection_point_status_provider();
    status_provider.set_context({
        port,
        session_label: `${session_name} [${primary_session_id}]`,
    });
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("inflection_point_status", status_provider)
    );
    context.subscriptions.push(start_status_refresh(status_provider, 2500));

    context.subscriptions.push(
        vscode.commands.registerCommand("inflection_point.copy_mcp_url", async (url?: string) => {
            const u = url ?? `http://127.0.0.1:${port}/`;
            await vscode.env.clipboard.writeText(u);
            void vscode.window.showInformationMessage("Copied MCP URL (use as \"url\" in mcp.json).");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("inflection_point.copy_mcp_json_snippet", async () => {
            const mcp_url = `http://127.0.0.1:${port}/`;
            const snippet = JSON.stringify(
                {
                    mcpServers: {
                        "inflection-point": {
                            url: mcp_url,
                        },
                    },
                },
                null,
                2
            );
            await vscode.env.clipboard.writeText(snippet);
            void vscode.window.showInformationMessage("Copied mcp.json snippet to clipboard.");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("inflection_point.refresh_status", () => {
            status_provider?.refresh();
            controls_provider?.refresh();
        })
    );

    controls_provider = new server_controls_provider();
    controls_provider.set_port(port);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("inflection_point_server_controls", controls_provider)
    );

    const ensure_process_manager = (): server_process_manager => {
        if (!process_manager) {
            process_manager = new server_process_manager(logger!);
        }
        return process_manager;
    };

    const refresh_all = (): void => {
        status_provider?.refresh();
        controls_provider?.refresh();
    };

    context.subscriptions.push(
        vscode.commands.registerCommand("inflection_point.server_build", async () => {
            const ws = vscode.workspace.workspaceFolders?.[0];
            if (!ws) {
                void vscode.window.showErrorMessage("No workspace folder open.");
                return;
            }
            const terminal = vscode.window.createTerminal({ name: "IP: build server", cwd: ws.uri });
            terminal.show();
            terminal.sendText("npm run build");
            void vscode.window.showInformationMessage("Building MCP server… (see terminal)");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("inflection_point.server_start", async () => {
            const pm = ensure_process_manager();
            await pm.start(port);
            refresh_all();
            void vscode.window.showInformationMessage(`MCP server starting on port ${port}…`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("inflection_point.server_stop", async () => {
            const pm = ensure_process_manager();
            await pm.stop();
            refresh_all();
            void vscode.window.showInformationMessage("MCP server stopped.");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("inflection_point.server_restart", async () => {
            const pm = ensure_process_manager();
            void vscode.window.showInformationMessage("Restarting MCP server…");
            await pm.restart(port);
            refresh_all();
            void vscode.window.showInformationMessage(`MCP server restarted on port ${port}.`);
        })
    );

    if (auto_start) {
        const running = await server_process_manager.is_server_running(port, 3000);
        if (running) {
            logger.log(`existing MCP server on port ${port}; reusing.`);
        } else {
            process_manager = new server_process_manager(logger);
            await process_manager.start(port);
        }
        const mcp_url = `http://127.0.0.1:${port}/`;
        logger.log(`MCP: set mcp.json to use url "${mcp_url}" (streamable HTTP; root path is ok).`);
    } else {
        logger.log(`auto-start disabled; run mcp_server manually on port ${port}.`);
    }

    const get_capture_limits = () =>
        load_debug_capture_limits(vscode.workspace.getConfiguration("inflection_point"));

    const adapter = new vscode_debugger_adapter(get_capture_limits);
    publisher = new http_debug_state_publisher(
        port,
        resolve_identity,
        undefined,
        5000,
        500,
        30_000,
        () => get_capture_limits().max_json_payload_chars
    );
    coordinator = new debug_event_coordinator(adapter, publisher, logger);

    const trace_dap = config.get<boolean>("trace_dap", false);
    const tracker_factory = new debug_adapter_tracker_factory(adapter, coordinator, logger, trace_dap);
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory("*", tracker_factory));

    const schedule_pause_push_from_ui = (session: vscode.DebugSession): void => {
        coordinator?.invalidate_in_flight_pushes();
        const generation = coordinator?.current_push_generation ?? 0;
        void coordinator?.request_pause_push(session, null, generation);
    };

    const stack_item_is_for_session = (
        item: vscode.DebugThread | vscode.DebugStackFrame | undefined,
        session: vscode.DebugSession
    ): boolean =>
        !!item &&
        (item instanceof vscode.DebugThread || item instanceof vscode.DebugStackFrame) &&
        item.session.id === session.id;

    context.subscriptions.push(
        vscode.debug.onDidChangeActiveStackItem(() => {
            const session = vscode.debug.activeDebugSession;
            if (!session || !coordinator) return;
            if (stack_item_is_for_session(vscode.debug.activeStackItem, session)) {
                schedule_pause_push_from_ui(session);
            }
        })
    );

    context.subscriptions.push(
        vscode.debug.onDidChangeActiveDebugSession((session) => {
            status_provider?.refresh();
            if (!session || !coordinator) return;
            if (stack_item_is_for_session(vscode.debug.activeStackItem, session)) {
                schedule_pause_push_from_ui(session);
            }
        })
    );

    const poll_ms = config.get<number>("debug_pause_poll_interval_ms", 2000);
    if (poll_ms > 0) {
        let poll_push_in_flight = false;
        const poll_handle = setInterval(async () => {
            const session = vscode.debug.activeDebugSession;
            if (!session || !coordinator) return;
            if (poll_push_in_flight) return;
            poll_push_in_flight = true;
            try {
                // Poll never invalidates — it's a retry mechanism, not a state-change signal.
                // Probes the debug adapter for a paused thread and pushes if found.
                await coordinator.request_pause_push(session, undefined);
            } finally {
                poll_push_in_flight = false;
            }
        }, poll_ms);
        context.subscriptions.push({
            dispose() {
                clearInterval(poll_handle);
            },
        });
        logger.log(`pause poll: every ${poll_ms}ms while debugging (set inflection_point.debug_pause_poll_interval_ms to 0 to disable).`);
    }

    try {
        const reg = await coordinator.register();
        if (!reg.ok) logger.log(reg.error.description);
    } catch (e) {
        logger.log(`initial registration failed: ${e}`);
    }

    publisher.start_heartbeat();

    context.subscriptions.push({
        dispose() {
            process_manager?.dispose();
            logger?.dispose();
        },
    });

    logger.log(`session: ${session_name} [${primary_session_id}] (pushes use each debug session's workspace folder when set)`);
    logger.log("Inflection Point extension activated.");
}

export async function deactivate(): Promise<void> {
    publisher?.stop_heartbeat();
    try {
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
        await Promise.race([coordinator?.deregister(), timeout]);
    } catch {
        /* best effort */
    } finally {
        publisher?.dispose();
    }
}
