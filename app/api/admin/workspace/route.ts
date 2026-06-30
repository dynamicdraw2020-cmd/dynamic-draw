import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ action: z.string().min(1) }).passthrough();

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();
  if (body.action === "create-note") {
    const input = z.object({ profileId: z.string().optional().nullable(), note: z.string().trim().min(1).max(2000) }).parse(body);
    const { data, error } = await admin.from("admin_notes").insert({ profile_id: input.profileId || null, note: input.note, created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("메모를 저장하지 못했습니다.", 400, "NOTE_CREATE_FAILED", error.message);
    return ok(data, 201);
  }
  if (body.action === "create-meeting") {
    const input = z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(5000), decisions: z.string().trim().max(3000).optional().default("") }).parse(body);
    const { data, error } = await admin.from("admin_meetings").insert({ title: input.title, body: input.body, decisions: input.decisions || null, created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("회의록을 저장하지 못했습니다.", 400, "MEETING_CREATE_FAILED", error.message);
    return ok(data, 201);
  }
  if (body.action === "acknowledge-note") {
    const input = z.object({ id: z.uuid() }).parse(body);
    const { data, error } = await admin
      .from("admin_note_reads")
      .upsert({ note_id: input.id, admin_id: guard.auth.userId, read_at: new Date().toISOString() }, { onConflict: "note_id,admin_id" })
      .select("*")
      .single();
    if (error) return fail("메모 확인 처리를 저장하지 못했습니다.", 400, "NOTE_ACK_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "unacknowledge-note") {
    const input = z.object({ id: z.uuid() }).parse(body);
    const { error } = await admin.from("admin_note_reads").delete().eq("note_id", input.id).eq("admin_id", guard.auth.userId);
    if (error) return fail("메모 확인 취소를 저장하지 못했습니다.", 400, "NOTE_ACK_CANCEL_FAILED", error.message);
    return ok({ removed: true });
  }

  if (body.action === "delete-note") {
    const input = z.object({ id: z.uuid() }).parse(body);
    const { error } = await admin.from("admin_notes").delete().eq("id", input.id);
    if (error) return fail("메모를 삭제하지 못했습니다.", 400, "NOTE_DELETE_FAILED", error.message);
    return ok({ deleted: true });
  }
  if (body.action === "delete-meeting") {
    const input = z.object({ id: z.uuid() }).parse(body);
    const { error } = await admin.from("admin_meetings").delete().eq("id", input.id);
    if (error) return fail("회의록을 삭제하지 못했습니다.", 400, "MEETING_DELETE_FAILED", error.message);
    return ok({ deleted: true });
  }
  return fail("지원하지 않는 작업입니다.", 404, "UNKNOWN_WORKSPACE_ACTION");
}
