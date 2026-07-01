import { withApiRoute } from "@/lib/api";
import { NextResponse } from "next/server";


export const maxDuration = 5;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getHandler() {
  const now = new Date();
  return NextResponse.json({
    ok: true,
    service: "dynamic-draw",
    status: "alive",
    timestamp: now.toISOString(),
    unixMs: now.getTime(),
    region: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "local",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  });
}

export const GET = withApiRoute(getHandler, { routeName: "/api/ping", rateLimit: false });
