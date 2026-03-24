import { describe, it, expect } from "vitest";
import { shrink_debug_state_if_needed } from "../adapters/http_debug_state_publisher";
import { empty_debug_state } from "../types";
import type { local_variable } from "../types";

function make_large_local(size_chars: number): local_variable {
    return {
        name: "big",
        value: "x".repeat(size_chars),
        type: "string",
        is_valid_value: true,
        members: [],
    };
}

describe("shrink_debug_state_if_needed", () => {
    it("returns the state as-is when under the limit", () => {
        const state = empty_debug_state(true);
        const result = shrink_debug_state_if_needed(state, 1_000_000);
        expect(result).toBe(state);
    });

    it("replaces locals and trims stack/breakpoints when over limit", () => {
        const state = {
            ...empty_debug_state(true),
            locals: Array.from({ length: 50 }, () => make_large_local(10_000)),
            call_stack: Array.from({ length: 20 }, (_, i) => ({
                index: i,
                function_name: `fn_${i}`,
                module: "mod",
                language: "typescript",
                file_path: "/src/test.ts",
                line: i + 1,
            })),
            breakpoints: Array.from({ length: 100 }, (_, i) => ({
                file_path: "/src/test.ts",
                line: i,
                column: 0,
                function_name: "",
                enabled: true,
                condition: "",
            })),
        };

        const result = shrink_debug_state_if_needed(state, 5000);
        expect(result.locals).toHaveLength(1);
        expect(result.locals[0].name).toBe("[inflection_point]");
        expect(result.call_stack.length).toBeLessThanOrEqual(8);
        expect(result.breakpoints.length).toBeLessThanOrEqual(40);
    });

    it("performs emergency shrink when first shrink is still over limit", () => {
        const state = {
            ...empty_debug_state(true),
            locals: Array.from({ length: 50 }, () => make_large_local(10_000)),
            call_stack: Array.from({ length: 20 }, (_, i) => ({
                index: i,
                function_name: `fn_${"z".repeat(500)}`,
                module: "mod",
                language: "typescript",
                file_path: "/src/test.ts",
                line: i + 1,
            })),
            breakpoints: Array.from({ length: 100 }, (_, i) => ({
                file_path: "/src/" + "z".repeat(500) + ".ts",
                line: i,
                column: 0,
                function_name: "",
                enabled: true,
                condition: "",
            })),
        };

        const result = shrink_debug_state_if_needed(state, 200);
        expect(result.locals).toHaveLength(1);
        expect(result.locals[0].value).toContain("emergency shrink");
        expect(result.call_stack).toEqual([]);
        expect(result.breakpoints).toEqual([]);
    });
});
