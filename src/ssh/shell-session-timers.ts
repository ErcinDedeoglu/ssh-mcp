export interface TimerState {
  stallTimer: ReturnType<typeof setTimeout> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

export interface TimerCallbacks {
  onTimeout: () => void;
  onStall: () => void;
}

export function createTimerState(): TimerState {
  return { stallTimer: null, timeoutTimer: null };
}

export function startTimeoutTimer(
  state: TimerState,
  timeoutMs: number,
  onTimeout: () => void,
): void {
  state.timeoutTimer = setTimeout(onTimeout, timeoutMs);
}

export function startStallTimer(
  state: TimerState,
  stallTimeoutMs: number | null,
  onStall: () => void,
): void {
  if (stallTimeoutMs === null || stallTimeoutMs === 0) return;
  state.stallTimer = setTimeout(onStall, stallTimeoutMs);
}

export function resetStallTimer(
  state: TimerState,
  stallTimeoutMs: number | null,
  onStall: () => void,
): void {
  if (!state.stallTimer) return;
  clearTimeout(state.stallTimer);
  state.stallTimer = null;
  startStallTimer(state, stallTimeoutMs, onStall);
}

export function clearTimers(state: TimerState): void {
  if (state.timeoutTimer) clearTimeout(state.timeoutTimer);
  if (state.stallTimer) clearTimeout(state.stallTimer);
  state.timeoutTimer = state.stallTimer = null;
}
