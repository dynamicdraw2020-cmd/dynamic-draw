import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
const schema = z.object({ name: z.string().trim().min(2).max(40), code: z.string().trim().min(2).max(24).regex(/^[A-Z0-9_]+$/, "코드는 대문자, 숫자, _만 사용할 수 있습니다."), symbol: z.string().trim().min(1).max(8).default("P") });
export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "화폐 정보를 확인해 주세요.", 422);
  const admin = createAdminClient(); const { data: maxRow } = await admin.from("virtual_currencies").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("virtual_currencies").insert({ name: parsed.data.name, code: parsed.data.code, symbol: parsed.data.symbol, sort_order: (maxRow?.sort_order ?? 0) + 10 }).select("*").single();
  if (error) return fail("화폐를 만들지 못했습니다. 코드가 이미 있는지 확인해 주세요.", 400, "CURRENCY_CREATE_FAILED", error.message);
  const meta = requestMeta(request); await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "VIRTUAL_CURRENCY_CREATED", p_target_table: "virtual_currencies", p_target_id: data.id, p_details: data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
