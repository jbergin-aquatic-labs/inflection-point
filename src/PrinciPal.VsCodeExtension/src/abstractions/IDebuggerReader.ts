import type {
    Result,
    SourceLocation,
    LocalVariable,
    StackFrameInfo,
    BreakpointInfo,
} from "../types.js";

export interface IDebuggerReader {
    readonly isInBreakMode: boolean;
    readCurrentLocation(): Promise<Result<SourceLocation>>;
    readLocals(maxDepth?: number): Promise<Result<LocalVariable[]>>;
    readCallStack(maxFrames?: number): Promise<Result<StackFrameInfo[]>>;
    readBreakpoints(): Promise<Result<BreakpointInfo[]>>;
}
