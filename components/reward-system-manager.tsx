"use client";

import { CalendarCheck2, Gift, LoaderCircle, Plus, Settings, Ticket, Trash2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { AdminRewardSystemData, PromoCode, RandomBoxReward } from "@/lib/types";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

async function postAdmin(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/reward-system", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

function formPayload(form: HTMLFormElement) {
  const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
  return {
    ...data,
    isSignupReward: data.isSignupReward === "on",
    isActive: data.isActive === "true",
    amount: Number(data.amount || 1),
    rewardAmount: Number(data.rewardAmount || 1),
    signupBoxAmount: Number(data.signupBoxAmount || 1),
    referralReferrerBoxAmount: Number(data.referralReferrerBoxAmount || 0),
    referralReferredBoxAmount: Number(data.referralReferredBoxAmount || 0),
    probabilityPercent: Number(data.probabilityPercent || 0),
    requiredCount: Number(data.requiredCount || 1),
    sortOrder: Number(data.sortOrder || 10),
    maxUses: data.maxUses ? Number(data.maxUses) : null,
    perUserLimit: Number(data.perUserLimit || 1),
  };
}

function RewardTargetFields({ data, prefix = "" }: { data: AdminRewardSystemData; prefix?: string }) {
  return <div className="form-grid reward-target-fields"><div className="form-row"><div className="field"><label>보상 종류</label><select className="select" name={`${prefix}rewardType`} defaultValue="RANDOM_BOX"><option value="RANDOM_BOX">랜덤박스</option><option value="CURRENCY">화폐</option><option value="TICKET">추첨권</option><option value="ITEM">보유 상품</option><option value="EXP">경험치 예약</option></select></div><div className="field"><label>보상 수량</label><input className="input" name={`${prefix}rewardAmount`} type="number" min="1" defaultValue="1" /></div></div><div className="form-row"><div className="field"><label>화폐</label><select className="select" name={`${prefix}currencyId`}><option value="">선택 없음</option>{data.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} · {currency.symbol}</option>)}</select></div><div className="field"><label>뽑기</label><select className="select" name={`${prefix}drawId`}><option value="">선택 없음</option>{data.draws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>)}</select></div></div><div className="form-row"><div className="field"><label>상품</label><select className="select" name={`${prefix}rewardId`}><option value="">선택 없음</option>{data.rewards.map((reward) => <option key={reward.id} value={reward.id}>{reward.name}</option>)}</select></div><div className="field"><label>랜덤박스</label><select className="select" name={`${prefix}rewardBoxId`}><option value="">선택 없음</option>{data.boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}</select></div></div><div className="field"><label>표시명</label><input className="input" name={`${prefix}rewardLabel`} placeholder="예: 가입 축하 박스" /></div></div>;
}

function describeBoxReward(row: RandomBoxReward) {
  if (row.reward_type === "CURRENCY") return `${row.currency_name ?? "화폐"} ${row.amount.toLocaleString()}`;
  if (row.reward_type === "TICKET") return `${row.draw_name ?? "뽑기"} 추첨권 ${row.amount.toLocaleString()}장`;
  if (row.reward_type === "ITEM") return `${row.reward_name ?? "상품"} ${row.amount.toLocaleString()}개`;
  if (row.reward_type === "RANDOM_BOX") return `${row.random_box_name ?? "랜덤박스"} ${row.amount.toLocaleString()}개`;
  return `경험치 ${row.amount.toLocaleString()}`;
}

export function RewardSystemManager({ data }: { data: AdminRewardSystemData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const approvedMembers = useMemo(() => data.members.filter((member) => member.status === "APPROVED"), [data.members]);

  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoading(action);
      setMessage(null);
      await postAdmin({ action, ...formPayload(form) });
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
      await postAdmin(body);
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

    <section className="panel panel-pad">
      <div className="flex items-center gap-1"><Settings size={19} className="text-gold" /><h2 className="panel-title mb-0">추천·가입 보상 설정</h2></div>
      <p className="panel-description mt-1">관리자 승인 완료 시 회원가입 보상, 추천한 회원 보상, 추천받은 회원 보상을 각각 따로 설정할 수 있습니다. 수량을 0으로 두면 지급하지 않습니다.</p>
      <form className="form-grid mt-3" onSubmit={(event) => submit(event, "save-settings", "추천·가입 보상 설정을 저장했습니다.")}>
        <div className="form-row">
          <div className="field">
            <label>회원가입 승인 보상 박스</label>
            <select className="select" name="signupBoxId" defaultValue={data.settings.signupBoxId ?? ""}>
              <option value="">사용 안 함</option>
              {data.boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>지급 수량</label>
            <input className="input" name="signupBoxAmount" type="number" min="0" max="999" defaultValue={data.settings.signupBoxAmount ?? 1} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>추천한 회원 보상 박스</label>
            <select className="select" name="referralReferrerBoxId" defaultValue={data.settings.referralReferrerBoxId ?? ""}>
              <option value="">사용 안 함</option>
              {data.boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>지급 수량</label>
            <input className="input" name="referralReferrerBoxAmount" type="number" min="0" max="999" defaultValue={data.settings.referralReferrerBoxAmount ?? 0} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>추천받은 회원 보상 박스</label>
            <select className="select" name="referralReferredBoxId" defaultValue={data.settings.referralReferredBoxId ?? ""}>
              <option value="">사용 안 함</option>
              {data.boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>지급 수량</label>
            <input className="input" name="referralReferredBoxAmount" type="number" min="0" max="999" defaultValue={data.settings.referralReferredBoxAmount ?? 0} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={loading === "save-settings"}>{loading === "save-settings" ? <LoaderCircle size={17} className="spin" /> : <Settings size={17} />} 설정 저장</button>
      </form>
    </section>

    <div className="grid grid-2">
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-box", "랜덤박스를 만들었습니다.")}><div className="flex items-center gap-1"><Gift size={19} className="text-gold" /><h2 className="panel-title mb-0">랜덤박스 생성</h2></div><div className="field"><label>박스명</label><input className="input" name="name" defaultValue="가입 축하 랜덤박스" required minLength={2} /></div><div className="field"><label>설명</label><textarea className="textarea" name="description" rows={3} placeholder="신규 회원 또는 이벤트 보상으로 지급되는 랜덤박스" /></div><label className="check-row"><input type="checkbox" name="isSignupReward" /> 가입 보상 후보로 표시</label><button className="btn btn-primary" disabled={loading === "create-box"}>{loading === "create-box" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 박스 만들기</button></form>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "add-box-reward", "랜덤박스 보상을 추가했습니다.")}><div className="flex items-center gap-1"><Gift size={19} className="text-gold" /><h2 className="panel-title mb-0">박스 보상 추가</h2></div><div className="form-row"><div className="field"><label>대상 박스</label><select className="select" name="boxId" required>{data.boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}</select></div><div className="field"><label>확률(%)</label><input className="input" name="probabilityPercent" type="number" min="0.001" max="100" step="0.001" defaultValue="100" /></div></div><RewardTargetFields data={data} /><button className="btn btn-secondary" disabled={loading === "add-box-reward"}>{loading === "add-box-reward" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 보상 추가</button></form>
    </div>

    <section className="panel panel-pad"><h2 className="panel-title">랜덤박스 현황</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>박스</th><th>보상</th><th>확률</th><th>관리</th></tr></thead><tbody>{data.boxes.length ? data.boxes.map((box) => { const rewards = data.boxRewards.filter((reward) => reward.box_id === box.id); return <tr key={box.id}><td><strong>{box.name}</strong><div className="text-muted text-small">{box.is_active ? "사용 중" : "정지"} · {box.description ?? "설명 없음"}</div></td><td>{rewards.length ? rewards.map((reward) => <div key={reward.id}>{describeBoxReward(reward)} <button className="mini-link danger" type="button" onClick={() => action({ action: "delete-box-reward", rewardRowId: reward.id }, "보상을 삭제했습니다.")}>삭제</button></div>) : <span className="text-muted">보상 없음</span>}</td><td>{rewards.reduce((sum, reward) => sum + reward.probability_units, 0) / 10000}%</td><td><div className="table-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => action({ action: "toggle-box", boxId: box.id, isActive: !box.is_active }, "박스 상태를 변경했습니다.")}>{box.is_active ? "정지" : "복구"}</button><button className="btn btn-danger btn-sm" type="button" onClick={() => confirm("랜덤박스를 삭제할까요?") && action({ action: "delete-box", boxId: box.id }, "랜덤박스를 삭제했습니다.")}><Trash2 size={14} /> 삭제</button></div></td></tr>; }) : <tr><td colSpan={4}><div className="empty">랜덤박스가 없습니다.</div></td></tr>}</tbody></table></div></section>

    <div className="grid grid-2">
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-attendance-rule", "출석 보상 규칙을 만들었습니다.")}><div className="flex items-center gap-1"><CalendarCheck2 size={19} className="text-gold" /><h2 className="panel-title mb-0">출석 보상 규칙</h2></div><div className="form-row"><div className="field"><label>규칙명</label><input className="input" name="name" defaultValue="매일 출석 보상" /></div><div className="field"><label>종류</label><select className="select" name="ruleType"><option value="DAILY">매일</option><option value="STREAK">연속 출석</option><option value="MONTHLY">월간 누적</option></select></div><div className="field"><label>필요 일수</label><input className="input" name="requiredCount" type="number" min="1" defaultValue="1" /></div></div><RewardTargetFields data={data} /><button className="btn btn-primary" disabled={loading === "create-attendance-rule"}>{loading === "create-attendance-rule" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 출석 규칙 추가</button></form>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "force-attendance", "강제 출석을 처리했습니다.")}><div className="flex items-center gap-1"><UserCheck size={19} className="text-gold" /><h2 className="panel-title mb-0">관리자 강제 출석</h2></div><div className="field"><label>회원</label><select className="select" name="profileId">{approvedMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {displayLoginId(member)}</option>)}</select></div><div className="field"><label>출석 날짜</label><input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div><div className="table-actions"><button className="btn btn-secondary" disabled={loading === "force-attendance"}>{loading === "force-attendance" ? <LoaderCircle size={17} className="spin" /> : <CalendarCheck2 size={17} />} 출석 처리</button><button className="btn btn-danger" type="button" onClick={(event) => { const form = event.currentTarget.closest("form") as HTMLFormElement; action({ action: "cancel-attendance", ...formPayload(form) }, "출석을 취소했습니다."); }}>출석 취소</button></div></form>
    </div>
    <section className="panel panel-pad"><h2 className="panel-title">출석 규칙 목록</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>규칙</th><th>조건</th><th>관리</th></tr></thead><tbody>{data.attendanceRules.length ? data.attendanceRules.map((rule) => <tr key={rule.id}><td>{rule.name}</td><td>{rule.rule_type} · {rule.required_count}일</td><td><button className="btn btn-danger btn-sm" type="button" onClick={() => action({ action: "delete-attendance-rule", ruleId: rule.id }, "출석 규칙을 삭제했습니다.")}>삭제</button></td></tr>) : <tr><td colSpan={3}><div className="empty">출석 규칙이 없습니다.</div></td></tr>}</tbody></table></div></section>

    <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-promo-code", "쿠폰/이벤트 코드를 만들었습니다.")}><div className="flex items-center gap-1"><Ticket size={19} className="text-gold" /><h2 className="panel-title mb-0">쿠폰 / 이벤트 코드 생성</h2></div><div className="form-row"><div className="field"><label>코드</label><input className="input" name="code" placeholder="DYNAMICOPEN" required /></div><div className="field"><label>이름</label><input className="input" name="name" defaultValue="오픈 이벤트 코드" required /></div><div className="field"><label>구분</label><select className="select" name="codeType"><option value="COUPON">쿠폰</option><option value="EVENT_CODE">이벤트 코드</option></select></div></div><div className="field"><label>설명</label><input className="input" name="description" placeholder="공지에 표시할 설명" /></div><div className="form-row"><div className="field"><label>대상</label><select className="select" name="targetMode"><option value="ALL">전체</option><option value="PROFILE">특정 회원</option><option value="ROLE">권한</option></select></div><div className="field"><label>특정 회원</label><select className="select" name="targetProfileId"><option value="">선택 없음</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {displayLoginId(member)}</option>)}</select></div><div className="field"><label>권한</label><select className="select" name="targetRole"><option value="">선택 없음</option><option value="USER">일반 회원</option><option value="VIEWER">조회 관리자</option><option value="MANAGER">운영 관리자</option><option value="SUPER_ADMIN">최고 관리자</option></select></div></div><div className="form-row"><div className="field"><label>시작</label><input className="input" type="datetime-local" name="startsAt" /></div><div className="field"><label>종료</label><input className="input" type="datetime-local" name="endsAt" /></div><div className="field"><label>전체 사용 제한</label><input className="input" name="maxUses" type="number" min="1" placeholder="무제한" /></div><div className="field"><label>1인 제한</label><input className="input" name="perUserLimit" type="number" min="1" defaultValue="1" /></div></div><RewardTargetFields data={data} /><button className="btn btn-primary" disabled={loading === "create-promo-code"}>{loading === "create-promo-code" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 코드 만들기</button></form>

    <section className="panel panel-pad"><h2 className="panel-title">쿠폰 / 이벤트 코드 현황</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>코드</th><th>대상</th><th>사용</th><th>기간</th><th>관리</th></tr></thead><tbody>{data.promoCodes.length ? data.promoCodes.map((code: PromoCode) => <tr key={code.id}><td><strong>{code.code}</strong><div className="text-muted text-small">{code.name} · {code.code_type}</div></td><td>{code.target_mode}{code.target_profile_name ? ` · ${code.target_profile_name}` : ""}{code.target_role ? ` · ${code.target_role}` : ""}</td><td>{code.used_count.toLocaleString()} / {code.max_uses?.toLocaleString() ?? "무제한"}</td><td>{code.starts_at ? formatDateTime(code.starts_at) : "즉시"} ~ {code.ends_at ? formatDateTime(code.ends_at) : "무기한"}</td><td><div className="table-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => action({ action: "toggle-promo-code", codeId: code.id, isActive: !code.is_active }, "코드 상태를 변경했습니다.")}>{code.is_active ? "정지" : "복구"}</button><button className="btn btn-danger btn-sm" type="button" onClick={() => action({ action: "delete-promo-code", codeId: code.id }, "코드를 삭제했습니다.")}>삭제</button></div></td></tr>) : <tr><td colSpan={5}><div className="empty">생성된 코드가 없습니다.</div></td></tr>}</tbody></table></div></section>
  </div>;
}
