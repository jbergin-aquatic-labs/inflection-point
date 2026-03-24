import { describe, it, expect } from "vitest";
import {
    success,
    failure,
    empty_debug_state,
    server_unreachable_error,
    request_timed_out_error,
    debug_read_error,
    server_binary_not_found_error,
    lock_held_error,
} from "../types";

describe("success", () => {
    it("returns ok with undefined value when called with no arguments", () => {
        const r = success();
        expect(r).toEqual({ ok: true, value: undefined });
    });

    it("returns ok with the provided value", () => {
        const r = success(42);
        expect(r).toEqual({ ok: true, value: 42 });
    });
});

describe("failure", () => {
    it("returns not-ok with the provided error", () => {
        const err = { code: "test", description: "boom" };
        const r = failure(err);
        expect(r).toEqual({ ok: false, error: err });
    });
});

describe("empty_debug_state", () => {
    it("defaults to is_in_break_mode=false with empty collections", () => {
        const s = empty_debug_state();
        expect(s).toEqual({
            is_in_break_mode: false,
            current_location: null,
            locals: [],
            call_stack: [],
            breakpoints: [],
        });
    });

    it("accepts is_in_break_mode=true", () => {
        const s = empty_debug_state(true);
        expect(s.is_in_break_mode).toBe(true);
    });
});

describe("error classes", () => {
    it("server_unreachable_error", () => {
        const e = new server_unreachable_error("http://localhost:9999", "refused");
        expect(e.code).toBe("server.unreachable");
        expect(e.description).toContain("http://localhost:9999");
        expect(e.description).toContain("refused");
    });

    it("request_timed_out_error", () => {
        const e = new request_timed_out_error("push");
        expect(e.code).toBe("server.timeout");
        expect(e.description).toBe("push request timed out.");
    });

    it("debug_read_error with detail", () => {
        const e = new debug_read_error("locals", "session gone");
        expect(e.code).toBe("extension.debug_read_failed");
        expect(e.description).toBe("Error reading locals: session gone");
    });

    it("debug_read_error without detail", () => {
        const e = new debug_read_error("call_stack");
        expect(e.description).toBe("Error reading call_stack from the debugger.");
    });

    it("server_binary_not_found_error", () => {
        const e = new server_binary_not_found_error("missing binary");
        expect(e.code).toBe("server.binary_not_found");
        expect(e.description).toContain("missing binary");
    });

    it("lock_held_error", () => {
        const e = new lock_held_error(3000, 12345);
        expect(e.code).toBe("server.lock_held");
        expect(e.description).toContain("3000");
        expect(e.description).toContain("12345");
    });
});
