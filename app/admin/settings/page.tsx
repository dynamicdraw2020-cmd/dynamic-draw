import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";
import { requireAdmin } from "@/lib/auth";
import { demoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "사이트 설정" };

export default async function AdminSettingsPage() {
  await requireAdmin("SUPER_ADMIN");
  const initial = { siteName: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃", heroTitle: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃", heroDescription: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event server", publicStats: true, operationMode: "NORMAL", operationMessage: "현재 시스템 점검 중입니다.", operationEndsAt: "" };
  if (!demoMode) {
    const admin = createAdminClient();
    const { data } = await admin.from("site_settings").select("key,value").in("key", ["site_name", "hero_title", "hero_description", "public_stats", "operation_mode", "operation_message", "operation_ends_at"]);
    for (const row of data ?? []) {
      if (row.key === "site_name") initial.siteName = String(row.value);
      if (row.key === "hero_title") initial.heroTitle = String(row.value);
      if (row.key === "hero_description") initial.heroDescription = String(row.value);
      if (row.key === "public_stats") initial.publicStats = Boolean(row.value);
      if (row.key === "operation_mode") initial.operationMode = String(row.value).replace(/^"|"$/g, "");
      if (row.key === "operation_message") initial.operationMessage = String(row.value).replace(/^"|"$/g, "");
      if (row.key === "operation_ends_at") initial.operationEndsAt = String(row.value ?? "").replace(/^"|"$/g, "");
    }
  }
  return <><div className="admin-toolbar"><div><h1>사이트 설정</h1><p className="text-muted">서비스 이름과 공개 문구 등 전역 설정을 관리합니다.</p></div></div><SettingsForm initial={initial} /></>;
}
