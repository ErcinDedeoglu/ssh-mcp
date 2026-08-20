export interface TimerState {
    stallTimer: ReturnType<typeof setTimeout> | null;
    timeoutTimer: ReturnType<typeof setTimeout> | null;
}
export interface TimerCallbacks {
    onTimeout: () => void;
    onStall: () => void;
}
export declare function createTimerState(): TimerState;
export declare function startTimeoutTimer(state: TimerState, timeoutMs: number, onTimeout: () => void): void;
export declare function startStallTimer(state: TimerState, stallTimeoutMs: number | null, onStall: () => void): void;
export declare function resetStallTimer(state: TimerState, stallTimeoutMs: number | null, onStall: () => void): void;
export declare function clearTimers(state: TimerState): void;
//# sourceMappingURL=shell-session-timers.d.ts.map