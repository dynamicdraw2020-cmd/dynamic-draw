import { z } from "zod";
import { enforceSameOrigin, fail, ok, readJsonWithLimit, rejectDemoMutation, requestMeta, requireApiUser, withApiRoute } from "@/lib/api";
import { claimStepEventReward } from "@/lib/step-events";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

const schema = z.object({
  eventId: z.string().uuid(),
  stepId: z.string().uuid(),
});

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("수령할 STEP을 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());

  const meta = requestMeta(request);
  const result = await claimStepEventReward({
    admin: createAdminClient(),
    profileId: guard.auth.userId,
    eventId: parsed.data.eventId,
    stepId: parsed.data.stepId,
    actorId: guard.auth.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return ok(result, 201);
}

export const POST = withApiRoute(postHandler, {
  routeName: "/api/step-events/claim",
  rateLimit: { kind: "api", limit: 30, windowSeconds: 60 },
});
