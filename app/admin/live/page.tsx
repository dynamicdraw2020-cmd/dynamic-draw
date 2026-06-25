import type { Metadata } from "next";
import { SpinConsole } from "@/components/spin-console";
import { requireAdmin } from "@/lib/auth";
import { getAdminDraws, getAdminMembers } from "@/lib/data";

export const metadata: Metadata = { title: "실시간 추첨" };

export default async function AdminLivePage() {
  await requireAdmin("MANAGER");
  const [draws, members] = await Promise.all([getAdminDraws(), getAdminMembers()]);
  return <><div className="admin-toolbar"><div><h1>실시간 추첨</h1><p className="text-muted">참가 회원을 선택하고 모든 공개 화면에 동시에 연출을 보냅니다.</p></div></div><SpinConsole draws={draws} members={members} /></>;
}
