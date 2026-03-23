import {
    HttpDebugStatePublisher,
    shrinkDebugStateIfNeeded,
    type FetchFunction,
} from "../../../../src/PrinciPal.VsCodeExtension/src/adapters/HttpDebugStatePublisher";
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
        failCount: number;
    }>
): { fetch: FetchFunction; captured: CapturedRequest[] } {
    const captured: CapturedRequest[] = [];
    let callCount = 0;

    const mockFetch: FetchFunction = async (url, init) => {
        callCount++;
        captured.push({ url, init });
        if (overrides?.throwError && (overrides.failCount === undefined || callCount <= overrides.failCount)) {
            throw overrides.throwError;
        }
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

describe("shrinkDebugStateIfNeeded", () => {
    it("returns original state when under limit", () => {
        const state: DebugState = {
            isInBreakMode: true,
            currentLocation: null,
            locals: [{ name: "a", value: "1", type: "n", isValidValue: true, members: [] }],
            callStack: [],
            breakpoints: [],
        };
        const out = shrinkDebugStateIfNeeded(state, 10_000);
        expect(out).toBe(state);
    });
});

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

        it("replaces locals when JSON exceeds maxJsonPayloadChars", async () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT,
                SESSION_ID,
                SESSION_NAME,
                WORKSPACE_PATH,
                fetch,
                5000,
                0,
                30_000,
                () => 800
            );

            const big = "z".repeat(2000);
            const state: DebugState = {
                isInBreakMode: true,
                currentLocation: {
                    filePath: "test.ts",
                    line: 10,
                    column: 5,
                    functionName: "main",
                    projectName: "TestProject",
                },
                locals: [{ name: "blob", value: big, type: "string", isValidValue: true, members: [] }],
                callStack: [],
                breakpoints: [],
            };

            await publisher.pushDebugState(state);

            const body = JSON.parse(captured[0].init?.body as string);
            expect(body.locals[0].name).toBe("[princiPal]");
            expect(JSON.stringify(body).length).toBeLessThanOrEqual(800);
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
            const { fetch, captured } = createMockFetch({
                throwError: new TypeError("fetch failed: ECONNREFUSED"),
            });
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0
            );

            const result = await publisher.registerSession();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(ServerUnreachableError);
                expect(result.error.code).toBe("Server.Unreachable");
            }
            expect(captured).toHaveLength(3);
        });

        it("abort error returns RequestTimedOutError", async () => {
            const { fetch, captured } = createMockFetch({
                throwError: new DOMException("signal is aborted", "AbortError"),
            });
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0
            );

            const result = await publisher.registerSession();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(RequestTimedOutError);
                expect(result.error.code).toBe("Server.Timeout");
            }
            expect(captured).toHaveLength(3);
        });
    });

    describe("heartbeat", () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.useRealTimers();
        });

        it("startHeartbeat posts to register URL on tick", () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0, 1000
            );

            publisher.startHeartbeat();
            jest.advanceTimersByTime(1000);

            expect(captured).toHaveLength(1);
            expect(captured[0].url).toContain(`/api/sessions/${SESSION_ID}`);
            expect(captured[0].init?.method).toBe("POST");

            publisher.dispose();
        });

        it("stopHeartbeat cancels interval", () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0, 1000
            );

            publisher.startHeartbeat();
            jest.advanceTimersByTime(1000);
            const countAfterOneTick = captured.length;

            publisher.stopHeartbeat();
            jest.advanceTimersByTime(3000);

            expect(captured).toHaveLength(countAfterOneTick);

            publisher.dispose();
        });

        it("interval <= 0 never fires", () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0, 0
            );

            publisher.startHeartbeat();
            jest.advanceTimersByTime(5000);

            expect(captured).toHaveLength(0);

            publisher.dispose();
        });

        it("stopHeartbeat is safe to call when never started", () => {
            const { fetch } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0, 1000
            );

            // Should not throw
            expect(() => publisher.stopHeartbeat()).not.toThrow();
            publisher.dispose();
        });

        it("dispose clears heartbeat handle", () => {
            const { fetch, captured } = createMockFetch();
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0, 1000
            );

            publisher.startHeartbeat();
            publisher.dispose();
            jest.advanceTimersByTime(3000);

            expect(captured).toHaveLength(0);
        });
    });

    describe("retry behavior", () => {
        it("retries then succeeds on network error", async () => {
            const { fetch, captured } = createMockFetch({
                throwError: new TypeError("fetch failed: ECONNREFUSED"),
                failCount: 2,
            });
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0
            );

            const result = await publisher.registerSession();

            expect(result.ok).toBe(true);
            expect(captured).toHaveLength(3);
        });

        it("exhausts retries and returns failure", async () => {
            const { fetch, captured } = createMockFetch({
                throwError: new TypeError("fetch failed: ECONNREFUSED"),
            });
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0
            );

            const result = await publisher.registerSession();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(ServerUnreachableError);
            }
            expect(captured).toHaveLength(3);
        });

        it("deregister does not retry", async () => {
            const { fetch, captured } = createMockFetch({
                throwError: new TypeError("fetch failed: ECONNREFUSED"),
            });
            const publisher = new HttpDebugStatePublisher(
                PORT, SESSION_ID, SESSION_NAME, WORKSPACE_PATH, fetch, 5000, 0
            );

            const result = await publisher.deregisterSession();

            expect(result.ok).toBe(false);
            expect(captured).toHaveLength(1);
        });
    });
});
