"use client";

import { Coins, LoaderCircle, Plus, Repeat2, RotateCcw, Ticket, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import type { AdminCurrencyBalance, AdminRewardRecoveryLog, AdminTicketBalance, Draw, Profile, TicketExchangeRate, VirtualCurrency } from "@/lib/types";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

type AdminExchangeRate = TicketExchangeRate & { draw_name?: string; currency_name?: string; currency_symbol?: string };

type LoadingKey =
  | "tickets"
  | "recover-tickets"
  | "currency"
  | "recover-currency"
  | "create-currency"
  | "rate"
  | string
  | null;

const pageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  gap: "18px",
  alignItems: "start",
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "14px",
  alignItems: "start",
};

const actionBoxStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 18,
  padding: 16,
  background: "rgba(255, 255, 255, 0.55)",
};

const compactActionsStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const fullButtonStyle: CSSProperties = { width: "100%", justifyContent: "center" };

async function jsonRequest(url: string, body: unknown = {}, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

function recoveryKindLabel(kind: AdminRewardRecoveryLog["kind"]) {
  return kind === "TICKET" ? "추첨권" : "포인트";
}

function memberOptionLabel(member: Profile) {
  return `${member.display_name} · ${displayLoginId(member)} · ${member.role} · ${member.member_code ?? "고유 ID 없음"}`;
}

export function TicketGrantManager({
  draws,
  members,
  balances,
  currencies,
  currencyBalances,
  exchangeRates,
  recoveryLogs = [],
}: {
  draws: Draw[];
  members: Profile[];
  balances: AdminTicketBalance[];
  currencies: VirtualCurrency[];
  currencyBalances: AdminCurrencyBalance[];
  exchangeRates: AdminExchangeRate[];
  recoveryLogs?: AdminRewardRecoveryLog[];
}) {
  const router = useRouter();
  const activeDraws = draws.filter((draw) => draw.status !== "ENDED");
  const approvedMembers = members.filter((member) => member.status === "APPROVED" && member.role === "USER");
  const activeCurrencies = currencies.filter((currency) => currency.is_active && !currency.deleted_at);

  const [drawId, setDrawId] = useState(activeDraws[0]?.id ?? "");
  const [profileId, setProfileId] = useState(approvedMembers[0]?.id ?? "");
  const [targetMode, setTargetMode] = useState<"ONE" | "ALL">("ONE");
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");

  const [recoverDrawId, setRecoverDrawId] = useState(activeDraws[0]?.id ?? "");
  const [recoverProfileId, setRecoverProfileId] = useState(approvedMembers[0]?.id ?? "");
  const [recoverQuantity, setRecoverQuantity] = useState(1);
  const [recoverReason, setRecoverReason] = useState("");
  const [recoverMemo, setRecoverMemo] = useState("");

  const [currencyTargetMode, setCurrencyTargetMode] = useState<"ONE" | "ALL">("ONE");
  const [currencyId, setCurrencyId] = useState(activeCurrencies[0]?.id ?? "");
  const [currencyProfileId, setCurrencyProfileId] = useState(approvedMembers[0]?.id ?? "");
  const [currencyAmount, setCurrencyAmount] = useState(100);
  const [currencyMemo, setCurrencyMemo] = useState("");

  const [recoverCurrencyId, setRecoverCurrencyId] = useState(activeCurrencies[0]?.id ?? "");
  const [recoverCurrencyProfileId, setRecoverCurrencyProfileId] = useState(approvedMembers[0]?.id ?? "");
  const [recoverCurrencyAmount, setRecoverCurrencyAmount] = useState(100);
  const [recoverCurrencyReason, setRecoverCurrencyReason] = useState("");
  const [recoverCurrencyMemo, setRecoverCurrencyMemo] = useState("");

  const [newCurrencyName, setNewCurrencyName] = useState("이벤트 포인트");
  const [newCurrencyCode, setNewCurrencyCode] = useState("EVENT_POINT");
  const [newCurrencySymbol, setNewCurrencySymbol] = useState("P");
  const [rateDrawId, setRateDrawId] = useState(activeDraws[0]?.id ?? "");
  const [rateCurrencyId, setRateCurrencyId] = useState(activeCurrencies[0]?.id ?? "");
  const [currencyCost, setCurrencyCost] = useState(100);
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [loading, setLoading] = useState<LoadingKey>(null);

  const selectedRecoverMember = approvedMembers.find((member) => member.id === recoverProfileId);
  const selectedRecoverCurrencyMember = approvedMembers.find((member) => member.id === recoverCurrencyProfileId);

  const currentTicketBalance = useMemo(
    () => balances.find((balance) => balance.draw_id === drawId && balance.profile_id === profileId)?.quantity ?? 0,
    [balances, drawId, profileId],
  );
  const recoverTicketBalance = useMemo(
    () => balances.find((balance) => balance.draw_id === recoverDrawId && balance.profile_id === recoverProfileId)?.quantity ?? 0,
    [balances, recoverDrawId, recoverProfileId],
  );
  const currentCurrencyBalance = useMemo(
    () => currencyBalances.find((balance) => balance.currency_id === currencyId && balance.profile_id === currencyProfileId)?.balance ?? 0,
    [currencyBalances, currencyId, currencyProfileId],
  );
  const recoverCurrencyBalance = useMemo(
    () => currencyBalances.find((balance) => balance.currency_id === recoverCurrencyId && balance.profile_id === recoverCurrencyProfileId)?.balance ?? 0,
    [currencyBalances, recoverCurrencyId, recoverCurrencyProfileId],
  );

  async function submitTickets(event: FormEvent) {
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
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function recoverTickets(event: FormEvent) {
    event.preventDefault();
    if (!recoverDrawId) return window.alert("뽑기를 선택해 주세요.");
    if (!recoverProfileId) return window.alert("회원을 선택해 주세요.");
    if (!recoverReason.trim()) return window.alert("회수 사유를 입력해 주세요.");
    if (recoverQuantity > recoverTicketBalance) return window.alert(`현재 보유 ${recoverTicketBalance.toLocaleString()}장보다 많이 회수할 수 없습니다.`);
    if (!window.confirm(`${selectedRecoverMember?.display_name ?? "회원"}님의 추첨권 ${recoverQuantity.toLocaleString()}장을 회수할까요?`)) return;
    setLoading("recover-tickets");
    try {
      const body = await jsonRequest("/api/admin/recover-tickets", {
        drawId: recoverDrawId,
        profileId: recoverProfileId,
        quantity: recoverQuantity,
        reason: recoverReason,
        memo: recoverMemo,
      });
      window.alert(`추첨권 회수 완료 · 남은 수량 ${body.data?.balanceAfter ?? "갱신"}장`);
      setRecoverReason("");
      setRecoverMemo("");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function submitCurrency(event: FormEvent) {
    event.preventDefault();
    const effectiveCurrencyId = activeCurrencies.some((currency) => currency.id === currencyId) ? currencyId : activeCurrencies[0]?.id ?? "";
    if (!effectiveCurrencyId) return window.alert("사용 가능한 화폐가 없습니다. 먼저 화폐를 만들거나 복구해 주세요.");
    if (currencyTargetMode === "ONE" && !currencyProfileId) return window.alert("회원을 선택해 주세요.");
    if (currencyTargetMode === "ALL" && !window.confirm(`승인된 일반 회원 ${approvedMembers.length.toLocaleString()}명에게 각각 ${currencyAmount.toLocaleString()}개씩 지급할까요?`)) return;
    setLoading("currency");
    try {
      const body = await jsonRequest("/api/admin/currency-grants", {
        currencyId: effectiveCurrencyId,
        targetMode: currencyTargetMode,
        profileId: currencyTargetMode === "ALL" ? null : currencyProfileId,
        amount: currencyAmount,
        memo: currencyMemo,
      });
      window.alert(currencyTargetMode === "ALL" ? `전체 화폐 지급 완료 · ${body.data?.affectedCount ?? approvedMembers.length}명` : `화폐 지급 완료 · 현재 보유 ${body.data?.balance ?? "갱신"}`);
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
    if (!recoverCurrencyId) return window.alert("포인트/화폐를 선택해 주세요.");
    if (!recoverCurrencyProfileId) return window.alert("회원을 선택해 주세요.");
    if (!recoverCurrencyReason.trim()) return window.alert("회수 사유를 입력해 주세요.");
    if (recoverCurrencyAmount > recoverCurrencyBalance) return window.alert(`현재 보유 ${recoverCurrencyBalance.toLocaleString()}보다 많이 회수할 수 없습니다.`);
    if (!window.confirm(`${selectedRecoverCurrencyMember?.display_name ?? "회원"}님의 포인트 ${recoverCurrencyAmount.toLocaleString()}개를 회수할까요?`)) return;
    setLoading("recover-currency");
    try {
      const body = await jsonRequest("/api/admin/recover-currency", {
        currencyId: recoverCurrencyId,
        profileId: recoverCurrencyProfileId,
        amount: recoverCurrencyAmount,
        reason: recoverCurrencyReason,
        memo: recoverCurrencyMemo,
      });
      window.alert(`포인트 회수 완료 · 남은 수량 ${body.data?.balanceAfter ?? "갱신"}`);
      setRecoverCurrencyReason("");
      setRecoverCurrencyMemo("");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function createCurrency(event: FormEvent) {
    event.preventDefault();
    setLoading("create-currency");
    try {
      await jsonRequest("/api/admin/currencies", { name: newCurrencyName, code: newCurrencyCode.trim().toUpperCase(), symbol: newCurrencySymbol });
      window.alert("화폐가 생성되었습니다.");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function createRate(event: FormEvent) {
    event.preventDefault();
    const effectiveRateCurrencyId = activeCurrencies.some((currency) => currency.id === rateCurrencyId) ? rateCurrencyId : activeCurrencies[0]?.id ?? "";
    if (!rateDrawId || !effectiveRateCurrencyId) return window.alert("뽑기와 화폐를 선택해 주세요.");
    setLoading("rate");
    try {
      await jsonRequest("/api/admin/ticket-exchange-rates", { drawId: rateDrawId, currencyId: effectiveRateCurrencyId, currencyCost, ticketQuantity });
      window.alert("화폐 → 추첨권 교환 비율이 생성되었습니다.");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function toggleCurrency(currency: VirtualCurrency) {
    setLoading(`currency-${currency.id}`);
    try {
      await jsonRequest(`/api/admin/currencies/${currency.id}`, { isActive: !currency.is_active }, "PATCH");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function deleteCurrency(currency: VirtualCurrency) {
    if (!window.confirm(`${currency.name} 화폐를 삭제할까요? 연결된 교환비는 실제 삭제됩니다.`)) return;
    setLoading(`currency-${currency.id}`);
    try {
      await jsonRequest(`/api/admin/currencies/${currency.id}`, {}, "DELETE");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function editRate(rate: AdminExchangeRate) {
    const cost = Number(window.prompt("차감 화폐 수량", String(rate.currency_cost)) ?? rate.currency_cost);
    const tickets = Number(window.prompt("지급 추첨권 수량", String(rate.ticket_quantity)) ?? rate.ticket_quantity);
    if (!cost || !tickets) return;
    setLoading(`rate-${rate.id}`);
    try {
      await jsonRequest(`/api/admin/ticket-exchange-rates/${rate.id}`, { currencyCost: cost, ticketQuantity: tickets }, "PATCH");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function toggleRate(rate: AdminExchangeRate) {
    setLoading(`rate-${rate.id}`);
    try {
      await jsonRequest(`/api/admin/ticket-exchange-rates/${rate.id}`, { isActive: !rate.is_active }, "PATCH");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function deleteRate(rate: AdminExchangeRate) {
    if (!window.confirm(`${rate.draw_name ?? "뽑기"} 교환비를 삭제할까요?`)) return;
    setLoading(`rate-${rate.id}`);
    try {
      await jsonRequest(`/api/admin/ticket-exchange-rates/${rate.id}`, {}, "DELETE");
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
            <h2 className="panel-title"><WalletCards size={20} /> 추첨권·포인트 운영</h2>
            <p className="muted">지급과 회수를 같은 줄에서 바로 처리할 수 있게 정리했습니다. 회수는 개별 회원의 현재 보유 수량 안에서만 가능합니다.</p>
          </div>
        </div>
      </section>

      <div style={pageGridStyle}>
        <section className="panel panel-pad">
          <div className="section-head">
            <div>
              <h2 className="panel-title"><Ticket size={20} /> 추첨권 지급 · 회수</h2>
              <p className="muted">왼쪽은 지급, 오른쪽은 잘못 지급한 추첨권 회수입니다.</p>
            </div>
          </div>
          <div className="mt-4" style={actionGridStyle}>
            <form style={actionBoxStyle} onSubmit={submitTickets}>
              <h3 className="panel-title"><Plus size={18} /> 지급</h3>
              <div className="mt-4" style={compactActionsStyle}>
                <label className="field-label">
                  <span>지급 대상</span>
                  <select className="select" value={targetMode} onChange={(event) => setTargetMode(event.target.value as "ONE" | "ALL")}>
                    <option value="ONE">회원 1명</option>
                    <option value="ALL">전체 승인 일반 회원</option>
                  </select>
                </label>
                <label className="field-label">
                  <span>뽑기</span>
                  <select className="select" value={drawId} onChange={(event) => setDrawId(event.target.value)} required>
                    {activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>)}
                  </select>
                </label>
                {targetMode === "ONE" && (
                  <label className="field-label">
                    <span>회원</span>
                    <select className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)} required>
                      {approvedMembers.map((member) => <option key={member.id} value={member.id}>{memberOptionLabel(member)}</option>)}
                    </select>
                  </label>
                )}
                <label className="field-label">
                  <span>지급 수량</span>
                  <input className="input" type="number" min={1} max={1000} value={quantity} onChange={(event) => setQuantity(Number(event.target.value || 1))} />
                </label>
                <label className="field-label">
                  <span>메모</span>
                  <input className="input" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="예: 이벤트 참여 보상" />
                </label>
                <p className="notice small">{targetMode === "ONE" ? `선택 회원 현재 보유 ${currentTicketBalance.toLocaleString()}장` : `전체 승인 일반 회원 ${approvedMembers.length.toLocaleString()}명 대상`}</p>
                <button className="btn btn-primary" style={fullButtonStyle} disabled={loading === "tickets" || !drawId || (targetMode === "ONE" && !profileId)}>
                  {loading === "tickets" ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} 추첨권 지급
                </button>
              </div>
            </form>

            <form style={actionBoxStyle} onSubmit={recoverTickets}>
              <h3 className="panel-title"><RotateCcw size={18} /> 회수</h3>
              <div className="mt-4" style={compactActionsStyle}>
                <label className="field-label">
                  <span>뽑기</span>
                  <select className="select" value={recoverDrawId} onChange={(event) => setRecoverDrawId(event.target.value)} required>
                    {activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  <span>회원</span>
                  <select className="select" value={recoverProfileId} onChange={(event) => setRecoverProfileId(event.target.value)} required>
                    {approvedMembers.map((member) => <option key={member.id} value={member.id}>{memberOptionLabel(member)}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  <span>회수 수량</span>
                  <input className="input" type="number" min={1} max={Math.max(1, recoverTicketBalance)} value={recoverQuantity} onChange={(event) => setRecoverQuantity(Number(event.target.value || 1))} />
                </label>
                <label className="field-label">
                  <span>회수 사유</span>
                  <input className="input" value={recoverReason} onChange={(event) => setRecoverReason(event.target.value)} placeholder="예: 잘못 지급" required />
                </label>
                <label className="field-label">
                  <span>메모</span>
                  <input className="input" value={recoverMemo} onChange={(event) => setRecoverMemo(event.target.value)} placeholder="예: 문의번호, 처리자 메모" />
                </label>
                <p className="notice small">회수 가능 {recoverTicketBalance.toLocaleString()}장</p>
                <button className="btn btn-danger" style={fullButtonStyle} disabled={loading === "recover-tickets" || !recoverProfileId || !recoverDrawId || recoverTicketBalance < 1}>
                  {loading === "recover-tickets" ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />} 추첨권 회수
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="section-head">
            <div>
              <h2 className="panel-title"><Coins size={20} /> 포인트 지급 · 회수</h2>
              <p className="muted">왼쪽은 지급, 오른쪽은 잘못 지급한 포인트/화폐 회수입니다.</p>
            </div>
          </div>
          <div className="mt-4" style={actionGridStyle}>
            <form style={actionBoxStyle} onSubmit={submitCurrency}>
              <h3 className="panel-title"><Plus size={18} /> 지급</h3>
              <div className="mt-4" style={compactActionsStyle}>
                <label className="field-label">
                  <span>지급 대상</span>
                  <select className="select" value={currencyTargetMode} onChange={(event) => setCurrencyTargetMode(event.target.value as "ONE" | "ALL")}>
                    <option value="ONE">회원 1명</option>
                    <option value="ALL">전체 승인 일반 회원</option>
                  </select>
                </label>
                <label className="field-label">
                  <span>포인트/화폐</span>
                  <select className="select" value={currencyId} onChange={(event) => setCurrencyId(event.target.value)} required>
                    {activeCurrencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} · {currency.symbol}</option>)}
                  </select>
                </label>
                {currencyTargetMode === "ONE" && (
                  <label className="field-label">
                    <span>회원</span>
                    <select className="select" value={currencyProfileId} onChange={(event) => setCurrencyProfileId(event.target.value)} required>
                      {approvedMembers.map((member) => <option key={member.id} value={member.id}>{memberOptionLabel(member)}</option>)}
                    </select>
                  </label>
                )}
                <label className="field-label">
                  <span>지급 수량</span>
                  <input className="input" type="number" min={1} max={1_000_000} value={currencyAmount} onChange={(event) => setCurrencyAmount(Number(event.target.value || 1))} />
                </label>
                <label className="field-label">
                  <span>메모</span>
                  <input className="input" value={currencyMemo} onChange={(event) => setCurrencyMemo(event.target.value)} placeholder="예: 출석 이벤트" />
                </label>
                <p className="notice small">{currencyTargetMode === "ONE" ? `선택 회원 현재 보유 ${currentCurrencyBalance.toLocaleString()}` : `전체 승인 일반 회원 ${approvedMembers.length.toLocaleString()}명 대상`}</p>
                <button className="btn btn-primary" style={fullButtonStyle} disabled={loading === "currency" || !currencyId || (currencyTargetMode === "ONE" && !currencyProfileId)}>
                  {loading === "currency" ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} 포인트 지급
                </button>
              </div>
            </form>

            <form style={actionBoxStyle} onSubmit={recoverCurrency}>
              <h3 className="panel-title"><RotateCcw size={18} /> 회수</h3>
              <div className="mt-4" style={compactActionsStyle}>
                <label className="field-label">
                  <span>포인트/화폐</span>
                  <select className="select" value={recoverCurrencyId} onChange={(event) => setRecoverCurrencyId(event.target.value)} required>
                    {activeCurrencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} · {currency.symbol}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  <span>회원</span>
                  <select className="select" value={recoverCurrencyProfileId} onChange={(event) => setRecoverCurrencyProfileId(event.target.value)} required>
                    {approvedMembers.map((member) => <option key={member.id} value={member.id}>{memberOptionLabel(member)}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  <span>회수 수량</span>
                  <input className="input" type="number" min={1} max={Math.max(1, recoverCurrencyBalance)} value={recoverCurrencyAmount} onChange={(event) => setRecoverCurrencyAmount(Number(event.target.value || 1))} />
                </label>
                <label className="field-label">
                  <span>회수 사유</span>
                  <input className="input" value={recoverCurrencyReason} onChange={(event) => setRecoverCurrencyReason(event.target.value)} placeholder="예: 잘못 지급" required />
                </label>
                <label className="field-label">
                  <span>메모</span>
                  <input className="input" value={recoverCurrencyMemo} onChange={(event) => setRecoverCurrencyMemo(event.target.value)} placeholder="예: 문의번호, 처리자 메모" />
                </label>
                <p className="notice small">회수 가능 {recoverCurrencyBalance.toLocaleString()}</p>
                <button className="btn btn-danger" style={fullButtonStyle} disabled={loading === "recover-currency" || !recoverCurrencyProfileId || !recoverCurrencyId || recoverCurrencyBalance < 1}>
                  {loading === "recover-currency" ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />} 포인트 회수
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <div style={pageGridStyle}>
        <section className="panel panel-pad">
          <h2 className="panel-title">화폐 설정</h2>
          <form className="form-grid mt-4" onSubmit={createCurrency}>
            <label className="field-label"><span>화폐명</span><input className="input" value={newCurrencyName} onChange={(event) => setNewCurrencyName(event.target.value)} /></label>
            <label className="field-label"><span>표기</span><input className="input" value={newCurrencySymbol} onChange={(event) => setNewCurrencySymbol(event.target.value)} /></label>
            <label className="field-label"><span>관리 코드</span><input className="input" value={newCurrencyCode} onChange={(event) => setNewCurrencyCode(event.target.value.toUpperCase())} placeholder="EVENT_POINT" /></label>
            <div className="table-actions"><button className="btn btn-secondary" style={fullButtonStyle} disabled={loading === "create-currency"}>{loading === "create-currency" ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} 화폐 만들기</button></div>
          </form>
          <div className="chips mt-4">
            {currencies.map((currency) => (
              <span className="chip" key={currency.id}>{currency.name} · {currency.symbol} · {currency.code} · {currency.is_active ? "사용" : "정지"}
                <button className="link-button" type="button" onClick={() => void toggleCurrency(currency)}>{currency.is_active ? "정지" : "복구"}</button>
                <button className="link-button danger" type="button" onClick={() => void deleteCurrency(currency)}>삭제</button>
              </span>
            ))}
            {!currencies.length && <p className="muted">화폐가 없습니다.</p>}
          </div>
        </section>

        <section className="panel panel-pad">
          <h2 className="panel-title">화폐 → 추첨권 교환 설정</h2>
          <form className="form-grid mt-4" onSubmit={createRate}>
            <label className="field-label"><span>대상 뽑기</span><select className="select" value={rateDrawId} onChange={(event) => setRateDrawId(event.target.value)}>{activeDraws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>)}</select></label>
            <label className="field-label"><span>사용 화폐</span><select className="select" value={rateCurrencyId} onChange={(event) => setRateCurrencyId(event.target.value)}>{activeCurrencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name}</option>)}</select></label>
            <label className="field-label"><span>차감 화폐</span><input className="input" type="number" min={1} value={currencyCost} onChange={(event) => setCurrencyCost(Number(event.target.value || 1))} /></label>
            <label className="field-label"><span>지급 추첨권</span><input className="input" type="number" min={1} value={ticketQuantity} onChange={(event) => setTicketQuantity(Number(event.target.value || 1))} /></label>
            <div className="table-actions"><button className="btn btn-secondary" style={fullButtonStyle} disabled={loading === "rate"}>{loading === "rate" ? <LoaderCircle size={16} className="spin" /> : <Repeat2 size={16} />} 교환 비율 만들기</button></div>
          </form>
          <div className="table-wrap mt-4">
            <table className="data-table">
              <thead><tr><th>뽑기</th><th>화폐</th><th>비율</th><th>상태</th><th>관리</th></tr></thead>
              <tbody>
                {exchangeRates.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.draw_name ?? rate.draw_id}</td>
                    <td>{rate.currency_name ?? rate.currency_id}</td>
                    <td>{rate.currency_cost.toLocaleString()}{rate.currency_symbol ? ` ${rate.currency_symbol}` : ""} → {rate.ticket_quantity.toLocaleString()}장</td>
                    <td>{rate.is_active ? "사용 중" : "정지"}</td>
                    <td>
                      <div className="table-actions compact">
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => void editRate(rate)}>수정</button>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => void toggleRate(rate)}>{rate.is_active ? "정지" : "복구"}</button>
                        <button className="btn btn-danger btn-sm" type="button" onClick={() => void deleteRate(rate)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!exchangeRates.length && <tr><td colSpan={5}>아직 교환 비율이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel panel-pad">
        <h2 className="panel-title"><WalletCards size={20} /> 보유 현황</h2>
        <div className="table-wrap mt-4">
          <table className="data-table">
            <thead><tr><th>구분</th><th>회원</th><th>대상</th><th>보유</th><th>최근 갱신</th></tr></thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={`${balance.profile_id}-${balance.draw_id}`}>
                  <td>추첨권</td>
                  <td>{balance.profile_name}<br /><small>{balance.member_code ?? "고유 ID 없음"} · {balance.profile_email}</small></td>
                  <td>{balance.draw_name}</td>
                  <td>{balance.quantity.toLocaleString()}장</td>
                  <td>{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td>
                </tr>
              ))}
              {currencyBalances.map((balance) => (
                <tr key={`${balance.profile_id}-${balance.currency_id}`}>
                  <td>포인트</td>
                  <td>{balance.profile_name}<br /><small>{balance.member_code ?? "고유 ID 없음"} · {balance.profile_email}</small></td>
                  <td>{balance.currency_name}</td>
                  <td>{balance.balance.toLocaleString()} {balance.currency_symbol}</td>
                  <td>{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td>
                </tr>
              ))}
              {!balances.length && !currencyBalances.length && <tr><td colSpan={5}>아직 지급된 내역이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title"><RotateCcw size={20} /> 최근 회수 기록</h2>
        <div className="table-wrap mt-4">
          <table className="data-table">
            <thead><tr><th>일시</th><th>구분</th><th>회원</th><th>대상</th><th>회수</th><th>이전→이후</th><th>사유</th><th>처리자</th></tr></thead>
            <tbody>
              {recoveryLogs.slice(0, 50).map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{recoveryKindLabel(log.kind)}</td>
                  <td>{log.profile_name ?? log.profile_id}<br /><small>{log.member_code ?? "고유 ID 없음"}</small></td>
                  <td>{log.kind === "TICKET" ? log.draw_name ?? log.draw_id : log.currency_name ?? log.currency_id}</td>
                  <td>{log.amount_recovered.toLocaleString()}</td>
                  <td>{log.balance_before.toLocaleString()} → {log.balance_after.toLocaleString()}</td>
                  <td>{log.reason}</td>
                  <td>{log.admin_name ?? "-"}</td>
                </tr>
              ))}
              {!recoveryLogs.length && <tr><td colSpan={8}>아직 회수 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
