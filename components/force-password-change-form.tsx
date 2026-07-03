"use client";

import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { clientJsonRequest } from "@/lib/client-fetch";

export function ForcePasswordChangeForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const passwordConfirm = String(form.get("passwordConfirm") ?? "");
    if (password !== passwordConfirm) {
      setMessage({ type: "error", text: "비밀번호 확인이 일치하지 않습니다." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const body = await clientJsonRequest<{ data?: { message?: string; redirectTo?: string } }>("/api/auth/change-password", {
        method: "POST",
        json: { password, passwordConfirm },
        timeoutMs: 5000,
        fallbackMessage: "비밀번호를 변경하지 못했습니다.",
      });
      setMessage({ type: "success", text: body.data?.message ?? "비밀번호가 변경되었습니다." });
      window.setTimeout(() => {
        router.push(body.data?.redirectTo ?? "/account");
        router.refresh();
      }, 700);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "비밀번호를 변경하지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="notice-box compact">
        임시 비밀번호로 로그인한 계정입니다. 계속 이용하려면 새 비밀번호를 먼저 설정해야 합니다.
      </div>
      <label className="field-label">
        <span>
          <LockKeyhole size={16} /> 새 비밀번호
        </span>
        <input className="input" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="8자 이상" />
      </label>
      <label className="field-label">
        <span>새 비밀번호 확인</span>
        <input className="input" name="passwordConfirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="한 번 더 입력" />
      </label>
      {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>
        {loading ? <LoaderCircle size={18} className="spin" /> : <><ArrowRight size={18} /> 새 비밀번호 저장</>}
      </button>
    </form>
  );
}
