"use client";

import { Ban, LoaderCircle, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatDateTime } from "@/lib/utils";

type SecurityEvent = {
  id: string;
  event_type: string;
  severity: string;
  ip_address: string | null;
  browser_fingerprint: string | null;
  login_id: string | null;
  display_name: string | null;
  reason: string | null;
  created_at: string;
};

type BlockRow = {
  id: string;
  kind: string;
  value: string;
  reason: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

type SecurityData = {
  events: SecurityEvent[];
  blocklist: BlockRow[];
  stats: {
    events24h: number;
    critical24h: number;
    pendingMembers: number;
    riskLogs24h: number;
  };
};

async function postSecurity(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/security", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "보안 작업을 처리하지 못했습니다.");
  return data.data ?? data;
}

function severityLabel(value: string) {
  if (value === "CRITICAL") return "긴급";
  if (value === "HIGH") return "높음";
  if (value === "MEDIUM") return "주의";
  return "기록";
}

export function SecurityControlPanel({ data }: { data: SecurityData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function action(key: string, body: Record<string, unknown>, success: (result: Record<string, unknown>) => string) {
    try {
      setLoading(key);
      setMessage("");
      const result = await postSecurity(body) as Record<string, unknown>;
      setMessage(success(result));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "보안 작업 실패");
    } finally {
      setLoading(null);
    }
  }

  async function blockManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action("block", {
      action: "block-value",
      kind: form.get("kind"),
      value: String(form.get("value") ?? "").trim(),
      reason: String(form.get("reason") ?? "").trim() || "관리자 수동 차단",
      minutes: Number(form.get("minutes") || 1440),
    }, () => "차단 규칙을 추가했습니다.");
    event.currentTarget.reset();
  }

  return <div className="grid gap-3">
    {message && <div className="form-message form-info">{message}</div>}

    <section className="security-metric-grid">
      <article className="security-metric"><span>24시간 보안 이벤트</span><strong>{data.stats.events24h.toLocaleString()}</strong></article>
      <article className="security-metric"><span>긴급 이벤트</span><strong>{data.stats.critical24h.toLocaleString()}</strong></article>
      <article className="security-metric"><span>승인 대기</span><strong>{data.stats.pendingMembers.toLocaleString()}</strong></article>
      <article className="security-metric"><span>중복가입 로그</span><strong>{data.stats.riskLogs24h.toLocaleString()}</strong></article>
    </section>

    <section className="panel panel-pad">
      <div className="table-topbar">
        <h2 className="panel-title mb-0"><ShieldAlert size={20} /> 긴급 방어</h2>
        <div className="table-actions">
          <button className="btn btn-danger" type="button" disabled={loading === "quarantine"} onClick={() => {
            if (!window.confirm("봇으로 의심되는 승인 대기 계정을 일괄 정지할까요?")) return;
            void action("quarantine", { action: "quarantine-suspicious-pending" }, (result) => `의심 계정 ${Number(result.suspendedCount ?? 0).toLocaleString()}명을 정지했습니다.`);
          }}>{loading === "quarantine" ? <LoaderCircle size={16} className="spin" /> : <Ban size={16} />} 의심 대기 계정 정지</button>
          <button className="btn btn-secondary" type="button" disabled={loading === "expired"} onClick={() => void action("expired", { action: "deactivate-expired" }, (result) => `만료 차단 ${Number(result.updatedCount ?? 0).toLocaleString()}건을 정리했습니다.`)}>{loading === "expired" ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />} 만료 차단 정리</button>
        </div>
      </div>
    </section>

    <section className="panel panel-pad">
      <h2 className="panel-title">수동 차단</h2>
      <form className="form-grid mt-2" onSubmit={blockManual}>
        <div className="form-row">
          <div className="field"><label>종류</label><select className="select" name="kind" defaultValue="IP"><option value="IP">IP</option><option value="FINGERPRINT">기기 지문</option><option value="LOGIN_ID">아이디</option></select></div>
          <div className="field"><label>값</label><input className="input" name="value" required placeholder="예: 123.123.123.123 또는 fp_..." /></div>
          <div className="field"><label>차단 시간</label><input className="input" name="minutes" type="number" min="5" max="10080" defaultValue="1440" /></div>
        </div>
        <div className="field"><label>사유</label><input className="input" name="reason" placeholder="예: 가입 매크로 의심" /></div>
        <button className="btn btn-primary" disabled={loading === "block"}>{loading === "block" ? <LoaderCircle size={16} className="spin" /> : <ShieldAlert size={16} />} 차단 추가</button>
      </form>
    </section>

    <section className="panel panel-pad">
      <h2 className="panel-title">활성 차단 목록</h2>
      <div className="grid gap-2 mt-2">
        {data.blocklist.length ? data.blocklist.map((row) => <article className="security-event-card" key={row.id}>
          <div className="flex items-center justify-between gap-2"><strong>{row.kind} · {row.value}</strong><span className="security-severity">차단</span></div>
          <span className="text-muted text-small">{row.reason ?? "사유 없음"} · 만료 {row.expires_at ? formatDateTime(row.expires_at) : "수동 해제"}</span>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void action(`unblock-${row.id}`, { action: "unblock", id: row.id }, () => "차단을 해제했습니다.")} disabled={loading === `unblock-${row.id}`}><Trash2 size={14} /> 해제</button>
        </article>) : <div className="empty">활성 차단 규칙이 없습니다.</div>}
      </div>
    </section>

    <section className="panel panel-pad">
      <h2 className="panel-title">최근 보안 이벤트</h2>
      <div className="grid gap-2 mt-2">
        {data.events.length ? data.events.map((event) => <article className="security-event-card" key={event.id}>
          <div className="flex items-center justify-between gap-2"><strong>{event.event_type}</strong><span className="security-severity">{severityLabel(event.severity)}</span></div>
          <span>{event.reason ?? "사유 없음"}</span>
          <span className="text-muted text-small">IP {event.ip_address ?? "unknown"} · 기기 {event.browser_fingerprint ?? "unknown"} · 아이디 {event.login_id ?? "-"} · {formatDateTime(event.created_at)}</span>
        </article>) : <div className="empty">보안 이벤트가 없습니다.</div>}
      </div>
    </section>
  </div>;
}
