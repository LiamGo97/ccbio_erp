'use client';

import * as React from 'react';
import { useTradeOrders } from '@/lib/hooks/use-trade-orders';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { buildBlOptionsByProductCodeFromOrders } from '@/lib/sales/sheet-bl-options-from-trade-orders';

export function salesStatusToLabel(
  s: string | null | undefined,
): string {
  if (s == null || s === '') {
    return '입고대기';
  }
  switch (s) {
    case 'INBOUND_PENDING':
      return '입고대기';
    case 'INBOUND_SCHEDULED':
      return '입고예정';
    case 'INBOUND_CONFIRMED':
      return '입고확정';
    default:
      return s;
  }
}

/**
 * 입고대기(INBOUND_PENDING) · 입고예정(INBOUND_SCHEDULED) · 입고확정(INBOUND_CONFIRMED)
 * 부킹 주문에 등장한 상품(코드) 목록 — 각 입고 메뉴와 동일한 API 조건(bookingOnly + salesStatus).
 *
 * `blOptionsByProductCode`: 상품 코드별 BL/BK — `value`는 저장용(BL 또는 BK 문자열), BL만 있으면 label=BL,
 * BL 없고 BK만 있으면 label=`"{bk} (BK)"`로 구분 표시.
 * `salesGradesForProduct`: 해당 발주·상품 컨에 찍힌 영업 등급 집합(없으면 필드 생략 — 시트에서 등급 필터 비적용).
 * 같은 상품 내 목록은 **ETA 오름차순**(빠른 입항 먼저), ETA 없음·날짜 파싱 실패는 맨 뒤, 동일 시 BL 문자열(ko) 순.
 */
export function useInboundStatusesProductOptions() {
  const { data: pending = [], isLoading: loadingPending } = useTradeOrders({
    bookingOnly: true,
    salesStatus: 'INBOUND_PENDING',
  });
  const { data: scheduled = [], isLoading: loadingScheduled } = useTradeOrders({
    bookingOnly: true,
    salesStatus: 'INBOUND_SCHEDULED',
  });
  const { data: confirmed = [], isLoading: loadingConfirmed } = useTradeOrders({
    bookingOnly: true,
    salesStatus: 'INBOUND_CONFIRMED',
  });
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: salesGradeCodes = [] } = useCodeMastersByGroup('SALES_GRADE');

  const mergedOrders = React.useMemo(
    () => [...pending, ...scheduled, ...confirmed],
    [pending, scheduled, confirmed],
  );

  const options = React.useMemo(() => {
    const codeSet = new Set<string>();
    for (const order of mergedOrders) {
      const code = order.productCode ?? order.containers?.[0]?.product;
      if (code && code.trim() !== '') {
        codeSet.add(code.trim());
      }
    }
    const sorted = Array.from(codeSet).sort((a, b) =>
      a.localeCompare(b, 'ko'),
    );
    return sorted.map((code) => ({
      value: code,
      label: productCodes.find((c) => c.value === code)?.name ?? code,
    }));
  }, [mergedOrders, productCodes]);

  const blOptionsByProductCode = React.useMemo(
    () => buildBlOptionsByProductCodeFromOrders(mergedOrders),
    [mergedOrders],
  );

  /**
   * 상품 코드별 영업 등급(salesGrade) — 입고대기·예정·확정 부킹 컨테이너에 실린 값만.
   * 해당 상품에 등급이 하나도 없으면 키를 두지 않음(시트에서는 코드 마스터 전체로 폴백).
   */
  const salesGradeOptionsByProductCode = React.useMemo(() => {
    const nameByValue = new Map<string, string>();
    for (const sg of salesGradeCodes) {
      const v = (sg.value || '').trim();
      if (!v) continue;
      nameByValue.set(v, (sg.name || sg.value || v).trim());
    }
    const byProduct = new Map<string, Set<string>>();
    for (const order of mergedOrders) {
      const code = (order.productCode ?? order.containers?.[0]?.product)?.trim();
      if (!code) continue;
      for (const container of order.containers ?? []) {
        if (container.excludeFromInventory === true) continue;
        const containerProductRaw = String(container.product ?? '').trim();
        const rowProduct: string =
          containerProductRaw !== '' ? containerProductRaw : code;
        if (rowProduct !== code) continue;
        const g = (container.salesGrade ?? '').trim();
        if (!g) continue;
        if (!byProduct.has(code)) byProduct.set(code, new Set());
        byProduct.get(code)!.add(g);
      }
    }
    const result: Record<string, { value: string; label: string }[]> = {};
    for (const [code, set] of byProduct) {
      const values = [...set].sort((a, b) => a.localeCompare(b, 'ko'));
      result[code] = values.map((value) => ({
        value,
        label: nameByValue.get(value) ?? value,
      }));
    }
    return result;
  }, [mergedOrders, salesGradeCodes]);

  const isLoading = loadingPending || loadingScheduled || loadingConfirmed;

  return {
    options,
    blOptionsByProductCode,
    salesGradeOptionsByProductCode,
    isLoading,
  };
}
