import type { DebugSession } from "vscode";
import type { i_debugger_reader } from "../abstractions/i_debugger_reader";
import type { i_debug_state_publisher } from "../abstractions/i_debug_state_publisher";
import type { i_extension_logger } from "../abstractions/i_extension_logger";
import type { debug_state, result } from "../types";
import { empty_debug_state } from "../types";

/**
 * Single place for coalesced "pause → capture → push" so DAP tracker, UI stack focus, and polling
 * do not race or duplicate work.
 */
export class debug_event_coordinator {
    private push_generation = 0;

    constructor(
        private readonly reader: i_debugger_reader,
        private readonly publisher: i_debug_state_publisher,
        private readonly logger: i_extension_logger
    ) {}

    invalidate_in_flight_pushes(): void {
        this.push_generation++;
    }

    get current_push_generation(): number {
        return this.push_generation;
    }

    /**
     * Called when we believe the session may be paused (DAP stopped, UI stack item, or poll tick).
     * @param thread_hint `number` — optimistic thread from DAP stopped; `null` — use UI stack only; `undefined` — probe DAP for any paused thread.
     */
    async request_pause_push(
        session: DebugSession,
        thread_hint?: number | null,
        captured_generation?: number
    ): Promise<void> {
        const generation = captured_generation ?? this.push_generation;
        try {
            let resolve_hint: number | undefined;
            if (thread_hint === null) {
                const ui_tid = await this.reader.try_refresh_pause_from_ui_state(session);
                if (ui_tid === undefined) return;
                resolve_hint = ui_tid;
            } else if (thread_hint !== undefined) {
                this.reader.set_break_mode(session, thread_hint);
                resolve_hint = thread_hint;
            } else {
                const tid = await this.reader.probe_paused_thread_id(session);
                if (tid === undefined) return;
                this.reader.set_break_mode(session, tid);
                resolve_hint = tid;
            }

            if (generation !== this.push_generation) return;
            if (!this.reader.is_in_break_mode(session)) return;

            const resolved = await this.reader.resolve_stopped_thread_id(session, resolve_hint);
            if (generation !== this.push_generation) return;
            if (!this.reader.is_in_break_mode(session)) return;
            this.reader.set_break_mode(session, resolved);

            await this.build_and_publish_if_current(session, generation);
        } catch (e) {
            this.logger.log(`error pushing debug state: ${e}`);
        }
    }

    async build_and_publish_if_current(session: DebugSession, captured_generation: number): Promise<void> {
        try {
            const state = await this.build_debug_state(session);
            if (captured_generation !== this.push_generation) return;
            if (!this.reader.is_in_break_mode(session)) return;
            const result = await this.publisher.push_debug_state(state, session);
            if (!result.ok) this.logger.log(result.error.description);
        } catch (e) {
            this.logger.log(`error pushing debug state: ${e}`);
        }
    }

    async build_debug_state(session: DebugSession): Promise<debug_state> {
        const state = empty_debug_state(this.reader.is_in_break_mode(session));
        if (!state.is_in_break_mode) return state;

        const loc = await this.reader.read_current_location(session);
        if (loc.ok) state.current_location = loc.value;
        else this.logger.log(loc.error.description);

        const current_path = state.current_location?.file_path ?? null;
        const bps = await this.reader.read_breakpoints(session, current_path);
        if (bps.ok) state.breakpoints = bps.value;
        else this.logger.log(bps.error.description);

        const locals = await this.reader.read_locals(session);
        if (locals.ok) state.locals = locals.value;
        else this.logger.log(locals.error.description);

        const stack = await this.reader.read_call_stack(session);
        if (stack.ok) state.call_stack = stack.value;
        else this.logger.log(stack.error.description);

        return state;
    }

    async publish_state(session: DebugSession, state: debug_state): Promise<result> {
        return this.publisher.push_debug_state(state, session);
    }

    async clear_state(session?: DebugSession): Promise<result> {
        return this.publisher.clear_debug_state(session);
    }

    async register(): Promise<result> {
        return this.publisher.register_session();
    }

    async deregister(): Promise<result> {
        return this.publisher.deregister_session();
    }
}
