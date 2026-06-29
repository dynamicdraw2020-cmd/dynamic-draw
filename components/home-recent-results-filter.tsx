"use client";

import { Award } from "lucide-react";
import { useMemo, useState } from "react";
import type { DrawResult } from "@/lib/types";
import { formatDateTime, maskMemberCode, maskName } from "@/lib/utils";

export function HomeRecentResultsFilter({ results }: { results: DrawResult[] }) {
  const drawNames = useMemo(() => Array.from(new Set(results.map((result) => result.draw_name).filter(Boolean))), [results]);
  const [drawName, setDrawName] = useState("ALL");
  const filtered = drawName === "ALL" ? results : results.filter((result) => result.draw_name === drawName);
  return <section className="public-card recent-card-front recent-only-card">
    <div className="official-card-head responsive-card-head">
      <div><span className="section-kicker">Recent</span><h2>최근 결과</h2></div>
      <select className="select compact-select" value={drawName} onChange={(event) => setDrawName(event.target.value)} aria-label="뽑기 선택">
        <option value="ALL">전체 뽑기</option>
        {drawNames.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    <div className="result-list mt-3">
      {filtered.length ? filtered.slice(0, 8).map((result) => <article className="result-row" key={result.id}>
        <div className="result-icon" style={{ "--reward-color": result.reward_color } as React.CSSProperties}><Award size={20} /></div>
        <div className="result-main"><strong>{result.reward_name}</strong><span>{maskName(result.public_display_name)} · {maskMemberCode(result.public_member_code)} · {result.draw_name}</span></div>
        <time className="result-time" dateTime={result.created_at}>{formatDateTime(result.created_at)}</time>
      </article>) : <div className="empty">선택한 뽑기의 공개 결과가 없습니다.</div>}
    </div>
  </section>;
}
