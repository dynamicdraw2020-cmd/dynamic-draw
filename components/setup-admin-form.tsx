"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";

export function SetupAdminForm({ disabledReason }: { disabledReason?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(
    disabledReason ? { type: "info", text: disabledReason } : null,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabledReason) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get("password") ?? "");
    const passwordConfirm = String(values.get("passwordConfirm") ?? "");
    if (password !== passwordConfirm) {
      setMessage({ type: "error", text: "비밀번호 확인이 일치하지 않습니다." });
      return;
    }

    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/setup-admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setupSecret: values.get("setupSecret"),
        displayName: values.get("displayName"),
        email: values.get("email"),
        password,
      }),
    });
    const body = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setMessage({ type: "error", text: body?.error?.message ?? "최초 관리자를 만들지 못했습니다." });
      return;
    }

    form.reset();
    setMessage({
      type: "success",
      text: "최고 관리자 계정이 만들어졌습니다. 이제 로그인 페이지에서 관리자 이메일과 비밀번호로 로그인하세요.",
    });
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="field">
        <label htmlFor="setupSecret">설치용 비밀문자</label>
        <div style={{ position: "relative" }}>
          <ShieldCheck size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} />
          <input
            className="input"
            id="setupSecret"
            name="setupSecret"
            type="password"
            minLength={32}
            required
            autoComplete="off"
            placeholder="Vercel의 ADMIN_SETUP_SECRET 값"
            style={{ paddingLeft: 40 }}
            disabled={Boolean(disabledReason)}
          />
        </div>
        <small>Vercel 환경변수에 넣은 32자 이상의 값을 그대로 입력합니다.</small>
      </div>

      <div className="field">
        <label htmlFor="displayName">관리자 이름</label>
        <div style={{ position: "relative" }}>
          <UserRound size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} />
          <input className="input" id="displayName" name="displayName" minLength={2} maxLength={30} required placeholder="Dynamic 관리자" style={{ paddingLeft: 40 }} disabled={Boolean(disabledReason)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="email">관리자 이메일</label>
        <div style={{ position: "relative" }}>
          <Mail size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} />
          <input className="input" id="email" name="email" type="email" required autoComplete="email" placeholder="admin@example.com" style={{ paddingLeft: 40 }} disabled={Boolean(disabledReason)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="password">관리자 비밀번호</label>
        <div style={{ position: "relative" }}>
          <LockKeyhole size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} />
          <input className="input" id="password" name="password" type="password" minLength={10} maxLength={72} required autoComplete="new-password" placeholder="10자 이상" style={{ paddingLeft: 40 }} disabled={Boolean(disabledReason)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="passwordConfirm">관리자 비밀번호 확인</label>
        <input className="input" id="passwordConfirm" name="passwordConfirm" type="password" minLength={10} maxLength={72} required autoComplete="new-password" placeholder="같은 비밀번호를 다시 입력" disabled={Boolean(disabledReason)} />
      </div>

      {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}

      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || Boolean(disabledReason)}>
        {loading ? <LoaderCircle size={18} className="spin" /> : <><ShieldCheck size={18} /> 최초 최고 관리자 만들기 <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
