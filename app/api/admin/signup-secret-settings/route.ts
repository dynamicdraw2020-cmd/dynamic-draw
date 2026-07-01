import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiCapability, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";
const schema = z.object({
  requestUrl: z.string().trim().max(500).optional().default(""),
  buttonLabel: z.string().trim().min(2).max(40).optional().default("시크릿코드 신청하기"),
  helpText: z.string().trim().max(160).optional().default("관리자가 안내한 링크에서 CS에게 1회용 시크릿코드를 요청해 주세요."),
});

function validateUrl(value: string) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return value.startsWith("/") && !value.startsWith("//");
  }
}

async function patchHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiCapability("SIGNUP_SECRET_SETTINGS");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("시크릿코드 신청 버튼 설정을 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());
  if (!validateUrl(parsed.data.requestUrl)) return fail("신청 링크는 https:// 주소 또는 사이트 내부 /경로 형식이어야 합니다.", 422, "INVALID_REQUEST_URL");

  const admin = createAdminClient();
  const rows = [
    ["signup_secret_request_url", parsed.data.requestUrl],
    ["signup_secret_request_button_label", parsed.data.buttonLabel],
    ["signup_secret_request_help_text", parsed.data.helpText],
    ["signup_secret_required", "true"],
  ] as const;

  for (const [key, value] of rows) {
    const { error } = await admin.from("site_settings").upsert(
      {
        key,
        value,
        is_public: true,
        updated_by: guard.auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) return fail("시크릿코드 신청 버튼 설정을 저장하지 못했습니다.", 400, "SECRET_SETTINGS_SAVE_FAILED", error.message);
  }

  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "SIGNUP_SECRET_SETTINGS_UPDATED",
    p_target_table: "site_settings",
    p_target_id: guard.auth.userId,
    p_details: parsed.data,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok(parsed.data);
}

export const PATCH = withApiRoute(patchHandler, { routeName: "/api/admin/signup-secret-settings", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
