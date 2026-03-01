import type { IDebuggerReader } from "../abstractions/IDebuggerReader.js";
import type { IDebugStatePublisher } from "../abstractions/IDebugStatePublisher.js";
import type { IExtensionLogger } from "../abstractions/IExtensionLogger.js";
import type { DebugState, Result } from "../types.js";
import { emptyDebugState } from "../types.js";

/**
 * Testable orchestration layer — direct port of C# DebugEventCoordinator.
 * Depends only on interfaces, no VS Code API imports.
 */
export class DebugEventCoordinator {
    private readonly _reader: IDebuggerReader;
    private readonly _publisher: IDebugStatePublisher;
    private readonly _logger: IExtensionLogger;

    constructor(
        reader: IDebuggerReader,
        publisher: IDebugStatePublisher,
        logger: IExtensionLogger
    ) {
        this._reader = reader;
        this._publisher = publisher;
        this._logger = logger;
    }

    /**
     * Reads all debug state sections from the debugger.
     * Returns partially-populated DebugState if some sections fail.
     */
    async buildDebugState(): Promise<DebugState> {
        const state = emptyDebugState(this._reader.isInBreakMode);

        if (!state.isInBreakMode) return state;

        const locationResult = await this._reader.readCurrentLocation();
        if (locationResult.ok) {
            state.currentLocation = locationResult.value;
        } else {
            this._logger.log(locationResult.error.description);
        }

        const localsResult = await this._reader.readLocals();
        if (localsResult.ok) {
            state.locals = localsResult.value;
        } else {
            this._logger.log(localsResult.error.description);
        }

        const callStackResult = await this._reader.readCallStack();
        if (callStackResult.ok) {
            state.callStack = callStackResult.value;
        } else {
            this._logger.log(callStackResult.error.description);
        }

        const breakpointsResult = await this._reader.readBreakpoints();
        if (breakpointsResult.ok) {
            state.breakpoints = breakpointsResult.value;
        } else {
            this._logger.log(breakpointsResult.error.description);
        }

        return state;
    }

    async publishState(state: DebugState): Promise<Result> {
        return this._publisher.pushDebugState(state);
    }

    async clearState(): Promise<Result> {
        return this._publisher.clearDebugState();
    }

    async register(): Promise<Result> {
        return this._publisher.registerSession();
    }

    async deregister(): Promise<Result> {
        return this._publisher.deregisterSession();
    }
}
