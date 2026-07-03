import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminDraws, getAdminMembers, getAuditIntegrity, getProbabilityHistory } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "확률 변경 기록" };

interface HistoryRow { id: string; created_at: string; reason: string; before_values: unknown; after_values: unknown; ip_address: string; profiles?: { display_name?: string } | Array<{ display_name?: string }>; draws?: { name?: string } | Array<{ name?: string }>; }
function one<T>(value: T | T[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

export default async function ProbabilityHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("VIEWER");
  const params = await searchParams;
  const drawId = first(params.draw);
  const adminId = first(params.admin);
  const from = first(params.from);
  const to = first(params.to);
  const [rows, integrity, draws, members] = await Promise.all([
    getProbabilityHistory({ drawId, adminId, from, to }) as Promise<HistoryRow[]>,
    getAuditIntegrity(),
    getAdminDraws(),
    getAdminMembers(),
  ]);
  const admins = members.filter((member) => member.role !== "USER");

  return <>
    <div className="admin-toolbar"><div><h1>확률 변경 기록</h1><p className="text-muted">변경 전·후 값, 관리자, 사유와 접속 정보를 조회합니다. DB 트리거로 수정·삭제가 금지됩니다.</p></div></div>
    <div className={integrity.probabilityHistory.valid ? "note-box" : "warning-box"}>{integrity.probabilityHistory.valid ? `확률 기록 해시 체인 정상 · ${integrity.probabilityHistory.checked.toLocaleString()}개 기록 확인` : `확률 기록 체인 이상 감지 · 순번 ${integrity.probabilityHistory.invalidSequence ?? "확인 불가"}`}</div>
    <form className="panel panel-pad form-grid mt-3" method="get">
      <div className="form-row">
        <div className="field"><label htmlFor="history-draw">뽑기</label><select className="select" id="history-draw" name="draw" defaultValue={drawId}><option value="">전체 뽑기</option>{draws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name}</option>)}</select></div>
        <div className="field"><label htmlFor="history-admin">관리자</label><select className="select" id="history-admin" name="admin" defaultValue={adminId}><option value="">전체 관리자</option>{admins.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {member.username ?? member.email}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="history-from">시작일</label><input className="input" id="history-from" name="from" type="date" defaultValue={from} /></div>
        <div className="field"><label htmlFor="history-to">종료일</label><input className="input" id="history-to" name="to" type="date" defaultValue={to} /></div>
      </div>
      <div className="table-actions"><button className="btn btn-primary" type="submit">조건으로 조회</button><Link className="btn btn-secondary" href="/admin/probability-history">필터 초기화</Link></div>
    </form>
    <div className="table-wrap mt-3"><table className="table"><thead><tr><th>변경 시각</th><th>뽑기</th><th>관리자</th><th>사유</th><th>변경 전</th><th>변경 후</th><th>IP</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td className="muted">{formatDateTime(row.created_at)}</td><td>{one(row.draws)?.name ?? "-"}</td><td>{one(row.profiles)?.display_name ?? "관리자"}</td><td>{row.reason}</td><td><span className="hash">{JSON.stringify(row.before_values)}</span></td><td><span className="hash">{JSON.stringify(row.after_values)}</span></td><td className="muted">{row.ip_address}</td></tr>) : <tr><td colSpan={7}><div className="empty">선택한 조건의 확률 변경 기록이 없습니다.</div></td></tr>}</tbody></table></div>
  </>;
}
