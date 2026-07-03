import type { Metadata } from "next";
import { ContentManager } from "@/components/content-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminEvents, getAdminNotices } from "@/lib/data";

export const metadata: Metadata = { title: "공지·이벤트" };
export const dynamic = "force-dynamic";

export default async function AdminContentsPage() {
  await requireAdmin("MANAGER");
  const [notices, events] = await Promise.all([getAdminNotices(), getAdminEvents()]);
  return <><div className="admin-toolbar"><div><h1>공지·이벤트 관리</h1><p className="text-muted">서비스 공지와 이벤트 안내를 공개 페이지에 게시합니다.</p></div></div><ContentManager notices={notices} events={events} /></>;
}
