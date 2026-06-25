import type { Metadata } from "next";
import { DrawManager } from "@/components/draw-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminDraws } from "@/lib/data";

export const metadata: Metadata = { title: "뽑기·상품·확률 관리" };

export default async function AdminDrawsPage() {
  await requireAdmin("MANAGER");
  const draws = await getAdminDraws();
  return <><div className="admin-toolbar"><div><h1>뽑기·상품·확률 관리</h1><p className="text-muted">뽑기와 상품을 만들고, 확률 합계 100%를 검증해 저장합니다.</p></div></div><DrawManager draws={draws} /></>;
}
