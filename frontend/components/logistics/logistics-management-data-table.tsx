'use client';

import * as React from 'react';
import { DataTable } from '@/components/ui/data-table';
import { useColumnSettings } from '@/hooks/use-column-settings';

type OmittedColumnSettingsKeys =
  | 'visibleColumns'
  | 'onVisibleColumnsChange'
  | 'columnSizing'
  | 'onColumnSizingChange'
  | 'columnOrder'
  | 'onColumnOrderChange';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataTableAnyProps = React.ComponentProps<typeof DataTable<any, any>>;

export type LogisticsManagementDataTableProps = Omit<
  DataTableAnyProps,
  OmittedColumnSettingsKeys
>;

/**
 * 물류관리(`/logistics/management`) 컬럼 표시·너비·순서를 표 서브트리에서만 관리해
 * 리사이즈·컬럼 순서 드래그 시 페이지(필터·drawer 등) 전체 리렌더를 피함.
 * 쿠키: `logistics-management-*`
 */
export function LogisticsManagementDataTable(props: LogisticsManagementDataTableProps) {
  const columnSettings = useColumnSettings('logistics-management');
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
