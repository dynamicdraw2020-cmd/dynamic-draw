"use client";

import { AlertTriangle, ArrowRight, Copy, IdCard, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { clientJsonRequest } from "@/lib/client-fetch";

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

type ResetNotice = {
  show: boolean;
  temporaryPassword?: string;
  message?: string;
  displayName?: string;
};

export function AuthForm({ mode, nextPath = "/account" }: { mode: "login" | "signup"; nextPath?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [signupStartedAt, setSignupStartedAt] = useState("");
  const [loginId, setLoginId] = useState("");
  const [resetNotice, setResetNotice] = useState<ResetNotice | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (mode === "signup") setSignupStartedAt(String(Date.now()));
  }, [mode, formVersion]);

  useEffect(() => {
    if (mode !== "login") {
      setResetNotice(null);
      return;
    }

    const value = loginId.trim();
    if (value.length < 3) {
      setResetNotice(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const body = await clientJsonRequest<{ data?: ResetNotice }>(`/api/auth/reset-notice?loginId=${encodeURIComponent(value)}`, {
          method: "GET",
          timeoutMs: 3500,
          signal: controller.signal,
          retries: 0,
        });
        setResetNotice(body.data?.show ? body.data : null);
      } catch {
        setResetNotice(null);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, loginId]);

  async function copyTemporaryPassword() {
    const value = resetNotice?.temporaryPassword;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage({ type: "success", text: "임시 비밀번호를 복사했습니다." });
    } catch {
      setMessage({ type: "info", text: `임시 비밀번호: ${value}` });
    }
  }

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

    let body: { data?: { message?: string; redirectTo?: string } };
    try {
      body = await clientJsonRequest(`/api/auth/${mode}`, {
        method: "POST",
        json: { ...payload, nextPath, browserFingerprint: hashSmall(simpleFingerprintSource()) },
        timeoutMs: 5000,
        fallbackMessage: "처리 중 오류가 발생했습니다.",
      });
    } catch (error) {
      setLoading(false);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." });
      return;
    }

    setLoading(false);

    if (mode === "signup") {
      setMessage({ type: "success", text: body.data?.message ?? "가입 신청이 완료되었습니다." });
      setFormVersion((version) => version + 1);
      setLoginId("");
      const redirectTo = typeof body.data?.redirectTo === "string" ? body.data.redirectTo : null;
      if (redirectTo) {
        window.setTimeout(() => {
          router.push(redirectTo);
          router.refresh();
        }, 1100);
      }
      return;
    }

    router.push(body.data?.redirectTo ?? nextPath);
    router.refresh();
  }

  return (
    <form className="auth-form form-grid" onSubmit={submit} key={formVersion}>
      {mode === "signup" && <input type="hidden" name="signupStartedAt" value={signupStartedAt} readOnly />}
      {mode === "signup" && <input className="sr-only" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />}

      {mode === "signup" && (
        <label className="field-label">
          <span>
            <UserRound size={16} /> 이름 또는 닉네임
          </span>
          <input className="input" name="displayName" minLength={2} maxLength={30} required placeholder="예: 다이나믹" />
        </label>
      )}

      <label className="field-label">
        <span>
          <IdCard size={16} /> 아이디
        </span>
        <input
          className="input"
          name="loginId"
          minLength={3}
          maxLength={32}
          required
          value={loginId}
          onChange={(event) => setLoginId(event.currentTarget.value)}
          autoComplete={mode === "login" ? "username" : "off"}
          placeholder="영문 소문자, 숫자, _ 조합"
        />
      </label>

      {mode === "login" && resetNotice?.show && resetNotice.temporaryPassword && (
        <div className="notice-box compact" style={{ borderColor: "rgba(246, 196, 83, 0.55)", background: "rgba(246, 196, 83, 0.10)" }}>
          <div className="flex items-center gap-1"><AlertTriangle size={16} /><strong>비밀번호가 초기화되었습니다.</strong></div>
          <p className="mt-1 mb-0">{resetNotice.message ?? "아래 임시 비밀번호로 로그인한 뒤 새 비밀번호로 변경해 주세요."}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <code style={{ fontWeight: 800, fontSize: 14 }}>{resetNotice.temporaryPassword}</code>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void copyTemporaryPassword()}>
              <Copy size={14} /> 복사
            </button>
          </div>
        </div>
      )}

      {mode === "signup" && (
        <>
          <div className="notice-box compact">전화번호와 이메일은 받지 않습니다. 아이디, 이름/닉네임, 비밀번호로 가입 신청을 접수합니다.</div>

          <label className="field-label">
            <span>추천인 ID 선택</span>
            <input className="input" name="referralCode" maxLength={20} placeholder="선택 입력" />
            <small>추천인 ID는 선택 사항입니다. 승인 후 설정된 보상이 지급됩니다.</small>
          </label>
        </>
      )}

      <label className="field-label">
        <span>
          <LockKeyhole size={16} /> 비밀번호
        </span>
        <input className="input" name="password" type="password" minLength={8} maxLength={72} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </label>

      {mode === "signup" && (
        <label className="field-label">
          <span>비밀번호 확인</span>
          <input className="input" name="passwordConfirm" type="password" minLength={8} maxLength={72} required autoComplete="new-password" />
          <small>가입 신청 후 관리자가 승인하고 고유 회원 ID를 발급합니다.</small>
        </label>
      )}

      {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

      <button className="btn btn-primary" disabled={loading}>
        {loading ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
        {mode === "login" ? "로그인" : "가입 신청"}
      </button>
    </form>
  );
}
