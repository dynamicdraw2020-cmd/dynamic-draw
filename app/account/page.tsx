import type { Metadata } from "next";
import { Award, Box, CalendarDays, Copy, IdCard, UserRound } from "lucide-react";
import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { getUserInventory, getUserResults } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "내 정보" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const profile = await requireApprovedUser();
  const [inventory, results] = await Promise.all([getUserInventory(profile.id), getUserResults(profile.id)]);
  return <main className="page"><div className="container"><div className="page-heading"><h1>내 정보</h1><p>고유 ID, 보유 상품, 최근 추첨 결과를 한곳에서 확인합니다.</p></div><section className="panel account-hero"><div><div className="flex items-center gap-1"><UserRound size={20} className="text-gold" /><h2 className="panel-title mb-0">{profile.display_name}</h2></div><p className="panel-description mt-1">{profile.email} · 가입 {formatDateTime(profile.created_at)}</p></div><div className="member-code"><IdCard size={18} /> {profile.member_code ?? "승인 처리 중"}<Copy size={14} /></div></section><div className="page-heading-row mt-3"><div><h2>보유 상품</h2><p className="text-muted">추첨이나 교환으로 받은 상품입니다.</p></div><Link className="btn btn-primary" href="/exchange">교환 탭으로 이동</Link></div><div className="grid grid-2 mt-2">{inventory.length ? inventory.map((item) => <article className="panel inventory-card" key={item.reward_id}><div className="inventory-name"><div className="inventory-orb" style={{ "--item-color": item.reward_color } as React.CSSProperties}><Box size={21} /></div><div><strong>{item.reward_name}</strong><div className="text-muted text-small">{item.is_exchange_material ? "교환 재료" : "보유 상품"}</div></div></div><span className="inventory-qty">× {item.quantity}</span></article>) : <div className="panel empty">아직 보유한 상품이 없습니다.</div>}</div><div className="page-heading-row mt-3"><div><h2>내 최근 결과</h2><p className="text-muted">무효 처리 여부까지 확인할 수 있습니다.</p></div></div><section className="panel panel-pad mt-2">{results.length ? <div className="result-list">{results.map((row) => { const draw = Array.isArray(row.draws) ? row.draws[0] : row.draws; const reward = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards; return <article className="result-row" key={row.id}><div className="result-icon" style={{ "--reward-color": reward?.color ?? "#f6c453" } as React.CSSProperties}><Award size={20} /></div><div className="result-main"><strong>{reward?.name ?? "상품"}</strong><span>{draw?.name ?? "뽑기"}{row.voided_at ? " · 무효 처리" : ""}</span></div><time className="result-time"><CalendarDays size={13} /> {formatDateTime(row.created_at)}</time></article>; })}</div> : <div className="empty">추첨 기록이 없습니다.</div>}</section></div></main>;
}
