import { runtimeLog } from "./logger";

type NodeLikeProcess = {
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

type GlobalWithInstrumentation = typeof globalThis & {
  __dynamicdNodeInstrumentationRegistered?: boolean;
  process?: NodeLikeProcess;
};

function safeErrorPayload(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack };
  }
  return { message: typeof error === "string" ? error : "unknown" };
}

export function registerNodeInstrumentation() {
  const globalWithFlag = globalThis as GlobalWithInstrumentation;
  if (globalWithFlag.__dynamicdNodeInstrumentationRegistered) return;
  globalWithFlag.__dynamicdNodeInstrumentationRegistered = true;

  const nodeProcess = globalWithFlag.process;
  const on = nodeProcess?.on;
  if (typeof on !== "function") {
    runtimeLog({ level: "WARN", event: "NODE_INSTRUMENTATION_PROCESS_UNAVAILABLE" });
    return;
  }

  on.call(nodeProcess, "unhandledRejection", (reason) => {
    runtimeLog({ level: "ERROR", event: "UNHANDLED_PROMISE_REJECTION", error: reason, details: safeErrorPayload(reason) });
  });

  on.call(nodeProcess, "uncaughtException", (error) => {
    runtimeLog({ level: "CRITICAL", event: "UNCAUGHT_EXCEPTION", error, details: safeErrorPayload(error) });
  });

  runtimeLog({ level: "INFO", event: "NODE_INSTRUMENTATION_REGISTERED", details: { version: "v1.7.2" } });
}
