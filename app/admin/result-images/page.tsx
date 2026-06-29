import type { Metadata } from "next";
import { ResultImageGenerator } from "@/components/result-image-generator";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "결과 이미지 생성" };
export const dynamic = "force-dynamic";

export default async function ResultImagesPage() {
  await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const [results, rewards, templates] = await Promise.all([
    admin.from("results").select("id,public_display_name,public_member_code,created_at,draws(name),rewards(id,name,image_url,color)").not("revealed_at", "is", null).is("voided_at", null).order("created_at", { ascending: false }).limit(120),
    admin.from("rewards").select("id,name,image_url,color,is_active,deleted_at").is("deleted_at", null).eq("is_active", true).order("name", { ascending: true }).limit(300),
    admin.from("result_image_templates").select("id,title,winner_text,prize_text,message,reward_id,result_id,image_data_url,created_at,reward:rewards(name),result:results(public_display_name)").order("created_at", { ascending: false }).limit(80),
  ]);
  return <><div className="admin-toolbar"><div><h1>결과 이미지 생성</h1><p className="text-muted">당첨 결과와 상품을 선택해 공지용 PNG 카드를 만들고 템플릿으로 등록합니다.</p></div></div><ResultImageGenerator results={(results.data ?? []) as never[]} rewards={(rewards.data ?? []) as never[]} templates={(templates.data ?? []) as never[]} /></>;
}
