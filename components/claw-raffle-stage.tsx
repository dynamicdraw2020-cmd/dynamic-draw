"use client";

import { CalendarDays, CheckCircle2, LoaderCircle, Play, Plus, RotateCcw, ShieldAlert, TestTube2, Trophy, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminRaffleEvent, RaffleEvent, UserRole } from "@/lib/types";
import { formatDateTime, maskMemberCode, maskName } from "@/lib/utils";

type Phase = "idle" | "grabbing" | "lifting" | "revealed" | "error";
type WinnerPayload = { raffleId: string; title: string; prizeName: string; winnerName: string; memberCode: string; participantCount: number; executedAt: string; testMode?: boolean };

async function jsonRequest(url: string, body: unknown = {}) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function ClawMachinePreview({ calm = false, winnerName = null }: { calm?: boolean; winnerName?: string | null }) {
  return <div className={`claw-machine ${calm ? "calm" : ""}`} aria-hidden="true"><div className="claw-rail" /><div className="claw-head"><span /></div><div className="claw-cable" /><div className="claw-arm left" /><div className="claw-arm right" /><div className="capsule capsule-a" /><div className="capsule capsule-b" /><div className="capsule capsule-c" />{winnerName && <div className="winner-capsule-label">{winnerName}</div>}<div className="machine-base">𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</div></div>;
}

function GachaMachinePreview({ winnerName = null }: { winnerName?: string | null }) {
  return <div className="gacha-machine" aria-hidden="true">
    <div className="gacha-dome">
      <div className="gacha-ball ball-a" />
      <div className="gacha-ball ball-b" />
      <div className="gacha-ball ball-c" />
      <div className="gacha-ball ball-d" />
      <div className="gacha-ball ball-e" />
      {winnerName && <div className="gacha-winner-label">{winnerName}</div>}
    </div>
    <div className="gacha-slot"><span>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</span></div>
    <div className="gacha-knob" />
    <div className="gacha-tray">{winnerName ? "당첨 캡슐 OPEN" : "GACHA EVENT"}</div>
  </div>;
}

export function PublicClawRaffle({ raffles }: { raffles: RaffleEvent[] }) {
  const featured = raffles[0] ?? null;
  const completed = raffles.find((item) => item.status === "COMPLETED" && item.winner_member_code);
  return <section className="public-card public-card-feature claw-public-card"><div className="section-kicker">추첨 이벤트</div><div className="claw-public-layout"><div><h2>추첨 이벤트</h2><p>관리자가 설정한 회원 등급 조건에 맞춰 진행하는 공개 추첨 이벤트입니다.</p>{featured ? <div className="raffle-summary-card"><strong>{featured.title}</strong><span>{featured.prize_name}</span><small>{featured.status === "COMPLETED" ? "추첨 완료" : "진행 예정"}</small></div> : <div className="raffle-summary-card muted">아직 공개된 추첨 이벤트가 없습니다.</div>}{completed && <div className="raffle-winner-line">최근 당첨: <strong>{maskName(completed.winner_display_name)}</strong> · {maskMemberCode(completed.winner_member_code)}</div>}</div><GachaMachinePreview /></div></section>;
}

export function RaffleManager({ raffles, adminRole = "MANAGER", memberTiers = [] }: { raffles: AdminRaffleEvent[]; adminRole?: UserRole; memberTiers?: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [loading, setLoading] = useState<string | null>(null);
  const [winner, setWinner] = useState<WinnerPayload | null>(null);
  const [testMode, setTestMode] = useState(false);
  const activeRaffles = useMemo(() => raffles.filter((item) => item.status === "ACTIVE"), [raffles]);
  const [selectedRaffleId, setSelectedRaffleId] = useState(activeRaffles[0]?.id ?? raffles[0]?.id ?? "");
  const selectedRaffle = raffles.find((raffle) => raffle.id === selectedRaffleId) ?? null;
  const canRerun = adminRole === "SUPER_ADMIN";

  async function createRaffle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading("create");
    try {
      await jsonRequest("/api/admin/raffles", { title: form.get("title"), description: form.get("description"), prizeName: form.get("prizeName"), isPublic: form.get("isPublic") === "on", startsAt: form.get("startsAt") || null, endsAt: form.get("endsAt") || null, requiredTierId: form.get("requiredTierId") || null });
      window.alert("추첨 이벤트 이벤트를 만들었습니다.");
      router.refresh();
    } catch (error) { window.alert((error as Error).message); } finally { setLoading(null); }
  }

  function playAnimation(data: WinnerPayload) {
    setWinner(null); setPhase("grabbing"); setLoading(data.testMode ? "test" : "run");
    setTimeout(() => setPhase("lifting"), 900);
    setTimeout(() => { setWinner(data); setPhase("revealed"); setLoading(null); if (!data.testMode) router.refresh(); }, 2600);
  }

  async function runTest() {
    if (!selectedRaffle) return window.alert("테스트할 추첨 이벤트를 선택해 주세요.");
    playAnimation({ raffleId: selectedRaffle.id, title: selectedRaffle.title, prizeName: selectedRaffle.prize_name, winnerName: "테스트 회원", memberCode: "DD-TEST-0000", participantCount: selectedRaffle.participant_count ?? 0, executedAt: new Date().toISOString(), testMode: true });
  }

  async function runRaffle() {
    if (!selectedRaffleId) return window.alert("실행할 추첨 이벤트를 선택해 주세요.");
    if (testMode) return runTest();
    if (!window.confirm("설정된 대상 회원을 기준으로 추첨 이벤트를 실행할까요? 실행 후 결과가 기록됩니다.")) return;
    try {
      const response = await jsonRequest(`/api/admin/raffles/${selectedRaffleId}/run`);
      playAnimation(response.data as WinnerPayload);
    } catch (error) { setPhase("error"); setLoading(null); window.alert((error as Error).message); }
  }

  async function rerunRaffle(raffle: AdminRaffleEvent) {
    if (!canRerun) return window.alert("재추첨은 최고 관리자만 가능합니다.");
    const reason = window.prompt("재추첨 사유를 입력해 주세요. 예: 당첨자 연락 불가");
    if (!reason) return;
    if (!window.confirm("기존 당첨자를 재추첨 로그에 보관하고 새 당첨자를 뽑을까요?")) return;
    setSelectedRaffleId(raffle.id);
    try {
      const response = await jsonRequest(`/api/admin/raffles/${raffle.id}/rerun`, { reason });
      playAnimation(response.data as WinnerPayload);
    } catch (error) { window.alert((error as Error).message); }
  }

  return <div className="grid raffle-admin-grid gacha-admin-grid"><section className="panel panel-pad operation-note"><h2>추첨 이벤트 운영</h2><p>등급 조건에 맞는 회원 중 1명을 추첨합니다. 테스트 모드는 화면 연출만 확인하며 결과와 지급 기록을 남기지 않습니다.</p></section><div className="grid grid-2"><form className="panel panel-pad form-grid" onSubmit={createRaffle}><h2 className="panel-title">추첨 이벤트 만들기</h2><div className="field"><label htmlFor="raffle-title">이벤트명</label><input className="input" id="raffle-title" name="title" required maxLength={100} placeholder="예: 본방 입장 우선권 추첨" /></div><div className="field"><label htmlFor="raffle-prize">추첨 상품</label><input className="input" id="raffle-prize" name="prizeName" required maxLength={120} placeholder="예: 본방 입장권 1매" /></div><div className="field"><label htmlFor="raffle-description">설명</label><textarea className="textarea" id="raffle-description" name="description" rows={4} maxLength={800} placeholder="참여 대상, 발표 방식, 유의사항" /></div><div className="field"><label htmlFor="raffle-tier">참여 가능 회원 등급</label><select className="select" id="raffle-tier" name="requiredTierId"><option value="">전체 일반 회원</option>{memberTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></div><div className="form-row"><div className="field"><label htmlFor="raffle-starts">시작일</label><input className="input" id="raffle-starts" name="startsAt" type="datetime-local" /></div><div className="field"><label htmlFor="raffle-ends">종료일</label><input className="input" id="raffle-ends" name="endsAt" type="datetime-local" /></div></div><label className="check-row"><input type="checkbox" name="isPublic" defaultChecked /> 공개 페이지에 표시</label><button className="btn btn-primary" disabled={loading === "create"} type="submit">{loading === "create" ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />} 추첨 이벤트 만들기</button></form><section className="panel panel-pad form-grid"><h2 className="panel-title">가챠형 추첨 실행</h2><p className="panel-description">관리자 페이지에서 설정하고 바로 실행합니다. 라이브 전에는 테스트 모드를 먼저 돌려보세요.</p><div className="field"><label htmlFor="raffle-run-select">추첨 이벤트</label><select className="select" id="raffle-run-select" value={selectedRaffleId} onChange={(event) => setSelectedRaffleId(event.target.value)}>{raffles.map((raffle) => <option key={raffle.id} value={raffle.id}>{raffle.title} · {raffle.status}</option>)}</select></div><label className="test-mode-toggle"><input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} /><span><TestTube2 size={16} /> 테스트 모드 — 결과·지급 기록 없음</span></label><div className={`claw-run-stage gacha-run-stage ${phase}`}><GachaMachinePreview winnerName={phase === "revealed" ? winner?.winnerName : null} /><div className="claw-run-message">{phase === "idle" && <><UsersRound size={18} /> 대기 중</>}{phase === "grabbing" && <><LoaderCircle className="spin" size={18} /> 가챠 캡슐이 섞이는 중</>}{phase === "lifting" && <><LoaderCircle className="spin" size={18} /> 당첨 캡슐을 여는 중</>}{phase === "revealed" && winner && <><Trophy size={18} /> {winner.winnerName} · {winner.memberCode}{winner.testMode ? " · 테스트" : ""}</>}{phase === "error" && <>실행 실패</>}</div></div><div className="table-actions"><button className="btn btn-secondary btn-lg" onClick={runTest} disabled={loading === "run" || loading === "test" || !raffles.length} type="button"><TestTube2 size={18} /> 테스트 실행</button><button className="btn btn-primary btn-lg" onClick={runRaffle} disabled={loading === "run" || loading === "test" || !raffles.length} type="button">{loading ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />} {testMode ? "테스트 실행" : "추첨 이벤트 시작"}</button></div></section></div><section className="panel panel-pad"><h2 className="panel-title">추첨 이벤트 현황</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>이벤트</th><th>상품</th><th>상태</th><th>당첨자</th><th>기간</th><th>재추첨</th></tr></thead><tbody>{raffles.length ? raffles.map((raffle) => <tr key={raffle.id}><td><strong>{raffle.title}</strong><div className="text-muted text-small">대상 {raffle.participant_count?.toLocaleString() ?? "-"}명</div></td><td>{raffle.prize_name}</td><td>{raffle.status}{raffle.is_public ? " · 공개" : " · 숨김"}</td><td>{raffle.winner_member_code ? <><CheckCircle2 size={13} style={{ verticalAlign: -2 }} /> {maskName(raffle.winner_display_name)} · {maskMemberCode(raffle.winner_member_code)}</> : "미추첨"}</td><td className="muted"><CalendarDays size={13} style={{ verticalAlign: -2 }} /> {raffle.starts_at ? formatDateTime(raffle.starts_at) : "상시"}{raffle.ends_at ? ` ~ ${formatDateTime(raffle.ends_at)}` : ""}</td><td>{raffle.winner_profile_id ? <button className="btn btn-danger btn-sm" type="button" onClick={() => rerunRaffle(raffle)} disabled={!canRerun}><RotateCcw size={14} /> 재추첨</button> : <span className="text-muted text-small"><ShieldAlert size={13} /> 당첨 후 가능</span>}</td></tr>) : <tr><td colSpan={6}><div className="empty">아직 추첨 이벤트가 없습니다.</div></td></tr>}</tbody></table></div>{!canRerun && <p className="text-muted text-small mt-2">재추첨은 최고 관리자만 사용할 수 있습니다.</p>}</section></div>;
}
