import * as path from "node:path";
import type { local_variable, stack_frame_info, source_location } from "./domain_types.js";

export function format_variables(
    vars: local_variable[],
    indent: number,
    max_depth: number
): string {
    const lines: string[] = [];
    format_variables_inner(lines, vars, indent, max_depth);
    return lines.join("\n");
}

function format_variables_inner(
    lines: string[],
    vars: local_variable[],
    indent: number,
    max_depth: number
): void {
    const prefix = " ".repeat(indent * 2);
    for (const v of vars) {
        const invalid = v.is_valid_value ? "" : " [!]";
        let depth_marker = "";
        if (max_depth <= 0 && v.members.length > 0) {
            depth_marker = ` [+${v.members.length}]`;
        }
        lines.push(
            `${prefix}${indent > 0 ? "." : ""}${v.name}:${v.type}=${v.value}${invalid}${depth_marker}`
        );
        if (v.members.length > 0 && max_depth > 0) {
            format_variables_inner(lines, v.members, indent + 1, max_depth - 1);
        }
    }
}

export function format_call_stack(frames: stack_frame_info[]): string {
    const lines: string[] = [];
    for (const frame of frames) {
        const loc = frame.file_path
            ? `(${path.basename(frame.file_path)}:${frame.line})`
            : "[ext]";
        lines.push(`${frame.index}: ${frame.function_name} ${loc}`);
    }
    return lines.join("\n");
}

export function format_location(loc: source_location): string {
    const file = path.basename(loc.file_path);
    return `@ ${loc.function_name} (${file}:${loc.line}) [${loc.project_name}]`;
}

function build_variable_map(vars: local_variable[]): Map<string, local_variable> {
    const m = new Map<string, local_variable>();
    for (const v of vars) m.set(v.name, v);
    return m;
}

function variables_equal(a: local_variable, b: local_variable, max_depth: number): boolean {
    if (
        a.name !== b.name ||
        a.type !== b.type ||
        a.value !== b.value ||
        a.is_valid_value !== b.is_valid_value
    ) {
        return false;
    }
    if (max_depth <= 0) return true;
    if (a.members.length !== b.members.length) return false;
    for (let i = 0; i < a.members.length; i++) {
        if (!variables_equal(a.members[i], b.members[i], max_depth - 1)) return false;
    }
    return true;
}

function format_changed_variable(prev: local_variable, curr: local_variable, max_depth: number): string {
    const invalid = curr.is_valid_value ? "" : " [!]";
    const parts: string[] = [];
    if (prev.value !== curr.value) {
        parts.push(`${curr.name}:${curr.type}=${curr.value}${invalid} (was ${prev.value})`);
    } else {
        parts.push(`${curr.name}:${curr.type}=${curr.value}${invalid}`);
    }
    if (max_depth > 0 && (prev.members.length > 0 || curr.members.length > 0)) {
        const prev_m = build_variable_map(prev.members);
        const curr_m = build_variable_map(curr.members);
        for (const [k, cv] of curr_m) {
            const pv = prev_m.get(k);
            const m_inv = cv.is_valid_value ? "" : " [!]";
            if (pv) {
                if (!variables_equal(pv, cv, max_depth - 1)) {
                    parts.push(
                        `  .${cv.name}:${cv.type}=${cv.value}${m_inv} (was ${pv.value})`
                    );
                }
            } else {
                parts.push(`  .${cv.name}:${cv.type}=${cv.value}${m_inv} [new]`);
            }
        }
        for (const k of prev_m.keys()) {
            if (!curr_m.has(k)) parts.push(`  .${k} [removed]`);
        }
    }
    return parts.join("\n");
}

export function format_variable_diff(
    prev: local_variable[],
    curr: local_variable[],
    max_depth: number
): string {
    const prev_map = build_variable_map(prev);
    const curr_map = build_variable_map(curr);
    const changed: string[] = [];
    const new_vars: string[] = [];
    const removed: string[] = [];

    for (const [k, v] of curr_map) {
        const p = prev_map.get(k);
        if (p) {
            if (!variables_equal(p, v, max_depth)) changed.push(format_changed_variable(p, v, max_depth));
        } else {
            new_vars.push(format_variables([v], 0, max_depth).trimEnd());
        }
    }
    for (const [k, v] of prev_map) {
        if (!curr_map.has(k)) removed.push(`${k}:${v.type}`);
    }
    const lines: string[] = [];
    if (changed.length) {
        lines.push("[changed]");
        changed.forEach((c) => lines.push(c));
    }
    if (new_vars.length) {
        lines.push("[new]");
        new_vars.forEach((n) => lines.push(n));
    }
    if (removed.length) {
        lines.push("[removed]");
        removed.forEach((r) => lines.push(r));
    }
    return lines.join("\n");
}

function call_stacks_equal(a: stack_frame_info[], b: stack_frame_info[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (
            a[i].function_name !== b[i].function_name ||
            a[i].file_path !== b[i].file_path ||
            a[i].line !== b[i].line
        ) {
            return false;
        }
    }
    return true;
}

export function format_call_stack_diff(prev: stack_frame_info[], curr: stack_frame_info[]): string {
    if (call_stacks_equal(prev, curr)) return "[stack unchanged]";
    return "[stack]\n" + format_call_stack(curr);
}

export function format_variable_change_summary(prev: local_variable[], curr: local_variable[]): string {
    const prev_map = build_variable_map(prev);
    const curr_map = build_variable_map(curr);
    const changed: string[] = [];
    const new_vars: string[] = [];
    const removed: string[] = [];
    for (const [k, v] of curr_map) {
        const p = prev_map.get(k);
        if (p) {
            if (!variables_equal(p, v, 2)) changed.push(k);
        } else new_vars.push(k);
    }
    for (const k of prev_map.keys()) {
        if (!curr_map.has(k)) removed.push(k);
    }
    const parts: string[] = [];
    if (changed.length) parts.push(`changed: ${changed.join(", ")}`);
    if (new_vars.length) parts.push(`new: ${new_vars.join(", ")}`);
    if (removed.length) parts.push(`removed: ${removed.join(", ")}`);
    return parts.length ? parts.join(" | ") : "[no changes]";
}
