"use client";

import { LoaderCircle, Save, ShieldAlert } from "lucide-react";
import { FormEvent, useState } from "react";

type Initial = {
  operationMode: string;
  operationMessage: string;
  operationEndsAt: string;
};

const modes = [
  { value: "ACTIVE", label: "활성화", desc: "평소처럼 전체 기능 사용" },
  { value: "UPDATING", label: "업데이트중", desc: "회원가입 가능 / 일반 회원 로그인 불가 / 관리자 가능" },
  { value: "INACTIVE", label: "비활성화", desc: "회원가입 가능 / 최고 관리자만 로그인 가능" },
];

export function OperationModeForm({ initial }: { initial: Initial }) {
  const [mode, setMode] = useState(initial.operationMode || "ACTIVE");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/operation-mode", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationMode: form.get("operationMode"),
        operationMessage: form.get("operationMessage"),
        operationEndsAt: form.get("operationEndsAt"),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    setMessage(response.ok ? "운영 모드가 저장되었습니다." : body.error?.message ?? "운영 모드를 저장하지 못했습니다.");
  }

  return <form className="panel panel-pad operation-mode-manager" onSubmit={submit}>
    <div className="operation-mode-title">
      <ShieldAlert size={24} />
      <div>
        <h2>운영 모드</h2>
        <p>회원 접근 상태를 즉시 전환합니다.</p>
      </div>
    </div>

    <div className="operation-mode-grid">
      {modes.map((item) => <label key={item.value} className={`operation-mode-card ${mode === item.value ? "active" : ""}`}>
        <input type="radio" name="operationMode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} />
        <strong>{item.label}</strong>
        <span>{item.desc}</span>
      </label>)}
    </div>

    <div className="form-row">
      <div className="field">
        <label>예상 종료</label>
        <input className="input" name="operationEndsAt" defaultValue={initial.operationEndsAt ?? ""} placeholder="예: 18:30" />
      </div>
      <div className="field">
        <label>현재 상태</label>
        <input className="input" value={modes.find((item) => item.value === mode)?.label ?? "활성화"} readOnly />
      </div>
    </div>

    <div className="field">
      <label>접근 제한 안내 문구</label>
      <textarea className="textarea" name="operationMessage" rows={4} defaultValue={initial.operationMessage || "현재 시스템 업데이트중입니다."} />
    </div>

    <div className="operation-mode-warning">
      {mode === "ACTIVE" && "활성화: 모든 회원이 평소처럼 이용할 수 있습니다."}
      {mode === "UPDATING" && "업데이트중: 일반 회원은 로그인할 수 없고, 로그인 중인 일반 회원은 자동 로그아웃됩니다."}
      {mode === "INACTIVE" && "비활성화: 최고 관리자만 로그인할 수 있고, 그 외 계정은 자동 로그아웃됩니다."}
    </div>

    {message && <div className="form-message form-info">{message}</div>}
    <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
      {loading ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />} 운영 모드 저장
    </button>
  </form>;
}
