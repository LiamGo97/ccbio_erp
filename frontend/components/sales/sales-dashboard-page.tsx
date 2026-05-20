'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { useIssuedInvoices } from '@/lib/hooks/use-invoices';
import { useTradeOrders, type TradeContainerDto, type TradeOrder } from '@/lib/hooks/use-trade-orders';
import {
  normalizeInboundReservedAvailableDisplay,
  sumInboundScheduledContainerEquivs,
  sumPerContainerSalesAndAvailabilityEquiv,
  orderLevelMgmtAndGridContainerEquiv,
  containerRowHasReservationBreakdown,
} from '@/lib/inbound-order-stock-metrics';
import { useContainersConfirmed, useContainersScheduled } from '@/lib/hooks/use-trade-contracts';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { MonthPicker } from '@/components/schedules/month-picker';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Printer } from 'lucide-react';

const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });

function createPrintHandler(printId: string) {
  return () => {
    const styleId = 'print-dashboard-style';
    const wrapperId = 'print-clone-wrapper';
    document.getElementById(styleId)?.remove();
    document.getElementById(wrapperId)?.remove();

    const el = document.querySelector(`[data-print-id="${printId}"]`);
    if (!el) return;

    const clone = el.cloneNode(true) as HTMLElement;
    const wrapper = document.createElement('div');
    wrapper.id = wrapperId;
    wrapper.className = 'print-clone-wrapper';
    wrapper.appendChild(clone);
    document.body.prepend(wrapper);

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @media print {
        @page { size: A4 landscape; margin: 12mm; }
        body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body > *:not(.print-clone-wrapper) { display: none !important; }
        .print-clone-wrapper {
          display: block !important;
          width: 100% !important;
          position: static !important;
          background: #fff !important;
          padding: 0 !important;
        }
        .print-clone-wrapper a[href]::after { content: none !important; }
        .no-print { display: none !important; visibility: hidden !important; }
        .print-hide-col { display: none !important; }
        .print-clone-wrapper [data-slot="card"] {
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          background: transparent !important;
          gap: 0 !important;
        }
        .print-clone-wrapper [data-slot="card-header"] {
          padding: 0 0 8px 0 !important;
        }
        .print-clone-wrapper [data-slot="card-content"] {
          padding: 0 !important;
          overflow: hidden !important;
        }
        .print-clone-wrapper .overflow-x-auto { overflow-x: hidden !important; overflow-y: visible !important; }
        .print-clone-wrapper table { width: 100% !important; min-width: 0 !important; border-collapse: collapse; }
        .print-clone-wrapper th, .print-clone-wrapper td { border: 1px solid #333; padding: 6px 8px; }
        .print-clone-wrapper td { font-size: 12px !important; }
        /* 카테고리별 section에 avoid를 주면 다음 표가 한 페이지에 안 들어갈 때 위쪽에 큰 빈 여백이 생김 → 표는 페이지를 넘겨 나눔 */
        .print-clone-wrapper [data-slot="card"],
        .print-clone-wrapper section {
          page-break-inside: auto !important;
        }
        .print-clone-wrapper table { page-break-inside: auto !important; }
        .print-clone-wrapper thead { display: table-header-group !important; }
        .print-clone-wrapper tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        .notes-cell-print { max-width: none !important; overflow: visible !important; text-overflow: clip !important; white-space: normal !important; word-break: break-word !important; }
        .notes-col-print { max-width: none !important; }
        /* 주간재고: 인쇄 시 차트 숨김 */
        .print-clone-wrapper .print-chart-section { display: none !important; }
        /* 주간재고: 인쇄 시 섹션별 구분선·위 여백 축소 (화면용 space-y-6 완화) */
        .print-clone-wrapper section { border-top: none !important; padding-top: 0 !important; }
        .print-clone-wrapper .space-y-6 > :not([hidden]) ~ * { margin-top: 0.5rem !important; }
        .print-clone-wrapper section > h3 { margin-bottom: 0.35rem !important; }
      }
      @media screen {
        .print-clone-wrapper { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    const cleanup = () => {
      document.getElementById(styleId)?.remove();
      document.getElementById(wrapperId)?.remove();
      window.onafterprint = null;
    };
    window.onafterprint = cleanup;
    setTimeout(cleanup, 500);
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

/** 입력 운임비 등 원화 정수 — 괄호 안 표기용 */
function formatWonIntegerPlain(value: number): string {
  return Math.round(value).toLocaleString('ko-KR', { maximumFractionDigits: 0 });
}

/** kg당 마진 (소수 둘째 자리) — 판매 상세·발행대기 목록과 동일 계열 */
function formatMarginPerKg(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 창고 작업비(원/kg) — 소수부가 0이면 정수만 표시 (0, 12 / 12.5는 그대로) */
function formatWorkFeePerKg(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** 마진·운임비와 동일 소스의 중량(톤) → 화면·CSV용 kg */
function formatWeightKgFromTon(ton: number | null | undefined): string {
  if (ton == null || Number.isNaN(ton) || !Number.isFinite(ton)) return '—';
  const kg = ton * 1000;
  return kg.toLocaleString('ko-KR', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/** 판매관리 상품정보(`app/sales/page.tsx`)와 동일 뱃지 스타일 */
function salesUnitPriceStageBadgeClassName(stage: string): string {
  if (stage === 'LOADING') {
    return 'text-xs border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
  }
  if (stage === 'ARRIVAL') {
    return 'text-xs border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300';
  }
  if (stage === 'UNLOADING') {
    return 'text-xs border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
  }
  return 'text-xs border-slate-500 bg-slate-50 text-slate-700 dark:border-slate-400 dark:bg-slate-950/30 dark:text-slate-300';
}

/**
 * 운송비 → kg당 — `SalesService.calculateTransportFeePerKg` 와 동일.
 * 판매(`sales`) 단위 전체 운송비를 **같은 판매의 컨테이너 중량 합**으로 비율 배분한 뒤 해당 행 중량(톤)으로 kg당 환산.
 */
function transportFeePerKgSalesAligned(
  totalTransportFee: number | null | undefined,
  containerWeightTon: number | null | undefined,
  totalSaleWeightTon: number | null | undefined,
): number {
  if (totalTransportFee == null || !Number.isFinite(totalTransportFee) || totalTransportFee === 0) return 0;
  if (
    containerWeightTon == null ||
    !Number.isFinite(containerWeightTon) ||
    containerWeightTon === 0 ||
    totalSaleWeightTon == null ||
    !Number.isFinite(totalSaleWeightTon) ||
    totalSaleWeightTon === 0
  ) {
    return 0;
  }
  const weightRatio = containerWeightTon / totalSaleWeightTon;
  const allocatedTransportFee = totalTransportFee * weightRatio;
  return allocatedTransportFee / (containerWeightTon * 1000);
}

function saleIdFromInvoiceLine(item: {
  salesItem?: {
    salesId?: string | number | null;
    sales?: { id?: string | number | null } | null;
  } | null;
}): string | null {
  const si = item.salesItem;
  if (!si) return null;
  if (si.salesId != null && String(si.salesId).trim() !== '') return String(si.salesId);
  if (si.sales?.id != null && String(si.sales.id).trim() !== '') return String(si.sales.id);
  return null;
}

/** 명세 품목 기준 kg당 운임비(운송비). `marginPerKgFromInvoiceItem`과 동일 배분. */
function transportFeePerKgFromInvoiceItem(
  item: {
    salesItem?: {
      containerType?: string | null;
      cargoWeight?: string | number | null;
      container?: { weight?: string | number | null } | null;
      sales?: { transportFee?: string | number | null } | null;
    } | null;
  },
  totalSaleWeightTon: number | null | undefined,
): number | null {
  const si = item.salesItem;
  if (!si) return null;
  const container = si.container;
  const containerType = si.containerType === 'CARGO' ? 'CARGO' : 'CONTAINER';
  const weightTon =
    containerType === 'CARGO' && si.cargoWeight != null && String(si.cargoWeight).trim() !== ''
      ? Number(si.cargoWeight)
      : container?.weight != null && String(container.weight).trim() !== ''
        ? Number(container.weight)
        : null;
  const transportFee = si.sales?.transportFee != null ? Number(si.sales.transportFee) : null;
  const totalW =
    totalSaleWeightTon != null && totalSaleWeightTon > 0
      ? totalSaleWeightTon
      : weightTon != null && weightTon > 0
        ? weightTon
        : null;
  return transportFeePerKgSalesAligned(transportFee, weightTon, totalW);
}

/**
 * 거래명세서 품목 + 연동 판매항목으로 kg당 마진.
 * `SalesService` 판매 상세 상품행과 동일: 판매단가(si) − 원가(입고상태별) − 운송비/kg(같은 판매 중량 비율 배분). STO·DT는 여기서는 빼지 않음(백엔드 상세와 동일).
 */
function marginPerKgFromInvoiceItem(
  item: {
    unitPrice?: number | null;
    weight?: number | null;
    salesItem?: {
      salesUnitPrice?: string | number | null;
      containerType?: string | null;
      cargoWeight?: string | number | null;
      container?: {
        weight?: string | number | null;
        confirmedPurchaseCost?: string | number | null;
        pendingPurchaseCost?: string | number | null;
        order?: {
          inboundStatus?: string | null;
          inbounds?: Array<{
            status?: string | null;
            comparisonPurchaseCost?: string | number | null;
          }> | null;
        } | null;
      } | null;
      sales?: { transportFee?: string | number | null } | null;
    } | null;
  },
  /** 같은 판매(sa_id)에 속한 명세 품목들의 중량(톤) 합. 없으면 해당 행 중량만으로 비율 1로 간주 */
  totalSaleWeightTon: number | null | undefined,
): number | null {
  const si = item.salesItem;
  if (!si) return null;
  const container = si.container;
  const containerType = si.containerType === 'CARGO' ? 'CARGO' : 'CONTAINER';
  const weightTon =
    containerType === 'CARGO' && si.cargoWeight != null && String(si.cargoWeight).trim() !== ''
      ? Number(si.cargoWeight)
      : container?.weight != null && String(container.weight).trim() !== ''
        ? Number(container.weight)
        : null;
  const salesUnitPriceNum =
    si.salesUnitPrice != null && String(si.salesUnitPrice).trim() !== ''
      ? Number(si.salesUnitPrice)
      : item.unitPrice != null && !Number.isNaN(Number(item.unitPrice))
        ? Number(item.unitPrice)
        : null;

  const order = container?.order;
  const inboundStatus = order?.inboundStatus ?? null;
  const pendingInboundForMargin = order?.inbounds?.find((i) => String(i?.status ?? '').toUpperCase() === 'PENDING');
  let purchaseCost: number | null = null;
  if (inboundStatus === 'INBOUND_CONFIRMED') {
    purchaseCost =
      container?.confirmedPurchaseCost != null && String(container.confirmedPurchaseCost).trim() !== ''
        ? Number(container.confirmedPurchaseCost)
        : null;
  } else {
    if (
      pendingInboundForMargin?.comparisonPurchaseCost != null &&
      String(pendingInboundForMargin.comparisonPurchaseCost).trim() !== ''
    ) {
      purchaseCost = Number(pendingInboundForMargin.comparisonPurchaseCost);
    } else if (
      container?.pendingPurchaseCost != null &&
      String(container.pendingPurchaseCost).trim() !== ''
    ) {
      purchaseCost = Number(container.pendingPurchaseCost);
    }
  }

  const tfPerKg =
    transportFeePerKgFromInvoiceItem(item, totalSaleWeightTon) ?? 0;

  if (
    salesUnitPriceNum == null ||
    Number.isNaN(salesUnitPriceNum) ||
    purchaseCost == null ||
    Number.isNaN(purchaseCost)
  ) {
    return null;
  }
  return salesUnitPriceNum - purchaseCost - tfPerKg;
}

/** 컨테이너 창고+현장 작업비 합(원) — 명세 컨테이너와 동일 소스. */
function workFeePerKgFromInvoiceItem(item: {
  salesItem?: {
    container?: { workFee?: string | number | null; onsiteWorkFee?: string | number | null } | null;
  } | null;
}): number | null {
  const c = item.salesItem?.container;
  const w = c?.workFee;
  const o = c?.onsiteWorkFee;
  const nw = w != null && String(w).trim() !== '' ? Number(w) : 0;
  const no = o != null && String(o).trim() !== '' ? Number(o) : 0;
  if ((w == null || String(w).trim() === '') && (o == null || String(o).trim() === '')) return null;
  if (Number.isNaN(nw) && Number.isNaN(no)) return null;
  return (Number.isNaN(nw) ? 0 : nw) + (Number.isNaN(no) ? 0 : no);
}

/** 품목 기준 톤 중량(마진액 합계용). 명세 품목 weight(톤) 우선. */
function lineWeightTonForMargin(item: {
  weight?: number | null;
  salesItem?: {
    containerType?: string | null;
    cargoWeight?: string | number | null;
    container?: { weight?: string | number | null } | null;
  } | null;
}): number | null {
  if (item.weight != null && !Number.isNaN(Number(item.weight))) return Number(item.weight);
  const si = item.salesItem;
  if (!si) return null;
  const container = si.container;
  const containerType = si.containerType === 'CARGO' ? 'CARGO' : 'CONTAINER';
  if (containerType === 'CARGO' && si.cargoWeight != null && String(si.cargoWeight).trim() !== '') {
    return Number(si.cargoWeight);
  }
  if (container?.weight != null && String(container.weight).trim() !== '') return Number(container.weight);
  return null;
}

/** 거래명세서(InvoiceIssueDrawer)와 동일: 패킹 코드 → 한글 축약 */
function packingAbbreviationForInventory(
  packing: string | null | undefined,
  packingCodes: Array<{ value?: string | null; name?: string | null }>
): string | null {
  if (!packing?.trim()) return null;
  const trimmed = packing.trim();
  const packingUpper = trimmed.toUpperCase();
  const packingKey = packingUpper.replace(/\s+/g, '_');
  if (packingKey === 'BIG_BALE') return '빅';
  if (packingKey === 'SMALL_BALE') return '스';
  if (packingKey === 'SLEEVE_BALE') return '슬';
  if (packingKey === 'HEAVY_BALE' || packingKey === 'HEAVY_BALES') return '헤';
  const packingCode = packingCodes.find(
    (c) => c.value === trimmed || c.name === trimmed || (c.value && c.value.toUpperCase() === packingUpper)
  );
  if (packingCode?.value) {
    const codeKey = packingCode.value.toUpperCase().replace(/\s+/g, '_');
    if (codeKey === 'BIG_BALE') return '빅';
    if (codeKey === 'SMALL_BALE') return '스';
    if (codeKey === 'SLEEVE_BALE') return '슬';
    if (codeKey === 'HEAVY_BALE' || codeKey === 'HEAVY_BALES') return '헤';
  }
  return trimmed;
}

/** 송장 금액: 통화 있으면 기호만 표시 ($, €, ₩ 등), 없으면 숫자만 (원화 가정 안 함) */
const INVOICE_CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', EUR: '€', KRW: '₩', GBP: '£', JPY: '¥', CNY: '¥', CHF: 'CHF', AUD: 'A$', CAD: 'C$',
};
function formatInvoiceAmount(amount: number, currencyCode?: string | null): string {
  const formatted = amount.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const code = currencyCode?.trim().toUpperCase();
  if (!code) return formatted;
  const symbol = INVOICE_CURRENCY_SYMBOL[code] ?? code;
  return `${symbol} ${formatted}`;
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatMonthDay(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  const csv = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getThisWeekDateRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const from = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const to = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
  return { from, to };
}

function getThisMonthDateRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function getMonthDateRange(ym: string): { from: string; to: string } {
  const [year, month] = ym.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

const INVENTORY_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '가용',
  RESERVED: '예약됨',
  PARTIALLY_RESERVED: '부분 예약',
  PARTIALLY_SOLD: '부분 판매중',
  PARTIALLY_SOLD_COMPLETED: '부분 판매완료',
  SELLING: '판매중',
  SOLD_OUT: '판매 완료',
};

function inboundScheduledContainersForStock(containers: TradeContainerDto[] | null | undefined) {
  return (containers ?? []).filter((c) => c.excludeFromInventory !== true);
}

/** 통관 전 재고: 입고 예정과 동일 — 판매관리(BL 베일 비율) + 시트(컨) 분리 */
function getInboundScheduledContainerEquivalents(containers: TradeContainerDto[] | null | undefined) {
  return sumInboundScheduledContainerEquivs(inboundScheduledContainersForStock(containers));
}

function getInboundScheduledDisplayCounts(containers: TradeContainerDto[] | null | undefined) {
  const cs = inboundScheduledContainersForStock(containers);
  const containerCount = cs.length;
  const { reservedCnt, soldCnt } = sumInboundScheduledContainerEquivs(cs);
  return normalizeInboundReservedAvailableDisplay(reservedCnt, containerCount, soldCnt);
}

/** 입항 예정 등 `TradeOrder` 목록: 주문에만 BL 단위 분리 필드가 있으면 첫 컨에 합쳐 통관 전 재고와 동일 환산 */
function orderHasBlReservationBreakdown(order: TradeOrder): boolean {
  return (
    'salesMgmtReservationBalesByBl' in order ||
    'salesMgmtReservationWeightMtByBl' in order ||
    'gridSheetReservationContainerUnits' in order
  );
}

function containersWithOrderBlBreakdownForStock(order: TradeOrder): TradeContainerDto[] {
  const cs = order.containers ?? [];
  if (!orderHasBlReservationBreakdown(order)) return cs;
  const firstIdx = cs.findIndex((c) => c.excludeFromInventory !== true);
  if (firstIdx < 0) return cs;
  const first = cs[firstIdx];
  if (containerRowHasReservationBreakdown(first)) return cs;
  return cs.map((c, i) =>
    i === firstIdx
      ? {
          ...c,
          salesMgmtReservationBalesByBl: order.salesMgmtReservationBalesByBl ?? null,
          salesMgmtReservationWeightMtByBl: order.salesMgmtReservationWeightMtByBl ?? null,
          gridSheetReservationContainerUnits: order.gridSheetReservationContainerUnits ?? null,
        }
      : c,
  );
}

function getTradeOrderInboundScheduledDisplayCounts(order: TradeOrder) {
  return getInboundScheduledDisplayCounts(containersWithOrderBlBreakdownForStock(order));
}

function getTradeOrderInboundScheduledContainerEquivalents(order: TradeOrder) {
  return getInboundScheduledContainerEquivalents(containersWithOrderBlBreakdownForStock(order));
}

function coerceSheetReservationNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string' && value.trim() === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 가용재고 등 컨 상당: 부동소수점으로 -0·극소 음수가 나오면 0으로 */
function normalizeNegZeroEquiv(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (Object.is(n, -0)) return 0;
  if (Math.abs(n) < 1e-10) return 0;
  return n;
}

/**
 * 주간재고 `inventoryContainers`는 시트 분량을 `reservedBales`/`reservedWeight`에 합산함.
 * `sumPerContainerSalesAndAvailabilityEquiv`는 API 기준(영업 예약만)이므로 호출 전 시트를 빼서 맞춘다.
 */
function containersForSalesAvailEquiv(containers: TradeContainerDto[]): TradeContainerDto[] {
  return containers.map((c) => {
    const ext = c as TradeContainerDto & {
      sheetReservationBales?: unknown;
      sheetReservationWeight?: unknown;
    };
    const sb = coerceSheetReservationNumber(ext.sheetReservationBales);
    const sw = coerceSheetReservationNumber(ext.sheetReservationWeight);
    return {
      ...c,
      reservedBales: Math.max(0, Number(c.reservedBales ?? 0) - sb),
      reservedWeight: Math.max(0, Number(c.reservedWeight ?? 0) - sw),
    };
  });
}

/** 재고상태 뱃지 스타일 (inventory/pending과 동일) */
const INVENTORY_STATUS_BADGE_STYLES: Record<
  string,
  { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string; label: string }
> = {
  AVAILABLE: {
    variant: 'outline',
    className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
    label: '가용',
  },
  RESERVED: {
    variant: 'outline',
    className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
    label: '예약됨',
  },
  PARTIALLY_RESERVED: {
    variant: 'outline',
    className: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
    label: '부분 예약',
  },
  PARTIALLY_SOLD: {
    variant: 'outline',
    className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
    label: '부분 판매중',
  },
  PARTIALLY_SOLD_COMPLETED: {
    variant: 'outline',
    className: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
    label: '부분 판매완료',
  },
  SELLING: {
    variant: 'outline',
    className: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
    label: '판매중',
  },
  SOLD_OUT: {
    variant: 'outline',
    className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
    label: '판매 완료',
  },
};

export type SalesDashboardVariant = 'full' | 'stockOnly';

type SalesDashboardPageProps = {
  /** full: 판매 대시보드(전체 탭). stockOnly: 주간 재고 + 통관 전만 (상담 메뉴 대시보드 등) */
  variant?: SalesDashboardVariant;
};

export function SalesDashboardPage({ variant = 'full' }: SalesDashboardPageProps) {
  const isStockOnly = variant === 'stockOnly';
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [etaMonth, setEtaMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [salesDateRange, setSalesDateRange] = useState<{ from: string; to: string }>(() => getThisWeekDateRange());
  // 입항 예정 탭 정렬
  const [etaSortBy, setEtaSortBy] = useState<string>('etaDate');
  const [etaSortOrder, setEtaSortOrder] = useState<'asc' | 'desc'>('asc');
  // 주간 재고 현황 (상세) 탭 정렬
  const [inventoryDetailSortBy, setInventoryDetailSortBy] = useState<string>('productName');
  const [inventoryDetailSortOrder, setInventoryDetailSortOrder] = useState<'asc' | 'desc'>('asc');
  // 통관 전 재고 탭 정렬
  const [inboundScheduledSortBy, setInboundScheduledSortBy] = useState<string>('etaDate');
  const [inboundScheduledSortOrder, setInboundScheduledSortOrder] = useState<'asc' | 'desc'>('asc');
  // 판매현황 탭 정렬
  const [salesSortBy, setSalesSortBy] = useState<string>('productName');
  const [salesSortOrder, setSalesSortOrder] = useState<'asc' | 'desc'>('asc');
  // 주간 재고 현황 (카테고리별) 탭 정렬
  const [inventorySectionSortBy, setInventorySectionSortBy] = useState<string>('productName');
  const [inventorySectionSortOrder, setInventorySectionSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const authed = auth.isAuthenticated();
    if (!authed) {
      router.push('/login');
      return;
    }

    const fetchUser = async () => {
      const userData = await auth.getCurrentUser();
      if (!userData) {
        router.push('/login');
        return;
      }
      setUser(userData);
      setLoading(false);
    };

    fetchUser();
  }, [router]);

  const { data: invoicesResponse, isLoading: invoicesLoading } = useIssuedInvoices({
    page: 1,
    limit: 500,
    issuedAtStartDate: salesDateRange.from,
    issuedAtEndDate: salesDateRange.to,
    excludeCancelled: true,
  });

  // 주간 재고 현황: getConfirmedInventoryForDashboard — 재고 목록 제외 컨만 백엔드에서 제외
  const { data: containersRaw = [], isLoading: inventoryLoading } = useContainersConfirmed({
    includeExcluded: false,
    forDashboardDisplay: true,
  });
  const inventoryContainers = useMemo(() => {
    const arr = Array.isArray(containersRaw) ? containersRaw : [];
    return arr.map((c: any) => {
        const sheetB =
          c.sheetReservationBales != null && c.sheetReservationBales !== ''
            ? Number(c.sheetReservationBales)
            : 0;
        const sheetW =
          c.sheetReservationWeight != null && c.sheetReservationWeight !== ''
            ? Number(c.sheetReservationWeight)
            : 0;
        const sheetBales = Number.isFinite(sheetB) ? sheetB : 0;
        const sheetWeight = Number.isFinite(sheetW) ? sheetW : 0;
        return {
          ...c,
          bales: (c.salesBales ?? c.tradeBales) != null ? Number(c.salesBales ?? c.tradeBales) : 0,
          availableBales: c.availableBales != null ? Number(c.availableBales) : 0,
          soldBales: c.soldBales != null ? Number(c.soldBales) : 0,
          reservedBales: (c.reservedBales != null ? Number(c.reservedBales) : 0) + sheetBales,
          completedBales: c.completedBales != null ? Number(c.completedBales) : 0,
          weight: c.weight != null ? Number(c.weight) : 0,
          availableWeight: c.availableWeight != null ? Number(c.availableWeight) : 0,
          soldWeight: c.soldWeight != null ? Number(c.soldWeight) : 0,
          reservedWeight: (c.reservedWeight != null ? Number(c.reservedWeight) : 0) + sheetWeight,
          completedWeight: c.completedWeight != null ? Number(c.completedWeight) : 0,
        };
    });
  }, [containersRaw]);

  // 입항 예정 - ETA 기준, 선택한 월 전체
  const etaDateRange = useMemo(() => (etaMonth ? getMonthDateRange(etaMonth) : getThisMonthDateRange()), [etaMonth]);
  // 입항 예정 = 입고 대기(INBOUND_PENDING) 중 선택한 달 ETA 목록 (/inbound/pending 와 동일한 상태, 달 필터만 적용)
  const { data: etaOrdersRaw = [], isLoading: etaLoading } = useTradeOrders({
    bookingOnly: true,
    salesStatus: 'INBOUND_PENDING',
    dateType: 'eta',
    dateFrom: etaDateRange.from,
    dateTo: etaDateRange.to,
  });

  const etaOrders = useMemo(() => {
    return [...etaOrdersRaw].sort((a, b) => {
      const dateA = a.etaDate ? new Date(a.etaDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.etaDate ? new Date(b.etaDate).getTime() : Number.MAX_SAFE_INTEGER;
      return dateA - dateB;
    });
  }, [etaOrdersRaw]);
  const etaTotal = useMemo(
    () => etaOrders.reduce((sum, o) => sum + (o.containers?.length ?? 0), 0),
    [etaOrders]
  );

  // 통관 전 재고: 대시보드 전용 API(getInboundScheduledInventoryForDashboard) — 주간 재고와 동일하게 시트는 예약등록만 집계 (입항일 월 필터 없음, 전체 기간)
  const { data: inboundScheduledContainersRaw = [], isLoading: inboundScheduledLoading } = useContainersScheduled({
    forDashboardScheduled: true,
  });
  /** listContainers 항목을 orderId로 그룹해, 테이블 행 형태로 변환 (기존 TradeOrder 호환) */
  const inboundScheduledOrders = useMemo(() => {
    const filtered = inboundScheduledContainersRaw;
    const byOrderId = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const oid = c.orderId;
      if (!oid) continue;
      if (!byOrderId.has(oid)) byOrderId.set(oid, []);
      byOrderId.get(oid)!.push(c);
    }
    const rows: Array<{
      id: string;
      bl: string | null;
      productName: string | null;
      exporterName: string | null;
      etaDate: string | null;
      notes: string | null;
      invoiceAmount: number | null;
      invoiceCurrency: string | null;
      confirmedInbound: null;
      pendingInbound: { warehouse?: string | null; igodate?: string | null; quarantineDate?: string | null } | null;
      quarantineDate: string | null;
      containers: TradeContainerDto[];
    }> = [];
    byOrderId.forEach((containers, orderId) => {
      const first = containers[0];
      rows.push({
        id: orderId,
        bl: first.bl ?? null,
        productName: first.product ?? first.productName ?? null,
        exporterName: first.exporterName ?? first.exporter ?? null,
        etaDate: first.etaDate ?? null,
        notes: first.notes ?? null,
        invoiceAmount: first.invoiceAmount != null ? Number(first.invoiceAmount) : null,
        invoiceCurrency: first.invoiceCurrency ?? null,
        confirmedInbound: null,
        pendingInbound: {
          warehouse: first.inboundWarehouse ?? first.inboundWarehouseName ?? null,
          igodate: first.inboundIgodate ?? null,
          quarantineDate: first.inboundQuarantineDate ?? null,
        },
        quarantineDate: first.inboundQuarantineDate ?? null,
        containers: containers.map((c) => ({
          bales: c.bales,
          salesBales: c.salesBales,
          tradeBales: c.tradeBales,
          packingType: c.packingType ?? c.packing ?? null,
          packingName: (c as { packingName?: string | null }).packingName ?? null,
          weight: c.weight,
          availableBales: c.availableBales,
          reservedBales: c.reservedBales,
          completedBales: c.completedBales,
          sheetReservationBales: c.sheetReservationBales,
          availableWeight: c.availableWeight,
          reservedWeight: c.reservedWeight,
          completedWeight: c.completedWeight,
          sheetReservationWeight: c.sheetReservationWeight,
          inventoryStatus: c.inventoryStatus,
          salesGrade: c.salesGrade,
          excludeFromInventory: c.excludeFromInventory === true,
          salesMgmtReservationBalesByBl: c.salesMgmtReservationBalesByBl,
          salesMgmtReservationWeightMtByBl: c.salesMgmtReservationWeightMtByBl,
          gridSheetReservationContainerUnits: c.gridSheetReservationContainerUnits,
        })),
      });
    });
    return rows.sort((a, b) => {
      const qa = a.quarantineDate ?? a.pendingInbound?.quarantineDate;
      const qb = b.quarantineDate ?? b.pendingInbound?.quarantineDate;
      const dateA = qa ? new Date(qa).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = qb ? new Date(qb).getTime() : Number.MAX_SAFE_INTEGER;
      return dateA - dateB;
    });
  }, [inboundScheduledContainersRaw]);
  /** 상담 대시보드(stockOnly)에서는 가용재고 0인 행을 표시하지 않음 */
  const inboundScheduledOrdersVisible = useMemo(() => {
    if (!isStockOnly) return inboundScheduledOrders;
    return inboundScheduledOrders.filter((o) => {
      const { availableDisplay } = getInboundScheduledDisplayCounts(o.containers ?? []);
      return normalizeNegZeroEquiv(availableDisplay) > 0;
    });
  }, [inboundScheduledOrders, isStockOnly]);
  const inboundScheduledTotal = useMemo(
    () => inboundScheduledOrdersVisible.reduce((sum, o) => sum + (o.containers?.length ?? 0), 0),
    [inboundScheduledOrdersVisible]
  );

  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: productCategoryCodes = [] } = useCodeMastersByGroup('PRODUCT_CATEGORY');
  const { data: gradeCodes = [] } = useCodeMastersByGroup('SALES_GRADE');
  const { data: packingTypeCodes = [] } = useCodeMastersByGroup('PACKING_TYPE');
  const { data: salesPriceStageCodes = [] } = useCodeMastersByGroup('SALES_PRICE_STAGE');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const productMap = useMemo(() => {
    const map = new Map<string, string>();
    productCodes.forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [productCodes]);
  const gradeMap = useMemo(() => {
    const map = new Map<string, string>();
    gradeCodes.forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [gradeCodes]);

  const salesPriceStageMap = useMemo(() => {
    const map = new Map<string, string>();
    (salesPriceStageCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [salesPriceStageCodes]);

  // 제품 코드 → 카테고리명 매핑 (PRODUCT의 parentId → PRODUCT_CATEGORY)
  const productToCategoryMap = useMemo(() => {
    const categoryById = new Map<number, string>();
    productCategoryCodes.forEach((c) => {
      categoryById.set(c.id, (c.name ?? c.value ?? '').trim() || '기타');
    });
    const map = new Map<string, string>();
    productCodes.forEach((p) => {
      const categoryName = (p.parentId != null ? categoryById.get(p.parentId) : null) ?? '기타';
      const keyVal = (p.value ?? p.name ?? '').trim();
      const keyName = (p.name ?? p.value ?? '').trim();
      if (keyVal) map.set(keyVal, categoryName);
      if (keyName) map.set(keyName, categoryName);
    });
    return map;
  }, [productCodes, productCategoryCodes]);

  const getProductName = (productName?: string | null, productNameLabel?: string | null) => {
    if (productNameLabel) return productNameLabel;
    if (productName) return productMap.get(productName) || productName;
    return '';
  };

  /** 통관 전 재고 행: 주간 재고와 동일하게 상품명 + 패킹 축약(빅/스/슬) */
  const getInboundScheduledProductDisplayName = (order: {
    productName: string | null;
    containers?: Array<{ packingName?: string | null; packingType?: string | null; packing?: string | null }> | null;
  }) => {
    const base = getProductName(order.productName);
    const packingAbbrSet = new Set<string>();
    for (const c of order.containers ?? []) {
      const raw = String(c.packingName?.trim() || c.packingType || c.packing || '').trim();
      if (!raw) continue;
      const abbr = packingAbbreviationForInventory(raw, packingTypeCodes);
      if (abbr) packingAbbrSet.add(abbr);
    }
    if (packingAbbrSet.size === 0) return base;
    return `${base} (${Array.from(packingAbbrSet).sort((a, b) => a.localeCompare(b, 'ko')).join(', ')})`;
  };

  const getGradeName = (order: { containers?: Array<{ salesGrade?: string | null }> | null }) => {
    const grade = order.containers?.[0]?.salesGrade;
    if (!grade) return '';
    return gradeMap.get(String(grade).trim()) || String(grade);
  };
  const warehouseMap = useMemo(() => {
    const map = new Map<string, string>();
    warehouses.forEach((w) => {
      if (w.name?.trim()) map.set(w.name.trim(), w.name.trim());
      map.set(String(w.id), w.name?.trim() || '');
    });
    return map;
  }, [warehouses]);
  const getWarehouseName = (code?: string | null) => {
    if (!code) return '';
    return warehouseMap.get(code.trim()) || code;
  };

  // 입항 예정 탭: 정렬된 목록
  const etaOrdersSorted = useMemo(() => {
    const sorted = [...etaOrders];
    if (!etaSortBy) return sorted;
    const order = etaSortOrder === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;
      switch (etaSortBy) {
        case 'productName':
          aVal = getProductName(a.productName);
          bVal = getProductName(b.productName);
          break;
        case 'bl':
          aVal = a.bl ?? '';
          bVal = b.bl ?? '';
          break;
        case 'exporterName':
          aVal = a.exporterName ?? '';
          bVal = b.exporterName ?? '';
          break;
        case 'grade':
          aVal = getGradeName(a);
          bVal = getGradeName(b);
          break;
        case 'containerCount':
          aVal = (a.containers ?? []).length;
          bVal = (b.containers ?? []).length;
          return order * (aVal - bVal);
        case 'reservedCnt': {
          aVal = getTradeOrderInboundScheduledContainerEquivalents(a).reservedCnt;
          bVal = getTradeOrderInboundScheduledContainerEquivalents(b).reservedCnt;
          return order * (aVal - bVal);
        }
        case 'availableCnt': {
          aVal = getTradeOrderInboundScheduledContainerEquivalents(a).availableCnt;
          bVal = getTradeOrderInboundScheduledContainerEquivalents(b).availableCnt;
          return order * (aVal - bVal);
        }
        case 'etaDate':
          aVal = a.etaDate ? new Date(a.etaDate).getTime() : 0;
          bVal = b.etaDate ? new Date(b.etaDate).getTime() : 0;
          return order * (aVal - bVal);
        case 'inboundWarehouse':
          aVal = getWarehouseName(a.confirmedInbound?.warehouse ?? a.pendingInbound?.warehouse ?? null) || '';
          bVal = getWarehouseName(b.confirmedInbound?.warehouse ?? b.pendingInbound?.warehouse ?? null) || '';
          break;
        case 'inboundSchedule': {
          const aDate = a.confirmedInbound?.igodate ?? a.pendingInbound?.igodate;
          const bDate = b.confirmedInbound?.igodate ?? b.pendingInbound?.igodate;
          aVal = aDate ? new Date(aDate).getTime() : 0;
          bVal = bDate ? new Date(bDate).getTime() : 0;
          return order * (aVal - bVal);
        }
        case 'quarantineSchedule': {
          const aDate = a.quarantineDate ?? a.confirmedInbound?.quarantineDate ?? a.pendingInbound?.quarantineDate;
          const bDate = b.quarantineDate ?? b.confirmedInbound?.quarantineDate ?? b.pendingInbound?.quarantineDate;
          aVal = aDate ? new Date(aDate).getTime() : 0;
          bVal = bDate ? new Date(bDate).getTime() : 0;
          return order * (aVal - bVal);
        }
        case 'invoiceAmount':
          return order * ((a.invoiceAmount ?? 0) - (b.invoiceAmount ?? 0));
        default:
          return 0;
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      return order * aStr.localeCompare(bStr, 'ko');
    });
    return sorted;
  }, [etaOrders, etaSortBy, etaSortOrder, productMap, gradeMap, warehouseMap]);

  // 통관 전 재고 탭: 정렬된 목록
  type InboundScheduledOrderRow = (typeof inboundScheduledOrders)[number];
  const inboundScheduledOrdersSorted = useMemo(() => {
    const sorted = [...inboundScheduledOrdersVisible];
    if (!inboundScheduledSortBy) return sorted;
    const order = inboundScheduledSortOrder === 'asc' ? 1 : -1;
    sorted.sort((a: InboundScheduledOrderRow, b: InboundScheduledOrderRow) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;
      switch (inboundScheduledSortBy) {
        case 'productName':
          aVal = getInboundScheduledProductDisplayName(a);
          bVal = getInboundScheduledProductDisplayName(b);
          break;
        case 'bl':
          aVal = a.bl ?? '';
          bVal = b.bl ?? '';
          break;
        case 'exporterName':
          aVal = a.exporterName ?? '';
          bVal = b.exporterName ?? '';
          break;
        case 'grade':
          aVal = getGradeName(a);
          bVal = getGradeName(b);
          break;
        case 'containerCount':
          aVal = (a.containers ?? []).length;
          bVal = (b.containers ?? []).length;
          return order * (aVal - bVal);
        case 'reservedCnt': {
          aVal = getInboundScheduledContainerEquivalents(a.containers ?? []).reservedCnt;
          bVal = getInboundScheduledContainerEquivalents(b.containers ?? []).reservedCnt;
          return order * (aVal - bVal);
        }
        case 'availableCnt': {
          aVal = getInboundScheduledContainerEquivalents(a.containers ?? []).availableCnt;
          bVal = getInboundScheduledContainerEquivalents(b.containers ?? []).availableCnt;
          return order * (aVal - bVal);
        }
        case 'etaDate':
          aVal = a.etaDate ? new Date(a.etaDate).getTime() : 0;
          bVal = b.etaDate ? new Date(b.etaDate).getTime() : 0;
          return order * (aVal - bVal);
        case 'inboundWarehouse':
          aVal = getWarehouseName(a.pendingInbound?.warehouse ?? null) || '';
          bVal = getWarehouseName(b.pendingInbound?.warehouse ?? null) || '';
          break;
        case 'inboundSchedule': {
          const aDate = a.pendingInbound?.igodate;
          const bDate = b.pendingInbound?.igodate;
          aVal = aDate ? new Date(aDate).getTime() : 0;
          bVal = bDate ? new Date(bDate).getTime() : 0;
          return order * (aVal - bVal);
        }
        case 'quarantineSchedule': {
          const aDate = a.quarantineDate ?? a.pendingInbound?.quarantineDate;
          const bDate = b.quarantineDate ?? b.pendingInbound?.quarantineDate;
          aVal = aDate ? new Date(aDate).getTime() : 0;
          bVal = bDate ? new Date(bDate).getTime() : 0;
          return order * (aVal - bVal);
        }
        case 'invoiceAmount': {
          const aAmt = 'invoiceAmount' in a ? (a as { invoiceAmount?: number | null }).invoiceAmount : null;
          const bAmt = 'invoiceAmount' in b ? (b as { invoiceAmount?: number | null }).invoiceAmount : null;
          return order * ((aAmt ?? 0) - (bAmt ?? 0));
        }
        default:
          return 0;
      }
      return order * String(aVal ?? '').localeCompare(String(bVal ?? ''), 'ko');
    });
    return sorted;
  }, [
    inboundScheduledOrdersVisible,
    inboundScheduledSortBy,
    inboundScheduledSortOrder,
    productMap,
    gradeMap,
    warehouseMap,
    packingTypeCodes,
  ]);

  // 주간 재고 현황: 제품별·BL별 그룹핑 및 소계
  type InventoryRow = {
    productName: string;
    productCode: string; // 카테고리 매핑용 (원본 제품 코드/이름)
    bl: string;
    exporterName: string;
    grade: string;
    inboundCnt: number;
    soldCnt: number;
    reservedCnt: number;
    availableCnt: number;
    soldWeight: number;
    reservedWeight: number;
    availableWeight: number;
    detention: string;
    detentionShort: string; // 반납 기한 (M.d 형식)
    returned: number;
    unreturned: number;
    leased: number;
    notes: string;
    isSubtotal?: boolean;
  };
  const weeklyInventoryRows = useMemo(() => {
    const rows: InventoryRow[] = [];
    const byProductBl = new Map<string, typeof inventoryContainers>();
    for (const c of inventoryContainers) {
      const productName = c.productName ?? '';
      const bl = c.bl ?? '';
      const key = `${productName}|${bl}`;
      if (!byProductBl.has(key)) byProductBl.set(key, []);
      byProductBl.get(key)!.push(c);
    }
    const productOrder = Array.from(new Set(inventoryContainers.map((c) => c.productName ?? '').filter(Boolean))).sort();
    for (const productName of productOrder) {
      const blKeys = Array.from(byProductBl.keys())
        .filter((k) => k.startsWith(`${productName}|`))
        .sort();
      let subSold = 0;
      let subReserved = 0;
      let subAvailable = 0;
      let subSoldWeight = 0;
      let subReservedWeight = 0;
      let subAvailableWeight = 0;
      let subInboundCnt = 0;
      let subReturned = 0;
      let subUnreturned = 0;
      let subLeased = 0;
      for (const key of blKeys) {
        const containers = byProductBl.get(key)!;
        const bl = key.split('|')[1] ?? '';
        const exporterName = containers[0]?.exporterName ?? '';
        const grade = containers[0]?.salesGradeName ?? containers[0]?.tradeGradeName ?? '';
        const inboundCnt = containers.length;
        let soldCnt = 0;
        let reservedCnt = 0;
        let availableCnt = 0;
        let soldWeight = 0;
        let reservedWeight = 0;
        let availableWeight = 0;
        let returned = 0;
        let unreturned = 0;
        let leased = 0;
        const notesSet = new Set<string>();
        const first = containers[0] as TradeContainerDto | undefined;
        const useReservationBreakdown = containerRowHasReservationBreakdown(first);
        if (useReservationBreakdown) {
          // 주간재고: 판매=판매완료+영업 판매항목(예약·SALES_ITEM_SOLD 등). 예약=판매관리(tb) BL 예약+판매예약시트(그리드)만.
          const adj = containersForSalesAvailEquiv(containers as TradeContainerDto[]);
          const { reservedSalesCnt, soldCnt: compSold } = sumPerContainerSalesAndAvailabilityEquiv(adj);
          soldCnt = compSold + reservedSalesCnt;
          reservedCnt = orderLevelMgmtAndGridContainerEquiv(containers as TradeContainerDto[], inboundCnt, {
            salesMgmtReservationBalesByBl: first?.salesMgmtReservationBalesByBl,
            salesMgmtReservationWeightMtByBl: first?.salesMgmtReservationWeightMtByBl,
            gridSheetReservationContainerUnits: first?.gridSheetReservationContainerUnits,
          });
          availableCnt = inboundCnt - soldCnt - reservedCnt;
        } else {
          for (const c of containers) {
            const bales = c.bales > 0 ? c.bales : 1;
            const weight = c.weight > 0 ? Number(c.weight) : 1;
            const ext = c as TradeContainerDto & { sheetReservationBales?: unknown; sheetReservationWeight?: unknown };
            const sheetB = coerceSheetReservationNumber(ext.sheetReservationBales);
            const sheetW = coerceSheetReservationNumber(ext.sheetReservationWeight);
            const reservedMergedB = c.reservedBales ?? 0;
            const reservedMergedW = c.reservedWeight ?? 0;
            const reservedOpsB = Math.max(0, Number(reservedMergedB) - sheetB);
            const reservedOpsW = Math.max(0, Number(reservedMergedW) - sheetW);
            const completedB = c.completedBales ?? 0;
            const availB = c.availableBales ?? 0;
            const completedW = c.completedWeight ?? 0;
            const availW = c.availableWeight ?? 0;
            if (bales > 0) {
              soldCnt += (completedB + reservedOpsB) / bales;
              reservedCnt += sheetB / bales;
              availableCnt += availB / bales;
            } else {
              soldCnt += (completedW + reservedOpsW) / weight;
              reservedCnt += sheetW / weight;
              availableCnt += availW / weight;
            }
          }
        }
        for (const c of containers) {
          const completedW = c.completedWeight ?? 0;
          const reservedW = c.reservedWeight ?? 0;
          const availW = c.availableWeight ?? 0;
          soldWeight += completedW;
          reservedWeight += reservedW;
          availableWeight += availW;
          if (c.returnStatus === 'RETURNED') returned += 1;
          else if (c.returnStatus === 'NOT_RETURNED') unreturned += 1;
          else if (c.returnStatus === 'LEASED') leased += 1;
          if (c.notes?.trim()) notesSet.add(c.notes.trim());
        }
        const packingAbbrSet = new Set<string>();
        for (const c of containers) {
          const pc = c as { packingName?: string | null; packingType?: string | null; packing?: string | null };
          const raw = String(pc.packingName?.trim() || pc.packingType || pc.packing || '').trim();
          if (!raw) continue;
          const abbr = packingAbbreviationForInventory(raw, packingTypeCodes);
          if (abbr) packingAbbrSet.add(abbr);
        }
        const packingSuffix =
          packingAbbrSet.size > 0
            ? ` (${Array.from(packingAbbrSet).sort((a, b) => a.localeCompare(b, 'ko')).join(', ')})`
            : '';
        const rowProductName = getProductName(productName) + packingSuffix;
        const dtDate = containers[0]?.inboundDtDate;
        const detention = dtDate
          ? (() => {
              const d = new Date(dtDate);
              return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
            })()
          : '';
        const detentionShort = dtDate
          ? (() => {
              const d = new Date(dtDate);
              return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}.${d.getDate()}`;
            })()
          : '';
        subSold += soldCnt;
        subReserved += reservedCnt;
        subReturned += returned;
        subAvailable += availableCnt;
        subSoldWeight += soldWeight;
        subReservedWeight += reservedWeight;
        subAvailableWeight += availableWeight;
        subInboundCnt += inboundCnt;
        subUnreturned += unreturned;
        subLeased += leased;
        rows.push({
          productName: rowProductName,
          productCode: productName,
          bl,
          exporterName,
          grade,
          inboundCnt,
          soldCnt,
          reservedCnt,
          availableCnt: normalizeNegZeroEquiv(availableCnt),
          soldWeight,
          reservedWeight,
          availableWeight,
          detention,
          detentionShort,
          returned,
          unreturned,
          leased,
          notes: Array.from(notesSet).join(', ') || '',
        });
      }
      if (blKeys.length > 0) {
        rows.push({
          productName: getProductName(productName),
          productCode: productName,
          bl: '',
          exporterName: '',
          grade: '',
          inboundCnt: subInboundCnt,
          soldCnt: subSold,
          reservedCnt: subReserved,
          availableCnt: normalizeNegZeroEquiv(subAvailable),
          soldWeight: subSoldWeight,
          reservedWeight: subReservedWeight,
          availableWeight: subAvailableWeight,
          detention: '',
          detentionShort: '',
          returned: subReturned,
          unreturned: subUnreturned,
          leased: subLeased,
          notes: '',
          isSubtotal: true,
        });
      }
    }
    return rows;
  }, [inventoryContainers, productMap, packingTypeCodes]);

  // 주간재고현황 표시용: 영업은 전부 표시, 상담(stockOnly)은 가용재고 0인 상세행 제외
  const weeklyInventoryRowsForDisplay = useMemo(() => {
    const rawDetails = weeklyInventoryRows.filter((r) => !r.isSubtotal);
    const detailRows = isStockOnly
      ? rawDetails.filter((r) => normalizeNegZeroEquiv(r.availableCnt) > 0)
      : rawDetails;
    const productOrder = Array.from(new Map(detailRows.map((r) => [r.productCode, r])).keys());
    const out: InventoryRow[] = [];
    for (const productCode of productOrder) {
      const productDetails = detailRows.filter((r) => r.productCode === productCode);
      const visible = productDetails;
      for (const r of visible) out.push(r);
      const sub = visible.reduce(
        (acc, r) => ({
          inboundCnt: acc.inboundCnt + r.inboundCnt,
          soldCnt: acc.soldCnt + r.soldCnt,
          reservedCnt: acc.reservedCnt + r.reservedCnt,
          availableCnt: acc.availableCnt + r.availableCnt,
          soldWeight: acc.soldWeight + r.soldWeight,
          reservedWeight: acc.reservedWeight + r.reservedWeight,
          availableWeight: acc.availableWeight + r.availableWeight,
          returned: acc.returned + r.returned,
          unreturned: acc.unreturned + r.unreturned,
          leased: acc.leased + r.leased,
        }),
        { inboundCnt: 0, soldCnt: 0, reservedCnt: 0, availableCnt: 0, soldWeight: 0, reservedWeight: 0, availableWeight: 0, returned: 0, unreturned: 0, leased: 0 }
      );
      const first = visible[0];
      out.push({
        productName: getProductName(first.productCode),
        productCode: first.productCode,
        bl: '',
        exporterName: '',
        grade: '',
        inboundCnt: sub.inboundCnt,
        soldCnt: sub.soldCnt,
        reservedCnt: sub.reservedCnt,
        availableCnt: normalizeNegZeroEquiv(sub.availableCnt),
        soldWeight: sub.soldWeight,
        reservedWeight: sub.reservedWeight,
        availableWeight: sub.availableWeight,
        detention: '',
        detentionShort: '',
        returned: sub.returned,
        unreturned: sub.unreturned,
        leased: sub.leased,
        notes: '',
        isSubtotal: true,
      });
    }
    return out;
  }, [weeklyInventoryRows, productMap, isStockOnly]);

  // 카테고리별로 행 그룹핑 (표시용 필터 적용)
  const weeklyInventoryRowsByCategory = useMemo(() => {
    const categoryOrder = [...productCategoryCodes]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((c) => (c.name ?? c.value ?? '').trim())
      .filter(Boolean);
    if (!categoryOrder.includes('기타')) {
      categoryOrder.push('기타');
    }
    const byCategory = new Map<string, InventoryRow[]>();
    for (const row of weeklyInventoryRowsForDisplay) {
      const category = productToCategoryMap.get(row.productCode) ?? '기타';
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category)!.push(row);
    }
    return categoryOrder
      .filter((cat) => (byCategory.get(cat)?.length ?? 0) > 0)
      .map((category) => ({ category, rows: byCategory.get(category) ?? [] }));
  }, [weeklyInventoryRowsForDisplay, productToCategoryMap, productCategoryCodes]);

  // 이미지 형식 테이블용: 소계 제외한 상세 행만 (상담은 가용재고 0 제외)
  const weeklyInventoryFlatRows = useMemo(() => {
    const details = weeklyInventoryRows.filter((r) => !r.isSubtotal);
    if (isStockOnly) return details.filter((r) => normalizeNegZeroEquiv(r.availableCnt) > 0);
    return details;
  }, [weeklyInventoryRows, isStockOnly]);

  // 주간 재고 현황 (상세) 탭: 정렬된 목록
  const weeklyInventoryFlatRowsSorted = useMemo(() => {
    const sorted = [...weeklyInventoryFlatRows];
    if (!inventoryDetailSortBy) return sorted;
    const order = inventoryDetailSortOrder === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (inventoryDetailSortBy) {
        case 'exporterName':
          aVal = a.exporterName ?? '';
          bVal = b.exporterName ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'bl':
          aVal = a.bl ?? '';
          bVal = b.bl ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'productName':
          aVal = a.productName ?? '';
          bVal = b.productName ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'grade':
          aVal = a.grade ?? '';
          bVal = b.grade ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'inboundCnt':
          return order * (a.inboundCnt - b.inboundCnt);
        case 'soldCnt':
          return order * (a.soldCnt - b.soldCnt);
        case 'reservedCnt':
          return order * (a.reservedCnt - b.reservedCnt);
        case 'availableCnt':
          return order * (a.availableCnt - b.availableCnt);
        case 'soldWeight':
          return order * (a.soldWeight - b.soldWeight);
        case 'reservedWeight':
          return order * (a.reservedWeight - b.reservedWeight);
        case 'availableWeight':
          return order * (a.availableWeight - b.availableWeight);
        case 'detentionShort':
          aVal = a.detentionShort ?? '';
          bVal = b.detentionShort ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'returned':
          return order * (a.returned - b.returned);
        case 'unreturned':
          return order * (a.unreturned - b.unreturned);
        case 'leased':
          return order * (a.leased - b.leased);
        default:
          return 0;
      }
    });
    return sorted;
  }, [weeklyInventoryFlatRows, inventoryDetailSortBy, inventoryDetailSortOrder]);

  // 주간 재고 현황 (카테고리별) 탭: 섹션별 행 정렬 (소계는 각 제품 그룹 바로 다음에 유지)
  const weeklyInventoryRowsByCategorySorted = useMemo(() => {
    const sortCompare = (a: InventoryRow, b: InventoryRow, order: number) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (inventorySectionSortBy) {
        case 'productName':
          aVal = a.productName ?? '';
          bVal = b.productName ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'bl':
          aVal = a.bl ?? '';
          bVal = b.bl ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'exporterName':
          aVal = a.exporterName ?? '';
          bVal = b.exporterName ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'grade':
          aVal = a.grade ?? '';
          bVal = b.grade ?? '';
          return order * (aVal as string).localeCompare(bVal as string, 'ko');
        case 'inboundCnt':
          return order * (a.inboundCnt - b.inboundCnt);
        case 'soldCnt':
          return order * (a.soldCnt - b.soldCnt);
        case 'reservedCnt':
          return order * (a.reservedCnt - b.reservedCnt);
        case 'availableCnt':
          return order * (a.availableCnt - b.availableCnt);
        default:
          return 0;
      }
    };
    return weeklyInventoryRowsByCategory.map(({ category, rows }) => {
      if (!inventorySectionSortBy || rows.length === 0) return { category, rows };
      // 제품 그룹 단위로 나누기: [상세,상세,...,소계], [상세,소계], ... 순서 유지
      const groups: InventoryRow[][] = [];
      let current: InventoryRow[] = [];
      for (const row of rows) {
        if (row.isSubtotal) {
          current.push(row);
          groups.push(current);
          current = [];
        } else {
          current.push(row);
        }
      }
      if (current.length > 0) groups.push(current);
      const order = inventorySectionSortOrder === 'asc' ? 1 : -1;
      const sortedRows: InventoryRow[] = [];
      for (const group of groups) {
        const details = group.filter((r) => !r.isSubtotal);
        const subtotals = group.filter((r) => r.isSubtotal);
        if (details.length > 0) {
          const sortedDetail = [...details].sort((a, b) => sortCompare(a, b, order));
          sortedRows.push(...sortedDetail);
        }
        sortedRows.push(...subtotals);
      }
      return { category, rows: sortedRows };
    });
  }, [weeklyInventoryRowsByCategory, inventorySectionSortBy, inventorySectionSortOrder]);

  // 차트용: 제품별 가용 재고(컨) - 소계 행 기준 (표시용 데이터)
  const inventoryChartData = useMemo(() => {
    const subtotalRows = weeklyInventoryRowsForDisplay.filter((r) => r.isSubtotal);
    return {
      labels: subtotalRows.map((r) => r.productName),
      series: subtotalRows.map((r) => normalizeNegZeroEquiv(r.availableCnt)),
    };
  }, [weeklyInventoryRowsForDisplay]);

  // 주간 재고 현황: 전체 섹션 총 합 (표시용 데이터)
  const inventoryGrandTotal = useMemo(() => {
    const subtotalRows = weeklyInventoryRowsForDisplay.filter((r) => r.isSubtotal);
    if (subtotalRows.length === 0) return null;
    const t = subtotalRows.reduce(
      (acc, r) => ({
        inboundCnt: acc.inboundCnt + r.inboundCnt,
        soldCnt: acc.soldCnt + r.soldCnt,
        reservedCnt: acc.reservedCnt + r.reservedCnt,
        availableCnt: acc.availableCnt + r.availableCnt,
        soldWeight: acc.soldWeight + r.soldWeight,
        reservedWeight: acc.reservedWeight + r.reservedWeight,
        availableWeight: acc.availableWeight + r.availableWeight,
        returned: acc.returned + r.returned,
        unreturned: acc.unreturned + r.unreturned,
        leased: acc.leased + r.leased,
      }),
      { inboundCnt: 0, soldCnt: 0, reservedCnt: 0, availableCnt: 0, soldWeight: 0, reservedWeight: 0, availableWeight: 0, returned: 0, unreturned: 0, leased: 0 }
    );
    return { ...t, availableCnt: normalizeNegZeroEquiv(t.availableCnt) };
  }, [weeklyInventoryRowsForDisplay]);

  const salesStatusRows = useMemo(() => {
    const invoices = invoicesResponse?.data ?? [];
    const rows: {
      productName: string;
      companyName: string;
      bl: string;
      container: string;
      vehicleType: string;
      salesUnitPriceStage: string | null;
      transportFeePerKg: number | null;
      /** 판매 화면에 입력한 운임비(판매 단위 총액) */
      salesTransportFeeInput: number | null;
      workFeePerKg: number | null;
      marginPerKg: number | null;
      /** 명세 품목 중량(톤) 우선, 없으면 컨테이너·카고 중량(톤) */
      weightTon: number | null;
      totalAmount: number;
    }[] = [];
    for (const invoice of invoices) {
      const companyName = invoice.customer?.companyName ?? '';
      const items = (invoice.items ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const saleWeightTonBySaleId = new Map<string, number>();
      for (const it of items) {
        const sid = saleIdFromInvoiceLine(it);
        const w = lineWeightTonForMargin(it);
        if (sid && w != null && !Number.isNaN(w)) {
          saleWeightTonBySaleId.set(sid, (saleWeightTonBySaleId.get(sid) ?? 0) + w);
        }
      }

      for (const item of items) {
        const salesItem = item.salesItem;
        const container = salesItem?.container as { containerNo?: string | null; sequence?: number | null; order?: { bl?: string | null } | null } | undefined;
        const order = container?.order;
        const bl = order?.bl ?? (container as { bl?: string | null })?.bl ?? '';
        const containerNo = container?.containerNo;
        const sequence = container?.sequence;
        const containerDisplay =
          containerNo && sequence != null ? `${containerNo}-${sequence}번` : containerNo || '';
        const sales = salesItem?.sales as {
          requestVehicle?: string | null;
          transportFee?: string | number | null;
        } | undefined;
        const containerType = (salesItem as { containerType?: string | null })?.containerType;
        const requestVehicle = sales?.requestVehicle;
        const vehicleType =
          containerType === 'CONTAINER' ? '컨테이너' : requestVehicle === 'CONTAINER' ? '컨테이너' : '카고적출';
        const stageRaw = salesItem?.salesUnitPriceStage;
        const salesUnitPriceStage =
          stageRaw != null && String(stageRaw).trim() !== '' ? String(stageRaw).trim() : null;
        const amount = item.amount != null ? Number(item.amount) : 0;
        const vatAmount = item.vatAmount != null ? Number(item.vatAmount) : 0;
        const totalAmount = amount + vatAmount;
        const sid = saleIdFromInvoiceLine(item);
        const totalSaleTon = sid ? saleWeightTonBySaleId.get(sid) ?? null : null;
        const transportFeePerKg = transportFeePerKgFromInvoiceItem(item, totalSaleTon);
        const marginPerKg = marginPerKgFromInvoiceItem(item, totalSaleTon);
        const workFeePerKg = workFeePerKgFromInvoiceItem(item);
        const weightRaw = lineWeightTonForMargin(item);
        const weightTon =
          weightRaw != null && !Number.isNaN(weightRaw) && Number.isFinite(weightRaw) ? weightRaw : null;
        const tfRaw = sales?.transportFee;
        let salesTransportFeeInput: number | null = null;
        if (tfRaw != null && String(tfRaw).trim() !== '') {
          const n = Number(tfRaw);
          if (!Number.isNaN(n)) salesTransportFeeInput = n;
        }

        rows.push({
          productName: item.productName ?? '',
          companyName,
          bl,
          container: containerDisplay,
          vehicleType,
          salesUnitPriceStage,
          transportFeePerKg,
          salesTransportFeeInput,
          workFeePerKg,
          marginPerKg,
          weightTon,
          totalAmount,
        });
      }
    }
    return rows;
  }, [invoicesResponse?.data]);

  // 판매현황 탭: 정렬된 목록
  const salesStatusRowsSorted = useMemo(() => {
    const sorted = [...salesStatusRows];
    if (!salesSortBy) return sorted;
    const order = salesSortOrder === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      switch (salesSortBy) {
        case 'productName':
          return order * (a.productName ?? '').localeCompare(b.productName ?? '', 'ko');
        case 'companyName':
          return order * (a.companyName ?? '').localeCompare(b.companyName ?? '', 'ko');
        case 'bl':
          return order * (a.bl ?? '').localeCompare(b.bl ?? '', 'ko');
        case 'container':
          return order * (a.container ?? '').localeCompare(b.container ?? '', 'ko');
        case 'vehicleType':
          return order * (a.vehicleType ?? '').localeCompare(b.vehicleType ?? '', 'ko');
        case 'transportFeePerKg': {
          const ta = a.transportFeePerKg;
          const tb = b.transportFeePerKg;
          if (ta == null && tb == null) return 0;
          if (ta == null) return 1;
          if (tb == null) return -1;
          return order * (ta - tb);
        }
        case 'workFeePerKg': {
          const wa = a.workFeePerKg;
          const wb = b.workFeePerKg;
          if (wa == null && wb == null) return 0;
          if (wa == null) return 1;
          if (wb == null) return -1;
          return order * (wa - wb);
        }
        case 'marginPerKg': {
          const ma = a.marginPerKg;
          const mb = b.marginPerKg;
          if (ma == null && mb == null) return 0;
          if (ma == null) return 1;
          if (mb == null) return -1;
          return order * (ma - mb);
        }
        case 'weightTon': {
          const wa = a.weightTon;
          const wb = b.weightTon;
          if (wa == null && wb == null) return 0;
          if (wa == null) return 1;
          if (wb == null) return -1;
          return order * (wa - wb);
        }
        case 'totalAmount':
          return order * (a.totalAmount - b.totalAmount);
        default:
          return 0;
      }
    });
    return sorted;
  }, [salesStatusRows, salesSortBy, salesSortOrder]);

  const totalAmount = useMemo(() => salesStatusRows.reduce((sum, r) => sum + r.totalAmount, 0), [salesStatusRows]);

  /** 중량 합계(톤) — 표시 시 kg로 환산 */
  const totalWeightTon = useMemo(
    () =>
      salesStatusRows.reduce((sum, r) => {
        const w = r.weightTon;
        if (w == null || Number.isNaN(w)) return sum;
        return sum + w;
      }, 0),
    [salesStatusRows],
  );

  /** 마진(원/kg) 산술평균 — 계산 가능한 행만 포함 */
  const averageMarginPerKg = useMemo(() => {
    const vals = salesStatusRows
      .map((r) => r.marginPerKg)
      .filter((m): m is number => m != null && !Number.isNaN(m));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [salesStatusRows]);

  /** 마진(원/kg) 합계금액 가중평균 — Σ(마진×합계금액)/Σ(합계금액), 마진·금액 모두 유효한 행만 */
  const weightedAvgMarginPerKgByAmount = useMemo(() => {
    let num = 0;
    let den = 0;
    for (const r of salesStatusRows) {
      const m = r.marginPerKg;
      const amt = r.totalAmount;
      if (m == null || Number.isNaN(m) || amt == null || Number.isNaN(amt) || amt <= 0) continue;
      num += m * amt;
      den += amt;
    }
    if (den <= 0) return null;
    return num / den;
  }, [salesStatusRows]);

  if (loading) {
    return (
      <AppLayout user={user}>
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">로딩 중...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="w-full max-w-full min-w-0 space-y-6 pb-10">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            대시보드
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            {isStockOnly
              ? '주간 재고 현황과 통관 전 재고를 한 화면에서 확인하세요'
              : '영업 현황을 한눈에 확인하세요'}
          </p>
        </div>

        <Tabs defaultValue="inventory" className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="inventory">주간 재고 현황</TabsTrigger>
            <TabsTrigger value="inbound-scheduled">통관 전 재고</TabsTrigger>
            {!isStockOnly ? (
              <>
                <TabsTrigger value="eta">입항 예정</TabsTrigger>
                <TabsTrigger value="sales">판매현황</TabsTrigger>
              </>
            ) : null}
          </TabsList>

          {/* 주간 재고 현황 (상세) 탭 — 판매 대시보드 전용 */}
          {!isStockOnly ? (
          <TabsContent value="inventory-detail" className="mt-0 space-y-6">
            <Card className="w-full py-4 gap-3">
              <CardHeader className="flex flex-row items-center justify-between py-1.5 px-4">
                <div className="space-y-0.5">
                  <CardTitle className="text-base font-semibold">주간 재고 현황 (상세)</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden py-2 px-4">
                {inventoryLoading ? (
                  <div className="flex py-12 items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : weeklyInventoryFlatRows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">재고 데이터가 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2 border-border bg-muted/80 dark:bg-muted/50 [&_th]:py-2.5">
                          {[
                            { key: 'exporterName', label: '수출사', className: 'min-w-[55px]', align: 'left' as const },
                            { key: 'bl', label: 'BL', className: 'min-w-[110px] print-hide-col', align: 'left' as const },
                            { key: 'productName', label: '품명', className: 'min-w-[120px]', align: 'left' as const },
                            { key: 'grade', label: '등급', className: 'min-w-[55px]', align: 'left' as const },
                            { key: 'inboundCnt', label: "q'ty", className: 'min-w-[60px]', align: 'right' as const },
                            { key: 'soldCnt', label: '판매', className: 'min-w-[55px]', align: 'right' as const },
                            { key: 'reservedCnt', label: '예약', className: 'min-w-[55px]', align: 'right' as const },
                            { key: 'availableCnt', label: '재고', className: 'min-w-[82px]', align: 'right' as const },
                            { key: 'soldWeight', label: '판매(중량)', className: 'min-w-[60px]', align: 'right' as const },
                            { key: 'reservedWeight', label: '예약(중량)', className: 'min-w-[60px]', align: 'right' as const },
                            { key: 'availableWeight', label: '가용(중량)', className: 'min-w-[70px]', align: 'right' as const },
                            { key: 'detentionShort', label: '반납 기한', className: 'min-w-[80px]', align: 'left' as const },
                            { key: 'returned', label: '반납', className: 'min-w-[60px]', align: 'right' as const },
                            { key: 'unreturned', label: '미반납', className: 'min-w-[48px]', align: 'right' as const },
                            { key: 'leased', label: '임대', className: 'min-w-[48px]', align: 'right' as const },
                          ].map(({ key, label, className, align }) => {
                            const isActive = inventoryDetailSortBy === key;
                            return (
                              <TableHead
                                key={key}
                                className={`font-medium cursor-pointer select-none hover:bg-muted ${className} ${align === 'right' ? 'text-right' : ''}`}
                                onClick={() => {
                                  setInventoryDetailSortBy(key);
                                  setInventoryDetailSortOrder(isActive && inventoryDetailSortOrder === 'asc' ? 'desc' : 'asc');
                                }}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {label}
                                  {isActive ? (inventoryDetailSortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5 shrink-0" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0" />) : <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                                </span>
                              </TableHead>
                            );
                          })}
                          <TableHead className="min-w-[12rem] font-medium notes-col-print">비고</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {weeklyInventoryFlatRowsSorted.map((row, idx) => (
                          <TableRow key={idx} className="border-b border-border last:border-0 hover:bg-muted/30">
                            <TableCell className="text-sm">{row.exporterName || ''}</TableCell>
                            <TableCell className="text-sm print-hide-col">{row.bl || ''}</TableCell>
                            <TableCell className="text-sm">{row.productName || ''}</TableCell>
                            <TableCell className="text-sm">{row.grade || ''}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{row.inboundCnt}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.soldCnt > 0
                                ? row.soldCnt.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
                                : '0'}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.reservedCnt > 0
                                ? row.reservedCnt.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                                : '0.00'}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {normalizeNegZeroEquiv(row.availableCnt).toLocaleString('ko-KR', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.soldWeight > 0
                                ? row.soldWeight.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.reservedWeight > 0
                                ? row.reservedWeight.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.availableWeight > 0
                                ? row.availableWeight.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '-'}
                            </TableCell>
                            <TableCell className="text-sm">{row.detentionShort || ''}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.returned > 0 ? row.returned : '0'}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.unreturned > 0 ? row.unreturned : '0'}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.leased > 0 ? row.leased : '0'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground notes-cell-print whitespace-normal break-words align-top min-w-[12rem]">{row.notes || ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          ) : null}

          {/* 주간 재고 현황 탭 - 카드 하나 + 카테고리별 섹션 */}
          <TabsContent value="inventory" className="mt-0">
            <div data-print-id="inventory">
              <Card className="w-full py-4 gap-3">
                <CardHeader className="flex flex-row items-center justify-between py-1.5 px-4">
                  <div className="space-y-0.5">
                    <CardTitle className="text-base font-semibold">참참바이오(주) 세일즈팀 주간 재고 현황</CardTitle>
                  </div>
                  {!isStockOnly && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 no-print"
                        onClick={() => {
                          const headers = ['카테고리', '상품명', 'BL', '수출사', '등급', '컨수', '판매', '예약', '가용재고', '디텐션', '미반납', '임대', '비고'];
                          const rows: (string | number)[][] = [];
                          for (const { category, rows: sectionRows } of weeklyInventoryRowsByCategory) {
                            for (const row of sectionRows.filter((r) => !r.isSubtotal)) {
                              rows.push([
                                category,
                                row.productName,
                                row.bl,
                                row.exporterName,
                                row.grade,
                                row.inboundCnt,
                                row.soldCnt > 0 ? row.soldCnt : '',
                                row.reservedCnt > 0 ? row.reservedCnt : '',
                                normalizeNegZeroEquiv(row.availableCnt),
                                row.detention,
                                row.unreturned > 0 ? row.unreturned : '',
                                row.leased > 0 ? row.leased : '',
                                row.notes ?? '',
                              ]);
                            }
                          }
                          downloadCsv(`주간재고현황_${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
                        }}
                        disabled={weeklyInventoryRowsByCategory.length === 0}
                      >
                        <Download className="h-4 w-4 mr-1.5" />
                        CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={createPrintHandler('inventory')} className="shrink-0 no-print">
                        <Printer className="h-4 w-4 mr-1.5" />
                        인쇄
                      </Button>
                    </div>
                  )}
                </CardHeader>
              <CardContent className="min-w-0 overflow-hidden py-2 px-4">
                {inventoryLoading ? (
                  <div className="flex py-12 items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : weeklyInventoryRowsByCategory.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    재고 데이터가 없습니다.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {weeklyInventoryRowsByCategorySorted.map(({ category, rows }, sectionIdx) => (
                      <section
                        key={category}
                        className={sectionIdx > 0 ? 'pt-6 border-t border-border' : ''}
                      >
                        <h3 className="text-sm font-semibold text-foreground mb-3">{category}</h3>
                        <div className="overflow-x-auto overflow-y-visible">
                          <Table className="table-fixed w-full min-w-[1127px]">
                            <colgroup>
                              <col style={{ width: 130 }} />
                              <col className="print-hide-col" style={{ width: 170 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 72 }} />
                              <col style={{ width: 85 }} />
                              <col style={{ width: 52 }} />
                              <col style={{ width: 46 }} />
                              <col className="print-hide-col" /> {/* 비고: 행 너비 나머지 (인쇄 시 숨김) */}
                            </colgroup>
                            <TableHeader>
                              <TableRow className="border-b-2 border-border bg-muted/80 dark:bg-muted/50 [&_th]:py-2.5">
                                {[
                                  { key: 'productName', label: '상품명', className: 'min-w-[130px]', align: 'left' as const },
                                  { key: 'bl', label: 'BL', className: 'print-hide-col', align: 'left' as const },
                                  { key: 'exporterName', label: '수출사', className: '', align: 'left' as const },
                                  { key: 'grade', label: '등급', className: '', align: 'left' as const },
                                  { key: 'inboundCnt', label: '컨수', className: '', align: 'right' as const },
                                  { key: 'soldCnt', label: '판매', className: '', align: 'right' as const },
                                  { key: 'reservedCnt', label: '예약', className: '', align: 'right' as const },
                                  { key: 'availableCnt', label: '가용재고', className: 'min-w-[72px]', align: 'right' as const },
                                ].map(({ key, label, className, align }) => {
                                  const isActive = inventorySectionSortBy === key;
                                  return (
                                    <TableHead
                                      key={key}
                                      className={`font-medium cursor-pointer select-none hover:bg-muted/50 ${className} ${align === 'right' ? 'text-right' : ''}`}
                                      onClick={() => {
                                        setInventorySectionSortBy(key);
                                        setInventorySectionSortOrder(isActive && inventorySectionSortOrder === 'asc' ? 'desc' : 'asc');
                                      }}
                                    >
                                      <span className="inline-flex items-center gap-1">
                                        {label}
                                        {isActive ? (inventorySectionSortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5 shrink-0" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0" />) : <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                                      </span>
                                    </TableHead>
                                  );
                                })}
                                <TableHead className="font-medium">디텐션</TableHead>
                                <TableHead className="font-medium text-right w-[52px] min-w-[52px] max-w-[52px]">미반납</TableHead>
                                <TableHead className="font-medium text-right w-[46px] min-w-[46px] max-w-[46px]">임대</TableHead>
                                <TableHead className="font-medium notes-col-print w-full min-w-[12rem] print-hide-col">비고</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((row, idx) => (
                                <TableRow
                                  key={`${category}-${idx}`}
                                  className={`border-b border-border last:border-0 hover:bg-muted/30 ${
                                    row.isSubtotal ? 'bg-slate-100 dark:bg-slate-800 font-medium' : ''
                                  }`}
                                >
                                  <TableCell className="text-sm overflow-hidden text-ellipsis" title={row.isSubtotal ? undefined : row.productName}>
                                    {row.isSubtotal ? '소계' : row.productName}
                                  </TableCell>
                                  <TableCell className="text-sm overflow-hidden text-ellipsis print-hide-col" title={row.bl || undefined}>
                                    {row.bl || ''}
                                  </TableCell>
                                  <TableCell className="text-sm overflow-hidden text-ellipsis" title={row.exporterName || undefined}>
                                    {row.exporterName || ''}
                                  </TableCell>
                                  <TableCell className="text-sm overflow-hidden text-ellipsis" title={row.grade || undefined}>
                                    {row.grade || ''}
                                  </TableCell>
                                  <TableCell className="text-sm text-right tabular-nums">
                                    {row.inboundCnt}
                                  </TableCell>
                                  <TableCell className="text-sm text-right tabular-nums">
                                    {row.soldCnt > 0
                                      ? row.soldCnt.toLocaleString('ko-KR', {
                                          minimumFractionDigits: 0,
                                          maximumFractionDigits: 1,
                                        })
                                      : ''}
                                    </TableCell>
                                    <TableCell className="text-sm text-right tabular-nums">
                                      {row.reservedCnt > 0
                                        ? row.reservedCnt.toLocaleString('ko-KR', {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 1,
                                          })
                                        : ''}
                                  </TableCell>
                                  <TableCell className="text-sm text-right tabular-nums">
                                    {normalizeNegZeroEquiv(row.availableCnt).toLocaleString('ko-KR', {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 1,
                                    })}
                                  </TableCell>
                                  <TableCell className="text-sm">{row.detention || ''}</TableCell>
                                  <TableCell className="text-sm text-right tabular-nums">
                                    {row.unreturned > 0 ? row.unreturned : ''}
                                  </TableCell>
                                  <TableCell className="text-sm text-right tabular-nums">
                                    {row.leased > 0 ? row.leased : ''}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground notes-cell-print whitespace-normal break-words align-top min-w-[12rem] w-full print-hide-col">
                                    {row.notes || ''}
                                  </TableCell>
                                </TableRow>
                              ))}
                              {(() => {
                                const subtotalRows = rows.filter((r) => r.isSubtotal);
                                const sectionTotal =
                                  subtotalRows.length > 0
                                    ? subtotalRows.reduce(
                                        (acc, r) => ({
                                          inboundCnt: acc.inboundCnt + r.inboundCnt,
                                          soldCnt: acc.soldCnt + r.soldCnt,
                                          reservedCnt: acc.reservedCnt + r.reservedCnt,
                                          availableCnt: acc.availableCnt + r.availableCnt,
                                          soldWeight: acc.soldWeight + r.soldWeight,
                                          reservedWeight: acc.reservedWeight + r.reservedWeight,
                                          availableWeight: acc.availableWeight + r.availableWeight,
                                          returned: acc.returned + r.returned,
                                          unreturned: acc.unreturned + r.unreturned,
                                          leased: acc.leased + r.leased,
                                        }),
                                        { inboundCnt: 0, soldCnt: 0, reservedCnt: 0, availableCnt: 0, soldWeight: 0, reservedWeight: 0, availableWeight: 0, returned: 0, unreturned: 0, leased: 0 }
                                      )
                                    : null;
                                return sectionTotal ? (
                                  <TableRow key={`${category}-total`} className="border-t-2 border-border bg-slate-200 dark:bg-slate-700 font-semibold">
                                    <TableCell className="text-sm">합계</TableCell>
                                    <TableCell className="text-sm print-hide-col" />
                                    <TableCell className="text-sm" />
                                    <TableCell className="text-sm" />
                                    <TableCell className="text-sm text-right tabular-nums">{sectionTotal.inboundCnt}</TableCell>
                                    <TableCell className="text-sm text-right tabular-nums">
                                      {sectionTotal.soldCnt > 0
                                        ? sectionTotal.soldCnt.toLocaleString('ko-KR', {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 1,
                                          })
                                        : ''}
                                    </TableCell>
                                    <TableCell className="text-sm text-right tabular-nums">
                                      {sectionTotal.reservedCnt > 0
                                        ? sectionTotal.reservedCnt.toLocaleString('ko-KR', {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 1,
                                          })
                                        : ''}
                                    </TableCell>
                                    <TableCell className="text-sm text-right tabular-nums">
                                      {normalizeNegZeroEquiv(sectionTotal.availableCnt).toLocaleString('ko-KR', {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 1,
                                      })}
                                    </TableCell>
                                    <TableCell className="text-sm" />
                                    <TableCell className="text-sm text-right tabular-nums">
                                      {sectionTotal.unreturned > 0 ? sectionTotal.unreturned : ''}
                                    </TableCell>
                                    <TableCell className="text-sm text-right tabular-nums">
                                      {sectionTotal.leased > 0 ? sectionTotal.leased : ''}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground print-hide-col" />
                                  </TableRow>
                                ) : null;
                              })()}
                            </TableBody>
                          </Table>
                        </div>
                      </section>
                    ))}
                    {inventoryGrandTotal && (
                      <section className="pt-6 border-t-2 border-border">
                        <h3 className="text-sm font-semibold text-foreground mb-3">총 합</h3>
                        <div className="overflow-x-auto overflow-y-visible">
                          <Table className="table-fixed w-full min-w-[1127px]">
                            <colgroup>
                              <col style={{ width: 130 }} />
                              <col className="print-hide-col" style={{ width: 170 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 55 }} />
                              <col style={{ width: 72 }} />
                              <col style={{ width: 85 }} />
                              <col style={{ width: 52 }} />
                              <col style={{ width: 46 }} />
                              <col className="print-hide-col" />
                            </colgroup>
                            <TableBody>
                              <TableRow className="border-b border-border bg-slate-300 dark:bg-slate-600 font-semibold">
                                <TableCell className="text-sm">총 합</TableCell>
                                <TableCell className="text-sm print-hide-col" />
                                <TableCell className="text-sm" />
                                <TableCell className="text-sm" />
                                <TableCell className="text-sm text-right tabular-nums">{inventoryGrandTotal.inboundCnt}</TableCell>
                                <TableCell className="text-sm text-right tabular-nums">
                                  {inventoryGrandTotal.soldCnt > 0
                                    ? inventoryGrandTotal.soldCnt.toLocaleString('ko-KR', {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 1,
                                      })
                                    : ''}
                                </TableCell>
                                <TableCell className="text-sm text-right tabular-nums">
                                  {inventoryGrandTotal.reservedCnt > 0
                                    ? inventoryGrandTotal.reservedCnt.toLocaleString('ko-KR', {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 1,
                                      })
                                    : ''}
                                </TableCell>
                                <TableCell className="text-sm text-right tabular-nums">
                                  {normalizeNegZeroEquiv(inventoryGrandTotal.availableCnt).toLocaleString('ko-KR', {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 1,
                                  })}
                                </TableCell>
                                <TableCell className="text-sm" />
                                <TableCell className="text-sm text-right tabular-nums">
                                  {inventoryGrandTotal.unreturned > 0 ? inventoryGrandTotal.unreturned : ''}
                                </TableCell>
                                <TableCell className="text-sm text-right tabular-nums">
                                  {inventoryGrandTotal.leased > 0 ? inventoryGrandTotal.leased : ''}
                                </TableCell>
                                <TableCell className="text-sm print-hide-col" />
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </section>
                    )}
                    {inventoryChartData.labels.length > 0 && (
                      <section className="print-chart-section pt-6 border-t border-border">
                        <h3 className="text-sm font-semibold text-foreground mb-3">참참바이오 실시간 재고 현황</h3>
                        <div className="w-full h-[320px] min-w-0">
                          <Chart
                            type="bar"
                            height={300}
                            series={[{ name: '가용 재고(컨)', data: inventoryChartData.series }]}
                            options={{
                              chart: {
                                type: 'bar',
                                toolbar: { show: false },
                                fontFamily: 'inherit',
                              },
                              plotOptions: {
                                bar: {
                                  columnWidth: '60%',
                                  borderRadius: 4,
                                  dataLabels: {
                                    position: 'top',
                                    hideOverflowingLabels: false,
                                  },
                                },
                              },
                              colors: ['#0d9488'],
                              dataLabels: {
                                enabled: true,
                                offsetY: -25,
                                formatter: (val: number) =>
                                  val > 0 ? `${Number(val).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}컨` : '',
                                style: {
                                  colors: ['#1f2937'],
                                  fontSize: '12px',
                                  fontWeight: 600,
                                },
                              },
                              xaxis: {
                                categories: inventoryChartData.labels,
                                labels: {
                                  rotate: -45,
                                  style: { fontSize: '11px' },
                                },
                              },
                              yaxis: {
                                labels: {
                                  formatter: (val: number) => val.toFixed(1),
                                },
                              },
                              tooltip: {
                                y: {
                                  formatter: (val: number) => `${val}컨`,
                                },
                              },
                              grid: {
                                xaxis: { lines: { show: false } },
                                yaxis: { lines: { show: true } },
                                padding: { top: 20 },
                              },
                            }}
                          />
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          {/* 통관 전 재고 (입고 예정) 탭 */}
          <TabsContent value="inbound-scheduled" className="mt-0">
            <div data-print-id="inbound-scheduled">
            <Card className="w-full py-4 gap-3">
              <CardHeader className="flex flex-row items-center justify-between py-1.5 px-4 gap-4">
                <div className="space-y-0.5">
                  <CardTitle className="text-base font-semibold">통관 전 재고</CardTitle>
                </div>
                {!isStockOnly && (
                  <div className="flex items-center gap-2 no-print">
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 no-print"
                      onClick={() => {
                        const headers = ['상품명', 'BL', '수출사', '등급', '컨 수량', '예약', '가용재고', '입항일', '입고 창고', '입고일정', '검역일정', '송장 금액', '비고'];
                        const rows: (string | number)[][] = inboundScheduledOrdersVisible.map((order) => {
                          const warehouseName = getWarehouseName(order.pendingInbound?.warehouse ?? null) || '';
                          const igodate = formatMonthDay(order.pendingInbound?.igodate) || '';
                          const quarantineDate = formatMonthDay(order.quarantineDate ?? order.pendingInbound?.quarantineDate) || '';
                          const { reservedDisplay, availableDisplay } = getInboundScheduledDisplayCounts(order.containers ?? []);
                          const invAmount = 'invoiceAmount' in order && order.invoiceAmount != null ? Number(order.invoiceAmount) : null;
                          const invCurrency = 'invoiceCurrency' in order ? (order as { invoiceCurrency?: string | null }).invoiceCurrency : null;
                          return [
                            getInboundScheduledProductDisplayName(order),
                            order.bl ?? '',
                            order.exporterName ?? '',
                            getGradeName(order),
                            (order.containers ?? []).length,
                            reservedDisplay > 0 ? Number(reservedDisplay.toFixed(1)) : '',
                            availableDisplay > 0 ? Number(availableDisplay.toFixed(1)) : '',
                            formatMonthDay(order.etaDate),
                            warehouseName,
                            igodate,
                            quarantineDate,
                            invAmount != null ? formatInvoiceAmount(invAmount, invCurrency) : '',
                            order.notes ?? '',
                          ];
                        });
                        downloadCsv(`통관전재고_${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
                      }}
                      disabled={inboundScheduledOrdersVisible.length === 0}
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={createPrintHandler('inbound-scheduled')} className="shrink-0 no-print">
                      <Printer className="h-4 w-4 mr-1.5" />
                      인쇄
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden py-2 px-4">
                {inboundScheduledLoading ? (
                  <div className="flex py-12 items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : inboundScheduledOrders.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    입고 예정 데이터가 없습니다.
                  </p>
                ) : isStockOnly && inboundScheduledOrdersVisible.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    가용재고가 있는 입고 예정이 없습니다.
                  </p>
                ) : (
                  <div className="overflow-x-auto overflow-y-visible">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2 border-border bg-muted/80 dark:bg-muted/50 [&_th]:py-2.5">
                          {[
                            { key: 'productName', label: '상품명', className: 'min-w-[110px]', align: 'left' as const },
                            { key: 'bl', label: 'BL', className: 'min-w-[100px] print-hide-col', align: 'left' as const },
                            { key: 'exporterName', label: '수출사', className: 'min-w-[55px]', align: 'left' as const },
                            { key: 'grade', label: '등급', className: 'min-w-[55px]', align: 'left' as const },
                            { key: 'containerCount', label: '컨 수량', className: 'min-w-[55px]', align: 'right' as const },
                            { key: 'reservedCnt', label: '예약', className: 'min-w-[55px]', align: 'right' as const },
                            { key: 'availableCnt', label: '가용재고', className: 'min-w-[55px]', align: 'right' as const },
                            { key: 'etaDate', label: '입항일', className: 'min-w-[65px]', align: 'left' as const },
                            { key: 'inboundWarehouse', label: '입고 창고', className: 'min-w-[90px]', align: 'left' as const },
                            { key: 'inboundSchedule', label: '이고일정', className: 'min-w-[65px]', align: 'left' as const },
                            { key: 'quarantineSchedule', label: '검역일정', className: 'min-w-[65px]', align: 'left' as const },
                            { key: 'invoiceAmount', label: '송장 금액', className: 'min-w-[90px]', align: 'right' as const },
                          ].map(({ key, label, className, align }) => {
                            const isActive = inboundScheduledSortBy === key;
                            return (
                              <TableHead
                                key={key}
                                className={`font-medium cursor-pointer select-none hover:bg-muted/50 ${className} ${align === 'right' ? 'text-right' : ''}`}
                                onClick={() => {
                                  setInboundScheduledSortBy(key);
                                  setInboundScheduledSortOrder(isActive && inboundScheduledSortOrder === 'asc' ? 'desc' : 'asc');
                                }}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {label}
                                  {isActive ? (inboundScheduledSortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5 shrink-0" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0" />) : <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                                </span>
                              </TableHead>
                            );
                          })}
                          <TableHead className="min-w-[100px] font-medium notes-col-print print-hide-col">비고</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inboundScheduledOrdersSorted.map((order) => {
                          const inboundWarehouse = order.pendingInbound?.warehouse ?? null;
                          const warehouseName = getWarehouseName(inboundWarehouse) || '';
                          const igodate = formatMonthDay(order.pendingInbound?.igodate) || '';
                          const quarantineDate =
                            formatMonthDay(order.quarantineDate ?? order.pendingInbound?.quarantineDate) || '';
                          const { reservedDisplay, availableDisplay } = getInboundScheduledDisplayCounts(order.containers ?? []);
                          const invAmount = 'invoiceAmount' in order ? (order as { invoiceAmount?: number | null; invoiceCurrency?: string | null }).invoiceAmount : null;
                          const invCurrency = 'invoiceCurrency' in order ? (order as { invoiceCurrency?: string | null }).invoiceCurrency : null;
                          return (
                            <TableRow key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                              <TableCell className="text-sm">{getInboundScheduledProductDisplayName(order)}</TableCell>
                              <TableCell className="text-sm print-hide-col">{order.bl || ''}</TableCell>
                              <TableCell className="text-sm">{order.exporterName || ''}</TableCell>
                              <TableCell className="text-sm">{getGradeName(order)}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">
                                {(order.containers ?? []).length}
                              </TableCell>
                              <TableCell className="text-sm text-right tabular-nums">
                                {reservedDisplay > 0 ? reservedDisplay.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-'}
                              </TableCell>
                              <TableCell className="text-sm text-right tabular-nums">
                                {availableDisplay > 0 ? availableDisplay.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-'}
                              </TableCell>
                              <TableCell className="text-sm">{formatMonthDay(order.etaDate)}</TableCell>
                              <TableCell className="text-sm">{warehouseName}</TableCell>
                              <TableCell className="text-sm">{igodate}</TableCell>
                              <TableCell className="text-sm">{quarantineDate}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">{invAmount != null ? formatInvoiceAmount(invAmount, invCurrency) : '-'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground notes-cell-print print-hide-col" title={order.notes || undefined}>{order.notes || ''}</TableCell>
                            </TableRow>
                          );
                        })}
                        {(() => {
                          const withInv = inboundScheduledOrdersSorted.filter((o) => 'invoiceAmount' in o && (o as { invoiceAmount?: number | null }).invoiceAmount != null);
                          const currencies = withInv.map((o) => ((o as { invoiceCurrency?: string | null }).invoiceCurrency ?? 'KRW').trim().toUpperCase() || 'KRW');
                          const allSameCurrency = currencies.length <= 1 || currencies.every((c) => c === currencies[0]);
                          const sumAmount = withInv.reduce((sum, o) => sum + ((o as { invoiceAmount?: number | null }).invoiceAmount ?? 0), 0);
                          const sumCurrency = currencies[0] ?? 'KRW';
                          return (
                        <TableRow className="border-t-2 border-border bg-slate-200 dark:bg-slate-700 font-semibold">
                          <TableCell className="text-sm">합계</TableCell>
                          <TableCell className="text-sm print-hide-col" />
                          <TableCell className="text-sm" colSpan={2} />
                          <TableCell className="text-sm text-right tabular-nums">{inboundScheduledTotal}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {inboundScheduledOrdersSorted.reduce((sum, o) => sum + getInboundScheduledDisplayCounts(o.containers ?? []).reservedDisplay, 0).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {inboundScheduledOrdersSorted.reduce((sum, o) => sum + getInboundScheduledDisplayCounts(o.containers ?? []).availableDisplay, 0).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </TableCell>
                          <TableCell className="text-sm" colSpan={4} />
                          <TableCell className="text-sm text-right tabular-nums">
                            {allSameCurrency && withInv.length > 0 ? formatInvoiceAmount(sumAmount, sumCurrency) : withInv.length > 0 ? '혼합통화' : '-'}
                          </TableCell>
                          <TableCell className="text-sm print-hide-col" />
                        </TableRow>
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          {!isStockOnly ? (
            <>
          {/* 입항 예정 탭 */}
          <TabsContent value="eta" className="mt-0">
            <div data-print-id="eta">
            <Card className="w-full py-4 gap-3">
              <CardHeader className="flex flex-row items-center justify-between py-1.5 px-4 gap-4">
                <div className="space-y-0.5">
                  <CardTitle className="text-base font-semibold">입항 예정</CardTitle>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <MonthPicker
                    value={etaMonth}
                    onChange={(v) => setEtaMonth(v ?? '')}
                    placeholder="월 선택"
                    className="w-[140px]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const headers = [
                        '상품명',
                        'BL',
                        '수출사',
                        '영업 등급',
                        '컨 수량',
                        '예약',
                        '가용재고',
                        '입항일',
                        '입고 창고',
                        '입고일정',
                        '검역일정',
                        '송장 금액',
                        '비고',
                      ];
                      const rows: (string | number)[][] = etaOrders.map((order) => {
                        const warehouseCode = order.confirmedInbound?.warehouse ?? order.pendingInbound?.warehouse ?? '';
                        const inboundSchedule = formatMonthDay(order.confirmedInbound?.igodate ?? order.pendingInbound?.igodate) || '';
                        const quarantineSchedule = formatMonthDay(order.quarantineDate ?? order.confirmedInbound?.quarantineDate ?? order.pendingInbound?.quarantineDate) || '';
                        const { reservedDisplay, availableDisplay } = getTradeOrderInboundScheduledDisplayCounts(order);
                        return [
                          getProductName(order.productName),
                          order.bl ?? '',
                          order.exporterName ?? '',
                          getGradeName(order),
                          (order.containers ?? []).length,
                          reservedDisplay > 0 ? Number(reservedDisplay.toFixed(1)) : '',
                          availableDisplay > 0 ? Number(availableDisplay.toFixed(1)) : '',
                          formatMonthDay(order.etaDate),
                          getWarehouseName(warehouseCode) || warehouseCode,
                          inboundSchedule,
                          quarantineSchedule,
                          order.invoiceAmount != null ? formatInvoiceAmount(order.invoiceAmount, order.invoiceCurrency) : '',
                          order.notes ?? '',
                        ];
                      });
                      downloadCsv(`입항예정_${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
                    }}
                    disabled={etaOrders.length === 0}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={createPrintHandler('eta')} className="shrink-0">
                    <Printer className="h-4 w-4 mr-1.5" />
                    인쇄
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden py-2 px-4">
                {etaLoading ? (
                  <div className="flex py-12 items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : etaOrders.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    해당 기간 ETA 입항 예정이 없습니다.
                  </p>
                ) : (
                  <div className="overflow-x-auto overflow-y-visible">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2 border-border bg-muted/80 dark:bg-muted/50 [&_th]:py-2.5">
                          {[
                            { key: 'productName', label: '상품명', className: 'min-w-[110px]', align: 'left' as const },
                            { key: 'bl', label: 'BL', className: 'min-w-[100px] print-hide-col', align: 'left' as const },
                            { key: 'exporterName', label: '수출사', className: 'min-w-[55px]', align: 'left' as const },
                            { key: 'grade', label: '영업 등급', className: 'min-w-[55px]', align: 'left' as const },
                            { key: 'containerCount', label: '컨 수량', className: 'min-w-[55px]', align: 'right' as const },
                            { key: 'reservedCnt', label: '예약', className: 'min-w-[55px]', align: 'right' as const },
                            { key: 'availableCnt', label: '가용재고', className: 'min-w-[55px]', align: 'right' as const },
                            { key: 'etaDate', label: '입항일', className: 'min-w-[65px]', align: 'left' as const },
                            { key: 'inboundWarehouse', label: '입고 창고', className: 'min-w-[70px]', align: 'left' as const },
                            { key: 'inboundSchedule', label: '입고일정', className: 'min-w-[65px]', align: 'left' as const },
                            { key: 'quarantineSchedule', label: '검역일정', className: 'min-w-[65px]', align: 'left' as const },
                            { key: 'invoiceAmount', label: '송장 금액', className: 'min-w-[90px]', align: 'right' as const },
                          ].map(({ key, label, className, align }) => {
                            const isActive = etaSortBy === key;
                            return (
                              <TableHead
                                key={key}
                                className={`font-medium cursor-pointer select-none hover:bg-muted/50 ${className} ${align === 'right' ? 'text-right' : ''}`}
                                onClick={() => {
                                  setEtaSortBy(key);
                                  setEtaSortOrder(isActive && etaSortOrder === 'asc' ? 'desc' : 'asc');
                                }}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {label}
                                  {isActive ? (
                                    etaSortOrder === 'asc' ? (
                                      <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                                    ) : (
                                      <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                                    )
                                  ) : (
                                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                                  )}
                                </span>
                              </TableHead>
                            );
                          })}
                          <TableHead className="min-w-[100px] font-medium notes-col-print">비고</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {etaOrdersSorted.map((order: TradeOrder) => {
                          const inboundWarehouse =
                            order.confirmedInbound?.warehouse ?? order.pendingInbound?.warehouse ?? '';
                          const inboundSchedule =
                            formatMonthDay(order.confirmedInbound?.igodate ?? order.pendingInbound?.igodate) || '';
                          const quarantineSchedule =
                            formatMonthDay(
                              order.quarantineDate ??
                                order.confirmedInbound?.quarantineDate ??
                                order.pendingInbound?.quarantineDate
                            ) || '';
                          const { reservedDisplay, availableDisplay } = getTradeOrderInboundScheduledDisplayCounts(order);
                          return (
                            <TableRow key={order.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${order.shipBack === true ? 'line-through text-muted-foreground' : ''}`}>
                              <TableCell className="text-sm">{getProductName(order.productName)}</TableCell>
                              <TableCell className="text-sm print-hide-col">{order.bl || ''}</TableCell>
                              <TableCell className="text-sm">{order.exporterName || ''}</TableCell>
                              <TableCell className="text-sm">{getGradeName(order)}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">
                                {(order.containers ?? []).length}
                              </TableCell>
                              <TableCell className="text-sm text-right tabular-nums">
                                {reservedDisplay > 0
                                  ? reservedDisplay.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                  : '-'}
                              </TableCell>
                              <TableCell className="text-sm text-right tabular-nums">
                                {availableDisplay > 0
                                  ? availableDisplay.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                  : '-'}
                              </TableCell>
                              <TableCell className="text-sm">{formatMonthDay(order.etaDate)}</TableCell>
                              <TableCell className="text-sm">{inboundWarehouse}</TableCell>
                              <TableCell className="text-sm">{inboundSchedule}</TableCell>
                              <TableCell className="text-sm">{quarantineSchedule}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">{order.invoiceAmount != null ? formatInvoiceAmount(order.invoiceAmount, order.invoiceCurrency) : '-'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground notes-cell-print" title={order.notes || undefined}>{order.notes || ''}</TableCell>
                            </TableRow>
                          );
                        })}
                        {(() => {
                          const withInv = etaOrdersSorted.filter((o) => o.invoiceAmount != null);
                          const currencies = withInv.map((o) => (o.invoiceCurrency ?? 'KRW').trim().toUpperCase() || 'KRW');
                          const allSameCurrency = currencies.length <= 1 || currencies.every((c) => c === currencies[0]);
                          const sumAmount = withInv.reduce((sum, o) => sum + (o.invoiceAmount ?? 0), 0);
                          const sumCurrency = currencies[0] ?? 'KRW';
                          return (
                        <TableRow className="border-t-2 border-border bg-slate-200 dark:bg-slate-700 font-semibold">
                          <TableCell className="text-sm">합계</TableCell>
                          <TableCell className="text-sm print-hide-col" />
                          <TableCell className="text-sm" />
                          <TableCell className="text-sm" />
                          <TableCell className="text-sm text-right tabular-nums">{etaTotal}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {etaOrdersSorted
                              .reduce((sum, o) => sum + getTradeOrderInboundScheduledDisplayCounts(o).reservedDisplay, 0)
                              .toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {etaOrdersSorted
                              .reduce((sum, o) => sum + getTradeOrderInboundScheduledDisplayCounts(o).availableDisplay, 0)
                              .toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </TableCell>
                          <TableCell className="text-sm" colSpan={4} />
                          <TableCell className="text-sm text-right tabular-nums">
                            {allSameCurrency && withInv.length > 0 ? formatInvoiceAmount(sumAmount, sumCurrency) : withInv.length > 0 ? '혼합통화' : '-'}
                          </TableCell>
                          <TableCell className="text-sm" />
                        </TableRow>
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          {/* 판매현황 탭 */}
          <TabsContent value="sales" className="mt-0">
            <div data-print-id="sales">
            <Card className="w-full py-4 gap-3">
              <CardHeader className="flex flex-row items-center justify-between py-1.5 px-4 gap-4">
                <div className="space-y-0.5">
                  <CardTitle className="text-base font-semibold">판매현황</CardTitle>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <DateRangePicker
                    startDate={new Date(salesDateRange.from)}
                    endDate={new Date(salesDateRange.to)}
                    onChange={(start, end) => {
                      if (start && end) {
                        setSalesDateRange({
                          from: format(start, 'yyyy-MM-dd'),
                          to: format(end, 'yyyy-MM-dd'),
                        });
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const headers = [
                        '상품명',
                        '고객명',
                        'BL',
                        '컨테이너',
                        '차량유형',
                        '운임비',
                        '작업비합(원)',
                        '마진(원/kg)',
                        '중량(kg)',
                        '합계금액',
                      ];
                      const rows: (string | number)[][] = salesStatusRows.map((r) => {
                        const stageLabel = r.salesUnitPriceStage
                          ? (salesPriceStageMap.get(r.salesUnitPriceStage) || r.salesUnitPriceStage)
                          : '';
                        const inputParen =
                          r.salesTransportFeeInput != null && !Number.isNaN(r.salesTransportFeeInput)
                            ? `(${formatWonIntegerPlain(r.salesTransportFeeInput)})`
                            : '';
                        const kgPart =
                          r.transportFeePerKg != null && !Number.isNaN(r.transportFeePerKg)
                            ? `${formatMarginPerKg(r.transportFeePerKg)}원/kg${inputParen}`
                            : inputParen || '—';
                        const freightCell = [stageLabel, kgPart].filter((s) => String(s).trim()).join(' ');
                        return [
                          r.productName,
                          r.companyName,
                          r.bl,
                          r.container,
                          r.vehicleType,
                          freightCell,
                          r.workFeePerKg != null && !Number.isNaN(r.workFeePerKg) ? r.workFeePerKg : '',
                          r.marginPerKg != null && !Number.isNaN(r.marginPerKg) ? r.marginPerKg : '',
                          r.weightTon != null && !Number.isNaN(r.weightTon) ? r.weightTon * 1000 : '',
                          r.totalAmount != null && !Number.isNaN(r.totalAmount) ? r.totalAmount : '',
                        ];
                      });
                      downloadCsv(`판매현황_${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
                    }}
                    disabled={salesStatusRows.length === 0}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={createPrintHandler('sales')} className="shrink-0">
                    <Printer className="h-4 w-4 mr-1.5" />
                    인쇄
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden py-2 px-4">
                {invoicesLoading ? (
                  <div className="flex py-12 items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : salesStatusRows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    해당 기간에 판매 데이터가 없습니다.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2 border-border bg-muted/80 dark:bg-muted/50 [&_th]:py-2.5">
                          {[
                            { key: 'productName', label: '상품명', className: 'min-w-[110px]', align: 'left' as const },
                            { key: 'companyName', label: '고객명', className: 'min-w-[120px]', align: 'left' as const },
                            { key: 'bl', label: 'BL', className: 'min-w-[100px] print-hide-col', align: 'left' as const },
                            { key: 'container', label: '컨테이너', className: 'min-w-[140px]', align: 'left' as const },
                            { key: 'vehicleType', label: '차량유형', className: 'min-w-[84px]', align: 'left' as const },
                            {
                              key: 'transportFeePerKg',
                              label: '운임비',
                              className: 'min-w-[13rem] print-hide-col',
                              align: 'left' as const,
                              thTitle:
                                '구분 뱃지 + kg당 배분(마진 산식과 동일) + 괄호 안 입력 총액(원, 정수)',
                            },
                            {
                              key: 'workFeePerKg',
                              label: '작업비(합)',
                              className: 'min-w-[76px]',
                              align: 'right' as const,
                              thTitle: '창고(co_work_fee)+현장(co_onsite_work_fee) 작업비 합계(원). 명세 컨테이너와 동일',
                            },
                            {
                              key: 'marginPerKg',
                              label: '마진(원/kg)',
                              className: 'min-w-[100px]',
                              align: 'right' as const,
                              thTitle:
                                'kg당 마진(원). 판매 상세와 동일: 판매단가 − 원가(입고상태별) − 운송비(같은 판매·명세 품목 중량 비율로 배분 후 kg당)',
                            },
                            {
                              key: 'weightTon',
                              label: '중량(kg)',
                              className: 'min-w-[96px]',
                              align: 'right' as const,
                              thTitle: 'kg 단위 표시. 명세 품목 중량(톤) 우선, 없으면 컨테이너·카고 중량(톤)을 ×1000 환산',
                            },
                            { key: 'totalAmount', label: '합계금액', className: 'min-w-[110px]', align: 'right' as const },
                          ].map((col) => {
                            const { key, label, className, align, thTitle } = col as {
                              key: string;
                              label: string;
                              className: string;
                              align: 'left' | 'right';
                              thTitle?: string;
                            };
                            const isActive = salesSortBy === key;
                            return (
                              <TableHead
                                key={key}
                                title={thTitle}
                                className={`font-medium cursor-pointer select-none hover:bg-muted/50 ${className} ${align === 'right' ? 'text-right' : ''}`}
                                onClick={() => {
                                  setSalesSortBy(key);
                                  setSalesSortOrder(isActive && salesSortOrder === 'asc' ? 'desc' : 'asc');
                                }}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {label}
                                  {isActive ? (salesSortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5 shrink-0" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0" />) : <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                                </span>
                              </TableHead>
                            );
                          })}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salesStatusRowsSorted.map((row, idx) => (
                          <TableRow key={idx} className="border-b border-border last:border-0 hover:bg-muted/30">
                            <TableCell className="text-sm">{row.productName}</TableCell>
                            <TableCell className="text-sm">{row.companyName}</TableCell>
                            <TableCell className="text-sm print-hide-col">{row.bl}</TableCell>
                            <TableCell className="text-sm">{row.container}</TableCell>
                            <TableCell className="text-sm">{row.vehicleType}</TableCell>
                            <TableCell className="text-sm min-w-0 max-w-[22rem] print-hide-col">
                              <div className="flex flex-nowrap items-center gap-x-1.5 min-w-0 overflow-x-auto">
                                {row.salesUnitPriceStage ? (
                                  <Badge
                                    variant="outline"
                                    className={`shrink-0 ${salesUnitPriceStageBadgeClassName(row.salesUnitPriceStage)}`}
                                  >
                                    {salesPriceStageMap.get(row.salesUnitPriceStage) || row.salesUnitPriceStage}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground shrink-0">—</span>
                                )}
                                <span className="tabular-nums whitespace-nowrap text-foreground">
                                  {row.transportFeePerKg != null && !Number.isNaN(row.transportFeePerKg)
                                    ? `${formatMarginPerKg(row.transportFeePerKg)}원/kg`
                                    : '—'}
                                  {row.salesTransportFeeInput != null && !Number.isNaN(row.salesTransportFeeInput) ? (
                                    <span className="text-muted-foreground">
                                      ({formatWonIntegerPlain(row.salesTransportFeeInput)})
                                    </span>
                                  ) : null}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {formatWorkFeePerKg(row.workFeePerKg)}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {formatMarginPerKg(row.marginPerKg)}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {formatWeightKgFromTon(row.weightTon)}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {row.totalAmount != null && !Number.isNaN(row.totalAmount)
                                ? formatCurrency(row.totalAmount)
                                : ''}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 border-border bg-slate-200 dark:bg-slate-700 font-medium">
                          <TableCell className="text-sm">합계</TableCell>
                          <TableCell className="text-sm" />
                          <TableCell className="text-sm print-hide-col" />
                          <TableCell className="text-sm" />
                          <TableCell className="text-sm" />
                          <TableCell className="text-sm print-hide-col" />
                          <TableCell className="text-sm text-right tabular-nums" />
                          <TableCell
                            className="text-sm text-right tabular-nums font-semibold"
                            title="마진(원/kg) 요약 — 산술: 행마다 동일 비중. 가중: 합계금액 비중(Σ(마진×금액)/Σ(금액))."
                          >
                            {averageMarginPerKg != null || weightedAvgMarginPerKgByAmount != null ? (
                              <span className="inline-flex flex-row flex-wrap justify-end gap-x-2 gap-y-0.5 items-baseline leading-tight">
                                {averageMarginPerKg != null ? (
                                  <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                                    <span className="text-[10px] font-normal text-muted-foreground">산술 평균</span>
                                    <span>{formatMarginPerKg(averageMarginPerKg)}</span>
                                  </span>
                                ) : null}
                                {averageMarginPerKg != null && weightedAvgMarginPerKgByAmount != null ? (
                                  <span className="text-muted-foreground select-none" aria-hidden>
                                    ·
                                  </span>
                                ) : null}
                                {weightedAvgMarginPerKgByAmount != null ? (
                                  <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                                    <span className="text-[10px] font-normal text-muted-foreground">금액 가중</span>
                                    <span>{formatMarginPerKg(weightedAvgMarginPerKgByAmount)}</span>
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell
                            className="text-sm text-right tabular-nums font-semibold"
                            title="행별 중량(kg) 합계 — 톤 기준 데이터를 합산 후 ×1000"
                          >
                            {totalWeightTon > 0 ? formatWeightKgFromTon(totalWeightTon) : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums font-semibold">
                            {formatCurrency(totalAmount)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </TabsContent>
            </>
          ) : null}
        </Tabs>
      </div>
    </AppLayout>
  );
}
