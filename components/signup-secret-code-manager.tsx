"use client";

import { Clipboard, ExternalLink, KeyRound, LoaderCircle, RotateCcw, Settings, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/utils";

type SecretCode = {
  id: string;
  code_label: string;
  issued_by: string | null;
  issued_to_note: string | null;
  expires_at: string;
  used_by: string | null;
  used_login_id: string | null;
  used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string;
};

type IssuedCode = {
  id: string;
  code: string;
  codeLabel: string;
  expiresAt: string;
};

type SettingsValue = {
  requestUrl: string;
  buttonLabel: string;
  helpText: string;
  canEditSettings: boolean;
};

function statusOf(code: SecretCode) {
  if (code.used_at) return { label: "사용됨", className: "status-badge approved" };
  if (code.revoked_at) return { label: "회수됨", className: "status-badge rejected" };
  if (new Date(code.expires_at).getTime() < Date.now()) return { label: "만료", className: "status-badge suspended" };
  return { label: "사용 가능", className: "status-badge pending" };
}

async function jsonRequest(url: string, body: unknown = {}, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function SignupSecretCodeManager({
  initialCodes,
  settings,
}: {
  initialCodes: SecretCode[];
  settings: SettingsValue;
}) {
  const router = useRouter();
  const [codes, setCodes] = useState(initialCodes);
  const [lastIssued, setLastIssued] = useState<IssuedCode[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [requestUrl, setRequestUrl] = useState(settings.requestUrl);
  const [buttonLabel, setButtonLabel] = useState(settings.buttonLabel || "시크릿코드 신청하기");
  const [helpText, setHelpText] = useState(settings.helpText || "관리자가 안내한 링크에서 CS에게 1회용 시크릿코드를 요청해 주세요.");

  const activeCount = useMemo(() => codes.filter((code) => statusOf(code).label === "사용 가능").length, [codes]);

  async function refresh() {
    setLoading("refresh");
    try {
      const body = await jsonRequest("/api/admin/signup-secret-codes", {}, "GET");
      setCodes(body.data?.codes ?? []);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get("quantity") || 1);
    const note = String(form.get("note") ?? "").trim();

    setLoading("issue");
    try {
      const body = await jsonRequest("/api/admin/signup-secret-codes", { quantity, note });
      const issued = (body.data?.issued ?? []) as IssuedCode[];
      setLastIssued(issued);
      await refresh();
      (event.currentTarget as HTMLFormElement).reset();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function revoke(code: SecretCode) {
    const status = statusOf(code).label;
    if (status !== "사용 가능") return window.alert("사용 가능 상태의 코드만 회수할 수 있습니다.");
    const reason = window.prompt("회수 사유를 입력해 주세요.", "관리자 회수")?.trim() || "관리자 회수";
    setLoading(code.id);
    try {
      await jsonRequest(`/api/admin/signup-secret-codes/${code.id}/revoke`, { reason });
      await refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("settings");
    try {
      await jsonRequest(
        "/api/admin/signup-secret-settings",
        { requestUrl: requestUrl.trim(), buttonLabel: buttonLabel.trim(), helpText: helpText.trim() },
        "PATCH",
      );
      window.alert("회원가입 시크릿코드 신청 버튼 설정이 저장되었습니다.");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    window.alert("복사되었습니다. 이 코드는 다시 조회할 수 없으니 필요한 CS 채널에 바로 전달해 주세요.");
  }

  return (
    <div className="stack-xl">
      <section className="panel panel-pad">
        <div className="section-head">
          <div>
            <p className="eyebrow">Signup Gate</p>
            <h2 className="panel-title">가입 시크릿코드 발급</h2>
            <p className="muted">모든 관리자가 발급할 수 있습니다. 코드는 1회용이며 발급 후 4시간이 지나면 자동으로 사용할 수 없습니다.</p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => void refresh()} disabled={loading === "refresh"}>
            {loading === "refresh" ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />} 새로고침
          </button>
        </div>

        <form className="form-grid mt-4" onSubmit={issue}>
          <label className="field-label">
            <span>발급 수량</span>
            <input className="input" type="number" name="quantity" min={1} max={20} defaultValue={1} />
          </label>
          <label className="field-label">
            <span>메모</span>
            <input className="input" name="note" maxLength={120} placeholder="예: 카카오 CS 요청자 / 홍길동" />
          </label>
          <button className="btn btn-primary" disabled={loading === "issue"}>
            {loading === "issue" ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />} 4시간 코드 발급
          </button>
        </form>

        {lastIssued.length > 0 && (
          <div className="notice-box mt-4">
            <strong>방금 발급된 코드</strong>
            <p>평문 코드는 지금만 표시됩니다. CS에게 전달하기 전에 꼭 복사해 주세요.</p>
            <div className="grid-auto mt-3">
              {lastIssued.map((item) => (
                <button className="btn btn-secondary" type="button" key={item.id} onClick={() => void copy(item.code)}>
                  <Clipboard size={15} /> {item.code}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel panel-pad">
        <div className="section-head">
          <div>
            <p className="eyebrow">CS Button</p>
            <h2 className="panel-title">회원가입 화면 신청 버튼</h2>
            <p className="muted">회원가입 화면에서 사용자가 누를 CS 연결 버튼입니다.</p>
          </div>
          {requestUrl && (
            <a className="btn btn-secondary" href={requestUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> 현재 링크 열기
            </a>
          )}
        </div>

        <form className="form-grid mt-4" onSubmit={saveSettings}>
          <label className="field-label">
            <span>버튼 문구</span>
            <input className="input" value={buttonLabel} onChange={(event) => setButtonLabel(event.target.value)} maxLength={40} disabled={!settings.canEditSettings} />
          </label>
          <label className="field-label">
            <span>CS 연결 링크</span>
            <input className="input" value={requestUrl} onChange={(event) => setRequestUrl(event.target.value)} placeholder="https://open.kakao.com/... 또는 /support" disabled={!settings.canEditSettings} />
          </label>
          <label className="field-label">
            <span>안내 문구</span>
            <input className="input" value={helpText} onChange={(event) => setHelpText(event.target.value)} maxLength={160} disabled={!settings.canEditSettings} />
          </label>
          <button className="btn btn-secondary" disabled={!settings.canEditSettings || loading === "settings"}>
            {loading === "settings" ? <LoaderCircle size={16} className="spin" /> : <Settings size={16} />} 신청 버튼 설정 저장
          </button>
          {!settings.canEditSettings && <p className="muted">신청 버튼 링크 설정은 일반 관리자 이상만 변경할 수 있습니다. 시크릿코드 발급은 가능합니다.</p>}
        </form>
      </section>

      <section className="panel panel-pad">
        <div className="section-head">
          <div>
            <p className="eyebrow">Issued Codes</p>
            <h2 className="panel-title">시크릿코드 현황</h2>
            <p className="muted">사용 가능 {activeCount.toLocaleString()}개 / 최근 {codes.length.toLocaleString()}개 표시</p>
          </div>
          <ShieldCheck size={28} />
        </div>

        <div className="table-wrap mt-4">
          <table className="data-table">
            <thead>
              <tr>
                <th>코드</th>
                <th>상태</th>
                <th>메모</th>
                <th>발급</th>
                <th>만료</th>
                <th>사용</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {codes.length ? (
                codes.map((code) => {
                  const status = statusOf(code);
                  return (
                    <tr key={code.id}>
                      <td>{code.code_label}</td>
                      <td><span className={status.className}>{status.label}</span></td>
                      <td>{code.issued_to_note || "-"}</td>
                      <td>{formatDateTime(code.created_at)}</td>
                      <td>{formatDateTime(code.expires_at)}</td>
                      <td>{code.used_at ? `${formatDateTime(code.used_at)} · ${code.used_login_id ?? "회원"}` : "-"}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => void revoke(code)} disabled={loading === code.id || status.label !== "사용 가능"}>
                          회수
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7}>아직 발급된 시크릿코드가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
