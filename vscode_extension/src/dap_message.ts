/**
 * VS Code passes DAP traffic to DebugAdapterTracker hooks; shape can be a parsed object
 * or (in some hosts) a JSON string. Be defensive about casing.
 */
export function normalize_dap_event_message(
    message: unknown
): { type: string; event?: string; body?: unknown } | undefined {
    let m: unknown = message;
    if (typeof m === "string") {
        try {
            m = JSON.parse(m) as unknown;
        } catch {
            return undefined;
        }
    }
    if (!m || typeof m !== "object") return undefined;
    const o = m as Record<string, unknown>;
    const type_raw = o.type;
    if (type_raw === undefined || type_raw === null) return undefined;
    const type = String(type_raw).toLowerCase();
    const event_raw = o.event;
    const event =
        event_raw === undefined || event_raw === null ? undefined : String(event_raw).toLowerCase();
    return { type, event, body: o.body };
}
