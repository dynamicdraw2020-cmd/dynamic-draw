import { ok, withApiRoute } from "@/lib/api";
import { cached } from "@/lib/ops/cache";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";
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

async function loadSettings() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("site_settings")
    .select("key,value")
    .in("key", ["signup_secret_request_url", "signup_secret_request_button_label", "signup_secret_request_help_text"]);

  const map = new Map((data ?? []).map((row: { key: string; value: unknown }) => [row.key, cleanValue(row.value)]));

  return {
    requestUrl: map.get("signup_secret_request_url") || defaults.requestUrl,
    buttonLabel: map.get("signup_secret_request_button_label") || defaults.buttonLabel,
    helpText: map.get("signup_secret_request_help_text") || defaults.helpText,
  };
}

async function getHandler() {
  const settings = await cached("public:signup-secret-settings", 60, loadSettings, defaults);
  const response = ok(settings);
  response.headers.set("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
  return response;
}

export const GET = withApiRoute(getHandler, { routeName: "/api/public/signup-secret-settings", rateLimit: { kind: "api", limit: 60, windowSeconds: 60 } });
