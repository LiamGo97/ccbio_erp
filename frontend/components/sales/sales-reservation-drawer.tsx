'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, X, Save, Building2, Phone, Trash2, Package, Plus, CheckSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef, OnChangeFn, RowSelectionState } from '@tanstack/react-table';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, formatDecimalTrimTrailingZeros } from '@/lib/utils';
import { InboundStatusBadge } from '@/components/sales/inbound-status-badge';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import {
  useSalesReservation,
  useCreateSalesReservation,
  useUpdateSalesReservation,
  useDeleteSalesReservation,
  useBlLookupSalesReservation,
  resolveProductDisplayNameFromCodes,
  type CreateSalesReservationDto,
  type SalesReservation,
  type BlLookupMatch,
} from '@/lib/hooks/use-sales-reservations';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';

export interface SalesReservationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string | null;
  onSuccess?: () => void;
}

interface CompanySearchResult {
  id: string;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
  region?: string | null;
  customerPostalCode?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  addressDetail?: string | null;
}

type FormState = {
  customerId: string;
  /** 고객 마스터 전화 (판매 등록과 동일 UX) */
  customerPhone: string;
  customerCompanyName: string;
  customerCeo: string;
  bl: string;
  tradeOrderId: string;
  contactPhone: string;
  requestedQty: string;
  vehicleType: string;
  loadingWarehouseId: string;
  loadingWarehouseText: string;
  customsDate: string;
  /** 구간·주차 등 자유 표기 (예: 4월 1~2주차) — API `loadingScheduleNote` */
  loadingScheduleNote: string;
  remarks: string;
  /** 판매 단가 구분 (SALES_PRICE_STAGE) */
  unitPriceStage: string;
  unitPrice: string;
  reference: string;
  sortOrder: string;
  status: string;
  /**
   * 판매관리(tb_sales_reservation) 과도기: 신규·일반 건은 BALE. 기존 톤(MT/TON/T) 건만 유지.
   * 판매예약 그리드와 달리 여기서는 베일(또는 레거시 톤) 단위.
   */
  qtyUnit: string;
};

const emptyForm = (): FormState => ({
  customerId: '',
  customerPhone: '',
  customerCompanyName: '',
  customerCeo: '',
  bl: '',
  tradeOrderId: '',
  contactPhone: '',
  requestedQty: '',
  vehicleType: '',
  loadingWarehouseId: '',
  loadingWarehouseText: '',
  customsDate: '',
  loadingScheduleNote: '',
  remarks: '',
  unitPriceStage: '',
  unitPrice: '',
  reference: '',
  sortOrder: '0',
  status: 'ACTIVE',
  qtyUnit: 'BALE',
});

function formatPhoneInput(input: string): string {
  if (!input) return '';
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function formatEta(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

type InboundFilter = '__all__' | 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED';

type InventoryFilter =
  | '__all__'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'PARTIALLY_RESERVED'
  | 'PARTIALLY_SOLD'
  | 'PARTIALLY_SOLD_COMPLETED'
  | 'SELLING'
  | 'SOLD_OUT';

type InboundStatusKey = 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED';

type StatusCounts = Partial<Record<InboundStatusKey, number>>;

function isWeightSalesReservationQtyUnit(u: string | null | undefined): boolean {
  const s = (u ?? '').trim().toUpperCase();
  return s === 'MT' || s === 'TON' || s === 'T';
}

/** 상세 → 폼: 톤 단위 레거시만 유지, 그 외는 BALE(판매관리 기본). */
function qtyUnitDetailToForm(d: SalesReservation): string {
  return isWeightSalesReservationQtyUnit(d.qtyUnit) ? (d.qtyUnit ?? '').trim() : 'BALE';
}

/** 폼 → DTO: 톤만 MT/TON/T 그대로 두고, 나머지는 BALE로 저장(과도기 명시). */
function normalizedSalesReservationQtyUnitForSave(f: FormState): string {
  const s = (f.qtyUnit ?? '').trim().toUpperCase();
  if (s === 'MT' || s === 'TON' || s === 'T') {
    return (f.qtyUnit ?? '').trim();
  }
  return 'BALE';
}

function parseOptionalNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** API 컨테이너 1건 (집계 전) */
type ReservationContainerRow = {
  id: string;
  orderId: string;
  bk: string | null;
  bl: string | null;
  productName: string | null;
  exportCountryName: string | null;
  exporterName: string | null;
  etaDate: string | null;
  inboundStatus: string | null;
  inventoryStatus: string | null;
  /** 베일: 영업 우선, 없으면 무역 (판매 등록 컨테이너 매핑과 동일) */
  bales: number | null;
  /** 중량(톤). KG 표시 시 ×1000 */
  weightMt: number | null;
  /** 예약(판매항목 RESERVED·SOLD)으로 나간 베일·중량(톤) */
  reservedBales: number;
  reservedWeightMt: number;
  /** 판매완료(COMPLETED·INVENTORY_CONSUMPTION) 베일·중량(톤) */
  completedBales: number;
  completedWeightMt: number;
  /** 잔여(전체 − 예약·완료 출고 합) 베일·중량(톤) */
  availableBales: number;
  availableWeightMt: number;
  /** TB 판매예약 요청(베일·톤) — 가용 차감에 반영됨 */
  sheetReservationBales: number;
  sheetReservationWeightMt: number;
};

/** BL·BK별 집계 행 (컨테이너 번호는 표시하지 않음) */
type ReservationBlBkGroupRow = {
  rowKey: string;
  bl: string | null;
  bk: string | null;
  containerCount: number;
  productName: string | null;
  exportCountryName: string | null;
  exporterName: string | null;
  etaDate: string | null;
  statusCounts: StatusCounts;
  /** 컨테이너 수 기준 재고 상태 분포 */
  inventoryCounts: Record<string, number>;
  totalBales: number;
  totalWeightMt: number | null;
  totalReservedBales: number;
  totalReservedWeightMt: number | null;
  totalCompletedBales: number;
  totalCompletedWeightMt: number | null;
  totalAvailableBales: number;
  totalAvailableWeightMt: number | null;
  /** TB 판매예약 ACTIVE 요청 합계 */
  totalSheetReservationBales: number;
  totalSheetReservationWeightMt: number | null;
  /**
   * 판매대시보드 주간 재고 현황과 동일: 컨당 베일(또는 중량) 비율로 가용 컨 상당 합산 후,
   * 가용+예약 합이 실컨 수를 넘으면 정규화한 값(표시용 남은 컨수).
   */
  availableContainerEquivDisplay: number;
  /** 예약+판매완료 컨 상당(원값). 0 초과면 컨수 셀에 남은/전체 형식 표시 */
  containerEquivOutflow: number;
  /** 선택 확정 시 발주 연결용 (그룹 내 첫 건) */
  representativeOrderId: string | null;
};

/** 판매대시보드 `getInboundScheduledContainerEquivalents`와 동일 규칙(베일 우선, 없으면 중량) */
function weeklyInventoryStyleContainerEquivFromContainer(c: ReservationContainerRow): {
  availableCnt: number;
  reservedCnt: number;
  soldCnt: number;
} {
  const bales = c.bales != null && c.bales > 0 ? Number(c.bales) : 0;
  const weight = c.weightMt != null && c.weightMt > 0 ? Number(c.weightMt) : 0;
  const useBales = bales > 0;
  const denom = useBales ? bales : weight;
  if (denom <= 0) {
    return { availableCnt: 0, reservedCnt: 0, soldCnt: 0 };
  }
  if (useBales) {
    const availB = c.availableBales ?? 0;
    const reservedB = c.reservedBales ?? 0;
    const completedB = c.completedBales ?? 0;
    return {
      availableCnt: availB / denom,
      reservedCnt: reservedB / denom,
      soldCnt: completedB / denom,
    };
  }
  const availW = c.availableWeightMt ?? 0;
  const reservedW = c.reservedWeightMt ?? 0;
  const completedW = c.completedWeightMt ?? 0;
  return {
    availableCnt: availW / denom,
    reservedCnt: reservedW / denom,
    soldCnt: completedW / denom,
  };
}

function mapApiContainerToRow(c: Record<string, unknown>): ReservationContainerRow {
  const salesBales = parseOptionalNumber(c.salesBales);
  const tradeBales = parseOptionalNumber(c.tradeBales);
  const bales = salesBales ?? tradeBales ?? null;
  const weightMt = parseOptionalNumber(c.weight);
  const nz = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : 0);
  return {
    id: String(c.id ?? ''),
    orderId: String(c.orderId ?? ''),
    bk: (c.bk as string | null | undefined) ?? (c.bookingNo as string | null | undefined) ?? null,
    bl: (c.bl as string | null | undefined) ?? null,
    productName: (c.productName as string | null | undefined) ?? null,
    exportCountryName: (c.exportCountryName as string | null | undefined) ?? null,
    exporterName: (c.exporterName as string | null | undefined) ?? null,
    etaDate: (c.etaDate as string | null | undefined) ?? null,
    inboundStatus: (c.inboundStatus as string | null | undefined) ?? null,
    inventoryStatus: (c.inventoryStatus as string | null | undefined) ?? null,
    bales,
    weightMt,
    reservedBales: nz(parseOptionalNumber(c.reservedBales)),
    reservedWeightMt: nz(parseOptionalNumber(c.reservedWeight)),
    completedBales: nz(parseOptionalNumber(c.completedBales)),
    completedWeightMt: nz(parseOptionalNumber(c.completedWeight)),
    availableBales: nz(parseOptionalNumber(c.availableBales)),
    availableWeightMt: nz(parseOptionalNumber(c.availableWeight)),
    sheetReservationBales: nz(parseOptionalNumber(c.sheetReservationBales)),
    sheetReservationWeightMt: nz(parseOptionalNumber(c.sheetReservationWeight)),
  };
}

function aggregateContainersByBlBk(containers: ReservationContainerRow[]): ReservationBlBkGroupRow[] {
  type Acc = {
    bl: string | null;
    bk: string | null;
    containerCount: number;
    statusCounts: StatusCounts;
    etas: Date[];
    productName: string | null;
    exportCountryName: string | null;
    exporterName: string | null;
    representativeOrderId: string | null;
    inventoryCounts: Record<string, number>;
    totalBales: number;
    totalWeightMt: number;
    hasAnyWeight: boolean;
    totalReservedBales: number;
    totalReservedWeightMt: number;
    hasAnyReservedWeight: boolean;
    totalCompletedBales: number;
    totalCompletedWeightMt: number;
    hasAnyCompletedWeight: boolean;
    totalAvailableBales: number;
    totalAvailableWeightMt: number;
    hasAnyAvailableWeight: boolean;
    totalSheetReservationBales: number;
    totalSheetReservationWeightMt: number;
    hasAnySheetReservationWeight: boolean;
    availableContainerEquiv: number;
    reservedContainerEquiv: number;
    soldContainerEquiv: number;
  };
  const map = new Map<string, Acc>();

  for (const c of containers) {
    const bl = c.bl?.trim() ? c.bl.trim() : null;
    const bk = c.bk?.trim() ? c.bk.trim() : null;
    const key = `${bl ?? '—'}\t${bk ?? '—'}`;

    let acc = map.get(key);
    if (!acc) {
      acc = {
        bl,
        bk,
        containerCount: 0,
        statusCounts: {},
        etas: [],
        productName: null,
        exportCountryName: null,
        exporterName: null,
        representativeOrderId: null,
        inventoryCounts: {},
        totalBales: 0,
        totalWeightMt: 0,
        hasAnyWeight: false,
        totalReservedBales: 0,
        totalReservedWeightMt: 0,
        hasAnyReservedWeight: false,
        totalCompletedBales: 0,
        totalCompletedWeightMt: 0,
        hasAnyCompletedWeight: false,
        totalAvailableBales: 0,
        totalAvailableWeightMt: 0,
        hasAnyAvailableWeight: false,
        totalSheetReservationBales: 0,
        totalSheetReservationWeightMt: 0,
        hasAnySheetReservationWeight: false,
        availableContainerEquiv: 0,
        reservedContainerEquiv: 0,
        soldContainerEquiv: 0,
      };
      map.set(key, acc);
    }
    acc.containerCount += 1;
    const ce = weeklyInventoryStyleContainerEquivFromContainer(c);
    acc.availableContainerEquiv += ce.availableCnt;
    acc.reservedContainerEquiv += ce.reservedCnt;
    acc.soldContainerEquiv += ce.soldCnt;
    const st = c.inboundStatus;
    if (st === 'INBOUND_PENDING' || st === 'INBOUND_SCHEDULED' || st === 'INBOUND_CONFIRMED') {
      acc.statusCounts[st] = (acc.statusCounts[st] ?? 0) + 1;
    }
    if (c.etaDate) {
      const d = new Date(c.etaDate);
      if (!Number.isNaN(d.getTime())) acc.etas.push(d);
    }
    if (!acc.productName && c.productName?.trim()) acc.productName = c.productName.trim();
    if (!acc.exportCountryName && c.exportCountryName?.trim()) acc.exportCountryName = c.exportCountryName.trim();
    if (!acc.exporterName && c.exporterName?.trim()) acc.exporterName = c.exporterName.trim();
    if (!acc.representativeOrderId && c.orderId?.trim()) acc.representativeOrderId = c.orderId.trim();
    const inv = c.inventoryStatus?.trim();
    if (inv) acc.inventoryCounts[inv] = (acc.inventoryCounts[inv] ?? 0) + 1;
    if (c.bales != null) acc.totalBales += c.bales;
    if (c.weightMt != null) {
      acc.totalWeightMt += c.weightMt;
      acc.hasAnyWeight = true;
    }
    acc.totalReservedBales += c.reservedBales;
    acc.totalReservedWeightMt += c.reservedWeightMt;
    if (c.reservedWeightMt > 0) acc.hasAnyReservedWeight = true;
    acc.totalCompletedBales += c.completedBales;
    acc.totalCompletedWeightMt += c.completedWeightMt;
    if (c.completedWeightMt > 0) acc.hasAnyCompletedWeight = true;
    acc.totalAvailableBales += c.availableBales;
    acc.totalAvailableWeightMt += c.availableWeightMt;
    if (c.availableWeightMt > 0) acc.hasAnyAvailableWeight = true;
    acc.totalSheetReservationBales += c.sheetReservationBales;
    acc.totalSheetReservationWeightMt += c.sheetReservationWeightMt;
    if (c.sheetReservationWeightMt > 0) acc.hasAnySheetReservationWeight = true;
  }

  const rows: ReservationBlBkGroupRow[] = [];
  for (const [rowKey, acc] of map) {
    acc.etas.sort((a, b) => a.getTime() - b.getTime());
    const firstEta = acc.etas[0];
    const n = acc.containerCount;
    let av = acc.availableContainerEquiv;
    let rv = acc.reservedContainerEquiv;
    const sumAvailReserved = av + rv;
    if (n > 0 && sumAvailReserved > n + 0.001) {
      const factor = n / sumAvailReserved;
      av *= factor;
      rv *= factor;
    }
    const containerEquivOutflow = acc.reservedContainerEquiv + acc.soldContainerEquiv;
    rows.push({
      rowKey,
      bl: acc.bl,
      bk: acc.bk,
      containerCount: acc.containerCount,
      productName: acc.productName,
      exportCountryName: acc.exportCountryName,
      exporterName: acc.exporterName,
      etaDate: firstEta ? firstEta.toISOString().slice(0, 10) : null,
      statusCounts: acc.statusCounts,
      inventoryCounts: acc.inventoryCounts,
      totalBales: acc.totalBales,
      totalWeightMt: acc.hasAnyWeight ? acc.totalWeightMt : null,
      totalReservedBales: acc.totalReservedBales,
      totalReservedWeightMt: acc.hasAnyReservedWeight ? acc.totalReservedWeightMt : null,
      totalCompletedBales: acc.totalCompletedBales,
      totalCompletedWeightMt: acc.hasAnyCompletedWeight ? acc.totalCompletedWeightMt : null,
      totalAvailableBales: acc.totalAvailableBales,
      totalAvailableWeightMt: acc.hasAnyAvailableWeight ? acc.totalAvailableWeightMt : null,
      totalSheetReservationBales: acc.totalSheetReservationBales,
      totalSheetReservationWeightMt: acc.hasAnySheetReservationWeight ? acc.totalSheetReservationWeightMt : null,
      availableContainerEquivDisplay: av,
      containerEquivOutflow,
      representativeOrderId: acc.representativeOrderId,
    });
  }
  return rows;
}

function inboundBreakdownCell(counts: StatusCounts) {
  const order: InboundStatusKey[] = ['INBOUND_PENDING', 'INBOUND_SCHEDULED', 'INBOUND_CONFIRMED'];
  const short: Record<InboundStatusKey, string> = {
    INBOUND_PENDING: '대기',
    INBOUND_SCHEDULED: '예정',
    INBOUND_CONFIRMED: '확정',
  };
  const entries = order.filter((k) => (counts[k] ?? 0) > 0).map((k) => ({ k, n: counts[k]! }));
  if (entries.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }
  if (entries.length === 1) {
    return <InboundStatusBadge status={entries[0]!.k} />;
  }
  return (
    <span className="text-xs leading-snug text-muted-foreground">
      {entries.map((e) => `${short[e.k]} ${e.n}`).join(' · ')}
    </span>
  );
}

const INVENTORY_STATUS_ORDER = [
  'AVAILABLE',
  'RESERVED',
  'PARTIALLY_RESERVED',
  'PARTIALLY_SOLD',
  'PARTIALLY_SOLD_COMPLETED',
  'SELLING',
  'SOLD_OUT',
] as const;

function singleInventoryStatusBadge(status: string) {
  const statusStyles: Record<
    string,
    { variant: 'outline'; className: string; label: string }
  > = {
    AVAILABLE: {
      variant: 'outline',
      className:
        'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
      label: '가용',
    },
    RESERVED: {
      variant: 'outline',
      className:
        'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
      label: '예약됨',
    },
    PARTIALLY_RESERVED: {
      variant: 'outline',
      className:
        'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
      label: '부분 예약',
    },
    PARTIALLY_SOLD: {
      variant: 'outline',
      className:
        'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
      label: '부분 판매중',
    },
    PARTIALLY_SOLD_COMPLETED: {
      variant: 'outline',
      className:
        'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
      label: '부분 판매완료',
    },
    SELLING: {
      variant: 'outline',
      className:
        'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
      label: '판매중',
    },
    SOLD_OUT: {
      variant: 'outline',
      className:
        'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      label: '판매 완료',
    },
  };
  const style = statusStyles[status];
  if (!style) {
    return <span className="text-sm text-muted-foreground">{status}</span>;
  }
  return (
    <Badge variant={style.variant} className={style.className}>
      {style.label}
    </Badge>
  );
}

const INVENTORY_SHORT: Record<string, string> = {
  AVAILABLE: '가용',
  RESERVED: '예약',
  PARTIALLY_RESERVED: '부분예약',
  PARTIALLY_SOLD: '부분판매중',
  PARTIALLY_SOLD_COMPLETED: '부분판매완료',
  SELLING: '판매중',
  SOLD_OUT: '판매완료',
};

function inventoryBreakdownCell(counts: Record<string, number>) {
  const entries = INVENTORY_STATUS_ORDER.filter((k) => (counts[k] ?? 0) > 0).map((k) => ({
    k,
    n: counts[k]!,
  }));
  if (entries.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }
  if (entries.length === 1) {
    return singleInventoryStatusBadge(entries[0]!.k);
  }
  return (
    <span className="text-xs leading-snug text-muted-foreground">
      {entries.map((e) => `${INVENTORY_SHORT[e.k] ?? e.k} ${e.n}`).join(' · ')}
    </span>
  );
}

/** 입고확정 목록과 동일: 출고가 있으면 잔여/전체, 없으면 전체만 */
function formatStockQuantity(
  available: number | null,
  total: number | null,
  sold: number | null,
  maxDecimals: number,
) {
  if (available == null || total == null) {
    return { text: '-', hasSales: false as const };
  }
  const hasSales = (sold ?? 0) > 0;
  const fmt = (v: number) =>
    v.toLocaleString('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  if (hasSales) {
    const availableFormatted = fmt(available);
    const totalFormatted = fmt(total);
    return {
      text: `${availableFormatted}/${totalFormatted}`,
      hasSales: true as const,
      available: availableFormatted,
      total: totalFormatted,
    };
  }
  const totalFormatted = fmt(total);
  return { text: totalFormatted, hasSales: false as const, total: totalFormatted };
}

function remainingBalesInventoryStyleCell(r: ReservationBlBkGroupRow) {
  const outflowBales =
    r.totalReservedBales + r.totalCompletedBales + r.totalSheetReservationBales;
  const result = formatStockQuantity(
    r.totalAvailableBales,
    r.totalBales,
    outflowBales,
    4,
  );
  const isNegative = r.totalAvailableBales < 0;
  const displayText = result.hasSales ? `${result.available} / ${result.total}` : result.text;
  if (result.hasSales) {
    return (
      <div className="flex items-center gap-1 truncate justify-end" title={displayText}>
        <span
          className={
            isNegative
              ? 'font-semibold text-red-600 dark:text-red-400'
              : 'font-semibold text-blue-600 dark:text-blue-400'
          }
        >
          {result.available}
        </span>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{result.total}</span>
      </div>
    );
  }
  return (
    <div className="truncate text-right" title={displayText}>
      <span className={isNegative ? 'font-medium text-red-600 dark:text-red-400' : undefined}>
        {result.text}
      </span>
    </div>
  );
}

const fmtBalesCell = (v: number) =>
  v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

/** 판매 항목 점유 vs 이 화면(판매예약) 요청 — 한 열에서 구분 */
function balesExclusionBreakdownCell(r: ReservationBlBkGroupRow) {
  const salesOccupied = r.totalReservedBales + r.totalCompletedBales;
  const sheetReservation = r.totalSheetReservationBales ?? 0;
  return (
    <div className="space-y-0.5 text-right text-xs leading-tight">
      <div
        className="tabular-nums text-blue-700 dark:text-blue-300"
        title="판매(영업) 항목으로 점유된 베일 — 예약·진행·하차완료 등(판매예약과 별도)"
      >
        판매 {fmtBalesCell(salesOccupied)}
      </div>
      <div
        className="tabular-nums text-amber-800 dark:text-amber-300"
        title="이 페이지(판매예약)에서 ACTIVE로 잡힌 요청 베일 합계"
      >
        예약 {fmtBalesCell(sheetReservation)}
      </div>
    </div>
  );
}

function remainingWeightInventoryStyleCell(r: ReservationBlBkGroupRow) {
  const toKg = (v: number | null | undefined) => (v != null ? v * 1000 : null);
  const availableKg = toKg(r.totalAvailableWeightMt);
  const totalKg = toKg(r.totalWeightMt);
  const soldKg = toKg(
    (r.totalReservedWeightMt ?? 0) +
      (r.totalCompletedWeightMt ?? 0) +
      (r.totalSheetReservationWeightMt ?? 0),
  );
  const result = formatStockQuantity(availableKg, totalKg, soldKg, 3);
  const isNegative = availableKg != null && availableKg < 0;
  const kgSingle = (v: string) => (v === '-' ? v : `${v} kg`);
  const displayText = result.hasSales
    ? `${result.available} / ${result.total} kg`
    : kgSingle(result.text);
  if (result.hasSales) {
    return (
      <div className="flex items-center gap-1 justify-end" title={displayText}>
        <span
          className={
            isNegative
              ? 'font-semibold text-red-600 dark:text-red-400'
              : 'font-semibold text-blue-600 dark:text-blue-400'
          }
        >
          {result.available}
        </span>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">
          {result.total === '-' ? '-' : `${result.total} kg`}
        </span>
      </div>
    );
  }
  return (
    <div className="text-right" title={displayText}>
      <span className={isNegative ? 'font-medium text-red-600 dark:text-red-400' : undefined}>
        {kgSingle(result.text)}
      </span>
    </div>
  );
}

/** 주간 재고 현황의 가용 컨 상당과 동일(정규화 후) / 실제 컨 수(전체) */
function containerCountInventoryStyleCell(r: ReservationBlBkGroupRow) {
  const total = r.containerCount;
  if (total <= 0) {
    return <div className="text-right text-sm text-muted-foreground">-</div>;
  }
  const available = r.availableContainerEquivDisplay;
  const balesOutflow =
    r.totalReservedBales + r.totalCompletedBales + r.totalSheetReservationBales;
  const weightOutflowMt =
    (r.totalReservedWeightMt ?? 0) +
    (r.totalCompletedWeightMt ?? 0) +
    (r.totalSheetReservationWeightMt ?? 0);
  const hasRatio =
    r.containerEquivOutflow > 0.0001 ||
    balesOutflow > 0.0001 ||
    weightOutflowMt > 0.0000001;
  const fmt = (v: number) =>
    v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const isNegative = available < 0;
  if (hasRatio) {
    const displayText = `${fmt(available)} / ${fmt(total)}`;
    return (
      <div className="flex items-center gap-1 truncate justify-end tabular-nums" title={displayText}>
        <span
          className={
            isNegative
              ? 'font-semibold text-red-600 dark:text-red-400'
              : 'font-semibold text-blue-600 dark:text-blue-400'
          }
        >
          {fmt(available)}
        </span>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-semibold text-muted-foreground">{fmt(total)}</span>
      </div>
    );
  }
  const text = fmt(total);
  return (
    <div className="truncate text-right font-semibold tabular-nums" title={text}>
      {text}
    </div>
  );
}

/** BL 조회 카드: 잔여 / 전체 (`/` 구분, 색상은 입고 목록 셀과 동일) */
function BlMatchRemainingSlashTotal(props: {
  remaining: string;
  total: string;
  remainingNegative: boolean;
  title: string;
}) {
  const { remaining, total, remainingNegative, title } = props;
  const remCls = remainingNegative
    ? 'font-semibold text-red-600 dark:text-red-400'
    : 'font-semibold text-blue-600 dark:text-blue-400';
  return (
    <div
      className="flex flex-wrap items-center justify-start gap-1 text-xs tabular-nums leading-snug"
      title={title}
    >
      <span className={remCls}>{remaining}</span>
      <span className="text-muted-foreground">/</span>
      <span className="text-sm text-muted-foreground">{total}</span>
    </div>
  );
}

function blMatchContainerCountDisplay(m: BlLookupMatch) {
  const total = m.containerCount ?? 0;
  if (total <= 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }
  const available = m.availableContainerEquivDisplay ?? 0;
  const fmt = (v: number) =>
    v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const remStr = fmt(available);
  const totStr = fmt(total);
  const isNegative = available < 0;
  const title = `${remStr} / ${totStr}`;
  return (
    <BlMatchRemainingSlashTotal
      remaining={remStr}
      total={totStr}
      remainingNegative={isNegative}
      title={title}
    />
  );
}

function blMatchBalesDisplay(m: BlLookupMatch) {
  const avail = m.totalAvailableBales ?? 0;
  const tot = m.totalBales ?? 0;
  const fmt = (v: number) =>
    v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  const remStr = fmt(avail);
  const totStr = fmt(tot);
  const isNegative = avail < 0;
  const title = `${remStr} / ${totStr}`;
  return (
    <BlMatchRemainingSlashTotal
      remaining={remStr}
      total={totStr}
      remainingNegative={isNegative}
      title={title}
    />
  );
}

function blMatchWeightDisplay(m: BlLookupMatch) {
  const toKg = (v: number | null | undefined) => (v != null ? v * 1000 : null);
  const availableKg = toKg(m.totalAvailableWeightMt);
  const totalKg = toKg(m.totalWeightMt);
  const fmtNum = (v: number | null) => {
    if (v == null || Number.isNaN(v)) return '-';
    return v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  };
  const remStr = fmtNum(availableKg);
  const totNumStr = fmtNum(totalKg);
  const totStr = totNumStr === '-' ? '-' : `${totNumStr} kg`;
  const isNegative = availableKg != null && availableKg < 0;
  const title = totNumStr === '-' ? `${remStr} / -` : `${remStr} / ${totNumStr} kg`;
  return (
    <BlMatchRemainingSlashTotal
      remaining={remStr}
      total={totStr}
      remainingNegative={isNegative}
      title={title}
    />
  );
}

/** 상품 정보 카드: 한 줄에 최대 4개 필드(라벨 위 · 값 아래), 모두 왼쪽 정렬. */
function ProductInfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5 text-left">
      <div className="text-left text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 text-left text-sm break-words leading-snug text-foreground">{children}</div>
    </div>
  );
}

function compareBlBkGroupRows(
  a: ReservationBlBkGroupRow,
  b: ReservationBlBkGroupRow,
  sortBy: string,
  desc: boolean,
): number {
  const dir = desc ? -1 : 1;
  const num = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? -1 : x);
  const str = (x: string | null | undefined) => (x ?? '').toLowerCase();
  switch (sortBy) {
    case 'etaDate': {
      const ta = a.etaDate ? new Date(a.etaDate).getTime() : 0;
      const tb = b.etaDate ? new Date(b.etaDate).getTime() : 0;
      return (ta - tb) * dir;
    }
    case 'productName':
      return str(a.productName).localeCompare(str(b.productName), 'ko') * dir;
    case 'bl':
      return str(a.bl).localeCompare(str(b.bl), 'ko') * dir;
    case 'bk':
      return str(a.bk).localeCompare(str(b.bk), 'ko') * dir;
    case 'exportCountryName':
      return str(a.exportCountryName).localeCompare(str(b.exportCountryName), 'ko') * dir;
    case 'exporterName':
      return str(a.exporterName).localeCompare(str(b.exporterName), 'ko') * dir;
    case 'containerCount':
      return (a.containerCount - b.containerCount) * dir;
    case 'totalBales':
      return (a.totalBales - b.totalBales) * dir;
    case 'totalWeightMt':
      return (num(a.totalWeightMt) - num(b.totalWeightMt)) * dir;
    case 'totalReservedBales':
      return (a.totalReservedBales - b.totalReservedBales) * dir;
    case 'totalReservedWeightMt':
      return (num(a.totalReservedWeightMt) - num(b.totalReservedWeightMt)) * dir;
    case 'totalCompletedBales':
      return (a.totalCompletedBales - b.totalCompletedBales) * dir;
    case 'totalCompletedWeightMt':
      return (num(a.totalCompletedWeightMt) - num(b.totalCompletedWeightMt)) * dir;
    case 'totalAvailableBales':
      return (a.totalAvailableBales - b.totalAvailableBales) * dir;
    case 'totalAvailableWeightMt':
      return (num(a.totalAvailableWeightMt) - num(b.totalAvailableWeightMt)) * dir;
    case 'balesExclusionBreakdown': {
      const aSum =
        a.totalReservedBales + a.totalCompletedBales + a.totalSheetReservationBales;
      const bSum =
        b.totalReservedBales + b.totalCompletedBales + b.totalSheetReservationBales;
      return (aSum - bSum) * dir;
    }
    default:
      return 0;
  }
}

function formToDto(f: FormState): CreateSalesReservationDto {
  const wh = f.loadingWarehouseId.trim();
  return {
    customerId: f.customerId.trim() || null,
    bl: f.bl.trim() || null,
    tradeOrderId: f.tradeOrderId.trim() || null,
    containerId: null,
    contactPhone: f.contactPhone.trim() || null,
    requestedQty: f.requestedQty.trim() || null,
    qtyUnit: normalizedSalesReservationQtyUnitForSave(f),
    vehicleType: f.vehicleType.trim() || null,
    loadingWarehouseId: wh ? parseInt(wh, 10) : null,
    loadingWarehouseText: f.loadingWarehouseText.trim() || null,
    customsDate: f.customsDate.trim() || null,
    loadingDate: null,
    loadingScheduleNote: f.loadingScheduleNote.trim() || null,
    remarks: f.remarks.trim() || null,
    unitPriceStage: f.unitPriceStage.trim() || null,
    unitPrice: f.unitPrice.trim() || null,
    reference: f.reference.trim() || null,
    sortOrder: parseInt(f.sortOrder, 10) || 0,
    status: f.status.trim() || 'ACTIVE',
  };
}

function detailToForm(d: SalesReservation): FormState {
  return {
    customerId: d.customerId ?? '',
    customerPhone: d.customerPhone ?? '',
    customerCompanyName: d.customerName ?? '',
    customerCeo: d.customerCeo ?? '',
    bl: d.bl ?? '',
    tradeOrderId: d.tradeOrderId ?? '',
    contactPhone: formatPhoneInput(d.contactPhone ?? ''),
    requestedQty: formatDecimalTrimTrailingZeros(d.requestedQty) || '',
    vehicleType: d.vehicleType ?? '',
    loadingWarehouseId: d.loadingWarehouseId != null ? String(d.loadingWarehouseId) : '',
    loadingWarehouseText: d.loadingWarehouseText ?? '',
    customsDate: d.customsDate ?? '',
    loadingScheduleNote: d.loadingScheduleNote ?? '',
    remarks: d.remarks ?? '',
    unitPriceStage: d.unitPriceStage ?? '',
    unitPrice: formatDecimalTrimTrailingZeros(d.unitPrice) || '',
    reference: d.reference ?? '',
    sortOrder: String(d.sortOrder ?? 0),
    status: d.status ?? 'ACTIVE',
    qtyUnit: qtyUnitDetailToForm(d),
  };
}

export function SalesReservationDrawer({
  open,
  onOpenChange,
  reservationId,
  onSuccess,
}: SalesReservationDrawerProps) {
  const isMobile = useIsMobile();
  const isEdit = !!reservationId;
  const { data: detail, isLoading: detailLoading } = useSalesReservation(reservationId ?? undefined);
  const createMut = useCreateSalesReservation();
  const updateMut = useUpdateSalesReservation();
  const deleteMut = useDeleteSalesReservation();
  const { mutateAsync: blLookupMutate, isPending: blLookupPending } = useBlLookupSalesReservation();

  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [lookupHint, setLookupHint] = React.useState<string | null>(null);
  const [blLookupMatches, setBlLookupMatches] = React.useState<BlLookupMatch[]>([]);

  const [companySearchOpen, setCompanySearchOpen] = React.useState(false);
  const [companySearchTerm, setCompanySearchTerm] = React.useState('');
  const [companySearchResults, setCompanySearchResults] = React.useState<CompanySearchResult[]>([]);
  const [companySearchLoading, setCompanySearchLoading] = React.useState(false);
  const [companySearchError, setCompanySearchError] = React.useState<string | null>(null);
  const [companySearchAttempted, setCompanySearchAttempted] = React.useState(false);

  const [phoneSearchOpen, setPhoneSearchOpen] = React.useState(false);
  const [phoneSearchTerm, setPhoneSearchTerm] = React.useState('');
  const [phoneSearchResults, setPhoneSearchResults] = React.useState<CompanySearchResult[]>([]);
  const [phoneSearchLoading, setPhoneSearchLoading] = React.useState(false);
  const [phoneSearchError, setPhoneSearchError] = React.useState<string | null>(null);
  const [phoneSearchAttempted, setPhoneSearchAttempted] = React.useState(false);

  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  /** 판매 등록 요청 차량 Select와 동일: CONSULTATION_REQUEST_WEIGHT (차량 분류 라벨) */
  const { data: requestVehicleCodes = [] } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  /** 판매 등록(판매 단가 옆 구분)과 동일 */
  const { data: salesPriceStageCodes = [] } = useCodeMastersByGroup('SALES_PRICE_STAGE');

  const vehicleTypeRaw = form.vehicleType.trim();
  const requestVehicleCodeMatch = (requestVehicleCodes ?? []).some(
    (c) => (c.value || c.name || '').trim() === vehicleTypeRaw,
  );
  const requestVehicleSelectValue = !vehicleTypeRaw
    ? '__none__'
    : requestVehicleCodeMatch
      ? vehicleTypeRaw
      : `__legacy__:${vehicleTypeRaw}`;

  const unitPriceStageRaw = form.unitPriceStage.trim();
  const unitPriceStageCodeMatch = salesPriceStageCodes.find(
    (c) => (c.value || c.name || '').trim() === unitPriceStageRaw,
  );
  const unitPriceStageSelectValue = !unitPriceStageRaw
    ? '__none__'
    : unitPriceStageCodeMatch
      ? (unitPriceStageCodeMatch.value || unitPriceStageCodeMatch.name || '').trim()
      : `__legacy__:${unitPriceStageRaw}`;

  const [productSelectOpen, setProductSelectOpen] = React.useState(false);
  const [inboundFilter, setInboundFilter] = React.useState<InboundFilter>('__all__');
  const [inventoryFilter, setInventoryFilter] = React.useState<InventoryFilter>('__all__');
  const [productFilter, setProductFilter] = React.useState<string>('');
  const [bkBlSearch, setBkBlSearch] = React.useState('');
  const [stockRows, setStockRows] = React.useState<ReservationBlBkGroupRow[]>([]);
  const [stockLoading, setStockLoading] = React.useState(false);
  const [containerPage, setContainerPage] = React.useState(1);
  const [containerPageSize, setContainerPageSize] = React.useState(100);
  const [containerSortBy, setContainerSortBy] = React.useState('etaDate');
  const [containerSortOrder, setContainerSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [productRowSelection, setProductRowSelection] = React.useState<RowSelectionState>({});
  /** 수정 중 상품 연결을 비운 뒤에는 API detail이 있어도 빈 안내를 보여줌 */
  const [productLinkCleared, setProductLinkCleared] = React.useState(false);

  const resetCompanySearchState = React.useCallback(() => {
    setCompanySearchResults([]);
    setCompanySearchError(null);
    setCompanySearchTerm('');
    setCompanySearchLoading(false);
    setCompanySearchAttempted(false);
  }, []);

  const resetPhoneSearchState = React.useCallback(() => {
    setPhoneSearchResults([]);
    setPhoneSearchError(null);
    setPhoneSearchTerm('');
    setPhoneSearchLoading(false);
    setPhoneSearchAttempted(false);
  }, []);

  const handleCompanySearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setCompanySearchOpen(nextOpen);
      if (!nextOpen) {
        resetCompanySearchState();
      }
    },
    [resetCompanySearchState],
  );

  const handlePhoneSearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setPhoneSearchOpen(nextOpen);
      if (!nextOpen) {
        resetPhoneSearchState();
      }
    },
    [resetPhoneSearchState],
  );


  React.useEffect(() => {
    if (!open) return;
    if (!reservationId) {
      setForm(emptyForm());
      setLookupHint(null);
      setBlLookupMatches([]);
      setProductLinkCleared(false);
      return;
    }
    if (detail) {
      setForm(detailToForm(detail));
      setLookupHint(null);
      setBlLookupMatches([]);
      setProductLinkCleared(false);
    }
  }, [open, reservationId, detail]);

  /** 수정 진입 시에도 추가 시와 동일한 상품 정보(BK·ETA·입고창고·컨수·베일·중량 등)를 쓰기 위해 BL 조회 결과를 채움 */
  React.useEffect(() => {
    if (!open || !reservationId || !detail) return;
    if (productLinkCleared) return;
    const bl = detail.bl?.trim();
    if (!bl) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await blLookupMutate(
          reservationId ? { bl, excludeReservationId: reservationId } : bl,
        );
        if (cancelled) return;
        setBlLookupMatches(res.matches);
        if (res.matches.length > 1) {
          setLookupHint(
            `동일 BL로 발주가 ${res.matches.length}건 있습니다. 왼쪽 목록에서 연결할 발주를 선택하세요.`,
          );
        } else {
          setLookupHint(null);
        }
      } catch {
        if (!cancelled) setBlLookupMatches([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reservationId, detail, productLinkCleared, blLookupMutate]);

  const detailProductDisplayName = React.useMemo(() => {
    if (!detail || !reservationId) return null;
    return resolveProductDisplayNameFromCodes(
      productCodes,
      detail.orderProductNameLabel,
      detail.contractProductName,
      detail.containerProductCode,
    );
  }, [detail, reservationId, productCodes]);

  const selectedBlMatch = React.useMemo(() => {
    if (!blLookupMatches.length) return null;
    return (
      blLookupMatches.find((m) => m.tradeOrderId === form.tradeOrderId) ?? blLookupMatches[0] ?? null
    );
  }, [blLookupMatches, form.tradeOrderId]);

  const selectedMatchProductDisplayName = React.useMemo(() => {
    if (!selectedBlMatch) return null;
    return resolveProductDisplayNameFromCodes(
      productCodes,
      selectedBlMatch.productNameLabel,
      selectedBlMatch.contractProductName,
    );
  }, [selectedBlMatch, productCodes]);

  const handleCompanySearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const keyword = companySearchTerm.trim();
      if (keyword.length < 2) {
        setCompanySearchError('두 글자 이상 입력해주세요.');
        setCompanySearchResults([]);
        setCompanySearchAttempted(false);
        return;
      }
      setCompanySearchAttempted(true);
      setCompanySearchLoading(true);
      setCompanySearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/company', {
          params: { keyword },
        });
        setCompanySearchResults(response.data);
        if (response.data.length === 0) {
          setCompanySearchError('일치하는 업체가 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') message = apiData.message;
        else if (Array.isArray(apiData?.message)) message = (apiData.message as unknown[]).join(', ');
        else if (typeof apiData?.error === 'string') message = apiData.error;
        else if (typeof err?.message === 'string') message = err.message;
        setCompanySearchError(message);
        setCompanySearchResults([]);
      } finally {
        setCompanySearchLoading(false);
      }
    },
    [companySearchTerm],
  );

  const handleSelectCompany = React.useCallback(
    (item: CompanySearchResult) => {
      handleCompanySearchOpenChange(false);
      setForm((f) => ({
        ...f,
        customerId: item.id || '',
        customerCompanyName: item.companyName ?? '',
        customerCeo: item.ceo ?? '',
        customerPhone: item.phone ? formatPhoneInput(item.phone) : f.customerPhone,
      }));
      if (!item.phone) {
        toast({
          title: '전화번호 정보 없음',
          description: '선택한 업체에는 전화번호가 없어 기본 정보만 채웠습니다.',
        });
      }
    },
    [handleCompanySearchOpenChange, toast],
  );

  const handlePhoneSearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const phone = phoneSearchTerm.trim();
      if (!phone) {
        setPhoneSearchError('전화번호를 입력해주세요.');
        setPhoneSearchResults([]);
        setPhoneSearchAttempted(false);
        return;
      }
      setPhoneSearchAttempted(true);
      setPhoneSearchLoading(true);
      setPhoneSearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/phone', {
          params: { phone },
        });
        setPhoneSearchResults(response.data);
        if (response.data.length === 0) {
          setPhoneSearchError('일치하는 고객이 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') message = apiData.message;
        else if (Array.isArray(apiData?.message)) message = (apiData.message as unknown[]).join(', ');
        else if (typeof apiData?.error === 'string') message = apiData.error;
        else if (typeof err?.message === 'string') message = err.message;
        setPhoneSearchError(message);
        setPhoneSearchResults([]);
      } finally {
        setPhoneSearchLoading(false);
      }
    },
    [phoneSearchTerm],
  );

  const handleSelectPhone = React.useCallback(
    (item: CompanySearchResult) => {
      handlePhoneSearchOpenChange(false);
      setForm((f) => ({
        ...f,
        customerId: item.id || '',
        customerCompanyName: item.companyName ?? '',
        customerCeo: item.ceo ?? '',
        customerPhone: item.phone ? formatPhoneInput(item.phone) : f.customerPhone,
      }));
    },
    [handlePhoneSearchOpenChange],
  );

  const applyBlMatch = React.useCallback(
    (m: BlLookupMatch) => {
      setForm((f) => {
        const whStr = m.inboundWarehouse?.trim();
        let loadingWarehouseId = '';
        let loadingWarehouseText = '';
        if (whStr) {
          const hit = warehouses.find((w) => w.name === whStr || String(w.id) === whStr);
          if (hit) {
            loadingWarehouseId = String(hit.id);
          } else {
            loadingWarehouseText = whStr;
          }
        }
        const cd = m.customsDate?.trim() ?? '';
        return {
          ...f,
          tradeOrderId: m.tradeOrderId,
          customsDate: cd,
          loadingWarehouseId,
          loadingWarehouseText,
        };
      });
      setProductLinkCleared(false);
    },
    [warehouses],
  );

  const clearLinkedProduct = React.useCallback(() => {
    setForm((f) => ({
      ...f,
      bl: '',
      tradeOrderId: '',
      customsDate: '',
      loadingWarehouseId: '',
      loadingWarehouseText: '',
    }));
    setBlLookupMatches([]);
    setLookupHint(null);
    setProductLinkCleared(true);
  }, []);

  const handleSave = async () => {
    const dto = formToDto(form);
    try {
      if (isEdit && reservationId) {
        await updateMut.mutateAsync({ id: reservationId, data: dto });
      } else {
        await createMut.mutateAsync(dto);
      }
      onSuccess?.();
      onOpenChange(false);
    } catch {
      /* toast in hook */
    }
  };

  const handleDelete = async () => {
    if (!reservationId) return;
    try {
      await deleteMut.mutateAsync(reservationId);
      setDeleteOpen(false);
      onSuccess?.();
      onOpenChange(false);
    } catch {
      /* toast */
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  React.useEffect(() => {
    if (!open) {
      if (companySearchOpen) setCompanySearchOpen(false);
      if (phoneSearchOpen) setPhoneSearchOpen(false);
    }
  }, [open, companySearchOpen, phoneSearchOpen]);

  React.useEffect(() => {
    if (!open) {
      setProductSelectOpen(false);
      setBkBlSearch('');
      setInboundFilter('__all__');
      setInventoryFilter('__all__');
      setProductFilter('');
      setStockRows([]);
      setContainerPage(1);
      setProductRowSelection({});
    }
  }, [open]);

  React.useEffect(() => {
    if (!productSelectOpen) return;
    setContainerPage(1);
    setProductRowSelection({});
  }, [productSelectOpen, inboundFilter, inventoryFilter, productFilter, bkBlSearch]);

  React.useEffect(() => {
    if (!open || !productSelectOpen) return;
    let cancelled = false;
    async function load() {
      setStockLoading(true);
      try {
        const params: Record<string, string | boolean> = {
          excludeSoldOut: true,
          // 판매관리 재고 선택: 시트 예약 차감 제외 (입고 화면에서만 시트 반영)
          includeSheetReservations: false,
        };
        if (inboundFilter !== '__all__') {
          params.inboundStatus = inboundFilter === 'INBOUND_CONFIRMED' ? 'CONFIRMED' : inboundFilter;
        }
        if (bkBlSearch.trim()) {
          params.search = bkBlSearch.trim();
        }
        if (productFilter.trim()) {
          params.productName = productFilter.trim();
        }
        if (reservationId) {
          params.excludeSalesReservationId = reservationId;
        }
        const response = await api.get<unknown[]>('/trade/contracts/containers', { params });
        if (cancelled) return;
        const raw = Array.isArray(response.data) ? response.data : [];
        let mapped = raw.map((item) => mapApiContainerToRow(item as Record<string, unknown>));
        if (inventoryFilter !== '__all__') {
          mapped = mapped.filter((c) => c.inventoryStatus === inventoryFilter);
        }
        setStockRows(aggregateContainersByBlBk(mapped));
        if (!cancelled) setProductRowSelection({});
      } catch {
        if (!cancelled) {
          toast({
            title: '목록 조회 실패',
            description: '입고 재고 컨테이너 목록을 불러오지 못했습니다.',
            variant: 'destructive',
          });
          setStockRows([]);
          setProductRowSelection({});
        }
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, productSelectOpen, inboundFilter, inventoryFilter, productFilter, bkBlSearch, reservationId, toast]);

  const sortedStockRows = React.useMemo(() => {
    const rows = [...stockRows];
    const desc = containerSortOrder === 'desc';
    rows.sort((a, b) => compareBlBkGroupRows(a, b, containerSortBy, desc));
    return rows;
  }, [stockRows, containerSortBy, containerSortOrder]);

  const stockTotalPages = Math.max(1, Math.ceil(sortedStockRows.length / containerPageSize));
  const stockPageClamped = Math.min(containerPage, stockTotalPages);
  const stockPageSlice = React.useMemo(() => {
    const start = (stockPageClamped - 1) * containerPageSize;
    return sortedStockRows.slice(start, start + containerPageSize);
  }, [sortedStockRows, stockPageClamped, containerPageSize]);

  const stockTotalContainerCount = React.useMemo(
    () => sortedStockRows.reduce((s, r) => s + r.containerCount, 0),
    [sortedStockRows],
  );

  const selectedProductRowCount = Object.keys(productRowSelection).filter((k) => productRowSelection[k]).length;

  const handleContainerSortChange = React.useCallback((sortBy: string, sortOrder: 'asc' | 'desc') => {
    setContainerSortBy(sortBy);
    setContainerSortOrder(sortOrder);
    setContainerPage(1);
  }, []);

  const handleProductRowSelectionChange: OnChangeFn<RowSelectionState> = React.useCallback((updater) => {
    setProductRowSelection((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const selected = Object.entries(next).filter(([, v]) => v).map(([id]) => id);
      if (selected.length <= 1) return next;
      const newlyOn = selected.filter((id) => !prev[id]);
      const pick = newlyOn.length ? newlyOn[newlyOn.length - 1]! : selected[selected.length - 1]!;
      return { [pick]: true };
    });
  }, []);

  const applyProductTableSelection = React.useCallback(async () => {
    const selectedKey = Object.keys(productRowSelection).find((k) => productRowSelection[k]);
    if (!selectedKey) {
      toast({
        title: '선택된 행이 없습니다',
        description: '표에서 BL·BK 그룹 한 건을 선택한 뒤 다시 시도하세요.',
        variant: 'destructive',
      });
      return;
    }
    const row = sortedStockRows.find((r) => r.rowKey === selectedKey);
    if (!row) return;
    const bl = row.bl?.trim() ?? '';
    if (!bl) {
      toast({
        title: 'BL이 없습니다',
        description: '해당 그룹에는 BL이 없어 발주와 연결할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }
    const preferredTid = row.representativeOrderId?.trim() ?? '';
    setForm((f) => ({ ...f, bl, tradeOrderId: preferredTid }));
    setProductLinkCleared(false);
    setLookupHint(null);
    try {
      const res = await blLookupMutate(
        isEdit && reservationId ? { bl, excludeReservationId: reservationId } : bl,
      );
      if (!res.matches.length) {
        setLookupHint('일치하는 발주(BL)가 없습니다.');
        setBlLookupMatches([]);
        setForm((f) => ({ ...f, tradeOrderId: '' }));
        return;
      }
      setBlLookupMatches(res.matches);
      const preferred = preferredTid
        ? res.matches.find((m) => m.tradeOrderId === preferredTid)
        : undefined;
      const chosen = preferred ?? res.matches[0]!;
      applyBlMatch(chosen);
      if (res.matches.length > 1) {
        setLookupHint(
          `동일 BL로 발주가 ${res.matches.length}건 있습니다. 왼쪽 목록에서 연결할 발주를 선택하세요.`,
        );
      } else {
        setLookupHint(null);
      }
    } catch {
      setLookupHint('BL 조회에 실패했습니다.');
      setBlLookupMatches([]);
    } finally {
      setProductRowSelection({});
      setProductSelectOpen(false);
    }
  }, [
    applyBlMatch,
    blLookupMutate,
    isEdit,
    productRowSelection,
    reservationId,
    sortedStockRows,
    toast,
  ]);

  const productSelectColumns = React.useMemo<ColumnDef<ReservationBlBkGroupRow>[]>(
    () => [
      {
        id: 'select',
        header: () => <span className="sr-only">선택</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="한 건 선택"
            />
          </div>
        ),
        enableSorting: false,
        size: 52,
        minSize: 52,
        maxSize: 52,
      },
      {
        id: 'inbound',
        accessorFn: (r) => JSON.stringify(r.statusCounts),
        header: '입고 상태',
        enableSorting: false,
        cell: ({ row }) => inboundBreakdownCell(row.original.statusCounts),
        size: 80  ,
      },
      {
        id: 'inventory',
        header: '재고 상태',
        enableSorting: false,
        cell: ({ row }) => inventoryBreakdownCell(row.original.inventoryCounts),
        size: 100,
      },
      {
        id: 'exportCountryName',
        accessorKey: 'exportCountryName',
        header: '수출국',
        cell: ({ row }) => row.original.exportCountryName || '-',
        size: 60,
      },
      {
        id: 'exporterName',
        accessorKey: 'exporterName',
        header: '수출사',
        cell: ({ row }) => row.original.exporterName || '-',
        size: 60,
      },
      {
        id: 'productName',
        accessorKey: 'productName',
        header: '상품',
        cell: ({ row }) => row.original.productName || '-',
        size: 80,
      },
      {
        id: 'bk',
        accessorKey: 'bk',
        header: 'BK',
        cell: ({ row }) => row.original.bk || '-',
        size: 120,
      },
      {
        id: 'bl',
        accessorKey: 'bl',
        header: 'BL',
        cell: ({ row }) => (
          <span className="break-all font-mono text-xs">{row.original.bl || '-'}</span>
        ),
        size: 120,
      },
      {
        id: 'containerCount',
        accessorKey: 'containerCount',
        header: () => (
          <span
            className="whitespace-nowrap"
            title="전체 컨 수. 예약·판매 출고가 있으면 가용 컨 상당(주간 재고 현황과 동일) / 전체"
          >
            컨수
          </span>
        ),
        cell: ({ row }) => containerCountInventoryStyleCell(row.original),
        meta: { align: 'right' },
        size: 72,
      },
      {
        id: 'totalAvailableBales',
        accessorKey: 'totalAvailableBales',
        header: () => (
          <span
            className="whitespace-nowrap"
            title="남은 베일 / 전체 베일. 판매 항목 점유와 이 페이지 판매예약 요청을 모두 차감한 잔여입니다."
          >
            베일 잔여/전체
          </span>
        ),
        cell: ({ row }) => remainingBalesInventoryStyleCell(row.original),
        meta: { align: 'right' },
        size: 96,
      },
      {
        id: 'balesExclusionBreakdown',
        accessorFn: (r) =>
          r.totalReservedBales + r.totalCompletedBales + r.totalSheetReservationBales,
        header: () => (
          <span
            className="whitespace-nowrap"
            title="전체 베일에서 잔여를 줄이는 요인: 판매(영업) 항목 점유와, 이 목록(판매예약)의 ACTIVE 요청."
          >
            제외(베일)
          </span>
        ),
        cell: ({ row }) => balesExclusionBreakdownCell(row.original),
        meta: { align: 'right' },
        size: 108,
      },
      {
        id: 'totalAvailableWeightMt',
        accessorKey: 'totalAvailableWeightMt',
        header: () => (
          <span title="가용 중량 / 전체 중량 (kg, 입고확정 목록과 동일)">중량</span>
        ),
        cell: ({ row }) => remainingWeightInventoryStyleCell(row.original),
        meta: { align: 'right' },
        size: 170,
      },
      {
        id: 'etaDate',
        accessorKey: 'etaDate',
        header: 'ETA',
        cell: ({ row }) =>
          row.original.etaDate ? formatEta(row.original.etaDate) : '-',
        size: 100,
      },
    ],
    [],
  );

  React.useEffect(() => {
    setContainerPage((p) => Math.min(p, stockTotalPages));
  }, [stockTotalPages]);

  const showProductRemove =
    !!selectedBlMatch ||
    !!form.bl.trim() ||
    !!form.tradeOrderId.trim() ||
    (!!reservationId && !!detail && !productLinkCleared && !!(detail.bl || detail.tradeOrderId));

  const blLinkPanelInner = (
    <>
      {lookupHint ? <p className="text-xs text-muted-foreground leading-relaxed">{lookupHint}</p> : null}

      {blLookupMatches.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">발주 선택 ({blLookupMatches.length}건)</p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background p-1">
            {blLookupMatches.map((m) => {
              const active = form.tradeOrderId === m.tradeOrderId;
              const labelRaw = resolveProductDisplayNameFromCodes(
                productCodes,
                m.productNameLabel,
                m.contractProductName,
              );
              const label = labelRaw === '-' ? '제품명 없음' : labelRaw;
              return (
                <button
                  key={m.tradeOrderId}
                  type="button"
                  onClick={() => applyBlMatch(m)}
                  className={cn(
                    'w-full rounded-sm px-2 py-2 text-left text-sm transition-colors',
                    active ? 'bg-primary/10 font-medium' : 'hover:bg-muted/80',
                  )}
                >
                  <div className="truncate">{label}</div>
                  <div className="font-mono text-xs text-muted-foreground tabular-nums">
                    {m.tradeOrderId}
                    {m.contractNo ? ` · ${m.contractNo}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selectedBlMatch ? (
        <div className="text-sm">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
            <ProductInfoField label="입고 상태">
              <div className="flex flex-wrap items-center">
                <InboundStatusBadge status={selectedBlMatch.tradeOrderInboundStatus} />
              </div>
            </ProductInfoField>
            <ProductInfoField label="BL">
              <span className="break-all font-mono text-xs font-semibold">
                {selectedBlMatch.bl || form.bl || '-'}
              </span>
            </ProductInfoField>
            <ProductInfoField label="BK">
              <span className="break-all font-mono text-xs">{selectedBlMatch.bk || '-'}</span>
            </ProductInfoField>
            <ProductInfoField label="상품">
              <span className="font-medium">
                {selectedMatchProductDisplayName && selectedMatchProductDisplayName !== '-'
                  ? selectedMatchProductDisplayName
                  : '-'}
              </span>
            </ProductInfoField>
            <ProductInfoField label="ETA">
              <span className="tabular-nums">{formatEta(selectedBlMatch.etaDate)}</span>
            </ProductInfoField>
            <ProductInfoField label="창고">
              <span className="break-words">
                {(() => {
                  const w = selectedBlMatch.inboundWarehouse?.trim();
                  if (!w) return '-';
                  const hit = warehouses.find((x) => x.name === w || String(x.id) === w);
                  return hit?.name ?? w;
                })()}
              </span>
            </ProductInfoField>
            <ProductInfoField label="통관일">
              <span className="tabular-nums">{formatEta(selectedBlMatch.customsDate)}</span>
            </ProductInfoField>
            <div className="col-span-2 grid min-w-0 grid-cols-4 gap-x-3 gap-y-3 sm:col-span-4">
              <ProductInfoField label="컨수">{blMatchContainerCountDisplay(selectedBlMatch)}</ProductInfoField>
              <ProductInfoField label="베일(영업)">{blMatchBalesDisplay(selectedBlMatch)}</ProductInfoField>
              <ProductInfoField label="중량">{blMatchWeightDisplay(selectedBlMatch)}</ProductInfoField>
              <div className="min-w-0" aria-hidden />
            </div>
          </div>
        </div>
      ) : detail && reservationId && !productLinkCleared ? (
        <div className="text-sm">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
            <ProductInfoField label="입고 상태">
              <div className="flex flex-wrap items-center">
                <InboundStatusBadge status={detail.tradeOrderInboundStatus} />
              </div>
            </ProductInfoField>
            <ProductInfoField label="BL">
              <span className="break-all font-mono text-xs font-semibold">{detail.bl || '-'}</span>
            </ProductInfoField>
            <ProductInfoField label="상품">
              <span className="font-medium">
                {detailProductDisplayName && detailProductDisplayName !== '-'
                  ? detailProductDisplayName
                  : '-'}
              </span>
            </ProductInfoField>
            <ProductInfoField label="창고">
              <span className="break-words">
                {detail.loadingWarehouseName || detail.loadingWarehouseText?.trim() || '-'}
              </span>
            </ProductInfoField>
            <ProductInfoField label="통관일">
              <span className="tabular-nums">{formatEta(detail.customsDate)}</span>
            </ProductInfoField>
          </div>
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-muted-foreground">
          「상품 추가」에서 BL·BK 재고를 선택하면
          <br />
          이 영역에 BL·상품·ETA가 표시됩니다.
        </div>
      )}
    </>
  );

  const productSelectTableBlock = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground" htmlFor="sres-stock-bkbl">
            검색
          </Label>
          <Input
            id="sres-stock-bkbl"
            className="h-9 w-64"
            placeholder="BK, BL, 상품 등 검색되는 항목"
            value={bkBlSearch}
            onChange={(e) => setBkBlSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">입고 상태</Label>
          <Select value={inboundFilter} onValueChange={(v) => setInboundFilter(v as InboundFilter)}>
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체</SelectItem>
              <SelectItem value="INBOUND_PENDING">입고대기</SelectItem>
              <SelectItem value="INBOUND_SCHEDULED">입고예정</SelectItem>
              <SelectItem value="INBOUND_CONFIRMED">입고확정</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">재고 상태</Label>
          <Select value={inventoryFilter} onValueChange={(v) => setInventoryFilter(v as InventoryFilter)}>
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체</SelectItem>
              <SelectItem value="AVAILABLE">가용</SelectItem>
              <SelectItem value="RESERVED">예약됨</SelectItem>
              <SelectItem value="PARTIALLY_RESERVED">부분 예약</SelectItem>
              <SelectItem value="PARTIALLY_SOLD">부분 판매중</SelectItem>
              <SelectItem value="PARTIALLY_SOLD_COMPLETED">부분 판매완료</SelectItem>
              <SelectItem value="SELLING">판매중</SelectItem>
              <SelectItem value="SOLD_OUT">판매 완료</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
          <Select
            value={productFilter || '__all__'}
            onValueChange={(v) => setProductFilter(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="상품 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체</SelectItem>
              {productCodes
                .filter((p) => String(p.value ?? p.name ?? '').trim() !== '')
                .map((product) => (
                  <SelectItem key={product.id} value={product.value ?? product.name ?? ''}>
                    {product.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {stockLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            목록 불러오는 중…
          </div>
        ) : sortedStockRows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">조건에 맞는 BL·BK 그룹이 없습니다.</div>
        ) : (
          <DataTable<ReservationBlBkGroupRow, unknown>
            columns={productSelectColumns}
            data={stockPageSlice}
            manualPagination
            page={stockPageClamped}
            total={sortedStockRows.length}
            totalPages={stockTotalPages}
            onPageChange={setContainerPage}
            pageSize={containerPageSize}
            onPageSizeChange={(n) => {
              setContainerPageSize(n);
              setContainerPage(1);
            }}
            pageSizeCookieKey="sales-reservation-product-select-page-size"
            sortBy={containerSortBy}
            sortOrder={containerSortOrder}
            onSortChange={handleContainerSortChange}
            enableRowSelection
            rowSelection={productRowSelection}
            onRowSelectionChange={handleProductRowSelectionChange}
            getRowId={(row) => row.rowKey}
            onRowClick={(row) => {
              setProductRowSelection((prev) => {
                if (prev[row.rowKey]) return {};
                return { [row.rowKey]: true };
              });
            }}
            noRowClickColumnIds={['select']}
            showRowNumber
            bodyCellClassName="align-middle py-2.5"
          />
        )}
      </div>
      {!stockLoading && sortedStockRows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{selectedProductRowCount}</span>개 선택됨 (총{' '}
            {sortedStockRows.length.toLocaleString()}개)
            <span className="mx-2 text-border">·</span>
            컨테이너 합계 {stockTotalContainerCount.toLocaleString()}개
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setProductRowSelection({});
                setProductSelectOpen(false);
              }}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={blLookupPending}
              onClick={() => void applyProductTableSelection()}
            >
              {blLookupPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckSquare className="mr-2 h-4 w-4" />
              )}
              선택 완료{selectedProductRowCount ? ` (${selectedProductRowCount})` : ''}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && (companySearchOpen || phoneSearchOpen)) {
            return;
          }
          onOpenChange(isOpen);
        }}
        direction="right"
        dismissible={false}
      >
        <DrawerContent
          className="flex h-full flex-col p-0"
          style={{
            width: isMobile ? '100%' : productSelectOpen ? 'min(1900px, 95vw)' : '900px',
            maxWidth: '95vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          {isEdit && detailLoading ? (
            <>
              <DrawerTitle className="sr-only">판매예약 수정</DrawerTitle>
              <DrawerDescription className="sr-only">상세 정보를 불러오는 중입니다.</DrawerDescription>
              <div className="flex flex-1 items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1">
              {!isMobile && productSelectOpen ? (
                <aside className="flex w-[1000px] shrink-0 flex-col border-r bg-background">
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-primary">
                        <Package className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <h2 className="text-lg font-semibold leading-tight">상품 선택</h2>
                        <p className="text-sm leading-snug text-muted-foreground">
                          BL·BK별로 묶인 재고입니다. 베일 잔여는 판매 항목 점유와 이 페이지 판매예약 요청을 반영합니다.
                          한 건만 선택한 뒤 「선택 완료」를 누르면 BL·발주가 폼에 반영됩니다.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setProductSelectOpen(false)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">패널 닫기</span>
                    </Button>
                  </div>
                  {productSelectTableBlock}
                </aside>
              ) : null}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <DrawerHeader className="shrink-0 border-b">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 text-left">
                      <DrawerTitle>{isEdit ? '판매예약 수정' : '판매예약 추가'}</DrawerTitle>
                      <DrawerDescription>
                        고객 정보는 판매 등록과 동일하게 검색·선택합니다. 상품은「상품 추가」로 입고 재고 목록을
                        엽니다.
                      </DrawerDescription>
                    </div>
                    <DrawerClose asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => onOpenChange(false)}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">닫기</span>
                      </Button>
                    </DrawerClose>
                  </div>
                </DrawerHeader>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="space-y-6">
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">고객 정보</h3>
                    <p className="text-xs text-muted-foreground">전화번호 또는 업체명으로 검색해 고객을 선택합니다.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="sres-customer-phone">전화번호</Label>
                      <div className="flex gap-2">
                        <Input
                          id="sres-customer-phone"
                          placeholder="010-1234-5678"
                          value={form.customerPhone}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, customerPhone: formatPhoneInput(e.target.value) }))
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setPhoneSearchTerm(form.customerPhone);
                            setPhoneSearchOpen(true);
                          }}
                          title="전화번호로 검색"
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="sres-company">업체명 / 농장명</Label>
                      <div className="flex gap-2">
                        <Input
                          id="sres-company"
                          placeholder="업체명 또는 농장명"
                          value={form.customerCompanyName}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, customerCompanyName: e.target.value }))
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setCompanySearchTerm(form.customerCompanyName);
                            setCompanySearchOpen(true);
                          }}
                          title="업체명으로 검색"
                        >
                          <Building2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="sres-ceo">대표자</Label>
                      <Input
                        id="sres-ceo"
                        placeholder="대표자명"
                        value={form.customerCeo}
                        onChange={(e) => setForm((f) => ({ ...f, customerCeo: e.target.value }))}
                      />
                    </div>
                  </div>
                  {form.customerId ? (
                    <p className="text-xs text-muted-foreground">선택된 고객 ID: {form.customerId}</p>
                  ) : null}
                </section>

                <section className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">상품 정보</h3>
                      <p className="text-xs text-muted-foreground">
                        판매 수정의 선택 컨테이너처럼 한 카드 영역에 요약됩니다.「상품 추가」로 BL·BK 재고를
                        고릅니다.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        if (isMobile) {
                          setProductSelectOpen(true);
                        } else {
                          setProductSelectOpen((v) => !v);
                        }
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {productSelectOpen && !isMobile ? '목록 닫기' : '상품 추가'}
                    </Button>
                  </div>
                  <div className="relative rounded-lg border border-dashed bg-muted/20 p-4">
                    {showProductRemove ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 z-10 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={clearLinkedProduct}
                        title="상품 삭제"
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">상품 삭제</span>
                      </Button>
                    ) : null}
                    <div className={cn(showProductRemove && 'pr-9')}>{blLinkPanelInner}</div>
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="sres-contact-phone">담당 연락처</Label>
                    <Input
                      id="sres-contact-phone"
                      placeholder="010-1234-5678"
                      inputMode="tel"
                      autoComplete="tel"
                      value={form.contactPhone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, contactPhone: formatPhoneInput(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label>
                      요청수량
                      {isWeightSalesReservationQtyUnit(form.qtyUnit) ? ' (톤)' : ' (베일)'}
                    </Label>
                    <Input
                      value={form.requestedQty}
                      onChange={(e) => setForm((f) => ({ ...f, requestedQty: e.target.value }))}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="sres-vehicle-classification">차량 분류</Label>
                    <Select
                      value={requestVehicleSelectValue}
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          setForm((f) => ({ ...f, vehicleType: '' }));
                          return;
                        }
                        if (v.startsWith('__legacy__:')) {
                          setForm((f) => ({ ...f, vehicleType: v.slice('__legacy__:'.length) }));
                          return;
                        }
                        setForm((f) => ({ ...f, vehicleType: v }));
                      }}
                    >
                      <SelectTrigger id="sres-vehicle-classification" className="w-full">
                        <SelectValue placeholder="차량 분류 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안 함</SelectItem>
                        {vehicleTypeRaw && !requestVehicleCodeMatch ? (
                          <SelectItem value={`__legacy__:${vehicleTypeRaw}`}>{vehicleTypeRaw}</SelectItem>
                        ) : null}
                        {(requestVehicleCodes ?? []).map((code) => {
                          const v = (code.value || code.name || '').trim();
                          if (!v) return null;
                          return (
                            <SelectItem key={v} value={v}>
                              {code.name || code.value}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label>상차일정</Label>
                    <Input
                      value={form.loadingScheduleNote}
                      onChange={(e) => setForm((f) => ({ ...f, loadingScheduleNote: e.target.value }))}
                      placeholder="예: 4월 1~2주차"
                    />
                  </div>

                  <p className="col-span-full text-xs text-muted-foreground">
                    통관일·상차창고는 위 상품 정보(BL·발주 연결)에 표시됩니다.
                  </p>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="sres-unit-price-stage">구분</Label>
                    <Select
                      value={unitPriceStageSelectValue}
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          setForm((f) => ({ ...f, unitPriceStage: '' }));
                          return;
                        }
                        if (v.startsWith('__legacy__:')) {
                          setForm((f) => ({ ...f, unitPriceStage: v.slice('__legacy__:'.length) }));
                          return;
                        }
                        setForm((f) => ({ ...f, unitPriceStage: v }));
                      }}
                    >
                      <SelectTrigger id="sres-unit-price-stage" className="w-full">
                        <SelectValue placeholder="구분 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안 함</SelectItem>
                        {unitPriceStageRaw && !unitPriceStageCodeMatch ? (
                          <SelectItem value={`__legacy__:${unitPriceStageRaw}`}>{unitPriceStageRaw}</SelectItem>
                        ) : null}
                        {salesPriceStageCodes.map((code) => {
                          const v = code.value || code.name || '';
                          if (!v) return null;
                          return (
                            <SelectItem key={v} value={v}>
                              {code.name || code.value}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="sres-unit-price">단가</Label>
                    <Input
                      id="sres-unit-price"
                      value={form.unitPrice}
                      onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                    />
                  </div>

                  <div className="col-span-2 grid min-w-0 grid-cols-1 gap-x-3 gap-y-3 sm:col-span-4 sm:grid-cols-2">
                    <div className="min-w-0 space-y-2">
                      <Label>비고</Label>
                      <Textarea
                        rows={2}
                        value={form.remarks}
                        onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label>참고</Label>
                      <Textarea
                        rows={2}
                        value={form.reference}
                        onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                  </div>
                </div>

              <DrawerFooter className="mt-auto shrink-0 border-t border-border">
                <div className="flex justify-between gap-2">
                  <DrawerClose asChild>
                    <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                      <X className="mr-1.5 h-4 w-4" />
                      취소
                    </Button>
                  </DrawerClose>
                  <div className="flex gap-2">
                    {isEdit ? (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => setDeleteOpen(true)}
                        disabled={saving}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        삭제
                      </Button>
                    ) : null}
                    <Button type="button" onClick={() => void handleSave()} disabled={saving || detailLoading}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Save className="mr-1.5 h-4 w-4" />
                          저장
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DrawerFooter>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer
        open={productSelectOpen && isMobile}
        onOpenChange={(next) => {
          if (!next) setProductSelectOpen(false);
        }}
        direction="right"
        dismissible={false}
      >
        <DrawerContent
          className="z-[70] flex h-full flex-col border-l p-0 shadow-xl"
          style={{
            width: '100%',
            maxWidth: '100vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-primary">
                <Package className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <DrawerTitle className="text-lg">상품 선택</DrawerTitle>
                <DrawerDescription className="text-sm">
                  BL·BK별 재고에서 한 건만 선택해 폼에 반영합니다. 베일 잔여는 판매 항목 점유와 이 페이지 판매예약 요청을
                  반영합니다.
                </DrawerDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setProductSelectOpen(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">닫기</span>
            </Button>
          </div>
          {productSelectTableBlock}
        </DrawerContent>
      </Drawer>

      <Dialog open={companySearchOpen} onOpenChange={handleCompanySearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>업체명으로 고객 검색</DialogTitle>
            <DialogDescription>업체명 또는 대표자명을 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCompanySearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={companySearchTerm}
                onChange={(e) => setCompanySearchTerm(e.target.value)}
                placeholder="업체명 또는 대표자명"
                autoFocus
              />
              <Button type="submit" disabled={companySearchLoading}>
                {companySearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>
            {companySearchError && <p className="text-sm text-destructive">{companySearchError}</p>}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y select-text">
              {companySearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : companySearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {companySearchAttempted ? '검색 결과가 없습니다.' : '업체명을 입력해 검색하세요.'}
                </div>
              ) : (
                companySearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors select-text"
                    onClick={() => handleSelectCompany(item)}
                  >
                    <p className="font-medium">{item.companyName || '업체명 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhoneInput(item.phone ?? '') || '전화번호 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={phoneSearchOpen} onOpenChange={handlePhoneSearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>전화번호로 고객 검색</DialogTitle>
            <DialogDescription>전화번호를 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePhoneSearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={phoneSearchTerm}
                onChange={(e) => setPhoneSearchTerm(e.target.value)}
                placeholder="010-1234-5678"
                autoFocus
              />
              <Button type="submit" disabled={phoneSearchLoading}>
                {phoneSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>
            {phoneSearchError && <p className="text-sm text-destructive">{phoneSearchError}</p>}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y select-text">
              {phoneSearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : phoneSearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {phoneSearchAttempted ? '검색 결과가 없습니다.' : '전화번호를 입력해 검색하세요.'}
                </div>
              ) : (
                phoneSearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors select-text"
                    onClick={() => handleSelectPhone(item)}
                  >
                    <p className="font-medium">{formatPhoneInput(item.phone ?? '') || '전화번호 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.companyName || '업체명 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>판매예약 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 예약 행을 삭제할까요? 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
