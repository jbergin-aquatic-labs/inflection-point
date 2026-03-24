import { describe, it, expect } from "vitest";
import {
    truncate_variable_value,
    paths_equal_for_breakpoint_hint,
    load_debug_capture_limits,
    default_debug_capture_limits,
} from "../debug_capture_limits";

describe("truncate_variable_value", () => {
    it("returns short strings unchanged", () => {
        expect(truncate_variable_value("hello", 100)).toBe("hello");
    });

    it("truncates long strings with suffix", () => {
        const long = "a".repeat(200);
        const result = truncate_variable_value(long, 50);
        expect(result.length).toBeLessThanOrEqual(50);
        expect(result).toContain("… [truncated]");
    });
});

describe("paths_equal_for_breakpoint_hint", () => {
    it("matches identical paths", () => {
        expect(paths_equal_for_breakpoint_hint("/src/main.ts", "/src/main.ts")).toBe(true);
    });

    it("matches paths differing only in case", () => {
        expect(paths_equal_for_breakpoint_hint("/Src/Main.ts", "/src/main.ts")).toBe(true);
    });

    it("matches backslash vs forward slash", () => {
        expect(paths_equal_for_breakpoint_hint("C:\\src\\main.ts", "C:/src/main.ts")).toBe(true);
    });

    it("rejects different paths", () => {
        expect(paths_equal_for_breakpoint_hint("/src/a.ts", "/src/b.ts")).toBe(false);
    });
});

describe("load_debug_capture_limits", () => {
    it("returns defaults when config returns fallbacks", () => {
        const config = { get: (_key: string, fallback: any) => fallback } as any;
        const limits = load_debug_capture_limits(config);
        expect(limits).toEqual(default_debug_capture_limits);
    });

    it("loads custom values from config", () => {
        const values: Record<string, number> = {
            "capture.max_local_depth": 4,
            "capture.max_variables_per_level": 500,
            "capture.max_total_local_nodes": 5000,
            "capture.max_value_length": 8192,
            "capture.max_stack_frames": 50,
            "capture.max_breakpoints": 300,
            "max_json_payload_chars": 3_000_000,
        };
        const config = { get: (key: string, fallback: any) => values[key] ?? fallback } as any;
        const limits = load_debug_capture_limits(config);
        expect(limits.max_local_depth).toBe(4);
        expect(limits.max_variables_per_level).toBe(500);
        expect(limits.max_total_local_nodes).toBe(5000);
        expect(limits.max_value_length).toBe(8192);
        expect(limits.max_stack_frames).toBe(50);
        expect(limits.max_breakpoints).toBe(300);
        expect(limits.max_json_payload_chars).toBe(3_000_000);
    });

    it("clamps out-of-range values", () => {
        const values: Record<string, number> = {
            "capture.max_local_depth": 999,
            "capture.max_variables_per_level": -10,
            "capture.max_stack_frames": 0,
        };
        const config = { get: (key: string, fallback: any) => values[key] ?? fallback } as any;
        const limits = load_debug_capture_limits(config);
        expect(limits.max_local_depth).toBe(6);
        expect(limits.max_variables_per_level).toBe(1);
        expect(limits.max_stack_frames).toBe(1);
    });
});
