import { z } from "zod";
import { enforceSameOrigin, fail, ok, requestMeta, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { runtimeLog } from "@/lib/ops/logger";


export const maxDuration = 5;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  event: z.string().trim().min(1).max(120).default("CLIENT_ERROR"),
  message: z.string().trim().max(1000).optional(),
  route: z.string().trim().max(300).optional(),
  details: z.unknown().optional(),
});

async function postHandler(request: Request) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("로그 형식을 확인해 주세요.", 422, "VALIDATION_ERROR");

  const meta = requestMeta(request);
  runtimeLog({
    level: "WARN",
    event: parsed.data.event,
    route: parsed.data.route,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { message: parsed.data.message, details: parsed.data.details },
  });

  return ok({ logged: true });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/ops/error-log", rateLimit: { kind: "api", limit: 20, windowSeconds: 60 } });
