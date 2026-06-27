import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="footer official-footer">
      <div className="container footer-inner official-footer-inner">
        <div>
          <strong>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</strong>
          <span>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 전용 이벤트 운영 사이트 · v1.0.1</span>
        </div>
        <div className="footer-links">
          <Link href="/notices">공지</Link>
          <Link href="/events">이벤트</Link>
          <Link href="/raffles">전체 추첨</Link>
          <Link href="/play">직접 추첨</Link>
          <Link href="/login">관리자 로그인</Link>
        </div>
      </div>
    </footer>
  );
}
