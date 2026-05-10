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

export type ConsultationsDataTableProps = Omit<DataTableAnyProps, OmittedColumnSettingsKeys>;

/** 상담 관리(`/consultations`) 컬럼 표시·너비·순서 쿠키(`consultations-*`) */
export function ConsultationsDataTable(props: ConsultationsDataTableProps) {
  const columnSettings = useColumnSettings('consultations');
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
