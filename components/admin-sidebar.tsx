"use client";

import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileClock,
  Gift,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Logs,
  Megaphone,
  MessageCircle,
  NotebookPen,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TicketCheck,
  Tickets,
  Trophy,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import type { Profile } from "@/lib/types";
import {
  type AdminCapability,
  type AdminRole,
  ROLE_LABELS,
  hasCapability,
  hasMinimumRole,
  isAdminRole,
  normalizeRole,
} from "@/lib/admin-capabilities";

type MenuItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  minimum?: AdminRole;
  capability?: AdminCapability;
  roles?: readonly AdminRole[];
};

type MenuGroup = {
  key: string;
  title: string;
  description: string;
  items: MenuItem[];
};

const STORAGE_KEY = "dynamicd.admin.sidebar.collapsed.v162";

const groups: MenuGroup[] = [
  {
    key: "overview",
    title: "운영 현황",
    description: "전체 상태와 기록 확인",
    items: [
      { href: "/admin", label: "관리 홈", icon: LayoutDashboard, roles: ["VIEWER", "CS_MANAGER", "MANAGER", "SUPER_ADMIN"] },
      { href: "/admin/stats", label: "통계", icon: BarChart3, minimum: "VIEWER" },
      { href: "/admin/operations", label: "운영 통계", icon: ClipboardList, minimum: "VIEWER" },
      { href: "/admin/security", label: "보안 방어", icon: ShieldAlert, minimum: "MANAGER" },
      { href: "/admin/activity", label: "유저 활동 로그", icon: Activity, minimum: "VIEWER" },
    ],
  },
  {
    key: "draws",
    title: "뽑기·라이브·결과 관리",
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
    key: "rewards",
    title: "추첨권·포인트·추천 보상",
    description: "추첨권, 포인트, 추천 보상",
    items: [
      { href: "/admin/tickets", label: "추첨권·포인트", icon: Tickets, capability: "GRANT_REWARD" },
      { href: "/admin/rewards", label: "추천·보상", icon: Gift, minimum: "MANAGER" },
      { href: "/admin/step-events", label: "스탭업 미션", icon: ListChecks, minimum: "MANAGER" },
      { href: "/admin/coupons", label: "쿠폰 공개 설정", icon: Gift, minimum: "MANAGER" },
      { href: "/admin/growth", label: "레벨·VIP·배지", icon: Sparkles, minimum: "MANAGER" },
      { href: "/admin/exchanges", label: "교환 시스템", icon: ArrowLeftRight, minimum: "MANAGER" },
    ],
  },
  {
    key: "members",
    title: "공지·문의·회원 운영",
    description: "공지, 문의, 회원 운영",
    items: [
      { href: "/admin/contents", label: "공지·이벤트", icon: Megaphone, minimum: "MANAGER" },
      { href: "/admin/community", label: "커뮤니티 관리", icon: MessageCircle, minimum: "MANAGER" },
      { href: "/admin/reviews", label: "당첨 후기 관리", icon: Gift, minimum: "MANAGER" },
      { href: "/admin/support", label: "문의센터 관리", icon: MessageCircle, capability: "SUPPORT_REPLY" },
      { href: "/admin/members", label: "회원 관리", icon: UsersRound, capability: "MEMBER_STATUS" },
      { href: "/admin/password-recovery", label: "비밀번호 복구", icon: KeyRound, minimum: "SUPER_ADMIN" },
      { href: "/admin/member-grades", label: "회원 등급", icon: ShieldCheck, minimum: "MANAGER" },
      { href: "/admin/blacklist", label: "블랙리스트", icon: ShieldX, minimum: "MANAGER" },
    ],
  },
  {
    key: "workspace",
    title: "권한·메모·회의록",
    description: "권한, 메모, 회의록",
    items: [
      { href: "/admin/permissions", label: "관리자 권한", icon: ShieldCheck, minimum: "SUPER_ADMIN" },
      { href: "/admin/workspace", label: "관리자 메모·회의록", icon: NotebookPen, minimum: "MANAGER" },
      { href: "/admin/automation", label: "자동화", icon: CalendarClock, minimum: "MANAGER" },
    ],
  },
  {
    key: "system",
    title: "로그와 전체 설정",
    description: "로그와 전체 설정",
    items: [
      { href: "/admin/server-status", label: "서버 상태", icon: Activity, roles: ["VIEWER", "CS_MANAGER", "MANAGER", "SUPER_ADMIN"] },
      { href: "/admin/logs", label: "관리자 로그", icon: Logs, minimum: "VIEWER" },
      { href: "/admin/operation-mode", label: "운영 모드", icon: ShieldAlert, minimum: "SUPER_ADMIN" },
      { href: "/admin/settings", label: "설정", icon: Settings, minimum: "SUPER_ADMIN" },
    ],
  },
];

function canSeeItem(role: string, item: MenuItem) {
  if (!isAdminRole(role)) return false;
  if (item.roles) return item.roles.includes(role as AdminRole);
  if (item.capability) return hasCapability(role, item.capability);
  // CS매니저는 명시적으로 허용된 메뉴만 노출합니다.
  if (role === "CS_MANAGER") return false;
  return hasMinimumRole(role, item.minimum ?? "VIEWER");
}

function isActivePath(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

function saveCollapsedGroups(next: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
}

export function AdminSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const role = normalizeRole(profile.role);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set<string>());

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canSeeItem(role, item)),
        }))
        .filter((group) => group.items.length > 0),
    [role],
  );

  const activeGroupKey = useMemo(() => {
    return visibleGroups.find((group) => group.items.some((item) => isActivePath(pathname, item.href)))?.key ?? null;
  }, [pathname, visibleGroups]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setCollapsedGroups(new Set<string>(parsed.filter((value): value is string => typeof value === "string")));
    } catch {
      setCollapsedGroups(new Set<string>());
    }
  }, []);

  useEffect(() => {
    if (!activeGroupKey) return;
    setCollapsedGroups((previous) => {
      if (!previous.has(activeGroupKey)) return previous;
      const next = new Set<string>(previous);
      next.delete(activeGroupKey);
      saveCollapsedGroups(next);
      return next;
    });
  }, [activeGroupKey]);

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((previous) => {
      const next = new Set<string>(previous);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      saveCollapsedGroups(next);
      return next;
    });
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-user">
        <strong>{profile.display_name}</strong>
        <span>{ROLE_LABELS[role] ?? role}</span>
      </div>

      <nav className="admin-nav" aria-label="관리자 메뉴">
        {visibleGroups.map((group) => {
          const groupActive = group.items.some((item) => isActivePath(pathname, item.href));
          const isCollapsed = collapsedGroups.has(group.key) && !groupActive;
          const ToggleIcon = isCollapsed ? ChevronRight : ChevronDown;

          return (
            <section className={groupActive ? "admin-nav-group active" : "admin-nav-group"} key={group.key}>
              <div className="admin-nav-group-title">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={`admin-nav-${group.key}`}
                  onClick={() => toggleGroup(group.key)}
                  style={{
                    alignItems: "center",
                    appearance: "none",
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    gap: 8,
                    justifyContent: "space-between",
                    padding: 0,
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <strong>{group.title}</strong>
                  <small style={{ alignItems: "center", display: "inline-flex", gap: 3, whiteSpace: "nowrap" }}>
                    <ToggleIcon size={13} /> {isCollapsed ? "펼치기" : "접기"}
                  </small>
                </button>
                <span>{group.description}</span>
              </div>

              {!isCollapsed && (
                <div className="admin-nav-group-links" id={`admin-nav-${group.key}`}>
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isActivePath(pathname, href);
                    return (
                      <Link className={active ? "active" : undefined} href={href} key={href}>
                        <Icon size={17} /> {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
