import type { Metadata } from "next";
import "@/app/globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://dynamic2020.com"),
  title: { default: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃", template: "%s | 𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃" },
  description: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜에서 제공하는 이벤트 서버입니다.",
  keywords: ["Dynamic D", "Dynamic", "이벤트", "추첨", "커뮤니티", "문의센터", "순위"],
  applicationName: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃",
  robots: { index: true, follow: true },
  openGraph: {
    title: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃",
    description: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜에서 제공하는 이벤트 서버입니다.",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
