import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";
import { requireAdmin } from "@/lib/auth";
import { demoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "사이트 설정" };

export default async function AdminSettingsPage() {
  await requireAdmin("SUPER_ADMIN");
  const initial = { siteName: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃", heroTitle: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 - 이벤트 전용 사이트", heroDescription: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜에서 주관하는 모든 뽑기(추첨)형 이벤트를 주관하는 사이트. 𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 - 누구보다 빠른 본방 입성을 향한 길.", publicStats: true };
  if (!demoMode) {
    const admin = createAdminClient();
    const { data } = await admin.from("site_settings").select("key,value").in("key", ["site_name", "hero_title", "hero_description", "public_stats"]);
    for (const row of data ?? []) {
      if (row.key === "site_name") initial.siteName = String(row.value);
      if (row.key === "hero_title") initial.heroTitle = String(row.value);
      if (row.key === "hero_description") initial.heroDescription = String(row.value);
      if (row.key === "public_stats") initial.publicStats = Boolean(row.value);
    }
  }
  return <><div className="admin-toolbar"><div><h1>사이트 설정</h1><p className="text-muted">서비스 이름과 공개 문구 등 전역 설정을 관리합니다.</p></div></div><SettingsForm initial={initial} /></>;
}
