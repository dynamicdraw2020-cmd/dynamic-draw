"use client";

import { useEffect, useState } from "react";

export function LoadingTimeoutCard({ title = "페이지를 불러오는 중입니다", description = "잠시만 기다려 주세요." }: { title?: string; description?: string }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="panel panel-pad">
      <h1>{timedOut ? "잠시 후 다시 시도해 주세요" : title}</h1>
      <p className="muted">
        {timedOut
          ? "서버 응답이 평소보다 느립니다. 새로고침하거나 잠시 뒤 다시 접속해 주세요. 사이트는 안전하게 대기 상태로 전환되었습니다."
          : description}
      </p>
    </section>
  );
}
