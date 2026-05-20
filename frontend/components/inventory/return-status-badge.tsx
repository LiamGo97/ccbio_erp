'use client';

import { Badge } from '@/components/ui/badge';

const RETURN_STATUS_LABELS: Record<string, string> = {
  NOT_RETURNED: '미반납',
  RETURNED: '반납',
  LEASED: '임대컨',
  LEASED_ENDED: '임대컨 종료',
};

const RETURN_STATUS_STYLES: Record<
  string,
  { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }
> = {
  NOT_RETURNED: {
    variant: 'outline',
    className:
      'border-slate-500 bg-slate-50 text-slate-700 dark:border-slate-400 dark:bg-slate-950/30 dark:text-slate-300',
  },
  RETURNED: {
    variant: 'outline',
    className:
      'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
  },
  LEASED: {
    variant: 'outline',
    className:
      'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
  },
  LEASED_ENDED: {
    variant: 'outline',
    className:
      'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
  },
};

const RETURN_STATUS_ORDER = ['NOT_RETURNED', 'RETURNED', 'LEASED', 'LEASED_ENDED'] as const;

export function ReturnStatusBadge({
  status,
  name,
  mixed,
  className,
}: {
  status?: string | null;
  name?: string | null;
  mixed?: boolean;
  className?: string;
}) {
  if (mixed) {
    return (
      <Badge variant="outline" className={className} title="컨테이너별 반납여부가 다릅니다">
        혼합
      </Badge>
    );
  }
  const code = status ?? 'NOT_RETURNED';
  const label = name ?? RETURN_STATUS_LABELS[code] ?? code;
  const style = RETURN_STATUS_STYLES[code] ?? RETURN_STATUS_STYLES.NOT_RETURNED;
  return (
    <Badge variant={style.variant} className={`${style.className ?? ''} ${className ?? ''}`} title={label}>
      {label}
    </Badge>
  );
}

/** 반납여부별 컨테이너 건수 (0인 상태는 표시하지 않음) */
export function ReturnStatusCountBadges({
  counts,
  className,
}: {
  counts?: Record<string, number> | null;
  className?: string;
}) {
  if (!counts || Object.keys(counts).length === 0) {
    return <span className="text-muted-foreground text-sm">-</span>;
  }

  const entries = [
    ...RETURN_STATUS_ORDER.filter((code) => (counts[code] ?? 0) > 0).map((code) => ({
      code,
      count: counts[code]!,
    })),
    ...Object.entries(counts)
      .filter(([code, n]) => n > 0 && !RETURN_STATUS_ORDER.includes(code as (typeof RETURN_STATUS_ORDER)[number]))
      .map(([code, count]) => ({ code, count })),
  ];

  if (entries.length === 0) {
    return <span className="text-muted-foreground text-sm">-</span>;
  }

  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {entries.map(({ code, count }) => {
        const label = RETURN_STATUS_LABELS[code] ?? code;
        const style = RETURN_STATUS_STYLES[code] ?? RETURN_STATUS_STYLES.NOT_RETURNED;
        return (
          <Badge
            key={code}
            variant={style.variant}
            className={`${style.className ?? ''} text-xs whitespace-nowrap`}
            title={`${label} ${count}컨`}
          >
            {label} {count}
          </Badge>
        );
      })}
    </div>
  );
}
