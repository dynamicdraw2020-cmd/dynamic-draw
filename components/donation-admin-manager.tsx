"use client";

import { CircleDollarSign, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { DonationSettings, DonationTier } from "@/lib/donations";
import { donationTierRange } from "@/lib/donations";

type TierForm = DonationTier & { benefitsText: string };

function toTierForm(tier: DonationTier): TierForm {
  return { ...tier, benefitsText: tier.benefits.join("\n") };
}

function fromTierForm(tier: TierForm): DonationTier {
  return {
    id: tier.id || `tier-${Date.now()}`,
    title: tier.title.trim() || `${Number(tier.minAmount || 0).toLocaleString()}원 이상`,
    badge: tier.badge.trim() || "SUPPORT",
    minAmount: Math.max(0, Math.round(Number(tier.minAmount) || 0)),
    maxAmount: tier.maxAmount == null || String(tier.maxAmount) === "" ? null : Math.max(Math.max(0, Math.round(Number(tier.minAmount) || 0)), Math.round(Number(tier.maxAmount) || 0)),
    benefits: tier.benefitsText.split("\n").map((line) => line.trim()).filter(Boolean),
    note: tier.note.trim(),
    sortOrder: Math.max(0, Math.round(Number(tier.sortOrder) || 0)),
  };
}

function newTier(nextIndex: number): TierForm {
  const minAmount = nextIndex === 0 ? 1000 : nextIndex * 10000;
  return {
    id: `tier-${Date.now()}-${nextIndex}`,
    title: `${minAmount.toLocaleString()}원 이상 후원`,
    badge: "NEW",
    minAmount,
    maxAmount: null,
    benefits: [],
    benefitsText: "후원 감사 표시\n운영자가 지정한 보상 지급",
    note: "",
    sortOrder: (nextIndex + 1) * 10,
  };
}

export function DonationAdminManager({ initial }: { initial: DonationSettings }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [showHomeBanner, setShowHomeBanner] = useState(initial.showHomeBanner);
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [heroMessage, setHeroMessage] = useState(initial.heroMessage);
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel);
  const [ctaUrl, setCtaUrl] = useState(initial.ctaUrl);
  const [accountInfo, setAccountInfo] = useState(initial.accountInfo);
  const [guideTitle, setGuideTitle] = useState(initial.guideTitle);
  const [guideBody, setGuideBody] = useState(initial.guideBody);
  const [disclaimer, setDisclaimer] = useState(initial.disclaimer);
  const [tiers, setTiers] = useState<TierForm[]>(initial.tiers.map(toTierForm));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const previewTiers = useMemo(() => tiers.map(fromTierForm).sort((a, b) => a.sortOrder - b.sortOrder || a.minAmount - b.minAmount), [tiers]);

  function updateTier(index: number, patch: Partial<TierForm>) {
    setTiers((current) => current.map((tier, tierIndex) => (tierIndex === index ? { ...tier, ...patch } : tier)));
  }

  function removeTier(index: number) {
    setTiers((current) => current.filter((_, tierIndex) => tierIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const payload: DonationSettings = {
        enabled,
        showHomeBanner,
        title,
        subtitle,
        heroMessage,
        ctaLabel,
        ctaUrl,
        accountInfo,
        guideTitle,
        guideBody,
        disclaimer,
        tiers: previewTiers,
      };
      const response = await fetch("/api/admin/donations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? "후원 설정을 저장하지 못했습니다.");
      setMessage({ type: "success", text: "후원 설정이 저장되었습니다. 대문과 후원 페이지에 바로 반영됩니다." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "저장 중 오류가 발생했습니다." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="donation-admin-layout">
      <form className="panel form-card form-grid donation-admin-form" onSubmit={submit}>
        <section className="panel-soft form-grid donation-help-box">
          <div className="flex items-center gap-1">
            <CircleDollarSign size={20} className="text-gold" />
            <h2 className="panel-title mb-0">후원 시스템 사용법</h2>
          </div>
          <ol className="donation-help-list">
            <li><strong>후원 노출</strong>을 켜면 `/donations` 페이지가 안내 페이지로 사용됩니다.</li>
            <li><strong>대문 배너 노출</strong>을 켜면 메인 화면에 큼직한 후원 버튼이 표시됩니다.</li>
            <li><strong>후원 링크</strong>에는 문의센터, 오픈채팅, 송금 안내 페이지 등 운영자가 확인 가능한 주소를 넣으세요.</li>
            <li><strong>금액별 혜택</strong>은 최소 금액 기준으로 자동 정렬됩니다. 혜택은 한 줄에 하나씩 적으면 됩니다.</li>
          </ol>
        </section>

        <div className="form-row">
          <label className="checkbox-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> 후원 페이지 사용</label>
          <label className="checkbox-row"><input type="checkbox" checked={showHomeBanner} onChange={(event) => setShowHomeBanner(event.target.checked)} /> 대문 배너 노출</label>
        </div>

        <div className="field"><label>후원 제목</label><input className="input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="field"><label>후원 짧은 설명</label><textarea className="textarea" rows={3} value={subtitle} maxLength={400} onChange={(event) => setSubtitle(event.target.value)} /></div>
        <div className="field"><label>대문/상단에 크게 출력되는 문구</label><textarea className="textarea" rows={3} value={heroMessage} maxLength={600} onChange={(event) => setHeroMessage(event.target.value)} /><small>메인 배너와 후원 안내 페이지 상단에 보입니다.</small></div>

        <div className="form-row">
          <div className="field"><label>후원 버튼 문구</label><input className="input" value={ctaLabel} maxLength={50} onChange={(event) => setCtaLabel(event.target.value)} /></div>
          <div className="field"><label>후원 버튼 링크</label><input className="input" value={ctaUrl} maxLength={500} onChange={(event) => setCtaUrl(event.target.value)} placeholder="/support 또는 https://..." /></div>
        </div>

        <div className="field"><label>후원 계좌/링크/확인 안내</label><textarea className="textarea" rows={5} value={accountInfo} maxLength={1200} onChange={(event) => setAccountInfo(event.target.value)} /><small>예: 후원 계좌, 입금자명 작성법, 인증 방법, 운영자 문의 채널 등을 자유롭게 적으세요.</small></div>

        <section className="panel-soft form-grid">
          <h2 className="panel-title mb-0">상세 안내 문구</h2>
          <div className="field"><label>안내 제목</label><input className="input" value={guideTitle} maxLength={100} onChange={(event) => setGuideTitle(event.target.value)} /></div>
          <div className="field"><label>안내 본문</label><textarea className="textarea" rows={5} value={guideBody} maxLength={1600} onChange={(event) => setGuideBody(event.target.value)} /></div>
          <div className="field"><label>주의/면책 문구</label><textarea className="textarea" rows={4} value={disclaimer} maxLength={1200} onChange={(event) => setDisclaimer(event.target.value)} /></div>
        </section>

        <section className="panel-soft form-grid">
          <div className="official-card-head donation-tier-head">
            <div><h2 className="panel-title mb-0">금액별 혜택</h2><p className="panel-description">최소 금액, 최대 금액, 혜택을 설정하세요. 최대 금액을 비우면 “이상”으로 표시됩니다.</p></div>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setTiers((current) => [...current, newTier(current.length)])}><Plus size={15} /> 구간 추가</button>
          </div>

          {tiers.map((tier, index) => (
            <article className="donation-tier-editor" key={tier.id || index}>
              <div className="form-row">
                <div className="field"><label>혜택 이름</label><input className="input" value={tier.title} onChange={(event) => updateTier(index, { title: event.target.value })} /></div>
                <div className="field"><label>배지</label><input className="input" value={tier.badge} maxLength={24} onChange={(event) => updateTier(index, { badge: event.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="field"><label>최소 금액</label><input className="input" type="number" min={0} step={100} value={tier.minAmount} onChange={(event) => updateTier(index, { minAmount: Number(event.target.value) })} /></div>
                <div className="field"><label>최대 금액</label><input className="input" type="number" min={0} step={100} value={tier.maxAmount ?? ""} placeholder="비우면 상한 없음" onChange={(event) => updateTier(index, { maxAmount: event.target.value === "" ? null : Number(event.target.value) })} /></div>
              </div>
              <div className="field"><label>혜택 목록</label><textarea className="textarea" rows={4} value={tier.benefitsText} onChange={(event) => updateTier(index, { benefitsText: event.target.value })} /><small>한 줄에 하나씩 적으면 공개 페이지에서 목록으로 표시됩니다.</small></div>
              <div className="form-row">
                <div className="field"><label>메모</label><input className="input" value={tier.note} onChange={(event) => updateTier(index, { note: event.target.value })} /></div>
                <div className="field"><label>정렬 순서</label><input className="input" type="number" value={tier.sortOrder} onChange={(event) => updateTier(index, { sortOrder: Number(event.target.value) })} /></div>
              </div>
              <button className="btn btn-danger btn-sm" type="button" onClick={() => removeTier(index)}><Trash2 size={15} /> 이 구간 삭제</button>
            </article>
          ))}
        </section>

        {message && <div className={`form-message ${message.type === "success" ? "form-success" : "form-error"}`}>{message.text}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} 후원 설정 저장</button>
      </form>

      <aside className="panel panel-pad donation-admin-preview">
        <span className="section-kicker">Preview</span>
        <h2>{title || "후원 안내"}</h2>
        <p>{subtitle}</p>
        <div className="donation-preview-hero">{heroMessage}</div>
        <a className="btn btn-primary btn-block" href={ctaUrl || "/support"} target={ctaUrl.startsWith("http") ? "_blank" : undefined} rel={ctaUrl.startsWith("http") ? "noreferrer" : undefined}>{ctaLabel || "후원 문의"}</a>
        <div className="notice-box donation-account-preview">{accountInfo}</div>
        <div className="donation-tier-preview-list">
          {previewTiers.map((tier) => (
            <div className="donation-tier-mini" key={tier.id}>
              <span>{tier.badge}</span>
              <strong>{tier.title}</strong>
              <small>{donationTierRange(tier)}</small>
              <ul>{tier.benefits.slice(0, 3).map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
