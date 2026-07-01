"use client";

import { Coins, LoaderCircle, Plus, RotateCcw, Ticket, UserRoundCheck, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import type { AdminCurrencyBalance, AdminRewardRecoveryLog, AdminTicketBalance, Draw, Profile, VirtualCurrency } from "@/lib/types";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

const pageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: "18px",
  alignItems: "start",
};

const boxStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 18,
  padding: 16,
  background: "rgba(255, 255, 255, 0.55)",
};

const formStackStyle: CSSProperties = { display: "grid", gap: 10 };
const fullButtonStyle: CSSProperties = { width: "100%", justifyContent: "center" };

async function jsonRequest(url: string, body: unknown = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

function recoveryKindLabel(kind: AdminRewardRecoveryLog["kind"]) {
  return kind === "TICKET" ? "추첨권" : "포인트";
}

export function CsGrantManager({
  draws,
  members,
  balances,
  currencies,
  currencyBalances,
  recoveryLogs = [],
}: {
  draws: Draw[];
  members: Profile[];
  balances: AdminTicketBalance[];
  currencies: VirtualCurrency[];
  currencyBalances: AdminCurrencyBalance[];
  recoveryLogs?: AdminRewardRecoveryLog[];
}) {
  const router = useRouter();
  const activeDraws = draws.filter((draw) => draw.status !== "ENDED");
  const approvedMembers = members.filter((member) => member.status === "APPROVED" && member.role === "USER");
  const activeCurrencies = currencies.filter((currency) => currency.is_active && !currency.deleted_at);

  const [profileId, setProfileId] = useState(approvedMembers[0]?.id ?? "");
  const [drawId, setDrawId] = useState(activeDraws[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");
  const [ticketRecoveryQuantity, setTicketRecoveryQuantity] = useState(1);
  const [ticketRecoveryReason, setTicketRecoveryReason] = useState("");
  const [ticketRecoveryMemo, setTicketRecoveryMemo] = useState("");

  const [currencyId, setCurrencyId] = useState(activeCurrencies[0]?.id ?? "");
  const [currencyAmount, setCurrencyAmount] = useState(100);
  const [currencyMemo, setCurrencyMemo] = useState("");
  const [currencyRecoveryAmount, setCurrencyRecoveryAmount] = useState(100);
  const [currencyRecoveryReason, setCurrencyRecoveryReason] = useState("");
  const [currencyRecoveryMemo, setCurrencyRecoveryMemo] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const selectedMember = approvedMembers.find((member) => member.id === profileId);
  const currentTicketBalance = useMemo(
    () => balances.find((balance) => balance.draw_id === drawId && balance.profile_id === profileId)?.quantity ?? 0,
    [balances, drawId, profileId],
  );
  const currentCurrencyBalance = useMemo(
    () => currencyBalances.find((balance) => balance.currency_id === currencyId && balance.profile_id === profileId)?.balance ?? 0,
    [currencyBalances, currencyId, profileId],
  );

  async function submitTickets(event: FormEvent) {
    event.preventDefault();
    if (!profileId) return window.alert("회원을 선택해 주세요.");
    if (!drawId) return window.alert("뽑기를 선택해 주세요.");
    setLoading("tickets");
    try {
      const body = await jsonRequest("/api/admin/tickets", { drawId, targetMode: "ONE", profileId, quantity, memo });
      window.alert(`추첨권 지급 완료 · 현재 보유 ${body.data?.quantity ?? "갱신"}장`);
      setMemo("");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function recoverTickets(event: FormEvent) {
    event.preventDefault();
    if (!profileId) return window.alert("회원을 선택해 주세요.");
    if (!drawId) return window.alert("뽑기를 선택해 주세요.");
    if (!ticketRecoveryReason.trim()) return window.alert("회수 사유를 입력해 주세요.");
    if (ticketRecoveryQuantity > currentTicketBalance) return window.alert(`현재 보유 ${currentTicketBalance.toLocaleString()}장보다 많이 회수할 수 없습니다.`);
    if (!window.confirm(`${selectedMember?.display_name ?? "회원"}님의 추첨권 ${ticketRecoveryQuantity.toLocaleString()}장을 회수할까요?`)) return;
    setLoading("recover-tickets");
    try {
      const body = await jsonRequest("/api/admin/recover-tickets", {
        drawId,
        profileId,
        quantity: ticketRecoveryQuantity,
        reason: ticketRecoveryReason,
        memo: ticketRecoveryMemo,
      });
      window.alert(`추첨권 회수 완료 · 남은 수량 ${body.data?.balanceAfter ?? "갱신"}장`);
      setTicketRecoveryReason("");
      setTicketRecoveryMemo("");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function submitCurrency(event: FormEvent) {
    event.preventDefault();
    if (!profileId) return window.alert("회원을 선택해 주세요.");
    if (!currencyId) return window.alert("포인트/화폐를 선택해 주세요.");
    setLoading("currency");
    try {
      const body = await jsonRequest("/api/admin/currency-grants", { currencyId, targetMode: "ONE", profileId, amount: currencyAmount, memo: currencyMemo });
      window.alert(`포인트 지급 완료 · 현재 보유 ${body.data?.balance ?? "갱신"}`);
      setCurrencyMemo("");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function recoverCurrency(event: FormEvent) {
    event.preventDefault();
    if (!profileId) return window.alert("회원을 선택해 주세요.");
    if (!currencyId) return window.alert("포인트/화폐를 선택해 주세요.");
    if (!currencyRecoveryReason.trim()) return window.alert("회수 사유를 입력해 주세요.");
    if (currencyRecoveryAmount > currentCurrencyBalance) return window.alert(`현재 보유 ${currentCurrencyBalance.toLocaleString()}보다 많이 회수할 수 없습니다.`);
    if (!window.confirm(`${selectedMember?.display_name ?? "회원"}님의 포인트 ${currencyRecoveryAmount.toLocaleString()}개를 회수할까요?`)) return;
    setLoading("recover-currency");
    try {
      const body = await jsonRequest("/api/admin/recover-currency", {
        currencyId,
        profileId,
        amount: currencyRecoveryAmount,
        reason: currencyRecoveryReason,
        memo: currencyRecoveryMemo,
      });
      window.alert(`포인트 회수 완료 · 남은 수량 ${body.data?.balanceAfter ?? "갱신"}`);
      setCurrencyRecoveryReason("");
      setCurrencyRecoveryMemo("");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="stack-xl">
      <section className="panel panel-pad">
        <div className="section-head">
          <div>
            <h2 className="panel-title"><UserRoundCheck size={20} /> CS 지급·회수 콘솔</h2>
            <p className="muted">CS매니저는 승인된 일반 회원 1명에게만 지급·회수할 수 있습니다. 회수는 보유 수량 안에서만 처리됩니다.</p>
          </div>
        </div>
        <label className="field-label mt-4">
          <span>대상 회원</span>
          <select className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {approvedMembers.map((member) => (
              <option key={member.id} value={member.id}>{member.display_name} · {displayLoginId(member)} · {member.member_code ?? "고유 ID 없음"}</option>
            ))}
          </select>
        </label>
      </section>

      <div style={pageGridStyle}>
        <section className="panel panel-pad">
          <h2 className="panel-title"><Ticket size={20} /> 추첨권 지급 · 회수</h2>
          <p className="muted mt-2">현재 보유 {currentTicketBalance.toLocaleString()}장</p>
          <div className="mt-4" style={pageGridStyle}>
            <form style={boxStyle} onSubmit={submitTickets}>
              <h3 className="panel-title"><Plus size={18} /> 지급</h3>
              <div className="mt-4" style={formStackStyle}>
                <label className="field-label"><span>뽑기</span><select className="select" value={drawId} onChange={(event) => setDrawId(event.target.value)} required>{activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>)}</select></label>
                <label className="field-label"><span>지급 수량</span><input className="input" type="number" min={1} max={1000} value={quantity} onChange={(event) => setQuantity(Number(event.target.value || 1))} /></label>
                <label className="field-label"><span>메모</span><input className="input" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="예: 문의 보상" /></label>
                <button className="btn btn-primary" style={fullButtonStyle} disabled={loading === "tickets" || !profileId || !drawId}>{loading === "tickets" ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} 추첨권 지급</button>
              </div>
            </form>
            <form style={boxStyle} onSubmit={recoverTickets}>
              <h3 className="panel-title"><RotateCcw size={18} /> 회수</h3>
              <div className="mt-4" style={formStackStyle}>
                <label className="field-label"><span>회수 수량</span><input className="input" type="number" min={1} max={Math.max(1, currentTicketBalance)} value={ticketRecoveryQuantity} onChange={(event) => setTicketRecoveryQuantity(Number(event.target.value || 1))} /></label>
                <label className="field-label"><span>회수 사유</span><input className="input" value={ticketRecoveryReason} onChange={(event) => setTicketRecoveryReason(event.target.value)} placeholder="예: 잘못 지급" required /></label>
                <label className="field-label"><span>메모</span><input className="input" value={ticketRecoveryMemo} onChange={(event) => setTicketRecoveryMemo(event.target.value)} placeholder="예: 문의번호, 처리자 메모" /></label>
                <button className="btn btn-danger" style={fullButtonStyle} disabled={loading === "recover-tickets" || !profileId || !drawId || currentTicketBalance < 1}>{loading === "recover-tickets" ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />} 추첨권 회수</button>
              </div>
            </form>
          </div>
        </section>

        <section className="panel panel-pad">
          <h2 className="panel-title"><Coins size={20} /> 포인트 지급 · 회수</h2>
          <p className="muted mt-2">현재 보유 {currentCurrencyBalance.toLocaleString()}</p>
          <div className="mt-4" style={pageGridStyle}>
            <form style={boxStyle} onSubmit={submitCurrency}>
              <h3 className="panel-title"><Plus size={18} /> 지급</h3>
              <div className="mt-4" style={formStackStyle}>
                <label className="field-label"><span>포인트/화폐</span><select className="select" value={currencyId} onChange={(event) => setCurrencyId(event.target.value)} required>{activeCurrencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} · {currency.symbol}</option>)}</select></label>
                <label className="field-label"><span>지급 수량</span><input className="input" type="number" min={1} max={1_000_000} value={currencyAmount} onChange={(event) => setCurrencyAmount(Number(event.target.value || 1))} /></label>
                <label className="field-label"><span>메모</span><input className="input" value={currencyMemo} onChange={(event) => setCurrencyMemo(event.target.value)} placeholder="예: 고객센터 보상" /></label>
                <button className="btn btn-primary" style={fullButtonStyle} disabled={loading === "currency" || !profileId || !currencyId}>{loading === "currency" ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} 포인트 지급</button>
              </div>
            </form>
            <form style={boxStyle} onSubmit={recoverCurrency}>
              <h3 className="panel-title"><RotateCcw size={18} /> 회수</h3>
              <div className="mt-4" style={formStackStyle}>
                <label className="field-label"><span>회수 수량</span><input className="input" type="number" min={1} max={Math.max(1, currentCurrencyBalance)} value={currencyRecoveryAmount} onChange={(event) => setCurrencyRecoveryAmount(Number(event.target.value || 1))} /></label>
                <label className="field-label"><span>회수 사유</span><input className="input" value={currencyRecoveryReason} onChange={(event) => setCurrencyRecoveryReason(event.target.value)} placeholder="예: 잘못 지급" required /></label>
                <label className="field-label"><span>메모</span><input className="input" value={currencyRecoveryMemo} onChange={(event) => setCurrencyRecoveryMemo(event.target.value)} placeholder="예: 문의번호, 처리자 메모" /></label>
                <button className="btn btn-danger" style={fullButtonStyle} disabled={loading === "recover-currency" || !profileId || !currencyId || currentCurrencyBalance < 1}>{loading === "recover-currency" ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />} 포인트 회수</button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <section className="panel panel-pad">
        <h2 className="panel-title"><WalletCards size={20} /> 최근 보유 현황</h2>
        <div className="table-wrap mt-4">
          <table className="data-table">
            <thead><tr><th>회원</th><th>뽑기/화폐</th><th>보유</th><th>최근 갱신</th></tr></thead>
            <tbody>
              {balances.slice(0, 15).map((balance) => (
                <tr key={`${balance.profile_id}-${balance.draw_id}`}><td>{balance.profile_name}<br /><small>{balance.member_code ?? "고유 ID 없음"}</small></td><td>{balance.draw_name}</td><td>{balance.quantity.toLocaleString()}장</td><td>{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td></tr>
              ))}
              {currencyBalances.slice(0, 15).map((balance) => (
                <tr key={`${balance.profile_id}-${balance.currency_id}`}><td>{balance.profile_name}<br /><small>{balance.member_code ?? "고유 ID 없음"}</small></td><td>{balance.currency_name}</td><td>{balance.balance.toLocaleString()} {balance.currency_symbol}</td><td>{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td></tr>
              ))}
              {!balances.length && !currencyBalances.length && <tr><td colSpan={4}>아직 지급 현황이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title"><RotateCcw size={20} /> 최근 회수 기록</h2>
        <div className="table-wrap mt-4">
          <table className="data-table">
            <thead><tr><th>일시</th><th>구분</th><th>회원</th><th>대상</th><th>회수</th><th>잔여</th><th>사유</th></tr></thead>
            <tbody>
              {recoveryLogs.slice(0, 30).map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{recoveryKindLabel(log.kind)}</td>
                  <td>{log.profile_name ?? log.profile_id}<br /><small>{log.member_code ?? "고유 ID 없음"}</small></td>
                  <td>{log.kind === "TICKET" ? log.draw_name ?? log.draw_id : log.currency_name ?? log.currency_id}</td>
                  <td>{log.amount_recovered.toLocaleString()}</td>
                  <td>{log.balance_after.toLocaleString()}</td>
                  <td>{log.reason}</td>
                </tr>
              ))}
              {!recoveryLogs.length && <tr><td colSpan={7}>아직 회수 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
