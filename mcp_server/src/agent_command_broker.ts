import { randomUUID } from "node:crypto";

export type agent_command_kind =
    | "start_debugging"
    | "add_editor_breakpoint"
    | "remove_editor_breakpoint"
    | "debug_continue";

export type agent_command = {
    id: string;
    kind: agent_command_kind;
    payload: Record<string, unknown>;
};

type in_flight_entry = {
    resolve: (value: unknown) => void;
};

/**
 * Queues commands from MCP for the extension to execute; resolves MCP-side promises when the extension posts results.
 */
export class agent_command_broker {
    private readonly queues = new Map<string, agent_command[]>();
    private readonly poll_waiters = new Map<string, Array<(cmd: agent_command) => void>>();
    private readonly in_flight = new Map<string, in_flight_entry>();

    /**
     * Enqueue a command. Call `abandon(command_id)` if you time out client-side so a late extension reply does not resolve a stale promise.
     */
    post_command(
        session_id: string,
        kind: agent_command_kind,
        payload: Record<string, unknown>
    ): { command_id: string; done: Promise<unknown> } {
        const id = randomUUID();
        const command: agent_command = { id, kind, payload };
        const done = new Promise((resolve) => {
            this.in_flight.set(id, { resolve });
            const q = this.queues.get(session_id) ?? [];
            q.push(command);
            this.queues.set(session_id, q);
            this.flush_waiters(session_id);
        });
        return { command_id: id, done };
    }

    /** Remove queued command and settle its promise so callers do not hang if they race on `done` after timeout. */
    abandon(command_id: string): void {
        const entry = this.in_flight.get(command_id);
        if (entry) {
            entry.resolve({ ok: false, error: "abandoned (client timeout)" });
            this.in_flight.delete(command_id);
        }
        for (const [sid, q] of this.queues) {
            const idx = q.findIndex((c) => c.id === command_id);
            if (idx >= 0) {
                q.splice(idx, 1);
                if (q.length === 0) this.queues.delete(sid);
                return;
            }
        }
    }

    /**
     * Long-poll: return the next command for this session, or null after timeout_ms.
     */
    wait_for_command(session_id: string, timeout_ms: number): Promise<agent_command | null> {
        const q = this.queues.get(session_id);
        if (q && q.length > 0) {
            const cmd = q.shift()!;
            if (q.length === 0) this.queues.delete(session_id);
            return Promise.resolve(cmd);
        }
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.remove_waiter(session_id, deliver);
                resolve(null);
            }, timeout_ms);

            const deliver = (cmd: agent_command) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.remove_waiter(session_id, deliver);
                resolve(cmd);
            };

            const list = this.poll_waiters.get(session_id) ?? [];
            list.push(deliver);
            this.poll_waiters.set(session_id, list);
        });
    }

    complete_command(command_id: string, body: unknown): boolean {
        const entry = this.in_flight.get(command_id);
        if (!entry) return false;
        entry.resolve(body ?? { ok: true });
        this.in_flight.delete(command_id);
        return true;
    }

    fail_command(command_id: string, message: string): boolean {
        const entry = this.in_flight.get(command_id);
        if (!entry) return false;
        entry.resolve({ ok: false, error: message });
        this.in_flight.delete(command_id);
        return true;
    }

    private flush_waiters(session_id: string): void {
        const q = this.queues.get(session_id);
        const waiters = this.poll_waiters.get(session_id);
        if (!q?.length || !waiters?.length) return;
        while (q.length > 0 && waiters.length > 0) {
            const cmd = q.shift()!;
            const w = waiters.shift()!;
            w(cmd);
        }
        if (q.length === 0) this.queues.delete(session_id);
        if (waiters.length === 0) this.poll_waiters.delete(session_id);
    }

    private remove_waiter(session_id: string, fn: (cmd: agent_command) => void): void {
        const list = this.poll_waiters.get(session_id);
        if (!list) return;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
        if (list.length === 0) this.poll_waiters.delete(session_id);
    }
}
