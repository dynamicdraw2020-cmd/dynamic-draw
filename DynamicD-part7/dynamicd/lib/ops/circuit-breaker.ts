import { RUNTIME_LIMITS, monotonicNow } from "@/lib/ops/runtime";
import { runtimeLog } from "@/lib/ops/logger";

type CircuitState = {
  failures: number;
  openedUntil: number;
  lastFailureAt: number;
};

type GlobalWithCircuit = typeof globalThis & {
  __dynamicdCircuitBreakers?: Map<string, CircuitState>;
};

const globalState = globalThis as GlobalWithCircuit;
const circuits = globalState.__dynamicdCircuitBreakers ?? new Map<string, CircuitState>();
globalState.__dynamicdCircuitBreakers = circuits;

function getState(key: string) {
  const current = circuits.get(key) ?? { failures: 0, openedUntil: 0, lastFailureAt: 0 };
  circuits.set(key, current);
  return current;
}

export function isCircuitOpen(key: string) {
  const state = getState(key);
  return state.openedUntil > Date.now();
}

export function circuitSnapshot(key: string) {
  const state = getState(key);
  return {
    key,
    failures: state.failures,
    open: state.openedUntil > Date.now(),
    openedUntil: state.openedUntil ? new Date(state.openedUntil).toISOString() : null,
    lastFailureAt: state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null,
  };
}

export function recordCircuitSuccess(key: string) {
  const state = getState(key);
  if (state.failures || state.openedUntil) {
    state.failures = 0;
    state.openedUntil = 0;
  }
}

export function recordCircuitFailure(key: string, error?: unknown) {
  const state = getState(key);
  state.failures += 1;
  state.lastFailureAt = Date.now();

  if (state.failures >= RUNTIME_LIMITS.circuitFailureThreshold) {
    state.openedUntil = Date.now() + RUNTIME_LIMITS.circuitCooldownMs;
    runtimeLog({
      level: "ERROR",
      event: "CIRCUIT_OPENED",
      details: circuitSnapshot(key),
      error,
    });
  }
}

export async function withCircuitBreaker<T>(key: string, work: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  if (isCircuitOpen(key)) {
    runtimeLog({ level: "WARN", event: "CIRCUIT_SHORT_CIRCUITED", details: circuitSnapshot(key) });
    return fallback();
  }

  const started = monotonicNow();
  try {
    const result = await work();
    recordCircuitSuccess(key);
    return result;
  } catch (error) {
    recordCircuitFailure(key, error);
    runtimeLog({ level: "WARN", event: "CIRCUIT_CALL_FAILED", durationMs: monotonicNow() - started, details: circuitSnapshot(key), error });
    return fallback();
  }
}
