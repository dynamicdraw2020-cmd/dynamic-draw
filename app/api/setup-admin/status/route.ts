import { NextResponse } from "next/server";
import { inspectSetupStatus } from "@/lib/setup-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await inspectSetupStatus();
  return NextResponse.json(
    { ok: status.ready || status.locked, data: status },
    {
      status: status.ready || status.locked ? 200 : 503,
      headers: { "cache-control": "no-store, max-age=0" },
    },
  );
}
