import * as vscode from "vscode";
import type { i_debug_state_publisher } from "../abstractions/i_debug_state_publisher";
import type { debug_state, result } from "../types";
import { success, failure, server_unreachable_error, request_timed_out_error } from "../types";
import {
    workspace_session_identity_from_folder,
    type workspace_session_identity,
} from "../workspace_session_identity";

export type fetch_function = (url: string, init?: RequestInit) => Promise<Response>;
export type max_payload_chars_source = () => number;

export class http_debug_state_publisher implements i_debug_state_publisher {
    private readonly server_url: string;
    private readonly resolve_identity: (session?: vscode.DebugSession) => workspace_session_identity;
    private readonly fetch_fn: fetch_function;
    private readonly timeout_ms: number;
    private readonly retry_base_delay_ms: number;
    private readonly heartbeat_interval_ms: number;
    private readonly get_max_payload_chars: max_payload_chars_source;
    private abort_controller: AbortController | null = null;
    private heartbeat_handle: ReturnType<typeof setInterval> | null = null;

    constructor(
        port: number,
        resolve_identity: (session?: vscode.DebugSession) => workspace_session_identity,
        fetch_fn?: fetch_function,
        timeout_ms: number = 5000,
        retry_base_delay_ms: number = 500,
        heartbeat_interval_ms: number = 30_000,
        get_max_payload_chars?: max_payload_chars_source
    ) {
        this.resolve_identity = resolve_identity;
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
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            const id = this.resolve_identity(undefined);
            return this.register_one_identity(id);
        }
        if (folders.length === 1) {
            return this.register_one_identity(this.resolve_identity(undefined));
        }
        let last: result = success();
        for (const folder of folders) {
            const id = workspace_session_identity_from_folder(folder);
            const r = await this.register_one_identity(id);
            if (!r.ok) last = r;
        }
        return last;
    }

    async push_debug_state(state: debug_state, debug_session?: vscode.DebugSession): Promise<result> {
        const max_chars = this.get_max_payload_chars();
        const payload = shrink_debug_state_if_needed(state, max_chars);
        const body = JSON.stringify(payload);
        const { session_id, session_name, workspace_path } = this.resolve_identity(debug_session);
        const q = `name=${encodeURIComponent(session_name)}&path=${encodeURIComponent(workspace_path)}`;
        return this.send("push", () =>
            this.do_fetch(
                `${this.server_url}/api/sessions/${encodeURIComponent(session_id)}/debug-state?${q}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                }
            )
        );
    }

    async clear_debug_state(debug_session?: vscode.DebugSession): Promise<result> {
        const { session_id } = this.resolve_identity(debug_session);
        return this.send("clear", () =>
            this.do_fetch(
                `${this.server_url}/api/sessions/${encodeURIComponent(session_id)}/debug-state`,
                { method: "DELETE" }
            )
        );
    }

    async deregister_session(): Promise<result> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            const id = this.resolve_identity(undefined);
            return this.deregister_one_identity(id);
        }
        if (folders.length === 1) {
            return this.deregister_one_identity(this.resolve_identity(undefined));
        }
        let last: result = success();
        for (const folder of folders) {
            const id = workspace_session_identity_from_folder(folder);
            const r = await this.deregister_one_identity(id);
            if (!r.ok) last = r;
        }
        return last;
    }

    private async register_one_identity(id: workspace_session_identity): Promise<result> {
        const q = `name=${encodeURIComponent(id.session_name)}&path=${encodeURIComponent(id.workspace_path)}`;
        return this.send("register", () =>
            this.do_fetch(
                `${this.server_url}/api/sessions/${encodeURIComponent(id.session_id)}?${q}`,
                { method: "POST" }
            )
        );
    }

    private async deregister_one_identity(id: workspace_session_identity): Promise<result> {
        return this.send("deregister", () =>
            this.do_fetch(`${this.server_url}/api/sessions/${encodeURIComponent(id.session_id)}`, {
                method: "DELETE",
            }),
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
                name: "[inflection_point]",
                value:
                    "Debug state JSON exceeded inflection_point.max_json_payload_chars; locals replaced. Lower inflection_point.capture.* limits or increase max_json_payload_chars.",
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
                name: "[inflection_point]",
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
