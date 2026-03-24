import { describe, it, expect } from "vitest";
import { normalize_dap_event_message } from "../dap_message";

describe("normalize_dap_event_message", () => {
    it("normalizes a well-formed object", () => {
        const result = normalize_dap_event_message({
            type: "event",
            event: "stopped",
            body: { reason: "breakpoint" },
        });
        expect(result).toEqual({
            type: "event",
            event: "stopped",
            body: { reason: "breakpoint" },
        });
    });

    it("parses a JSON string input", () => {
        const json = JSON.stringify({ type: "event", event: "stopped", body: {} });
        const result = normalize_dap_event_message(json);
        expect(result).toEqual({ type: "event", event: "stopped", body: {} });
    });

    it("returns undefined when type is missing", () => {
        expect(normalize_dap_event_message({ event: "stopped" })).toBeUndefined();
    });

    it("returns undefined for null", () => {
        expect(normalize_dap_event_message(null)).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
        expect(normalize_dap_event_message(undefined)).toBeUndefined();
    });

    it("returns undefined for a number", () => {
        expect(normalize_dap_event_message(42)).toBeUndefined();
    });

    it("returns undefined for invalid JSON string", () => {
        expect(normalize_dap_event_message("{bad json")).toBeUndefined();
    });

    it("normalizes casing of type and event", () => {
        const result = normalize_dap_event_message({
            type: "Event",
            event: "Stopped",
        });
        expect(result).toEqual({ type: "event", event: "stopped", body: undefined });
    });

    it("returns event as undefined when event field is absent", () => {
        const result = normalize_dap_event_message({ type: "response" });
        expect(result).toEqual({ type: "response", event: undefined, body: undefined });
    });
});
