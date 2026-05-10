import { Badge } from '@/components/ui/badge';

/** 발주 기준 입고 상태 (입고대기 / 입고예정 / 입고확정) — 판매예약 서랍·목록 공통 */
export function InboundStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }
  const styles: Record<string, { className: string; label: string }> = {
    INBOUND_PENDING: {
      className:
        'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      label: '입고대기',
    },
    INBOUND_SCHEDULED: {
      className:
        'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
      label: '입고예정',
    },
    INBOUND_CONFIRMED: {
      className:
        'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
      label: '입고확정',
    },
  };
  const s = styles[status];
  if (!s) {
    return <span className="text-sm text-muted-foreground">{status}</span>;
  }
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}
