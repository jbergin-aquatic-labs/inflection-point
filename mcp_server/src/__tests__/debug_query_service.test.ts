import { describe, it, expect, beforeEach } from "vitest";
import { debug_query_service } from "../debug_query_service.js";
import { session_manager } from "../session_manager.js";
import { empty_debug_state } from "../domain_types.js";
import type { debug_state } from "../domain_types.js";

function make_break_state(line: number): debug_state {
    const s = empty_debug_state(true);
    s.current_location = {
        file_path: "/src/app.cs",
        line,
        column: 1,
        function_name: "Run",
        project_name: "TestProj",
    };
    return s;
}

function fake_read_lines(_path: string): string[] | undefined {
    return Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
}

describe("debug_query_service", () => {
    let mgr: session_manager;
    let svc: debug_query_service;

    beforeEach(() => {
        mgr = new session_manager();
        svc = new debug_query_service(mgr, fake_read_lines);
    });

    describe("list_sessions", () => {
        it("returns message when no sessions exist", () => {
            const r = svc.list_sessions();
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toContain("No debugger sessions");
        });

        it("lists connected sessions", () => {
            mgr.get_or_create_session("s1", "App1", "/path");
            const r = svc.list_sessions();
            expect(r.ok).toBe(true);
            if (r.ok) {
                expect(r.value).toContain("1 session(s)");
                expect(r.value).toContain("App1");
                expect(r.value).toContain("get_agent_capabilities");
            }
        });
    });

    describe("get_debug_state", () => {
        it("returns error when no state published", () => {
            mgr.get_or_create_session("s1", "App");
            const r = svc.get_debug_state("s1");
            expect(r.ok).toBe(false);
        });

        it("returns error when not in break mode", () => {
            const store = mgr.get_or_create_session("s1", "App");
            store.update(empty_debug_state(false));
            const r = svc.get_debug_state("s1");
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.description).toContain("not stopped");
        });

        it("returns formatted state when in break mode", () => {
            const store = mgr.get_or_create_session("s1", "App");
            const state = make_break_state(10);
            state.locals = [{ name: "x", value: "1", type: "int", is_valid_value: true, members: [] }];
            store.update(state);
            const r = svc.get_debug_state("s1");
            expect(r.ok).toBe(true);
            if (r.ok) {
                expect(r.value).toContain("[loc]");
                expect(r.value).toContain("[locals]");
            }
        });
    });

    describe("get_locals", () => {
        it("returns locals for a session in break mode", () => {
            const store = mgr.get_or_create_session("s1", "App");
            const state = make_break_state(5);
            state.locals = [{ name: "a", value: "42", type: "int", is_valid_value: true, members: [] }];
            store.update(state);
            const r = svc.get_locals("s1");
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toContain("a:int=42");
        });
    });

    describe("get_call_stack", () => {
        it("returns call stack for a session in break mode", () => {
            const store = mgr.get_or_create_session("s1", "App");
            const state = make_break_state(5);
            state.call_stack = [
                { index: 0, function_name: "Run", module: "m", language: "C#", file_path: "/src/app.cs", line: 5 },
            ];
            store.update(state);
            const r = svc.get_call_stack("s1");
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toContain("Run");
        });
    });

    describe("get_breakpoints", () => {
        it("returns breakpoints", () => {
            const store = mgr.get_or_create_session("s1", "App");
            const state = make_break_state(5);
            state.breakpoints = [
                { file_path: "/src/app.cs", line: 10, column: 0, function_name: "", enabled: true, condition: "" },
            ];
            store.update(state);
            const r = svc.get_breakpoints("s1");
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toContain("app.cs:10");
        });
    });

    describe("get_source_context", () => {
        it("returns source lines around the current location", () => {
            const store = mgr.get_or_create_session("s1", "App");
            store.update(make_break_state(25));
            const r = svc.get_source_context("s1");
            expect(r.ok).toBe(true);
            if (r.ok) {
                expect(r.value).toContain(">>> ");
                expect(r.value).toContain("line 25");
            }
        });
    });

    describe("get_breakpoint_history", () => {
        it("returns history after multiple break hits", () => {
            const store = mgr.get_or_create_session("s1", "App");
            store.update(make_break_state(1));
            store.update(make_break_state(2));
            const r = svc.get_breakpoint_history("s1");
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toContain("2 snapshots");
        });
    });

    describe("get_snapshot", () => {
        it("returns a specific snapshot by index", () => {
            const store = mgr.get_or_create_session("s1", "App");
            store.update(make_break_state(1));
            store.update(make_break_state(2));
            const r = svc.get_snapshot(1, "s1");
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toContain("#1");
        });
    });

    describe("session not found", () => {
        it("returns error for unknown session", () => {
            const r = svc.get_debug_state("nonexistent");
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.description).toContain("not found");
        });
    });
});
