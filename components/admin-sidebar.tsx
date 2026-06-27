"use client";

import { Activity, ArrowLeftRight, BarChart3, FileClock, ImageIcon, LayoutDashboard, ListChecks, Logs, Megaphone, Settings, ShieldCheck, TicketCheck, Tickets, Trophy, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";

const items = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard, minimum: "VIEWER" },
  { href: "/admin/draws", label: "뽑기·상품·확률", icon: TicketCheck, minimum: "MANAGER" },
  { href: "/admin/live", label: "실시간 추첨", icon: Activity, minimum: "MANAGER" },
  { href: "/admin/tickets", label: "추첨권·화폐 설정", icon: Tickets, minimum: "MANAGER" },
  { href: "/admin/raffles", label: "전체 회원 추첨", icon: Trophy, minimum: "MANAGER" },
  { href: "/admin/contents", label: "공지·이벤트", icon: Megaphone, minimum: "MANAGER" },
  { href: "/admin/members", label: "회원 관리", icon: UsersRound, minimum: "MANAGER" },
  { href: "/admin/activity", label: "유저 활동 로그", icon: Activity, minimum: "VIEWER" },
  { href: "/admin/exchanges", label: "교환 시스템", icon: ArrowLeftRight, minimum: "MANAGER" },
  { href: "/admin/results", label: "결과 관리", icon: ListChecks, minimum: "VIEWER" },
  { href: "/admin/result-images", label: "결과 이미지 생성", icon: ImageIcon, minimum: "MANAGER" },
  { href: "/admin/stats", label: "통계", icon: BarChart3, minimum: "VIEWER" },
  { href: "/admin/probability-history", label: "확률 변경 기록", icon: FileClock, minimum: "VIEWER" },
  { href: "/admin/logs", label: "관리자 로그", icon: Logs, minimum: "VIEWER" },
  { href: "/admin/settings", label: "설정", icon: Settings, minimum: "SUPER_ADMIN" },
] as const;

const rank = { USER: 0, VIEWER: 1, MANAGER: 2, SUPER_ADMIN: 3 } as const;
const roleLabel = { USER: "일반 회원", VIEWER: "조회 관리자", MANAGER: "일반 관리자", SUPER_ADMIN: "최고 관리자" } as const;

export function AdminSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  return (
    <aside className="admin-sidebar">
      <div className="admin-user">
        <strong>{profile.display_name}</strong>
        <span><ShieldCheck size={11} style={{ verticalAlign: -2 }} /> {roleLabel[profile.role]}</span>
      </div>
      <nav className="admin-nav" aria-label="관리자 메뉴">
        {items.filter((item) => rank[profile.role] >= rank[item.minimum]).map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={17} />{label}</Link>;
        })}
      </nav>
    </aside>
  );
}
