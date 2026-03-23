import type { WorkspaceConfiguration } from "vscode";

/**
 * Bounds for DAP reads and HTTP payload size to avoid extension-host stalls,
 * runaway memory use, and oversized JSON for the MCP server / models.
 */
export interface DebugCaptureLimits {
    readonly maxLocalDepth: number;
    readonly maxVariablesPerLevel: number;
    readonly maxTotalLocalNodes: number;
    readonly maxValueLength: number;
    readonly maxStackFrames: number;
    readonly maxBreakpoints: number;
    readonly maxJsonPayloadChars: number;
}

export const defaultDebugCaptureLimits: DebugCaptureLimits = {
    maxLocalDepth: 2,
    maxVariablesPerLevel: 200,
    maxTotalLocalNodes: 1200,
    maxValueLength: 4096,
    maxStackFrames: 12,
    maxBreakpoints: 150,
    maxJsonPayloadChars: 1_500_000,
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Reads princiPal.capture.* and princiPal.maxJsonPayloadChars (top-level alias for publisher).
 */
export function loadDebugCaptureLimits(config: WorkspaceConfiguration): DebugCaptureLimits {
    return {
        maxLocalDepth: clampInt(
            config.get<number>("capture.maxLocalDepth", defaultDebugCaptureLimits.maxLocalDepth),
            0,
            6,
            defaultDebugCaptureLimits.maxLocalDepth
        ),
        maxVariablesPerLevel: clampInt(
            config.get<number>(
                "capture.maxVariablesPerLevel",
                defaultDebugCaptureLimits.maxVariablesPerLevel
            ),
            1,
            2000,
            defaultDebugCaptureLimits.maxVariablesPerLevel
        ),
        maxTotalLocalNodes: clampInt(
            config.get<number>(
                "capture.maxTotalLocalNodes",
                defaultDebugCaptureLimits.maxTotalLocalNodes
            ),
            10,
            50_000,
            defaultDebugCaptureLimits.maxTotalLocalNodes
        ),
        maxValueLength: clampInt(
            config.get<number>("capture.maxValueLength", defaultDebugCaptureLimits.maxValueLength),
            128,
            1_000_000,
            defaultDebugCaptureLimits.maxValueLength
        ),
        maxStackFrames: clampInt(
            config.get<number>("capture.maxStackFrames", defaultDebugCaptureLimits.maxStackFrames),
            1,
            200,
            defaultDebugCaptureLimits.maxStackFrames
        ),
        maxBreakpoints: clampInt(
            config.get<number>("capture.maxBreakpoints", defaultDebugCaptureLimits.maxBreakpoints),
            1,
            10_000,
            defaultDebugCaptureLimits.maxBreakpoints
        ),
        maxJsonPayloadChars: clampInt(
            config.get<number>("maxJsonPayloadChars", defaultDebugCaptureLimits.maxJsonPayloadChars),
            50_000,
            20_000_000,
            defaultDebugCaptureLimits.maxJsonPayloadChars
        ),
    };
}

export function truncateVariableValue(value: string, maxLen: number): string {
    if (value.length <= maxLen) return value;
    const suffix = "… [truncated]";
    const take = Math.max(0, maxLen - suffix.length);
    return value.slice(0, take) + suffix;
}

export function pathsEqualForBreakpointHint(a: string, b: string): boolean {
    if (a === b) return true;
    const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    return norm(a) === norm(b);
}
