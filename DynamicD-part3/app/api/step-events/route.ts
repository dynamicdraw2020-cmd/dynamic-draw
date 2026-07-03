import { ok, requireApiUser, withApiRoute } from "@/lib/api";
import { getUserStepEvents } from "@/lib/step-events";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

async function getHandler() {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;
  const events = await getUserStepEvents(guard.auth.userId);
  return ok({ events });
}

export const GET = withApiRoute(getHandler, {
  routeName: "/api/step-events",
  rateLimit: { kind: "api", limit: 60, windowSeconds: 60 },
});
