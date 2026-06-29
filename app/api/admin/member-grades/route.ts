import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ action: z.string().min(1) }).passthrough();

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();
  if (body.action === "create-tier") {
    const input = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).optional().default(""), labelColor: z.string().trim().max(30).optional().default("#2563eb"), canUseCommunity: z.union([z.literal("on"), z.boolean()]).optional(), sortOrder: z.coerce.number().int().default(10) }).parse(body);
    const { data, error } = await admin.from("member_tiers").insert({ name: input.name, description: input.description || null, label_color: input.labelColor, can_use_community: Boolean(input.canUseCommunity), sort_order: input.sortOrder, created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("회원 등급을 만들지 못했습니다.", 400, "TIER_CREATE_FAILED", error.message);
    return ok(data, 201);
  }
  if (body.action === "assign-tier") {
    const input = z.object({ profileId: z.uuid(), tierId: z.uuid() }).parse(body);
    const { data, error } = await admin.from("profile_member_tiers").upsert({ profile_id: input.profileId, tier_id: input.tierId, assigned_by: guard.auth.userId, assigned_at: new Date().toISOString() }, { onConflict: "profile_id" }).select("*").single();
    if (error) return fail("회원 등급을 배정하지 못했습니다.", 400, "TIER_ASSIGN_FAILED", error.message);
    return ok(data, 201);
  }
  if (body.action === "remove-assignment") {
    const input = z.object({ profileId: z.uuid() }).parse(body);
    const { error } = await admin.from("profile_member_tiers").delete().eq("profile_id", input.profileId);
    if (error) return fail("회원 등급을 해제하지 못했습니다.", 400, "TIER_REMOVE_FAILED", error.message);
    return ok({ removed: true });
  }
  if (body.action === "toggle-tier") {
    const input = z.object({ id: z.uuid(), isActive: z.boolean() }).parse(body);
    const { error } = await admin.from("member_tiers").update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq("id", input.id);
    if (error) return fail("회원 등급 상태를 바꾸지 못했습니다.", 400, "TIER_TOGGLE_FAILED", error.message);
    return ok({ changed: true });
  }
  if (body.action === "delete-tier") {
    const input = z.object({ id: z.uuid() }).parse(body);
    const { error } = await admin.from("member_tiers").delete().eq("id", input.id);
    if (error) return fail("회원 등급을 삭제하지 못했습니다.", 400, "TIER_DELETE_FAILED", error.message);
    return ok({ deleted: true });
  }
  return fail("지원하지 않는 작업입니다.", 404, "UNKNOWN_MEMBER_GRADE_ACTION");
}
