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

export type CustomersDataTableProps = Omit<DataTableAnyProps, OmittedColumnSettingsKeys>;

/** 고객 관리(`/customers`) 컬럼 표시·너비·순서 쿠키(`customers-v4-*`, 영업담당자 기본 위치 변경 시 v3 무효화) */
export function CustomersDataTable(props: CustomersDataTableProps) {
  const columnSettings = useColumnSettings('customers-v4');
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
