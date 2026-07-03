"use client";

import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { clientJsonRequest } from "@/lib/client-fetch";

export function ChangePasswordForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const passwordConfirm = String(form.get("passwordConfirm") ?? "");

    try {
      const body = await clientJsonRequest<{ data?: { message?: string; redirectTo?: string } }>("/api/auth/change-password", {
        method: "POST",
        json: { password, passwordConfirm },
        timeoutMs: 5000,
        fallbackMessage: "비밀번호를 변경하지 못했습니다.",
      });
      setMessage({ type: "success", text: body.data?.message ?? "비밀번호가 변경되었습니다." });
      window.setTimeout(() => {
        router.push(body.data?.redirectTo ?? "/");
        router.refresh();
      }, 700);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "비밀번호를 변경하지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form form-grid" onSubmit={submit}>
      <div className="form-message form-info">
        <strong>필수 변경</strong><br />
        새 비밀번호는 8자 이상으로 입력해 주세요. 변경 완료 후 임시 비밀번호 안내는 사라집니다.
      </div>
      <label className="field-label">
        <span><LockKeyhole size={16} /> 새 비밀번호</span>
        <input className="input" name="password" type="password" minLength={8} maxLength={72} required autoComplete="new-password" />
      </label>
      <label className="field-label">
        <span>새 비밀번호 확인</span>
        <input className="input" name="passwordConfirm" type="password" minLength={8} maxLength={72} required autoComplete="new-password" />
      </label>
      {message && <div className={`form-message ${message.type}`}>{message.text}</div>}
      <button className="btn btn-primary" disabled={loading}>
        {loading ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
        비밀번호 변경
      </button>
    </form>
  );
}
