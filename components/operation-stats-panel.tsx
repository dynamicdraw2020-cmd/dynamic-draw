import { Activity, BarChart3, CalendarCheck2, Coins, ShieldX, Ticket, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/metric-card";

type Stats = {
  approvedMembers: number;
  pendingMembers: number;
  todayDraws: number;
  totalTickets: number;
  todayCurrencyLogs: number;
  todayExchanges: number;
  todayAttendance: number;
  activeBlacklists: number;
  openInquiries: number;
};

export function OperationStatsPanel({ stats }: { stats: Stats }) {
  return <div className="grid gap-3">
    <div className="metric-grid">
      <MetricCard label="승인 회원" value={stats.approvedMembers} note="현재 운영 대상" icon={<UsersRound size={20} />} />
      <MetricCard label="승인 대기" value={stats.pendingMembers} note="처리 필요" icon={<UsersRound size={20} />} />
      <MetricCard label="오늘 추첨" value={stats.todayDraws} note="KST 기준" icon={<Activity size={20} />} />
      <MetricCard label="전체 추첨권" value={stats.totalTickets} note="회원 보유 합계" icon={<Ticket size={20} />} />
      <MetricCard label="오늘 화폐 로그" value={stats.todayCurrencyLogs} note="지급/사용 기록" icon={<Coins size={20} />} />
      <MetricCard label="오늘 교환" value={stats.todayExchanges} note="상품 교환 로그" icon={<BarChart3 size={20} />} />
      <MetricCard label="오늘 출석" value={stats.todayAttendance} note="출석 체크" icon={<CalendarCheck2 size={20} />} />
      <MetricCard label="블랙리스트" value={stats.activeBlacklists} note="활성 제한" icon={<ShieldX size={20} />} />
    </div>
    <section className="panel panel-pad"><h2 className="panel-title">운영 참고</h2><p className="panel-description">이 통계는 운영자가 오늘 처리해야 할 승인, 보상, 제한, 교환 상태를 빠르게 확인하기 위한 요약입니다.</p></section>
  </div>;
}
