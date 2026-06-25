import { Award } from "lucide-react";
import type { DrawResult } from "@/lib/types";
import { formatDateTime, maskMemberCode, maskName } from "@/lib/utils";

export function RecentResults({ results, compact = false }: { results: DrawResult[]; compact?: boolean }) {
  if (!results.length) return <div className="empty">아직 공개된 추첨 결과가 없습니다.</div>;
  return (
    <div className="result-list">
      {results.map((result) => (
        <article className="result-row" key={result.id}>
          <div className="result-icon" style={{ "--reward-color": result.reward_color } as React.CSSProperties}><Award size={20} /></div>
          <div className="result-main">
            <strong>{result.reward_name}</strong>
            <span>{maskName(result.public_display_name)} · {maskMemberCode(result.public_member_code)}{!compact && ` · ${result.draw_name}`}</span>
          </div>
          <time className="result-time" dateTime={result.created_at}>{formatDateTime(result.created_at)}</time>
        </article>
      ))}
    </div>
  );
}
