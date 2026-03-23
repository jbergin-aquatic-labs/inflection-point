import * as vscode from "vscode";
import type { i_debugger_reader } from "../abstractions/i_debugger_reader";
import type { result, source_location, local_variable, stack_frame_info, breakpoint_info } from "../types";
import { success, failure, debug_read_error } from "../types";
import {
    type debug_capture_limits,
    default_debug_capture_limits,
    truncate_variable_value,
    paths_equal_for_breakpoint_hint,
} from "../debug_capture_limits";

type get_limits = () => debug_capture_limits;

export class vscode_debugger_adapter implements i_debugger_reader {
    private readonly break_by_session = new Map<string, { thread_id: number }>();
    private readonly get_limits_fn: get_limits;

    constructor(get_limits_fn?: get_limits) {
        this.get_limits_fn = get_limits_fn ?? (() => default_debug_capture_limits);
    }

    set_break_mode(session: vscode.DebugSession, thread_id: number): void {
        this.break_by_session.set(session.id, { thread_id });
    }

    clear_break_mode(session: vscode.DebugSession): void {
        this.break_by_session.delete(session.id);
    }

    is_in_break_mode(session: vscode.DebugSession): boolean {
        return this.break_by_session.has(session.id);
    }

    /**
     * Some adapters omit threadId on stopped events; a wrong hint (e.g. default 1) yields empty stack reads.
     */
    async resolve_stopped_thread_id(session: vscode.DebugSession, hint?: number): Promise<number> {
        const hint_ok =
            hint !== undefined && hint !== null && !Number.isNaN(hint)
                ? await this.thread_has_stack_frames(session, hint)
                : false;
        if (hint_ok) return hint as number;
        try {
            const r = await session.customRequest("threads", {});
            const threads = (r.threads as { id: number }[]) ?? [];
            for (const t of threads) {
                if (await this.thread_has_stack_frames(session, t.id)) return t.id;
            }
        } catch {
            /* fall through */
        }
        return hint !== undefined && hint !== null && !Number.isNaN(hint) ? hint : 1;
    }

    private async thread_has_stack_frames(session: vscode.DebugSession, thread_id: number): Promise<boolean> {
        try {
            const st = await session.customRequest("stackTrace", {
                threadId: thread_id,
                startFrame: 0,
                levels: 1,
            });
            const frames = st.stackFrames as unknown[] | undefined;
            return Array.isArray(frames) && frames.length > 0;
        } catch {
            return false;
        }
    }

    private thread_id_for(session: vscode.DebugSession): number {
        return this.break_by_session.get(session.id)?.thread_id ?? 1;
    }

    private limits(): debug_capture_limits {
        return this.get_limits_fn();
    }

    async read_current_location(session: vscode.DebugSession): Promise<result<source_location>> {
        try {
            const thread_id = this.thread_id_for(session);
            const response = await session.customRequest("stackTrace", {
                threadId: thread_id,
                startFrame: 0,
                levels: 1,
            });
            const frames = response.stackFrames as dap_stack_frame[];
            if (!frames?.length) {
                return failure(new debug_read_error("current_location", "no stack frames available."));
            }
            const top = frames[0];
            return success<source_location>({
                file_path: top.source?.path ?? top.source?.name ?? "",
                line: top.line,
                column: top.column ?? 0,
                function_name: top.name,
                project_name: session.name,
            });
        } catch (e) {
            return failure(new debug_read_error("current_location", String(e)));
        }
    }

    async read_locals(session: vscode.DebugSession, max_depth?: number): Promise<result<local_variable[]>> {
        const lim = this.limits();
        const depth = max_depth ?? lim.max_local_depth;
        try {
            const thread_id = this.thread_id_for(session);
            const stack_resp = await session.customRequest("stackTrace", {
                threadId: thread_id,
                startFrame: 0,
                levels: 1,
            });
            const frames = stack_resp.stackFrames as dap_stack_frame[];
            if (!frames?.length) {
                return failure(new debug_read_error("locals", "no stack frames available."));
            }
            const scopes_resp = await session.customRequest("scopes", { frameId: frames[0].id });
            const scopes = scopes_resp.scopes as dap_scope[];
            const locals_scope =
                scopes.find((s) => s.name === "Locals" || s.name === "Local") ?? scopes[0];
            if (!locals_scope) return success<local_variable[]>([]);

            const counters = { total_nodes: 0 };
            const variables = await this.expand_variables(
                session,
                locals_scope.variablesReference,
                depth,
                0,
                counters,
                lim
            );
            return success(variables);
        } catch (e) {
            return failure(new debug_read_error("locals", String(e)));
        }
    }

    private async expand_variables(
        session: vscode.DebugSession,
        variables_reference: number,
        max_depth: number,
        current_depth: number,
        counters: { total_nodes: number },
        limits: debug_capture_limits
    ): Promise<local_variable[]> {
        if (counters.total_nodes >= limits.max_total_local_nodes) return [];

        const resp = await session.customRequest("variables", { variablesReference: variables_reference });
        const dap_vars = (resp.variables as dap_variable[]) ?? [];
        const slice = dap_vars.slice(0, limits.max_variables_per_level);
        const skipped = dap_vars.length - slice.length;
        const result: local_variable[] = [];

        for (const v of slice) {
            if (counters.total_nodes >= limits.max_total_local_nodes) break;
            counters.total_nodes++;

            const truncated = truncate_variable_value(v.value ?? "", limits.max_value_length);
            let members: local_variable[] = [];
            if (v.variablesReference > 0 && current_depth < max_depth) {
                members = await this.expand_variables(
                    session,
                    v.variablesReference,
                    max_depth,
                    current_depth + 1,
                    counters,
                    limits
                );
            }
            result.push({
                name: v.name,
                value: truncated,
                type: v.type ?? "",
                is_valid_value: true,
                members,
            });
        }
        if (skipped > 0) {
            result.push({
                name: `… (+${skipped} more at this level)`,
                value: "",
                type: "inflection_point.capped",
                is_valid_value: true,
                members: [],
            });
        }
        return result;
    }

    async read_call_stack(
        session: vscode.DebugSession,
        max_frames?: number
    ): Promise<result<stack_frame_info[]>> {
        const lim = this.limits();
        const levels = max_frames ?? lim.max_stack_frames;
        try {
            const thread_id = this.thread_id_for(session);
            const response = await session.customRequest("stackTrace", {
                threadId: thread_id,
                startFrame: 0,
                levels,
            });
            const frames = response.stackFrames as dap_stack_frame[];
            const stack: stack_frame_info[] = frames.map((f, i) => ({
                index: i,
                function_name: f.name,
                module: f.source?.name ?? "",
                language: "",
                file_path: f.source?.path ?? "",
                line: f.line,
            }));
            return success(stack);
        } catch (e) {
            return failure(new debug_read_error("call_stack", String(e)));
        }
    }

    async read_breakpoints(
        _session: vscode.DebugSession,
        current_file_hint?: string | null
    ): Promise<result<breakpoint_info[]>> {
        const max = this.limits().max_breakpoints;
        try {
            const bps = vscode.debug.breakpoints;
            const result: breakpoint_info[] = [];
            for (const bp of bps) {
                if (is_source_breakpoint(bp)) {
                    result.push({
                        file_path: bp.location.uri.fsPath,
                        line: bp.location.range.start.line + 1,
                        column: bp.location.range.start.character + 1,
                        function_name: "",
                        enabled: bp.enabled,
                        condition: bp.condition ?? "",
                    });
                }
            }
            if (result.length <= max) return success(result);

            const hint = current_file_hint?.trim() ?? "";
            const prioritized =
                hint.length > 0
                    ? [
                          ...result.filter((b) => paths_equal_for_breakpoint_hint(b.file_path, hint)),
                          ...result.filter((b) => !paths_equal_for_breakpoint_hint(b.file_path, hint)),
                      ]
                    : result;

            const kept_for_real = Math.max(0, max - 1);
            const capped = prioritized.slice(0, kept_for_real);
            const omitted = result.length - capped.length;
            capped.push({
                file_path: "(inflection_point)",
                line: 0,
                column: 0,
                function_name: `+${omitted} breakpoints omitted`,
                enabled: false,
                condition: "raise inflection_point.capture.max_breakpoints to send more.",
            });
            return success(capped);
        } catch (e) {
            return failure(new debug_read_error("breakpoints", String(e)));
        }
    }
}

function is_source_breakpoint(bp: vscode.Breakpoint): bp is vscode.SourceBreakpoint {
    return "location" in bp;
}

interface dap_stack_frame {
    id: number;
    name: string;
    line: number;
    column?: number;
    source?: { name?: string; path?: string };
}

interface dap_scope {
    name: string;
    variablesReference: number;
}

interface dap_variable {
    name: string;
    value: string;
    type?: string;
    variablesReference: number;
}
