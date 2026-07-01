"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main className="section-shell">
          <section className="panel panel-pad">
            <p className="eyebrow">Global Error Guard</p>
            <h1>사이트를 불러오지 못했습니다</h1>
            <p>빈 화면으로 멈추지 않도록 긴급 오류 화면을 표시합니다.</p>
            <pre>{error.message || error.digest || "unknown error"}</pre>
            <button type="button" onClick={reset}>다시 시도</button>
          </section>
        </main>
      </body>
    </html>
  );
}
