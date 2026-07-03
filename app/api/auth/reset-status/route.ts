import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, readJsonWithLimit, requestMeta, withApiRoute } from "@/lib/api";
import { credentialToAuthEmail, normalizeLoginId } from "@/lib/identity";
import { publicResetNotice } from "@/lib/password-reset";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

const schema = z.object({ loginId: z.string().trim().min(1).max(80) });

type ResetProfile = {
  id: string;
  email: string;
  username?: string | null;
  must_change_password?: boolean | null;
  password_reset_at?: string | null;
};

async function findProfileForLogin(admin: ReturnType<typeof createAdminClient>, loginId: string) {
  const credentialEmail = credentialToAuthEmail(loginId);
  const normalizedLoginId = normalizeLoginId(loginId);

  const byEmail = await admin
    .from("profiles")
    .select("id,email,username,must_change_password,password_reset_at")
    .eq("email", credentialEmail)
    .maybeSingle();

  if (byEmail.error && byEmail.error.code !== "PGRST116") throw byEmail.error;
  if (byEmail.data) return byEmail.data as ResetProfile;

  if (!normalizedLoginId) return null;
  const byUsername = await admin
    .from("profiles")
    .select("id,email,username,must_change_password,password_reset_at")
    .eq("username", normalizedLoginId)
    .maybeSingle();

  if (byUsername.error && byUsername.error.code !== "PGRST116") throw byUsername.error;
  return (byUsername.data as ResetProfile | null) ?? null;
}

async function postHandler(request: Request) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const meta = requestMeta(request);
  const limited = await enforceRateLimit(`reset-status:${meta.ip}`, 40, 60 * 10);
  if (limited) return limited;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("아이디를 확인해 주세요.", 422, "VALIDATION_ERROR");

  try {
    const admin = createAdminClient();
    const profile = await findProfileForLogin(admin, parsed.data.loginId);
    if (!profile?.must_change_password) return ok({ mustChangePassword: false });

    return ok({
      mustChangePassword: true,
      passwordResetAt: profile.password_reset_at ?? null,
      ...publicResetNotice(),
    });
  } catch {
    // 복구 컬럼이 아직 없거나 DB가 잠깐 흔들려도 로그인 화면 자체는 막지 않는다.
    return ok({ mustChangePassword: false });
  }
}

export const POST = withApiRoute(postHandler, { routeName: "/api/auth/reset-status", rateLimit: false });
