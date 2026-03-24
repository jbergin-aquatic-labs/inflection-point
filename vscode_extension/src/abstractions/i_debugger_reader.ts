import type { DebugSession } from "vscode";
import type { result, source_location, local_variable, stack_frame_info, breakpoint_info } from "../types";

export interface i_debugger_reader {
    set_break_mode(session: DebugSession, thread_id: number): void;
    clear_break_mode(session: DebugSession): void;
    is_in_break_mode(session: DebugSession): boolean;
    /**
     * When DAP "stopped" is missed, recover thread id from the Call Stack / focused frame (VS Code UI).
     * @returns thread id if the focused stack item belongs to this session.
     */
    try_refresh_pause_from_ui_state(session: DebugSession): Promise<number | undefined>;
    /**
     * Returns a thread id with stack frames if the session is paused, else undefined (no false default).
     */
    probe_paused_thread_id(session: DebugSession): Promise<number | undefined>;
    resolve_stopped_thread_id(session: DebugSession, hint?: number): Promise<number>;
    read_current_location(session: DebugSession): Promise<result<source_location>>;
    read_locals(session: DebugSession, max_depth?: number): Promise<result<local_variable[]>>;
    read_call_stack(session: DebugSession, max_frames?: number): Promise<result<stack_frame_info[]>>;
    read_breakpoints(
        session: DebugSession,
        current_file_hint?: string | null
    ): Promise<result<breakpoint_info[]>>;
}
