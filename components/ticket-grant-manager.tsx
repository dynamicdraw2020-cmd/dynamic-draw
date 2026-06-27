"use client";

import { Coins, LoaderCircle, Plus, Repeat2, Ticket, UsersRound, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { AdminCurrencyBalance, AdminTicketBalance, Draw, Profile, TicketExchangeRate, VirtualCurrency } from "@/lib/types";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

async function jsonRequest(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function TicketGrantManager({ draws, members, balances, currencies, currencyBalances, exchangeRates }: { draws: Draw[]; members: Profile[]; balances: AdminTicketBalance[]; currencies: VirtualCurrency[]; currencyBalances: AdminCurrencyBalance[]; exchangeRates: Array<TicketExchangeRate & { draw_name?: string; currency_name?: string; currency_symbol?: string }> }) {
  const router = useRouter();
  const activeDraws = draws.filter((draw) => draw.status === "ACTIVE");
  const approvedMembers = members.filter((member) => member.status === "APPROVED" && member.role === "USER");
  const activeCurrencies = currencies.filter((currency) => currency.is_active);
  const [drawId, setDrawId] = useState(activeDraws[0]?.id ?? "");
  const [profileId, setProfileId] = useState(approvedMembers[0]?.id ?? "");
  const [targetMode, setTargetMode] = useState<"ONE" | "ALL">("ONE");
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");
  const [currencyTargetMode, setCurrencyTargetMode] = useState<"ONE" | "ALL">("ONE");
  const [currencyId, setCurrencyId] = useState(activeCurrencies[0]?.id ?? "");
  const [currencyAmount, setCurrencyAmount] = useState(100);
  const [currencyMemo, setCurrencyMemo] = useState("");
  const [newCurrencyName, setNewCurrencyName] = useState("이벤트 포인트");
  const [newCurrencyCode, setNewCurrencyCode] = useState("EVENT_POINT");
  const [newCurrencySymbol, setNewCurrencySymbol] = useState("P");
  const [rateDrawId, setRateDrawId] = useState(activeDraws[0]?.id ?? "");
  const [rateCurrencyId, setRateCurrencyId] = useState(activeCurrencies[0]?.id ?? "");
  const [currencyCost, setCurrencyCost] = useState(100);
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);

  const currentBalance = useMemo(() => balances.find((balance) => balance.draw_id === drawId && balance.profile_id === profileId)?.quantity ?? 0, [balances, drawId, profileId]);
  const selectedMember = approvedMembers.find((member) => member.id === profileId);

  async function submitTickets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!drawId) return window.alert("뽑기를 선택해 주세요.");
    if (targetMode === "ONE" && !profileId) return window.alert("회원을 선택해 주세요.");
    if (targetMode === "ALL" && !window.confirm(`승인된 일반 회원 ${approvedMembers.length.toLocaleString()}명에게 각각 ${quantity.toLocaleString()}장씩 지급할까요?`)) return;
    setLoading("tickets");
    try {
      const body = await jsonRequest("/api/admin/tickets", { drawId, targetMode, profileId: targetMode === "ALL" ? null : profileId, quantity, memo });
      window.alert(targetMode === "ALL" ? `전체 지급 완료 · ${body.data?.affectedCount ?? approvedMembers.length}명` : `추첨권 지급 완료 · 현재 보유 ${body.data?.quantity ?? "갱신"}장`);
      setMemo("");
      router.refresh();
    } catch (error) { window.alert((error as Error).message); } finally { setLoading(null); }
  }

  async function submitCurrency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currencyId) return window.alert("화폐를 선택해 주세요.");
    if (currencyTargetMode === "ONE" && !profileId) return window.alert("회원을 선택해 주세요.");
    if (currencyTargetMode === "ALL" && !window.confirm(`승인된 일반 회원 ${approvedMembers.length.toLocaleString()}명에게 각각 ${currencyAmount.toLocaleString()}개씩 지급할까요?`)) return;
    setLoading("currency");
    try {
      const body = await jsonRequest("/api/admin/currency-grants", { currencyId, targetMode: currencyTargetMode, profileId: currencyTargetMode === "ALL" ? null : profileId, amount: currencyAmount, memo: currencyMemo });
      window.alert(currencyTargetMode === "ALL" ? `전체 화폐 지급 완료 · ${body.data?.affectedCount ?? approvedMembers.length}명` : `화폐 지급 완료 · 현재 보유 ${body.data?.balance ?? "갱신"}`);
      setCurrencyMemo("");
      router.refresh();
    } catch (error) { window.alert((error as Error).message); } finally { setLoading(null); }
  }

  async function createCurrency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("create-currency");
    try {
      await jsonRequest("/api/admin/currencies", { name: newCurrencyName, code: newCurrencyCode.trim().toUpperCase(), symbol: newCurrencySymbol });
      window.alert("화폐가 생성되었습니다.");
      router.refresh();
    } catch (error) { window.alert((error as Error).message); } finally { setLoading(null); }
  }

  async function createRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rateDrawId || !rateCurrencyId) return window.alert("뽑기와 화폐를 선택해 주세요.");
    setLoading("rate");
    try {
      await jsonRequest("/api/admin/ticket-exchange-rates", { drawId: rateDrawId, currencyId: rateCurrencyId, currencyCost, ticketQuantity });
      window.alert("화폐 → 추첨권 교환 비율이 생성되었습니다.");
      router.refresh();
    } catch (error) { window.alert((error as Error).message); } finally { setLoading(null); }
  }

  return <div className="grid ticket-admin-grid">
    <section className="panel panel-pad operation-note"><h2>운영 흐름</h2><p>관리자가 운영용 화폐를 만들고 회원에게 지급하면, 회원은 화폐를 추첨권으로 교환해 직접 룰렛을 돌릴 수 있습니다. 현실 결제와 연결되지 않는 이벤트용 포인트입니다.</p></section>
    <div className="grid grid-2">
      <form className="panel panel-pad form-grid" onSubmit={submitTickets}>
        <div><div className="flex items-center gap-1"><Ticket size={19} className="text-gold" /><h2 className="panel-title mb-0">추첨권 지급</h2></div><p className="panel-description mt-1">개별 회원 또는 전체 승인 회원에게 뽑기별 추첨권을 지급합니다.</p></div>
        <div className="form-row"><div className="field"><label>지급 대상</label><select className="select" value={targetMode} onChange={(event) => setTargetMode(event.target.value as "ONE" | "ALL")}><option value="ONE">회원 1명</option><option value="ALL">전체 승인 회원</option></select></div><div className="field"><label htmlFor="ticket-draw">뽑기</label><select id="ticket-draw" className="select" value={drawId} onChange={(event) => setDrawId(event.target.value)} required>{activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name}</option>)}</select></div></div>
        {targetMode === "ONE" && <div className="field"><label htmlFor="ticket-member">회원</label><select id="ticket-member" className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)} required>{approvedMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {displayLoginId(member)} · {member.member_code ?? "고유 ID 없음"}</option>)}</select></div>}
        <div className="form-row"><div className="field"><label htmlFor="ticket-quantity">지급 수량</label><input id="ticket-quantity" className="input" type="number" min="1" max="1000" value={quantity} onChange={(event) => setQuantity(Number(event.target.value || 1))} /></div><div className="field"><label htmlFor="ticket-memo">메모</label><input id="ticket-memo" className="input" maxLength={200} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="예: 이벤트 참여 보상" /></div></div>
        <div className="note-box"><UsersRound size={15} style={{ verticalAlign: -3 }} /> {targetMode === "ALL" ? `전체 지급 대상 ${approvedMembers.length.toLocaleString()}명` : `${selectedMember?.display_name ?? "회원"} 현재 보유 ${currentBalance.toLocaleString()}장`}</div>
        <button className="btn btn-primary btn-lg" type="submit" disabled={loading === "tickets" || !activeDraws.length || !approvedMembers.length}>{loading === "tickets" ? <LoaderCircle size={18} className="spin" /> : <Plus size={18} />} 추첨권 지급</button>
      </form>

      <form className="panel panel-pad form-grid" onSubmit={submitCurrency}>
        <div><div className="flex items-center gap-1"><Coins size={19} className="text-gold" /><h2 className="panel-title mb-0">화폐 지급</h2></div><p className="panel-description mt-1">운영용 포인트를 지급합니다. 회원은 직접 뽑기에서 추첨권으로 교환합니다.</p></div>
        <div className="form-row"><div className="field"><label>지급 대상</label><select className="select" value={currencyTargetMode} onChange={(event) => setCurrencyTargetMode(event.target.value as "ONE" | "ALL")}><option value="ONE">회원 1명</option><option value="ALL">전체 승인 회원</option></select></div><div className="field"><label htmlFor="currency-select">화폐</label><select id="currency-select" className="select" value={currencyId} onChange={(event) => setCurrencyId(event.target.value)} required>{activeCurrencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} · {currency.symbol}</option>)}</select></div></div>
        {currencyTargetMode === "ONE" && <div className="field"><label htmlFor="currency-member">회원</label><select id="currency-member" className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)} required>{approvedMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {displayLoginId(member)} · {member.member_code ?? "고유 ID 없음"}</option>)}</select></div>}
        <div className="form-row"><div className="field"><label htmlFor="currency-amount">지급 수량</label><input id="currency-amount" className="input" type="number" min="1" max="1000000" value={currencyAmount} onChange={(event) => setCurrencyAmount(Number(event.target.value || 1))} /></div><div className="field"><label htmlFor="currency-memo">메모</label><input id="currency-memo" className="input" maxLength={200} value={currencyMemo} onChange={(event) => setCurrencyMemo(event.target.value)} placeholder="예: 출석 이벤트" /></div></div>
        <button className="btn btn-secondary btn-lg" type="submit" disabled={loading === "currency" || !activeCurrencies.length || !approvedMembers.length}>{loading === "currency" ? <LoaderCircle size={18} className="spin" /> : <WalletCards size={18} />} 화폐 지급</button>
      </form>
    </div>

    <div className="grid grid-2"><form className="panel panel-pad form-grid" onSubmit={createCurrency}><h2 className="panel-title">화폐 설정</h2><p className="panel-description">이벤트용 포인트의 이름과 표기를 만듭니다.</p><div className="form-row"><div className="field"><label htmlFor="new-currency-name">화폐명</label><input id="new-currency-name" className="input" value={newCurrencyName} onChange={(event) => setNewCurrencyName(event.target.value)} /></div><div className="field"><label htmlFor="new-currency-symbol">표기</label><input id="new-currency-symbol" className="input" value={newCurrencySymbol} onChange={(event) => setNewCurrencySymbol(event.target.value)} /></div></div><div className="field"><label htmlFor="new-currency-code">관리 코드</label><input id="new-currency-code" className="input" value={newCurrencyCode} onChange={(event) => setNewCurrencyCode(event.target.value.toUpperCase())} placeholder="EVENT_POINT" /></div><button className="btn btn-secondary" type="submit" disabled={loading === "create-currency"}>{loading === "create-currency" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 화폐 만들기</button><div className="currency-list">{currencies.map((currency) => <span className="currency-chip" key={currency.id}>{currency.name} · {currency.symbol} · {currency.is_active ? "사용" : "꺼짐"}</span>)}</div></form><form className="panel panel-pad form-grid" onSubmit={createRate}><h2 className="panel-title">화폐 → 추첨권 교환 설정</h2><p className="panel-description">회원이 직접 뽑기 화면에서 교환할 비율입니다.</p><div className="form-row"><div className="field"><label htmlFor="rate-draw">대상 뽑기</label><select id="rate-draw" className="select" value={rateDrawId} onChange={(event) => setRateDrawId(event.target.value)}>{activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name}</option>)}</select></div><div className="field"><label htmlFor="rate-currency">사용 화폐</label><select id="rate-currency" className="select" value={rateCurrencyId} onChange={(event) => setRateCurrencyId(event.target.value)}>{activeCurrencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name}</option>)}</select></div></div><div className="form-row"><div className="field"><label htmlFor="currency-cost">차감 화폐</label><input id="currency-cost" className="input" type="number" min="1" value={currencyCost} onChange={(event) => setCurrencyCost(Number(event.target.value || 1))} /></div><div className="field"><label htmlFor="ticket-quantity-rate">지급 추첨권</label><input id="ticket-quantity-rate" className="input" type="number" min="1" value={ticketQuantity} onChange={(event) => setTicketQuantity(Number(event.target.value || 1))} /></div></div><button className="btn btn-secondary" type="submit" disabled={loading === "rate"}>{loading === "rate" ? <LoaderCircle size={17} className="spin" /> : <Repeat2 size={17} />} 교환 비율 만들기</button></form></div>

    <section className="panel panel-pad"><h2 className="panel-title">교환 비율 현황</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>뽑기</th><th>화폐</th><th>비율</th><th>상태</th></tr></thead><tbody>{exchangeRates.length ? exchangeRates.map((rate) => <tr key={rate.id}><td>{rate.draw_name ?? rate.draw_id}</td><td>{rate.currency_name ?? rate.currency_id}</td><td>{rate.currency_cost.toLocaleString()}{rate.currency_symbol ? ` ${rate.currency_symbol}` : ""} → {rate.ticket_quantity.toLocaleString()}장</td><td>{rate.is_active ? "사용 중" : "꺼짐"}</td></tr>) : <tr><td colSpan={4}><div className="empty">아직 교환 비율이 없습니다.</div></td></tr>}</tbody></table></div></section>
    <div className="grid grid-2"><section className="panel panel-pad"><h2 className="panel-title">추첨권 보유 현황</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>회원</th><th>뽑기</th><th>보유</th><th>최근 갱신</th></tr></thead><tbody>{balances.length ? balances.map((balance) => <tr key={`${balance.profile_id}-${balance.draw_id}`}><td><strong>{balance.profile_name}</strong><div className="text-muted text-small">{balance.member_code ?? "고유 ID 없음"} · {balance.profile_email}</div></td><td>{balance.draw_name}</td><td><span className="ticket-count">{balance.quantity.toLocaleString()}장</span></td><td className="muted">{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td></tr>) : <tr><td colSpan={4}><div className="empty">아직 지급된 추첨권이 없습니다.</div></td></tr>}</tbody></table></div></section><section className="panel panel-pad"><h2 className="panel-title">화폐 보유 현황</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>회원</th><th>화폐</th><th>보유량</th><th>최근 갱신</th></tr></thead><tbody>{currencyBalances.length ? currencyBalances.map((balance) => <tr key={`${balance.profile_id}-${balance.currency_id}`}><td><strong>{balance.profile_name}</strong><div className="text-muted text-small">{balance.member_code ?? "고유 ID 없음"} · {balance.profile_email}</div></td><td>{balance.currency_name}</td><td><span className="ticket-count">{balance.balance.toLocaleString()} {balance.currency_symbol}</span></td><td className="muted">{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td></tr>) : <tr><td colSpan={4}><div className="empty">아직 지급된 화폐가 없습니다.</div></td></tr>}</tbody></table></div></section></div>
  </div>;
}
