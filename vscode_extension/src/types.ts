export interface i_error {
    readonly code: string;
    readonly description: string;
}

export type result<T = void> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: i_error };

export function success(): result<void>;
export function success<T>(value: T): result<T>;
export function success<T>(value?: T): result<T> {
    return { ok: true, value: value as T };
}

export function failure(error: i_error): result<any> {
    return { ok: false, error };
}

export class server_unreachable_error implements i_error {
    readonly code = "server.unreachable";
    readonly description: string;
    constructor(url: string, detail: string) {
        this.description = `MCP server not reachable at ${url}. ${detail}`;
    }
}

export class request_timed_out_error implements i_error {
    readonly code = "server.timeout";
    readonly description: string;
    constructor(action: string) {
        this.description = `${action} request timed out.`;
    }
}

export class debug_read_error implements i_error {
    readonly code = "extension.debug_read_failed";
    readonly description: string;
    constructor(component: string, detail?: string) {
        this.description = detail
            ? `Error reading ${component}: ${detail}`
            : `Error reading ${component} from the debugger.`;
    }
}

export class server_binary_not_found_error implements i_error {
    readonly code = "server.binary_not_found";
    readonly description: string;
    constructor(detail: string) {
        this.description = `MCP server script not found. ${detail}`;
    }
}

export class lock_held_error implements i_error {
    readonly code = "server.lock_held";
    readonly description: string;
    constructor(port: number, pid: number) {
        this.description = `Lock for port ${port} is held by PID ${pid}.`;
    }
}

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

export interface debug_state {
    is_in_break_mode: boolean;
    current_location: source_location | null;
    locals: local_variable[];
    call_stack: stack_frame_info[];
    breakpoints: breakpoint_info[];
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
