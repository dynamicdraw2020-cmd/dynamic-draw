"use client";

import { Dices, LoaderCircle, Radio, UserRound } from "lucide-react";
import { useState } from "react";
import { LiveDrawStage } from "@/components/live-draw-stage";
import type { Draw, Profile } from "@/lib/types";

export function SpinConsole({ draws, members }: { draws: Draw[]; members: Profile[] }) {
  const activeDraws = draws.filter((draw) => draw.status === "ACTIVE");
  const approvedMembers = members.filter((member) => member.status === "APPROVED" && member.role === "USER");
  const [drawId, setDrawId] = useState(activeDraws[0]?.id ?? "");
  const [memberId, setMemberId] = useState(approvedMembers[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("추첨 대기 중");

  async function spin() {
    if (!drawId || !memberId) return window.alert("뽑기와 회원을 선택해 주세요.");
    setLoading(true);
    setMessage("서버에서 결과를 결정하고 있습니다…");
    const response = await fetch(`/api/admin/draws/${drawId}/spin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId: memberId, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await response.json();
    if (!response.ok) {
      setLoading(false);
      setMessage("추첨을 시작하지 못했습니다.");
      return window.alert(body.error?.message ?? "추첨 오류");
    }
    const { resultId, animationMs } = body.data;
    setMessage("공개 화면에서 애니메이션이 진행 중입니다.");
    window.setTimeout(async () => {
      const revealResponse = await fetch(`/api/admin/results/${resultId}/reveal`, { method: "POST" });
      const revealBody = await revealResponse.json();
      setLoading(false);
      if (!revealResponse.ok) {
        setMessage("결과는 결정됐지만 공개 처리에 실패했습니다. 실시간 페이지가 자동 복구합니다.");
        return;
      }
      setMessage(`결과 공개 완료: ${revealBody.data?.rewardName ?? "상품"}`);
    }, Number(animationMs) + 150);
  }

  return (
    <div className="spin-console">
      <section className="panel spin-panel">
        <div className="flex items-center gap-1"><Radio size={18} className="text-green" /><h2 className="panel-title mb-0">실시간 추첨 제어</h2></div>
        <p className="panel-description mt-1">버튼을 한 번 누르면 결과가 서버에서 먼저 확정되고, 3~5초 연출 후 모두에게 공개됩니다.</p>
        <div className="form-grid mt-3">
          <div className="field"><label htmlFor="spin-draw">뽑기 선택</label><select id="spin-draw" className="select" value={drawId} onChange={(e) => setDrawId(e.target.value)}>{activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name}</option>)}</select></div>
          <div className="field"><label htmlFor="spin-member">참가 회원</label><select id="spin-member" className="select" value={memberId} onChange={(e) => setMemberId(e.target.value)}>{approvedMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {member.member_code}</option>)}</select></div>
          <div className="note-box"><UserRound size={15} style={{ verticalAlign: -3 }} /> 선택한 회원의 보관함에 교환 가능 상품이 자동 적립됩니다.</div>
          <button className="btn btn-primary btn-lg btn-block" onClick={spin} disabled={loading || !activeDraws.length || !approvedMembers.length}>{loading ? <LoaderCircle size={19} /> : <Dices size={20} />} 추첨 실행</button>
          <p className="text-muted text-small">{message}</p>
        </div>
      </section>
      <LiveDrawStage drawId={drawId || undefined} />
    </div>
  );
}
