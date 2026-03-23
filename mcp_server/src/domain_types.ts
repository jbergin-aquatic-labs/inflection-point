/** JSON / domain shapes (snake_case keys on the wire). */

export interface source_location {
    file_path: string;
    line: number;
    column: number;
    function_name: string;
    project_name: string;
}

export interface local_variable {
    name: string;
    value: string;
    type: string;
    is_valid_value: boolean;
    members: local_variable[];
}

export interface stack_frame_info {
    index: number;
    function_name: string;
    module: string;
    language: string;
    file_path: string;
    line: number;
}

export interface breakpoint_info {
    file_path: string;
    line: number;
    column: number;
    function_name: string;
    enabled: boolean;
    condition: string;
}

export interface expression_result {
    expression: string;
    value: string;
    type: string;
    is_valid: boolean;
    members: local_variable[];
}

export interface debug_state {
    is_in_break_mode: boolean;
    current_location: source_location | null;
    locals: local_variable[];
    call_stack: stack_frame_info[];
    breakpoints: breakpoint_info[];
}

export interface session_info {
    session_id: string;
    name: string;
    solution_path: string;
    connected_at: string;
    last_seen: string;
    has_debug_state: boolean;
}

export interface debug_state_snapshot {
    index: number;
    captured_at: string;
    state: debug_state;
}

export function empty_debug_state(is_in_break_mode: boolean = false): debug_state {
    return {
        is_in_break_mode,
        current_location: null,
        locals: [],
        call_stack: [],
        breakpoints: [],
    };
}
