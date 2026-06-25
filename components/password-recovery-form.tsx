"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function PasswordRecoveryForm({ mode }: { mode: "request" | "reset" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (mode === "reset" && form.get("password") !== form.get("passwordConfirm")) {
      setMessage({ type: "error", text: "비밀번호 확인이 일치하지 않습니다." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const response = await fetch(mode === "request" ? "/api/auth/forgot-password" : "/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mode === "request" ? { email: form.get("email") } : { password: form.get("password") }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.error?.message ?? "처리하지 못했습니다." });
      return;
    }
    setMessage({ type: "success", text: body.data?.message ?? "완료되었습니다." });
    if (mode === "reset") window.setTimeout(() => { router.push(body.data?.redirectTo ?? "/account"); router.refresh(); }, 900);
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      {mode === "request" ? (
        <div className="field">
          <label htmlFor="recovery-email">가입 이메일</label>
          <div style={{ position: "relative" }}><Mail size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} /><input className="input" id="recovery-email" name="email" type="email" required autoComplete="email" placeholder="name@example.com" style={{ paddingLeft: 40 }} /></div>
        </div>
      ) : (
        <>
          <div className="field"><label htmlFor="new-password">새 비밀번호</label><div style={{ position: "relative" }}><LockKeyhole size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} /><input className="input" id="new-password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="8자 이상" style={{ paddingLeft: 40 }} /></div></div>
          <div className="field"><label htmlFor="new-password-confirm">새 비밀번호 확인</label><input className="input" id="new-password-confirm" name="passwordConfirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="한 번 더 입력" /></div>
        </>
      )}
      {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>{loading ? <LoaderCircle size={18} className="spin" /> : <>{mode === "request" ? "재설정 이메일 받기" : "새 비밀번호 저장"}<ArrowRight size={18} /></>}</button>
    </form>
  );
}
