'use client';

import * as React from 'react';
import { useColumnSettings } from '@/hooks/use-column-settings';
import {
  QuotationSheetGrid,
  type QuotationSheetGridHandle,
  type QuotationSheetGridProps,
} from '@/components/sales/quotation-sheet-grid';

type OmittedKeys = 'columnSizing' | 'onColumnSizingChange';

export type QuotationSheetGridWithColumnSettingsProps = Omit<
  QuotationSheetGridProps,
  OmittedKeys
>;

export type { QuotationSheetGridHandle };

/**
 * 견적서 시트(`/sales/quotation-sheet`) 열 너비 쿠키를 그리드 서브트리에서만 관리.
 * 키: `sales-quotation-sheet-*`
 */
export const QuotationSheetGridWithColumnSettings = React.forwardRef<
  QuotationSheetGridHandle,
  QuotationSheetGridWithColumnSettingsProps
>(function QuotationSheetGridWithColumnSettings(props, ref) {
  const columnSettings = useColumnSettings('sales-quotation-sheet');
  return (
    <QuotationSheetGrid
      ref={ref}
      {...props}
      columnSizing={columnSettings.columnSizing}
      onColumnSizingChange={columnSettings.onColumnSizingChange}
    />
  );
});

QuotationSheetGridWithColumnSettings.displayName =
  'QuotationSheetGridWithColumnSettings';

