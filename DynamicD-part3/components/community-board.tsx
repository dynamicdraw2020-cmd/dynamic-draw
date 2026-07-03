"use client";

import { Flag, LoaderCircle, MessageCircle, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatDateTime } from "@/lib/utils";

type CommentRow = { id: string; body: string; nickname: string | null; created_at: string };
type PostRow = { id: string; title: string; body: string; nickname: string | null; created_at: string; comments?: CommentRow[] };

type CommunityBoardProps = { posts: PostRow[]; signedIn: boolean };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function CommunityBoard({ posts, signedIn }: CommunityBoardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading("post");
      setMessage(null);
      await postJson("/api/community/posts", { title: String(data.get("title") ?? ""), body: String(data.get("body") ?? ""), nickname: String(data.get("nickname") ?? "") });
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "게시글을 등록하지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function createComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading(`comment-${postId}`);
      setMessage(null);
      await postJson(`/api/community/posts/${postId}/comments`, { body: String(data.get("body") ?? ""), nickname: String(data.get("nickname") ?? "") });
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글을 등록하지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function reportPost(postId: string) {
    const reason = window.prompt("신고 사유를 입력해 주세요.");
    if (!reason) return;
    try {
      setLoading(`report-${postId}`);
      await postJson(`/api/community/posts/${postId}/report`, { reason });
      window.alert("신고가 접수되었습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "신고를 접수하지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }

  return <div className="grid gap-3">
    {message && <div className="form-message form-error">{message}</div>}
    <section className="panel panel-pad">
      <h2 className="panel-title">닉네임 커뮤니티</h2>
      <p className="panel-description">아이디가 아닌 닉네임으로 가볍게 이야기하는 공간입니다. 운영 정책에 따라 관리자가 삭제할 수 있습니다.</p>
      {signedIn ? <form className="form-grid mt-3" onSubmit={createPost}>
        <div className="form-row"><input className="input" name="nickname" placeholder="표시 닉네임" maxLength={30} /><input className="input" name="title" placeholder="제목" required maxLength={80} /></div>
        <textarea className="textarea" name="body" placeholder="내용" rows={4} required maxLength={1500} />
        <button className="btn btn-primary" disabled={loading === "post"}>{loading === "post" ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />} 게시글 작성</button>
      </form> : <div className="note-box mt-3">로그인한 회원만 게시글을 작성할 수 있습니다.</div>}
    </section>

    <section className="grid gap-2">
      {posts.length ? posts.map((post) => <article className="panel panel-pad" key={post.id}>
        <div className="flex items-center justify-between gap-2"><div><h3 className="panel-title mb-0">{post.title}</h3><p className="text-muted text-small mt-1">{post.nickname || "익명"} · {formatDateTime(post.created_at)}</p></div><button className="btn btn-secondary btn-sm" onClick={() => reportPost(post.id)} disabled={loading === `report-${post.id}`}><Flag size={14} /> 신고</button></div>
        <p className="notice-body mt-3">{post.body}</p>
        <div className="result-list mt-3">{(post.comments ?? []).map((comment) => <div className="result-row" key={comment.id}><div className="result-icon"><MessageCircle size={15} /></div><div className="result-main"><strong>{comment.nickname || "익명"}</strong><span>{comment.body}</span></div><time className="result-time">{formatDateTime(comment.created_at)}</time></div>)}</div>
        {signedIn && <form className="form-row mt-3" onSubmit={(event) => createComment(event, post.id)}><input className="input" name="nickname" placeholder="닉네임" maxLength={30} /><input className="input" name="body" placeholder="댓글 작성" required maxLength={500} /><button className="btn btn-secondary" disabled={loading === `comment-${post.id}`}>{loading === `comment-${post.id}` ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} 댓글</button></form>}
      </article>) : <div className="panel empty">아직 커뮤니티 글이 없습니다.</div>}
    </section>
  </div>;
}

export function AdminCommunityManager({ posts }: { posts: Array<PostRow & { report_count?: number }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  async function run(action: string, id: string) {
    try {
      setLoading(`${action}-${id}`);
      await postJson("/api/admin/community", { action, id });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "처리하지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }
  return <section className="panel panel-pad"><h2 className="panel-title">커뮤니티 관리</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>글</th><th>닉네임</th><th>신고</th><th>작성</th><th>관리</th></tr></thead><tbody>{posts.length ? posts.map((post) => <tr key={post.id}><td><strong>{post.title}</strong><div className="text-muted text-small">{post.body.slice(0, 80)}</div></td><td>{post.nickname || "익명"}</td><td>{post.report_count ?? 0}</td><td>{formatDateTime(post.created_at)}</td><td><button className="btn btn-danger btn-sm" onClick={() => confirm("게시글을 삭제할까요?") && run("delete-post", post.id)} disabled={loading === `delete-post-${post.id}`}><Trash2 size={14} /> 삭제</button></td></tr>) : <tr><td colSpan={5}><div className="empty">게시글이 없습니다.</div></td></tr>}</tbody></table></div></section>;
}
