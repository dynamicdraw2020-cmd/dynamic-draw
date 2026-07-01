import { runtimeLog } from "@/lib/ops/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const globalWithFlag = globalThis as typeof globalThis & { __dynamicdInstrumentationRegistered?: boolean };
  if (globalWithFlag.__dynamicdInstrumentationRegistered) return;
  globalWithFlag.__dynamicdInstrumentationRegistered = true;

  process.on("unhandledRejection", (reason) => {
    runtimeLog({ level: "ERROR", event: "UNHANDLED_PROMISE_REJECTION", error: reason });
  });

  process.on("uncaughtException", (error) => {
    runtimeLog({ level: "CRITICAL", event: "UNCAUGHT_EXCEPTION", error });
  });
}
