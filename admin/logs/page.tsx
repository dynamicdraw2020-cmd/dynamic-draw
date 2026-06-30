import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminLogs, getAuditIntegrity } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "관리자 로그" };

interface LogRow { id: string; created_at: string; action: string; target_table: string | null; target_id: string | null; ip_address: string; entry_hash: string; details?: unknown; profiles?: { display_name?: string; username?: string; email?: string } | Array<{ display_name?: string; username?: string; email?: string }>; }
function one<T>(value: T | T[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function AdminLogsPage() {
  await requireAdmin("VIEWER");
  const [logs, integrity] = await Promise.all([getAdminLogs() as Promise<LogRow[]>, getAuditIntegrity()]);
  return <><div className="admin-toolbar"><div><h1>관리자 감사 로그</h1><p className="text-muted">각 로그는 이전 로그의 해시를 포함하여 순서대로 연결됩니다.</p></div></div><div className={integrity.adminLogs.valid ? "note-box" : "warning-box"}>{integrity.adminLogs.valid ? `해시 체인 검증 정상 · ${integrity.adminLogs.checked.toLocaleString()}개 관리자 로그 확인` : `해시 체인 이상 감지 · 순번 ${integrity.adminLogs.invalidSequence ?? "확인 불가"} · 운영자가 DB 원본을 점검해야 합니다.`}</div><div className="table-wrap mt-3"><table className="table"><thead><tr><th>시간</th><th>관리자</th><th>행동</th><th>대상</th><th>IP</th><th>해시</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td className="muted">{formatDateTime(log.created_at)}</td><td><strong>{one(log.profiles)?.display_name ?? "관리자"}</strong><div className="text-muted text-small">{one(log.profiles)?.username ?? one(log.profiles)?.email}</div></td><td><span className="code">{log.action}</span></td><td className="muted">{log.target_table ?? "-"} / {log.target_id?.slice(0,8) ?? "-"}</td><td className="muted">{log.ip_address}</td><td><span className="hash" title={log.entry_hash}>{log.entry_hash}</span></td></tr>)}</tbody></table></div></>;
}
