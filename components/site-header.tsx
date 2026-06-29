import { LayoutDashboard, LogIn, UserRound } from "lucide-react";
import Link from "next/link";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { displayLoginId } from "@/lib/identity";
import { MobileMenu } from "@/components/mobile-menu";
import { LogoutButton } from "@/components/logout-button";

const navLinks = [
  { href: "/notices", label: "공지" },
  { href: "/events", label: "이벤트" },
  { href: "/raffles", label: "추첨이벤트" },
  { href: "/play", label: "뽑기&교환" },
  { href: "/rewards", label: "보상 센터" },
  { href: "/rankings", label: "랭킹" },
  { href: "/support", label: "문의센터" },
  { href: "/dashboard", label: "통계" },
];

export async function SiteHeader() {
  const profile = await getCurrentProfile();
  return (
    <header className="site-header official-header simple-header mobile-first-header">
      <div className="container header-inner simple-header-inner">
        <Link className="brand official-brand simple-brand" href="/" aria-label="𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 홈">
          <span className="brand-mark official-brand-mark">D</span>
          <span className="brand-text">𝐃𝐲𝐧𝐚𝐦𝐢𝐜 <span>𝐃</span></span>
        </Link>
        <nav className="nav simple-nav" aria-label="공개 메뉴">
          {navLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
        <div className="header-actions simple-header-actions">
          {profile && isAdminRole(profile.role) && <Link className="btn btn-secondary btn-sm desktop-only" href="/admin"><LayoutDashboard size={16} /> 관리자</Link>}
          {profile ? <Link className="btn btn-primary btn-sm account-chip" href="/account"><UserRound size={16} /> {displayLoginId(profile)}</Link> : <Link className="btn btn-primary btn-sm" href="/login"><LogIn size={16} /> 로그인</Link>}
          {profile && <LogoutButton compact />}
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
