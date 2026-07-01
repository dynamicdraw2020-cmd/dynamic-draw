"use client";

import { Coins, LoaderCircle, Ticket, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { AdminCurrencyBalance, AdminTicketBalance, Draw, Profile, VirtualCurrency } from "@/lib/types";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

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

export function CsGrantManager({
  draws,
  members,
  balances,
  currencies,
  currencyBalances,
}: {
  draws: Draw[];
  members: Profile[];
  balances: AdminTicketBalance[];
  currencies: VirtualCurrency[];
  currencyBalances: AdminCurrencyBalance[];
}) {
  const router = useRouter();
  const activeDraws = draws.filter((draw) => draw.status !== "ENDED");
  const approvedMembers = members.filter((member) => member.status === "APPROVED");
  const activeCurrencies = currencies.filter((currency) => currency.is_active);

  const [profileId, setProfileId] = useState(approvedMembers[0]?.id ?? "");
  const [drawId, setDrawId] = useState(activeDraws[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");
  const [currencyId, setCurrencyId] = useState(activeCurrencies[0]?.id ?? "");
  const [currencyAmount, setCurrencyAmount] = useState(100);
  const [currencyMemo, setCurrencyMemo] = useState("");
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

  return (
    <div className="stack-xl">
      <section className="panel panel-pad">
        <div className="section-head">
          <div>
            <h2 className="panel-title">CS 지급 콘솔</h2>
            <p className="muted">CS매니저는 승인된 회원 1명에게만 추첨권과 포인트를 지급할 수 있습니다. 전체 지급과 화폐 설정은 일반 관리자 이상 전용입니다.</p>
          </div>
        </div>

        <label className="field-label mt-4">
          <span>대상 회원</span>
          <select className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {approvedMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name} · {displayLoginId(member)} · {member.member_code ?? "고유 ID 없음"}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title"><Ticket size={20} /> 추첨권 지급</h2>
        <form className="form-grid mt-4" onSubmit={submitTickets}>
          <label className="field-label">
            <span>뽑기</span>
            <select className="select" value={drawId} onChange={(event) => setDrawId(event.target.value)} required>
              {activeDraws.map((draw) => (
                <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>지급 수량</span>
            <input className="input" type="number" min={1} max={1000} value={quantity} onChange={(event) => setQuantity(Number(event.target.value || 1))} />
          </label>
          <label className="field-label">
            <span>메모</span>
            <input className="input" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="예: 문의 보상" />
          </label>
          <p className="muted">{selectedMember?.display_name ?? "회원"} 현재 보유 {currentTicketBalance.toLocaleString()}장</p>
          <button className="btn btn-primary" disabled={loading === "tickets"}>
            {loading === "tickets" ? <LoaderCircle size={16} className="spin" /> : <Ticket size={16} />} 추첨권 지급
          </button>
        </form>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title"><Coins size={20} /> 포인트 지급</h2>
        <form className="form-grid mt-4" onSubmit={submitCurrency}>
          <label className="field-label">
            <span>포인트/화폐</span>
            <select className="select" value={currencyId} onChange={(event) => setCurrencyId(event.target.value)} required>
              {activeCurrencies.map((currency) => (
                <option key={currency.id} value={currency.id}>{currency.name} · {currency.symbol}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>지급 수량</span>
            <input className="input" type="number" min={1} max={1_000_000} value={currencyAmount} onChange={(event) => setCurrencyAmount(Number(event.target.value || 1))} />
          </label>
          <label className="field-label">
            <span>메모</span>
            <input className="input" value={currencyMemo} onChange={(event) => setCurrencyMemo(event.target.value)} placeholder="예: 고객센터 보상" />
          </label>
          <p className="muted">{selectedMember?.display_name ?? "회원"} 현재 보유 {currentCurrencyBalance.toLocaleString()}</p>
          <button className="btn btn-primary" disabled={loading === "currency"}>
            {loading === "currency" ? <LoaderCircle size={16} className="spin" /> : <Coins size={16} />} 포인트 지급
          </button>
        </form>
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title"><WalletCards size={20} /> 최근 지급 현황</h2>
        <div className="table-wrap mt-4">
          <table className="data-table">
            <thead><tr><th>회원</th><th>뽑기/화폐</th><th>보유</th><th>최근 갱신</th></tr></thead>
            <tbody>
              {balances.slice(0, 20).map((balance) => (
                <tr key={`${balance.profile_id}-${balance.draw_id}`}>
                  <td>{balance.profile_name}<br /><small>{balance.member_code ?? "고유 ID 없음"}</small></td>
                  <td>{balance.draw_name}</td>
                  <td>{balance.quantity.toLocaleString()}장</td>
                  <td>{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td>
                </tr>
              ))}
              {currencyBalances.slice(0, 20).map((balance) => (
                <tr key={`${balance.profile_id}-${balance.currency_id}`}>
                  <td>{balance.profile_name}<br /><small>{balance.member_code ?? "고유 ID 없음"}</small></td>
                  <td>{balance.currency_name}</td>
                  <td>{balance.balance.toLocaleString()} {balance.currency_symbol}</td>
                  <td>{balance.updated_at ? formatDateTime(balance.updated_at) : "-"}</td>
                </tr>
              ))}
              {!balances.length && !currencyBalances.length && (
                <tr><td colSpan={4}>아직 지급 현황이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
