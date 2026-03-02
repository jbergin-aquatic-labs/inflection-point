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
    private readonly _retryBaseDelayMs: number;
    private readonly _heartbeatIntervalMs: number;
    private _abortController: AbortController | null = null;
    private _heartbeatHandle: ReturnType<typeof setInterval> | null = null;

    constructor(
        port: number,
        sessionId: string,
        sessionName: string,
        workspacePath: string,
        fetchFn?: FetchFunction,
        timeoutMs: number = 5000,
        retryBaseDelayMs: number = 500,
        heartbeatIntervalMs: number = 30_000
    ) {
        this._sessionId = sessionId;
        this._sessionQueryParams = `name=${encodeURIComponent(sessionName)}&path=${encodeURIComponent(workspacePath)}`;
        this._serverUrl = `http://localhost:${port}`;
        this._fetch = fetchFn ?? globalThis.fetch.bind(globalThis);
        this._timeoutMs = timeoutMs;
        this._retryBaseDelayMs = retryBaseDelayMs;
        this._heartbeatIntervalMs = heartbeatIntervalMs;
    }

    startHeartbeat(): void {
        if (this._heartbeatIntervalMs <= 0) return;
        this._heartbeatHandle = setInterval(
            () => void this.registerSession(),
            this._heartbeatIntervalMs
        );
    }

    stopHeartbeat(): void {
        if (this._heartbeatHandle !== null) {
            clearInterval(this._heartbeatHandle);
            this._heartbeatHandle = null;
        }
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
            ),
            1
        );
    }

    dispose(): void {
        this.stopHeartbeat();
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

    private async send(action: string, request: () => Promise<Response>, maxAttempts: number = 3): Promise<Result> {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await request();
                return success();
            } catch (e: unknown) {
                const isRetryable = isNetworkError(e) ||
                    (e instanceof DOMException && e.name === "AbortError");

                if (isRetryable && attempt + 1 < maxAttempts) {
                    await sleep(computeDelay(attempt, this._retryBaseDelayMs));
                    continue;
                }

                if (e instanceof DOMException && e.name === "AbortError") {
                    return failure(new RequestTimedOutError(action));
                }
                return failure(new ServerUnreachableError(this._serverUrl, String(e)));
            }
        }

        // Unreachable, but TypeScript needs it
        return failure(new ServerUnreachableError(this._serverUrl, "Max retries exhausted"));
    }
}

function isNetworkError(e: unknown): boolean {
    if (e instanceof TypeError) return true; // fetch throws TypeError for network issues
    if (e instanceof Error && e.message.includes("ECONNREFUSED")) return true;
    return false;
}

function computeDelay(attempt: number, baseDelayMs: number): number {
    const jitter = Math.floor(Math.random() * (baseDelayMs + 1));
    return baseDelayMs * (1 << attempt) + jitter;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
