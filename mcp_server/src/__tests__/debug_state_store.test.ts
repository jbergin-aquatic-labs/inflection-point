import { describe, it, expect } from "vitest";
import { debug_state_store } from "../debug_state_store.js";
import { empty_debug_state } from "../domain_types.js";
import type { debug_state, expression_result } from "../domain_types.js";

function make_break_state(line: number): debug_state {
    const s = empty_debug_state(true);
    s.current_location = {
        file_path: "/src/app.ts",
        line,
        column: 1,
        function_name: "main",
        project_name: "app",
    };
    return s;
}

describe("debug_state_store", () => {
    it("update() stores state and adds to history when is_in_break_mode=true", () => {
        const store = new debug_state_store();
        const state = make_break_state(10);
        store.update(state);

        expect(store.get_current_state()).toBe(state);
        expect(store.get_history()).toHaveLength(1);
        expect(store.get_history()[0].state).toBe(state);
        expect(store.total_captured).toBe(1);
    });

    it("update() with is_in_break_mode=false stores state but does not add to history", () => {
        const store = new debug_state_store();
        const state = empty_debug_state(false);
        store.update(state);

        expect(store.get_current_state()).toBe(state);
        expect(store.get_history()).toHaveLength(0);
        expect(store.total_captured).toBe(0);
    });

    it("evicts oldest entries when exceeding max_history_size", () => {
        const store = new debug_state_store();
        store.max_history_size = 3;

        for (let i = 0; i < 5; i++) {
            store.update(make_break_state(i + 1));
        }

        const history = store.get_history();
        expect(history).toHaveLength(3);
        expect(history[0].index).toBe(2);
        expect(history[1].index).toBe(3);
        expect(history[2].index).toBe(4);
        expect(store.total_captured).toBe(5);
    });

    it("get_snapshot() returns correct snapshot by index", () => {
        const store = new debug_state_store();
        store.update(make_break_state(1));
        store.update(make_break_state(2));

        const snap = store.get_snapshot(1);
        expect(snap).toBeDefined();
        expect(snap!.index).toBe(1);
        expect(snap!.state.current_location!.line).toBe(2);
    });

    it("get_snapshot() returns undefined for missing index", () => {
        const store = new debug_state_store();
        expect(store.get_snapshot(99)).toBeUndefined();
    });

    it("total_captured increments independently of eviction", () => {
        const store = new debug_state_store();
        store.max_history_size = 2;

        for (let i = 0; i < 10; i++) {
            store.update(make_break_state(i));
        }

        expect(store.total_captured).toBe(10);
        expect(store.get_history()).toHaveLength(2);
    });

    it("clear() clears current_state but not history", () => {
        const store = new debug_state_store();
        store.update(make_break_state(1));
        expect(store.get_current_state()).toBeDefined();
        expect(store.get_history()).toHaveLength(1);

        store.clear();
        expect(store.get_current_state()).toBeUndefined();
        expect(store.get_history()).toHaveLength(1);
    });

    it("clear_history() clears history array", () => {
        const store = new debug_state_store();
        store.update(make_break_state(1));
        store.update(make_break_state(2));
        expect(store.get_history()).toHaveLength(2);

        store.clear_history();
        expect(store.get_history()).toHaveLength(0);
        expect(store.get_current_state()).toBeDefined();
    });

    it("update_expression() and get_last_expression()", () => {
        const store = new debug_state_store();
        expect(store.get_last_expression()).toBeUndefined();

        const expr: expression_result = {
            expression: "x + 1",
            value: "42",
            type: "int",
            is_valid: true,
            members: [],
        };
        store.update_expression(expr);
        expect(store.get_last_expression()).toBe(expr);
    });
});
