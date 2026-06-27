import { Dices, LayoutDashboard, LogIn, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { MobileMenu } from "@/components/mobile-menu";

export async function SiteHeader() {
  const profile = await getCurrentProfile();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/" aria-label="Dynamic Draw 홈">
          <span className="brand-mark"><Dices size={22} strokeWidth={2.4} /></span>
          <span className="brand-text">Dynamic <span>Draw</span></span>
        </Link>
        <nav className="nav" aria-label="주 메뉴">
          <Link href="/events">이벤트</Link>
          <Link href="/notices">공지</Link>
          <Link href="/play">직접 뽑기</Link>
          <Link href="/probabilities">확률표</Link>
          <Link href="/results">최근 결과</Link>
          <Link href="/stats">통계</Link>
        </nav>
        <div className="header-actions">
          {profile ? (
            <>
              {isAdminRole(profile.role) && (
                <Link className="btn btn-secondary btn-sm desktop-only" href="/admin"><LayoutDashboard size={15} /> 관리자</Link>
              )}
              <Link className="btn btn-primary btn-sm" href="/play"><Sparkles size={15} /> 뽑기</Link>
              <Link className="btn btn-secondary btn-sm desktop-only" href="/account"><UserRound size={15} /> 내 정보</Link>
              <span className="desktop-only"><LogoutButton compact /></span>
            </>
          ) : (
            <Link className="btn btn-primary btn-sm" href="/login"><LogIn size={15} /> 로그인</Link>
          )}
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
