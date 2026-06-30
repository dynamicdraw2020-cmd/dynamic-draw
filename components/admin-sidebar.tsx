"use client";

import { Activity, ArrowLeftRight, BarChart3, CalendarClock, ClipboardList, FileClock, Gift, ImageIcon, LayoutDashboard, ListChecks, Logs, Megaphone, MessageCircle, NotebookPen, Settings, ShieldCheck, ShieldX, Sparkles, TicketCheck, Tickets, Trophy, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";

const groups = [
  {
    title: "운영 현황",
    description: "전체 상태와 기록 확인",
    items: [
      { href: "/admin", label: "관리 홈", icon: LayoutDashboard, minimum: "VIEWER" },
      { href: "/admin/settings", label: "운영 모드 설정", icon: Settings, minimum: "SUPER_ADMIN" },
      { href: "/admin/stats", label: "통계", icon: BarChart3, minimum: "VIEWER" },
      { href: "/admin/operations", label: "운영 통계", icon: ClipboardList, minimum: "VIEWER" },
      { href: "/admin/activity", label: "유저 활동 로그", icon: Activity, minimum: "VIEWER" },
    ],
  },
  {
    title: "이벤트·추첨",
    description: "뽑기, 라이브, 결과 관리",
    items: [
      { href: "/admin/draws", label: "뽑기·교환·확률", icon: TicketCheck, minimum: "MANAGER" },
      { href: "/admin/live", label: "실시간 추첨", icon: Activity, minimum: "MANAGER" },
      { href: "/admin/raffles", label: "추첨 이벤트", icon: Trophy, minimum: "MANAGER" },
      { href: "/admin/results", label: "결과 관리", icon: ListChecks, minimum: "VIEWER" },
      { href: "/admin/result-images", label: "결과 이미지 생성", icon: ImageIcon, minimum: "MANAGER" },
      { href: "/admin/probability-history", label: "확률 변경 기록", icon: FileClock, minimum: "VIEWER" },
    ],
  },
  {
    title: "보상·경제",
    description: "추첨권, 화폐, 추천 보상",
    items: [
      { href: "/admin/tickets", label: "추첨권·화폐 설정", icon: Tickets, minimum: "MANAGER" },
      { href: "/admin/rewards", label: "추천·보상", icon: Gift, minimum: "MANAGER" },
      { href: "/admin/growth", label: "레벨·VIP·배지", icon: Sparkles, minimum: "MANAGER" },
      { href: "/admin/exchanges", label: "교환 시스템", icon: ArrowLeftRight, minimum: "MANAGER" },
    ],
  },
  {
    title: "콘텐츠·회원",
    description: "공지, 이벤트, 회원 운영",
    items: [
      { href: "/admin/contents", label: "공지·이벤트", icon: Megaphone, minimum: "MANAGER" },
      { href: "/admin/community", label: "커뮤니티 관리", icon: MessageCircle, minimum: "MANAGER" },
      { href: "/admin/reviews", label: "당첨 후기 관리", icon: Gift, minimum: "MANAGER" },
      { href: "/admin/support", label: "문의센터 관리", icon: MessageCircle, minimum: "MANAGER" },
      { href: "/admin/members", label: "회원 관리", icon: UsersRound, minimum: "MANAGER" },
      { href: "/admin/member-grades", label: "회원 등급", icon: ShieldCheck, minimum: "MANAGER" },
      { href: "/admin/blacklist", label: "블랙리스트", icon: ShieldX, minimum: "MANAGER" },
    ],
  },
  {
    title: "운영 조직",
    description: "권한, 메모, 회의록",
    items: [
      { href: "/admin/permissions", label: "관리자 권한", icon: ShieldCheck, minimum: "SUPER_ADMIN" },
      { href: "/admin/workspace", label: "관리자 메모·회의록", icon: NotebookPen, minimum: "MANAGER" },
      { href: "/admin/automation", label: "자동화", icon: CalendarClock, minimum: "MANAGER" },
    ],
  },
  {
    title: "시스템",
    description: "로그와 전체 설정",
    items: [
      { href: "/admin/logs", label: "관리자 로그", icon: Logs, minimum: "VIEWER" },
      { href: "/admin/settings", label: "설정", icon: Settings, minimum: "SUPER_ADMIN" },
    ],
  },
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
        {groups.map((group) => {
          const visibleItems = group.items.filter((item) => rank[profile.role] >= rank[item.minimum]);
          if (!visibleItems.length) return null;
          const groupActive = visibleItems.some((item) => item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href));
          return <details className="admin-nav-group" key={group.title} open={groupActive}>
            <summary className="admin-nav-group-title">
              <strong>{group.title}</strong>
              <span>{group.description}</span>
            </summary>
            <div className="admin-nav-group-links">
              {visibleItems.map(({ href, label, icon: Icon }) => {
                const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
                return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={17} />{label}</Link>;
              })}
            </div>
          </details>;
        })}
      </nav>
    </aside>
  );
}
