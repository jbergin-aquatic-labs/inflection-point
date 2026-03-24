import { describe, it, expect } from "vitest";
import * as crypto from "node:crypto";
import {
    workspace_session_identity_from_folder,
    create_workspace_session_identity_resolver,
} from "../workspace_session_identity";

describe("workspace_session_identity_from_folder", () => {
    it("returns session_id as first 8 chars of sha256 of lowercased path", () => {
        const folder = {
            uri: { fsPath: "/path/to/project" },
            name: "project",
            index: 0,
        } as any;

        const result = workspace_session_identity_from_folder(folder);

        const expected_hash = crypto
            .createHash("sha256")
            .update("/path/to/project")
            .digest("hex")
            .substring(0, 8);

        expect(result.session_id).toBe(expected_hash);
        expect(result.session_name).toBe("project");
        expect(result.workspace_path).toBe("/path/to/project");
    });
});

describe("create_workspace_session_identity_resolver", () => {
    it("returns fallback when no session and no workspace folders", () => {
        const fallback = {
            session_id: "fallback",
            session_name: "none",
            workspace_path: "/tmp",
        };

        const resolve = create_workspace_session_identity_resolver(fallback);
        const result = resolve(undefined);

        expect(result).toBe(fallback);
    });
});
