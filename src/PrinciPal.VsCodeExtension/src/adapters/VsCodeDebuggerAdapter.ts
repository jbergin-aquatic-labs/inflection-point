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
import {
    type DebugCaptureLimits,
    defaultDebugCaptureLimits,
    truncateVariableValue,
    pathsEqualForBreakpointHint,
} from "../debugCaptureLimits.js";

type GetLimits = () => DebugCaptureLimits;

/**
 * Reads debug state via the VS Code Debug Adapter Protocol (DAP).
 * Break state and thread id are tracked per debug session to avoid cross-session races.
 */
export class VsCodeDebuggerAdapter implements IDebuggerReader {
    private readonly _breakBySession = new Map<string, { threadId: number }>();
    private readonly _getLimits: GetLimits;

    constructor(getLimits?: GetLimits) {
        this._getLimits = getLimits ?? (() => defaultDebugCaptureLimits);
    }

    /** Called when a `stopped` DAP event is received for this session. */
    setBreakMode(session: vscode.DebugSession, threadId: number): void {
        this._breakBySession.set(session.id, { threadId });
    }

    /** Called on `continued` or session end for this session. */
    clearBreakMode(session: vscode.DebugSession): void {
        this._breakBySession.delete(session.id);
    }

    isInBreakMode(session: vscode.DebugSession): boolean {
        return this._breakBySession.has(session.id);
    }

    private threadIdFor(session: vscode.DebugSession): number {
        return this._breakBySession.get(session.id)?.threadId ?? 1;
    }

    private limits(): DebugCaptureLimits {
        return this._getLimits();
    }

    async readCurrentLocation(session: vscode.DebugSession): Promise<Result<SourceLocation>> {
        try {
            const threadId = this.threadIdFor(session);
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

    async readLocals(session: vscode.DebugSession, maxDepth?: number): Promise<Result<LocalVariable[]>> {
        const lim = this.limits();
        const depth = maxDepth ?? lim.maxLocalDepth;
        try {
            const threadId = this.threadIdFor(session);
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
            const localsScope =
                scopes.find((s) => s.name === "Locals" || s.name === "Local") ?? scopes[0];

            if (!localsScope) {
                return success<LocalVariable[]>([]);
            }

            const counters = { totalNodes: 0 };
            const variables = await this.expandVariables(
                session,
                localsScope.variablesReference,
                depth,
                0,
                counters,
                lim
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
        currentDepth: number,
        counters: { totalNodes: number },
        limits: DebugCaptureLimits
    ): Promise<LocalVariable[]> {
        if (counters.totalNodes >= limits.maxTotalLocalNodes) {
            return [];
        }

        const resp = await session.customRequest("variables", {
            variablesReference,
        });

        const dapVars = (resp.variables as DapVariable[]) ?? [];
        const slice = dapVars.slice(0, limits.maxVariablesPerLevel);
        const skipped = dapVars.length - slice.length;

        const result: LocalVariable[] = [];

        for (const v of slice) {
            if (counters.totalNodes >= limits.maxTotalLocalNodes) {
                break;
            }
            counters.totalNodes++;

            const truncatedValue = truncateVariableValue(v.value ?? "", limits.maxValueLength);
            let members: LocalVariable[] = [];
            if (v.variablesReference > 0 && currentDepth < maxDepth) {
                members = await this.expandVariables(
                    session,
                    v.variablesReference,
                    maxDepth,
                    currentDepth + 1,
                    counters,
                    limits
                );
            }

            result.push({
                name: v.name,
                value: truncatedValue,
                type: v.type ?? "",
                isValidValue: true,
                members,
            });
        }

        if (skipped > 0) {
            result.push({
                name: `… (+${skipped} more at this level)`,
                value: "",
                type: "princiPal.capped",
                isValidValue: true,
                members: [],
            });
        }

        return result;
    }

    async readCallStack(
        session: vscode.DebugSession,
        maxFrames?: number
    ): Promise<Result<StackFrameInfo[]>> {
        const lim = this.limits();
        const levels = maxFrames ?? lim.maxStackFrames;
        try {
            const threadId = this.threadIdFor(session);
            const response = await session.customRequest("stackTrace", {
                threadId,
                startFrame: 0,
                levels,
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

    async readBreakpoints(
        _session: vscode.DebugSession,
        currentFileHint?: string | null
    ): Promise<Result<BreakpointInfo[]>> {
        const max = this.limits().maxBreakpoints;
        try {
            const bps = vscode.debug.breakpoints;
            const result: BreakpointInfo[] = [];

            for (const bp of bps) {
                if (isSourceBreakpoint(bp)) {
                    result.push({
                        filePath: bp.location.uri.fsPath,
                        line: bp.location.range.start.line + 1,
                        column: bp.location.range.start.character + 1,
                        functionName: "",
                        enabled: bp.enabled,
                        condition: bp.condition ?? "",
                    });
                }
            }

            if (result.length <= max) {
                return success(result);
            }

            const hint = currentFileHint?.trim() ?? "";
            const prioritized =
                hint.length > 0
                    ? [
                          ...result.filter((b) => pathsEqualForBreakpointHint(b.filePath, hint)),
                          ...result.filter((b) => !pathsEqualForBreakpointHint(b.filePath, hint)),
                      ]
                    : result;

            const keptForReal = Math.max(0, max - 1);
            const capped = prioritized.slice(0, keptForReal);
            const omitted = result.length - capped.length;
            capped.push({
                filePath: "(princiPal)",
                line: 0,
                column: 0,
                functionName: `+${omitted} breakpoints omitted`,
                enabled: false,
                condition: "Raise princiPal.capture.maxBreakpoints to send more.",
            });

            return success(capped);
        } catch (e) {
            return failure(new DebugReadError("breakpoints", String(e)));
        }
    }
}

function isSourceBreakpoint(bp: vscode.Breakpoint): bp is vscode.SourceBreakpoint {
    return "location" in bp;
}

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
