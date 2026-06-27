"use client";

import { LoaderCircle, Plus, Ticket, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { AdminTicketBalance, Draw, Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

async function jsonRequest(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function TicketGrantManager({ draws, members, balances }: { draws: Draw[]; members: Profile[]; balances: AdminTicketBalance[] }) {
  const router = useRouter();
  const activeDraws = draws.filter((draw) => draw.status === "ACTIVE");
  const approvedMembers = members.filter((member) => member.status === "APPROVED" && member.role === "USER");
  const [drawId, setDrawId] = useState(activeDraws[0]?.id ?? "");
  const [profileId, setProfileId] = useState(approvedMembers[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);

  const currentBalance = useMemo(() => {
    return balances.find((balance) => balance.draw_id === drawId && balance.profile_id === profileId)?.quantity ?? 0;
  }, [balances, drawId, profileId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!drawId || !profileId) return window.alert("뽑기와 회원을 선택해 주세요.");
    setLoading(true);
    try {
      const body = await jsonRequest("/api/admin/tickets", { drawId, profileId, quantity, memo });
      window.alert(`추첨권 지급 완료 · 현재 보유 ${body.data?.quantity ?? "갱신"}장`);
      setMemo("");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <form className="panel panel-pad form-grid" onSubmit={submit}>
        <div>
          <div className="flex items-center gap-1"><Ticket size={19} className="text-gold" /><h2 className="panel-title mb-0">회원에게 추첨권 지급</h2></div>
          <p className="panel-description mt-1">회원은 지급받은 추첨권으로 직접 룰렛 뽑기를 실행할 수 있습니다. 지급 내역은 관리자 로그에 남습니다.</p>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ticket-draw">뽑기</label>
            <select id="ticket-draw" className="select" value={drawId} onChange={(event) => setDrawId(event.target.value)} required>
              {activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ticket-member">회원</label>
            <select id="ticket-member" className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)} required>
              {approvedMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {member.member_code ?? member.email}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ticket-quantity">지급 수량</label>
            <input id="ticket-quantity" className="input" type="number" min="1" max="1000" value={quantity} onChange={(event) => setQuantity(Number(event.target.value || 1))} />
          </div>
          <div className="field">
            <label htmlFor="ticket-memo">메모</label>
            <input id="ticket-memo" className="input" maxLength={200} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="예: 이벤트 참여 보상" />
          </div>
        </div>
        <div className="note-box"><UserRound size={15} style={{ verticalAlign: -3 }} /> 선택 회원의 현재 보유 추첨권: <strong>{currentBalance.toLocaleString()}장</strong></div>
        <button className="btn btn-primary btn-lg" type="submit" disabled={loading || !activeDraws.length || !approvedMembers.length}>{loading ? <LoaderCircle size={18} className="spin" /> : <Plus size={18} />} 추첨권 지급</button>
      </form>

      <section className="panel panel-pad">
        <h2 className="panel-title">추첨권 보유 현황</h2>
        <p className="panel-description">현재 1장 이상 보유한 회원만 표시됩니다.</p>
        <div className="table-wrap mt-3">
          <table className="table">
            <thead><tr><th>회원</th><th>뽑기</th><th>보유 추첨권</th><th>최근 갱신</th></tr></thead>
            <tbody>
              {balances.length ? balances.map((balance) => (
                <tr key={`${balance.profile_id}-${balance.draw_id}`}>
                  <td><strong>{balance.profile_name}</strong><div className="text-muted text-small">{balance.member_code ?? "고유 ID 없음"} · {balance.profile_email}</div></td>
                  <td>{balance.draw_name}</td>
                  <td><span className="ticket-count">{balance.quantity.toLocaleString()}장</span></td>
                  <td className="muted">{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td>
                </tr>
              )) : <tr><td colSpan={4}><div className="empty">아직 지급된 추첨권이 없습니다.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
