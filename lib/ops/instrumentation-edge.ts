type GlobalWithInstrumentation = typeof globalThis & {
  __dynamicdEdgeInstrumentationRegistered?: boolean;
};

export function registerEdgeInstrumentation() {
  const globalWithFlag = globalThis as GlobalWithInstrumentation;
  if (globalWithFlag.__dynamicdEdgeInstrumentationRegistered) return;
  globalWithFlag.__dynamicdEdgeInstrumentationRegistered = true;
  // Edge 런타임에서는 Node 전용 이벤트 훅을 쓰지 않고 no-op만 수행합니다.
}
