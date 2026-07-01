"use client";

import { useEffect } from "react";
import { clientJsonRequest } from "@/lib/client-fetch";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    clientJsonRequest("/api/ops/error-log", {
      method: "POST",
      json: { event: "GLOBAL_ERROR_BOUNDARY", message: error.message, details: { digest: error.digest } },
      timeoutMs: 5000,
      retries: 0,
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main className="section-shell">
          <section className="panel panel-pad">
            <h1>사이트를 불러오지 못했습니다</h1>
            <p>일시적인 오류로 사이트 표시를 중단했습니다. 잠시 후 다시 시도해 주세요.</p>
            {process.env.NODE_ENV !== "production" ? <pre>{error.message || error.digest || "unknown error"}</pre> : null}
            <button type="button" onClick={reset}>다시 시도</button>
          </section>
        </main>
      </body>
    </html>
  );
}
