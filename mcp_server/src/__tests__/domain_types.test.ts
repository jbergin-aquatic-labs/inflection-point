import { describe, it, expect } from "vitest";
import { empty_debug_state } from "../domain_types.js";

describe("empty_debug_state", () => {
    it("returns a state with is_in_break_mode=false by default", () => {
        const state = empty_debug_state();
        expect(state.is_in_break_mode).toBe(false);
        expect(state.current_location).toBeNull();
        expect(state.locals).toEqual([]);
        expect(state.call_stack).toEqual([]);
        expect(state.breakpoints).toEqual([]);
    });

    it("returns a state with is_in_break_mode=true when passed true", () => {
        const state = empty_debug_state(true);
        expect(state.is_in_break_mode).toBe(true);
        expect(state.current_location).toBeNull();
        expect(state.locals).toEqual([]);
        expect(state.call_stack).toEqual([]);
        expect(state.breakpoints).toEqual([]);
    });

    it("returns distinct objects on each call", () => {
        const a = empty_debug_state();
        const b = empty_debug_state();
        expect(a).not.toBe(b);
        expect(a.locals).not.toBe(b.locals);
    });
});
