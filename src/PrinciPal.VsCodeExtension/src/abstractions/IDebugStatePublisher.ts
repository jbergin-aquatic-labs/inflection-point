import type { DebugState, Result } from "../types.js";

export interface IDebugStatePublisher {
    registerSession(): Promise<Result>;
    pushDebugState(state: DebugState): Promise<Result>;
    clearDebugState(): Promise<Result>;
    deregisterSession(): Promise<Result>;
    dispose(): void;
}
