import { VsCodeDebuggerAdapter } from "../../../../src/PrinciPal.VsCodeExtension/src/adapters/VsCodeDebuggerAdapter";
// Import from "vscode" — moduleNameMapper resolves to __mocks__/vscode.ts
import * as vscode from "vscode";

const debug = vscode.debug as typeof vscode.debug & { activeDebugSession: any; breakpoints: any[] };
const SourceBreakpoint = vscode.SourceBreakpoint;

function createMockSession(customRequestImpl?: (cmd: string, args?: any) => any) {
    return {
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
                            scopes: [
                                { name: "Locals", variablesReference: 100 },
                            ],
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
        name: "TestSession",
        type: "node",
        id: "session-1",
    };
}

describe("VsCodeDebuggerAdapter", () => {
    let adapter: VsCodeDebuggerAdapter;

    beforeEach(() => {
        adapter = new VsCodeDebuggerAdapter();
        // Reset debug mock state
        debug.activeDebugSession = undefined;
        debug.breakpoints = [];
    });

    describe("break mode tracking", () => {
        it("starts not in break mode", () => {
            expect(adapter.isInBreakMode).toBe(false);
        });

        it("setBreakMode sets isInBreakMode to true", () => {
            adapter.setBreakMode(1);
            expect(adapter.isInBreakMode).toBe(true);
        });

        it("clearBreakMode sets isInBreakMode to false", () => {
            adapter.setBreakMode(1);
            adapter.clearBreakMode();
            expect(adapter.isInBreakMode).toBe(false);
        });
    });

    describe("readCurrentLocation", () => {
        it("maps DAP stackFrame to SourceLocation", async () => {
            const session = createMockSession();
            debug.activeDebugSession = session;
            adapter.setBreakMode(1);

            const result = await adapter.readCurrentLocation();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.filePath).toBe("/src/app.ts");
                expect(result.value.line).toBe(10);
                expect(result.value.column).toBe(5);
                expect(result.value.functionName).toBe("main");
                expect(result.value.projectName).toBe("TestSession");
            }
        });

        it("returns error when no active session", async () => {
            debug.activeDebugSession = undefined;

            const result = await adapter.readCurrentLocation();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.code).toBe("Extension.DebugReadFailed");
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
            debug.activeDebugSession = session;
            adapter.setBreakMode(1);

            const result = await adapter.readLocals(2);

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
    });

    describe("readCallStack", () => {
        it("maps DAP stackFrames to StackFrameInfo[]", async () => {
            const session = createMockSession();
            debug.activeDebugSession = session;
            adapter.setBreakMode(1);

            const result = await adapter.readCallStack(20);

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

            const result = await adapter.readBreakpoints();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(2);
                // VS Code is 0-based, output should be 1-based
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
    });
});
