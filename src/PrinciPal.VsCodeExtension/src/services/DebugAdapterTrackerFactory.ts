import * as vscode from "vscode";
import type { VsCodeDebuggerAdapter } from "../adapters/VsCodeDebuggerAdapter.js";
import type { DebugEventCoordinator } from "./DebugEventCoordinator.js";
import type { IExtensionLogger } from "../abstractions/IExtensionLogger.js";

/**
 * Creates a PrinciPalDebugTracker per debug session.
 * Registered via vscode.debug.registerDebugAdapterTrackerFactory('*', factory).
 *
 * Replaces the C# DebuggerEventHandler that subscribes to COM events.
 */
export class DebugAdapterTrackerFactory
    implements vscode.DebugAdapterTrackerFactory
{
    private readonly _adapter: VsCodeDebuggerAdapter;
    private readonly _coordinator: DebugEventCoordinator;
    private readonly _logger: IExtensionLogger;

    constructor(
        adapter: VsCodeDebuggerAdapter,
        coordinator: DebugEventCoordinator,
        logger: IExtensionLogger
    ) {
        this._adapter = adapter;
        this._coordinator = coordinator;
        this._logger = logger;
    }

    createDebugAdapterTracker(
        _session: vscode.DebugSession
    ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return new PrinciPalDebugTracker(
            this._adapter,
            this._coordinator,
            this._logger
        );
    }
}

/**
 * Intercepts DAP messages to detect break mode transitions.
 * Equivalent of the COM DebuggerEvents subscriptions in the VS extension.
 */
class PrinciPalDebugTracker implements vscode.DebugAdapterTracker {
    private readonly _adapter: VsCodeDebuggerAdapter;
    private readonly _coordinator: DebugEventCoordinator;
    private readonly _logger: IExtensionLogger;

    constructor(
        adapter: VsCodeDebuggerAdapter,
        coordinator: DebugEventCoordinator,
        logger: IExtensionLogger
    ) {
        this._adapter = adapter;
        this._coordinator = coordinator;
        this._logger = logger;
    }

    /** Intercepts DAP messages from the debug adapter to VS Code. */
    onDidSendMessage(message: DapMessage): void {
        if (message.type !== "event") return;

        if (message.event === "stopped") {
            const threadId = (message.body as { threadId?: number })?.threadId ?? 1;
            this._adapter.setBreakMode(threadId);
            void this.buildAndPush();
        } else if (message.event === "continued") {
            this._adapter.clearBreakMode();
        }
    }

    /** Session is ending — clear state. */
    onWillStopSession(): void {
        this._adapter.clearBreakMode();
        void this.clear();
    }

    private async buildAndPush(): Promise<void> {
        try {
            const state = await this._coordinator.buildDebugState();
            const result = await this._coordinator.publishState(state);
            if (!result.ok) {
                this._logger.log(result.error.description);
            }
        } catch (e) {
            this._logger.log(`Error pushing debug state: ${e}`);
        }
    }

    private async clear(): Promise<void> {
        try {
            const result = await this._coordinator.clearState();
            if (!result.ok) {
                this._logger.log(result.error.description);
            }
        } catch (e) {
            this._logger.log(`Error clearing debug state: ${e}`);
        }
    }
}

interface DapMessage {
    type: string;
    event?: string;
    body?: unknown;
}
