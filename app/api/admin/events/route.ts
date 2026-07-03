import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  title: z.string().trim().min(2, "이벤트명은 2자 이상 입력해 주세요.").max(80),
  slug: z.string().trim().toLowerCase().min(2, "주소 코드를 입력해 주세요.").max(80).regex(/^[a-z0-9-]+$/, "주소 코드는 영문 소문자, 숫자, -만 사용할 수 있습니다."),
  summary: z.string().trim().max(160).optional().nullable(),
  body: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "ENDED", "ARCHIVED"]).default("ACTIVE"),
  isPublic: z.boolean().optional().default(true),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
});

function nullableText(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return text.length ? text : null;
}

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "이벤트 정보를 확인해 주세요.", 422, "VALIDATION_ERROR");

  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("events")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("events")
    .insert({
      title: parsed.data.title,
      slug: parsed.data.slug,
      summary: nullableText(parsed.data.summary),
      body: nullableText(parsed.data.body),
      status: parsed.data.status,
      is_public: parsed.data.isPublic,
      starts_at: parsed.data.startsAt || null,
      ends_at: parsed.data.endsAt || null,
      sort_order: (maxRow?.sort_order ?? 0) + 10,
      created_by: guard.auth.userId,
    })
    .select("id,title,slug,status,is_public")
    .single();

  if (error || !data) return fail("이벤트를 저장하지 못했습니다. 주소 코드가 이미 있는지 확인해 주세요.", 400, "EVENT_CREATE_FAILED", error?.message);

  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "EVENT_CREATED",
    p_target_table: "events",
    p_target_id: data.id,
    p_details: { title: data.title, slug: data.slug, status: data.status, isPublic: data.is_public },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok(data, 201);
}
