import { DebugAdapterTrackerFactory } from "../../../../src/PrinciPal.VsCodeExtension/src/services/DebugAdapterTrackerFactory";
import { VsCodeDebuggerAdapter } from "../../../../src/PrinciPal.VsCodeExtension/src/adapters/VsCodeDebuggerAdapter";
import { DebugEventCoordinator } from "../../../../src/PrinciPal.VsCodeExtension/src/services/DebugEventCoordinator";
import type { IDebuggerReader } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IDebuggerReader";
import type { IDebugStatePublisher } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IDebugStatePublisher";
import type { IExtensionLogger } from "../../../../src/PrinciPal.VsCodeExtension/src/abstractions/IExtensionLogger";
import { success, emptyDebugState } from "../../../../src/PrinciPal.VsCodeExtension/src/types";

jest.mock("vscode");

function createMocks() {
    const adapter = new VsCodeDebuggerAdapter();

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

    // We need to spy on the adapter to verify setBreakMode / clearBreakMode
    // but we also need the coordinator to use the adapter as its reader.
    // Since the adapter IS the IDebuggerReader, we pass it directly.
    const coordinator = new DebugEventCoordinator(
        adapter as unknown as IDebuggerReader,
        publisher,
        logger
    );

    // Spy on coordinator methods
    jest.spyOn(coordinator, "buildDebugState").mockResolvedValue(
        emptyDebugState(true)
    );
    jest.spyOn(coordinator, "publishState").mockResolvedValue(success());
    jest.spyOn(coordinator, "clearState").mockResolvedValue(success());

    const factory = new DebugAdapterTrackerFactory(adapter, coordinator, logger);

    return { adapter, publisher, logger, coordinator, factory };
}

describe("DebugAdapterTrackerFactory", () => {
    it("creates a tracker for any session", () => {
        const { factory } = createMocks();
        const tracker = factory.createDebugAdapterTracker({} as any);
        expect(tracker).toBeDefined();
    });

    describe("tracker behavior", () => {
        it("stopped event triggers build and push", async () => {
            const { factory, coordinator } = createMocks();
            const tracker = factory.createDebugAdapterTracker({} as any) as {
                onDidSendMessage(msg: any): void;
            };

            tracker.onDidSendMessage({
                type: "event",
                event: "stopped",
                body: { threadId: 1 },
            });

            // Allow microtask queue to flush
            await new Promise((r) => setTimeout(r, 0));

            expect(coordinator.buildDebugState).toHaveBeenCalled();
            expect(coordinator.publishState).toHaveBeenCalled();
        });

        it("continued event clears break mode but does not clear state", async () => {
            const { factory, adapter, coordinator } = createMocks();
            const clearBreakSpy = jest.spyOn(adapter, "clearBreakMode");
            const tracker = factory.createDebugAdapterTracker({} as any) as {
                onDidSendMessage(msg: any): void;
            };

            tracker.onDidSendMessage({
                type: "event",
                event: "continued",
            });

            await new Promise((r) => setTimeout(r, 0));

            expect(clearBreakSpy).toHaveBeenCalled();
            expect(coordinator.clearState).not.toHaveBeenCalled();
        });

        it("session end triggers clear", async () => {
            const { factory, coordinator } = createMocks();
            const tracker = factory.createDebugAdapterTracker({} as any) as {
                onWillStopSession(): void;
            };

            tracker.onWillStopSession();

            await new Promise((r) => setTimeout(r, 0));

            expect(coordinator.clearState).toHaveBeenCalled();
        });

        it("ignores non-event messages", async () => {
            const { factory, coordinator } = createMocks();
            const tracker = factory.createDebugAdapterTracker({} as any) as {
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
    });
});
