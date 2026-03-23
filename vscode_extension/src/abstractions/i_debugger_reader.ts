import type { DebugSession } from "vscode";
import type { result, source_location, local_variable, stack_frame_info, breakpoint_info } from "../types";

export interface i_debugger_reader {
    is_in_break_mode(session: DebugSession): boolean;
    read_current_location(session: DebugSession): Promise<result<source_location>>;
    read_locals(session: DebugSession, max_depth?: number): Promise<result<local_variable[]>>;
    read_call_stack(session: DebugSession, max_frames?: number): Promise<result<stack_frame_info[]>>;
    read_breakpoints(
        session: DebugSession,
        current_file_hint?: string | null
    ): Promise<result<breakpoint_info[]>>;
}
