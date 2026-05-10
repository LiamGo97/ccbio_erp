'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { BuiltSheetBlOption } from '@/lib/sales/sheet-bl-options-from-trade-orders';

/**
 * 0: BL·가용재고는 시트 행 저장 직후·다른 행에서 BL을 다시 열 때 최신이어야 함.
 * (같은 상품 캐시 재사용만으로는 예약/수량 반영 전 값이 남을 수 있음)
 */
export const SHEET_BL_OPTIONS_STALE_MS = 0;

/** `invalidateQueries({ queryKey })`용 — 하위에 productCode·salesGrade 포함 */
export const SHEET_BL_OPTIONS_QUERY_ROOT = [
  'trade-orders',
  'sheet-bl-options',
] as const;

export function sheetBlOptionsQueryKey(productCode: string, salesGrade: string) {
  const pc = productCode.trim();
  const g = salesGrade.trim();
  return ['trade-orders', 'sheet-bl-options', pc, g] as const;
}

export async function fetchSheetBlOptions(
  productCode: string,
  salesGrade: string,
): Promise<BuiltSheetBlOption[]> {
  const pc = productCode.trim();
  const g = salesGrade.trim();
  const { data } = await api.get<BuiltSheetBlOption[]>(
    '/trade/contracts/orders/sheet-bl-options',
    {
      params: {
        productCode: pc,
        ...(g ? { salesGrade: g } : {}),
      },
    },
  );
  return data ?? [];
}

/**
 * BL 셀 편집 중이고 상품 코드가 있을 때만 —
 * `GET .../sheet-bl-options?productCode=…` (+ 등급 있으면 `&salesGrade=…`).
 */
export function useSheetBlOptionsForProduct(
  productCode: string,
  salesGrade: string,
  enabled: boolean,
) {
  const pc = productCode.trim();
  const g = salesGrade.trim();
  return useQuery<BuiltSheetBlOption[]>({
    queryKey: sheetBlOptionsQueryKey(pc, g),
    queryFn: () => fetchSheetBlOptions(pc, g),
    enabled: enabled && pc !== '',
    staleTime: SHEET_BL_OPTIONS_STALE_MS,
    /** 편집 셀에서 enabled 토글 시에도 항상 최신 시도 */
    refetchOnMount: true,
  });
}
