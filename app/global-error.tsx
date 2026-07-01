"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main className="section-shell">
          <section className="panel panel-pad">
            <h1>사이트를 불러오지 못했습니다</h1>
            <p>사이트를 표시하는 중 문제가 발생했습니다.</p>
            <pre>{error.message || error.digest || "unknown error"}</pre>
            <button type="button" onClick={reset}>다시 시도</button>
          </section>
        </main>
      </body>
    </html>
  );
}
