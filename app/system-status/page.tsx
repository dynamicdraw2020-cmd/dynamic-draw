import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoMode } from "@/lib/env";

export const metadata: Metadata = { title: "운영 상태" };
export const dynamic = "force-dynamic";

async function getOperation() {
  if (demoMode) return { mode: "ACTIVE", message: "정상 운영 중입니다.", endsAt: "" };
  try {
    const { data } = await createAdminClient().from("site_settings").select("key,value").in("key", ["operation_mode", "operation_message", "operation_ends_at"]);
    const map = new Map((data ?? []).map((row: { key: string; value: unknown }) => [row.key, String(row.value ?? "").replace(/^"|"$/g, "")]));
    return { mode: map.get("operation_mode") || "ACTIVE", message: map.get("operation_message") || "현재 시스템 점검 중입니다.", endsAt: map.get("operation_ends_at") || "" };
  } catch {
    return { mode: "INACTIVE", message: "현재 접근이 제한되어 있습니다.", endsAt: "" };
  }
}

function modeLabel(mode: string) {
  if (mode === "UPDATING") return "업데이트중";
  if (mode === "INACTIVE") return "비활성화";
  return "운영 상태 안내";
}

export default async function SystemStatusPage() {
  const operation = await getOperation();
  return <main className="page system-status-page"><div className="container page-narrow"><section className="panel panel-pad system-status-card"><ShieldAlert size={42} className="text-gold" /><span className="section-kicker">{modeLabel(operation.mode)}</span><h1>{operation.mode === "UPDATING" ? "서비스 업데이트중입니다" : "현재 접속할 수 없습니다"}</h1><p>{operation.message}</p>{operation.endsAt && <div className="note-box">예상 종료: {operation.endsAt}</div>}<Link className="btn btn-primary" href="/">홈으로 이동</Link></section></div></main>;
}
