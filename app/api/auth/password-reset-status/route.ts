import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, requestMeta, readJsonWithLimit } from "@/lib/api";
import { credentialToAuthEmail, normalizeLoginId } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

const TEMP_PASSWORD = "DynamicD2026!reset";

const schema = z.object({
  loginId: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const meta = requestMeta(request);
  const limited = await enforceRateLimit(`password-reset-status:${meta.ip}`, 30, 60);
  if (limited) return limited;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("아이디를 입력해 주세요.", 422, "VALIDATION_ERROR");

  const loginValue = parsed.data.loginId.trim().toLowerCase();
  const admin = createAdminClient();

  const query = admin
    .from("profiles")
    .select("id,email,username,status,must_change_password")
    .limit(1);

  const { data: profile, error } = loginValue.includes("@")
    ? await query.eq("email", loginValue).maybeSingle()
    : await query.or(`username.eq.${normalizeLoginId(loginValue)},email.eq.${credentialToAuthEmail(loginValue)}`).maybeSingle();

  if (error || !profile || profile.status !== "APPROVED" || !profile.must_change_password) {
    return ok({ mustChangePassword: false });
  }

  return ok({
    mustChangePassword: true,
    temporaryPassword: TEMP_PASSWORD,
    message: "비밀번호가 초기화된 계정입니다. 아래 임시 비밀번호로 로그인 후 새 비밀번호로 변경해 주세요.",
  });
}
