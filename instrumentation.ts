export async function register() {
  const runtime = process.env.NEXT_RUNTIME;

  if (runtime === "nodejs") {
    try {
      const { registerNodeInstrumentation } = await import("./lib/ops/instrumentation-node");
      registerNodeInstrumentation();
    } catch (error) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), service: "dynamic-draw", level: "ERROR", event: "NODE_INSTRUMENTATION_REGISTER_FAILED", error: error instanceof Error ? { name: error.name, message: error.message } : String(error) }));
    }
    return;
  }

  if (runtime === "edge") {
    try {
      const { registerEdgeInstrumentation } = await import("./lib/ops/instrumentation-edge");
      registerEdgeInstrumentation();
    } catch {
      // Edge runtime에서는 Node API를 쓰지 않고 조용히 no-op 처리합니다.
    }
  }
}
