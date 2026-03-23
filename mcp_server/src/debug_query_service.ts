import * as path from "node:path";
import type { session_manager } from "./session_manager.js";
import type { debug_state } from "./domain_types.js";
import { debug_state_store } from "./debug_state_store.js";
import * as fmt from "./compact_formatter.js";
import { read_source_lines } from "./source_file_reader.js";

type str_result = { ok: true; value: string } | { ok: false; description: string };

function ok(value: string): str_result {
    return { ok: true, value };
}
function err(description: string): str_result {
    return { ok: false, description };
}

export class debug_query_service {
    constructor(
        private readonly sessions: session_manager,
        private readonly read_lines: (p: string) => string[] | undefined = read_source_lines
    ) {}

    list_sessions(): str_result {
        const list = this.sessions.get_all_sessions();
        if (list.length === 0) return ok("No Visual Studio sessions connected.");
        const lines = [`${list.length} session(s):`];
        for (const s of list) {
            const status = s.has_debug_state ? "debugging" : "idle";
            lines.push(`  ${s.name} [${s.session_id}] (${status}) - ${s.solution_path}`);
        }
        return ok(lines.join("\n"));
    }

    get_debug_state(session: string, depth = 2): str_result {
        return this.bind_store(session, (store) => {
            const state = store.get_current_state();
            if (!state) return err("No debug state has been published for this session yet.");
            if (!state.is_in_break_mode) return err("The debugger is not stopped at a breakpoint.");
            const parts: string[] = [];
            if (state.current_location) {
                parts.push("[loc]", fmt.format_location(state.current_location));
            }
            if (state.locals.length > 0) {
                parts.push("[locals]", fmt.format_variables(state.locals, 0, depth));
            }
            if (state.call_stack.length > 0) {
                parts.push("[stack]", fmt.format_call_stack(state.call_stack));
            }
            return ok(parts.join("\n"));
        });
    }

    get_locals(session: string, depth = 2): str_result {
        return this.bind_break_state(session, (state) => {
            if (state.locals.length === 0) return ok("No local variables in the current scope.");
            return ok(`[locals]\n${fmt.format_variables(state.locals, 0, depth)}`);
        });
    }

    get_call_stack(session: string): str_result {
        return this.bind_break_state(session, (state) => {
            if (state.call_stack.length === 0) return ok("Call stack is empty.");
            return ok(`[stack]\n${fmt.format_call_stack(state.call_stack)}`);
        });
    }

    get_source_context(session: string): str_result {
        return this.bind_break_state(session, (state) => {
            if (!state.current_location) return err("No source location available.");
            return ok(this.format_source_context(state));
        });
    }

    get_breakpoints(session: string): str_result {
        return this.bind_store(session, (store) => {
            const state = store.get_current_state();
            if (!state) return err("No debug state has been published for this session yet.");
            if (state.breakpoints.length === 0) return ok("No breakpoints are set.");
            const lines = ["[breakpoints]"];
            for (const bp of state.breakpoints) {
                const st = bp.enabled ? "on" : "off";
                let line = `${path.basename(bp.file_path)}:${bp.line} (${st})`;
                if (bp.function_name) line += ` ${bp.function_name}`;
                if (bp.condition) line += ` when ${bp.condition}`;
                lines.push(line);
            }
            return ok(lines.join("\n"));
        });
    }

    get_expression_result(session: string, depth = 2): str_result {
        return this.bind_store(session, (store) => {
            const result = store.get_last_expression();
            if (!result) return err("No expression result available.");
            const valid = result.is_valid ? "" : " [!]";
            const lines = [`expr ${result.expression}:${result.type}=${result.value}${valid}`];
            if (result.members.length > 0) {
                lines.push(fmt.format_variables(result.members, 1, depth));
            }
            return ok(lines.join("\n"));
        });
    }

    explain_current_state(session: string): str_result {
        return this.bind_store(session, (store) => {
            const state = store.get_current_state();
            if (!state?.is_in_break_mode) {
                return err("No debug state has been published for this session yet.");
            }
            const parts: string[] = [];
            if (state.current_location) parts.push(this.format_source_context(state));
            parts.push("");
            if (state.locals.length === 0) parts.push("No local variables in the current scope.");
            else parts.push("[locals]", fmt.format_variables(state.locals, 0, 2));
            parts.push("");
            if (state.call_stack.length === 0) parts.push("Call stack is empty.");
            else parts.push("[stack]", fmt.format_call_stack(state.call_stack));
            const text = parts.join("\n").trim();
            if (!text) return err("No debug state has been published for this session yet.");
            return ok(text);
        });
    }

    get_breakpoint_history(session: string): str_result {
        return this.bind_store(session, (store) => {
            const history = store.get_history();
            if (history.length === 0) return err("No breakpoint history captured yet.");
            const lines: string[] = [];
            const total = store.total_captured;
            if (total > history.length) {
                lines.push(
                    `History (${history.length} of ${total} captured, showing #${history[0].index}..#${history[history.length - 1].index})`
                );
            } else {
                lines.push(`History (${history.length} snapshots)`);
            }
            for (const snap of history) {
                const loc = snap.state.current_location;
                const file = loc ? path.basename(loc.file_path) : "unknown";
                const line = loc?.line ?? 0;
                const fn = loc?.function_name ?? "unknown";
                const local_count = snap.state.locals.length;
                const time = snap.captured_at.includes("T")
                    ? snap.captured_at.split("T")[1]?.replace("Z", "").slice(0, 12) ?? snap.captured_at
                    : snap.captured_at;
                lines.push(`#${snap.index} [${time}] ${fn} (${file}:${line}) ${local_count} locals`);
            }
            return ok(lines.join("\n"));
        });
    }

    get_snapshot(index: number, session: string, detail = "full", depth = 2): str_result {
        return this.bind_store(session, (store) => {
            const snapshot = store.get_snapshot(index);
            if (!snapshot) {
                if (index >= 0 && index < store.total_captured) {
                    const h = store.get_history();
                    const oldest = h.length > 0 ? h[0].index : store.total_captured;
                    return err(
                        `Snapshot #${index} was evicted (history holds ${store.max_history_size}; oldest index now ~${oldest}).`
                    );
                }
                return err(`Snapshot #${index} not found.`);
            }
            const state = snapshot.state;
            const lines: string[] = [];
            const time = snapshot.captured_at;
            if (state.current_location) {
                lines.push(`#${snapshot.index} [${time}] ${fmt.format_location(state.current_location)}`);
            } else lines.push(`#${snapshot.index} [${time}]`);
            if (state.locals.length > 0) {
                lines.push("[locals]", fmt.format_variables(state.locals, 0, depth));
            }
            if (state.call_stack.length > 0) {
                lines.push("[stack]", fmt.format_call_stack(state.call_stack));
            }
            void detail;
            return ok(lines.join("\n"));
        });
    }

    explain_execution_flow(
        session: string,
        detail = "changes",
        depth = 1,
        start = 0,
        count = 0
    ): str_result {
        return this.bind_store(session, (store) => {
            const history = store.get_history();
            if (history.length === 0) return err("No breakpoint history captured yet.");
            let filtered = history.filter((s) => s.index >= start);
            if (count > 0) filtered = filtered.slice(0, count);
            const lines: string[] = [];
            const total = store.total_captured;
            const has_eviction = total > history.length;
            const has_pagination = count > 0 || start > 0;
            if (has_eviction || has_pagination) {
                const actual_start = filtered.length > 0 ? filtered[0].index : start;
                const total_label = has_eviction
                    ? `${history.length} of ${total} captured`
                    : `${history.length} total`;
                lines.push(`Trace (${total_label}, showing ${filtered.length} from #${actual_start})`);
            } else lines.push(`Trace (${filtered.length} snapshots)`);

            let prev_snap: (typeof filtered)[0] | undefined;
            for (const snap of filtered) {
                const state = snap.state;
                const loc = state.current_location;
                const file = loc ? path.basename(loc.file_path) : "unknown";
                const fn = loc?.function_name ?? "unknown";
                const line = loc?.line ?? 0;
                const time = snap.captured_at.slice(11, 23);
                lines.push(`#${snap.index} [${time}] ${fn} (${file}:${line})`);

                switch (detail) {
                    case "summary":
                        if (prev_snap) {
                            lines.push(
                                fmt.format_variable_change_summary(
                                    prev_snap.state.locals,
                                    state.locals
                                )
                            );
                        }
                        break;
                    case "full":
                        if (state.locals.length > 0) {
                            lines.push("[locals]", fmt.format_variables(state.locals, 0, depth));
                        }
                        if (state.call_stack.length > 0) {
                            lines.push("[stack]", fmt.format_call_stack(state.call_stack));
                        }
                        break;
                    default:
                        if (!prev_snap) {
                            if (state.locals.length > 0) {
                                lines.push("[locals]", fmt.format_variables(state.locals, 0, depth));
                            }
                            if (state.call_stack.length > 0) {
                                lines.push("[stack]", fmt.format_call_stack(state.call_stack));
                            }
                        } else {
                            lines.push(
                                fmt.format_variable_diff(
                                    prev_snap.state.locals,
                                    state.locals,
                                    depth
                                )
                            );
                            lines.push(
                                fmt.format_call_stack_diff(
                                    prev_snap.state.call_stack,
                                    state.call_stack
                                )
                            );
                        }
                }
                lines.push("");
                prev_snap = snap;
            }
            return ok(lines.join("\n"));
        });
    }

    private bind_store(session: string, fn: (store: debug_state_store) => str_result): str_result {
        const r = this.sessions.resolve_by_name_or_id(session);
        if (!r.ok) return err(r.description);
        return fn(r.store);
    }

    private bind_break_state(session: string, fn: (state: debug_state) => str_result): str_result {
        return this.bind_store(session, (store) => {
            const state = store.get_current_state();
            if (!state) return err("No debug state has been published for this session yet.");
            if (!state.is_in_break_mode) return err("The debugger is not stopped at a breakpoint.");
            return fn(state);
        });
    }

    private format_source_context(state: debug_state): string {
        const loc = state.current_location!;
        const file_path = loc.file_path;
        const lines = this.read_lines(file_path);
        if (!lines) return `Source file not accessible: ${file_path}`;
        const current_line = loc.line;
        const start_line = Math.max(1, current_line - 15);
        const end_line = Math.min(lines.length, current_line + 15);
        const out: string[] = [];
        out.push(`## Source: ${path.basename(file_path)}`);
        out.push(`**Function**: \`${loc.function_name}\``);
        out.push(`**Line ${current_line}** (showing ${start_line}-${end_line})`);
        out.push("");
        out.push("```");
        for (let i = start_line; i <= end_line; i++) {
            const prefix = i === current_line ? ">>> " : "    ";
            out.push(`${prefix}${String(i).padStart(4, " ")}: ${lines[i - 1] ?? ""}`);
        }
        out.push("```");
        return out.join("\n");
    }
}
