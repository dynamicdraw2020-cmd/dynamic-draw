import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

export async function POST() {
  return NextResponse.json({ ok: false, error: "REMOVED", message: "This feature has been removed." }, { status: 410 });
}
