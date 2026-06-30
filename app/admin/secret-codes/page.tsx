import type { Metadata } from "next";
import { SignupSecretCodeManager } from "@/components/signup-secret-code-manager";
import { hasCapability } from "@/lib/admin-capabilities";
import { requireAdminCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "가입 시크릿코드" };
export const dynamic = "force-dynamic";

type SecretCodeRow = {
  id: string;
  code_label: string;
  issued_by: string | null;
  issued_to_note: string | null;
  expires_at: string;
  used_by: string | null;
  used_login_id: string | null;
  used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string;
};

function cleanValue(value: unknown) {
  if (typeof value !== "string") return String(value ?? "").replace(/^"|"$/g, "");
  try {
    const parsed = JSON.parse(value);
    return String(parsed ?? "");
  } catch {
    return value.replace(/^"|"$/g, "");
  }
}

export default async function AdminSignupSecretCodesPage() {
  const profile = await requireAdminCapability("SIGNUP_SECRET_CODES");
  const admin = createAdminClient();

  let codes: SecretCodeRow[] = [];
  let dbError = "";

  const { data, error } = await admin
    .from("signup_secret_codes")
    .select("id,code_label,issued_by,issued_to_note,expires_at,used_by,used_login_id,used_at,revoked_at,revoked_by,revoke_reason,created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) dbError = error.message;
  else codes = (data ?? []) as SecretCodeRow[];

  const { data: settingRows } = await admin
    .from("site_settings")
    .select("key,value")
    .in("key", ["signup_secret_request_url", "signup_secret_request_button_label", "signup_secret_request_help_text"]);

  const settingMap = new Map((settingRows ?? []).map((row: { key: string; value: unknown }) => [row.key, cleanValue(row.value)]));

  return (
    <>
      <section className="hero-card compact">
        <div>
          <p className="eyebrow">관리자 가입 게이트</p>
          <h1>가입 시크릿코드</h1>
          <p>회원가입은 관리자가 발급한 1회용 시크릿코드를 입력해야 완료됩니다.</p>
        </div>
      </section>

      {dbError ? (
        <section className="panel panel-pad">
          <h2 className="panel-title">DB 보정 SQL 적용 필요</h2>
          <p className="muted">시크릿코드 테이블을 찾지 못했습니다. 먼저 v1.6.0 SQL 교체용 메모장 파일을 Supabase SQL Editor에서 실행해 주세요.</p>
          <pre className="code-block">{dbError}</pre>
        </section>
      ) : (
        <SignupSecretCodeManager
          initialCodes={codes}
          settings={{
            requestUrl: settingMap.get("signup_secret_request_url") || "",
            buttonLabel: settingMap.get("signup_secret_request_button_label") || "시크릿코드 신청하기",
            helpText: settingMap.get("signup_secret_request_help_text") || "관리자가 안내한 링크에서 CS에게 1회용 시크릿코드를 요청해 주세요.",
            canEditSettings: hasCapability(profile.role, "SIGNUP_SECRET_SETTINGS"),
          }}
        />
      )}
    </>
  );
}
