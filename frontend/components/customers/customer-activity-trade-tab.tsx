'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { CustomerLedgerEntry } from '@/lib/hooks/use-customer-ledger';
import { filterLedgerEntries } from '@/lib/hooks/use-customer-ledger-activity';
import type { CustomerActivityDateRange } from '@/lib/hooks/use-customer-consultations';
import { formatLedgerDateLabel } from './customer-activity-shared';

interface CustomerActivityTradeTabProps {
  entries: CustomerLedgerEntry[];
  isLoading: boolean;
  error: Error | null;
  customerId?: string;
  search: string;
  onSearchChange: (value: string) => void;
  dateRange: CustomerActivityDateRange;
  onDateRangeChange: (range: CustomerActivityDateRange) => void;
  onSelectInvoice: (invoiceId: string) => void;
}

export function CustomerActivityTradeTab({
  entries,
  isLoading,
  error,
  customerId,
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  onSelectInvoice,
}: CustomerActivityTradeTabProps) {
  const filtered = React.useMemo(
    () => filterLedgerEntries(entries, search),
    [entries, search],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-2 rounded-lg border bg-card px-3 py-3">
        <Input
          placeholder="제품명 / 명세서 번호 검색"
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
        <p className="text-xs text-muted-foreground">발행된 거래명세서 기준 (제품명 · 발행일)</p>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-card">
        <div className="space-y-2 p-3">
          {!customerId ? (
            <p className="text-xs text-muted-foreground">고객 정보가 없어 거래 내역을 조회할 수 없습니다.</p>
          ) : null}
          {customerId && isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              거래 내역을 불러오는 중입니다...
            </div>
          ) : null}
          {customerId && error ? (
            <p className="text-xs text-destructive">거래 내역을 불러오지 못했습니다.</p>
          ) : null}
          {customerId && !isLoading && !error && filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground">표시할 거래 내역이 없습니다.</p>
          ) : null}
          {filtered.map((entry) => {
            const key = entry.invoiceId ?? `${entry.date}-${entry.invoiceNumber}`;
            return (
              <button
                key={key}
                type="button"
                disabled={!entry.invoiceId}
                className="w-full rounded-md border bg-background p-3 text-left hover:bg-accent/40 disabled:opacity-60"
                onClick={() => entry.invoiceId && onSelectInvoice(entry.invoiceId)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatLedgerDateLabel(entry.date)}
                  </span>
                  {entry.invoiceNumber ? (
                    <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-normal">
                      {entry.invoiceNumber}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm font-medium text-foreground break-words">
                  {entry.productLabel?.trim() || '품목 미정'}
                </p>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
