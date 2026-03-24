import { describe, it, expect, beforeEach } from "vitest";
import { session_manager } from "../session_manager.js";
import { debug_state_store } from "../debug_state_store.js";

describe("session_manager", () => {
    let mgr: session_manager;

    beforeEach(() => {
        mgr = new session_manager();
    });

    it("get_or_create_session creates a new session and returns a store", () => {
        const store = mgr.get_or_create_session("s1", "MyApp", "/app");
        expect(store).toBeInstanceOf(debug_state_store);
        expect(mgr.session_count).toBe(1);
    });

    it("get_or_create_session returns the same store for the same ID", () => {
        const a = mgr.get_or_create_session("s1", "MyApp", "/app");
        const b = mgr.get_or_create_session("s1");
        expect(a).toBe(b);
        expect(mgr.session_count).toBe(1);
    });

    it("session_count reflects the number of sessions", () => {
        expect(mgr.session_count).toBe(0);
        mgr.get_or_create_session("s1");
        mgr.get_or_create_session("s2");
        expect(mgr.session_count).toBe(2);
    });

    it("remove_session deletes a session", () => {
        mgr.get_or_create_session("s1");
        expect(mgr.session_count).toBe(1);
        mgr.remove_session("s1");
        expect(mgr.session_count).toBe(0);
    });

    describe("resolve_by_name_or_id", () => {
        it("resolves by exact session ID", () => {
            const store = mgr.get_or_create_session("s1", "MyApp");
            const result = mgr.resolve_by_name_or_id("s1");
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.store).toBe(store);
        });

        it("resolves by name (case insensitive)", () => {
            const store = mgr.get_or_create_session("s1", "MyApp");
            const result = mgr.resolve_by_name_or_id("myapp");
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.store).toBe(store);
        });

        it("returns ambiguous error when multiple sessions share the name", () => {
            mgr.get_or_create_session("s1", "App");
            mgr.get_or_create_session("s2", "App");
            const result = mgr.resolve_by_name_or_id("App");
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.description).toContain("ambiguous");
        });

        it("returns not found error for unknown query", () => {
            const result = mgr.resolve_by_name_or_id("nope");
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.description).toContain("not found");
        });
    });

    it("get_all_sessions returns session_info array", () => {
        mgr.get_or_create_session("s1", "App1", "/path1");
        mgr.get_or_create_session("s2", "App2", "/path2");

        const list = mgr.get_all_sessions();
        expect(list).toHaveLength(2);
        expect(list[0].session_id).toBe("s1");
        expect(list[0].name).toBe("App1");
        expect(list[0].solution_path).toBe("/path1");
        expect(list[0].has_debug_state).toBe(false);
        expect(list[0].connected_at).toBeTruthy();
        expect(list[0].last_seen).toBeTruthy();
    });

    it("get_stale_session_ids returns IDs of old sessions", () => {
        mgr.get_or_create_session("s1");
        mgr.get_or_create_session("s2");

        const stale = mgr.get_stale_session_ids(-1);
        expect(stale).toContain("s1");
        expect(stale).toContain("s2");

        const fresh = mgr.get_stale_session_ids(60_000);
        expect(fresh).toHaveLength(0);
    });
});
