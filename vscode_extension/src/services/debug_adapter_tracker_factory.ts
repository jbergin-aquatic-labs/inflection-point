import * as vscode from "vscode";
import type { vscode_debugger_adapter } from "../adapters/vscode_debugger_adapter";
import type { debug_event_coordinator } from "./debug_event_coordinator";
import type { i_extension_logger } from "../abstractions/i_extension_logger";
import { normalize_dap_event_message } from "../dap_message";

export class debug_adapter_tracker_factory implements vscode.DebugAdapterTrackerFactory {
    constructor(
        private readonly adapter: vscode_debugger_adapter,
        private readonly coordinator: debug_event_coordinator,
        private readonly logger: i_extension_logger,
        private readonly trace_dap: boolean = false
    ) {}

    createDebugAdapterTracker(
        session: vscode.DebugSession
    ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return new principal_debug_tracker(
            session,
            this.adapter,
            this.coordinator,
            this.logger,
            this.trace_dap
        );
    }
}

class principal_debug_tracker implements vscode.DebugAdapterTracker {
    private push_generation = 0;

    constructor(
        private readonly session: vscode.DebugSession,
        private readonly adapter: vscode_debugger_adapter,
        private readonly coordinator: debug_event_coordinator,
        private readonly logger: i_extension_logger,
        private readonly trace_dap: boolean
    ) {}

    onDidSendMessage(message: unknown): void {
        const normalized = normalize_dap_event_message(message);
        if (!normalized) return;
        if (this.trace_dap) {
            this.logger.log(
                `dap ${normalized.type}${normalized.event ? `:${normalized.event}` : ""} session=${this.session.type}`
            );
        }
        if (normalized.type !== "event") return;
        if (normalized.event === "stopped") {
            const hint = (normalized.body as { threadId?: number } | undefined)?.threadId;
            this.adapter.set_break_mode(this.session, hint ?? 1);
            this.invalidate_in_flight_pushes();
            const generation = this.push_generation;
            void this.finish_stopped_push(generation, hint);
        } else if (normalized.event === "continued") {
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

    private async finish_stopped_push(captured_generation: number, hint?: number): Promise<void> {
        try {
            const resolved = await this.adapter.resolve_stopped_thread_id(this.session, hint);
            if (captured_generation !== this.push_generation) return;
            if (!this.adapter.is_in_break_mode(this.session)) return;
            this.adapter.set_break_mode(this.session, resolved);
            await this.build_and_push(captured_generation);
        } catch (e) {
            this.logger.log(`error pushing debug state: ${e}`);
        }
    }

    private async build_and_push(captured_generation: number): Promise<void> {
        try {
            const state = await this.coordinator.build_debug_state(this.session);
            if (captured_generation !== this.push_generation) return;
            if (!this.adapter.is_in_break_mode(this.session)) return;
            const result = await this.coordinator.publish_state(this.session, state);
            if (!result.ok) this.logger.log(result.error.description);
        } catch (e) {
            this.logger.log(`error pushing debug state: ${e}`);
        }
    }

    private async clear(): Promise<void> {
        try {
            const result = await this.coordinator.clear_state(this.session);
            if (!result.ok) this.logger.log(result.error.description);
        } catch (e) {
            this.logger.log(`error clearing debug state: ${e}`);
        }
    }
}
