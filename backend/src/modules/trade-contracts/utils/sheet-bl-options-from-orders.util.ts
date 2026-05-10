/**
 * 판매예약 시트 BL 드롭다운 — 프론트 `sheet-bl-options-from-trade-orders` +
 * `inbound-order-stock-metrics` 가용(컨 상당)과 동일 규칙 (finalize된 주문 DTO 기준).
 */

type AnyCont = Record<string, any>;
type AnyOrder = Record<string, any>;

export type SheetBlOptionRow = {
  value: string;
  label: string;
  salesStatus: string | null;
  etaDate?: string | null;
  perContainerBales?: number;
  salesGradesForProduct?: string[];
  /** 드롭다운 가용재고(컨 상당) 표시용 */
  availableContainerEquiv?: number;
};

function nz(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(Number(v))) return 0;
  return Number(v);
}

function effectiveBales(c: AnyCont): number {
  const b = nz(c.bales);
  if (b > 0) return b;
  if (c.salesBales != null) return nz(Number(c.salesBales));
  return nz(c.tradeBales);
}

const MIN_TRUSTED_BALES_PER_CONTAINER = 72;
const PACKING_DEFAULT_BALES_PER_CONTAINER: Record<string, number> = {
  SMALL_BALE: 400,
  BIG_BALE: 200,
  SLEEVE_BALE: 280,
};

function defaultBalesPerContainerFromPacking(packing: string | null | undefined): number {
  if (!packing?.trim()) return 0;
  const k = packing.trim().toUpperCase();
  return PACKING_DEFAULT_BALES_PER_CONTAINER[k] ?? 0;
}

function orderAvgEffectiveBales(orderCs: AnyCont[]): number {
  const cs = orderCs.filter((c) => c.excludeFromInventory !== true);
  if (!cs.length) return 0;
  return cs.reduce((s, c) => s + effectiveBales(c), 0) / cs.length;
}

function capacityBalesDenomForContainerEquiv(c: AnyCont, orderCs: AnyCont[]): number {
  let d = effectiveBales(c);
  if (d <= 0) return 0;
  const sheet = nz(c.sheetReservationBales);
  const reserved = nz(c.reservedBales);
  const completed = nz(c.completedBales);
  const impliedLoad = sheet > 0 || reserved > 0 || completed > 0;
  const packingDef = defaultBalesPerContainerFromPacking(c.packingType);
  const avg = orderAvgEffectiveBales(orderCs);
  if (d < MIN_TRUSTED_BALES_PER_CONTAINER && impliedLoad && sheet > d) {
    d = Math.max(d, packingDef || 0, avg > d * 1.2 ? avg : 0);
  }
  if (sheet > d * 1.2) {
    d = Math.max(d, avg > d * 1.05 ? avg : 0, packingDef || 0);
  }
  return d;
}

function nzSheetBales(c: { sheetReservationBales?: number | null }): number {
  const v = c.sheetReservationBales;
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nzSheetWeight(c: { sheetReservationWeight?: number | null }): number {
  const v = c.sheetReservationWeight;
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumContainerStockEquivsLegacy(containers: AnyCont[] | null | undefined): {
  availableCnt: number;
  reservedCnt: number;
  soldCnt: number;
} {
  const orderCs = containers ?? [];
  let availableCnt = 0;
  let reservedCnt = 0;
  let soldCnt = 0;
  for (const c of orderCs) {
    if (c.excludeFromInventory === true) continue;
    const capBales = capacityBalesDenomForContainerEquiv(c, orderCs);
    const weight = c.weight != null && c.weight > 0 ? Number(c.weight) : 0;
    const useBales = capBales > 0;
    const denom = useBales ? capBales : weight;
    if (denom <= 0) continue;
    if (useBales) {
      const availB = c.availableBales != null ? Number(c.availableBales) : 0;
      const reservedB = (c.reservedBales != null ? Number(c.reservedBales) : 0) + nzSheetBales(c);
      const completedB = c.completedBales != null ? Number(c.completedBales) : 0;
      availableCnt += availB / denom;
      reservedCnt += reservedB / denom;
      soldCnt += completedB / denom;
    } else {
      const availW = c.availableWeight != null ? Number(c.availableWeight) : 0;
      const reservedW = (c.reservedWeight != null ? Number(c.reservedWeight) : 0) + nzSheetWeight(c);
      const completedW = c.completedWeight != null ? Number(c.completedWeight) : 0;
      availableCnt += availW / denom;
      reservedCnt += reservedW / denom;
      soldCnt += completedW / denom;
    }
  }
  return { availableCnt, reservedCnt, soldCnt };
}

function sumPerContainerSalesAndAvailabilityEquiv(containers: AnyCont[] | null | undefined): {
  availableCnt: number;
  reservedSalesCnt: number;
  soldCnt: number;
} {
  const orderCs = containers ?? [];
  let availableCnt = 0;
  let reservedSalesCnt = 0;
  let soldCnt = 0;
  for (const c of orderCs) {
    if (c.excludeFromInventory === true) continue;
    const capBales = capacityBalesDenomForContainerEquiv(c, orderCs);
    const weight = c.weight != null && c.weight > 0 ? Number(c.weight) : 0;
    const useBales = capBales > 0;
    const denom = useBales ? capBales : weight;
    if (denom <= 0) continue;
    if (useBales) {
      availableCnt += (c.availableBales != null ? Number(c.availableBales) : 0) / denom;
      reservedSalesCnt += (c.reservedBales != null ? Number(c.reservedBales) : 0) / denom;
      soldCnt += (c.completedBales != null ? Number(c.completedBales) : 0) / denom;
    } else {
      availableCnt += (c.availableWeight != null ? Number(c.availableWeight) : 0) / denom;
      reservedSalesCnt += (c.reservedWeight != null ? Number(c.reservedWeight) : 0) / denom;
      soldCnt += (c.completedWeight != null ? Number(c.completedWeight) : 0) / denom;
    }
  }
  return { availableCnt, reservedSalesCnt, soldCnt };
}

function orderTotalEffectiveBales(cs: AnyCont[]): number {
  return cs.reduce((s, c) => s + effectiveBales(c), 0);
}

function orderTotalWeight(cs: AnyCont[]): number {
  return cs.reduce((s, c) => s + (c.weight != null && c.weight > 0 ? Number(c.weight) : 0), 0);
}

function orderLevelMgmtAndGridContainerEquiv(
  orderCs: AnyCont[],
  containerCount: number,
  breakdown: {
    salesMgmtReservationBalesByBl?: number | null;
    salesMgmtReservationWeightMtByBl?: number | null;
    gridSheetReservationContainerUnits?: number | null;
  },
): number {
  const mgmtBales = nz(breakdown.salesMgmtReservationBalesByBl);
  const mgmtWt = nz(breakdown.salesMgmtReservationWeightMtByBl);
  const gridCont = nz(breakdown.gridSheetReservationContainerUnits);
  const totalBales = orderTotalEffectiveBales(orderCs);
  const totalWt = orderTotalWeight(orderCs);
  let mgmtCont = 0;
  if (totalWt > 0 && mgmtWt > 0) {
    mgmtCont += (mgmtWt * containerCount) / totalWt;
  }
  if (mgmtBales > 0 && totalBales > 0) {
    mgmtCont += (mgmtBales * containerCount) / totalBales;
  }
  return mgmtCont + gridCont;
}

function normalizeInboundReservedAvailableDisplay(
  reservedCnt: number,
  containerCount: number,
  soldCnt: number,
): { reservedDisplay: number; availableDisplay: number } {
  return {
    reservedDisplay: reservedCnt,
    availableDisplay: containerCount - soldCnt - reservedCnt,
  };
}

function tradeOrderHasReservationBreakdown(order: AnyOrder): boolean {
  return (
    'salesMgmtReservationBalesByBl' in order ||
    'salesMgmtReservationWeightMtByBl' in order ||
    'gridSheetReservationContainerUnits' in order
  );
}

function getInboundOrderContainerStockColumns(order: AnyOrder): { availableContainerEquiv: number } {
  const cs = (order.containers ?? []).filter((c: AnyCont) => c.excludeFromInventory !== true);
  const n = cs.length;
  if (!tradeOrderHasReservationBreakdown(order)) {
    const { reservedCnt, soldCnt } = sumContainerStockEquivsLegacy(cs);
    const { availableDisplay } = normalizeInboundReservedAvailableDisplay(reservedCnt, n, soldCnt);
    return { availableContainerEquiv: availableDisplay };
  }
  const { reservedSalesCnt, soldCnt } = sumPerContainerSalesAndAvailabilityEquiv(cs);
  const reservedCnt =
    reservedSalesCnt +
    orderLevelMgmtAndGridContainerEquiv(cs, n, {
      salesMgmtReservationBalesByBl: order.salesMgmtReservationBalesByBl,
      salesMgmtReservationWeightMtByBl: order.salesMgmtReservationWeightMtByBl,
      gridSheetReservationContainerUnits: order.gridSheetReservationContainerUnits,
    });
  const { availableDisplay } = normalizeInboundReservedAvailableDisplay(reservedCnt, n, soldCnt);
  return { availableContainerEquiv: availableDisplay };
}

function perContainerBalesForOrder(order: AnyOrder): number {
  const cs = (order.containers ?? []).filter((c: AnyCont) => c.excludeFromInventory !== true);
  if (cs.length === 0) return 0;
  return effectiveBales(cs[0]!);
}

function etaSortKey(etaDate: string | null | undefined): number {
  if (etaDate == null || etaDate === '') return Number.POSITIVE_INFINITY;
  const t = new Date(etaDate).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function collectSalesGradesForOrderProduct(order: AnyOrder, code: string): Set<string> {
  const out = new Set<string>();
  for (const container of order.containers ?? []) {
    if (container.excludeFromInventory === true) continue;
    const containerProductRaw = String(container.product ?? '').trim();
    const rowProduct: string = containerProductRaw !== '' ? containerProductRaw : code;
    if (rowProduct !== code) continue;
    const g = (container.salesGrade ?? '').trim();
    if (g) out.add(g);
  }
  return out;
}

export function buildBlOptionsByProductCodeFromOrders(mergedOrders: AnyOrder[]): Record<string, SheetBlOptionRow[]> {
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
    const code = String((order.productCode ?? order.containers?.[0]?.product) ?? '').trim();
    const bl = String(order.bl ?? '').trim();
    const bk = String(order.bk ?? '').trim();
    if (!code || (!bl && !bk)) continue;
    const mapKey = bl || bk;
    const grades = collectSalesGradesForOrderProduct(order, code);
    const etaRaw = order.etaDate != null && String(order.etaDate).trim() !== '' ? String(order.etaDate).trim() : null;
    const availableContainerEquiv = getInboundOrderContainerStockColumns(order).availableContainerEquiv;
    const incoming = {
      value: mapKey,
      label: bl ? bl : `${bk} (BK)`,
      salesStatus: order.salesStatus ?? null,
      perContainerBales: perContainerBalesForOrder(order),
      etaDate: etaRaw,
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
  const result: Record<string, SheetBlOptionRow[]> = {};
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

/** 그리드 `filterBlOptionsBySalesGrade` 와 동일 */
export function filterSheetBlOptionsBySalesGrade(
  options: SheetBlOptionRow[],
  selectedGrade: string,
): SheetBlOptionRow[] {
  const g = selectedGrade.trim();
  if (!g) return options;
  return options.filter((o) => {
    const sg = o.salesGradesForProduct;
    if (!sg || sg.length === 0) return true;
    return sg.includes(g);
  });
}
