import type { Metadata } from "next";
import "@/app/globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃", template: "%s | 𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃" },
  description: "Dynamic에서 주관하는 이벤트 전용 추첨 안내 사이트",
  openGraph: {
    title: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃",
    description: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 - 이벤트 전용 사이트",
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
