"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="section-shell">
      <section className="panel panel-pad">
        <h1>페이지 표시 중 오류가 발생했습니다</h1>
        <p className="muted">페이지를 표시하는 중 문제가 발생했습니다. 배포 직후라면 Vercel 로그와 /api/ping을 확인해 주세요.</p>
        <pre className="code-block">{error.message || error.digest || "unknown error"}</pre>
        <button className="btn btn-primary" type="button" onClick={reset}>다시 시도</button>
      </section>
    </main>
  );
}
