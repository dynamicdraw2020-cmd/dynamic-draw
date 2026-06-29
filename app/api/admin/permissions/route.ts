/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ action: z.string().min(1) }).passthrough();

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const body = parsed.data as Record<string, any>;
  const admin = createAdminClient();

  if (body.action === "create-set") {
    const input = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional().default(""), permissions: z.record(z.string(), z.boolean()).default({}) }).parse(body);
    const { data, error } = await admin.from("admin_permission_sets").insert({ name: input.name, description: input.description || null, permissions: input.permissions, created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("권한 세트를 만들지 못했습니다.", 400, "PERMISSION_SET_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "assign-set") {
    const input = z.object({ profileId: z.uuid(), setId: z.uuid() }).parse(body);
    const { data, error } = await admin.from("admin_permission_assignments").upsert({ profile_id: input.profileId, permission_set_id: input.setId, assigned_by: guard.auth.userId, assigned_at: new Date().toISOString() }, { onConflict: "profile_id" }).select("*").single();
    if (error) return fail("권한을 배정하지 못했습니다.", 400, "PERMISSION_ASSIGN_FAILED", error.message);
    return ok(data, 201);
  }

  return fail("지원하지 않는 권한 작업입니다.", 404, "UNKNOWN_PERMISSION_ACTION");
}
