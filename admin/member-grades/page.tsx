import type { Metadata } from "next";
import { MemberGradeManager } from "@/components/member-grade-manager";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "회원 등급" };
export const dynamic = "force-dynamic";

export default async function MemberGradesPage() {
  await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const [members, tiers, assignments] = await Promise.all([
    admin.from("profiles").select("id,display_name,username,email,member_code,role,status").neq("status", "DELETED").order("display_name", { ascending: true }),
    admin.from("member_tiers").select("*").order("sort_order", { ascending: true }),
    admin.from("profile_member_tiers").select("profile_id,tier_id,profiles(display_name,username,email,member_code,role,status),member_tiers(name,label_color,can_use_community)").order("assigned_at", { ascending: false }),
  ]);
  return <main><div className="page-heading"><h1>회원 등급</h1><p>일반 회원 등급을 세분화하고 커뮤니티 사용 가능 등급을 설정합니다.</p></div><MemberGradeManager members={(members.data ?? []) as never[]} tiers={(tiers.data ?? []) as never[]} assignments={(assignments.data ?? []) as never[]} /></main>;
}
