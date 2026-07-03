export function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    ACTIVE: "진행 중",
    PAUSED: "일시 정지",
    DRAFT: "준비 중",
    ENDED: "종료",
    PENDING: "승인 대기",
    APPROVED: "승인 완료",
    REJECTED: "반려",
    SUSPENDED: "정지",
  };
  return <span className={`badge badge-${status.toLowerCase()}`}>{label[status] ?? status}</span>;
}
