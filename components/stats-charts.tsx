"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PublicStats } from "@/lib/types";

const tooltipStyle = {
  background: "#0d1d31",
  border: "1px solid rgba(148,163,184,.2)",
  borderRadius: 12,
  color: "#f8fafc",
};

export function StatsCharts({ stats }: { stats: PublicStats }) {
  const drawCount = new Set(stats.rewardStats.map((item) => item.drawName).filter(Boolean)).size;
  const rewardData = stats.rewardStats.map((item) => ({
    ...item,
    label: drawCount > 1 && item.drawName ? `${item.drawName} · ${item.name}` : item.name,
  }));

  return (
    <div className="grid grid-2">
      <article className="panel panel-pad">
        <h3 className="panel-title">상품별 실제 출현 비율</h3>
        <p className="panel-description">공개된 유효 결과만 계산합니다.</p>
        <div className="stats-chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rewardData} dataKey="count" nameKey="label" innerRadius={62} outerRadius={102} paddingAngle={3}>
                {rewardData.map((entry) => <Cell key={entry.rewardId} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="legend-list">
          {rewardData.map((item) => (
            <div className="legend-item" key={item.rewardId}>
              <span className="legend-dot" style={{ "--legend-color": item.color } as React.CSSProperties} />
              <span>{item.label}</span>
              <strong>{item.actualRate.toFixed(2)}%</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel panel-pad">
        <h3 className="panel-title">날짜별 추첨 수</h3>
        <p className="panel-description">최근 7일의 추첨 흐름입니다.</p>
        <div className="stats-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.dailyStats} margin={{ top: 18, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,.09)" vertical={false} />
              <XAxis dataKey="date" stroke="#71839a" tickLine={false} axisLine={false} />
              <YAxis stroke="#71839a" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" name="추첨 수" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4, fill: "#38bdf8" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="panel panel-pad" style={{ gridColumn: "1 / -1" }}>
        <h3 className="panel-title">설정 확률과 실제 출현율 비교</h3>
        <p className="panel-description">추첨 횟수가 늘수록 실제 출현율은 설정 확률에 가까워지는 경향이 있습니다.</p>
        <div className="stats-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rewardData} margin={{ top: 20, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,.09)" vertical={false} />
              <XAxis dataKey="label" stroke="#71839a" tickLine={false} axisLine={false} />
              <YAxis stroke="#71839a" tickLine={false} axisLine={false} unit="%" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="configuredRate" name="설정 확률" fill="#f6c453" radius={[7,7,0,0]} />
              <Bar dataKey="actualRate" name="실제 출현율" fill="#38bdf8" radius={[7,7,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </div>
  );
}
