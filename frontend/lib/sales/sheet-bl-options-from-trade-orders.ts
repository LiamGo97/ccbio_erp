import type { TradeOrder } from '@/lib/hooks/use-trade-orders';
import {
  effectiveBales,
  getInboundOrderContainerStockColumns,
} from '@/lib/inbound-order-stock-metrics';

/** `SalesReservationSheetGrid` `SheetBlOption`과 동일 필드 */
export type BuiltSheetBlOption = {
  value: string;
  label: string;
  salesStatus: string | null;
  etaDate?: string | null;
  perContainerBales?: number;
  salesGradesForProduct?: string[];
  /** 드롭다운 가용재고(컨 상당) — 백엔드 sheet-bl-options와 동일 규칙 */
  availableContainerEquiv?: number;
};

function perContainerBalesForOrder(order: TradeOrder): number {
  const cs = (order.containers ?? []).filter(
    (c) => c.excludeFromInventory !== true,
  );
  if (cs.length === 0) return 0;
  return effectiveBales(cs[0]!);
}

function etaSortKey(etaDate: string | null | undefined): number {
  if (etaDate == null || etaDate === '') return Number.POSITIVE_INFINITY;
  const t = new Date(etaDate).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function collectSalesGradesForOrderProduct(
  order: TradeOrder,
  code: string,
): Set<string> {
  const out = new Set<string>();
  for (const container of order.containers ?? []) {
    if (container.excludeFromInventory === true) continue;
    const containerProductRaw = String(container.product ?? '').trim();
    const rowProduct: string =
      containerProductRaw !== '' ? containerProductRaw : code;
    if (rowProduct !== code) continue;
    const g = (container.salesGrade ?? '').trim();
    if (g) out.add(g);
  }
  return out;
}

/**
 * `useInboundStatusesProductOptions`의 blOptionsByProductCode와 동일 규칙.
 * `mergedOrders` = 입고 3상태 부킹 주문 합친 배열(또는 단일 상품만 필터된 API 결과).
 */
export function buildBlOptionsByProductCodeFromOrders(
  mergedOrders: TradeOrder[],
): Record<string, BuiltSheetBlOption[]> {
  const map = new Map<
    string,
    Map<
      string,
      {
        value: string;
        label: string;
        salesStatus: string | null;
        perContainerBales: number;
        etaDate: string | null;
        salesGrades: Set<string>;
        availableContainerEquiv: number;
      }
    >
  >();
  for (const order of mergedOrders) {
    const code = (order.productCode ?? order.containers?.[0]?.product)?.trim();
    const bl = (order.bl ?? '').trim();
    const bk = (order.bk ?? '').trim();
    if (!code || (!bl && !bk)) continue;
    const mapKey = bl || bk;
    const grades = collectSalesGradesForOrderProduct(order, code);
    const availableContainerEquiv =
      getInboundOrderContainerStockColumns(order).availableContainerEquiv;
    const incoming = {
      value: mapKey,
      label: bl ? bl : `${bk} (BK)`,
      salesStatus: order.salesStatus ?? null,
      perContainerBales: perContainerBalesForOrder(order),
      etaDate: (order.etaDate ?? '').trim() || null,
      salesGrades: new Set(grades),
      availableContainerEquiv,
    };
    if (!map.has(code)) map.set(code, new Map());
    const blMap = map.get(code)!;
    const existing = blMap.get(mapKey);
    if (!existing) {
      blMap.set(mapKey, incoming);
    } else {
      for (const g of grades) {
        existing.salesGrades.add(g);
      }
      existing.availableContainerEquiv = Math.max(
        existing.availableContainerEquiv,
        incoming.availableContainerEquiv,
      );
      const da = etaSortKey(incoming.etaDate);
      const db = etaSortKey(existing.etaDate);
      if (da < db) {
        existing.etaDate = incoming.etaDate;
        existing.salesStatus = incoming.salesStatus;
        existing.perContainerBales = incoming.perContainerBales;
      }
      if (bl) {
        existing.value = bl;
        existing.label = bl;
      }
    }
  }
  const result: Record<string, BuiltSheetBlOption[]> = {};
  for (const [code, blMap] of map) {
    const rows = Array.from(blMap.values()).map((row) => {
      const salesGradesForProduct =
        row.salesGrades.size > 0
          ? [...row.salesGrades].sort((a, b) => a.localeCompare(b, 'ko'))
          : undefined;
      const { salesGrades: _s, ...rest } = row;
      return { ...rest, salesGradesForProduct };
    });
    rows.sort((a, b) => {
      const da = etaSortKey(a.etaDate);
      const db = etaSortKey(b.etaDate);
      if (da !== db) return da - db;
      return a.value.localeCompare(b.value, 'ko');
    });
    result[code] = rows;
  }
  return result;
}
