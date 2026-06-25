"use client";

import { LoaderCircle, Save } from "lucide-react";
import { FormEvent, useState } from "react";

export function SettingsForm({ initial }: { initial: { siteName: string; heroTitle: string; heroDescription: string; publicStats: boolean } }) {
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
      {message && <div className="form-message form-info">{message}</div>}
      <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? <LoaderCircle size={16} /> : <Save size={16} />} 설정 저장</button>
    </form>
  );
}
