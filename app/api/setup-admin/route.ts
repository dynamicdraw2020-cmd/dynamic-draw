import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, requestMeta } from "@/lib/api";
import { adminSetupConfigured, serverEnv, supabaseAdminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  setupSecret: z.string().min(32).max(256),
  displayName: z.string().trim().min(2, "관리자 이름은 2자 이상 입력해 주세요.").max(30),
  email: z.email("올바른 이메일 주소를 입력해 주세요.").transform((value) => value.toLowerCase()),
  password: z.string().min(10, "관리자 비밀번호는 10자 이상 입력해 주세요.").max(72),
});

function sameSecret(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  if (!supabaseAdminConfigured) return fail("Supabase 환경변수가 연결되지 않았습니다.", 503, "SUPABASE_NOT_CONFIGURED");
  if (!adminSetupConfigured) return fail("ADMIN_SETUP_SECRET은 32자 이상으로 설정해야 합니다.", 503, "SETUP_SECRET_NOT_CONFIGURED");

  const meta = requestMeta(request);
  const limited = await enforceRateLimit(`setup-admin:${meta.ip}`, 5, 60 * 15);
  if (limited) return limited;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  if (!sameSecret(parsed.data.setupSecret, serverEnv.adminSetupSecret)) {
    return fail("설치용 비밀문자가 맞지 않습니다.", 403, "INVALID_SETUP_SECRET");
  }

  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "SUPER_ADMIN");
  if (countError) return fail("DB 설치 SQL이 아직 실행되지 않았거나 profiles 테이블을 읽을 수 없습니다.", 503, "DATABASE_NOT_READY");
  if ((count ?? 0) > 0) return fail("최초 최고 관리자가 이미 존재합니다.", 409, "SUPER_ADMIN_ALREADY_EXISTS");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.displayName, phone: "" },
  });
  if (createError || !created.user) {
    const duplicate = createError?.message.toLowerCase().includes("already");
    return fail(duplicate ? "이미 가입된 이메일입니다. 다른 이메일을 사용해 주세요." : "관리자 로그인 계정을 만들지 못했습니다.", 400, "ADMIN_AUTH_CREATE_FAILED");
  }

  const { data: generatedCode, error: codeError } = await admin.rpc("next_member_code");
  if (codeError || typeof generatedCode !== "string") {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return fail("관리자 고유 ID를 만들지 못했습니다. DB 설치 SQL을 다시 확인해 주세요.", 500, "ADMIN_CODE_CREATE_FAILED");
  }
  const memberCode = generatedCode;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: created.user.id,
      email: parsed.data.email,
      display_name: parsed.data.displayName,
      phone: null,
      role: "SUPER_ADMIN",
      status: "APPROVED",
      member_code: memberCode,
      approved_by: created.user.id,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    }, { onConflict: "id" })
    .select("id,email,display_name,role,status,member_code")
    .single();

  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return fail("관리자 회원 정보를 만들지 못했습니다. 다시 시도해 주세요.", 500, "ADMIN_PROFILE_CREATE_FAILED", profileError?.message);
  }

  await admin.rpc("append_admin_log", {
    p_admin_id: profile.id,
    p_action: "FIRST_SUPER_ADMIN_CREATED",
    p_target_table: "profiles",
    p_target_id: profile.id,
    p_details: { email: profile.email, memberCode: profile.member_code },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok({ profile, loginUrl: "/login" }, 201);
}
