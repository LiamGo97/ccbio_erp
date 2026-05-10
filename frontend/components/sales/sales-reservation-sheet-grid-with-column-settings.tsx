'use client';

import * as React from 'react';
import { useColumnSettings } from '@/hooks/use-column-settings';
import {
  SalesReservationSheetGrid,
  type SalesReservationSheetGridHandle,
  type SalesReservationSheetGridProps,
} from '@/components/sales/sales-reservation-sheet-grid';

type OmittedKeys = 'columnSizing' | 'onColumnSizingChange';

export type SalesReservationSheetGridWithColumnSettingsProps = Omit<
  SalesReservationSheetGridProps,
  OmittedKeys
>;

export type { SalesReservationSheetGridHandle };

/**
 * 판매예약(`/sales/product-reservations-sheet`) 열 너비 쿠키를 그리드 서브트리에서만 관리해
 * 리사이즈 시 상단 필터·페이지 전체 리렌더를 줄임. 키: `sales-product-reservations-sheet-*`
 */
export const SalesReservationSheetGridWithColumnSettings = React.forwardRef<
  SalesReservationSheetGridHandle,
  SalesReservationSheetGridWithColumnSettingsProps
>(function SalesReservationSheetGridWithColumnSettings(props, ref) {
  const columnSettings = useColumnSettings('sales-product-reservations-sheet');
  return (
    <SalesReservationSheetGrid
      ref={ref}
      {...props}
      columnSizing={columnSettings.columnSizing}
      onColumnSizingChange={columnSettings.onColumnSizingChange}
    />
  );
});

SalesReservationSheetGridWithColumnSettings.displayName =
  'SalesReservationSheetGridWithColumnSettings';
