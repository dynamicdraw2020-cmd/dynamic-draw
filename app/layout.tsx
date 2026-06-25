import type { Metadata } from "next";
import "@/app/globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Dynamic Draw", template: "%s | Dynamic Draw" },
  description: "확률과 결과를 투명하게 공개하는 실시간 이벤트 추첨 시스템",
  openGraph: {
    title: "Dynamic Draw",
    description: "실시간 이벤트 추첨과 투명한 확률 공개",
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
