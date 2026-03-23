import * as vscode from "vscode";
import * as crypto from "node:crypto";
import { output_logger } from "./output_logger";
import { vscode_debugger_adapter } from "./adapters/vscode_debugger_adapter";
import { http_debug_state_publisher } from "./adapters/http_debug_state_publisher";
import { debug_event_coordinator } from "./services/debug_event_coordinator";
import { debug_adapter_tracker_factory } from "./services/debug_adapter_tracker_factory";
import { server_process_manager } from "./services/server_process_manager";
import { load_debug_capture_limits } from "./debug_capture_limits";

let logger: output_logger | undefined;
let publisher: http_debug_state_publisher | undefined;
let process_manager: server_process_manager | undefined;
let coordinator: debug_event_coordinator | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    logger = new output_logger();

    const config = vscode.workspace.getConfiguration("principal");
    const port = config.get<number>("port", 9229);
    const auto_start = config.get<boolean>("auto_start", true);

    const workspace_folders = vscode.workspace.workspaceFolders;
    let session_id: string;
    let session_name: string;
    let workspace_path: string;

    if (workspace_folders && workspace_folders.length > 0) {
        workspace_path = workspace_folders[0].uri.fsPath;
        session_name = workspace_folders[0].name;
        const hash = crypto.createHash("sha256").update(workspace_path.toLowerCase()).digest("hex");
        session_id = hash.substring(0, 8);
    } else {
        session_id = `vscode-${process.pid}`;
        session_name = session_id;
        workspace_path = "";
    }

    if (auto_start) {
        const running = await server_process_manager.is_server_running(port, 3000);
        if (running) {
            logger.log(`existing MCP server on port ${port}; reusing.`);
        } else {
            process_manager = new server_process_manager(logger);
            await process_manager.start(port);
        }
        const mcp_url = `http://127.0.0.1:${port}/mcp`;
        logger.log(`MCP config: { "mcpServers": { "principal": { "url": "${mcp_url}" } } }`);
    } else {
        logger.log(`auto-start disabled; run the server manually on port ${port}.`);
    }

    const get_capture_limits = () => load_debug_capture_limits(vscode.workspace.getConfiguration("principal"));

    const adapter = new vscode_debugger_adapter(get_capture_limits);
    publisher = new http_debug_state_publisher(
        port,
        session_id,
        session_name,
        workspace_path,
        undefined,
        5000,
        500,
        30_000,
        () => get_capture_limits().max_json_payload_chars
    );
    coordinator = new debug_event_coordinator(adapter, publisher, logger);

    const tracker_factory = new debug_adapter_tracker_factory(adapter, coordinator, logger);
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory("*", tracker_factory));

    const reg = await coordinator.register();
    if (!reg.ok) logger.log(reg.error.description);

    publisher.start_heartbeat();

    context.subscriptions.push({
        dispose() {
            process_manager?.dispose();
            logger?.dispose();
        },
    });

    logger.log(`session: ${session_name} [${session_id}]`);
    logger.log("principal extension activated.");
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
