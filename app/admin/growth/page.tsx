import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GrowthManager } from "@/components/growth-manager";

export const metadata: Metadata = { title: "레벨·VIP·배지" };
export const dynamic = "force-dynamic";

export default async function AdminGrowthPage() {
  await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const [members, draws, levels, drawExp, vipTiers, badges, profileBadges, growthRows, expLogs, currencies, rewards, boxes] = await Promise.all([
    admin.from("profiles").select("id,display_name,username,email,member_code,role,status").eq("status", "APPROVED").order("display_name", { ascending: true }),
    admin.from("draws").select("id,name,status,is_public,deleted_at").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("level_rules").select("*").order("level_no", { ascending: true }),
    admin.from("draw_exp_settings").select("*,draws(name,status)").order("updated_at", { ascending: false }),
    admin.from("vip_tiers").select("*").order("sort_order", { ascending: true }),
    admin.from("badges").select("*").order("sort_order", { ascending: true }),
    admin.from("profile_badges").select("*,profiles(display_name,username),badges(name,icon,label_color)").order("granted_at", { ascending: false }).limit(120),
    admin.from("profile_growth").select("*,profiles(display_name,username,member_code,role)").order("exp_total", { ascending: false }).limit(120),
    admin.from("exp_logs").select("*,profiles(display_name,username)").order("created_at", { ascending: false }).limit(80),
    admin.from("virtual_currencies").select("id,name,symbol,code,is_active,deleted_at").is("deleted_at", null).eq("is_active", true).order("name", { ascending: true }),
    admin.from("rewards").select("id,name,description,is_active,deleted_at").is("deleted_at", null).eq("is_active", true).order("name", { ascending: true }),
    admin.from("random_boxes").select("id,name,description,is_active,deleted_at").is("deleted_at", null).eq("is_active", true).order("name", { ascending: true }),
  ]);
  return <main><div className="page-heading"><h1>레벨·VIP·배지</h1><p>뽑기 경험치, 레벨, VIP 등급, 배지와 휘장을 한곳에서 관리합니다.</p></div><GrowthManager data={{ members: members.data ?? [], draws: draws.data ?? [], levels: levels.data ?? [], drawExp: drawExp.data ?? [], vipTiers: vipTiers.data ?? [], badges: badges.data ?? [], profileBadges: profileBadges.data ?? [], growthRows: growthRows.data ?? [], expLogs: expLogs.data ?? [], currencies: currencies.data ?? [], rewards: rewards.data ?? [], boxes: boxes.data ?? [] }} /></main>;
}
