import type { Metadata } from "next";
import { Activity, Dices, UserRoundCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { RecentResults } from "@/components/recent-results";
import { requireAdmin } from "@/lib/auth";
import { getAdminDashboardData } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "관리자 대시보드" };

export default async function AdminDashboard() {
  const profile = await requireAdmin("VIEWER");
  const data = await getAdminDashboardData();
  return <><div className="admin-toolbar"><div><h1>관리자 대시보드</h1><p className="text-muted">오늘의 운영 상태와 최근 기록을 한눈에 확인합니다.</p></div>{["MANAGER", "SUPER_ADMIN"].includes(profile.role) && <Link className="btn btn-primary" href="/admin/live"><Dices size={17} /> 추첨 실행</Link>}</div><div className="grid grid-4"><MetricCard icon={<Dices size={20} />} label="누적 추첨" value={data.stats.totalDraws.toLocaleString()} /><MetricCard icon={<Activity size={20} />} label="오늘 추첨" value={data.stats.todayDraws.toLocaleString()} /><MetricCard icon={<UserRoundCheck size={20} />} label="가입 승인 대기" value={data.pendingMembers} note={data.pendingMembers ? "처리가 필요합니다" : "대기 없음"} /><MetricCard icon={<UsersRound size={20} />} label="진행 중인 뽑기" value={data.activeDraws} /></div><div className="grid grid-2 mt-3"><section className="panel panel-pad"><div className="flex justify-between items-center"><div><h2 className="panel-title">최근 결과</h2><p className="panel-description">가장 최근 공개된 결과입니다.</p></div><Link className="btn btn-ghost btn-sm" href="/admin/results">전체 보기</Link></div><div className="mt-2"><RecentResults results={data.recentResults} compact /></div></section><section className="panel panel-pad"><div className="flex justify-between items-center"><div><h2 className="panel-title">최근 관리자 활동</h2><p className="panel-description">해시 체인으로 연결된 감사 기록입니다.</p></div><Link className="btn btn-ghost btn-sm" href="/admin/logs">전체 보기</Link></div><div className="result-list mt-2">{data.recentLogs.map((log) => <article className="result-row" key={log.id}><div className="result-icon" style={{ "--reward-color": "#a78bfa" } as React.CSSProperties}><Activity size={19} /></div><div className="result-main"><strong>{log.action}</strong><span>{log.admin_name}</span></div><time className="result-time">{formatDateTime(log.created_at)}</time></article>)}</div></section></div></>;
}
