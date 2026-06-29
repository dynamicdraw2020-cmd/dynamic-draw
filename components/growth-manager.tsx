/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Award, BadgeCheck, LoaderCircle, Medal, Plus, Sparkles, Star, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { displayLoginId } from "@/lib/identity";

type GrowthData = {
  members: Array<Record<string, any>>;
  draws: Array<Record<string, any>>;
  levels: Array<Record<string, any>>;
  drawExp: Array<Record<string, any>>;
  vipTiers: Array<Record<string, any>>;
  badges: Array<Record<string, any>>;
  profileBadges: Array<Record<string, any>>;
  growthRows: Array<Record<string, any>>;
  expLogs: Array<Record<string, any>>;
  currencies: Array<Record<string, any>>;
  rewards: Array<Record<string, any>>;
  boxes: Array<Record<string, any>>;
  memberTiers: Array<Record<string, any>>;
  profileMemberTiers: Array<Record<string, any>>;
};

const tabs = ["레벨", "뽑기 EXP", "VIP 등급", "회원 등급", "배지·휘장", "강제 EXP"] as const;

type Tab = typeof tabs[number];

async function postGrowth(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/growth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

function formPayload(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}

function memberLabel(member: Record<string, any>) {
  return `${member.display_name ?? "회원"} · ${displayLoginId(member as any)} · ${member.role ?? "USER"}${member.member_code ? ` · ${member.member_code}` : ""}`;
}

type RewardDraft = {
  id: string;
  type: "RANDOM_BOX" | "TICKET" | "CURRENCY" | "ITEM" | "EXP";
  amount: number;
  currencyId: string;
  drawId: string;
  rewardId: string;
  boxId: string;
  label: string;
};

function makeDraftId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function emptyRewardDraft(): RewardDraft {
  return { id: makeDraftId(), type: "RANDOM_BOX", amount: 1, currencyId: "", drawId: "", rewardId: "", boxId: "", label: "" };
}

function cleanRewardDrafts(rewards: RewardDraft[]) {
  return rewards
    .map((reward) => {
      const amount = Math.max(1, Math.floor(Number(reward.amount) || 1));
      const base: Record<string, any> = { type: reward.type, amount, label: reward.label || undefined };
      if (reward.type === "RANDOM_BOX") base.boxId = reward.boxId || undefined;
      if (reward.type === "TICKET") base.drawId = reward.drawId || undefined;
      if (reward.type === "CURRENCY") base.currencyId = reward.currencyId || undefined;
      if (reward.type === "ITEM") base.rewardId = reward.rewardId || undefined;
      return base;
    })
    .filter((reward) => {
      if (reward.type === "RANDOM_BOX") return Boolean(reward.boxId);
      if (reward.type === "TICKET") return Boolean(reward.drawId);
      if (reward.type === "CURRENCY") return Boolean(reward.currencyId);
      if (reward.type === "ITEM") return Boolean(reward.rewardId);
      if (reward.type === "EXP") return true;
      return false;
    });
}


function rewardDraftLabel(data: GrowthData, reward: RewardDraft) {
  const amount = Math.max(1, Math.floor(Number(reward.amount) || 1)).toLocaleString();
  if (reward.type === "RANDOM_BOX") return `${data.boxes.find((box) => box.id === reward.boxId)?.name ?? "랜덤박스"} ${amount}개`;
  if (reward.type === "TICKET") return `${data.draws.find((draw) => draw.id === reward.drawId)?.name ?? "뽑기"} 추첨권 ${amount}장`;
  if (reward.type === "CURRENCY") return `${data.currencies.find((currency) => currency.id === reward.currencyId)?.name ?? "화폐"} ${amount}`;
  if (reward.type === "ITEM") return `${data.rewards.find((item) => item.id === reward.rewardId)?.name ?? "상품"} ${amount}개`;
  if (reward.type === "EXP") return `경험치 ${amount}`;
  return `보상 ${amount}`;
}

function RewardBuilder({
  data,
  rewards,
  setRewards,
  fieldName,
  description,
}: {
  data: GrowthData;
  rewards: RewardDraft[];
  setRewards: (updater: (prev: RewardDraft[]) => RewardDraft[]) => void;
  fieldName: string;
  description: string;
}) {
  const payload = JSON.stringify(cleanRewardDrafts(rewards));
  return <div className="form-grid">
    <input type="hidden" name={fieldName} value={payload} />
    <div className="note-box">{description} 보상 종류를 고르면 저장 시 자동으로 내부 JSON으로 변환됩니다.</div>
    <div className="grid gap-2">
      {rewards.map((reward, index) => <div className="panel-soft form-grid" key={reward.id}>
        <div className="flex items-center justify-between gap-2">
          <strong>보상 {index + 1}</strong>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => setRewards((prev) => prev.length <= 1 ? [emptyRewardDraft()] : prev.filter((item) => item.id !== reward.id))}>삭제</button>
        </div>
        <div className="form-row">
          <div className="field">
            <label>보상 종류</label>
            <select className="select" value={reward.type} onChange={(event) => setRewards((prev) => prev.map((item) => item.id === reward.id ? { ...item, type: event.target.value as RewardDraft["type"] } : item))}>
              <option value="RANDOM_BOX">랜덤박스</option>
              <option value="TICKET">추첨권</option>
              <option value="CURRENCY">화폐</option>
              <option value="ITEM">보유 상품</option>
              <option value="EXP">경험치</option>
            </select>
          </div>
          <div className="field">
            <label>지급 수량</label>
            <input className="input" type="number" min="1" value={reward.amount} onChange={(event) => setRewards((prev) => prev.map((item) => item.id === reward.id ? { ...item, amount: Number(event.target.value || 1) } : item))} />
          </div>
        </div>
        {reward.type === "RANDOM_BOX" && <div className="field">
          <label>랜덤박스 선택</label>
          <select className="select" value={reward.boxId} onChange={(event) => setRewards((prev) => prev.map((item) => item.id === reward.id ? { ...item, boxId: event.target.value } : item))}>
            <option value="">선택 없음</option>
            {data.boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}
          </select>
        </div>}
        {reward.type === "TICKET" && <div className="field">
          <label>추첨권 대상 뽑기</label>
          <select className="select" value={reward.drawId} onChange={(event) => setRewards((prev) => prev.map((item) => item.id === reward.id ? { ...item, drawId: event.target.value } : item))}>
            <option value="">선택 없음</option>
            {data.draws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>)}
          </select>
        </div>}
        {reward.type === "CURRENCY" && <div className="field">
          <label>화폐 선택</label>
          <select className="select" value={reward.currencyId} onChange={(event) => setRewards((prev) => prev.map((item) => item.id === reward.id ? { ...item, currencyId: event.target.value } : item))}>
            <option value="">선택 없음</option>
            {data.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} · {currency.symbol}</option>)}
          </select>
        </div>}
        {reward.type === "ITEM" && <div className="field">
          <label>상품 선택</label>
          <select className="select" value={reward.rewardId} onChange={(event) => setRewards((prev) => prev.map((item) => item.id === reward.id ? { ...item, rewardId: event.target.value } : item))}>
            <option value="">선택 없음</option>
            {data.rewards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>}
        <div className="field">
          <label>표시명</label>
          <input className="input" value={reward.label} placeholder="예: 특별 보상" onChange={(event) => setRewards((prev) => prev.map((item) => item.id === reward.id ? { ...item, label: event.target.value } : item))} />
        </div>
      </div>)}
    </div>
    <div className="note-box">현재 설정 보상: {cleanRewardDrafts(rewards).length ? rewards.filter((reward) => cleanRewardDrafts([reward]).length).map((reward) => rewardDraftLabel(data, reward)).join(" · ") : "지급 보상 없음"}</div>
    <button className="btn btn-secondary" type="button" onClick={() => setRewards((prev) => [...prev, emptyRewardDraft()])}>+ 보상 추가</button>
  </div>;
}

export function GrowthManager({ data }: { data: GrowthData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("레벨");
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [levelRewards, setLevelRewards] = useState<RewardDraft[]>([emptyRewardDraft()]);
  const [vipRewards, setVipRewards] = useState<RewardDraft[]>([emptyRewardDraft()]);
  const [memberSearch, setMemberSearch] = useState("");
  const members = useMemo(() => data.members.filter((member) => member.status === "APPROVED"), [data.members]);
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => [member.display_name, displayLoginId(member as any), member.member_code ?? "", member.role ?? ""].some((value) => String(value).toLowerCase().includes(q)));
  }, [members, memberSearch]);

  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoading(action);
      setMessage(null);
      await postGrowth({ action, ...formPayload(form) });
      setMessage({ type: "success", text: success });
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." });
    } finally {
      setLoading(null);
    }
  }

  async function action(body: Record<string, unknown>, success: string) {
    try {
      setLoading(String(body.action));
      setMessage(null);
      await postGrowth(body);
      setMessage({ type: "success", text: success });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." });
    } finally {
      setLoading(null);
    }
  }

  return <div className="grid gap-3">
    {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
    <section className="panel panel-pad member-search-panel"><div className="field"><label>회원 검색</label><input className="input" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="닉네임, 아이디, 고유 ID, 권한 검색" /></div><p className="panel-description mt-1">등급 배정, 배지 지급, EXP 조정에서 검색된 회원만 표시됩니다. 검색 결과 {filteredMembers.length.toLocaleString()}명</p></section>
    <section className="panel panel-pad">
      <div className="reward-tabs" role="tablist" aria-label="성장 관리 카테고리">
        {tabs.map((item) => <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </div>
    </section>

    {tab === "레벨" && <>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "save-level", "레벨 설정을 저장했습니다.")}>
        <div className="flex items-center gap-1"><Star size={19} className="text-gold" /><h2 className="panel-title mb-0">레벨 기준 설정</h2></div>
        <p className="panel-description">레벨 번호, 필요 경험치, 레벨 이름, 레벨 달성 보상을 설정합니다.</p>
        <div className="form-row"><div className="field"><label>레벨</label><input className="input" name="levelNo" type="number" min="1" defaultValue="1" /></div><div className="field"><label>레벨명</label><input className="input" name="name" defaultValue="Lv.1" /></div><div className="field"><label>필요 EXP</label><input className="input" name="requiredExp" type="number" min="0" defaultValue="0" /></div></div>
        <div className="field"><label>설명</label><input className="input" name="description" placeholder="예: 시작 레벨" /></div>
        <div className="field"><label>레벨 달성 보상</label><RewardBuilder data={data} rewards={levelRewards} setRewards={setLevelRewards} fieldName="rewardsJson" description="레벨을 처음 달성했을 때 지급할 보상을 선택하세요." /></div>
        <button className="btn btn-primary" disabled={loading === "save-level"}>{loading === "save-level" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 레벨 저장</button>
      </form>
      <section className="panel panel-pad"><h2 className="panel-title">레벨 목록</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>레벨</th><th>필요 EXP</th><th>설명</th><th>관리</th></tr></thead><tbody>{data.levels.length ? data.levels.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><div className="text-muted text-small">Lv.{row.level_no}</div></td><td>{Number(row.required_exp ?? 0).toLocaleString()}</td><td>{row.description ?? "-"}</td><td><button className="btn btn-danger btn-sm" type="button" onClick={() => action({ action: "delete-level", id: row.id }, "레벨 설정을 삭제했습니다.")}>삭제</button></td></tr>) : <tr><td colSpan={4}><div className="empty">레벨 설정이 없습니다.</div></td></tr>}</tbody></table></div></section>
    </>}

    {tab === "뽑기 EXP" && <>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "save-draw-exp", "뽑기 EXP 설정을 저장했습니다.")}>
        <div className="flex items-center gap-1"><Sparkles size={19} className="text-gold" /><h2 className="panel-title mb-0">뽑기별 경험치</h2></div>
        <p className="panel-description">뽑기 결과가 공개되면 설정된 EXP가 자동 지급됩니다.</p>
        <div className="form-row"><div className="field"><label>뽑기</label><select className="select" name="drawId">{data.draws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>)}</select></div><div className="field"><label>1회당 EXP</label><input className="input" name="expPerDraw" type="number" min="0" defaultValue="10" /></div></div>
        <button className="btn btn-primary" disabled={loading === "save-draw-exp"}>{loading === "save-draw-exp" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 뽑기 EXP 저장</button>
      </form>
      <section className="panel panel-pad"><h2 className="panel-title">뽑기 EXP 현황</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>뽑기</th><th>EXP</th><th>관리</th></tr></thead><tbody>{data.drawExp.length ? data.drawExp.map((row) => { const draw = Array.isArray(row.draws) ? row.draws[0] : row.draws; return <tr key={row.draw_id}><td>{draw?.name ?? row.draw_id}</td><td>{Number(row.exp_per_draw ?? 0).toLocaleString()}</td><td><button className="btn btn-danger btn-sm" onClick={() => action({ action: "delete-draw-exp", drawId: row.draw_id }, "뽑기 EXP 설정을 삭제했습니다.")}>삭제</button></td></tr>; }) : <tr><td colSpan={3}><div className="empty">뽑기별 EXP 설정이 없습니다.</div></td></tr>}</tbody></table></div></section>
    </>}

    {tab === "VIP 등급" && <>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "save-vip", "VIP 등급을 저장했습니다.")}>
        <div className="flex items-center gap-1"><Trophy size={19} className="text-gold" /><h2 className="panel-title mb-0">VIP 등급 설정</h2></div>
        <p className="panel-description">등급명과 설명, 도달 조건, 최초 1회 특별 출석 보상을 설정합니다.</p>
        <div className="form-row"><div className="field"><label>등급명</label><input className="input" name="name" defaultValue="VIP" /></div><div className="field"><label>정렬</label><input className="input" name="sortOrder" type="number" defaultValue="10" /></div></div>
        <div className="field"><label>설명</label><input className="input" name="description" placeholder="예: 이벤트 활동 우수 회원" /></div>
        <div className="form-row"><div className="field"><label>필요 레벨</label><input className="input" name="thresholdLevel" type="number" min="1" defaultValue="1" /></div><div className="field"><label>필요 EXP</label><input className="input" name="thresholdExp" type="number" min="0" defaultValue="0" /></div></div>
        <div className="field"><label>최초 1회 특별 출석 보상</label><RewardBuilder data={data} rewards={vipRewards} setRewards={setVipRewards} fieldName="attendanceRewardJson" description="VIP 등급 도달 뒤 최초 출석 때 지급할 특별 보상을 선택하세요." /></div>
        <button className="btn btn-primary" disabled={loading === "save-vip"}>{loading === "save-vip" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} VIP 등급 저장</button>
      </form>
      <section className="panel panel-pad"><h2 className="panel-title">VIP 등급 현황</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>등급</th><th>조건</th><th>상태</th><th>관리</th></tr></thead><tbody>{data.vipTiers.length ? data.vipTiers.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><div className="text-muted text-small">{row.description ?? "설명 없음"}</div></td><td>Lv.{row.threshold_level} / {Number(row.threshold_exp ?? 0).toLocaleString()} EXP</td><td>{row.is_active ? "사용" : "정지"}</td><td><div className="table-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => action({ action: "toggle-vip", id: row.id, isActive: !row.is_active }, "VIP 상태를 변경했습니다.")}>{row.is_active ? "정지" : "복구"}</button><button className="btn btn-danger btn-sm" type="button" onClick={() => action({ action: "delete-vip", id: row.id }, "VIP 등급을 삭제했습니다.")}>삭제</button></div></td></tr>) : <tr><td colSpan={4}><div className="empty">VIP 등급이 없습니다.</div></td></tr>}</tbody></table></div></section>
    </>}

    {tab === "회원 등급" && <>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "save-member-tier", "회원 등급을 저장했습니다.")}>
        <div className="flex items-center gap-1"><Trophy size={19} className="text-gold" /><h2 className="panel-title mb-0">회원 등급 생성</h2></div>
        <p className="panel-description">관리자 권한과 별개로 일반 회원에게 부여할 운영 등급을 만듭니다. 커뮤니티 이용 가능 여부도 등급별로 설정합니다.</p>
        <div className="form-row"><div className="field"><label>등급명</label><input className="input" name="name" defaultValue="일반 회원" required /></div><div className="field"><label>표시 라벨</label><input className="input" name="badgeLabel" defaultValue="GENERAL" /></div><div className="field"><label>표시 색상</label><input className="input" name="badgeColor" defaultValue="#334155" /></div></div>
        <div className="field"><label>설명</label><input className="input" name="description" placeholder="예: 커뮤니티 참여 가능 회원 등급" /></div>
        <div className="form-row"><label className="check-row"><input type="checkbox" name="canUseCommunity" defaultChecked /> 커뮤니티 사용 가능</label><div className="field"><label>정렬</label><input className="input" name="sortOrder" type="number" defaultValue="10" /></div></div>
        <button className="btn btn-primary" disabled={loading === "save-member-tier"}>{loading === "save-member-tier" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 회원 등급 저장</button>
      </form>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "assign-member-tier", "회원 등급을 배정했습니다.")}>
        <div className="flex items-center gap-1"><BadgeCheck size={19} className="text-gold" /><h2 className="panel-title mb-0">회원별 등급 배정</h2></div>
        <div className="form-row"><div className="field"><label>회원</label><select className="select" name="profileId">{filteredMembers.map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</select></div><div className="field"><label>회원 등급</label><select className="select" name="tierId">{data.memberTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name} · {tier.can_use_community ? "커뮤니티 가능" : "커뮤니티 제한"}</option>)}</select></div></div>
        <button className="btn btn-primary" disabled={loading === "assign-member-tier"}>{loading === "assign-member-tier" ? <LoaderCircle size={17} className="spin" /> : <Award size={17} />} 등급 배정</button>
      </form>
      <section className="panel panel-pad"><h2 className="panel-title">회원 등급 현황</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>등급</th><th>커뮤니티</th><th>설명</th><th>관리</th></tr></thead><tbody>{data.memberTiers.length ? data.memberTiers.map((tier) => <tr key={tier.id}><td><strong>{tier.name}</strong><div className="text-muted text-small">{tier.badge_label ?? "라벨 없음"}</div></td><td>{tier.can_use_community ? "사용 가능" : "제한"}</td><td>{tier.description ?? "-"}</td><td><button className="btn btn-danger btn-sm" onClick={() => action({ action: "delete-member-tier", id: tier.id }, "회원 등급을 삭제했습니다.")}>삭제</button></td></tr>) : <tr><td colSpan={4}><div className="empty">회원 등급이 없습니다.</div></td></tr>}</tbody></table></div></section>
      <section className="panel panel-pad"><h2 className="panel-title">배정 내역</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>회원</th><th>등급</th><th>커뮤니티</th><th>관리</th></tr></thead><tbody>{data.profileMemberTiers.length ? data.profileMemberTiers.map((row) => { const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; const tier = Array.isArray(row.tier) ? row.tier[0] : row.tier; return <tr key={`${row.profile_id}-${row.tier_id}`}><td>{p?.display_name ?? row.profile_id}<div className="text-muted text-small">{p?.member_code ?? ""}</div></td><td>{tier?.name ?? row.tier_id}</td><td>{tier?.can_use_community ? "사용 가능" : "제한"}</td><td><button className="btn btn-danger btn-sm" onClick={() => action({ action: "remove-member-tier", profileId: row.profile_id, tierId: row.tier_id }, "회원 등급을 해제했습니다.")}>해제</button></td></tr>; }) : <tr><td colSpan={4}><div className="empty">등급 배정 내역이 없습니다.</div></td></tr>}</tbody></table></div></section>
    </>}

    {tab === "배지·휘장" && <>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "save-badge", "배지/휘장을 저장했습니다.")}>
        <div className="flex items-center gap-1"><Medal size={19} className="text-gold" /><h2 className="panel-title mb-0">배지·휘장 만들기</h2></div>
        <div className="form-row"><div className="field"><label>이름</label><input className="input" name="name" defaultValue="EVENT VIP" /></div><div className="field"><label>아이콘</label><input className="input" name="icon" defaultValue="🏅" /></div><div className="field"><label>색상</label><input className="input" name="labelColor" defaultValue="#111827" /></div></div>
        <div className="field"><label>설명</label><input className="input" name="description" placeholder="활동 휘장 설명" /></div>
        <button className="btn btn-primary" disabled={loading === "save-badge"}>{loading === "save-badge" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 배지 저장</button>
      </form>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "grant-badge", "회원에게 배지를 지급했습니다.")}>
        <div className="flex items-center gap-1"><BadgeCheck size={19} className="text-gold" /><h2 className="panel-title mb-0">회원 배지 지급</h2></div>
        <div className="form-row"><div className="field"><label>회원</label><select className="select" name="profileId">{filteredMembers.map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</select></div><div className="field"><label>배지</label><select className="select" name="badgeId">{data.badges.map((badge) => <option key={badge.id} value={badge.id}>{badge.icon} {badge.name}</option>)}</select></div></div>
        <button className="btn btn-primary" disabled={loading === "grant-badge"}>{loading === "grant-badge" ? <LoaderCircle size={17} className="spin" /> : <Award size={17} />} 배지 지급</button>
      </form>
      <section className="panel panel-pad"><h2 className="panel-title">배지 현황</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>배지</th><th>설명</th><th>관리</th></tr></thead><tbody>{data.badges.length ? data.badges.map((badge) => <tr key={badge.id}><td><strong>{badge.icon} {badge.name}</strong></td><td>{badge.description ?? "-"}</td><td><button className="btn btn-danger btn-sm" onClick={() => action({ action: "delete-badge", id: badge.id }, "배지를 삭제했습니다.")}>삭제</button></td></tr>) : <tr><td colSpan={3}><div className="empty">배지가 없습니다.</div></td></tr>}</tbody></table></div></section>
    </>}

    {tab === "강제 EXP" && <>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "adjust-exp", "EXP를 조정했습니다.")}>
        <div className="flex items-center gap-1"><Sparkles size={19} className="text-gold" /><h2 className="panel-title mb-0">경험치 강제 지급/회수</h2></div>
        <div className="form-row"><div className="field"><label>회원</label><select className="select" name="profileId">{filteredMembers.map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</select></div><div className="field"><label>지급/회수 EXP</label><input className="input" name="amount" type="number" defaultValue="100" /></div></div>
        <div className="field"><label>사유</label><input className="input" name="reason" defaultValue="관리자 EXP 조정" /></div>
        <button className="btn btn-primary" disabled={loading === "adjust-exp"}>{loading === "adjust-exp" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} EXP 조정</button>
      </form>
      <section className="panel panel-pad"><h2 className="panel-title">성장 현황</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>회원</th><th>레벨</th><th>EXP</th><th>VIP</th></tr></thead><tbody>{data.growthRows.length ? data.growthRows.map((row) => { const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; return <tr key={row.profile_id}><td>{p?.display_name ?? row.profile_id}<div className="text-muted text-small">{p?.member_code ?? ""}</div></td><td>Lv.{row.level_no}</td><td>{Number(row.exp_total ?? 0).toLocaleString()}</td><td>{row.vip_tier_id ? "설정됨" : "-"}</td></tr>; }) : <tr><td colSpan={4}><div className="empty">성장 기록이 없습니다.</div></td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}
