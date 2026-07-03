import type { ReactNode } from "react";

export function MetricCard({ icon, label, value, note }: { icon: ReactNode; label: string; value: string | number; note?: string }) {
  return (
    <article className="panel metric">
      <div className="metric-icon">{icon}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {note && <div className="metric-note">{note}</div>}
    </article>
  );
}
