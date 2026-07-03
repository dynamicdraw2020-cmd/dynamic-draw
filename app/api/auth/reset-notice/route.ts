import { enforceRateLimit, fail, ok, requestMeta, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { credentialToAuthEmail, normalizeLoginId } from "@/lib/identity";
import { TEMPORARY_PASSWORD } from "@/lib/password-reset";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

type ResetNoticeProfile = {
  id: string;
  email: string | null;
  username?: string | null;
  display_name?: string | null;
  status?: string | null;
  must_change_password?: boolean | null;
  password_changed_at?: string | null;
};

async function getHandler(request: Request) {
  const loginIdRaw = new URL(request.url).searchParams.get("loginId") ?? "";
  const loginId = loginIdRaw.trim().toLowerCase();
  if (loginId.length < 3) return ok({ show: false });

  const meta = requestMeta(request);
  const limited = await enforceRateLimit(`reset-notice:${meta.ip}`, 60, 60);
  if (limited) return limited;

  const admin = createAdminClient();
  const authEmail = credentialToAuthEmail(loginId);
  const username = normalizeLoginId(loginId);

  let profile: ResetNoticeProfile | null = null;

  const { data: byEmail, error: emailError } = await admin
    .from("profiles")
    .select("id,email,username,display_name,status,must_change_password,password_changed_at")
    .eq("email", authEmail)
    .maybeSingle();

  if (!emailError && byEmail) profile = byEmail as ResetNoticeProfile;

  if (!profile && username) {
    const { data: byUsername } = await admin
      .from("profiles")
      .select("id,email,username,display_name,status,must_change_password,password_changed_at")
      .eq("username", username)
      .maybeSingle();
    if (byUsername) profile = byUsername as ResetNoticeProfile;
  }

  if (!profile || profile.must_change_password !== true || profile.password_changed_at) {
    return ok({ show: false });
  }

  if (!["APPROVED", "PENDING"].includes(String(profile.status ?? ""))) {
    return ok({ show: false });
  }

  return ok({
    show: true,
    temporaryPassword: TEMPORARY_PASSWORD,
    displayName: profile.display_name ?? "회원",
    message: "비밀번호가 초기화되었습니다. 아래 임시 비밀번호로 로그인한 뒤 새 비밀번호로 변경해 주세요.",
  });
}

export const GET = withApiRoute(getHandler, { routeName: "/api/auth/reset-notice", rateLimit: { kind: "public", limit: 60, windowSeconds: 60 } });
