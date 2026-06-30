"use client";

import { ArrowRight, ExternalLink, IdCard, KeyRound, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type SignupSecretSettings = {
  buttonLabel: string;
  requestUrl: string;
  helpText: string;
};

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
  const [settings, setSettings] = useState<SignupSecretSettings>({
    buttonLabel: "시크릿코드 신청하기",
    requestUrl: "",
    helpText: "관리자가 안내한 링크에서 CS에게 1회용 시크릿코드를 요청해 주세요.",
  });
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (mode === "signup") setSignupStartedAt(String(Date.now()));
  }, [mode, formVersion]);

  useEffect(() => {
    if (mode !== "signup") return;
    let mounted = true;
    fetch("/api/public/signup-secret-settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (!mounted || !body?.data) return;
        setSettings({
          buttonLabel: body.data.buttonLabel || "시크릿코드 신청하기",
          requestUrl: body.data.requestUrl || "",
          helpText: body.data.helpText || "관리자가 안내한 링크에서 CS에게 1회용 시크릿코드를 요청해 주세요.",
        });
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [mode]);

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
    const body = await response.json().catch(() => ({}));

    setLoading(false);

    if (!response.ok) {
      setMessage({ type: "error", text: body.error?.message ?? "처리 중 오류가 발생했습니다." });
      return;
    }

    if (mode === "signup") {
      setMessage({ type: "success", text: body.data?.message ?? "가입 신청이 완료되었습니다." });
      setFormVersion((version) => version + 1);
      if (typeof body.data?.redirectTo === "string") {
        window.setTimeout(() => {
          router.push(body.data.redirectTo);
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
          autoComplete={mode === "login" ? "username" : "off"}
          placeholder="영문 소문자, 숫자, _ 조합"
        />
      </label>

      {mode === "signup" && (
        <>
          <div className="notice-box compact">
            전화번호와 이메일은 받지 않습니다. 아이디, 이름/닉네임, 비밀번호, 관리자 시크릿코드만 사용합니다.
          </div>

          <label className="field-label">
            <span>
              <KeyRound size={16} /> 가입 시크릿코드
            </span>
            <input
              className="input"
              name="secretCode"
              required
              autoComplete="one-time-code"
              placeholder="CS에게 받은 1회용 코드"
            />
            <small>{settings.helpText}</small>
          </label>

          <div className="auth-secret-request-box">
            {settings.requestUrl ? (
              <a className="btn btn-secondary" href={settings.requestUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> {settings.buttonLabel}
              </a>
            ) : (
              <button className="btn btn-secondary" type="button" disabled>
                <ExternalLink size={16} /> 시크릿코드 신청 링크 준비중
              </button>
            )}
            <span>발급된 코드는 4시간 동안만 유효하고 한 번만 사용할 수 있습니다.</span>
          </div>

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
