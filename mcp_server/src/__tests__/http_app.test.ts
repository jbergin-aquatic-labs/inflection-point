import { describe, it, expect, beforeEach } from "vitest";
import supertest from "supertest";
import { create_app } from "../http_app.js";
import { session_manager } from "../session_manager.js";
import { debug_query_service } from "../debug_query_service.js";
import { agent_command_broker } from "../agent_command_broker.js";
import { agent_control_service } from "../agent_control_service.js";
import { empty_debug_state } from "../domain_types.js";

describe("http_app REST routes", () => {
    let mgr: session_manager;
    let app: ReturnType<typeof create_app>;

    beforeEach(() => {
        mgr = new session_manager();
        const query = new debug_query_service(mgr);
        const broker = new agent_command_broker();
        const agent_control = new agent_control_service(mgr, broker);
        app = create_app(mgr, query, broker, agent_control);
    });

    it("GET /api/health returns running status", async () => {
        const res = await supertest(app).get("/api/health");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "running" });
    });

    it("POST /api/sessions/:id registers a session", async () => {
        const res = await supertest(app)
            .post("/api/sessions/s1?name=App&path=/proj");
        expect(res.status).toBe(200);
        expect(mgr.session_count).toBe(1);
    });

    it("GET /api/sessions returns the session list", async () => {
        mgr.get_or_create_session("s1", "App", "/proj");
        const res = await supertest(app).get("/api/sessions");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].session_id).toBe("s1");
    });

    it("POST /api/sessions/:id/debug-state pushes state", async () => {
        mgr.get_or_create_session("s1", "App");
        const state = empty_debug_state(true);
        const res = await supertest(app)
            .post("/api/sessions/s1/debug-state")
            .send(state);
        expect(res.status).toBe(200);

        const store = mgr.get_session("s1");
        expect(store?.get_current_state()?.is_in_break_mode).toBe(true);
    });

    it("GET /api/sessions/:id/debug-state/history returns history", async () => {
        const store = mgr.get_or_create_session("s1", "App");
        const state = empty_debug_state(true);
        state.current_location = {
            file_path: "/src/a.cs", line: 1, column: 0,
            function_name: "F", project_name: "P",
        };
        store.update(state);

        const res = await supertest(app)
            .get("/api/sessions/s1/debug-state/history");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].index).toBe(0);
    });

    it("DELETE /api/sessions/:id removes session", async () => {
        mgr.get_or_create_session("s1", "App");
        const res = await supertest(app).delete("/api/sessions/s1");
        expect(res.status).toBe(200);
        expect(mgr.session_count).toBe(0);
    });

    it("GET /about returns service info", async () => {
        const res = await supertest(app).get("/about");
        expect(res.status).toBe(200);
        expect(res.body.service).toBe("inflection_point_mcp_server");
        expect(res.body.health).toBe("/api/health");
    });
});
