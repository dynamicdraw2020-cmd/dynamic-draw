"use client";

import { Bell, CalendarCheck2, Copy, Gift, LoaderCircle, Send, Ticket, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { PromoCode, RewardCenterData } from "@/lib/types";
import { normalizeCouponVisibility } from "@/lib/step-event-config";
import { formatDateTime } from "@/lib/utils";

async function postJson(url: string, body: unknown = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "요청을 처리하지 못했습니다.");
  return payload.data ?? payload;
}

type BoxEntry = RewardCenterData["boxes"][number];

function describeReward(reward: Record<string, unknown> | null | undefined) {
  if (!reward) return "보상 지급";
  const direct = reward.displayLabel ?? reward.displayName ?? reward.display_text ?? reward.name;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const rawType = String(reward.type ?? reward.reward_type ?? "").toUpperCase();
  const amount = Math.max(1, Number(reward.amount ?? 1) || 1);
  const label = typeof reward.label === "string" && reward.label.trim() ? reward.label.trim() : "";
  if (rawType === "CURRENCY") return label ? `화폐 ${amount.toLocaleString()} · ${label}` : `화폐 ${amount.toLocaleString()}`;
  if (rawType === "TICKET") return label ? `추첨권 ${amount.toLocaleString()}장 · ${label}` : `추첨권 ${amount.toLocaleString()}장`;
  if (rawType === "ITEM") return label ? `상품 ${amount.toLocaleString()}개 · ${label}` : `상품 ${amount.toLocaleString()}개`;
  if (rawType === "RANDOM_BOX") return label ? `랜덤박스 ${amount.toLocaleString()}개 · ${label}` : `랜덤박스 ${amount.toLocaleString()}개`;
  if (rawType === "EXP") return label ? `${amount.toLocaleString()} EXP · ${label}` : `${amount.toLocaleString()} EXP`;
  return label ? `보상 ${amount.toLocaleString()} · ${label}` : `보상 ${amount.toLocaleString()}`;
}

function rewardSummary(value: unknown) {
  const rewards = Array.isArray(value) ? value : value ? [value] : [];
  if (!rewards.length) return "지급된 보상이 없습니다.";
  return rewards.map((item) => describeReward(item as Record<string, unknown>)).join(" · ");
}

function promoRewardPreview(code: PromoCode) {
  if (!Array.isArray(code.rewards) || !code.rewards.length) return "보상 설정 없음";
  return rewardSummary(code.rewards);
}

function isPublicPromo(code: PromoCode & { visibility?: string | null }) {
  return normalizeCouponVisibility(code.visibility) === "public";
}

export function RewardCenter({ data }: { data: RewardCenterData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [openingBox, setOpeningBox] = useState<BoxEntry | null>(null);
  const [openingStage, setOpeningStage] = useState<"preview" | "opening" | "result">("preview");
  const [openingResult, setOpeningResult] = useState("");
  const [remainingBoxCount, setRemainingBoxCount] = useState<number | null>(null);

  const referralCode = data.referral.referralCode ?? "승인 후 발급";
  const promoCodes = useMemo(() => (data.availablePromoCodes ?? []).filter((code) => isPublicPromo(code as PromoCode & { visibility?: string | null })), [data.availablePromoCodes]);

  async function run(key: string, fn: () => Promise<unknown>, success: (result: unknown) => string) {
    try {
      setLoading(key);
      setMessage(null);
      const result = await fn();
      setMessage({ type: "success", text: success(result) });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." });
    } finally {
      setLoading(null);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").trim();
    if (!code) return;
    await run("code", () => postJson("/api/rewards/redeem-code", { code }), (result) => `코드 사용 완료 · ${rewardSummary((result as { rewards?: unknown })?.rewards)}`);
    event.currentTarget.reset();
  }

  async function redeemCode(code: string) {
    await run(`code-${code}`, () => postJson("/api/rewards/redeem-code", { code }), (result) => `코드 사용 완료 · ${rewardSummary((result as { rewards?: unknown })?.rewards)}`);
  }

  function openGiftBox(box: BoxEntry) {
    setOpeningBox(box);
    setOpeningStage("preview");
    setOpeningResult("");
    setRemainingBoxCount(null);
    setMessage(null);
  }

  function closeGiftBox(refresh = false) {
    setOpeningBox(null);
    setOpeningStage("preview");
    setOpeningResult("");
    setRemainingBoxCount(null);
    if (refresh) router.refresh();
  }

  async function confirmGiftOpen() {
    if (!openingBox) return;
    try {
      setLoading(`open-${openingBox.box_id}`);
      setOpeningStage("opening");
      const result = await postJson("/api/rewards/open-box", { boxId: openingBox.box_id });
      setOpeningResult(rewardSummary((result as { reward?: unknown; rewards?: unknown })?.reward ?? (result as { rewards?: unknown })?.rewards));
      setRemainingBoxCount(typeof (result as { remaining?: unknown })?.remaining === "number" ? (result as { remaining: number }).remaining : null);
      setOpeningStage("result");
      setMessage({ type: "success", text: "랜덤박스를 개봉했습니다." });
    } catch (error) {
      setOpeningStage("preview");
      setMessage({ type: "error", text: error instanceof Error ? error.message : "랜덤박스 개봉 중 오류가 발생했습니다." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

      <div className="grid grid-2">
        <section className="panel panel-pad">
          <div className="flex items-center gap-1"><UserPlus size={19} className="text-gold" /><h2 className="panel-title mb-0">내 추천 ID</h2></div>
          <p className="text-muted mt-2">친구가 회원가입 시 이 ID를 입력하고 관리자 승인을 받으면 양쪽 모두 보상을 받을 수 있습니다.</p>
          <div className="notice-box mt-3"><strong>{referralCode}</strong></div>
          <button className="btn btn-secondary mt-3" type="button" onClick={() => navigator.clipboard?.writeText(referralCode)}><Copy size={16} /> 추천 ID 복사</button>
          <p className="text-muted text-small mt-2">승인 추천 수 {data.referral.totalApproved.toLocaleString()}명{data.referral.referredBy ? ` · 나를 추천한 회원 ${data.referral.referredBy}` : ""}</p>
        </section>

        <section className="panel panel-pad">
          <div className="flex items-center gap-1"><CalendarCheck2 size={19} className="text-gold" /><h2 className="panel-title mb-0">출석 체크</h2></div>
          <p className="text-muted mt-2">KST 기준 하루 1회 출석할 수 있습니다. 출석 보상이 있으면 완료 메시지에 바로 표시됩니다.</p>
          {data.attendanceToday ? (
            <div className="notice-box mt-3">오늘 출석 완료 · 연속 {data.attendanceToday.streak_count.toLocaleString()}일</div>
          ) : (
            <button className="btn btn-primary mt-3" type="button" disabled={loading === "attendance"} onClick={() => run("attendance", () => postJson("/api/rewards/attendance"), (result) => `출석 체크 완료 · ${rewardSummary((result as { rewards?: unknown })?.rewards)}`)}>{loading === "attendance" ? <LoaderCircle size={17} className="spin" /> : <CalendarCheck2 size={17} />} 오늘 출석하기</button>
          )}
          <div className="table-wrap mt-3">
            <table className="table"><thead><tr><th>날짜</th><th>구분</th><th>연속</th></tr></thead><tbody>{data.recentAttendance.length ? data.recentAttendance.map((row) => <tr key={row.id}><td>{row.attendance_date}</td><td>{row.source === "ADMIN" ? "관리자 처리" : "직접 출석"}</td><td>{row.streak_count}일</td></tr>) : <tr><td colSpan={3}><div className="empty">출석 기록이 없습니다.</div></td></tr>}</tbody></table>
          </div>
        </section>
      </div>

      <section className="panel panel-pad mt-3">
        <div className="flex items-center gap-1"><Ticket size={19} className="text-gold" /><h2 className="panel-title mb-0">쿠폰 / 이벤트 코드</h2></div>
        <p className="text-muted mt-2">운영자가 공개한 쿠폰이나 이벤트 코드를 입력하거나 아래 목록에서 바로 사용할 수 있습니다. 숨김 쿠폰은 목록에는 보이지 않지만 코드를 알고 있으면 입력할 수 있습니다.</p>
        <form className="form-row mt-3" onSubmit={submitCode}>
          <input className="input" name="code" placeholder="쿠폰 또는 이벤트 코드" />
          <button className="btn btn-primary" disabled={loading === "code"}>{loading === "code" ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />} 코드 사용</button>
        </form>
        <div className="grid grid-2 mt-3">
          {promoCodes.length ? promoCodes.map((code) => (
            <article className="panel panel-pad" key={code.id}>
              <div className="flex items-center justify-between gap-2"><strong>{code.name}</strong><span className="badge-soft">{code.code_type === "EVENT_CODE" ? "이벤트 코드" : "쿠폰"}</span></div>
              <p className="text-muted text-small mt-1">{code.code}</p>
              {code.description && <p className="mt-2">{code.description}</p>}
              <p className="text-muted mt-2">보상: {promoRewardPreview(code)}</p>
              <button className="btn btn-secondary btn-sm mt-3" type="button" disabled={loading === `code-${code.code}`} onClick={() => redeemCode(code.code)}>{loading === `code-${code.code}` ? <LoaderCircle size={15} className="spin" /> : <Ticket size={15} />} 이 코드 사용하기</button>
            </article>
          )) : <div className="empty">현재 바로 사용할 수 있는 공개 쿠폰/이벤트 코드가 없습니다.</div>}
        </div>
      </section>

      <section className="panel panel-pad mt-3">
        <div className="flex items-center gap-1"><Gift size={19} className="text-gold" /><h2 className="panel-title mb-0">내 랜덤박스</h2></div>
        <p className="text-muted mt-2">추천, 가입, 출석, 쿠폰 보상으로 받은 박스를 개봉할 수 있습니다.</p>
        <div className="grid grid-3 mt-3">
          {data.boxes.length ? data.boxes.map((box) => (
            <article className="panel panel-pad" key={box.id}>
              <strong>{box.box_name}</strong>
              <p className="text-muted text-small mt-1">{box.box_description ?? "랜덤 보상 박스"}</p>
              <p className="mt-2">보유 {box.quantity.toLocaleString()}개</p>
              <button className="btn btn-secondary btn-sm mt-2" type="button" disabled={loading === `open-${box.box_id}`} onClick={() => openGiftBox(box)}>{loading === `open-${box.box_id}` ? <LoaderCircle size={15} className="spin" /> : <Gift size={15} />} 개봉하기</button>
            </article>
          )) : <div className="empty">보유한 랜덤박스가 없습니다.</div>}
        </div>
      </section>

      <section className="panel panel-pad mt-3">
        <div className="flex items-center gap-1"><Bell size={19} className="text-gold" /><h2 className="panel-title mb-0">알림센터</h2></div>
        <div className="table-wrap mt-3"><table className="table"><tbody>{data.notifications.length ? data.notifications.map((item) => <tr key={item.id}><td><strong>{item.title}{!item.is_read ? " · NEW" : ""}</strong><div className="text-muted text-small">{item.body}</div></td><td>{formatDateTime(item.created_at)}</td></tr>) : <tr><td><div className="empty">아직 받은 알림이 없습니다.</div></td></tr>}</tbody></table></div>
      </section>

      {openingBox && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card">
            <h2>{openingBox.box_name}</h2>
            <p>{openingBox.box_description ?? "선물상자를 클릭해서 랜덤박스를 개봉하세요."}</p>
            {openingStage === "preview" && <button className="gift-box" type="button" onClick={confirmGiftOpen}>🎁<span>선물상자를 클릭해서 개봉하기</span><small>보유 수량 {openingBox.quantity.toLocaleString()}개</small></button>}
            {openingStage === "opening" && <div className="empty">개봉 중... 잠시만 기다려 주세요.</div>}
            {openingStage === "result" && <div className="notice-box"><strong>개봉 완료!</strong><br />{openingResult}<br />{remainingBoxCount !== null ? `남은 수량 ${remainingBoxCount.toLocaleString()}개` : "보상 내역은 알림센터에서도 확인할 수 있습니다."}</div>}
            <div className="table-actions mt-3"><button className="btn btn-secondary" type="button" onClick={() => closeGiftBox(openingStage === "result")}>닫기</button>{openingStage === "result" && <button className="btn btn-primary" type="button" onClick={() => closeGiftBox(true)}>확인</button>}</div>
          </div>
        </div>
      )}
    </>
  );
}
