import { ok } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const defaults = {
  requestUrl: "",
  buttonLabel: "시크릿코드 신청하기",
  helpText: "관리자가 안내한 링크에서 CS에게 1회용 시크릿코드를 요청해 주세요.",
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

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("site_settings")
      .select("key,value")
      .in("key", ["signup_secret_request_url", "signup_secret_request_button_label", "signup_secret_request_help_text"]);

    const map = new Map((data ?? []).map((row: { key: string; value: unknown }) => [row.key, cleanValue(row.value)]));

    return ok({
      requestUrl: map.get("signup_secret_request_url") || defaults.requestUrl,
      buttonLabel: map.get("signup_secret_request_button_label") || defaults.buttonLabel,
      helpText: map.get("signup_secret_request_help_text") || defaults.helpText,
    });
  } catch {
    return ok(defaults);
  }
}
