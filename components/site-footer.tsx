import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span>© {new Date().getFullYear()} Dynamic Draw · 이벤트 운영용 추첨 시스템 · v1.3.0</span>
        <div className="footer-links">
          <Link href="/notices">공지</Link>
          <Link href="/events">이벤트</Link>
          <Link href="/probabilities">확률 공개</Link>
          <Link href="/stats">운영 통계</Link>
          <Link href="/login">관리자 로그인</Link>
        </div>
      </div>
    </footer>
  );
}
