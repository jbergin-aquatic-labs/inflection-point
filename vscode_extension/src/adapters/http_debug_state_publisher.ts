import type { i_debug_state_publisher } from "../abstractions/i_debug_state_publisher";
import type { debug_state, result } from "../types";
import { success, failure, server_unreachable_error, request_timed_out_error } from "../types";

export type fetch_function = (url: string, init?: RequestInit) => Promise<Response>;
export type max_payload_chars_source = () => number;

export class http_debug_state_publisher implements i_debug_state_publisher {
    private readonly server_url: string;
    private readonly session_id: string;
    private readonly session_query_params: string;
    private readonly fetch_fn: fetch_function;
    private readonly timeout_ms: number;
    private readonly retry_base_delay_ms: number;
    private readonly heartbeat_interval_ms: number;
    private readonly get_max_payload_chars: max_payload_chars_source;
    private abort_controller: AbortController | null = null;
    private heartbeat_handle: ReturnType<typeof setInterval> | null = null;

    constructor(
        port: number,
        session_id: string,
        session_name: string,
        workspace_path: string,
        fetch_fn?: fetch_function,
        timeout_ms: number = 5000,
        retry_base_delay_ms: number = 500,
        heartbeat_interval_ms: number = 30_000,
        get_max_payload_chars?: max_payload_chars_source
    ) {
        this.session_id = session_id;
        this.session_query_params = `name=${encodeURIComponent(session_name)}&path=${encodeURIComponent(workspace_path)}`;
        this.server_url = `http://127.0.0.1:${port}`;
        this.fetch_fn = fetch_fn ?? globalThis.fetch.bind(globalThis);
        this.timeout_ms = timeout_ms;
        this.retry_base_delay_ms = retry_base_delay_ms;
        this.heartbeat_interval_ms = heartbeat_interval_ms;
        this.get_max_payload_chars = get_max_payload_chars ?? (() => 1_500_000);
    }

    start_heartbeat(): void {
        if (this.heartbeat_interval_ms <= 0) return;
        this.heartbeat_handle = setInterval(
            () => void this.register_session(),
            this.heartbeat_interval_ms
        );
    }

    stop_heartbeat(): void {
        if (this.heartbeat_handle !== null) {
            clearInterval(this.heartbeat_handle);
            this.heartbeat_handle = null;
        }
    }

    async register_session(): Promise<result> {
        return this.send("register", () =>
            this.do_fetch(
                `${this.server_url}/api/sessions/${encodeURIComponent(this.session_id)}?${this.session_query_params}`,
                { method: "POST" }
            )
        );
    }

    async push_debug_state(state: debug_state): Promise<result> {
        const max_chars = this.get_max_payload_chars();
        const payload = shrink_debug_state_if_needed(state, max_chars);
        const body = JSON.stringify(payload);
        return this.send("push", () =>
            this.do_fetch(
                `${this.server_url}/api/sessions/${encodeURIComponent(this.session_id)}/debug-state?${this.session_query_params}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                }
            )
        );
    }

    async clear_debug_state(): Promise<result> {
        return this.send("clear", () =>
            this.do_fetch(
                `${this.server_url}/api/sessions/${encodeURIComponent(this.session_id)}/debug-state`,
                { method: "DELETE" }
            )
        );
    }

    async deregister_session(): Promise<result> {
        return this.send("deregister", () =>
            this.do_fetch(
                `${this.server_url}/api/sessions/${encodeURIComponent(this.session_id)}`,
                { method: "DELETE" }
            ),
            1
        );
    }

    dispose(): void {
        this.stop_heartbeat();
        this.abort_controller?.abort();
    }

    private async do_fetch(url: string, init: RequestInit): Promise<Response> {
        this.abort_controller = new AbortController();
        const timeout_id = setTimeout(() => this.abort_controller?.abort(), this.timeout_ms);
        try {
            return await this.fetch_fn(url, { ...init, signal: this.abort_controller.signal });
        } finally {
            clearTimeout(timeout_id);
        }
    }

    private async send(
        action: string,
        request: () => Promise<Response>,
        max_attempts: number = 3
    ): Promise<result> {
        for (let attempt = 0; attempt < max_attempts; attempt++) {
            try {
                await request();
                return success();
            } catch (e: unknown) {
                const is_retryable =
                    is_network_error(e) || (e instanceof DOMException && e.name === "AbortError");

                if (is_retryable && attempt + 1 < max_attempts) {
                    await sleep(compute_delay(attempt, this.retry_base_delay_ms));
                    continue;
                }

                if (e instanceof DOMException && e.name === "AbortError") {
                    return failure(new request_timed_out_error(action));
                }
                return failure(new server_unreachable_error(this.server_url, String(e)));
            }
        }
        return failure(new server_unreachable_error(this.server_url, "max retries exhausted"));
    }
}

function is_network_error(e: unknown): boolean {
    if (e instanceof TypeError) return true;
    if (e instanceof Error && e.message.includes("ECONNREFUSED")) return true;
    return false;
}

function compute_delay(attempt: number, base_delay_ms: number): number {
    const jitter = Math.floor(Math.random() * (base_delay_ms + 1));
    return base_delay_ms * (1 << attempt) + jitter;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shrink_debug_state_if_needed(state: debug_state, max_chars: number): debug_state {
    let candidate = state;
    let serialized = JSON.stringify(candidate);
    if (serialized.length <= max_chars) return candidate;

    candidate = {
        ...state,
        locals: [
            {
                name: "[principal]",
                value:
                    "Debug state JSON exceeded principal.max_json_payload_chars; locals replaced. Lower principal.capture.* limits or increase max_json_payload_chars.",
                type: "notice",
                is_valid_value: true,
                members: [],
            },
        ],
        call_stack: state.call_stack.slice(0, 8),
        breakpoints: state.breakpoints.slice(0, 40),
    };
    serialized = JSON.stringify(candidate);
    if (serialized.length <= max_chars) return candidate;

    return {
        is_in_break_mode: state.is_in_break_mode,
        current_location: state.current_location,
        locals: [
            {
                name: "[principal]",
                value: "payload still exceeds limit after emergency shrink.",
                type: "notice",
                is_valid_value: true,
                members: [],
            },
        ],
        call_stack: [],
        breakpoints: [],
    };
}
