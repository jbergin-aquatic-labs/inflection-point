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

export type resolve_store_result =
    | { ok: true; store: debug_state_store }
    | { ok: false; description: string };

/**
 * Multi-session registry (port of C# SessionManager).
 */
export class session_manager {
    private readonly sessions = new Map<string, session_entry>();

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
}
