import type { debug_state, result } from "../types";

export interface i_debug_state_publisher {
    start_heartbeat(): void;
    stop_heartbeat(): void;
    register_session(): Promise<result>;
    push_debug_state(state: debug_state): Promise<result>;
    clear_debug_state(): Promise<result>;
    deregister_session(): Promise<result>;
    dispose(): void;
}
