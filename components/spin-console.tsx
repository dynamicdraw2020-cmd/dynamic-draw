"use client";

import { Dices, LoaderCircle, Radio, TestTube2, Ticket, Trophy, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { LiveDrawStage } from "@/components/live-draw-stage";
import type { AdminTicketBalance, Draw, Profile } from "@/lib/types";

export function SpinConsole({ draws, members, balances }: { draws: Draw[]; members: Profile[]; balances: AdminTicketBalance[] }) {
  const activeDraws = draws.filter((draw) => draw.status === "ACTIVE");
  const approvedMembers = members.filter((member) => member.status === "APPROVED");
  const [drawId, setDrawId] = useState(activeDraws[0]?.id ?? "");
  const [memberId, setMemberId] = useState(approvedMembers[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("추첨 대기 중");
  const [testMode, setTestMode] = useState(false);
  const currentTicketBalance = useMemo(() => balances.find((balance) => balance.draw_id === drawId && balance.profile_id === memberId)?.quantity ?? 0, [balances, drawId, memberId]);
  async function spin() {
    if (!drawId || !memberId) return window.alert("뽑기와 회원을 선택해 주세요.");
    if (testMode) {
      setLoading(true); setMessage("테스트 모드: 실제 결과와 지급 기록 없이 화면 흐름만 점검합니다…");
      window.setTimeout(() => {
        const draw = activeDraws.find((item) => item.id === drawId);
        const reward = draw?.rewards?.filter((item) => item.is_active)[Math.floor(Math.random() * Math.max(draw?.rewards?.filter((item) => item.is_active).length ?? 1, 1))];
        setLoading(false);
        setMessage(`테스트 완료: ${reward?.name ?? "테스트 상품"} · 기록 없음`);
      }, 1800);
      return;
    }
    if (currentTicketBalance < 1) return window.alert("선택한 회원에게 이 뽑기에 사용할 추첨권이 없습니다. 먼저 추첨권·화폐 메뉴에서 지급해 주세요.");
    setLoading(true); setMessage("추첨권 1장을 차감하고 서버에서 결과를 결정하고 있습니다…");
    const response = await fetch(`/api/admin/draws/${drawId}/spin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ participantId: memberId, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json();
    if (!response.ok) { setLoading(false); setMessage("추첨을 시작하지 못했습니다."); return window.alert(body.error?.message ?? "추첨 오류"); }
    const { resultId, animationMs, remainingTickets } = body.data;
    setMessage(`공개 화면에서 룰렛이 진행 중입니다. 남은 추첨권: ${remainingTickets ?? "갱신 중"}장`);
    window.setTimeout(async () => { const revealResponse = await fetch(`/api/admin/results/${resultId}/reveal`, { method: "POST" }); const revealBody = await revealResponse.json(); setLoading(false); if (!revealResponse.ok) { setMessage("결과는 결정됐지만 공개 처리에 실패했습니다. 실시간 페이지가 자동 복구합니다."); return; } setMessage(`결과 공개 완료: ${revealBody.data?.rewardName ?? "상품"}`); }, Number(animationMs) + 150);
  }
  return <div className="spin-console"><section className="panel spin-panel"><div className="flex items-center gap-1"><Radio size={18} className="text-green" /><h2 className="panel-title mb-0">실시간 추첨 제어</h2></div><p className="panel-description mt-1">관리자가 대신 눌러주는 현장 추첨도 선택 계정의 해당 뽑기 추첨권 1장을 사용합니다. 최고 관리자 테스트 모드는 기록 없이 연출만 확인합니다.</p><div className="form-grid mt-3"><div className="field"><label htmlFor="spin-draw">뽑기 선택</label><select id="spin-draw" className="select" value={drawId} onChange={(e) => setDrawId(e.target.value)}>{activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name}</option>)}</select></div><div className="field"><label htmlFor="spin-member">참가 회원</label><select id="spin-member" className="select" value={memberId} onChange={(e) => setMemberId(e.target.value)}>{approvedMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {member.role} · {member.member_code ?? "고유 ID 없음"}</option>)}</select></div><label className="test-mode-toggle"><input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} /><span><TestTube2 size={16} /> 테스트 모드 — 결과·지급 기록 없음</span></label><div className="note-box"><UserRound size={15} style={{ verticalAlign: -3 }} /> 선택 회원 보유 추첨권: <strong>{currentTicketBalance.toLocaleString()}장</strong><br /><Ticket size={15} style={{ verticalAlign: -3 }} /> 추첨 실행 시 1장이 자동 차감되고 상품은 보관함에 적립됩니다.</div><button className="btn btn-primary btn-lg btn-block" onClick={spin} disabled={loading || !activeDraws.length || !approvedMembers.length || (!testMode && currentTicketBalance < 1)}>{loading ? <LoaderCircle size={19} className="spin" /> : testMode ? <Trophy size={20} /> : <Dices size={20} />} {testMode ? "테스트 추첨 실행" : "추첨권 1장 사용해서 추첨 실행"}</button><p className="text-muted text-small">{message}</p></div></section><LiveDrawStage drawId={drawId || undefined} draw={activeDraws.find((draw) => draw.id === drawId) ?? null} /></div>;
}
