import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, requestMeta } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { inspectSetupStatus } from "@/lib/setup-status";
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

  const setupStatus = await inspectSetupStatus();
  if (!setupStatus.ready) {
    const status = setupStatus.locked ? 409 : 503;
    return fail(setupStatus.message, status, setupStatus.code, setupStatus.technicalCode);
  }

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
  if (countError) return fail("최고 관리자 존재 여부를 확인하지 못했습니다.", 503, "DATABASE_NOT_READY", countError.code);
  if ((count ?? 0) > 0) return fail("최초 최고 관리자가 이미 존재합니다.", 409, "SUPER_ADMIN_ALREADY_EXISTS");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.displayName, phone: "" },
  });
  if (createError || !created.user) {
    const duplicate = createError?.message.toLowerCase().includes("already");
    return fail(duplicate ? "이미 가입된 이메일입니다. 다른 이메일을 사용해 주세요." : "관리자 로그인 계정을 만들지 못했습니다.", 400, "ADMIN_AUTH_CREATE_FAILED", createError?.code);
  }

  const { data: generatedCode, error: codeError } = await admin.rpc("next_member_code");
  if (codeError || typeof generatedCode !== "string") {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return fail("관리자 고유 ID를 만들지 못했습니다. DB 권한 보정 SQL을 확인해 주세요.", 500, "ADMIN_CODE_CREATE_FAILED", codeError?.code);
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
    return fail("관리자 회원 정보를 만들지 못했습니다. 다시 시도해 주세요.", 500, "ADMIN_PROFILE_CREATE_FAILED", profileError?.code);
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
