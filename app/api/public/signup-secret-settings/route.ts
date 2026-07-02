import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

export async function GET() {
  return NextResponse.json({ ok: true, data: { enabled: false, requestUrl: "", buttonLabel: "", helpText: "" } });
}
