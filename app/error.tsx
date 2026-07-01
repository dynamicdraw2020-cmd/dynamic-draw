"use client";

import { useEffect } from "react";
import { clientJsonRequest } from "@/lib/client-fetch";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    clientJsonRequest("/api/ops/error-log", {
      method: "POST",
      json: { event: "APP_ERROR_BOUNDARY", message: error.message, details: { digest: error.digest } },
      timeoutMs: 5000,
      retries: 0,
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="section-shell">
      <section className="panel panel-pad">
        <h1>페이지 표시 중 오류가 발생했습니다</h1>
        <p className="muted">일시적인 오류로 화면 표시를 중단했습니다. 새로고침 없이 다시 시도할 수 있습니다.</p>
        {process.env.NODE_ENV !== "production" ? <pre className="code-block">{error.message || error.digest || "unknown error"}</pre> : null}
        <button className="btn btn-primary" type="button" onClick={reset}>다시 시도</button>
      </section>
    </main>
  );
}
