"use client";

import { LoaderCircle, Plus, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { AdminCouponVisibilityData } from "@/lib/coupon-visibility";
import { COUPON_VISIBILITY_HELP, COUPON_VISIBILITY_LABELS, STEP_REWARD_LABELS, STEP_REWARD_TYPES, type CouponVisibility } from "@/lib/step-event-config";
import { formatDateTime } from "@/lib/utils";

type ApiPayload = { ok?: boolean; data?: unknown; error?: { message?: string } };

function formPayload(form: HTMLFormElement) {
  const data = Object.fromEntries(new FormData(form).entries()) as Record<string, FormDataEntryValue>;
  return {
    ...data,
    rewardAmount: Number(data.rewardAmount || 1),
    maxUses: data.maxUses ? Number(data.maxUses) : null,
    perUserLimit: Number(data.perUserLimit || 1),
  };
}

async function postAdmin(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/coupons", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload;
  if (!response.ok) throw new Error(payload.error?.message ?? "요청을 처리하지 못했습니다.");
  return payload.data ?? payload;
}

function visibilityBadge(value: CouponVisibility) {
  return `${COUPON_VISIBILITY_LABELS[value]} · ${COUPON_VISIBILITY_HELP[value]}`;
}

export function CouponVisibilityManager({ data }: { data: AdminCouponVisibilityData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      setMessage({ type: "error", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  async function run(body: Record<string, unknown>, success: string) {
    try {
      setLoading(String(body.action));
      setMessage(null);
      await postAdmin(body);
      setMessage({ type: "success", text: success });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="form-grid">
      {message && <div className={`form-message ${message.type}`}>{message.text}</div>}
      {data.loadError && <div className="form-message error">쿠폰 목록 DB 오류: {data.loadError}</div>}

      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-coupon", "쿠폰을 만들었습니다.")}>
        <div className="flex items-center gap-1"><Plus size={19} className="text-gold" /><h2 className="panel-title mb-0">쿠폰 생성</h2></div>
        <div className="form-row">
          <div className="field"><label>코드</label><input className="input" name="code" required placeholder="DYNAMICOPEN" /></div>
          <div className="field"><label>쿠폰명</label><input className="input" name="name" required defaultValue="이벤트 쿠폰" /></div>
          <div className="field"><label>구분</label><select className="select" name="codeType" defaultValue="COUPON"><option value="COUPON">쿠폰</option><option value="EVENT_CODE">이벤트 코드</option></select></div>
          <div className="field"><label>공개 여부</label><select className="select" name="visibility" defaultValue="public"><option value="public">공개</option><option value="hidden">숨김</option><option value="admin_only">관리자 전용</option><option value="event_only">이벤트 전용</option></select></div>
        </div>
        <div className="field"><label>설명</label><input className="input" name="description" placeholder="보상센터 또는 운영 메모에 표시할 설명" /></div>
        <div className="form-row">
          <div className="field"><label>시작</label><input className="input" type="datetime-local" name="startsAt" /></div>
          <div className="field"><label>종료</label><input className="input" type="datetime-local" name="endsAt" /></div>
          <div className="field"><label>전체 사용 제한</label><input className="input" name="maxUses" type="number" min="1" placeholder="무제한" /></div>
          <div className="field"><label>1인 제한</label><input className="input" name="perUserLimit" type="number" min="1" defaultValue="1" /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>보상 타입</label><select className="select" name="rewardType" defaultValue="EXP">{STEP_REWARD_TYPES.filter((type) => ["CURRENCY", "TICKET", "ITEM", "RANDOM_BOX", "EXP"].includes(type)).map((type) => <option key={type} value={type}>{STEP_REWARD_LABELS[type]}</option>)}</select></div>
          <div className="field"><label>수량</label><input className="input" name="rewardAmount" type="number" min="1" defaultValue="1" /><small>처음 테스트는 EXP가 가장 안전합니다. 포인트/뽑기/상품/랜덤박스는 아래 대상을 선택하세요.</small></div>
        </div>
        <div className="form-row">
          <div className="field"><label>화폐/포인트</label><select className="select" name="currencyId"><option value="">선택 없음</option>{data.resources.currencies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label>뽑기</label><select className="select" name="drawId"><option value="">선택 없음</option>{data.resources.draws.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label>아이템/상품</label><select className="select" name="rewardId"><option value="">선택 없음</option>{data.resources.rewards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label>랜덤박스</label><select className="select" name="boxId"><option value="">선택 없음</option>{data.resources.boxes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        </div>
        <div className="field"><label>추가 보상 JSON</label><textarea className="textarea" name="extraRewardsJson" rows={3} placeholder='[{"type":"TICKET","amount":3,"drawId":"..."}]' /></div>
        <button className="btn btn-primary" disabled={loading === "create-coupon"}>{loading === "create-coupon" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 쿠폰 만들기</button>
      </form>

      <section className="panel panel-pad">
        <h2 className="panel-title">쿠폰 공개 상태</h2>
        <div className="table-wrap mt-3">
          <table className="table">
            <thead><tr><th>쿠폰</th><th>공개 여부</th><th>사용</th><th>기간</th><th>관리</th></tr></thead>
            <tbody>
              {data.coupons.length ? data.coupons.map((coupon) => (
                <tr key={coupon.id}>
                  <td><strong>{coupon.code}</strong><div className="text-muted text-small">{coupon.name} · {coupon.code_type}</div></td>
                  <td><strong>{COUPON_VISIBILITY_LABELS[coupon.visibility]}</strong><div className="text-muted text-small">{visibilityBadge(coupon.visibility)}</div></td>
                  <td>{coupon.used_count.toLocaleString()} / {coupon.max_uses?.toLocaleString() ?? "무제한"}<br />{coupon.is_active ? "사용 중" : "정지"}</td>
                  <td>{coupon.starts_at ? formatDateTime(coupon.starts_at) : "즉시"}<br />~ {coupon.ends_at ? formatDateTime(coupon.ends_at) : "무기한"}</td>
                  <td>
                    <div className="table-actions">
                      <select className="select" defaultValue={coupon.visibility} onChange={(event) => run({ action: "update-visibility", codeId: coupon.id, visibility: event.target.value }, "공개 상태를 변경했습니다.")}>
                        <option value="public">공개</option>
                        <option value="hidden">숨김</option>
                        <option value="admin_only">관리자 전용</option>
                        <option value="event_only">이벤트 전용</option>
                      </select>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => run({ action: "toggle-coupon", codeId: coupon.id, isActive: !coupon.is_active }, "쿠폰 상태를 변경했습니다.")}><Settings size={14} /> {coupon.is_active ? "정지" : "복구"}</button>
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => confirm("쿠폰을 삭제 처리할까요?") && run({ action: "delete-coupon", codeId: coupon.id }, "쿠폰을 삭제했습니다.")}><Trash2 size={14} /> 삭제</button>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={5}><div className="empty">쿠폰이 없습니다.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
