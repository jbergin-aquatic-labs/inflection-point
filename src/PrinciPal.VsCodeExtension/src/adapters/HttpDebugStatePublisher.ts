import type { IDebugStatePublisher } from "../abstractions/IDebugStatePublisher.js";
import type { DebugState, Result } from "../types.js";
import { success, failure, ServerUnreachableError, RequestTimedOutError } from "../types.js";

export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Posts debug state to the MCP server over HTTP.
 * Direct port of C# HttpDebugStatePublisher — same endpoints, same JSON format.
 */
export class HttpDebugStatePublisher implements IDebugStatePublisher {
    private readonly _serverUrl: string;
    private readonly _sessionId: string;
    private readonly _sessionQueryParams: string;
    private readonly _fetch: FetchFunction;
    private readonly _timeoutMs: number;
    private _abortController: AbortController | null = null;

    constructor(
        port: number,
        sessionId: string,
        sessionName: string,
        workspacePath: string,
        fetchFn?: FetchFunction,
        timeoutMs: number = 5000
    ) {
        this._sessionId = sessionId;
        this._sessionQueryParams = `name=${encodeURIComponent(sessionName)}&path=${encodeURIComponent(workspacePath)}`;
        this._serverUrl = `http://localhost:${port}`;
        this._fetch = fetchFn ?? globalThis.fetch.bind(globalThis);
        this._timeoutMs = timeoutMs;
    }

    async registerSession(): Promise<Result> {
        return this.send("Register", () =>
            this.doFetch(
                `${this._serverUrl}/api/sessions/${encodeURIComponent(this._sessionId)}?${this._sessionQueryParams}`,
                { method: "POST" }
            )
        );
    }

    async pushDebugState(state: DebugState): Promise<Result> {
        const body = JSON.stringify(state);
        return this.send("Push", () =>
            this.doFetch(
                `${this._serverUrl}/api/sessions/${encodeURIComponent(this._sessionId)}/debug-state?${this._sessionQueryParams}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                }
            )
        );
    }

    async clearDebugState(): Promise<Result> {
        return this.send("Clear", () =>
            this.doFetch(
                `${this._serverUrl}/api/sessions/${encodeURIComponent(this._sessionId)}/debug-state`,
                { method: "DELETE" }
            )
        );
    }

    async deregisterSession(): Promise<Result> {
        return this.send("Deregister", () =>
            this.doFetch(
                `${this._serverUrl}/api/sessions/${encodeURIComponent(this._sessionId)}`,
                { method: "DELETE" }
            )
        );
    }

    dispose(): void {
        this._abortController?.abort();
    }

    private async doFetch(url: string, init: RequestInit): Promise<Response> {
        this._abortController = new AbortController();
        const timeoutId = setTimeout(() => this._abortController?.abort(), this._timeoutMs);
        try {
            return await this._fetch(url, { ...init, signal: this._abortController.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async send(action: string, request: () => Promise<Response>): Promise<Result> {
        try {
            await request();
            return success();
        } catch (e: unknown) {
            if (e instanceof DOMException && e.name === "AbortError") {
                return failure(new RequestTimedOutError(action));
            }
            if (isNetworkError(e)) {
                return failure(new ServerUnreachableError(this._serverUrl, String(e)));
            }
            return failure(new ServerUnreachableError(this._serverUrl, String(e)));
        }
    }
}

function isNetworkError(e: unknown): boolean {
    if (e instanceof TypeError) return true; // fetch throws TypeError for network issues
    if (e instanceof Error && e.message.includes("ECONNREFUSED")) return true;
    return false;
}
