"use client";

import { CalendarClock, LoaderCircle, Play, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Draw = { id: string; name: string; status: string };
type Currency = { id: string; name: string; symbol: string | null };
type Reward = { id: string; name: string };
type Announcement = { id: string; reward_id: string; title: string; message: string; is_active: boolean; reward?: { name?: string | null } | null };
type Job = { id: string; name: string; job_type: string; scheduled_at: string | null; status: string; payload: Record<string, unknown>; created_at: string };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function AutomationManager({ jobs, draws, currencies, rewards, announcements }: { jobs: Job[]; draws: Draw[]; currencies: Currency[]; rewards: Reward[]; announcements: Announcement[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const jobType = String(data.get("jobType") ?? "AUTO_GRANT_TICKETS");
    const payload = {
      drawId: String(data.get("drawId") ?? "") || null,
      currencyId: String(data.get("currencyId") ?? "") || null,
      amount: Number(data.get("amount") ?? 1),
      target: String(data.get("target") ?? "ALL_APPROVED"),
    };
    try {
      setLoading("create");
      await postJson("/api/admin/automation", { action: "create", name: String(data.get("name") ?? "자동 작업"), jobType, scheduledAt: String(data.get("scheduledAt") ?? "") || null, payload });
      form.reset();
      router.refresh();
    } catch (error) { window.alert(error instanceof Error ? error.message : "자동 작업을 만들지 못했습니다."); }
    finally { setLoading(null); }
  }
  async function run(action: string, id?: string) {
    try { setLoading(`${action}-${id ?? "all"}`); await postJson("/api/admin/automation", { action, id }); router.refresh(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "처리하지 못했습니다."); }
    finally { setLoading(null); }
  }
  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading("announcement");
      await postJson("/api/admin/automation", { action: "create-special-announcement", rewardId: String(data.get("rewardId") ?? ""), title: String(data.get("title") ?? ""), message: String(data.get("message") ?? "") });
      form.reset();
      router.refresh();
    } catch (error) { window.alert(error instanceof Error ? error.message : "전체 공지 규칙을 만들지 못했습니다."); }
    finally { setLoading(null); }
  }

  return <div className="grid gap-3"><form className="panel panel-pad form-grid" onSubmit={submit}><div className="flex items-center gap-1"><CalendarClock size={19} className="text-gold" /><h2 className="panel-title mb-0">자동 추첨·자동 지급 예약</h2></div><p className="panel-description">예약 시간 이후 관리자 실행 또는 Cron 호출로 자동 작업을 처리합니다.</p><div className="form-row"><input className="input" name="name" placeholder="작업명" required /><select className="select" name="jobType"><option value="AUTO_GRANT_TICKETS">자동 추첨권 지급</option><option value="AUTO_GRANT_CURRENCY">자동 화폐 지급</option><option value="AUTO_MEMBER_RAFFLE">자동 전체 회원 추첨</option></select><input className="input" name="scheduledAt" type="datetime-local" /></div><div className="form-row"><select className="select" name="target"><option value="ALL_APPROVED">전체 승인 회원</option></select><select className="select" name="drawId"><option value="">뽑기 선택</option>{draws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name} · {draw.status}</option>)}</select><select className="select" name="currencyId"><option value="">화폐 선택</option>{currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} · {currency.symbol}</option>)}</select><input className="input" name="amount" type="number" min="1" defaultValue="1" /></div><button className="btn btn-primary" disabled={loading === "create"}>{loading === "create" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 자동 작업 만들기</button></form><section className="panel panel-pad"><div className="flex items-center justify-between gap-2"><h2 className="panel-title mb-0">자동 작업 목록</h2><button className="btn btn-secondary btn-sm" onClick={() => run("process-due")}><Play size={14} /> 예약 작업 처리</button></div><div className="table-wrap mt-3"><table className="table"><thead><tr><th>작업</th><th>종류</th><th>예약</th><th>상태</th><th>관리</th></tr></thead><tbody>{jobs.length ? jobs.map((job) => <tr key={job.id}><td><strong>{job.name}</strong><div className="text-muted text-small">{JSON.stringify(job.payload)}</div></td><td>{job.job_type}</td><td>{job.scheduled_at ? new Date(job.scheduled_at).toLocaleString("ko-KR") : "즉시"}</td><td>{job.status}</td><td><div className="table-actions"><button className="btn btn-secondary btn-sm" onClick={() => run("run-one", job.id)} disabled={loading === `run-one-${job.id}`}><Play size={14} /> 실행</button><button className="btn btn-danger btn-sm" onClick={() => run("delete", job.id)}><Trash2 size={14} /> 삭제</button></div></td></tr>) : <tr><td colSpan={5}><div className="empty">자동 작업이 없습니다.</div></td></tr>}</tbody></table></div></section>
    <form className="panel panel-pad form-grid" onSubmit={createAnnouncement}>
      <h2 className="panel-title">지정 상품 당첨 전체공지</h2>
      <p className="panel-description">관리자가 지정한 상품이 공개되면 전체 승인 회원에게 알림센터 공지를 발송합니다. 문구의 {'{{reward}}'} 부분은 상품명으로 바뀝니다.</p>
      <div className="form-row"><select className="select" name="rewardId" required><option value="">상품 선택</option>{rewards.map((reward) => <option key={reward.id} value={reward.id}>{reward.name}</option>)}</select><input className="input" name="title" defaultValue="특별 상품 당첨" required /><input className="input" name="message" defaultValue="{{reward}} 당첨 결과가 공개되었습니다." required /></div>
      <button className="btn btn-primary" disabled={loading === "announcement"}>{loading === "announcement" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 전체공지 규칙 만들기</button>
    </form>
    <section className="panel panel-pad"><h2 className="panel-title">전체공지 규칙</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>상품</th><th>제목</th><th>문구</th><th>상태</th></tr></thead><tbody>{announcements.length ? announcements.map((item) => <tr key={item.id}><td>{item.reward?.name ?? item.reward_id}</td><td>{item.title}</td><td>{item.message}</td><td>{item.is_active ? "사용" : "정지"}</td></tr>) : <tr><td colSpan={4}><div className="empty">전체공지 규칙이 없습니다.</div></td></tr>}</tbody></table></div></section>
  </div>;
}
