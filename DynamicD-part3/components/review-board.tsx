"use client";

import { CheckCircle2, LoaderCircle, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatDateTime } from "@/lib/utils";

type Review = { id: string; title: string; body: string; nickname: string | null; status: string; is_featured: boolean; created_at: string; reward_name?: string | null };

type ResultOption = { id: string; draw_name?: string | null; reward_name?: string | null };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function WinnerReviewBoard({ reviews, results }: { reviews: Review[]; results: ResultOption[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading(true);
      setMessage(null);
      await postJson("/api/reviews", { resultId: String(data.get("resultId") ?? ""), title: String(data.get("title") ?? ""), body: String(data.get("body") ?? ""), nickname: String(data.get("nickname") ?? "") });
      form.reset();
      setMessage("후기가 접수되었습니다. 관리자 승인 후 공개됩니다.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "후기를 접수하지 못했습니다."); }
    finally { setLoading(false); }
  }
  return <div className="grid gap-3">{message && <div className="form-message form-success">{message}</div>}<form className="panel panel-pad form-grid" onSubmit={submit}><h2 className="panel-title">당첨 후기 작성</h2><p className="panel-description">후기는 관리자 승인 후 메인 화면 하단에 노출될 수 있습니다.</p><select className="select" name="resultId"><option value="">결과 선택 없음</option>{results.map((result) => <option key={result.id} value={result.id}>{result.draw_name ?? "이벤트"} · {result.reward_name ?? "상품"}</option>)}</select><div className="form-row"><input className="input" name="nickname" placeholder="표시 닉네임" maxLength={30} /><input className="input" name="title" placeholder="제목" required maxLength={100} /></div><textarea className="textarea" name="body" rows={5} required maxLength={1600} placeholder="후기 내용을 입력해 주세요." /><button className="btn btn-primary" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />} 후기 접수</button></form><section className="panel panel-pad"><h2 className="panel-title">공개 후기</h2><div className="grid gap-2 mt-3">{reviews.length ? reviews.map((review) => <article className="panel-soft" key={review.id}><strong>{review.title}</strong><p className="text-muted text-small">{review.nickname || "익명"} · {review.reward_name ?? "이벤트 상품"} · {formatDateTime(review.created_at)}</p><p className="notice-body mt-2">{review.body}</p></article>) : <div className="empty">아직 공개된 후기가 없습니다.</div>}</div></section></div>;
}

export function AdminReviewManager({ reviews }: { reviews: Review[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  async function run(action: string, id: string) {
    try { setLoading(`${action}-${id}`); await postJson("/api/admin/reviews", { action, id }); router.refresh(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "처리하지 못했습니다."); }
    finally { setLoading(null); }
  }
  return <section className="panel panel-pad"><h2 className="panel-title">당첨 후기 관리</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>후기</th><th>상태</th><th>노출</th><th>관리</th></tr></thead><tbody>{reviews.length ? reviews.map((review) => <tr key={review.id}><td><strong>{review.title}</strong><div className="text-muted text-small">{review.body.slice(0, 100)}</div></td><td>{review.status}</td><td>{review.is_featured ? "메인 노출" : "일반"}</td><td><div className="table-actions"><button className="btn btn-secondary btn-sm" onClick={() => run("approve", review.id)} disabled={loading === `approve-${review.id}`}><CheckCircle2 size={14} /> 승인</button><button className="btn btn-secondary btn-sm" onClick={() => run("toggle-featured", review.id)}>노출 전환</button><button className="btn btn-danger btn-sm" onClick={() => run("delete", review.id)}><Trash2 size={14} /> 삭제</button></div></td></tr>) : <tr><td colSpan={4}><div className="empty">후기가 없습니다.</div></td></tr>}</tbody></table></div></section>;
}
