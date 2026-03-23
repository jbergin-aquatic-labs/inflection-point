import { DebugEventCoordinator } from "../../../../src/PrinciPal.VsCodeExtension/src/services/DebugEventCoordinator";
import type { IDebuggerReader } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IDebuggerReader";
import type { IDebugStatePublisher } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IDebugStatePublisher";
import type { IExtensionLogger } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IExtensionLogger";
import type { DebugSession } from "vscode";
import {
    success,
    failure,
    DebugReadError,
    type SourceLocation,
    type LocalVariable,
    type StackFrameInfo,
    type BreakpointInfo,
    type DebugState,
} from "../../../../src/PrinciPal.VsCodeExtension/src/types";

const mockSession = { id: "s1" } as DebugSession;

function createMockReader(overrides: Partial<IDebuggerReader> = {}): IDebuggerReader {
    return {
        isInBreakMode: jest.fn(() => false),
        readCurrentLocation: jest.fn(async () =>
            success<SourceLocation>({
                filePath: "test.ts",
                line: 10,
                column: 5,
                functionName: "main",
                projectName: "TestProject",
            })
        ),
        readLocals: jest.fn(async () =>
            success<LocalVariable[]>([
                { name: "x", value: "42", type: "number", isValidValue: true, members: [] },
            ])
        ),
        readCallStack: jest.fn(async () =>
            success<StackFrameInfo[]>([
                {
                    index: 0,
                    functionName: "main",
                    module: "app.ts",
                    language: "",
                    filePath: "test.ts",
                    line: 10,
                },
            ])
        ),
        readBreakpoints: jest.fn(async () =>
            success<BreakpointInfo[]>([
                {
                    filePath: "test.ts",
                    line: 10,
                    column: 0,
                    functionName: "",
                    enabled: true,
                    condition: "",
                },
            ])
        ),
        ...overrides,
    };
}

function createMockPublisher(): IDebugStatePublisher & {
    registerSession: jest.Mock;
    pushDebugState: jest.Mock;
    clearDebugState: jest.Mock;
    deregisterSession: jest.Mock;
} {
    return {
        registerSession: jest.fn(async () => success()),
        pushDebugState: jest.fn(async () => success()),
        clearDebugState: jest.fn(async () => success()),
        deregisterSession: jest.fn(async () => success()),
        dispose: jest.fn(),
    };
}

function createMockLogger(): IExtensionLogger & { log: jest.Mock } {
    return { log: jest.fn() };
}

describe("DebugEventCoordinator", () => {
    describe("buildDebugState", () => {
        it("when not in break mode returns empty state", async () => {
            const reader = createMockReader({ isInBreakMode: jest.fn(() => false) });
            const publisher = createMockPublisher();
            const logger = createMockLogger();
            const coordinator = new DebugEventCoordinator(reader, publisher, logger);

            const state = await coordinator.buildDebugState(mockSession);

            expect(state.isInBreakMode).toBe(false);
            expect(state.currentLocation).toBeNull();
            expect(state.locals).toEqual([]);
            expect(state.callStack).toEqual([]);
            expect(state.breakpoints).toEqual([]);
            expect(reader.readCurrentLocation).not.toHaveBeenCalled();
        });

        it("when in break mode populates all fields", async () => {
            const reader = createMockReader({ isInBreakMode: jest.fn(() => true) });
            const publisher = createMockPublisher();
            const logger = createMockLogger();
            const coordinator = new DebugEventCoordinator(reader, publisher, logger);

            const state = await coordinator.buildDebugState(mockSession);

            expect(state.isInBreakMode).toBe(true);
            expect(state.currentLocation).toEqual({
                filePath: "test.ts",
                line: 10,
                column: 5,
                functionName: "main",
                projectName: "TestProject",
            });
            expect(state.locals).toHaveLength(1);
            expect(state.locals[0].name).toBe("x");
            expect(state.callStack).toHaveLength(1);
            expect(state.breakpoints).toHaveLength(1);
            expect(reader.readBreakpoints).toHaveBeenCalledWith(
                mockSession,
                "test.ts"
            );
        });

        it("when reader fails returns partial state and logs errors", async () => {
            const reader = createMockReader({
                isInBreakMode: jest.fn(() => true),
                readCurrentLocation: jest.fn(async () =>
                    failure(new DebugReadError("currentLocation", "session lost"))
                ),
                readLocals: jest.fn(async () => failure(new DebugReadError("locals", "timeout"))),
            });
            const publisher = createMockPublisher();
            const logger = createMockLogger();
            const coordinator = new DebugEventCoordinator(reader, publisher, logger);

            const state = await coordinator.buildDebugState(mockSession);

            expect(state.isInBreakMode).toBe(true);
            expect(state.currentLocation).toBeNull();
            expect(state.locals).toEqual([]);
            expect(state.callStack).toHaveLength(1);
            expect(state.breakpoints).toHaveLength(1);
            expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("currentLocation"));
            expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("locals"));
        });
    });

    describe("publishState", () => {
        it("delegates to publisher", async () => {
            const reader = createMockReader();
            const publisher = createMockPublisher();
            const logger = createMockLogger();
            const coordinator = new DebugEventCoordinator(reader, publisher, logger);

            const state: DebugState = {
                isInBreakMode: true,
                currentLocation: null,
                locals: [],
                callStack: [],
                breakpoints: [],
            };

            await coordinator.publishState(state);

            expect(publisher.pushDebugState).toHaveBeenCalledWith(state);
        });
    });

    describe("clearState", () => {
        it("delegates to publisher", async () => {
            const reader = createMockReader();
            const publisher = createMockPublisher();
            const logger = createMockLogger();
            const coordinator = new DebugEventCoordinator(reader, publisher, logger);

            await coordinator.clearState();

            expect(publisher.clearDebugState).toHaveBeenCalled();
        });
    });

    describe("register", () => {
        it("delegates to publisher", async () => {
            const reader = createMockReader();
            const publisher = createMockPublisher();
            const logger = createMockLogger();
            const coordinator = new DebugEventCoordinator(reader, publisher, logger);

            await coordinator.register();

            expect(publisher.registerSession).toHaveBeenCalled();
        });
    });

    describe("deregister", () => {
        it("delegates to publisher", async () => {
            const reader = createMockReader();
            const publisher = createMockPublisher();
            const logger = createMockLogger();
            const coordinator = new DebugEventCoordinator(reader, publisher, logger);

            await coordinator.deregister();

            expect(publisher.deregisterSession).toHaveBeenCalled();
        });
    });
});
