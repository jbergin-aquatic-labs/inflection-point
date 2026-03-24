import { debug_state_store } from "./debug_state_store.js";
import type { session_info } from "./domain_types.js";

type session_entry = {
    store: debug_state_store;
    info: {
        session_id: string;
        name: string;
        solution_path: string;
        connected_at: Date;
        last_seen: Date;
    };
};

/**
 * `mode` "open": agent may start any name in `available` except those in `blocked`.
 * `mode` "strict": agent may start only names in `allowed`.
 */
type launch_control_state = {
    available: string[];
    mode: "open" | "strict";
    blocked: string[];
    allowed: string[];
};

export type resolve_store_result =
    | { ok: true; store: debug_state_store }
    | { ok: false; description: string };

/**
 * Multi-session registry (port of C# SessionManager).
 */
export class session_manager {
    private readonly sessions = new Map<string, session_entry>();
    private readonly launch_by_session = new Map<string, launch_control_state>();

    get session_count(): number {
        return this.sessions.size;
    }

    get_or_create_session(
        session_id: string,
        name?: string | null,
        solution_path?: string | null
    ): debug_state_store {
        const now = new Date();
        let entry = this.sessions.get(session_id);
        if (!entry) {
            entry = {
                store: new debug_state_store(),
                info: {
                    session_id,
                    name: name ?? "",
                    solution_path: solution_path ?? "",
                    connected_at: now,
                    last_seen: now,
                },
            };
            this.sessions.set(session_id, entry);
        } else {
            if (name && !entry.info.name) entry.info.name = name;
            if (solution_path && !entry.info.solution_path) entry.info.solution_path = solution_path;
            entry.info.last_seen = new Date();
        }
        return entry.store;
    }

    get_session(session_id: string): debug_state_store | undefined {
        return this.sessions.get(session_id)?.store;
    }

    remove_session(session_id: string): void {
        this.sessions.delete(session_id);
        this.launch_by_session.delete(session_id);
    }

    resolve_by_name_or_id(query: string): resolve_store_result {
        const exact = this.sessions.get(query);
        if (exact) return { ok: true, store: exact.store };

        const matches = [...this.sessions.values()].filter((e) =>
            e.info.name.toLowerCase() === query.toLowerCase()
        );
        if (matches.length === 1) return { ok: true, store: matches[0].store };
        if (matches.length > 1) {
            const lines = matches.map(
                (m) => `  ${m.info.name} [${m.info.session_id}] - ${m.info.solution_path}`
            );
            return {
                ok: false,
                description: `Session "${query}" is ambiguous. Matches:\n${lines.join("\n")}`,
            };
        }
        return { ok: false, description: `Session not found: ${query}` };
    }

    /** Workspace session id (8-char hash) for agent commands / long-poll. */
    resolve_session_id(query: string): string | undefined {
        const r = this.resolve_by_name_or_id(query);
        if (!r.ok) return undefined;
        for (const [id, e] of this.sessions) {
            if (e.store === r.store) return id;
        }
        return undefined;
    }

    get_all_sessions(): session_info[] {
        const result: session_info[] = [];
        for (const entry of this.sessions.values()) {
            const state = entry.store.get_current_state();
            result.push({
                session_id: entry.info.session_id,
                name: entry.info.name,
                solution_path: entry.info.solution_path,
                connected_at: entry.info.connected_at.toISOString(),
                last_seen: entry.info.last_seen.toISOString(),
                has_debug_state: !!state?.is_in_break_mode,
            });
        }
        return result;
    }

    get_stale_session_ids(timeout_ms: number): string[] {
        const cutoff = Date.now() - timeout_ms;
        return [...this.sessions.entries()]
            .filter(([, e]) => e.info.last_seen.getTime() < cutoff)
            .map(([id]) => id);
    }

    set_launch_sync(session_id: string, available: string[]): void {
        const prev = this.launch_by_session.get(session_id);
        this.launch_by_session.set(session_id, {
            available: [...available],
            mode: prev?.mode ?? "open",
            blocked: prev?.blocked ?? [],
            allowed: prev?.allowed ?? [],
        });
    }

    set_launch_policy(
        session_id: string,
        mode: "open" | "strict",
        blocked: string[],
        allowed: string[]
    ): void {
        const prev = this.launch_by_session.get(session_id);
        this.launch_by_session.set(session_id, {
            available: prev?.available ?? [],
            mode,
            blocked: [...blocked],
            allowed: [...allowed],
        });
    }

    get_launch_control(session_id: string): launch_control_state | undefined {
        return this.launch_by_session.get(session_id);
    }

    is_launch_allowed_for_agent(session_id: string, name: string): boolean {
        const st = this.launch_by_session.get(session_id);
        if (!st || st.available.length === 0) return false;
        if (!st.available.includes(name)) return false;
        if (st.mode === "open") return !st.blocked.includes(name);
        return st.allowed.includes(name);
    }
}
