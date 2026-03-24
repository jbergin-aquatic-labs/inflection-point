import { describe, it, expect, vi } from "vitest";
import type { DebugSession } from "vscode";
import { debug_event_coordinator } from "../services/debug_event_coordinator";
import { success } from "../types";
import type { i_debugger_reader } from "../abstractions/i_debugger_reader";
import type { i_debug_state_publisher } from "../abstractions/i_debug_state_publisher";
import type { i_extension_logger } from "../abstractions/i_extension_logger";

const mock_session = { id: "test-session" } as any as DebugSession;

function make_fake_reader(): i_debugger_reader {
    const break_modes = new Map<string, boolean>();
    return {
        set_break_mode: vi.fn((s: DebugSession, _tid: number) => {
            break_modes.set(s.id, true);
        }),
        clear_break_mode: vi.fn((s: DebugSession) => {
            break_modes.delete(s.id);
        }),
        is_in_break_mode: vi.fn((s: DebugSession) => break_modes.get(s.id) ?? false),
        try_refresh_pause_from_ui_state: vi.fn(async () => 1),
        probe_paused_thread_id: vi.fn(async () => 1),
        resolve_stopped_thread_id: vi.fn(async (_s, hint) => hint ?? 1),
        read_current_location: vi.fn(async () => success({
            file_path: "/src/test.ts",
            line: 10,
            column: 1,
            function_name: "test_fn",
            project_name: "test",
        })),
        read_locals: vi.fn(async () => success([])),
        read_call_stack: vi.fn(async () => success([])),
        read_breakpoints: vi.fn(async () => success([])),
    };
}

function make_fake_publisher(): i_debug_state_publisher {
    return {
        start_heartbeat: vi.fn(),
        stop_heartbeat: vi.fn(),
        register_session: vi.fn(async () => success()),
        push_debug_state: vi.fn(async () => success()),
        clear_debug_state: vi.fn(async () => success()),
        deregister_session: vi.fn(async () => success()),
        dispose: vi.fn(),
    };
}

function make_fake_logger(): i_extension_logger {
    return { log: vi.fn() };
}

describe("debug_event_coordinator", () => {
    it("invalidate_in_flight_pushes increments generation", () => {
        const coord = new debug_event_coordinator(make_fake_reader(), make_fake_publisher(), make_fake_logger());
        const gen0 = coord.current_push_generation;
        coord.invalidate_in_flight_pushes();
        expect(coord.current_push_generation).toBe(gen0 + 1);
    });

    it("request_pause_push with numeric thread_hint calls set_break_mode and pushes", async () => {
        const reader = make_fake_reader();
        const publisher = make_fake_publisher();
        const coord = new debug_event_coordinator(reader, publisher, make_fake_logger());

        await coord.request_pause_push(mock_session, 7);

        expect(reader.set_break_mode).toHaveBeenCalledWith(mock_session, 7);
        expect(publisher.push_debug_state).toHaveBeenCalled();
    });

    it("request_pause_push with null thread_hint calls try_refresh_pause_from_ui_state", async () => {
        const reader = make_fake_reader();
        const publisher = make_fake_publisher();
        const coord = new debug_event_coordinator(reader, publisher, make_fake_logger());

        await coord.request_pause_push(mock_session, null);

        expect(reader.try_refresh_pause_from_ui_state).toHaveBeenCalledWith(mock_session);
    });

    it("request_pause_push with undefined thread_hint calls probe_paused_thread_id", async () => {
        const reader = make_fake_reader();
        const publisher = make_fake_publisher();
        const coord = new debug_event_coordinator(reader, publisher, make_fake_logger());

        await coord.request_pause_push(mock_session, undefined);

        expect(reader.probe_paused_thread_id).toHaveBeenCalledWith(mock_session);
    });

    it("cancels push when generation becomes stale", async () => {
        const reader = make_fake_reader();
        const publisher = make_fake_publisher();
        const logger = make_fake_logger();
        const coord = new debug_event_coordinator(reader, publisher, logger);

        (reader.resolve_stopped_thread_id as any).mockImplementation(async () => {
            coord.invalidate_in_flight_pushes();
            return 1;
        });

        await coord.request_pause_push(mock_session, 1);

        expect(publisher.push_debug_state).not.toHaveBeenCalled();
    });

    it("register delegates to publisher.register_session", async () => {
        const publisher = make_fake_publisher();
        const coord = new debug_event_coordinator(make_fake_reader(), publisher, make_fake_logger());

        await coord.register();

        expect(publisher.register_session).toHaveBeenCalled();
    });

    it("deregister delegates to publisher.deregister_session", async () => {
        const publisher = make_fake_publisher();
        const coord = new debug_event_coordinator(make_fake_reader(), publisher, make_fake_logger());

        await coord.deregister();

        expect(publisher.deregister_session).toHaveBeenCalled();
    });
});
