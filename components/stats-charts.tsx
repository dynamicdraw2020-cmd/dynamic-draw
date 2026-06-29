"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PublicStats } from "@/lib/types";

const tooltipStyle = {
  background: "#0d1d31",
  border: "1px solid rgba(148,163,184,.2)",
  borderRadius: 12,
  color: "#f8fafc",
};

function statusLabel(status?: string | null) {
  if (status === "ACTIVE") return "진행 중";
  if (status === "PAUSED") return "일시정지";
  if (status === "DRAFT") return "준비 중";
  if (status === "ENDED") return "종료";
  return "상태 없음";
}

export function StatsCharts({ stats }: { stats: PublicStats }) {
  const [selectedDrawId, setSelectedDrawId] = useState("ALL");
  const drawOptions = stats.drawOptions ?? [];
  const selectedDraw = drawOptions.find((draw) => draw.drawId === selectedDrawId) ?? null;

  const rewardData = useMemo(() => {
    const rows = (selectedDrawId === "ALL"
      ? stats.rewardStats
      : stats.rewardStats.filter((item) => item.drawId === selectedDrawId || item.drawName === selectedDraw?.drawName))
      .filter((item) => Number(item.configuredRate ?? 0) > 0);
    const total = rows.reduce((sum, item) => sum + item.count, 0);
    const hasMultiDraw = new Set(rows.map((item) => item.drawName).filter(Boolean)).size > 1;
    return rows.map((item) => ({
      ...item,
      label: hasMultiDraw && item.drawName ? `${item.drawName} · ${item.name}` : item.name,
      actualRate: total > 0 ? Number(((item.count * 100) / total).toFixed(2)) : 0,
    }));
  }, [selectedDrawId, selectedDraw?.drawName, stats.rewardStats]);

  const dailyData = useMemo(() => {
    const rows = selectedDrawId === "ALL"
      ? stats.dailyStats.filter((item) => !item.drawId || item.drawId === "__ALL__")
      : stats.dailyStats.filter((item) => item.drawId === selectedDrawId);
    if (rows.length) return rows;
    return stats.dailyStats.filter((item) => !item.drawId || item.drawId === "__ALL__");
  }, [selectedDrawId, stats.dailyStats]);

  const totalAttempts = rewardData.reduce((sum, item) => sum + item.count, 0);
  const topReward = rewardData.slice().sort((a, b) => b.count - a.count)[0] ?? null;
  const configuredTotal = rewardData.reduce((sum, item) => sum + item.configuredRate, 0);

  return (
    <div className="stats-dashboard">
      <section className="panel panel-pad stats-control-panel">
        <div>
          <span className="section-kicker">Statistics</span>
          <h2 className="panel-title mb-0">뽑기별 통계</h2>
          <p className="panel-description mt-1">전체 통계 또는 특정 뽑기를 선택해 결과, 확률, 일별 흐름을 확인합니다.</p>
        </div>
        <div className="stats-draw-selector">
          <label htmlFor="stats-draw-select">뽑기 선택</label>
          <select id="stats-draw-select" className="select" value={selectedDrawId} onChange={(event) => setSelectedDrawId(event.target.value)}>
            <option value="ALL">전체 뽑기</option>
            {drawOptions.map((draw) => <option key={draw.drawId} value={draw.drawId}>{draw.drawName} · {statusLabel(draw.status)}</option>)}
          </select>
        </div>
      </section>

      <section className="stats-summary-grid">
        <article className="panel panel-pad stat-summary-card">
          <span>선택 범위</span>
          <strong>{selectedDraw ? selectedDraw.drawName : "전체 뽑기"}</strong>
          <small>{selectedDraw ? statusLabel(selectedDraw.status) : `${drawOptions.length.toLocaleString()}개 뽑기 합산`}</small>
        </article>
        <article className="panel panel-pad stat-summary-card">
          <span>유효 추첨 수</span>
          <strong>{totalAttempts.toLocaleString()}</strong>
          <small>공개 완료·무효 제외 기준</small>
        </article>
        <article className="panel panel-pad stat-summary-card">
          <span>최다 출현 상품</span>
          <strong>{topReward?.name ?? "없음"}</strong>
          <small>{topReward ? `${topReward.count.toLocaleString()}회 · ${topReward.actualRate.toFixed(2)}%` : "결과 없음"}</small>
        </article>
        <article className="panel panel-pad stat-summary-card">
          <span>확률 합계</span>
          <strong>{configuredTotal.toFixed(2)}%</strong>
          <small>활성 상품 설정 기준</small>
        </article>
      </section>

      <div className="grid grid-2 stats-grid">
        <article className="panel panel-pad">
          <h3 className="panel-title">상품별 실제 출현 비율</h3>
          <p className="panel-description">선택한 범위의 유효 결과만 계산합니다.</p>
          <div className="stats-chart">
            {rewardData.length ? <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rewardData} dataKey="count" nameKey="label" innerRadius={62} outerRadius={102} paddingAngle={3}>
                  {rewardData.map((entry) => <Cell key={`${entry.drawId ?? "all"}-${entry.rewardId}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer> : <div className="empty">표시할 결과가 없습니다.</div>}
          </div>
          <div className="legend-list stats-legend-list">
            {rewardData.length ? rewardData.map((item) => (
              <div className="legend-item" key={`${item.drawId ?? "all"}-${item.rewardId}`}>
                <span className="legend-dot" style={{ "--legend-color": item.color } as CSSProperties} />
                <span>{item.label}</span>
                <strong>{item.actualRate.toFixed(2)}%</strong>
              </div>
            )) : <div className="empty">상품 데이터가 없습니다.</div>}
          </div>
        </article>

        <article className="panel panel-pad">
          <h3 className="panel-title">날짜별 추첨 수</h3>
          <p className="panel-description">최근 7일의 추첨 흐름입니다.</p>
          <div className="stats-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData} margin={{ top: 18, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,.09)" vertical={false} />
                <XAxis dataKey="date" stroke="#71839a" tickLine={false} axisLine={false} />
                <YAxis stroke="#71839a" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="count" name="추첨 수" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4, fill: "#38bdf8" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel panel-pad stats-wide-chart">
          <h3 className="panel-title">설정 확률과 실제 출현율 비교</h3>
          <p className="panel-description">선택한 뽑기별로 설정 확률과 실제 출현율을 비교합니다.</p>
          <div className="stats-chart">
            {rewardData.length ? <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rewardData} margin={{ top: 20, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,.09)" vertical={false} />
                <XAxis dataKey="label" stroke="#71839a" tickLine={false} axisLine={false} interval={0} angle={-10} height={58} textAnchor="end" />
                <YAxis stroke="#71839a" tickLine={false} axisLine={false} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="configuredRate" name="설정 확률" fill="#f6c453" radius={[7,7,0,0]} />
                <Bar dataKey="actualRate" name="실제 출현율" fill="#38bdf8" radius={[7,7,0,0]} />
              </BarChart>
            </ResponsiveContainer> : <div className="empty">비교할 상품이 없습니다.</div>}
          </div>
        </article>
      </div>
    </div>
  );
}
