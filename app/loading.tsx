export default function Loading() {
  return (
    <main className="section-shell">
      <section className="panel panel-pad">
        <h1>페이지를 불러오는 중입니다</h1>
        <p className="muted">10초 이상 멈춰 있으면 새로고침하거나 /api/ping 상태를 확인해 주세요.</p>
      </section>
    </main>
  );
}
