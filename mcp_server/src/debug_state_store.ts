import type { debug_state, debug_state_snapshot, expression_result } from "./domain_types.js";

/**
 * Pure domain store (matches C# DebugStateStore). Not thread-safe; session manager serializes access.
 */
export class debug_state_store {
    max_history_size = 50;
    private current_state: debug_state | undefined;
    private last_expression: expression_result | undefined;
    private readonly history: debug_state_snapshot[] = [];
    private next_index = 0;

    get total_captured(): number {
        return this.next_index;
    }

    update(state: debug_state): void {
        this.current_state = state;
        if (state.is_in_break_mode) {
            if (this.history.length >= this.max_history_size) {
                this.history.shift();
            }
            this.history.push({
                index: this.next_index++,
                captured_at: new Date().toISOString(),
                state,
            });
        }
    }

    update_expression(result: expression_result): void {
        this.last_expression = result;
    }

    get_current_state(): debug_state | undefined {
        return this.current_state;
    }

    get_last_expression(): expression_result | undefined {
        return this.last_expression;
    }

    get_history(): debug_state_snapshot[] {
        return [...this.history];
    }

    get_snapshot(index: number): debug_state_snapshot | undefined {
        return this.history.find((s) => s.index === index);
    }

    clear(): void {
        this.current_state = undefined;
    }

    clear_history(): void {
        this.history.length = 0;
    }
}
