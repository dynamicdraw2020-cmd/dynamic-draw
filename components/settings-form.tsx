"use client";

import { LoaderCircle, Save } from "lucide-react";
import { FormEvent, useState } from "react";

export function SettingsForm({ initial }: { initial: { siteName: string; heroTitle: string; heroDescription: string; publicStats: boolean; operationMode?: string; operationMessage?: string; operationEndsAt?: string; footerMessage?: string; monthlyRankImageUrl?: string } }) {
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
        <p className="panel-description">이벤트 전 점검이나 긴급 상황에서 일반 회원 기능을 잠시 제한합니다. 관리자는 계속 이용할 수 있습니다.</p>
        <div className="form-row">
          <div className="field"><label>운영 상태</label><select className="select" name="operationMode" defaultValue={initial.operationMode ?? "NORMAL"}><option value="NORMAL">정상 운영</option><option value="READ_ONLY">읽기 전용</option><option value="MAINTENANCE">긴급 점검</option></select></div>
          <div className="field"><label>예상 종료</label><input className="input" name="operationEndsAt" defaultValue={initial.operationEndsAt ?? ""} placeholder="예: 18:30" /></div>
        </div>
        <div className="field"><label>안내 문구</label><textarea className="textarea" name="operationMessage" rows={3} defaultValue={initial.operationMessage ?? "현재 시스템 점검 중입니다."} /></div>
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
