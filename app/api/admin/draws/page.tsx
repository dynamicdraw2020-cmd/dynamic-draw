import type { Metadata } from "next";
import { DrawManager } from "@/components/draw-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminDraws, getProductCatalog } from "@/lib/data";

export const metadata: Metadata = { title: "뽑기·상품·확률 관리" };

export default async function AdminDrawsPage() {
  await requireAdmin("MANAGER");
  const [draws, products] = await Promise.all([getAdminDraws(), getProductCatalog()]);
  return <><div className="admin-toolbar"><div><h1>상품 보관함·뽑기 관리</h1><p className="text-muted">상품을 먼저 만들고, 뽑기에 선택 연결한 뒤 확률을 설정합니다.</p></div></div><DrawManager draws={draws} products={products} /></>;
}
