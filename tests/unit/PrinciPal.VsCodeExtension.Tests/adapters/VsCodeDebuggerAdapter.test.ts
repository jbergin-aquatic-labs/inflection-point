import { VsCodeDebuggerAdapter } from "../../../../src/PrinciPal.VsCodeExtension/src/adapters/VsCodeDebuggerAdapter";
import { defaultDebugCaptureLimits } from "../../../../src/PrinciPal.VsCodeExtension/src/debugCaptureLimits";
// Import from "vscode" — moduleNameMapper resolves to __mocks__/vscode.ts
import * as vscode from "vscode";

const debug = vscode.debug as typeof vscode.debug & { breakpoints: any[] };
const SourceBreakpoint = vscode.SourceBreakpoint;

const mockSession = {
    id: "test-session",
    name: "TestSession",
    type: "node",
    customRequest: jest.fn(),
} as unknown as vscode.DebugSession;

function createMockSession(
    customRequestImpl?: (cmd: string, args?: any) => any
): vscode.DebugSession {
    return {
        id: "dynamic-session",
        name: "TestSession",
        type: "node",
        customRequest: jest.fn(
            customRequestImpl ??
                ((cmd: string, args?: any) => {
                    if (cmd === "stackTrace") {
                        return Promise.resolve({
                            stackFrames: [
                                {
                                    id: 1,
                                    name: "main",
                                    line: 10,
                                    column: 5,
                                    source: { name: "app.ts", path: "/src/app.ts" },
                                },
                                {
                                    id: 2,
                                    name: "run",
                                    line: 20,
                                    column: 1,
                                    source: { name: "index.ts", path: "/src/index.ts" },
                                },
                            ],
                        });
                    }
                    if (cmd === "scopes") {
                        return Promise.resolve({
                            scopes: [{ name: "Locals", variablesReference: 100 }],
                        });
                    }
                    if (cmd === "variables") {
                        return Promise.resolve({
                            variables: [
                                { name: "x", value: "42", type: "number", variablesReference: 0 },
                                { name: "obj", value: "Object", type: "object", variablesReference: 200 },
                            ],
                        });
                    }
                    return Promise.resolve({});
                })
        ),
    } as unknown as vscode.DebugSession;
}

describe("VsCodeDebuggerAdapter", () => {
    let adapter: VsCodeDebuggerAdapter;

    beforeEach(() => {
        adapter = new VsCodeDebuggerAdapter(() => defaultDebugCaptureLimits);
        debug.breakpoints = [];
    });

    describe("break mode tracking", () => {
        it("starts not in break mode", () => {
            expect(adapter.isInBreakMode(mockSession)).toBe(false);
        });

        it("setBreakMode sets isInBreakMode to true for that session", () => {
            adapter.setBreakMode(mockSession, 1);
            expect(adapter.isInBreakMode(mockSession)).toBe(true);
        });

        it("clearBreakMode clears only that session", () => {
            const other = { id: "other", name: "o", customRequest: jest.fn() } as unknown as vscode.DebugSession;
            adapter.setBreakMode(mockSession, 1);
            adapter.setBreakMode(other, 2);
            adapter.clearBreakMode(mockSession);
            expect(adapter.isInBreakMode(mockSession)).toBe(false);
            expect(adapter.isInBreakMode(other)).toBe(true);
        });
    });

    describe("readCurrentLocation", () => {
        it("maps DAP stackFrame to SourceLocation", async () => {
            const session = createMockSession();
            adapter.setBreakMode(session, 1);

            const result = await adapter.readCurrentLocation(session);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.filePath).toBe("/src/app.ts");
                expect(result.value.line).toBe(10);
                expect(result.value.column).toBe(5);
                expect(result.value.functionName).toBe("main");
                expect(result.value.projectName).toBe("TestSession");
            }
        });
    });

    describe("readLocals", () => {
        it("handles recursive variable expansion", async () => {
            let callCount = 0;
            const session = createMockSession((cmd, args) => {
                if (cmd === "stackTrace") {
                    return Promise.resolve({
                        stackFrames: [
                            { id: 1, name: "main", line: 10, source: { path: "/src/app.ts" } },
                        ],
                    });
                }
                if (cmd === "scopes") {
                    return Promise.resolve({
                        scopes: [{ name: "Locals", variablesReference: 100 }],
                    });
                }
                if (cmd === "variables") {
                    callCount++;
                    if (args.variablesReference === 100) {
                        return Promise.resolve({
                            variables: [
                                { name: "x", value: "42", type: "number", variablesReference: 0 },
                                { name: "obj", value: "Object", type: "object", variablesReference: 200 },
                            ],
                        });
                    }
                    if (args.variablesReference === 200) {
                        return Promise.resolve({
                            variables: [
                                { name: "prop", value: "hello", type: "string", variablesReference: 0 },
                            ],
                        });
                    }
                }
                return Promise.resolve({});
            });
            adapter.setBreakMode(session, 1);

            const result = await adapter.readLocals(session, 2);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(2);
                expect(result.value[0].name).toBe("x");
                expect(result.value[0].members).toEqual([]);
                expect(result.value[1].name).toBe("obj");
                expect(result.value[1].members).toHaveLength(1);
                expect(result.value[1].members[0].name).toBe("prop");
            }
        });

        it("caps variables per level and reports overflow row", async () => {
            const manyVars = Array.from({ length: 5 }, (_, i) => ({
                name: `v${i}`,
                value: `${i}`,
                type: "number",
                variablesReference: 0,
            }));
            const session = createMockSession((cmd) => {
                if (cmd === "stackTrace") {
                    return Promise.resolve({
                        stackFrames: [{ id: 1, name: "main", line: 1, source: { path: "/a.ts" } }],
                    });
                }
                if (cmd === "scopes") {
                    return Promise.resolve({
                        scopes: [{ name: "Locals", variablesReference: 100 }],
                    });
                }
                if (cmd === "variables") {
                    return Promise.resolve({ variables: manyVars });
                }
                return Promise.resolve({});
            });
            adapter.setBreakMode(session, 1);

            const limits = { ...defaultDebugCaptureLimits, maxVariablesPerLevel: 2 };
            const cappedAdapter = new VsCodeDebuggerAdapter(() => limits);
            cappedAdapter.setBreakMode(session, 1);

            const result = await cappedAdapter.readLocals(session, 0);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.some((v) => v.name.startsWith("… (+"))).toBe(true);
            }
        });
    });

    describe("readCallStack", () => {
        it("maps DAP stackFrames to StackFrameInfo[]", async () => {
            const session = createMockSession();
            adapter.setBreakMode(session, 1);

            const result = await adapter.readCallStack(session, 20);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(2);
                expect(result.value[0]).toEqual({
                    index: 0,
                    functionName: "main",
                    module: "app.ts",
                    language: "",
                    filePath: "/src/app.ts",
                    line: 10,
                });
                expect(result.value[1].functionName).toBe("run");
            }
        });
    });

    describe("readBreakpoints", () => {
        it("maps vscode.debug.breakpoints to BreakpointInfo[]", async () => {
            debug.breakpoints = [
                new SourceBreakpoint(
                    {
                        uri: { fsPath: "/src/app.ts" },
                        range: { start: { line: 9, character: 0 } },
                    },
                    true,
                    "x > 5"
                ),
                new SourceBreakpoint(
                    {
                        uri: { fsPath: "/src/index.ts" },
                        range: { start: { line: 19, character: 4 } },
                    },
                    false
                ),
            ];

            const result = await adapter.readBreakpoints(mockSession);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(2);
                expect(result.value[0]).toEqual({
                    filePath: "/src/app.ts",
                    line: 10,
                    column: 1,
                    functionName: "",
                    enabled: true,
                    condition: "x > 5",
                });
                expect(result.value[1].filePath).toBe("/src/index.ts");
                expect(result.value[1].line).toBe(20);
                expect(result.value[1].enabled).toBe(false);
                expect(result.value[1].condition).toBe("");
            }
        });

        it("prioritizes current file when over cap", async () => {
            debug.breakpoints = [
                new SourceBreakpoint(
                    { uri: { fsPath: "/other.ts" }, range: { start: { line: 0, character: 0 } } },
                    true
                ),
                new SourceBreakpoint(
                    { uri: { fsPath: "/focus.ts" }, range: { start: { line: 4, character: 0 } } },
                    true
                ),
                new SourceBreakpoint(
                    { uri: { fsPath: "/c.ts" }, range: { start: { line: 1, character: 0 } } },
                    true
                ),
                new SourceBreakpoint(
                    { uri: { fsPath: "/d.ts" }, range: { start: { line: 2, character: 0 } } },
                    true
                ),
            ];
            const limits = { ...defaultDebugCaptureLimits, maxBreakpoints: 3 };
            const a = new VsCodeDebuggerAdapter(() => limits);

            const result = await a.readBreakpoints(mockSession, "/focus.ts");
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value[0].filePath).toBe("/focus.ts");
                expect(result.value.some((b) => b.filePath === "(princiPal)")).toBe(true);
            }
        });
    });
});
