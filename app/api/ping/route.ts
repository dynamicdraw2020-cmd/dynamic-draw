import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
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
