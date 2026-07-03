"use client";

import { Ban, LoaderCircle, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { clientJsonRequest } from "@/lib/client-fetch";

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

type ReleaseRow = {
  id: string;
  target_kind: string;
  target_value: string;
  release_reason: string | null;
  status: string;
  used_count: number | null;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
  consumed_at: string | null;
  consumed_login_id: string | null;
  consumed_ip: string | null;
  consumed_browser_fingerprint: string | null;
  issued_by: string | null;
};

type SecurityData = {
  events: SecurityEvent[];
  blocklist: BlockRow[];
  releases: ReleaseRow[];
  canReleaseSignupGuard: boolean;
  stats: {
    events24h: number;
    critical24h: number;
    pendingMembers: number;
    riskLogs24h: number;
  };
};

async function postSecurity(body: Record<string, unknown>) {
  const data = await clientJsonRequest<{ data?: unknown }>("/api/admin/security", {
    method: "POST",
    json: body,
    timeoutMs: 5000,
    fallbackMessage: "보안 작업을 처리하지 못했습니다.",
  });
  return data.data ?? data;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { hour12: false });
}

function severityLabel(value: string) {
  if (value === "CRITICAL") return "긴급";
  if (value === "HIGH") return "높음";
  if (value === "MEDIUM") return "주의";
  return "기록";
}

function statusLabel(value: string) {
  if (value === "ACTIVE") return "대기";
  if (value === "CONSUMED") return "사용됨";
  if (value === "EXPIRED") return "만료";
  if (value === "REVOKED") return "회수";
  return value;
}

function kindLabel(value: string) {
  if (value === "FINGERPRINT") return "기기 지문";
  if (value === "LOGIN_ID") return "아이디";
  return "IP";
}

export function SecurityControlPanel({ data }: { data: SecurityData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function action(key: string, body: Record<string, unknown>, success: (result: Record<string, unknown>) => string) {
    try {
      setLoading(key);
      setMessage(null);
      const result = (await postSecurity(body)) as Record<string, unknown>;
      setMessage({ type: "success", text: success(result) });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "보안 작업 실패" });
    } finally {
      setLoading(null);
    }
  }

  async function blockManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await action(
      "block",
      {
        action: "block-value",
        kind: formData.get("kind"),
        value: String(formData.get("value") ?? "").trim(),
        reason: String(formData.get("reason") ?? "").trim() || "관리자 수동 차단",
        minutes: Number(formData.get("minutes") || 1440),
      },
      () => "차단 규칙을 추가했습니다.",
    );
    form.reset();
  }

  async function releaseManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await action(
      "release-manual",
      {
        action: "allow-one-signup",
        targetKind: formData.get("targetKind"),
        targetValue: String(formData.get("targetValue") ?? "").trim(),
        reason: String(formData.get("reason") ?? "").trim() || "최고관리자 1회 가입 허용",
        expiresMinutes: Number(formData.get("expiresMinutes") || 240),
      },
      () => "가입 방어 1회 허용권을 발급했습니다.",
    );
    form.reset();
  }

  return (
    <div className="stack-lg">
      {message && <div className={message.type === "success" ? "notice success" : "notice danger"}>{message.text}</div>}

      <section className="stats-grid">
        <div className="stat-card"><span>24시간 보안 이벤트</span><strong>{data.stats.events24h.toLocaleString()}</strong></div>
        <div className="stat-card"><span>긴급 이벤트</span><strong>{data.stats.critical24h.toLocaleString()}</strong></div>
        <div className="stat-card"><span>승인 대기</span><strong>{data.stats.pendingMembers.toLocaleString()}</strong></div>
        <div className="stat-card"><span>중복가입 로그</span><strong>{data.stats.riskLogs24h.toLocaleString()}</strong></div>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title"><ShieldAlert size={18} /> 긴급 방어</h2>
        <div className="table-actions mt-2">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              if (!window.confirm("봇으로 의심되는 승인 대기 계정을 일괄 정지할까요?")) return;
              void action("quarantine", { action: "quarantine-suspicious-pending" }, (result) =>
                `의심 계정 ${Number(result.suspendedCount ?? 0).toLocaleString()}명을 정지했습니다.`,
              );
            }}
            disabled={loading === "quarantine"}
          >
            {loading === "quarantine" ? <LoaderCircle size={17} className="spin" /> : <Ban size={17} />} 의심 대기 계정 정지
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void action("expired", { action: "deactivate-expired" }, (result) => `만료 차단 ${Number(result.updatedCount ?? 0).toLocaleString()}건을 정리했습니다.`)}
            disabled={loading === "expired"}
          >
            {loading === "expired" ? <LoaderCircle size={17} className="spin" /> : <Trash2 size={17} />} 만료 차단 정리
          </button>
        </div>
      </section>

      <div className="grid-2">
        <form className="panel panel-pad stack-sm" onSubmit={blockManual}>
          <h2 className="panel-title"><Ban size={18} /> 수동 차단</h2>
          <label>종류<select className="select" name="kind" defaultValue="IP"><option value="IP">IP</option><option value="FINGERPRINT">기기 지문</option><option value="LOGIN_ID">아이디</option></select></label>
          <label>값<input className="input" name="value" placeholder="차단할 IP, 기기 지문, 아이디" required /></label>
          <label>차단 시간<select className="select" name="minutes" defaultValue="1440"><option value="30">30분</option><option value="60">1시간</option><option value="240">4시간</option><option value="1440">1일</option><option value="10080">7일</option></select></label>
          <label>사유<input className="input" name="reason" placeholder="예: 반복 가입 시도" /></label>
          <button className="btn btn-primary" disabled={loading === "block"}>{loading === "block" ? <LoaderCircle size={17} className="spin" /> : <Ban size={17} />} 차단 추가</button>
        </form>

        <form className="panel panel-pad stack-sm" onSubmit={releaseManual}>
          <h2 className="panel-title"><ShieldCheck size={18} /> 1회 가입 허용</h2>
          <p className="muted">최고관리자만 발급할 수 있습니다. 한 번 발급하면 가입 시도 1회에만 사용되고 자동으로 소진됩니다.</p>
          <label>대상 종류<select className="select" name="targetKind" defaultValue="IP" disabled={!data.canReleaseSignupGuard}><option value="IP">IP</option><option value="FINGERPRINT">기기 지문</option><option value="LOGIN_ID">아이디</option></select></label>
          <label>대상 값<input className="input" name="targetValue" placeholder="허용할 IP, 기기 지문, 아이디" required disabled={!data.canReleaseSignupGuard} /></label>
          <label>유효 시간<select className="select" name="expiresMinutes" defaultValue="240" disabled={!data.canReleaseSignupGuard}><option value="30">30분</option><option value="60">1시간</option><option value="240">4시간</option><option value="1440">1일</option></select></label>
          <label>사유<input className="input" name="reason" placeholder="예: 본인확인 완료 후 1회 허용" disabled={!data.canReleaseSignupGuard} /></label>
          <button className="btn btn-primary" disabled={!data.canReleaseSignupGuard || loading === "release-manual"}>{loading === "release-manual" ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />} 1회 허용 발급</button>
          {!data.canReleaseSignupGuard && <p className="text-muted text-small">최고관리자 전용 기능입니다.</p>}
        </form>
      </div>

      <section className="panel panel-pad">
        <h2 className="panel-title">활성 차단 목록</h2>
        <div className="table-wrap mt-2"><table className="table"><thead><tr><th>대상</th><th>사유/만료</th><th>관리</th></tr></thead><tbody>
          {data.blocklist.length ? data.blocklist.map((row) => (
            <tr key={row.id}>
              <td><strong>{kindLabel(row.kind)}</strong> · {row.value}<div className="text-muted text-small">등록 {formatDateTime(row.created_at)}</div></td>
              <td>{row.reason ?? "사유 없음"}<div className="text-muted text-small">만료 {row.expires_at ? formatDateTime(row.expires_at) : "만료 없음"}</div></td>
              <td>{data.canReleaseSignupGuard ? <button className="btn btn-secondary btn-sm" type="button" onClick={() => void action(`release-${row.id}`, { action: "allow-one-signup", id: row.id, reason: "차단 대상 최고관리자 1회 가입 허용" }, () => "이 차단 대상에게 1회 가입 허용권을 발급했습니다. 차단 규칙은 그대로 유지됩니다.")} disabled={loading === `release-${row.id}`}>1회 가입 허용</button> : <span className="text-muted text-small">최고관리자 전용</span>}</td>
            </tr>
          )) : <tr><td colSpan={3}><div className="empty">활성 차단 규칙이 없습니다.</div></td></tr>}
        </tbody></table></div>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title">최근 1회 가입 허용권</h2>
        <div className="table-wrap mt-2"><table className="table"><thead><tr><th>대상</th><th>상태</th><th>사유</th><th>사용 정보</th></tr></thead><tbody>
          {data.releases.length ? data.releases.map((row) => (
            <tr key={row.id}>
              <td><strong>{kindLabel(row.target_kind)}</strong> · {row.target_value}<div className="text-muted text-small">발급 {formatDateTime(row.created_at)}</div></td>
              <td>{statusLabel(row.status)} · {(row.used_count ?? 0).toLocaleString()}/{(row.max_uses ?? 1).toLocaleString()}<div className="text-muted text-small">만료 {row.expires_at ? formatDateTime(row.expires_at) : "없음"}</div></td>
              <td>{row.release_reason ?? "사유 없음"}</td>
              <td>{row.consumed_at ? <>{formatDateTime(row.consumed_at)}<div className="text-muted text-small">아이디 {row.consumed_login_id ?? "-"} · IP {row.consumed_ip ?? "-"}</div></> : <span className="text-muted text-small">아직 사용되지 않음</span>}</td>
            </tr>
          )) : <tr><td colSpan={4}><div className="empty">발급된 1회 허용권이 없습니다.</div></td></tr>}
        </tbody></table></div>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title">최근 보안 이벤트</h2>
        <div className="stack-sm mt-2">
          {data.events.length ? data.events.map((event) => (
            <div className="panel-subtle" key={event.id}>
              <strong>{event.event_type}</strong> <span className="badge">{severityLabel(event.severity)}</span>
              <p className="muted mb-0">{event.reason ?? "사유 없음"}</p>
              <p className="text-muted text-small mb-0">IP {event.ip_address ?? "unknown"} · 기기 {event.browser_fingerprint ?? "unknown"} · 아이디 {event.login_id ?? "-"} · {formatDateTime(event.created_at)}</p>
            </div>
          )) : <div className="empty">보안 이벤트가 없습니다.</div>}
        </div>
      </section>
    </div>
  );
}
