'use client';

import * as React from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { CustomerLedgerEntry } from '@/lib/hooks/use-customer-ledger';
import { filterLedgerEntries } from '@/lib/hooks/use-customer-ledger-activity';
import type { CustomerActivityDateRange } from '@/lib/hooks/use-customer-consultations';
import { formatActivityNumber, formatLedgerDateLabel } from './customer-activity-shared';

interface CustomerActivityReceivableTabProps {
  entries: CustomerLedgerEntry[];
  isLoading: boolean;
  error: Error | null;
  customerId?: string;
  summary: {
    currentBalance: number;
    totalSales: number;
    totalCollected: number;
  };
  search: string;
  onSearchChange: (value: string) => void;
  dateRange: CustomerActivityDateRange;
  onDateRangeChange: (range: CustomerActivityDateRange) => void;
  onOpenLedger: () => void;
  onSelectInvoice: (invoiceId: string) => void;
}

function formatSignedAmount(amount: number) {
  const prefix = amount >= 0 ? '+' : '';
  return `${prefix}${formatActivityNumber(amount)}`;
}

export function CustomerActivityReceivableTab({
  entries,
  isLoading,
  error,
  customerId,
  summary,
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  onOpenLedger,
  onSelectInvoice,
}: CustomerActivityReceivableTabProps) {
  const filtered = React.useMemo(
    () => filterLedgerEntries(entries, search),
    [entries, search],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-card px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">현재 잔액</p>
          <p className="text-sm font-semibold tabular-nums">{formatActivityNumber(summary.currentBalance)}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">총 매출</p>
          <p className="text-sm font-semibold tabular-nums">{formatActivityNumber(summary.totalSales)}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">총 수금</p>
          <p className="text-sm font-semibold tabular-nums">{formatActivityNumber(summary.totalCollected)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">거래명세서·수금 내역 (일자 · 제품 · 금액)</p>
        <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={onOpenLedger}>
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          거래처관리대장
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border bg-card px-3 py-3">
        <Input
          placeholder="제품명 / 수금 검색"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 text-sm"
        />
        <DateRangePicker
          startDate={dateRange.start}
          endDate={dateRange.end}
          onChange={(startDate, endDate) => {
            onDateRangeChange({ start: startDate ?? undefined, end: endDate ?? undefined });
          }}
          className="h-8 w-full text-xs"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-card">
        <div className="space-y-2 p-3">
          {!customerId ? (
            <p className="text-xs text-muted-foreground">고객 정보가 없어 채권 내역을 조회할 수 없습니다.</p>
          ) : null}
          {customerId && isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              채권 내역을 불러오는 중입니다...
            </div>
          ) : null}
          {customerId && error ? (
            <p className="text-xs text-destructive">채권 내역을 불러오지 못했습니다.</p>
          ) : null}
          {customerId && !isLoading && !error && filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground">표시할 채권 내역이 없습니다.</p>
          ) : null}
          {filtered.map((entry) => {
            const isInvoice = entry.type === 'INVOICE';
            const key =
              entry.invoiceId ??
              entry.collectionId ??
              `${entry.type}-${entry.date}-${entry.amount}`;
            const amountClass = entry.amount >= 0 ? 'text-foreground' : 'text-emerald-700 dark:text-emerald-400';

            return (
              <button
                key={key}
                type="button"
                disabled={isInvoice && !entry.invoiceId}
                className="w-full rounded-md border bg-background p-3 text-left hover:bg-accent/40 disabled:cursor-default disabled:opacity-80"
                onClick={() => {
                  if (isInvoice && entry.invoiceId) onSelectInvoice(entry.invoiceId);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {formatLedgerDateLabel(entry.date)}
                    </span>
                    <Badge
                      variant={isInvoice ? 'default' : 'secondary'}
                      className="h-5 px-1.5 text-[10px] font-normal"
                    >
                      {isInvoice ? '매출' : entry.isPrepayment ? '선수금' : '수금'}
                    </Badge>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${amountClass}`}>
                    {formatSignedAmount(entry.amount)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-foreground break-words">
                  {entry.productLabel?.trim() || (isInvoice ? '품목 미정' : '수금')}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                  잔액 {formatActivityNumber(entry.balance)}
                </p>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
