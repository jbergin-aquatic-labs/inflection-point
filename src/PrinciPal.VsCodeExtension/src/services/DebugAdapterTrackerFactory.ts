import * as vscode from "vscode";
import type { VsCodeDebuggerAdapter } from "../adapters/VsCodeDebuggerAdapter.js";
import type { DebugEventCoordinator } from "./DebugEventCoordinator.js";
import type { IExtensionLogger } from "../abstractions/IExtensionLogger.js";

/**
 * Creates a PrinciPalDebugTracker per debug session.
 * Registered via vscode.debug.registerDebugAdapterTrackerFactory('*', factory).
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
        session: vscode.DebugSession
    ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return new PrinciPalDebugTracker(
            session,
            this._adapter,
            this._coordinator,
            this._logger
        );
    }
}

/**
 * Intercepts DAP messages to detect break mode transitions.
 * Coalesces overlapping `stopped` handlers so rapid breakpoints do not stack unbounded async work.
 */
class PrinciPalDebugTracker implements vscode.DebugAdapterTracker {
    private _pushGeneration = 0;

    private readonly _session: vscode.DebugSession;
    private readonly _adapter: VsCodeDebuggerAdapter;
    private readonly _coordinator: DebugEventCoordinator;
    private readonly _logger: IExtensionLogger;

    constructor(
        session: vscode.DebugSession,
        adapter: VsCodeDebuggerAdapter,
        coordinator: DebugEventCoordinator,
        logger: IExtensionLogger
    ) {
        this._session = session;
        this._adapter = adapter;
        this._coordinator = coordinator;
        this._logger = logger;
    }

    onDidSendMessage(message: DapMessage): void {
        if (message.type !== "event") return;

        if (message.event === "stopped") {
            const threadId = (message.body as { threadId?: number })?.threadId ?? 1;
            this._adapter.setBreakMode(this._session, threadId);
            this.invalidateInFlightPushes();
            const generation = this._pushGeneration;
            void this.buildAndPush(generation);
        } else if (message.event === "continued") {
            this.invalidateInFlightPushes();
            this._adapter.clearBreakMode(this._session);
        }
    }

    onWillStopSession(): void {
        this.invalidateInFlightPushes();
        this._adapter.clearBreakMode(this._session);
        void this.clear();
    }

    private invalidateInFlightPushes(): void {
        this._pushGeneration++;
    }

    private async buildAndPush(capturedGeneration: number): Promise<void> {
        try {
            const state = await this._coordinator.buildDebugState(this._session);
            if (capturedGeneration !== this._pushGeneration) {
                return;
            }
            if (!this._adapter.isInBreakMode(this._session)) {
                return;
            }
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
