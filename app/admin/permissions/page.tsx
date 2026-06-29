import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermissionManager } from "@/components/permission-manager";

export const metadata: Metadata = { title: "관리자 권한" };
export const dynamic = "force-dynamic";

export default async function AdminPermissionsPage() {
  await requireAdmin("SUPER_ADMIN");
  const admin = createAdminClient();
  const [profiles, sets, assignments] = await Promise.all([
    admin.from("profiles").select("id,display_name,username,email,role,status,member_code").eq("status", "APPROVED").in("role", ["VIEWER", "MANAGER", "SUPER_ADMIN"]).order("role", { ascending: false }),
    admin.from("admin_permission_sets").select("*").order("created_at", { ascending: false }),
    admin.from("admin_permission_assignments").select("*,profiles(display_name,username,role),permission_set:admin_permission_sets(name)").order("created_at", { ascending: false }),
  ]);
  return <main><div className="page-heading"><h1>관리자 권한</h1><p>관리자 역할과 세부 권한을 체크박스 방식으로 관리합니다.</p></div><PermissionManager data={{ profiles: profiles.data ?? [], sets: sets.data ?? [], assignments: assignments.data ?? [] }} /></main>;
}
