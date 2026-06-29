import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";
import { requireAdmin } from "@/lib/auth";
import { demoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "사이트 설정" };

export default async function AdminSettingsPage() {
  await requireAdmin("SUPER_ADMIN");
  const initial = { siteName: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃", heroTitle: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃", heroDescription: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event server", publicStats: true, operationMode: "ACTIVE", operationMessage: "현재 시스템 점검 중입니다.", operationEndsAt: "", playHeroTitle: "내 추첨권으로 뽑기 & 교환하기", playHeroDescription: "룰렛 칸은 모두 같은 크기로 보여 확률을 유추할 수 없습니다. 실제 결과는 서버 확률로 먼저 결정됩니다.", probabilityTitle: "상품 확률", probabilityDescription: "실제 확률은 아래 표 기준입니다. 애니메이션은 모든 칸을 동일 크기로 보여줍니다.", footerMessage: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 전용 이벤트 운영 사이트 · v1.0.3", monthlyRankImageUrl: "" };
  if (!demoMode) {
    const admin = createAdminClient();
    const { data } = await admin.from("site_settings").select("key,value").in("key", ["site_name", "hero_title", "hero_description", "public_stats", "operation_mode", "operation_message", "operation_ends_at", "footer_message", "monthly_rank_image_url", "play_hero_title", "play_hero_description", "probability_title", "probability_description"]);
    for (const row of data ?? []) {
      if (row.key === "site_name") initial.siteName = String(row.value);
      if (row.key === "hero_title") initial.heroTitle = String(row.value);
      if (row.key === "hero_description") initial.heroDescription = String(row.value);
      if (row.key === "public_stats") initial.publicStats = Boolean(row.value);
      if (row.key === "operation_mode") initial.operationMode = String(row.value).replace(/^"|"$/g, "");
      if (row.key === "operation_message") initial.operationMessage = String(row.value).replace(/^"|"$/g, "");
      if (row.key === "operation_ends_at") initial.operationEndsAt = String(row.value ?? "").replace(/^"|"$/g, "");
      if (row.key === "footer_message") initial.footerMessage = String(row.value ?? "").replace(/^"|"$/g, "");
      if (row.key === "monthly_rank_image_url") initial.monthlyRankImageUrl = String(row.value ?? "").replace(/^"|"$/g, "");
      if (row.key === "play_hero_title") initial.playHeroTitle = String(row.value ?? "").replace(/^"|"$/g, "");
      if (row.key === "play_hero_description") initial.playHeroDescription = String(row.value ?? "").replace(/^"|"$/g, "");
      if (row.key === "probability_title") initial.probabilityTitle = String(row.value ?? "").replace(/^"|"$/g, "");
      if (row.key === "probability_description") initial.probabilityDescription = String(row.value ?? "").replace(/^"|"$/g, "");
    }
  }
  return <><div className="admin-toolbar"><div><h1>사이트 설정</h1><p className="text-muted">서비스 이름과 공개 문구 등 전역 설정을 관리합니다.</p></div></div><SettingsForm initial={initial} /></>;
}
