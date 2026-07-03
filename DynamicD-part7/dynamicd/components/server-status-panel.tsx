"use client";

import { useEffect, useMemo, useState } from "react";
import { clientJsonRequest } from "@/lib/client-fetch";

type CheckResult = { name: string; ok: boolean; ms: number; message: string; details?: unknown };
type CountResult = { table: string; ok: boolean; count: number | null; ms: number; message: string };
type ServerStatusPayload = {
  ok: boolean;
  status: string;
  checkedAt: string;
  totalMs: number;
  environment: Record<string, unknown>;
  checks: CheckResult[];
  tableCounts: CountResult[];
  traffic: { level: string; message: string; note: string };
};

function niceJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function statusClass(ok: boolean) {
  return ok ? "status-badge approved" : "status-badge rejected";
}

export function ServerStatusPanel({ initialData }: { initialData: ServerStatusPayload | null }) {
  const [data, setData] = useState<ServerStatusPayload | null>(initialData);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      const body = await clientJsonRequest<{ data?: ServerStatusPayload | null }>(`/api/admin/server-status?ts=${Date.now()}`, {
        cache: "no-store",
        timeoutMs: 5000,
        fallbackMessage: "서버 상태를 불러오지 못했습니다.",
      });
      setData(body.data ?? null);
      setMessage(`갱신 완료 · ${new Date().toLocaleTimeString("ko-KR")}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태 조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!data) void refresh();
    // 최초 진입 즉시 한 번 확인한 뒤 자동 갱신합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  const dbPing = useMemo(() => data?.checks.find((item) => item.name === "database")?.ms ?? null, [data]);
  const appPing = useMemo(() => data?.checks.find((item) => item.name === "app")?.ms ?? 0, [data]);

  if (!data) {
    return (
      <section className="panel panel-pad">
        <h2 className="panel-title">서버 상태를 불러오는 중입니다</h2>
        <p className="muted">상태 API가 응답하지 않으면 새로고침을 눌러 주세요.</p>
        <button className="btn btn-primary" type="button" onClick={() => void refresh()} disabled={loading}>상태 다시 확인</button>
        {message && <p className="form-message error">{message}</p>}
      </section>
    );
  }

  return (
    <div className="form-grid">
      <section className="stats-grid">
        <div className="metric-card">
          <span>전체 상태</span>
          <strong>{data.status === "healthy" ? "정상" : "주의"}</strong>
          <p>{data.checkedAt}</p>
        </div>
        <div className="metric-card">
          <span>앱 Ping</span>
          <strong>{appPing}ms</strong>
          <p>Route handler 응답</p>
        </div>
        <div className="metric-card">
          <span>DB Ping</span>
          <strong>{dbPing === null ? "-" : `${dbPing}ms`}</strong>
          <p>Supabase service-role 조회</p>
        </div>
        <div className="metric-card">
          <span>트래픽 상태</span>
          <strong>{data.traffic.level}</strong>
          <p>{data.traffic.message}</p>
        </div>
      </section>

      <section className="panel panel-pad">
        <div className="table-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="panel-title mb-0">실시간 점검</h2>
            <p className="muted">15초 자동 갱신 · 마지막 처리 {data.totalMs}ms</p>
          </div>
          <div className="table-actions">
            <label className="checkbox-line">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> 자동 갱신
            </label>
            <button className="btn btn-secondary" type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "확인 중..." : "즉시 갱신"}</button>
          </div>
        </div>
        {message && <p className="form-message info">{message}</p>}
        <div className="table-wrap mt-3">
          <table className="data-table">
            <thead><tr><th>항목</th><th>상태</th><th>Ping</th><th>메시지</th></tr></thead>
            <tbody>
              {data.checks.map((check) => (
                <tr key={check.name}>
                  <td>{check.name}</td>
                  <td><span className={statusClass(check.ok)}>{check.ok ? "OK" : "FAIL"}</span></td>
                  <td>{check.ms}ms</td>
                  <td>{check.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title">DB 테이블 카운트</h2>
        <div className="table-wrap mt-3">
          <table className="data-table">
            <thead><tr><th>테이블</th><th>상태</th><th>행 수</th><th>응답</th><th>메시지</th></tr></thead>
            <tbody>
              {data.tableCounts.map((item) => (
                <tr key={item.table}>
                  <td>{item.table}</td>
                  <td><span className={statusClass(item.ok)}>{item.ok ? "OK" : "FAIL"}</span></td>
                  <td>{item.count === null ? "-" : item.count.toLocaleString()}</td>
                  <td>{item.ms}ms</td>
                  <td>{item.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title">환경 정보</h2>
        <pre className="code-block">{niceJson(data.environment)}</pre>
        <p className="muted">{data.traffic.note}</p>
      </section>
    </div>
  );
}
