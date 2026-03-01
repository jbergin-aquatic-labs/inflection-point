import * as vscode from "vscode";
import type { IDebuggerReader } from "../abstractions/IDebuggerReader.js";
import type {
    Result,
    SourceLocation,
    LocalVariable,
    StackFrameInfo,
    BreakpointInfo,
} from "../types.js";
import { success, failure, DebugReadError } from "../types.js";

/**
 * Reads debug state via the VS Code Debug Adapter Protocol (DAP).
 * Equivalent of the C# VsDebuggerAdapter that uses DTE2/COM.
 */
export class VsCodeDebuggerAdapter implements IDebuggerReader {
    private _isInBreakMode = false;
    private _stoppedThreadId: number | undefined;

    get isInBreakMode(): boolean {
        return this._isInBreakMode;
    }

    /** Called by the DebugAdapterTracker when a `stopped` event arrives. */
    setBreakMode(threadId: number): void {
        this._isInBreakMode = true;
        this._stoppedThreadId = threadId;
    }

    /** Called by the DebugAdapterTracker when a `continued` event arrives or session ends. */
    clearBreakMode(): void {
        this._isInBreakMode = false;
        this._stoppedThreadId = undefined;
    }

    async readCurrentLocation(): Promise<Result<SourceLocation>> {
        try {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return failure(new DebugReadError("currentLocation", "No active debug session."));
            }

            const threadId = this._stoppedThreadId ?? 1;
            const response = await session.customRequest("stackTrace", {
                threadId,
                startFrame: 0,
                levels: 1,
            });

            const frames = response.stackFrames as DapStackFrame[];
            if (!frames || frames.length === 0) {
                return failure(new DebugReadError("currentLocation", "No stack frames available."));
            }

            const top = frames[0];
            return success<SourceLocation>({
                filePath: top.source?.path ?? top.source?.name ?? "",
                line: top.line,
                column: top.column ?? 0,
                functionName: top.name,
                projectName: session.name,
            });
        } catch (e) {
            return failure(new DebugReadError("currentLocation", String(e)));
        }
    }

    async readLocals(maxDepth: number = 2): Promise<Result<LocalVariable[]>> {
        try {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return failure(new DebugReadError("locals", "No active debug session."));
            }

            const threadId = this._stoppedThreadId ?? 1;
            const stackResp = await session.customRequest("stackTrace", {
                threadId,
                startFrame: 0,
                levels: 1,
            });

            const frames = stackResp.stackFrames as DapStackFrame[];
            if (!frames || frames.length === 0) {
                return failure(new DebugReadError("locals", "No stack frames available."));
            }

            const scopesResp = await session.customRequest("scopes", {
                frameId: frames[0].id,
            });

            const scopes = scopesResp.scopes as DapScope[];
            const localsScope = scopes.find(
                (s) => s.name === "Locals" || s.name === "Local"
            ) ?? scopes[0];

            if (!localsScope) {
                return success<LocalVariable[]>([]);
            }

            const variables = await this.expandVariables(
                session,
                localsScope.variablesReference,
                maxDepth,
                0
            );

            return success(variables);
        } catch (e) {
            return failure(new DebugReadError("locals", String(e)));
        }
    }

    private async expandVariables(
        session: vscode.DebugSession,
        variablesReference: number,
        maxDepth: number,
        currentDepth: number
    ): Promise<LocalVariable[]> {
        const resp = await session.customRequest("variables", {
            variablesReference,
        });

        const dapVars = resp.variables as DapVariable[];
        const result: LocalVariable[] = [];

        for (const v of dapVars) {
            const members: LocalVariable[] =
                v.variablesReference > 0 && currentDepth < maxDepth
                    ? await this.expandVariables(
                          session,
                          v.variablesReference,
                          maxDepth,
                          currentDepth + 1
                      )
                    : [];

            result.push({
                name: v.name,
                value: v.value,
                type: v.type ?? "",
                isValidValue: true,
                members,
            });
        }

        return result;
    }

    async readCallStack(maxFrames: number = 20): Promise<Result<StackFrameInfo[]>> {
        try {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return failure(new DebugReadError("callStack", "No active debug session."));
            }

            const threadId = this._stoppedThreadId ?? 1;
            const response = await session.customRequest("stackTrace", {
                threadId,
                startFrame: 0,
                levels: maxFrames,
            });

            const frames = response.stackFrames as DapStackFrame[];
            const stack: StackFrameInfo[] = frames.map((f, i) => ({
                index: i,
                functionName: f.name,
                module: f.source?.name ?? "",
                language: "",
                filePath: f.source?.path ?? "",
                line: f.line,
            }));

            return success(stack);
        } catch (e) {
            return failure(new DebugReadError("callStack", String(e)));
        }
    }

    async readBreakpoints(): Promise<Result<BreakpointInfo[]>> {
        try {
            const bps = vscode.debug.breakpoints;
            const result: BreakpointInfo[] = [];

            for (const bp of bps) {
                if (isSourceBreakpoint(bp)) {
                    result.push({
                        filePath: bp.location.uri.fsPath,
                        line: bp.location.range.start.line + 1, // VS Code is 0-based, C# is 1-based
                        column: bp.location.range.start.character + 1,
                        functionName: "",
                        enabled: bp.enabled,
                        condition: bp.condition ?? "",
                    });
                }
            }

            return success(result);
        } catch (e) {
            return failure(new DebugReadError("breakpoints", String(e)));
        }
    }
}

/** Duck-type check for SourceBreakpoint — avoids instanceof issues across module boundaries. */
function isSourceBreakpoint(bp: vscode.Breakpoint): bp is vscode.SourceBreakpoint {
    return "location" in bp;
}

// DAP protocol types (subset we need)

interface DapStackFrame {
    id: number;
    name: string;
    line: number;
    column?: number;
    source?: {
        name?: string;
        path?: string;
    };
}

interface DapScope {
    name: string;
    variablesReference: number;
}

interface DapVariable {
    name: string;
    value: string;
    type?: string;
    variablesReference: number;
}
