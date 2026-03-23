import type { DebugSession } from "vscode";
import type {
    Result,
    SourceLocation,
    LocalVariable,
    StackFrameInfo,
    BreakpointInfo,
} from "../types.js";

export interface IDebuggerReader {
    isInBreakMode(session: DebugSession): boolean;
    readCurrentLocation(session: DebugSession): Promise<Result<SourceLocation>>;
    readLocals(session: DebugSession, maxDepth?: number): Promise<Result<LocalVariable[]>>;
    readCallStack(session: DebugSession, maxFrames?: number): Promise<Result<StackFrameInfo[]>>;
    /**
     * @param currentFileHint When set and breakpoints exceed the cap, entries in this file are kept first.
     */
    readBreakpoints(
        session: DebugSession,
        currentFileHint?: string | null
    ): Promise<Result<BreakpointInfo[]>>;
}
