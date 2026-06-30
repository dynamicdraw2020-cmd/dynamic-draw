"use client";

import { ArrowRight, IdCard, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

function simpleFingerprintSource() {
  if (typeof window === "undefined") return "server";
  const screenInfo = `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}x${window.screen?.colorDepth ?? 0}`;
  const language = navigator.language ?? "";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  const platform = navigator.platform ?? "";
  return [navigator.userAgent, screenInfo, language, timezone, platform].join("|");
}

function hashSmall(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function AuthForm({ mode, nextPath = "/account" }: { mode: "login" | "signup"; nextPath?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [signupStartedAt, setSignupStartedAt] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (mode === "signup") setSignupStartedAt(String(Date.now()));
  }, [mode, formVersion]);

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
      body: JSON.stringify({ ...payload, nextPath, browserFingerprint: hashSmall(simpleFingerprintSource()) }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.error?.message ?? "처리 중 오류가 발생했습니다." });
      return;
    }
    if (mode === "signup") {
      setMessage({ type: "success", text: body.data?.message ?? "가입 신청이 완료되었습니다." });
      setFormVersion((version) => version + 1);
      if (typeof body.data?.redirectTo === "string") {
        window.setTimeout(() => { router.push(body.data.redirectTo); router.refresh(); }, 1100);
      }
      return;
    }
    router.push(body.data?.redirectTo ?? nextPath);
    router.refresh();
  }

  return (
    <form key={`auth-form-${formVersion}`} className="form-grid" onSubmit={submit}>
      {mode === "signup" && <>
        <input className="bot-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <input type="hidden" name="signupStartedAt" value={signupStartedAt} readOnly />
      </>}
      {mode === "signup" && (
        <div className="field">
          <label htmlFor="displayName">이름 또는 닉네임</label>
          <div style={{ position: "relative" }}><UserRound size={17} style={{ position: "absolute", left: 13, top: 14, color: "#64748b" }} /><input className="input" id="displayName" name="displayName" required minLength={2} maxLength={30} placeholder="운영에 표시될 이름" style={{ paddingLeft: 40 }} /></div>
        </div>
      )}
      <div className="field">
        <label htmlFor="loginId">아이디</label>
        <div style={{ position: "relative" }}><IdCard size={17} style={{ position: "absolute", left: 13, top: 14, color: "#64748b" }} /><input className="input" id="loginId" name="loginId" required autoComplete="username" placeholder="영문·숫자 4~24자" minLength={4} maxLength={24} pattern="[A-Za-z0-9._-]+" style={{ paddingLeft: 40 }} /></div>
        {mode === "signup" && <small>전화번호와 이메일은 받지 않습니다. 아이디, 이름/닉네임, 비밀번호만 사용합니다.</small>}
      </div>
      {mode === "signup" && (
        <div className="field">
          <label htmlFor="referralCode">추천인 ID <span className="text-muted">선택</span></label>
          <input className="input" id="referralCode" name="referralCode" maxLength={8} inputMode="numeric" pattern="[0-9]{1,8}" placeholder="예: 12345678" />
          <small>추천인 ID는 8자리 이내 숫자입니다. 관리자 승인 후 양쪽 모두에게 설정된 보상이 지급됩니다.</small>
        </div>
      )}
      <div className="field">
        <label htmlFor="password">비밀번호</label>
        <div style={{ position: "relative" }}><LockKeyhole size={17} style={{ position: "absolute", left: 13, top: 14, color: "#64748b" }} /><input className="input" id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8자 이상" style={{ paddingLeft: 40 }} /></div>
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
