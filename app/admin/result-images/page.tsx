import type { Metadata } from "next";
import { ResultImageGenerator } from "@/components/result-image-generator";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "결과 이미지 생성" };

export default async function ResultImagesPage() {
  await requireAdmin("MANAGER");
  return <><div className="admin-toolbar"><div><h1>결과 이미지 생성</h1><p className="text-muted">당첨 결과를 공지용 PNG 카드로 만들어 디스코드와 오픈채팅에 공유합니다.</p></div></div><ResultImageGenerator /></>;
}
