export function createTimerState() {
    return { stallTimer: null, timeoutTimer: null };
}
export function startTimeoutTimer(state, timeoutMs, onTimeout) {
    state.timeoutTimer = setTimeout(onTimeout, timeoutMs);
}
export function startStallTimer(state, stallTimeoutMs, onStall) {
    if (stallTimeoutMs === null || stallTimeoutMs === 0)
        return;
    state.stallTimer = setTimeout(onStall, stallTimeoutMs);
}
export function resetStallTimer(state, stallTimeoutMs, onStall) {
    if (!state.stallTimer)
        return;
    clearTimeout(state.stallTimer);
    state.stallTimer = null;
    startStallTimer(state, stallTimeoutMs, onStall);
}
export function clearTimers(state) {
    if (state.timeoutTimer)
        clearTimeout(state.timeoutTimer);
    if (state.stallTimer)
        clearTimeout(state.stallTimer);
    state.timeoutTimer = state.stallTimer = null;
}
//# sourceMappingURL=shell-session-timers.js.map