import { HttpDebugStatePublisher, type FetchFunction } from "../../../../src/PrinciPal.VsCodeExtension/src/adapters/HttpDebugStatePublisher";
import type { DebugState } from "../../../../src/PrinciPal.VsCodeExtension/src/types";
import { ServerUnreachableError, RequestTimedOutError } from "../../../../src/PrinciPal.VsCodeExtension/src/types";

interface CapturedRequest {
    url: string;
    init: RequestInit | undefined;
}

function createMockFetch(
    overrides?: Partial<{
        throwError: Error;
        response: Partial<Response>;
    }>
): { fetch: FetchFunction; captured: CapturedRequest[] } {
    const captured: CapturedRequest[] = [];

    const mockFetch: FetchFunction = async (url, init) => {
        captured.push({ url, init });
        if (overrides?.throwError) throw overrides.throwError;
        return {
            ok: true,
            status: 200,
            ...overrides?.response,
        } as Response;
    };

    return { fetch: mockFetch, captured };
}

const SESSION_ID = "abc12345";
const SESSION_NAME = "TestProject";
const WORKSPACE_PATH = "/workspace/test";
const PORT = 9229;

describe("HttpDebugStatePublisher", () => {
    describe("registerSession", () => {
        it("posts to correct URL", async () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch
            );

            await publisher.registerSession();

            expect(captured).toHaveLength(1);
            expect(captured[0].url).toBe(
                `http://localhost:${PORT}/api/sessions/${SESSION_ID}?name=${encodeURIComponent(SESSION_NAME)}&path=${encodeURIComponent(WORKSPACE_PATH)}`
            );
            expect(captured[0].init?.method).toBe("POST");
        });
    });

    describe("pushDebugState", () => {
        it("posts JSON to correct URL", async () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch
            );

            const state: DebugState = {
                isInBreakMode: true,
                currentLocation: {
                    filePath: "test.ts",
                    line: 10,
                    column: 5,
                    functionName: "main",
                    projectName: "TestProject",
                },
                locals: [
                    { name: "x", value: "42", type: "number", isValidValue: true, members: [] },
                ],
                callStack: [],
                breakpoints: [],
            };

            await publisher.pushDebugState(state);

            expect(captured).toHaveLength(1);
            expect(captured[0].url).toContain(`/api/sessions/${SESSION_ID}/debug-state`);
            expect(captured[0].init?.method).toBe("POST");
            expect(captured[0].init?.headers).toEqual({
                "Content-Type": "application/json",
            });

            // Verify JSON is camelCase
            const body = JSON.parse(captured[0].init?.body as string);
            expect(body.isInBreakMode).toBe(true);
            expect(body.currentLocation.filePath).toBe("test.ts");
            expect(body.locals[0].name).toBe("x");
        });
    });

    describe("clearDebugState", () => {
        it("deletes correct URL", async () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch
            );

            await publisher.clearDebugState();

            expect(captured).toHaveLength(1);
            expect(captured[0].url).toBe(
                `http://localhost:${PORT}/api/sessions/${SESSION_ID}/debug-state`
            );
            expect(captured[0].init?.method).toBe("DELETE");
        });
    });

    describe("deregisterSession", () => {
        it("deletes correct URL", async () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch
            );

            await publisher.deregisterSession();

            expect(captured).toHaveLength(1);
            expect(captured[0].url).toBe(
                `http://localhost:${PORT}/api/sessions/${SESSION_ID}`
            );
            expect(captured[0].init?.method).toBe("DELETE");
        });
    });

    describe("error handling", () => {
        it("network error returns ServerUnreachableError", async () => {
            const { fetch } = createMockFetch({
                throwError: new TypeError("fetch failed: ECONNREFUSED"),
            });
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch
            );

            const result = await publisher.registerSession();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(ServerUnreachableError);
                expect(result.error.code).toBe("Server.Unreachable");
            }
        });

        it("abort error returns RequestTimedOutError", async () => {
            const { fetch } = createMockFetch({
                throwError: new DOMException("signal is aborted", "AbortError"),
            });
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch
            );

            const result = await publisher.registerSession();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(RequestTimedOutError);
                expect(result.error.code).toBe("Server.Timeout");
            }
        });
    });
});
