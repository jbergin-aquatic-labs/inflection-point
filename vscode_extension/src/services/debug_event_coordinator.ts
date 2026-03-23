import type { DebugSession } from "vscode";
import type { i_debugger_reader } from "../abstractions/i_debugger_reader";
import type { i_debug_state_publisher } from "../abstractions/i_debug_state_publisher";
import type { i_extension_logger } from "../abstractions/i_extension_logger";
import type { debug_state, result } from "../types";
import { empty_debug_state } from "../types";

export class debug_event_coordinator {
    constructor(
        private readonly reader: i_debugger_reader,
        private readonly publisher: i_debug_state_publisher,
        private readonly logger: i_extension_logger
    ) {}

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
