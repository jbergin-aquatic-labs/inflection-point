import * as vscode from "vscode";
import type { vscode_debugger_adapter } from "../adapters/vscode_debugger_adapter";
import type { debug_event_coordinator } from "./debug_event_coordinator";
import type { i_extension_logger } from "../abstractions/i_extension_logger";

export class debug_adapter_tracker_factory implements vscode.DebugAdapterTrackerFactory {
    constructor(
        private readonly adapter: vscode_debugger_adapter,
        private readonly coordinator: debug_event_coordinator,
        private readonly logger: i_extension_logger
    ) {}

    createDebugAdapterTracker(
        session: vscode.DebugSession
    ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return new principal_debug_tracker(session, this.adapter, this.coordinator, this.logger);
    }
}

class principal_debug_tracker implements vscode.DebugAdapterTracker {
    private push_generation = 0;

    constructor(
        private readonly session: vscode.DebugSession,
        private readonly adapter: vscode_debugger_adapter,
        private readonly coordinator: debug_event_coordinator,
        private readonly logger: i_extension_logger
    ) {}

    onDidSendMessage(message: dap_message): void {
        if (message.type !== "event") return;
        if (message.event === "stopped") {
            const thread_id = (message.body as { threadId?: number })?.threadId ?? 1;
            this.adapter.set_break_mode(this.session, thread_id);
            this.invalidate_in_flight_pushes();
            const generation = this.push_generation;
            void this.build_and_push(generation);
        } else if (message.event === "continued") {
            this.invalidate_in_flight_pushes();
            this.adapter.clear_break_mode(this.session);
        }
    }

    onWillStopSession(): void {
        this.invalidate_in_flight_pushes();
        this.adapter.clear_break_mode(this.session);
        void this.clear();
    }

    private invalidate_in_flight_pushes(): void {
        this.push_generation++;
    }

    private async build_and_push(captured_generation: number): Promise<void> {
        try {
            const state = await this.coordinator.build_debug_state(this.session);
            if (captured_generation !== this.push_generation) return;
            if (!this.adapter.is_in_break_mode(this.session)) return;
            const result = await this.coordinator.publish_state(state);
            if (!result.ok) this.logger.log(result.error.description);
        } catch (e) {
            this.logger.log(`error pushing debug state: ${e}`);
        }
    }

    private async clear(): Promise<void> {
        try {
            const result = await this.coordinator.clear_state();
            if (!result.ok) this.logger.log(result.error.description);
        } catch (e) {
            this.logger.log(`error clearing debug state: ${e}`);
        }
    }
}

interface dap_message {
    type: string;
    event?: string;
    body?: unknown;
}
