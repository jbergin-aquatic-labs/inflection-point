import type { WorkspaceConfiguration } from "vscode";

export interface debug_capture_limits {
    readonly max_local_depth: number;
    readonly max_variables_per_level: number;
    readonly max_total_local_nodes: number;
    readonly max_value_length: number;
    readonly max_stack_frames: number;
    readonly max_breakpoints: number;
    readonly max_json_payload_chars: number;
}

export const default_debug_capture_limits: debug_capture_limits = {
    max_local_depth: 2,
    max_variables_per_level: 200,
    max_total_local_nodes: 1200,
    max_value_length: 4096,
    max_stack_frames: 12,
    max_breakpoints: 150,
    max_json_payload_chars: 1_500_000,
};

function clamp_int(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function load_debug_capture_limits(config: WorkspaceConfiguration): debug_capture_limits {
    return {
        max_local_depth: clamp_int(
            config.get<number>("capture.max_local_depth", default_debug_capture_limits.max_local_depth),
            0,
            6,
            default_debug_capture_limits.max_local_depth
        ),
        max_variables_per_level: clamp_int(
            config.get<number>(
                "capture.max_variables_per_level",
                default_debug_capture_limits.max_variables_per_level
            ),
            1,
            2000,
            default_debug_capture_limits.max_variables_per_level
        ),
        max_total_local_nodes: clamp_int(
            config.get<number>(
                "capture.max_total_local_nodes",
                default_debug_capture_limits.max_total_local_nodes
            ),
            10,
            50_000,
            default_debug_capture_limits.max_total_local_nodes
        ),
        max_value_length: clamp_int(
            config.get<number>("capture.max_value_length", default_debug_capture_limits.max_value_length),
            128,
            1_000_000,
            default_debug_capture_limits.max_value_length
        ),
        max_stack_frames: clamp_int(
            config.get<number>("capture.max_stack_frames", default_debug_capture_limits.max_stack_frames),
            1,
            200,
            default_debug_capture_limits.max_stack_frames
        ),
        max_breakpoints: clamp_int(
            config.get<number>("capture.max_breakpoints", default_debug_capture_limits.max_breakpoints),
            1,
            10_000,
            default_debug_capture_limits.max_breakpoints
        ),
        max_json_payload_chars: clamp_int(
            config.get<number>(
                "max_json_payload_chars",
                default_debug_capture_limits.max_json_payload_chars
            ),
            50_000,
            20_000_000,
            default_debug_capture_limits.max_json_payload_chars
        ),
    };
}

export function truncate_variable_value(value: string, max_len: number): string {
    if (value.length <= max_len) return value;
    const suffix = "… [truncated]";
    const take = Math.max(0, max_len - suffix.length);
    return value.slice(0, take) + suffix;
}

export function paths_equal_for_breakpoint_hint(a: string, b: string): boolean {
    if (a === b) return true;
    const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    return norm(a) === norm(b);
}
