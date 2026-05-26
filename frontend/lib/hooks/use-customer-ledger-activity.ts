import * as React from 'react';
import {
  CustomerLedgerEntry,
  useCustomerLedger,
  type GetCustomerLedgerParams,
} from '@/lib/hooks/use-customer-ledger';
import type { CustomerActivityDateRange } from '@/lib/hooks/use-customer-consultations';

export interface UseCustomerLedgerActivityParams {
  customerId?: string | null;
  enabled?: boolean;
  dateRange?: CustomerActivityDateRange;
}

function toLedgerParams(dateRange?: CustomerActivityDateRange): GetCustomerLedgerParams | undefined {
  if (!dateRange?.start && !dateRange?.end) return undefined;
  return {
    startDate: dateRange.start?.toISOString().slice(0, 10),
    endDate: dateRange.end?.toISOString().slice(0, 10),
  };
}

function sortEntriesDesc(entries: CustomerLedgerEntry[]): CustomerLedgerEntry[] {
  return [...entries].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    if (a.type === 'INVOICE' && b.type === 'COLLECTION') return -1;
    if (a.type === 'COLLECTION' && b.type === 'INVOICE') return 1;
    return 0;
  });
}

export function filterLedgerEntries(
  entries: CustomerLedgerEntry[],
  search: string,
): CustomerLedgerEntry[] {
  const text = search.trim().toLowerCase();
  if (!text) return entries;
  return entries.filter((entry) => {
    const haystack = [
      entry.productLabel ?? '',
      entry.invoiceNumber ?? '',
      entry.collectionNumber ?? '',
      entry.notes ?? '',
      entry.type === 'INVOICE' ? '거래명세서' : '수금',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(text);
  });
}

export function useCustomerLedgerActivity({
  customerId,
  enabled = true,
  dateRange,
}: UseCustomerLedgerActivityParams) {
  const ledgerQuery = useCustomerLedger(customerId ?? undefined, toLedgerParams(dateRange));

  const allEntries = React.useMemo(
    () => ledgerQuery.data?.entries ?? [],
    [ledgerQuery.data?.entries],
  );

  const tradeEntries = React.useMemo(
    () => sortEntriesDesc(allEntries.filter((e) => e.type === 'INVOICE')),
    [allEntries],
  );

  const receivableEntries = React.useMemo(() => sortEntriesDesc(allEntries), [allEntries]);

  return {
    ...ledgerQuery,
    tradeEntries,
    receivableEntries,
    summary: {
      currentBalance: ledgerQuery.data?.currentBalance ?? 0,
      totalSales: ledgerQuery.data?.totalSales ?? 0,
      totalCollected: ledgerQuery.data?.totalCollected ?? 0,
    },
  };
}
