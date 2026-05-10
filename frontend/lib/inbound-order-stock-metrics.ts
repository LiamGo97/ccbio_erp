import type { TradeContainerDto, TradeOrder } from '@/lib/hooks/use-trade-orders';

/** 판매예약·입고확정 재고와 동일: 컨당 베일(또는 중량) 비율로 컨 상당 */
export function nz(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(Number(v))) return 0;
  return Number(v);
}

export function effectiveBales(c: TradeContainerDto): number {
  const b = nz(c.bales);
  if (b > 0) return b;
  if (c.salesBales != null) return nz(Number(c.salesBales));
  return nz(c.tradeBales);
}

/** DB에 컨당 베일이 비어 있거나 비정상적으로 작을 때 영업 예약·가용 환산용 분모 보강 */
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

function orderAvgEffectiveBales(orderCs: TradeContainerDto[]): number {
  const cs = orderCs.filter((c) => c.excludeFromInventory !== true);
  if (!cs.length) return 0;
  return cs.reduce((s, c) => s + effectiveBales(c), 0) / cs.length;
}

function capacityBalesDenomForContainerEquiv(c: TradeContainerDto, orderCs: TradeContainerDto[]): number {
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

/** 컨테이너 한 줄 — 판매대시보드 통관 전 재고 `getInboundScheduledContainerEquivalents` 와 동일 규칙 */
export type InboundStockContainerSlice = {
  bales?: number | null;
  weight?: number | null;
  availableBales?: number | null;
  reservedBales?: number | null;
  completedBales?: number | null;
  sheetReservationBales?: number | null;
  availableWeight?: number | null;
  reservedWeight?: number | null;
  completedWeight?: number | null;
  sheetReservationWeight?: number | null;
  excludeFromInventory?: boolean | null;
};

/** 판매예약(그리드)을 컨별 베일로 나눠 합산 — 구 API·폴백용 */
function sumContainerStockEquivsLegacy(
  containers: TradeContainerDto[] | null | undefined,
): { availableCnt: number; reservedCnt: number; soldCnt: number } {
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

/** 시트 예약을 제외하고 컨당 환산(영업 예약·가용·판매만) */
export function sumPerContainerSalesAndAvailabilityEquiv(
  containers: TradeContainerDto[] | null | undefined,
): { availableCnt: number; reservedSalesCnt: number; soldCnt: number } {
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

function orderTotalEffectiveBales(cs: TradeContainerDto[]): number {
  return cs.reduce((s, c) => s + effectiveBales(c), 0);
}

function orderTotalWeight(cs: TradeContainerDto[]): number {
  return cs.reduce(
    (s, c) => s + (c.weight != null && c.weight > 0 ? Number(c.weight) : 0),
    0,
  );
}

/**
 * BL 단위: 판매관리 예약은 중량(MT) 우선 — (예약 톤 / BL 총 중량) × 컨 수.
 * 베일 폴백만 있으면 (예약 베일 / BL 총 베일) × 컨 수. 시트는 컨 단위 그대로.
 */
export function orderLevelMgmtAndGridContainerEquiv(
  orderCs: TradeContainerDto[],
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

export function containerRowHasReservationBreakdown(c: TradeContainerDto | undefined): boolean {
  if (!c) return false;
  return (
    'salesMgmtReservationBalesByBl' in c ||
    'salesMgmtReservationWeightMtByBl' in c ||
    'gridSheetReservationContainerUnits' in c
  );
}

/**
 * 통관 전 재고·컨 목록: 백엔드가 분리 필드를 주면 BL 단위 시트 환산, 없으면 레거시(컨별 시트 베일 합산).
 */
export function sumInboundScheduledContainerEquivs(
  containers: TradeContainerDto[] | null | undefined,
): { availableCnt: number; reservedCnt: number; soldCnt: number } {
  const orderCs = containers ?? [];
  const first = orderCs.find((c) => c.excludeFromInventory !== true) ?? orderCs[0];
  if (!containerRowHasReservationBreakdown(first)) {
    const leg = sumContainerStockEquivsLegacy(orderCs);
    const n = orderCs.filter((c) => c.excludeFromInventory !== true).length;
    const availableCnt = n - leg.soldCnt - leg.reservedCnt;
    return { availableCnt, reservedCnt: leg.reservedCnt, soldCnt: leg.soldCnt };
  }
  const cs = orderCs.filter((c) => c.excludeFromInventory !== true);
  const n = cs.length;
  const { reservedSalesCnt, soldCnt } = sumPerContainerSalesAndAvailabilityEquiv(cs);
  const reservedCnt =
    reservedSalesCnt +
    orderLevelMgmtAndGridContainerEquiv(cs, n, {
      salesMgmtReservationBalesByBl: first.salesMgmtReservationBalesByBl,
      salesMgmtReservationWeightMtByBl: first.salesMgmtReservationWeightMtByBl,
      gridSheetReservationContainerUnits: first.gridSheetReservationContainerUnits,
    });
  const availableCnt = n - soldCnt - reservedCnt;
  return { availableCnt, reservedCnt, soldCnt };
}

/** @deprecated sumInboundScheduledContainerEquivs 사용 권장 */
export function sumContainerStockEquivs(
  containers: TradeContainerDto[] | null | undefined,
): { availableCnt: number; reservedCnt: number; soldCnt: number } {
  return sumInboundScheduledContainerEquivs(containers);
}

/**
 * 예약은 그대로 두고, 가용재고(컨 상당)는 **컨 수 − 판매(컨 상당) − 예약(컨 상당)** 으로 맞춘다.
 * (표시되는 판매·예약과 동일 정의를 쓰므로 행 단위로 합이 맞아 떨어진다.)
 */
export function normalizeInboundReservedAvailableDisplay(
  reservedCnt: number,
  containerCount: number,
  soldCnt: number,
): { reservedDisplay: number; availableDisplay: number } {
  return {
    reservedDisplay: reservedCnt,
    availableDisplay: containerCount - soldCnt - reservedCnt,
  };
}

function tradeOrderHasReservationBreakdown(order: TradeOrder): boolean {
  return (
    'salesMgmtReservationBalesByBl' in order ||
    'salesMgmtReservationWeightMtByBl' in order ||
    'gridSheetReservationContainerUnits' in order
  );
}

/**
 * 입고 대기·입고 예정·입고 확정 등 동일.
 * - **분리 필드 있음**(주문에 `salesMgmtReservation*` / `gridSheetReservationContainerUnits`):
 *   - **판매(컨 상당)** (판매 대시보드 주간재고): 완료(`completedBales`) + 영업 판매항목 예약·판매중(`reservedBales` 시트 제외) 환산 합.
 *   - **예약(컨 상당)** (동일): **판매관리(tb) BL 예약** + **판매예약 시트** 만 (`orderLevelMgmtAndGridContainerEquiv`).
 *   - **가용재고(컨 상당)**: 컨별 API `availableBales`·`availableWeight` 환산 합 (역산 아님).
 * - **분리 필드 없음**(구 API): `sumContainerStockEquivsLegacy` 그대로 — 컨별 시트 베일이 예약 쪽에 포함될 수 있음.
 */
export function getInboundOrderContainerStockColumns(order: TradeOrder) {
  const cs = (order.containers ?? []).filter((c) => c.excludeFromInventory !== true);
  const n = cs.length;
  if (!tradeOrderHasReservationBreakdown(order)) {
    const { reservedCnt, soldCnt, availableCnt } = sumContainerStockEquivsLegacy(cs);
    return {
      containerCount: n,
      soldContainerEquiv: soldCnt,
      reservedContainerEquiv: reservedCnt,
      availableContainerEquiv: availableCnt,
    };
  }
  const { availableCnt, reservedSalesCnt, soldCnt } = sumPerContainerSalesAndAvailabilityEquiv(cs);
  const sheetAndMgmtReservedOnly = orderLevelMgmtAndGridContainerEquiv(cs, n, {
    salesMgmtReservationBalesByBl: order.salesMgmtReservationBalesByBl,
    salesMgmtReservationWeightMtByBl: order.salesMgmtReservationWeightMtByBl,
    gridSheetReservationContainerUnits: order.gridSheetReservationContainerUnits,
  });
  return {
    containerCount: n,
    soldContainerEquiv: reservedSalesCnt + soldCnt,
    reservedContainerEquiv: sheetAndMgmtReservedOnly,
    availableContainerEquiv: availableCnt,
  };
}
