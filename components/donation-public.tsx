import { ArrowRight, CircleDollarSign, HandHeart, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { DonationSettings } from "@/lib/donations";
import { donationTierRange } from "@/lib/donations";

function ctaTarget(url: string) {
  const href = url.trim() || "/support";
  const external = href.startsWith("http://") || href.startsWith("https://");
  return { href, external };
}

function lines(text: string) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function DonationHomeBanner({ settings }: { settings: DonationSettings }) {
  if (!settings.enabled || !settings.showHomeBanner) return null;
  const target = ctaTarget(settings.ctaUrl);
  const topTier = settings.tiers[settings.tiers.length - 1];
  return (
    <section className="official-section compact-official-section donation-home-section">
      <div className="container">
        <div className="donation-home-banner">
          <div className="donation-home-copy">
            <span className="section-kicker"><HandHeart size={14} /> Support Dynamic D</span>
            <h2>{settings.title}</h2>
            <p>{settings.heroMessage || settings.subtitle}</p>
            <div className="donation-home-actions">
              <Link className="btn btn-primary btn-lg" href={target.href} target={target.external ? "_blank" : undefined} rel={target.external ? "noreferrer" : undefined}><CircleDollarSign size={18} /> {settings.ctaLabel}</Link>
              <Link className="btn btn-secondary btn-lg" href="/donations">혜택 보기 <ArrowRight size={18} /></Link>
            </div>
          </div>
          <div className="donation-home-card">
            <span>{topTier?.badge ?? "SUPPORT"}</span>
            <strong>{topTier?.title ?? "후원 혜택"}</strong>
            <small>{topTier ? donationTierRange(topTier) : "금액별 혜택 설정 가능"}</small>
            <p>{settings.subtitle}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DonationPublicPage({ settings }: { settings: DonationSettings }) {
  const target = ctaTarget(settings.ctaUrl);
  if (!settings.enabled) {
    return (
      <main className="page public-subpage donation-page">
        <div className="container page-narrow">
          <section className="public-card donation-disabled-card">
            <HandHeart size={34} />
            <h1>후원 안내가 준비 중입니다</h1>
            <p>운영자가 후원 안내를 켜면 이 페이지에서 금액별 혜택과 문의 방법을 확인할 수 있습니다.</p>
            <Link className="btn btn-primary" href="/">홈으로 이동</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page public-subpage donation-page">
      <section className="donation-hero">
        <div className="container donation-hero-grid">
          <div>
            <span className="section-kicker"><HandHeart size={14} /> Support</span>
            <h1>{settings.title}</h1>
            <p className="donation-hero-lead">{settings.subtitle}</p>
            <div className="donation-hero-message"><ShieldCheck size={18} /> <span>{settings.heroMessage}</span></div>
            <div className="donation-home-actions">
              <Link className="btn btn-primary btn-lg" href={target.href} target={target.external ? "_blank" : undefined} rel={target.external ? "noreferrer" : undefined}><CircleDollarSign size={18} /> {settings.ctaLabel}</Link>
              <Link className="btn btn-secondary btn-lg" href="/support">문의센터</Link>
            </div>
          </div>
          <aside className="donation-account-card">
            <span className="section-kicker">How to donate</span>
            <h2>{settings.guideTitle}</h2>
            <div className="donation-line-copy">{lines(settings.guideBody).map((line) => <p key={line}>{line}</p>)}</div>
          </aside>
        </div>
      </section>

      <section className="official-section compact-official-section">
        <div className="container donation-detail-grid">
          <section className="public-card donation-account-info">
            <div className="flex items-center gap-1"><CircleDollarSign size={20} /><h2>후원 정보</h2></div>
            <div className="donation-line-copy donation-account-lines">{lines(settings.accountInfo).map((line) => <p key={line}>{line}</p>)}</div>
          </section>
          <section className="public-card donation-disclaimer-card">
            <div className="flex items-center gap-1"><ShieldCheck size={20} /><h2>운영 기준</h2></div>
            <p>{settings.disclaimer}</p>
          </section>
        </div>
      </section>

      <section className="official-section compact-official-section">
        <div className="container">
          <div className="section-heading public-page-heading">
            <div><span className="section-kicker"><Sparkles size={14} /> Benefit</span><h2>금액별 후원 혜택</h2><p>운영자가 설정한 금액 구간별 안내입니다. 실제 처리 전 운영자 확인을 꼭 거쳐 주세요.</p></div>
          </div>
          <div className="donation-tier-grid">
            {settings.tiers.map((tier) => (
              <article className="donation-tier-card" key={tier.id}>
                <span>{tier.badge}</span>
                <h3>{tier.title}</h3>
                <strong>{donationTierRange(tier)}</strong>
                <ul>{tier.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
                {tier.note && <p>{tier.note}</p>}
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
