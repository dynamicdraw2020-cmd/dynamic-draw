"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function AuthForm({ mode, nextPath = "/account" }: { mode: "login" | "signup"; nextPath?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (mode === "signup" && payload.password !== payload.passwordConfirm) {
      setMessage({ type: "error", text: "비밀번호 확인이 일치하지 않습니다." });
      setLoading(false);
      return;
    }
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, nextPath }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.error?.message ?? "처리 중 오류가 발생했습니다." });
      return;
    }
    if (mode === "signup") {
      setMessage({ type: "success", text: body.data?.message ?? "가입 신청이 완료되었습니다." });
      event.currentTarget.reset();
      if (typeof body.data?.redirectTo === "string") {
        window.setTimeout(() => { router.push(body.data.redirectTo); router.refresh(); }, 1100);
      }
      return;
    }
    router.push(body.data?.redirectTo ?? nextPath);
    router.refresh();
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      {mode === "signup" && (
        <>
          <div className="field">
            <label htmlFor="displayName">이름 또는 닉네임</label>
            <div style={{ position: "relative" }}><UserRound size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} /><input className="input" id="displayName" name="displayName" required minLength={2} maxLength={30} placeholder="홍길동" style={{ paddingLeft: 40 }} /></div>
          </div>
          <div className="field">
            <label htmlFor="phone">연락처</label>
            <div style={{ position: "relative" }}><Phone size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} /><input className="input" id="phone" name="phone" inputMode="tel" maxLength={20} placeholder="010-1234-5678" style={{ paddingLeft: 40 }} /></div>
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="email">이메일</label>
        <div style={{ position: "relative" }}><Mail size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} /><input className="input" id="email" name="email" type="email" required autoComplete="email" placeholder="name@example.com" style={{ paddingLeft: 40 }} /></div>
      </div>
      <div className="field">
        <label htmlFor="password">비밀번호</label>
        <div style={{ position: "relative" }}><LockKeyhole size={17} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} /><input className="input" id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8자 이상" style={{ paddingLeft: 40 }} /></div>
      </div>
      {mode === "signup" && (
        <div className="field">
          <label htmlFor="passwordConfirm">비밀번호 확인</label>
          <input className="input" id="passwordConfirm" name="passwordConfirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="비밀번호를 한 번 더 입력" />
          <small>가입 신청 후 관리자가 승인하고 고유 회원 ID를 발급합니다.</small>
        </div>
      )}
      {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>
        {loading ? <LoaderCircle size={18} className="spin" /> : <>{mode === "login" ? "로그인" : "가입 신청"}<ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
