import { DebugAdapterTrackerFactory } from "../../../../src/PrinciPal.VsCodeExtension/src/services/DebugAdapterTrackerFactory";
import { VsCodeDebuggerAdapter } from "../../../../src/PrinciPal.VsCodeExtension/src/adapters/VsCodeDebuggerAdapter";
import { DebugEventCoordinator } from "../../../../src/PrinciPal.VsCodeExtension/src/services/DebugEventCoordinator";
import type { IDebuggerReader } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IDebuggerReader";
import type { IDebugStatePublisher } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IDebugStatePublisher";
import type { IExtensionLogger } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IExtensionLogger";
import {
    success,
    emptyDebugState,
    type DebugState,
} from "../../../../src/PrinciPal.VsCodeExtension/src/types";
import { defaultDebugCaptureLimits } from "../../../../src/PrinciPal.VsCodeExtension/src/debugCaptureLimits";

jest.mock("vscode");

const mockSession = { id: "tracker-session", name: "S" } as any;

function createMocks() {
    const adapter = new VsCodeDebuggerAdapter(() => defaultDebugCaptureLimits);

    const publisher: IDebugStatePublisher & {
        pushDebugState: jest.Mock;
        clearDebugState: jest.Mock;
        registerSession: jest.Mock;
        deregisterSession: jest.Mock;
    } = {
        registerSession: jest.fn(async () => success()),
        pushDebugState: jest.fn(async () => success()),
        clearDebugState: jest.fn(async () => success()),
        deregisterSession: jest.fn(async () => success()),
        dispose: jest.fn(),
    };

    const logger: IExtensionLogger & { log: jest.Mock } = {
        log: jest.fn(),
    };

    const coordinator = new DebugEventCoordinator(
        adapter as unknown as IDebuggerReader,
        publisher,
        logger
    );

    jest.spyOn(coordinator, "buildDebugState").mockResolvedValue(emptyDebugState(true));
    jest.spyOn(coordinator, "publishState").mockResolvedValue(success());
    jest.spyOn(coordinator, "clearState").mockResolvedValue(success());

    const factory = new DebugAdapterTrackerFactory(adapter, coordinator, logger);

    return { adapter, publisher, logger, coordinator, factory };
}

describe("DebugAdapterTrackerFactory", () => {
    it("creates a tracker for any session", () => {
        const { factory } = createMocks();
        const tracker = factory.createDebugAdapterTracker(mockSession);
        expect(tracker).toBeDefined();
    });

    describe("tracker behavior", () => {
        it("stopped event triggers build and push with session", async () => {
            const { factory, coordinator } = createMocks();
            const tracker = factory.createDebugAdapterTracker(mockSession) as {
                onDidSendMessage(msg: any): void;
            };

            tracker.onDidSendMessage({
                type: "event",
                event: "stopped",
                body: { threadId: 1 },
            });

            await new Promise((r) => setTimeout(r, 0));

            expect(coordinator.buildDebugState).toHaveBeenCalledWith(mockSession);
            expect(coordinator.publishState).toHaveBeenCalled();
        });

        it("continued event clears break mode but does not clear state", async () => {
            const { factory, adapter, coordinator } = createMocks();
            const clearBreakSpy = jest.spyOn(adapter, "clearBreakMode");
            const tracker = factory.createDebugAdapterTracker(mockSession) as {
                onDidSendMessage(msg: any): void;
            };

            tracker.onDidSendMessage({
                type: "event",
                event: "continued",
            });

            await new Promise((r) => setTimeout(r, 0));

            expect(clearBreakSpy).toHaveBeenCalledWith(mockSession);
            expect(coordinator.clearState).not.toHaveBeenCalled();
        });

        it("session end triggers clear", async () => {
            const { factory, coordinator } = createMocks();
            const tracker = factory.createDebugAdapterTracker(mockSession) as {
                onWillStopSession(): void;
            };

            tracker.onWillStopSession();

            await new Promise((r) => setTimeout(r, 0));

            expect(coordinator.clearState).toHaveBeenCalled();
        });

        it("ignores non-event messages", async () => {
            const { factory, coordinator } = createMocks();
            const tracker = factory.createDebugAdapterTracker(mockSession) as {
                onDidSendMessage(msg: any): void;
            };

            tracker.onDidSendMessage({
                type: "response",
                command: "stackTrace",
            });

            await new Promise((r) => setTimeout(r, 0));

            expect(coordinator.buildDebugState).not.toHaveBeenCalled();
            expect(coordinator.clearState).not.toHaveBeenCalled();
        });

        it("second stopped before first push completes drops stale publish", async () => {
            const { factory, coordinator } = createMocks();
            const releaseBuild: Array<(v: DebugState) => void> = [];
            (coordinator.buildDebugState as jest.Mock).mockImplementation(
                () =>
                    new Promise((resolve) => {
                        releaseBuild.push((state) => resolve(state));
                    })
            );

            const tracker = factory.createDebugAdapterTracker(mockSession) as {
                onDidSendMessage(msg: any): void;
            };

            tracker.onDidSendMessage({
                type: "event",
                event: "stopped",
                body: { threadId: 1 },
            });
            await new Promise((r) => setImmediate(r));

            tracker.onDidSendMessage({
                type: "event",
                event: "stopped",
                body: { threadId: 2 },
            });
            await new Promise((r) => setImmediate(r));

            expect(releaseBuild).toHaveLength(2);

            releaseBuild[0]!(emptyDebugState(true));
            await new Promise((r) => setTimeout(r, 0));
            expect(coordinator.publishState).not.toHaveBeenCalled();

            releaseBuild[1]!(emptyDebugState(true));
            await new Promise((r) => setTimeout(r, 0));
            expect(coordinator.publishState).toHaveBeenCalledTimes(1);
        });
    });
});
