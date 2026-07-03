import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BlacklistManager } from "@/components/blacklist-manager";

export const metadata: Metadata = { title: "블랙리스트" };
export const dynamic = "force-dynamic";

export default async function AdminBlacklistPage() {
  await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const [members, entries] = await Promise.all([
    admin.from("profiles").select("id,display_name,username,email,role,status,member_code").order("created_at", { ascending: false }).limit(400),
    admin.from("blacklist_entries").select("*,profiles(display_name,username,member_code),creator:profiles!blacklist_entries_created_by_fkey(display_name,username)").order("created_at", { ascending: false }).limit(200),
  ]);
  return <main><div className="page-heading"><h1>블랙리스트</h1><p>추첨, 교환, 로그인 등 운영 제한 대상을 관리합니다.</p></div><BlacklistManager data={{ members: members.data ?? [], entries: entries.data ?? [] }} /></main>;
}
