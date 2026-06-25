import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
  nextPath: z.string().optional(),
});

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  const meta = requestMeta(request);
  const limited = await enforceRateLimit(`login:${meta.ip}`, 10, 60 * 10);
  if (limited) return limited;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("이메일과 비밀번호를 확인해 주세요.", 422, "VALIDATION_ERROR");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error || !data.user) return fail("이메일 또는 비밀번호가 올바르지 않습니다.", 401, "INVALID_CREDENTIALS");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile) return fail("회원 정보가 생성되지 않았습니다. 관리자에게 문의해 주세요.", 500, "PROFILE_MISSING");

  await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);

  if (["VIEWER", "MANAGER", "SUPER_ADMIN"].includes(profile.role)) {
    await admin.rpc("append_admin_log", {
      p_admin_id: profile.id,
      p_action: "ADMIN_LOGIN",
      p_target_table: "profiles",
      p_target_id: profile.id,
      p_details: { email: profile.email },
      p_ip: meta.ip,
      p_user_agent: meta.userAgent,
    });
  }

  let redirectTo = "/account";
  if (profile.status === "PENDING") redirectTo = "/pending";
  else if (profile.status !== "APPROVED") {
    await supabase.auth.signOut();
    redirectTo = "/login?error=account_unavailable";
  } else if (["VIEWER", "MANAGER", "SUPER_ADMIN"].includes(profile.role)) redirectTo = "/admin";
  else if (parsed.data.nextPath?.startsWith("/") && !parsed.data.nextPath.startsWith("//")) redirectTo = parsed.data.nextPath;

  return ok({ redirectTo, profile: { displayName: profile.display_name, role: profile.role, status: profile.status } });
}
