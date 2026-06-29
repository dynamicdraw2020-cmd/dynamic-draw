import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminWorkspace } from "@/components/admin-workspace";

export const metadata: Metadata = { title: "관리자 메모·회의록" };
export const dynamic = "force-dynamic";

export default async function AdminWorkspacePage() {
  await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const [members, notes, meetings] = await Promise.all([
    admin.from("profiles").select("id,display_name,username,email,role,status,member_code").order("created_at", { ascending: false }).limit(300),
    admin.from("admin_notes").select("*,profiles(display_name,username),creator:profiles!admin_notes_created_by_fkey(display_name,username)").order("created_at", { ascending: false }).limit(160),
    admin.from("admin_meetings").select("*,creator:profiles!admin_meetings_created_by_fkey(display_name,username)").order("created_at", { ascending: false }).limit(120),
  ]);
  return <main><div className="page-heading"><h1>관리자 메모·회의록</h1><p>회원 관련 내부 메모와 운영 회의록을 관리합니다.</p></div><AdminWorkspace data={{ members: members.data ?? [], notes: notes.data ?? [], meetings: meetings.data ?? [] }} /></main>;
}
