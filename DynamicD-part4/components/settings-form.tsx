"use client";

import { LoaderCircle, Save } from "lucide-react";
import { FormEvent, useState } from "react";

export function SettingsForm({ initial }: { initial: { siteName: string; heroTitle: string; heroDescription: string; publicStats: boolean; operationMode?: string; operationMessage?: string; operationEndsAt?: string; playHeroTitle?: string; playHeroDescription?: string; probabilityTitle?: string; probabilityDescription?: string; footerMessage?: string; monthlyRankImageUrl?: string } }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteName: form.get("siteName"),
        heroTitle: form.get("heroTitle"),
        heroDescription: form.get("heroDescription"),
        publicStats: form.get("publicStats") === "on",
        playHeroTitle: form.get("playHeroTitle"),
        playHeroDescription: form.get("playHeroDescription"),
        probabilityTitle: form.get("probabilityTitle"),
        probabilityDescription: form.get("probabilityDescription"),
        footerMessage: form.get("footerMessage"),
        monthlyRankImageUrl: form.get("monthlyRankImageUrl"),
      }),
    });
    const data = await response.json();
    setLoading(false);
    setMessage(response.ok ? "설정이 저장되었습니다." : data.error?.message ?? "저장하지 못했습니다.");
  }

  return (
    <form className="panel form-card form-grid" onSubmit={submit}>
      <div className="field"><label>서비스 이름</label><input className="input" name="siteName" defaultValue={initial.siteName} maxLength={50} required /></div>
      <div className="field"><label>메인 문구</label><input className="input" name="heroTitle" defaultValue={initial.heroTitle} maxLength={100} required /></div>
      <div className="field"><label>메인 설명</label><textarea className="textarea" name="heroDescription" defaultValue={initial.heroDescription} maxLength={500} required /></div>
      <label className="checkbox-row"><input type="checkbox" name="publicStats" defaultChecked={initial.publicStats} /> 공개 페이지에 누적 통계 표시</label>
      <section className="panel-soft form-grid">
        <h2 className="panel-title mb-0">뽑기 & 교환 배너 문구</h2>
        <div className="field"><label>상단 제목</label><input className="input" name="playHeroTitle" defaultValue={initial.playHeroTitle ?? "내 추첨권으로 뽑기 & 교환하기"} /></div>
        <div className="field"><label>상단 설명</label><textarea className="textarea" name="playHeroDescription" rows={3} defaultValue={initial.playHeroDescription ?? ""} /></div>
        <div className="field"><label>상품 확률 제목</label><input className="input" name="probabilityTitle" defaultValue={initial.probabilityTitle ?? "상품 확률"} /></div>
        <div className="field"><label>상품 확률 설명</label><textarea className="textarea" name="probabilityDescription" rows={3} defaultValue={initial.probabilityDescription ?? ""} /></div>
      </section>
      <section className="panel-soft form-grid">
        <h2 className="panel-title mb-0">홈·하단 문구</h2>
        <div className="field"><label>하단 문구</label><textarea className="textarea" name="footerMessage" rows={3} defaultValue={initial.footerMessage ?? "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 전용 이벤트 운영 사이트 · v1.0.3"} /></div>
        <div className="field"><label>월간 랭킹 이미지 URL</label><input className="input" name="monthlyRankImageUrl" defaultValue={initial.monthlyRankImageUrl ?? ""} placeholder="선택: 랭킹 영역에 표시할 이미지 주소" /></div>
      </section>

      {message && <div className="form-message form-info">{message}</div>}
      <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? <LoaderCircle size={16} /> : <Save size={16} />} 설정 저장</button>
    </form>
  );
}
