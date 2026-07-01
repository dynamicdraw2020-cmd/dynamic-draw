import type { Metadata } from "next";
import { SignupSecretCodeManager } from "@/components/signup-secret-code-manager";
import { hasCapability } from "@/lib/admin-capabilities";
import { requireAdminCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfilledValue, safeRows } from "@/lib/ops/safe-query";

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

  const [codesResult, settingRowsResult] = await Promise.allSettled([
    safeRows<SecretCodeRow>(
      admin
        .from("signup_secret_codes")
        .select("id,code_label,issued_by,issued_to_note,expires_at,used_by,used_login_id,used_at,revoked_at,revoked_by,revoke_reason,created_at")
        .order("created_at", { ascending: false })
        .limit(300),
      "signup secret codes page",
    ),
    safeRows<{ key: string; value: unknown }>(
      admin
        .from("site_settings")
        .select("key,value")
        .in("key", ["signup_secret_request_url", "signup_secret_request_button_label", "signup_secret_request_help_text"]),
      "signup secret settings page",
    ),
  ]);

  const codes = fulfilledValue(codesResult, [] as SecretCodeRow[]);
  const settingRows = fulfilledValue(settingRowsResult, [] as Array<{ key: string; value: unknown }>);
  const dbError = "";
  const settingMap = new Map<string, string>(settingRows.map((row) => [row.key, cleanValue(row.value)]));

  return (
    <>
      {dbError ? (
        <section className="panel panel-pad">
          <h2 className="panel-title">DB 보정 SQL 적용 필요</h2>
          <p className="muted">시크릿코드 테이블을 찾지 못했습니다. 먼저 v1.6.1 이상 SQL 교체용 메모장 파일을 Supabase SQL Editor에서 실행해 주세요.</p>
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
