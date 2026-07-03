"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { clientJsonRequest } from "@/lib/client-fetch";

type BulkResetResult = {
  temporaryPassword: string;
  attempted: number;
  succeeded: number;
  failed: Array<{ id: string; username?: string | null; email: string; reason: string }>;
  hasMore: boolean;
  message: string;
};

export function PasswordRecoveryPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkResetResult | null>(null);

  async function resetBatch() {
    const confirmText = window.prompt(
      "승인/복구 회원의 비밀번호를 공통 임시 비밀번호로 초기화합니다.\n50명씩 처리됩니다.\n계속하려면 RESET_ALL_PASSWORDS 를 입력해 주세요.",
    );
    if (confirmText !== "RESET_ALL_PASSWORDS") return;

    setLoading(true);
    try {
      const body = await clientJsonRequest<{ data?: BulkResetResult }>("/api/admin/members/bulk-reset-passwords", {
        method: "POST",
        json: { confirm: "RESET_ALL_PASSWORDS", limit: 50, includeAdmins: false },
        timeoutMs: 60000,
        retries: 0,
        fallbackMessage: "일괄 초기화를 처리하지 못했습니다.",
      });
      setResult(body.data ?? null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "일괄 초기화를 처리하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel panel-pad form-grid">
      <div className="section-head">
        <div>
          <h2 className="panel-title">공통 임시 비밀번호 일괄 초기화</h2>
          <p className="muted">처리된 회원은 로그인 화면에서 임시 비밀번호 안내가 보이고, 로그인 후 /change-password로 이동합니다.</p>
        </div>
        <button className="btn btn-danger" type="button" onClick={() => void resetBatch()} disabled={loading}>
          {loading ? <LoaderCircle size={17} className="spin" /> : <KeyRound size={17} />} 50명씩 초기화
        </button>
      </div>

      <div className="notice-box">
        임시 비밀번호는 <code>DynamicD2026!reset</code> 입니다. 변경 완료한 회원은 안내가 자동으로 사라집니다.
      </div>

      {result && (
        <div className="form-message form-info">
          <strong>{result.message}</strong><br />
          시도 {result.attempted.toLocaleString()}명 · 성공 {result.succeeded.toLocaleString()}명 · 실패 {result.failed.length.toLocaleString()}명
          {result.hasMore && <div className="mt-2">남은 회원이 있을 수 있습니다. 버튼을 한 번 더 눌러 다음 50명을 처리하세요.</div>}
          {result.failed.length > 0 && (
            <div className="mt-2">
              실패 일부: {result.failed.slice(0, 5).map((item) => `${item.username ?? item.email}: ${item.reason}`).join(" / ")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
