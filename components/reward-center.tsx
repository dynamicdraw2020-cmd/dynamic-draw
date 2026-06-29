"use client";

import { Bell, CalendarCheck2, Gift, LoaderCircle, Send, Ticket, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { RewardCenterData } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

async function postJson(url: string, body: unknown = {}) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

type BoxEntry = RewardCenterData["boxes"][number];

function rewardText(reward: Record<string, unknown> | null | undefined) {
  if (!reward) return "보상이 지급되었습니다.";
  const label = typeof reward.label === "string" && reward.label.trim() ? reward.label.trim() : typeof reward.type === "string" ? reward.type : "보상";
  const amount = Math.max(1, Number(reward.amount ?? 1) || 1);
  return `${label} ${amount.toLocaleString()} 지급`;
}

export function RewardCenter({ data }: { data: RewardCenterData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [openingBox, setOpeningBox] = useState<BoxEntry | null>(null);
  const [openingStage, setOpeningStage] = useState<"preview" | "opening" | "result">("preview");
  const [openingResult, setOpeningResult] = useState<string>("");
  const [remainingBoxCount, setRemainingBoxCount] = useState<number | null>(null);
  const referralCode = data.referral.referralCode ?? "승인 후 발급";

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    try {
      setLoading(key);
      setMessage(null);
      await fn();
      setMessage({ type: "success", text: success });
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
    await run("code", () => postJson("/api/rewards/redeem-code", { code }), "코드 보상이 지급되었습니다.");
    event.currentTarget.reset();
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
      const reward = result?.reward as Record<string, unknown> | undefined;
      setOpeningResult(rewardText(reward));
      setRemainingBoxCount(typeof result?.remaining === "number" ? result.remaining : null);
      setOpeningStage("result");
      setMessage({ type: "success", text: "랜덤박스를 개봉했습니다." });
    } catch (error) {
      setOpeningStage("preview");
      setMessage({ type: "error", text: error instanceof Error ? error.message : "랜덤박스 개봉 중 오류가 발생했습니다." });
    } finally {
      setLoading(null);
    }
  }

  return <>
    <div className="grid gap-3">
      {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
      <section className="panel panel-pad">
        <div className="flex items-center gap-1"><UserPlus size={19} className="text-gold" /><h2 className="panel-title mb-0">내 추천 ID</h2></div>
        <p className="panel-description mt-1">친구가 회원가입 시 이 ID를 입력하고 관리자 승인을 받으면 양쪽 모두 보상을 받을 수 있습니다. 추천인 보상은 관리자가 설정한 내용대로 지급됩니다.</p>
        <div className="member-code mt-2">{referralCode}</div>
        <div className="text-muted text-small mt-2">승인 추천 수 {data.referral.totalApproved.toLocaleString()}명{data.referral.referredBy ? ` · 나를 추천한 회원 ${data.referral.referredBy}` : ""}</div>
      </section>

      <div className="grid grid-2">
        <section className="panel panel-pad">
          <div className="flex items-center gap-1"><CalendarCheck2 size={19} className="text-gold" /><h2 className="panel-title mb-0">출석 체크</h2></div>
          <p className="panel-description mt-1">KST 기준 하루 1회 출석할 수 있습니다.</p>
          {data.attendanceToday ? <div className="note-box mt-2">오늘 출석 완료 · 연속 {data.attendanceToday.streak_count.toLocaleString()}일</div> : <button className="btn btn-primary mt-2" type="button" disabled={loading === "attendance"} onClick={() => run("attendance", () => postJson("/api/rewards/attendance"), "출석 체크가 완료되었습니다.")}>{loading === "attendance" ? <LoaderCircle size={17} className="spin" /> : <CalendarCheck2 size={17} />} 오늘 출석하기</button>}
          <div className="table-wrap mt-3"><table className="table"><thead><tr><th>날짜</th><th>구분</th><th>연속</th></tr></thead><tbody>{data.recentAttendance.length ? data.recentAttendance.map((row) => <tr key={row.id}><td>{row.attendance_date}</td><td>{row.source === "ADMIN" ? "관리자 처리" : "직접 출석"}</td><td>{row.streak_count}일</td></tr>) : <tr><td colSpan={3}><div className="empty">출석 기록이 없습니다.</div></td></tr>}</tbody></table></div>
        </section>

        <section className="panel panel-pad">
          <div className="flex items-center gap-1"><Send size={19} className="text-gold" /><h2 className="panel-title mb-0">쿠폰 / 이벤트 코드</h2></div>
          <p className="panel-description mt-1">운영자가 공개한 쿠폰이나 이벤트 코드를 입력해 보상을 받을 수 있습니다.</p>
          <form className="form-row mt-2" onSubmit={submitCode}><input className="input" name="code" placeholder="예: DYNAMICOPEN" maxLength={40} /><button className="btn btn-secondary" type="submit" disabled={loading === "code"}>{loading === "code" ? <LoaderCircle size={17} className="spin" /> : <Ticket size={17} />} 코드 사용</button></form>
        </section>
      </div>

      <section className="panel panel-pad">
        <div className="flex items-center gap-1"><Gift size={19} className="text-gold" /><h2 className="panel-title mb-0">내 랜덤박스</h2></div>
        <p className="panel-description mt-1">추천, 가입, 출석, 쿠폰 보상으로 받은 박스를 개봉할 수 있습니다. 개봉 버튼을 누른 뒤 선물상자를 클릭하면 개봉이 진행됩니다.</p>
        <div className="grid grid-3 mt-3">{data.boxes.length ? data.boxes.map((box) => <article className="panel-soft" key={box.id}><div className="flex items-center gap-1"><Gift size={19} /><strong>{box.box_name}</strong></div><p className="text-muted text-small mt-1">{box.box_description ?? "랜덤 보상 박스"}</p><div className="ticket-count mt-2">보유 {box.quantity.toLocaleString()}개</div><button className="btn btn-primary btn-block mt-2" type="button" disabled={loading === `open-${box.box_id}` || Boolean(openingBox)} onClick={() => openGiftBox(box)}>{loading === `open-${box.box_id}` ? <LoaderCircle size={17} className="spin" /> : <Gift size={17} />} 개봉하기</button></article>) : <div className="panel empty">보유한 랜덤박스가 없습니다.</div>}</div>
      </section>

      <section className="panel panel-pad">
        <div className="flex items-center gap-1"><Bell size={19} className="text-gold" /><h2 className="panel-title mb-0">알림센터</h2></div>
        <div className="result-list mt-3">{data.notifications.length ? data.notifications.map((item) => <article className="result-row" key={item.id}><div className="result-icon"><Bell size={17} /></div><div className="result-main"><strong>{item.title}{!item.is_read ? " · NEW" : ""}</strong><span>{item.body}</span></div><time className="result-time">{formatDateTime(item.created_at)}</time></article>) : <div className="empty">아직 받은 알림이 없습니다.</div>}</div>
      </section>
    </div>

    {openingBox && <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.58)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 80 }}>
      <div className="panel panel-pad" style={{ width: "100%", maxWidth: 520, boxShadow: "0 20px 50px rgba(15, 23, 42, 0.24)" }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="panel-title mb-0">{openingBox.box_name}</h2>
            <p className="panel-description mt-1">{openingBox.box_description ?? "선물상자를 클릭해서 랜덤박스를 개봉하세요."}</p>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => closeGiftBox(openingStage === "result")}>닫기</button>
        </div>

        {openingStage === "preview" && <>
          <button
            type="button"
            onClick={confirmGiftOpen}
            disabled={loading === `open-${openingBox.box_id}`}
            style={{ width: "100%", marginTop: 18, borderRadius: 28, border: "1px solid rgba(15,23,42,0.08)", background: "linear-gradient(180deg, #fff8e1 0%, #ffd86a 100%)", padding: "30px 20px", boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)", cursor: "pointer" }}
          >
            <div style={{ fontSize: 76, lineHeight: 1 }}>🎁</div>
            <div style={{ marginTop: 14, fontWeight: 800, fontSize: 20 }}>선물상자를 클릭해서 개봉하기</div>
            <div className="text-muted text-small" style={{ marginTop: 8 }}>보유 수량 {openingBox.quantity.toLocaleString()}개</div>
          </button>
          <div className="text-muted text-small mt-2">한 번 개봉하면 랜덤박스 1개가 차감되고 설정된 확률에 따라 보상이 지급됩니다.</div>
        </>}

        {openingStage === "opening" && <div style={{ marginTop: 18, borderRadius: 28, background: "linear-gradient(180deg, #fff8e1 0%, #ffd86a 100%)", padding: "34px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 76, lineHeight: 1 }}>🎁</div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 800 }}><LoaderCircle size={20} className="spin" /> 개봉 중...</div>
          <div className="text-muted text-small mt-2">잠시만 기다려 주세요.</div>
        </div>}

        {openingStage === "result" && <div style={{ marginTop: 18, borderRadius: 28, background: "linear-gradient(180deg, #f8fafc 0%, #eef6ff 100%)", padding: "34px 20px", textAlign: "center", border: "1px solid rgba(59, 130, 246, 0.14)" }}>
          <div style={{ fontSize: 72, lineHeight: 1 }}>✨</div>
          <div style={{ marginTop: 14, fontSize: 22, fontWeight: 900 }}>개봉 완료!</div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>{openingResult}</div>
          <div className="text-muted text-small mt-2">{remainingBoxCount !== null ? `남은 수량 ${remainingBoxCount.toLocaleString()}개` : "보상 내역은 알림센터에서도 확인할 수 있습니다."}</div>
          <button className="btn btn-primary mt-3" type="button" onClick={() => closeGiftBox(true)}>확인</button>
        </div>}
      </div>
    </div>}
  </>;
}
