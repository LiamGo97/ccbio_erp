'use client';

import * as React from 'react';
import { DataTable } from '@/components/ui/data-table';
import { useColumnSettings } from '@/hooks/use-column-settings';
import type { TradeContract } from '@/lib/hooks/use-trade-contracts';

/** 구매관리(`/trade/management`) 행 타입 — 페이지 `PurchaseItem`과 동일 */
export type PurchaseManagementRow = TradeContract & {
  type: 'contract' | 'order';
};

type OmittedColumnSettingsKeys =
  | 'visibleColumns'
  | 'onVisibleColumnsChange'
  | 'columnSizing'
  | 'onColumnSizingChange'
  | 'columnOrder'
  | 'onColumnOrderChange';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataTableAnyProps = React.ComponentProps<typeof DataTable<any, any>>;

export type PurchaseManagementDataTableProps = Omit<
  DataTableAnyProps,
  OmittedColumnSettingsKeys
>;

/**
 * 컬럼 표시/너비/순서 쿠키(`trade-management-*`)를 표 서브트리 안에서만 관리해,
 * 리사이즈·컬럼 설정 변경 시 페이지(필터·drawer 등) 전체 리렌더를 피함.
 */
export function PurchaseManagementDataTable(props: PurchaseManagementDataTableProps) {
  const columnSettings = useColumnSettings('trade-management');
  return (
    <DataTable
      {...props}
      visibleColumns={columnSettings.visibleColumns}
      onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
      columnSizing={columnSettings.columnSizing}
      onColumnSizingChange={columnSettings.onColumnSizingChange}
      columnOrder={columnSettings.columnOrder}
      onColumnOrderChange={columnSettings.onColumnOrderChange}
    />
  );
}
