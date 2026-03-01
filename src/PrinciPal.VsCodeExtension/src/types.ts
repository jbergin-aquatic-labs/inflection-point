// Result pattern — lightweight discriminated union matching C# Result<T>

export interface IError {
    readonly code: string;
    readonly description: string;
}

export type Result<T = void> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: IError };

export function success(): Result<void>;
export function success<T>(value: T): Result<T>;
export function success<T>(value?: T): Result<T> {
    return { ok: true, value: value as T };
}

export function failure(error: IError): Result<any> {
    return { ok: false, error };
}

// Error types matching C# error classes

export class ServerUnreachableError implements IError {
    readonly code = "Server.Unreachable";
    readonly description: string;
    constructor(url: string, detail: string) {
        this.description = `MCP server not reachable at ${url}. ${detail}`;
    }
}

export class RequestTimedOutError implements IError {
    readonly code = "Server.Timeout";
    readonly description: string;
    constructor(action: string) {
        this.description = `${action} request timed out.`;
    }
}

export class DebugReadError implements IError {
    readonly code = "Extension.DebugReadFailed";
    readonly description: string;
    constructor(component: string, detail?: string) {
        this.description = detail
            ? `Error reading ${component}: ${detail}`
            : `Error reading ${component} from the debugger.`;
    }
}

export class ServerBinaryNotFoundError implements IError {
    readonly code = "Server.BinaryNotFound";
    readonly description: string;
    constructor(detail: string) {
        this.description = `MCP server binary not found. ${detail}`;
    }
}

export class LockHeldError implements IError {
    readonly code = "Server.LockHeld";
    readonly description: string;
    constructor(port: number, pid: number) {
        this.description = `Lock for port ${port} is held by PID ${pid}.`;
    }
}

// Domain value objects — JSON-compatible with C# DTOs (camelCase)

export interface SourceLocation {
    filePath: string;
    line: number;
    column: number;
    functionName: string;
    projectName: string;
}

export interface LocalVariable {
    name: string;
    value: string;
    type: string;
    isValidValue: boolean;
    members: LocalVariable[];
}

export interface StackFrameInfo {
    index: number;
    functionName: string;
    module: string;
    language: string;
    filePath: string;
    line: number;
}

export interface BreakpointInfo {
    filePath: string;
    line: number;
    column: number;
    functionName: string;
    enabled: boolean;
    condition: string;
}

export interface DebugState {
    isInBreakMode: boolean;
    currentLocation: SourceLocation | null;
    locals: LocalVariable[];
    callStack: StackFrameInfo[];
    breakpoints: BreakpointInfo[];
}

export function emptyDebugState(isInBreakMode: boolean = false): DebugState {
    return {
        isInBreakMode,
        currentLocation: null,
        locals: [],
        callStack: [],
        breakpoints: [],
    };
}
