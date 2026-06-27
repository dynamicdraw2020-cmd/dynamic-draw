import { LayoutDashboard, LogIn, UserRound } from "lucide-react";
import Link from "next/link";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { displayLoginId } from "@/lib/identity";
import { MobileMenu } from "@/components/mobile-menu";
import { LogoutButton } from "@/components/logout-button";

const navLinks = [
  { href: "/notices", label: "공지" },
  { href: "/events", label: "이벤트" },
  { href: "/raffles", label: "전체 추첨" },
  { href: "/play", label: "직접 참여" },
  { href: "/probabilities", label: "운영 안내" },
  { href: "/dashboard", label: "대시보드" },
];

export async function SiteHeader() {
  const profile = await getCurrentProfile();
  return (
    <header className="site-header official-header">
      <div className="container header-inner">
        <Link className="brand official-brand" href="/" aria-label="𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 홈">
          <span className="brand-mark official-brand-mark">D</span>
          <span className="brand-text">𝐃𝐲𝐧𝐚𝐦𝐢𝐜 <span>𝐃</span></span>
        </Link>
        <nav className="nav" aria-label="공개 메뉴">
          {navLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
        <div className="header-actions">
          {profile && isAdminRole(profile.role) && <Link className="btn btn-secondary btn-sm" href="/admin"><LayoutDashboard size={16} /> 관리자</Link>}
          {profile ? <Link className="btn btn-primary btn-sm" href="/account"><UserRound size={16} /> {displayLoginId(profile)}</Link> : <Link className="btn btn-primary btn-sm" href="/login"><LogIn size={16} /> 로그인</Link>}
          {profile && <LogoutButton compact />}
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
