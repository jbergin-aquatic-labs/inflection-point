import type { DebugSession } from "vscode";
import type { IDebuggerReader } from "../abstractions/IDebuggerReader.js";
import type { IDebugStatePublisher } from "../abstractions/IDebugStatePublisher.js";
import type { IExtensionLogger } from "../abstractions/IExtensionLogger.js";
import type { DebugState, Result } from "../types.js";
import { emptyDebugState } from "../types.js";

/**
 * Testable orchestration layer — direct port of C# DebugEventCoordinator.
 * Depends only on interfaces, no VS Code API imports except DebugSession typing.
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
     * Reads all debug state sections from the debugger for the given session.
     * Returns partially-populated DebugState if some sections fail.
     * Location is read before breakpoints so breakpoint capping can prefer the current file.
     */
    async buildDebugState(session: DebugSession): Promise<DebugState> {
        const state = emptyDebugState(this._reader.isInBreakMode(session));

        if (!state.isInBreakMode) return state;

        const locationResult = await this._reader.readCurrentLocation(session);
        if (locationResult.ok) {
            state.currentLocation = locationResult.value;
        } else {
            this._logger.log(locationResult.error.description);
        }

        const currentPath = state.currentLocation?.filePath ?? null;
        const breakpointsResult = await this._reader.readBreakpoints(session, currentPath);
        if (breakpointsResult.ok) {
            state.breakpoints = breakpointsResult.value;
        } else {
            this._logger.log(breakpointsResult.error.description);
        }

        const localsResult = await this._reader.readLocals(session);
        if (localsResult.ok) {
            state.locals = localsResult.value;
        } else {
            this._logger.log(localsResult.error.description);
        }

        const callStackResult = await this._reader.readCallStack(session);
        if (callStackResult.ok) {
            state.callStack = callStackResult.value;
        } else {
            this._logger.log(callStackResult.error.description);
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
