import Link from "next/link";
import { demoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

async function getFooterMessage() {
  if (demoMode) return "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃는 온전한 이벤트 홈페이지로서 현금, 현물 등을 요구하지 않습니다.";
  try {
    const { data } = await createAdminClient().from("site_settings").select("value").eq("key", "footer_message").maybeSingle();
    const value = String((data as { value?: unknown } | null)?.value ?? "").replace(/^"|"$/g, "").trim();
    return value || "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 전용 이벤트 운영 사이트 · v1.0.3";
  } catch {
    return "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 전용 이벤트 운영 사이트 · v1.0.3";
  }
}

export async function SiteFooter() {
  const message = await getFooterMessage();
  return (
    <footer className="footer official-footer">
      <div className="container footer-inner official-footer-inner">
        <div>
          <strong>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</strong>
          <span>{message}</span>
        </div>
        <div className="footer-links">
          <Link href="/notices">공지</Link>
          <Link href="/events">이벤트</Link>
          <Link href="/raffles">추첨 이벤트</Link>
          <Link href="/play">뽑기 & 교환</Link>
          <Link href="/rewards">보상 센터</Link>
          <Link href="/donations">후원</Link>
        </div>
      </div>
    </footer>
  );
}
