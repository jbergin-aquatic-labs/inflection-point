import { describe, it, expect, beforeEach } from "vitest";
import { session_manager } from "../session_manager.js";
import { agent_command_broker } from "../agent_command_broker.js";
import { agent_control_service } from "../agent_control_service.js";

describe("agent_control_service", () => {
    let mgr: session_manager;
    let broker: agent_command_broker;
    let svc: agent_control_service;

    beforeEach(() => {
        mgr = new session_manager();
        broker = new agent_command_broker();
        svc = new agent_control_service(mgr, broker);
    });

    it("describe_capabilities returns ok with MCP tool names", () => {
        const r = svc.describe_capabilities();
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value).toContain("get_agent_capabilities");
            expect(r.value).toContain("start_debugging");
            expect(r.value).toContain("add_editor_breakpoint");
            expect(r.value).toContain("agent-commands/next");
        }
    });

    it("list_launch_configs errors when session missing", () => {
        const r = svc.list_launch_configs("nope");
        expect(r.ok).toBe(false);
    });
});
