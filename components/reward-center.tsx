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

export function RewardCenter({ data }: { data: RewardCenterData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
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

  return <div className="grid gap-3">
    {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
    <section className="panel panel-pad">
      <div className="flex items-center gap-1"><UserPlus size={19} className="text-gold" /><h2 className="panel-title mb-0">내 추천 ID</h2></div>
      <p className="panel-description mt-1">친구가 회원가입 시 이 ID를 입력하고 관리자 승인을 받으면 양쪽 모두 보상을 받습니다.</p>
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
      <p className="panel-description mt-1">추천, 가입, 출석, 쿠폰 보상으로 받은 박스를 개봉할 수 있습니다.</p>
      <div className="grid grid-3 mt-3">{data.boxes.length ? data.boxes.map((box) => <article className="panel-soft" key={box.id}><div className="flex items-center gap-1"><Gift size={19} /><strong>{box.box_name}</strong></div><p className="text-muted text-small mt-1">{box.box_description ?? "랜덤 보상 박스"}</p><div className="ticket-count mt-2">보유 {box.quantity.toLocaleString()}개</div><button className="btn btn-primary btn-block mt-2" type="button" disabled={loading === box.box_id} onClick={() => run(box.box_id, () => postJson("/api/rewards/open-box", { boxId: box.box_id }), "랜덤박스를 개봉했습니다.")}>{loading === box.box_id ? <LoaderCircle size={17} className="spin" /> : <Gift size={17} />} 개봉하기</button></article>) : <div className="panel empty">보유한 랜덤박스가 없습니다.</div>}</div>
    </section>

    <section className="panel panel-pad">
      <div className="flex items-center gap-1"><Bell size={19} className="text-gold" /><h2 className="panel-title mb-0">알림센터</h2></div>
      <div className="result-list mt-3">{data.notifications.length ? data.notifications.map((item) => <article className="result-row" key={item.id}><div className="result-icon"><Bell size={17} /></div><div className="result-main"><strong>{item.title}{!item.is_read ? " · NEW" : ""}</strong><span>{item.body}</span></div><time className="result-time">{formatDateTime(item.created_at)}</time></article>) : <div className="empty">아직 받은 알림이 없습니다.</div>}</div>
    </section>
  </div>;
}
