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
        operationMode: form.get("operationMode"),
        operationMessage: form.get("operationMessage"),
        operationEndsAt: form.get("operationEndsAt"),
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
        <h2 className="panel-title mb-0">운영 모드</h2>
        <p className="panel-description">활성화/업데이트중/비활성화 상태를 설정합니다. 업데이트중은 관리자만 로그인 가능, 비활성화는 최고 관리자만 로그인 가능합니다.</p>
        <div className="form-row">
          <div className="field"><label>운영 상태</label><select className="select" name="operationMode" defaultValue={initial.operationMode ?? "ACTIVE"}><option value="ACTIVE">활성화</option><option value="UPDATING">업데이트중</option><option value="INACTIVE">비활성화</option></select></div>
          <div className="field"><label>예상 종료</label><input className="input" name="operationEndsAt" defaultValue={initial.operationEndsAt ?? ""} placeholder="예: 18:30" /></div>
        </div>
        <div className="field"><label>안내 문구</label><textarea className="textarea" name="operationMessage" rows={3} defaultValue={initial.operationMessage ?? "현재 시스템 점검 중입니다."} /></div>
      </section>
      <section className="panel-soft form-grid">
        <h2 className="panel-title mb-0">뽑기 & 교환 배너 문구</h2>
        <div className="field"><label>상단 제목</label><input className="input" name="playHeroTitle" defaultValue={initial.playHeroTitle ?? "내 추첨권으로 뽑기 & 교환하기"} /></div>
        <div className="field"><label>상단 설명</label><textarea className="textarea" name="playHeroDescription" rows={3} defaultValue={initial.playHeroDescription ?? "룰렛 칸은 모두 같은 크기로 보여 확률을 유추할 수 없습니다. 실제 결과는 서버 확률로 먼저 결정됩니다."} /></div>
        <div className="field"><label>상품 확률 제목</label><input className="input" name="probabilityTitle" defaultValue={initial.probabilityTitle ?? "상품 확률"} /></div>
        <div className="field"><label>상품 확률 설명</label><textarea className="textarea" name="probabilityDescription" rows={3} defaultValue={initial.probabilityDescription ?? "실제 확률은 아래 표 기준입니다. 애니메이션은 모든 칸을 동일 크기로 보여줍니다."} /></div>
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
