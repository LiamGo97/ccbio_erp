'use client';

import * as React from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Info,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { InboundStatusBadge } from '@/components/sales/inbound-status-badge';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  srsParseImportFromArrayBuffer,
  type SrsImportRow,
} from '@/lib/sales/product-reservations-sheet-excel';
import {
  quotationBuildExportAoA,
  quotationDownloadXlsx,
  quotationParseImportFromArrayBuffer,
} from '@/lib/sales/quotation-sheet-excel';
import {
  normalizeVehicleCodeForLookup,
  requestedContainerQtyFromVehicleCode,
} from '@/lib/sales/vehicle-requested-container-qty';

const COL_COUNT = 13;

const EMPTY_SHEET_ROW_VALUES: string[] = Array.from(
  { length: COL_COUNT },
  () => '',
);
const MIN_ROW_COUNT = 50;
const ROW_EXTEND_STEP = 50;
const ROW_EXTEND_THRESHOLD = 5;

function getExpandedRowCount(requiredRows: number): number {
  if (!Number.isFinite(requiredRows) || requiredRows <= 0) {
    return MIN_ROW_COUNT;
  }
  if (requiredRows <= MIN_ROW_COUNT) return MIN_ROW_COUNT;
  return Math.ceil(requiredRows / ROW_EXTEND_STEP) * ROW_EXTEND_STEP;
}

// 기존 판매예약용 Select 컬럼은 견적서에서는 사용하지 않음(전부 텍스트).
const COL_SALES_GRADE = -1;
const COL_STATUS = -1;
const COL_VEHICLE = -1;
const COL_REQUESTED_QTY = -1;

/** A열 BL(검색/선택) */
const COL_COMPANY = 0;

/** 통화·단가·수출국·환율·원가·판매가(자동) / 마진(입력) 열 */
const COL_QUOTE_CURRENCY = 2;
const COL_QUOTE_UNIT_PRICE = 3;
const COL_QUOTE_EXPORT_COUNTRY = 4;
const COL_QUOTE_FX_CALC = 9;
const COL_QUOTE_COST = 10;
const COL_QUOTE_MARGIN = 11;
const COL_QUOTE_SELLING = 12;
const COL_QUOTE_ETA = 1;

/**
 * 견적서 그리드: ETA~원가(1~10)·판매가(12)는 BL 자동 채움·계산 필드 → 사용자 편집 불가.
 * 입력 가능: BL(0), 마진(11)만.
 */
function isQuotationReadonlySheetColumn(col: number): boolean {
  return (
    (col >= COL_QUOTE_ETA && col <= COL_QUOTE_COST) ||
    col === COL_QUOTE_SELLING
  );
}

/** D열(상태) 값에 따른 행 배경 — 행번호·본문 셀 공통 */
function sheetRowBackgroundForStatus(statusRaw: string): string | undefined {
  const s = statusRaw.trim();
  if (!s) return undefined;
  switch (s) {
    case '예약등록':
      return 'bg-emerald-50 dark:bg-emerald-950/40';
    case '판매등록':
      return 'bg-purple-50 dark:bg-purple-950/40';
    case '배차등록':
      return 'bg-amber-50 dark:bg-amber-950/35';
    case '하차완료':
      return 'bg-red-50 dark:bg-red-950/40';
    default:
      return undefined;
  }
}
// 판매예약의 BL Select 컬럼은 사용하지 않음(견적서는 BL만 업체명 방식 검색/선택).
const COL_BL = -1;
const COL_UNIT_PRICE = -1;

const SHEET_UI_HIDDEN_COLS: ReadonlySet<number> = new Set();

/** BL 옵션 캐시·병합 맵 키 — `상품코드\\u0001영업등급(trim)` (등급 없으면 상품만+구분자) */
function sheetBlCompositeKey(productCode: string, salesGradeRaw: string): string {
  return `${productCode.trim()}\u0001${salesGradeRaw.trim()}`;
}

/**
 * 헤더 제목 필터 팝오버.
 * 세로: Radix가 넣는 `--radix-popover-content-available-height`(트리거 기준 뷰포트 내 남은 높이)로 제한 — 전체 dvh만 쓰면 아래로 삐져나감.
 */
const SHEET_HEADER_FILTER_POPOVER_CONTENT_CLASS =
  'flex w-72 max-h-[min(var(--radix-popover-content-available-height,50vh),calc(100dvh-5rem))] max-w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 shadow-md';
const SHEET_HEADER_FILTER_POPOVER_LIST_CLASS =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain p-3';

function sheetHeaderFilterOptionMatchesQuery(
  queryNormalized: string,
  label: string,
  value: string,
): boolean {
  if (!queryNormalized) return true;
  const n = queryNormalized.toLowerCase();
  return (
    label.toLowerCase().includes(n) || String(value).toLowerCase().includes(n)
  );
}

/** 헤더 필터 팝오버 상단 검색 + 스크롤 목록 */
function SheetHeaderFilterPopoverFrame({
  children,
}: {
  children: (queryNormalized: string) => React.ReactNode;
}) {
  const [raw, setRaw] = React.useState('');
  const q = raw.trim().toLowerCase();
  return (
    <>
      <div className="shrink-0 border-b border-border px-3 pb-2 pt-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            size="sm"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="검색"
            className="h-8 pl-8 pr-2 text-sm"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="필터 검색"
          />
        </div>
      </div>
      <div className={SHEET_HEADER_FILTER_POPOVER_LIST_CLASS}>
        {children(q)}
      </div>
    </>
  );
}

/** 화면에 그리는 데이터 열 순서(숨김 열 제외) — 리사이즈 가이드 x 계산과 동일 소스 */
const VISIBLE_SHEET_COL_ORDER: readonly number[] = Array.from(
  { length: COL_COUNT },
  (_, i) => i,
).filter((c) => !SHEET_UI_HIDDEN_COLS.has(c));

/** 행 번호 열 드래그 시 선택 범위의 오른쪽 끝(숨김 열 제외한 마지막 데이터 열) */
const MAX_VISIBLE_SHEET_COL =
  VISIBLE_SHEET_COL_ORDER[VISIBLE_SHEET_COL_ORDER.length - 1] ?? 0;

function stepVisibleSheetColumn(fromCol: number, delta: number): number {
  const step = delta > 0 ? 1 : -1;
  let c = fromCol + delta;
  c = Math.max(0, Math.min(COL_COUNT - 1, c));
  while (c >= 0 && c < COL_COUNT && SHEET_UI_HIDDEN_COLS.has(c)) {
    c += step;
  }
  return Math.max(0, Math.min(COL_COUNT - 1, c));
}

function nudgeOffHiddenSheetCol(col: number): number {
  if (!SHEET_UI_HIDDEN_COLS.has(col)) return col;
  const r = stepVisibleSheetColumn(col, 1);
  if (r !== col) return r;
  return stepVisibleSheetColumn(col, -1);
}

function isSheetNumericColumn(col: number): boolean {
  return false;
}

/** Select·숫자가 아닌 자유 텍스트 열 — IME는 `<input value>` 제어보다 contenteditable이 안정적 */
function isPlainTextSheetColumn(col: number): boolean {
  // 견적서: 자유 입력 텍스트는 마진 열만 (BL은 COL_COMPANY 전용 검색 UI)
  return col === COL_QUOTE_MARGIN;
}

function isCompanySheetColumn(col: number): boolean {
  return col === COL_COMPANY;
}

/** 무역 주문 검색(`/trade/contracts/orders`) 한 건 — BL·BK 표시·저장 */
type SheetBlSearchResult = {
  /** 표시용 키(임시). 백엔드 연결 시 to_id 등으로 변경 */
  id: string;
  bl: string;
  /** BL 미발급 부킹은 BK만 있을 수 있음 — 셀 저장값은 `bl || bk` */
  bk?: string | null;
  etaDate?: string | null;
  salesStatus?: string | null;
  currency?: string | null;
  currencyName?: string | null;
  unitPrice?: number | null;
  exportCountryName?: string | null;
  productName?: string | null;
  grade?: string | null;
  packing?: string | null;
  notes?: string | null;
  salesNotes?: string | null;
};

/** 시트 BL열·부킹 옵션 value와 동일: BL 우선, 없으면 BK */
function sheetBookingSearchStoredValue(item: SheetBlSearchResult): string {
  const bl = (item.bl ?? '').trim();
  if (bl) return bl;
  return (item.bk ?? '').trim();
}

/** 한글·한자 등 IME 조합 문자는 `value`로 밀어 넣으면 첫 자모가 확정 처리되어 깨짐 → 전역 keydown에서는 ASCII만 initialChar로 씀 */
function isAsciiPrintableKey(key: string): boolean {
  return key.length === 1 && /^[\x20-\x7E]$/.test(key);
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function selectContentEditable(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 요청수량·단가: 숫자·쉼표·소수점(최대 하나) */
function sanitizeSheetNumericInput(value: string): string {
  let s = value.replace(/[^\d.,]/g, '');
  const dot = s.indexOf('.');
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  }
  return s;
}

function parseSheetNumericForSum(raw: string): number {
  const cleaned = sanitizeSheetNumericInput((raw ?? '').trim());
  if (!cleaned) return 0;
  const n = parseFloat(cleaned.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 스프레드시트와 동일: $·USD 계열 ×1.48, €·EUR·유로 ×1.74 → 단가에 곱한 값 */
const QUOTATION_FX_USD_MULT = 1.48;
const QUOTATION_FX_EUR_MULT = 1.74;

function quotationFxMultiplierFromCurrencyLabel(currencyLabel: string): number | null {
  const t = (currencyLabel ?? '').trim();
  if (!t) return null;
  const u = t.toUpperCase();
  if (t.includes('€') || u.includes('EUR') || t.includes('유로')) {
    return QUOTATION_FX_EUR_MULT;
  }
  if (t.includes('$') || u.includes('USD') || t.includes('미국달러')) {
    return QUOTATION_FX_USD_MULT;
  }
  return null;
}

/** 환율 계산 칸 저장/표시용 문자열 — 통화·단가가 맞을 때만 값, 아니면 빈 문자열 */
function formatQuotationFxCalcStoredValue(
  unitPriceRaw: string,
  currencyLabel: string,
): string {
  const mult = quotationFxMultiplierFromCurrencyLabel(currencyLabel);
  if (mult == null) return '';
  const cleaned = sanitizeSheetNumericInput((unitPriceRaw ?? '').trim());
  if (!cleaned) return '';
  const n = parseFloat(cleaned.replace(/,/g, ''));
  if (!Number.isFinite(n)) return '';
  const product = mult * n;
  if (!Number.isFinite(product)) return '';
  return String(parseFloat(product.toPrecision(15)));
}

function parseQuotationFxCalcNumeric(
  unitPriceRaw: string,
  currencyLabel: string,
): number | null {
  const s = formatQuotationFxCalcStoredValue(unitPriceRaw, currencyLabel);
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 원가 = (환율계산 + 20) + 수출국 추가항.
 * 공통: 환율계산 + 20.
 * 파키스탄: 추가로 (환율계산 × 0.08 + 5).
 * 이탈리아·호주: 추가로 +5.
 * 기타(수출국 비어 있음 포함): 추가 없음.
 */
function quotationCostNumericFromFx(
  fx: number,
  exportCountryRaw: string,
): number | null {
  if (!Number.isFinite(fx)) return null;
  const t = (exportCountryRaw ?? '').trim();
  const lower = t.toLowerCase();
  const isPakistan =
    t.includes('파키스탄') || lower.includes('pakistan');
  const isItaly =
    t.includes('이탈리아') ||
    lower.includes('italy') ||
    lower.includes('italia');
  const isAustralia =
    t.includes('호주') || lower.includes('australia');

  const base = fx + 20;

  if (isPakistan) {
    return base + (fx * 0.08 + 5);
  }
  if (isItaly || isAustralia) {
    return base + 5;
  }
  return base;
}

function formatQuotationCostStoredValue(
  unitPriceRaw: string,
  currencyLabel: string,
  exportCountryRaw: string,
): string {
  const fx = parseQuotationFxCalcNumeric(unitPriceRaw, currencyLabel);
  if (fx == null) return '';
  const cost = quotationCostNumericFromFx(fx, exportCountryRaw);
  if (cost == null || !Number.isFinite(cost)) return '';
  return String(parseFloat(cost.toPrecision(15)));
}

/** 판매가 = 원가 + 마진(사용자 입력). 마진 칸이 비어 있으면 판매가도 비움. */
function formatQuotationSellingPriceStoredValue(
  unitPriceRaw: string,
  currencyLabel: string,
  exportCountryRaw: string,
  marginRaw: string,
): string {
  const marginCleaned = sanitizeSheetNumericInput((marginRaw ?? '').trim());
  if (!marginCleaned) return '';
  const marginNum = parseFloat(marginCleaned.replace(/,/g, ''));
  if (!Number.isFinite(marginNum)) return '';
  const costStr = formatQuotationCostStoredValue(
    unitPriceRaw,
    currencyLabel,
    exportCountryRaw,
  );
  if (!costStr) return '';
  const costNum = parseFloat(costStr);
  if (!Number.isFinite(costNum)) return '';
  const selling = costNum + marginNum;
  if (!Number.isFinite(selling)) return '';
  return String(Math.round(selling));
}

/** 선택 통계용: 빈 칸은 합산에 포함(0), 숫자·쉼표·소수만 허용 */
function isCellNumericOnlyForStats(raw: string): boolean {
  const t = (raw ?? '').trim();
  if (!t) return true;
  if (!/^[\d\s.,]+$/.test(t)) return false;
  const cleaned = sanitizeSheetNumericInput(t);
  if (!cleaned) return false;
  const n = parseFloat(cleaned.replace(/,/g, ''));
  return Number.isFinite(n);
}

/** `useColumnSettings(…-column-sizes)` 쿠키에 저장되는 컬럼 id */
const SHEET_COLUMN_IDS = [
  'bl',
  'eta',
  'currency',
  'unitPrice',
  'exportCountry',
  'product',
  'grade',
  'packing',
  'remarks',
  'fxRate',
  'cost',
  'margin',
  'sellingPrice',
] as const;

const DEFAULT_SHEET_COL_WIDTHS: readonly number[] = [
  200, 110, 90, 90, 90, 120, 120, 120, 400, 90, 90, 90, 90,
];

const MIN_SHEET_COL_WIDTHS: readonly number[] = [
  72, 48, 56, 56, 96, 56, 56, 56, 56, 56, 56, 56, 56,
];

const SHEET_MAX_COL_WIDTH = 560;

const ROW_HEADER_COL_PX = 40;

const ROW_HEADER_TH_STYLE: React.CSSProperties = {
  width: ROW_HEADER_COL_PX,
  minWidth: ROW_HEADER_COL_PX,
  maxWidth: ROW_HEADER_COL_PX,
};

/**
 * 구글 스프레드시트처럼 열 경계선 위치 — 행 번호 열 오른쪽부터 데이터 열 colIndex의 왼쪽 에지까지(px).
 * 드래그 중 실제 열 너비는 바꾸지 않고, 이 값 + 제안 너비로 세로 가이드만 이동.
 */
function getSheetDataColumnLeftEdgePx(
  colIndex: number,
  colWidths: readonly number[],
  visibleCols: readonly number[],
): number {
  let x = ROW_HEADER_COL_PX;
  for (const c of visibleCols) {
    if (c === colIndex) return x;
    x += colWidths[c] ?? DEFAULT_SHEET_COL_WIDTHS[c] ?? 120;
  }
  return x;
}

/** 시트 콤보: -1 = 검색 입력 모드(커서 허용), 0 = 「선택 안 함」, 1..n = 필터 결과 행 */
const SHEET_COMBO_INPUT_MODE = -1;

/** 첫 열(A) 빈 값 — Select value로만 사용 */
const FIRST_COL_EMPTY = '__empty__';

/** 상품·BL·차량분류 Select 드롭다운 첫 항목 라벨(저장값은 여전히 빈 문자열) */
const SELECT_NONE_LABEL = '선택 안 함';

/** 읽기 전용 셀에서 미선택일 때 빈 칸(줄 높이 유지) */
const EMPTY_CELL_DISPLAY = '\u00a0';

export type SheetProductOption = { value: string; label: string };

/** BL 열 — API에서 온 `salesStatus`로 입고 뱃지 표시 */
export type SheetBlOption = {
  value: string;
  label: string;
  salesStatus: string | null;
  /** 입항 예정일(부킹 ETA) — BL 목록·셀 표시용 */
  etaDate?: string | null;
  /** API 메타(컨당 베일 등). 시트 요청수량 자동입력은 차량분류→컨 환산 맵 사용 */
  perContainerBales?: number;
  /**
   * 해당 상품·BL 부킹 컨에 나타난 영업 등급 코드들.
   * 없거나 비어 있으면 등급 필터를 적용하지 않음(목록에 모두 표시).
   */
  salesGradesForProduct?: string[];
  /** BL 드롭다운 전용 — 가용재고(컨 상당), API `sheet-bl-options` */
  availableContainerEquiv?: number;
  /** 목록에 없는 저장값 등 */
  orphan?: boolean;
};

/** 읽기 전용 BL 이외 셀 — React.memo 비교용 안정 참조 */
const EMPTY_BL_OPTIONS: SheetBlOption[] = [];

function formatBlEtaDateLabel(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** BL 목록·셀 — 입고상태 뱃지 옆 ETA 표시 */
function BlEtaBadge({ etaDate }: { etaDate?: string | null }) {
  const label = formatBlEtaDateLabel(etaDate);
  if (!label) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 border-violet-400 bg-violet-50 text-violet-800 tabular-nums',
        'dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-200',
      )}
    >
      입항 {label}
    </Badge>
  );
}

function formatAvailableContainerEquivLabel(n: number): string {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, '');
}

/** BL 콤보 목록 전용 — 읽기 전용 셀에는 표시하지 않음. 양수 초록 / 0 회색 / 음수 빨강 */
function AvailableContainerEquivBadge({
  value,
}: {
  value?: number | null;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const label = formatAvailableContainerEquivLabel(value);
  if (!label) return null;
  const tone =
    value > 0
      ? cn(
          'border-emerald-500/70 bg-emerald-50 text-emerald-900',
          'dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200',
        )
      : value < 0
        ? cn(
            'border-red-500/70 bg-red-50 text-red-900',
            'dark:border-red-500 dark:bg-red-950/40 dark:text-red-200',
          )
        : cn(
            'border-muted-foreground/40 bg-muted/50 text-muted-foreground',
            'dark:border-muted-foreground/50 dark:bg-muted/30 dark:text-muted-foreground',
          );
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 tabular-nums text-[10px] font-normal',
        tone,
      )}
      title="가용재고(컨 상당)"
    >
      가용 {label}컨
    </Badge>
  );
}

function formatBaleForQtyCell(value: number): string {
  if (!Number.isFinite(value)) return '';
  return sanitizeSheetNumericInput(String(Math.max(0, value)));
}

function storedToSelectValue(raw: string): string {
  return raw === '' ? FIRST_COL_EMPTY : raw;
}

/** G열 차량분류 — 판매등록 요청 차량(CONSULTATION_REQUEST_WEIGHT)과 동일 */
function vehicleDraftFromStored(
  raw: string,
  codes: { value?: string | null; name?: string | null }[],
): string {
  const t = raw.trim();
  if (!t) return FIRST_COL_EMPTY;
  const list = codes ?? [];
  const match = list.some((c) => (c.value || c.name || '').trim() === t);
  if (match) return t;
  return `__legacy__:${t}`;
}

function firstColDisplay(
  stored: string,
  productOptions: SheetProductOption[],
): string {
  const v = storedToSelectValue(stored);
  if (v === FIRST_COL_EMPTY) {
    return EMPTY_CELL_DISPLAY;
  }
  const opt = productOptions.find((o) => o.value === v);
  const text = opt?.label ?? stored;
  return text || EMPTY_CELL_DISPLAY;
}

/** API 옵션: null/빈 salesStatus → 입고대기 뱃지 */
function inboundStatusForBadge(
  salesStatus: string | null | undefined,
): 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' {
  if (salesStatus == null || salesStatus === '') {
    return 'INBOUND_PENDING';
  }
  if (
    salesStatus === 'INBOUND_PENDING' ||
    salesStatus === 'INBOUND_SCHEDULED' ||
    salesStatus === 'INBOUND_CONFIRMED'
  ) {
    return salesStatus;
  }
  return 'INBOUND_PENDING';
}

function BlOptionRow({
  bl,
  salesStatus,
  etaDate,
  orphan,
  availableContainerEquiv,
  showAvailableBadge = false,
}: {
  bl: string;
  salesStatus: string | null | undefined;
  etaDate?: string | null;
  orphan?: boolean;
  availableContainerEquiv?: number | null;
  /** true일 때만 가용(컨) 뱃지 — BL 드롭다운 */
  showAvailableBadge?: boolean;
}) {
  if (orphan) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[10px] text-muted-foreground">—</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {bl}
        </span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 w-full max-w-full items-center gap-1.5">
      <span className="flex shrink-0 flex-wrap items-center gap-1">
        <InboundStatusBadge status={inboundStatusForBadge(salesStatus)} />
        <BlEtaBadge etaDate={etaDate} />
        {showAvailableBadge ? (
          <AvailableContainerEquivBadge value={availableContainerEquiv} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
        {bl}
      </span>
    </span>
  );
}

function SecondColReadonly({
  stored,
  blOptions,
}: {
  stored: string;
  blOptions: SheetBlOption[];
}) {
  const v = storedToSelectValue(stored);
  if (v === FIRST_COL_EMPTY) {
    return <span aria-hidden>{EMPTY_CELL_DISPLAY}</span>;
  }
  const opt = blOptions.find((o) => o.value === v);
  if (!opt) {
    return (
      <BlOptionRow bl={stored} salesStatus={null} orphan />
    );
  }
  return (
    <BlOptionRow
      bl={opt.label}
      salesStatus={opt.salesStatus}
      etaDate={opt.etaDate}
      orphan={opt.orphan}
    />
  );
}

const SecondColReadonlyMemo = React.memo(SecondColReadonly);

type ReadonlySheetDataCellProps = {
  row: number;
  col: number;
  width: number;
  title?: string;
  /** 견적서: 자동 채움·계산 칸 — 배경으로 편집 가능 셀과 구분 */
  quotationReadonlySurface?: boolean;
  tdClassName: string;
  inRangeForBg: boolean;
  isFocusCell: boolean;
  foreignLockName?: string;
  isFillCornerCell: boolean;
  isSheetSelectColumn: boolean;
  /** 상태 열 기준 행 배경(선택 하이라이트가 아닐 때) */
  rowStatusBgClass?: string;
  /** A·등급·상태·차량 표시 문자(BL열은 미사용) */
  cellDisplayText: string;
  blStored: string;
  blOptions: SheetBlOption[];
  onFillHandlePointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  openSearchFromCellRef: React.MutableRefObject<(r: number, c: number) => void>;
  openDropdownFromCellRef: React.MutableRefObject<(r: number, c: number) => void>;
  stablePointerDown: React.PointerEventHandler<HTMLTableCellElement>;
  stablePointerEnter: React.PointerEventHandler<HTMLTableCellElement>;
  stableClick: React.MouseEventHandler<HTMLTableCellElement>;
  stableContextMenu: React.MouseEventHandler<HTMLTableCellElement>;
  stableDoubleClick: React.MouseEventHandler<HTMLTableCellElement>;
};

function areReadonlySheetDataCellPropsEqual(
  a: ReadonlySheetDataCellProps,
  b: ReadonlySheetDataCellProps,
): boolean {
  return (
    a.row === b.row &&
    a.col === b.col &&
    a.width === b.width &&
    a.tdClassName === b.tdClassName &&
    a.title === b.title &&
    a.quotationReadonlySurface === b.quotationReadonlySurface &&
    a.inRangeForBg === b.inRangeForBg &&
    a.isFocusCell === b.isFocusCell &&
    a.foreignLockName === b.foreignLockName &&
    a.isFillCornerCell === b.isFillCornerCell &&
    a.isSheetSelectColumn === b.isSheetSelectColumn &&
    a.rowStatusBgClass === b.rowStatusBgClass &&
    a.cellDisplayText === b.cellDisplayText &&
    a.blStored === b.blStored &&
    a.blOptions === b.blOptions &&
    a.onFillHandlePointerDown === b.onFillHandlePointerDown &&
    a.openSearchFromCellRef === b.openSearchFromCellRef &&
    a.openDropdownFromCellRef === b.openDropdownFromCellRef &&
    a.stablePointerDown === b.stablePointerDown &&
    a.stablePointerEnter === b.stablePointerEnter &&
    a.stableClick === b.stableClick &&
    a.stableContextMenu === b.stableContextMenu &&
    a.stableDoubleClick === b.stableDoubleClick
  );
}

function ReadonlySheetDataCellImpl(props: ReadonlySheetDataCellProps) {
  const {
    row,
    col,
    width,
    title,
    quotationReadonlySurface = false,
    tdClassName,
    inRangeForBg,
    isFocusCell,
    foreignLockName,
    isFillCornerCell,
    isSheetSelectColumn,
    rowStatusBgClass,
    cellDisplayText,
    blStored,
    blOptions,
    onFillHandlePointerDown,
    openSearchFromCellRef,
    openDropdownFromCellRef,
    stablePointerDown,
    stablePointerEnter,
    stableClick,
    stableContextMenu,
    stableDoubleClick,
  } = props;

  const readonlySurfaceBg = quotationReadonlySurface
    ? 'bg-muted/40 text-muted-foreground dark:bg-muted/25'
    : rowStatusBgClass ?? 'bg-white';

  const selectInner =
    col === COL_BL ? (
      <div className="min-w-0 flex-1 overflow-hidden">
        <SecondColReadonlyMemo stored={blStored} blOptions={blOptions} />
      </div>
    ) : (
      <span className="min-w-0 flex-1 truncate font-normal text-foreground">
        {cellDisplayText}
      </span>
    );

  return (
    <td
      data-sheet-r={row}
      data-sheet-c={col}
      title={title}
      aria-readonly={quotationReadonlySurface ? true : undefined}
      className={tdClassName}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
      }}
      onPointerDown={stablePointerDown}
      onPointerEnter={stablePointerEnter}
      onClick={stableClick}
      onContextMenu={stableContextMenu}
      onDoubleClick={stableDoubleClick}
    >
      {isSheetSelectColumn ? (
        <div
          className={cn(
            'relative flex h-full min-h-[28px] w-full min-w-0 items-center gap-1 pl-2 pr-1',
            inRangeForBg ? 'bg-[#e8f0fe]' : readonlySurfaceBg,
            isFocusCell && 'ring-2 ring-primary ring-inset',
            !foreignLockName && 'group/sheet-select',
          )}
        >
          {foreignLockName ? (
            <>
              <span className="flex min-w-0 flex-1 items-center overflow-hidden">
                {selectInner}
              </span>
              <ChevronDown
                className="size-3.5 shrink-0 opacity-40 text-muted-foreground"
                aria-hidden
              />
            </>
          ) : (
            <button
              type="button"
              className="absolute inset-y-1 left-2 right-1 z-[1] flex items-center gap-1 rounded-md px-1 text-left hover:bg-black/[0.08] dark:hover:bg-white/10"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (col === 0) {
                  openSearchFromCellRef.current(row, col);
                  return;
                }
                openDropdownFromCellRef.current(row, col);
              }}
              aria-label={`셀 ${colLetter(col)}${row + 1} 선택 목록 열기`}
            >
              <span className="min-w-0 flex-1 overflow-hidden">{selectInner}</span>
              <span
                className="relative z-[1] inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground"
                aria-hidden
              >
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </span>
            </button>
          )}
        </div>
      ) : col === COL_COMPANY ? (
        <div
          className={cn(
            'relative flex h-full min-h-[28px] w-full min-w-0 items-center gap-1 pl-2 pr-1',
            inRangeForBg ? 'bg-[#e8f0fe]' : readonlySurfaceBg,
            isFocusCell && 'ring-2 ring-primary ring-inset',
            !foreignLockName && 'group/company-select',
          )}
        >
          {foreignLockName ? (
            <>
              <span className="flex min-w-0 flex-1 items-center overflow-hidden">
                <span className="block truncate font-normal text-foreground">
                  {cellDisplayText || '\u00a0'}
                </span>
              </span>
              <ChevronDown
                className="size-3.5 shrink-0 opacity-40 text-muted-foreground"
                aria-hidden
              />
            </>
          ) : (
            <button
              type="button"
              className="absolute inset-y-1 left-2 right-1 z-[1] flex items-center gap-1 rounded-md px-1 text-left hover:bg-black/[0.08] dark:hover:bg-white/10"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openSearchFromCellRef.current(row, col);
              }}
              aria-label={`셀 ${colLetter(col)}${row + 1} 업체 검색 열기`}
            >
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="block truncate font-normal text-foreground">
                  {cellDisplayText || '\u00a0'}
                </span>
              </span>
              <span
                className="relative z-[1] inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground"
                aria-hidden
              >
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </span>
            </button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'flex h-full min-h-[28px] w-full min-w-0 items-center px-2',
            inRangeForBg ? 'bg-[#e8f0fe]' : readonlySurfaceBg,
            isFocusCell && 'ring-2 ring-primary ring-inset',
            quotationReadonlySurface && 'cursor-default',
          )}
        >
          <span
            className={cn(
              'block truncate font-normal',
              quotationReadonlySurface
                ? 'text-muted-foreground'
                : 'text-foreground',
            )}
          >
            {cellDisplayText || '\u00a0'}
          </span>
        </div>
      )}
      {isFillCornerCell && onFillHandlePointerDown ? (
        <button
          type="button"
          aria-label="선택 영역 채우기"
          title="드래그하여 값 채우기"
          data-sheet-fill-handle
          className="pointer-events-auto absolute -bottom-1 -right-1 z-[30] flex size-5 cursor-crosshair items-end justify-end border-0 bg-transparent p-0"
          onPointerDown={onFillHandlePointerDown}
        >
          <span
            className="box-border block size-2.5 shrink-0 rounded-full border border-white bg-primary shadow-[0_0_0_0.5px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.1)] dark:border-white dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.15),0_1px_2px_rgba(0,0,0,0.3)]"
            aria-hidden
          />
        </button>
      ) : null}
    </td>
  );
}

const ReadonlySheetDataCell = React.memo(
  ReadonlySheetDataCellImpl,
  areReadonlySheetDataCellPropsEqual,
);

type MemoSheetRowHeaderProps = {
  row: number;
  visibleRowIndex: number;
  className: string;
  stablePointerDown: React.PointerEventHandler<HTMLTableCellElement>;
  stablePointerEnter: React.PointerEventHandler<HTMLTableCellElement>;
  stableContextMenu: React.MouseEventHandler<HTMLTableCellElement>;
};

const MemoSheetRowHeader = React.memo(function MemoSheetRowHeader({
  row,
  visibleRowIndex,
  className,
  stablePointerDown,
  stablePointerEnter,
  stableContextMenu,
}: MemoSheetRowHeaderProps) {
  return (
    <th
      scope="row"
      data-sheet-row-header
      data-sheet-row-index={row}
      className={className}
      style={ROW_HEADER_TH_STYLE}
      onPointerDown={stablePointerDown}
      onPointerEnter={stablePointerEnter}
      onContextMenu={stableContextMenu}
      title="행 전체 선택 · 드래그로 여러 행 · 우클릭 메뉴"
    >
      {visibleRowIndex + 1}
    </th>
  );
});

function colLetter(index: number): string {
  let s = '';
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** 테이블 헤더 표시 — A~M 열 라벨 */
function columnHeaderLabel(index: number): string {
  if (index === 0) return 'BL';
  if (index === 1) return 'ETA';
  if (index === 2) return '통화단위';
  if (index === 3) return '단가';
  if (index === 4) return '수출국';
  if (index === 5) return '상품';
  if (index === 6) return '등급';
  if (index === 7) return '패킹';
  if (index === 8) return '비고';
  if (index === 9) return '환율 계산';
  if (index === 10) return '원가';
  if (index === 11) return '마진';
  if (index === 12) return '판매가';
  return colLetter(index);
}

function columnHeaderTitle(index: number): string | undefined {
  if (index === COL_QUOTE_FX_CALC) {
    return `자동: 단가×배율(달러 ${QUOTATION_FX_USD_MULT}, 유로 ${QUOTATION_FX_EUR_MULT}). 상단 정보 참고`;
  }
  if (index === COL_QUOTE_COST) {
    return '자동: 환율값+수출국. 상단 정보 참고';
  }
  if (index === COL_QUOTE_MARGIN) {
    return '입력 시 판매가에 반영. 상단 정보 참고';
  }
  if (index === COL_QUOTE_SELLING) {
    return '자동: 원가+마진. 상단 정보 참고';
  }
  if (index === COL_REQUESTED_QTY || index === COL_VEHICLE) {
    return '차량분류를 고르면 요청수량에 컨 환산값이 자동 입력됩니다. 비율은 페이지 상단 안내 참고.';
  }
  return undefined;
}

type CellPos = { row: number; col: number };

function cellKey(row: number, col: number) {
  return `${row},${col}`;
}

/**
 * 상품·상태·기타 열 헤더 필터 공통 규칙:
 * 필터가 켜진 열은 셀 값(trim)이 선택 집합에 있을 때만 통과(빈 문자열도 동일 — 선택에 없으면 제외).
 * A열·상태열은 `visible*FilterSet`, 그 외는 `headerFilterSetsByCol`(0·상태 열 항목은 무시).
 * `sheetInsertBypassRows`(실제로 productFilterBypassRows): 상단 상품·상태만 빈 값일 때 우회.
 *   헤더 필터는 **항상** 적용하되, bypass 행에서는 해당 열 값이 **비어 있을 때만** 그 열 검사를 건너뜀.
 */
function rowPassesSheetFilters(
  r: number,
  cells: Record<string, string>,
  visibleProductFilterSet: Set<string> | null,
  visibleStatusFilterSet: Set<string> | null,
  headerFilterSetsByCol: Map<number, Set<string>>,
  sheetInsertBypassRows: ReadonlySet<number> | null,
): boolean {
  const inInsertBypass = sheetInsertBypassRows?.has(r) ?? false;
  if (visibleProductFilterSet !== null) {
    if (visibleProductFilterSet.size === 0) return false;
    const a = (cells[cellKey(r, 0)] ?? '').trim();
    if (!visibleProductFilterSet.has(a)) {
      if (a !== '' || !inInsertBypass) return false;
    }
  }
  if (visibleStatusFilterSet !== null) {
    if (visibleStatusFilterSet.size === 0) return false;
    const s = (cells[cellKey(r, COL_STATUS)] ?? '').trim();
    if (!visibleStatusFilterSet.has(s)) {
      if (s !== '' || !inInsertBypass) return false;
    }
  }
  for (const [col, selectedSet] of headerFilterSetsByCol.entries()) {
    if (col === 0 || col === COL_STATUS) continue;
    if (selectedSet.size === 0) return false;
    const v = (cells[cellKey(r, col)] ?? '').trim();
    if (v === '' && inInsertBypass) {
      continue;
    }
    if (!selectedSet.has(v)) return false;
  }
  return true;
}

function remapProductFilterBypassAfterInsert(
  prev: Set<number>,
  insertAt: number,
  count: number,
): Set<number> {
  const next = new Set<number>();
  for (const r of prev) {
    next.add(r < insertAt ? r : r + count);
  }
  for (let r = insertAt; r < insertAt + count; r++) next.add(r);
  return next;
}

function remapProductFilterBypassAfterDelete(
  prev: Set<number>,
  r0: number,
  r1: number,
): Set<number> {
  const deleted = r1 - r0 + 1;
  const next = new Set<number>();
  for (const r of prev) {
    if (r < r0) next.add(r);
    else if (r > r1) next.add(r - deleted);
  }
  return next;
}

/** `visibleProductCodes === undefined` → 전체, `[]` → 선택 없음, 그 외 → 부분 상품 필터 */
function hasActiveProductSubsetSheetFilter(
  visibleProductCodes: readonly string[] | null | undefined,
): boolean {
  if (visibleProductCodes == null) return false;
  return visibleProductCodes.some((s) => String(s ?? '').trim().length > 0);
}

function isCellInAnchorFocusRange(
  row: number,
  col: number,
  a: CellPos,
  f: CellPos,
): boolean {
  const r0 = Math.min(a.row, f.row);
  const r1 = Math.max(a.row, f.row);
  const c0 = Math.min(a.col, f.col);
  const c1 = Math.max(a.col, f.col);
  return row >= r0 && row <= r1 && col >= c0 && col <= c1;
}

/** 행 번호 드래그 등으로 잡은 전체 행 선택(데이터 열 전체)인지 */
function isFullRowSelection(a: CellPos, f: CellPos): boolean {
  const c0 = Math.min(a.col, f.col);
  const c1 = Math.max(a.col, f.col);
  return c0 === 0 && c1 === MAX_VISIBLE_SHEET_COL;
}

/**
 * 단일 숫자 열에서 여러 행이 등차수열이면 { v0, d } (r0행 값, 행당 차이).
 * 채우기 손잡이로 아래로 늘릴 때 1,2,3… 연장에 사용.
 */
function sheetNumericArithmeticStepFromColumn(
  cells: Record<string, string>,
  r0: number,
  r1: number,
  col: number,
): { v0: number; d: number } | null {
  if (!isSheetNumericColumn(col) || r1 <= r0) return null;
  let v0: number | null = null;
  let d: number | null = null;
  for (let i = 0; i <= r1 - r0; i++) {
    const r = r0 + i;
    const raw = (cells[cellKey(r, col)] ?? '').trim().replace(/,/g, '');
    if (raw === '') return null;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return null;
    if (i === 0) {
      v0 = n;
    } else if (i === 1 && v0 != null) {
      d = n - v0;
    } else if (d != null && v0 != null) {
      const expected = v0 + i * d;
      if (Math.abs(n - expected) > 1e-6 * (Math.abs(n) + Math.abs(expected) + 1)) {
        return null;
      }
    }
  }
  if (v0 == null || d == null) return null;
  return { v0, d };
}

function maxRowInCellMap(map: Record<string, string>): number {
  let max = -1;
  for (const k of Object.keys(map)) {
    const r = Number(String(k).split(',')[0]);
    if (Number.isFinite(r) && r > max) max = r;
  }
  return max;
}

/** 선택한 연속 행(r0~r1)을 제거하고 아래 행 인덱스를 위로 당김(구글 시트「행 삭제」) */
function remapCellsAfterDeletingRowRange(
  prev: Record<string, string>,
  r0: number,
  r1: number,
): Record<string, string> {
  const deleteSet = new Set<number>();
  for (let r = r0; r <= r1; r++) deleteSet.add(r);
  const shiftForRow = (row: number) => {
    let n = 0;
    for (const d of deleteSet) {
      if (d < row) n++;
    }
    return row - n;
  };
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(prev)) {
    const parts = String(k).split(',');
    const r = Number(parts[0]);
    const c = Number(parts[1]);
    if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
    if (deleteSet.has(r)) continue;
    const newR = shiftForRow(r);
    next[cellKey(newR, c)] = v;
  }
  return next;
}

/** `insertAt` 위치에 `count`개의 빈 행을 끼워 넣고, 그 행 이하 인덱스를 아래로 밀음 */
function remapCellsAfterInsertingRowsAt(
  prev: Record<string, string>,
  insertAt: number,
  count: number,
): Record<string, string> {
  if (count <= 0) return { ...prev };
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(prev)) {
    const parts = String(k).split(',');
    const r = Number(parts[0]);
    const c = Number(parts[1]);
    if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
    if (r < insertAt) {
      next[k] = v;
    } else {
      next[cellKey(r + count, c)] = v;
    }
  }
  return next;
}

/**
 * 셀 범위 비우기: Backspace + Forward Delete.
 * 맥에서 외장 키보드·윈도우(PC) 레이아웃으로 쓰면 `key`만으로는 Delete가 빠지는 경우가 있어 `code`/`keyCode`도 본다.
 */
function isSheetRangeClearKey(e: KeyboardEvent): boolean {
  if (e.key === 'Backspace' || e.key === 'Delete') return true;
  if (e.code === 'Delete') return true;
  if (e.keyCode === 46) return true;
  return false;
}

/**
 * 키보드로 항목 이동 시 `scrollIntoView(nearest)`보다 먼저 스크롤되게 함.
 * 포커스 행이 뷰포트 위·아래 가장자리에서 marginPx 안쪽에 들어오면 그만큼 밀어 올림/내림.
 */
function scrollElementIntoViewWithEdgeMargin(
  viewport: HTMLElement,
  el: HTMLElement,
  marginPx: number,
): void {
  const v = viewport.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  const bottomLimit = v.bottom - marginPx;
  if (e.bottom > bottomLimit) {
    viewport.scrollTop += Math.ceil(e.bottom - bottomLimit);
  }
  const topLimit = v.top + marginPx;
  if (e.top < topLimit) {
    viewport.scrollTop -= Math.ceil(topLimit - e.top);
  }
}

/** 콤보 목록: ↑↓ 시 하단·상단 오버레이(h-11) 근처 전에 스크롤 */
const SHEET_COMBO_KEYBOARD_EDGE_MARGIN_PX = 52;

/**
 * 목록 호버로 activeIndex≥0(읽기 전용)인데 포커스는 그대로 input에 있을 때,
 * 클릭만으로는 focus가 재발행되지 않아 onFocus로 입력 모드 복귀가 안 됨 → pointerdown에서 처리.
 */
function comboSearchInputPointerDownReturnToTyping(
  e: React.PointerEvent<HTMLInputElement>,
  activeIndex: number,
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>,
  suppressComboArrowDownRepeatAfterLeaveInputRef: React.MutableRefObject<boolean>,
) {
  if (e.button !== 0) return;
  if (activeIndex < 0) return;
  suppressComboArrowDownRepeatAfterLeaveInputRef.current = false;
  flushSync(() => setActiveIndex(SHEET_COMBO_INPUT_MODE));
  const el = e.currentTarget;
  queueMicrotask(() => {
    if (document.activeElement !== el) return;
    const len = el.value.length;
    el.setSelectionRange(len, len);
  });
}

/** 차량분류 선택·붙여넣기 시 요청수량(F열)에 컨 수량 반영. 차량 비우면 요청수량도 비움. */
function applyRequestedQtyFromVehicleSelection(
  next: Record<string, string>,
  row: number,
  vehicleStored: string,
): void {
  const v = normalizeVehicleCodeForLookup(vehicleStored);
  if (v === '') {
    next[cellKey(row, COL_REQUESTED_QTY)] = '';
    return;
  }
  const n = requestedContainerQtyFromVehicleCode(vehicleStored);
  if (n !== undefined) {
    next[cellKey(row, COL_REQUESTED_QTY)] = formatBaleForQtyCell(n);
  }
}

/** BL/BK(0열) 선택 시 자동 입력되는 ETA·통화·단가 등(1~8열) — BL을 비울 때 함께 제거 */
function clearQuotationFieldsFilledFromBlBooking(
  next: Record<string, string>,
  row: number,
): void {
  for (let c = COL_QUOTE_ETA; c <= 8; c += 1) {
    next[cellKey(row, c)] = '';
  }
}

function extractRowStrings(
  cells: Record<string, string>,
  row: number,
): string[] {
  return Array.from({ length: COL_COUNT }, (_, c) => {
    if (c === COL_QUOTE_FX_CALC) {
      return formatQuotationFxCalcStoredValue(
        cells[cellKey(row, COL_QUOTE_UNIT_PRICE)] ?? '',
        cells[cellKey(row, COL_QUOTE_CURRENCY)] ?? '',
      );
    }
    if (c === COL_QUOTE_COST) {
      return formatQuotationCostStoredValue(
        cells[cellKey(row, COL_QUOTE_UNIT_PRICE)] ?? '',
        cells[cellKey(row, COL_QUOTE_CURRENCY)] ?? '',
        cells[cellKey(row, COL_QUOTE_EXPORT_COUNTRY)] ?? '',
      );
    }
    if (c === COL_QUOTE_SELLING) {
      return formatQuotationSellingPriceStoredValue(
        cells[cellKey(row, COL_QUOTE_UNIT_PRICE)] ?? '',
        cells[cellKey(row, COL_QUOTE_CURRENCY)] ?? '',
        cells[cellKey(row, COL_QUOTE_EXPORT_COUNTRY)] ?? '',
        cells[cellKey(row, COL_QUOTE_MARGIN)] ?? '',
      );
    }
    return cells[cellKey(row, c)] ?? '';
  });
}

/** 해당 행의 13칸이 하나라도 달라졌을 때만 true — 편집만 열었다 닫을 때 불필요한 저장 방지 */
function sheetRowStringsChanged(
  prev: Record<string, string>,
  next: Record<string, string>,
  row: number,
): boolean {
  for (let c = 0; c < COL_COUNT; c++) {
    const k = cellKey(row, c);
    if ((prev[k] ?? '') !== (next[k] ?? '')) return true;
  }
  return false;
}

/** 클립보드 TSV: 탭/줄바꿈이 셀 값을 깨뜨리지 않게 축약 */
function escapeCellForTsv(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ');
}

function buildCopyTsv(
  cellMap: Record<string, string>,
  r0: number,
  r1: number,
  c0: number,
  c1: number,
): string {
  const lines: string[] = [];
  for (let r = r0; r <= r1; r++) {
    const parts: string[] = [];
    for (let c = c0; c <= c1; c++) {
      const raw =
        c === COL_QUOTE_FX_CALC
          ? formatQuotationFxCalcStoredValue(
              cellMap[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '',
              cellMap[cellKey(r, COL_QUOTE_CURRENCY)] ?? '',
            )
          : c === COL_QUOTE_COST
            ? formatQuotationCostStoredValue(
                cellMap[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '',
                cellMap[cellKey(r, COL_QUOTE_CURRENCY)] ?? '',
                cellMap[cellKey(r, COL_QUOTE_EXPORT_COUNTRY)] ?? '',
              )
            : c === COL_QUOTE_SELLING
              ? formatQuotationSellingPriceStoredValue(
                  cellMap[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '',
                  cellMap[cellKey(r, COL_QUOTE_CURRENCY)] ?? '',
                  cellMap[cellKey(r, COL_QUOTE_EXPORT_COUNTRY)] ?? '',
                  cellMap[cellKey(r, COL_QUOTE_MARGIN)] ?? '',
                )
              : (cellMap[cellKey(r, c)] ?? '');
      parts.push(escapeCellForTsv(raw));
    }
    lines.push(parts.join('\t'));
  }
  return lines.join('\n');
}

function parseClipboardTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) return [];
  const lines = normalized.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.map((line) => line.split('\t'));
}

function normalizeProductForPaste(
  raw: string,
  options: SheetProductOption[],
): string | null {
  const t = raw.trim();
  if (t === '') return '';
  const byVal = options.find((o) => o.value === t);
  if (byVal) return byVal.value;
  const byLabel = options.find((o) => o.label.trim() === t);
  if (byLabel) return byLabel.value;
  return null;
}

/** 붙여넣기용: 표시 라벨 `… (BK)` → 저장값(BK 문자열) 후보 */
function stripBkLabelSuffix(raw: string): string {
  return raw.replace(/\s*\(BK\)\s*$/i, '').trim();
}

/** BL은 상품별 목록에 있는 값만 허용. 매칭 실패 시 null(붙여넣기에서 해당 칸 건너뜀). */
function normalizeBlForPaste(raw: string, blList: SheetBlOption[]): string | null {
  const t = raw.trim();
  if (t === '') return '';
  const byVal = blList.find((b) => b.value === t);
  if (byVal) return byVal.value;
  const byLabel = blList.find((b) => (b.label || '').trim() === t);
  if (byLabel) return byLabel.value;
  const stripped = stripBkLabelSuffix(t);
  if (stripped !== t) {
    const byBkVal = blList.find((b) => b.value === stripped);
    if (byBkVal) return byBkVal.value;
  }
  return null;
}

function normalizeVehicleForPaste(
  raw: string,
  codes: { value?: string | null; name?: string | null }[],
): string | null {
  const t = raw.trim();
  if (t === '') return '';
  for (const c of codes) {
    const v = (c.value || '').trim();
    const n = (c.name || '').trim();
    if (v && v === t) return v;
    if (n && n === t) return v || n;
  }
  return null;
}

function normalizeStatusForPaste(
  raw: string,
  codes: { value: string; label: string }[],
): string | null {
  const t = raw.trim();
  if (t === '') return '';
  const byVal = codes.find((c) => c.value === t);
  if (byVal) return byVal.value;
  const byLabel = codes.find((c) => c.label.trim() === t);
  if (byLabel) return byLabel.value;
  return null;
}

/** 입고 부킹에 등급이 없으면 `fallbackFull`(코드 마스터 전체) */
function salesGradeAllowedListForProduct(
  productCode: string,
  byProduct: Record<string, { value: string; label: string }[]>,
  fallbackFull: { value: string; label: string }[],
): { value: string; label: string }[] {
  const p = productCode.trim();
  if (p && byProduct[p]?.length) return byProduct[p]!;
  return fallbackFull;
}

const MAX_UNDO_STACK = 80;

/** 로컬 삭제·저장 직후 stale remoteCells 병합이 예전 문자열을 잠깐 되살리는 깜빡임 방지 */
const REMOTE_MERGE_SUPPRESS_MS_AFTER_PERSIST = 2200;
const REMOTE_MERGE_SUPPRESS_MS_ON_RANGE_CLEAR = 700;

/** 같은 행에 대한 PUT을 짧게 묶어 연속 API 폭주 완화 (ms) */
const PERSIST_ROW_DEBOUNCE_MS = 450;
/** 동시에 나가는 행 저장 요청 상한 (붙여넣기 등) */
const MAX_CONCURRENT_PERSIST_ROWS = 4;

function snapshotCells(c: Record<string, string>): Record<string, string> {
  return { ...c };
}

function cellsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export interface QuotationSheetGridProps {
  /** 입고대기·입고예정·입고확정 부킹에 나온 상품(코드) — PRODUCT 코드명으로 라벨 */
  firstColumnProductOptions?: SheetProductOption[];
  firstColumnProductOptionsLoading?: boolean;
  /**
   * BL 옵션 사전 주입(선택). 키: `sheetBlCompositeKey(상품, 등급)`. 비우면 BL 편집 시에만 API로 채움.
   */
  blOptionsByProductCode?: Record<string, SheetBlOption[]>;
  /**
   * 상품 코드 → 입고 부킹 컨에 실린 영업 등급 후보.
   * 해당 상품에 값이 없거나 비어 있으면 등급 열은 SALES_GRADE 코드 마스터 전체를 씀.
   */
  salesGradeOptionsByProductCode?: Record<
    string,
    { value: string; label: string }[]
  >;
  /** 다른 사용자가 잠근 셀 — 키 `row,col` → 표시명 */
  foreignCellLocks?: Record<string, string>;
  /** 편집 시작 직전(서버 락 등). false면 편집 취소 */
  onBeforeEdit?: (row: number, col: number) => Promise<boolean>;
  /** 편집 종료 시(커밋·취소·셀 이동 등) 락 해제용 */
  onAfterEdit?: (row: number, col: number) => void;
  /** 현재 편집 셀 — 하트비트 등 */
  onEditingCellChange?: (pos: CellPos | null) => void;
  /** 행 단위 저장(커밋·Select 완료 시). values 길이 COL_COUNT */
  onPersistRow?: (row: number, values: string[]) => void | Promise<void>;
  /** 서버에서 동기화된 셀 맵 — 편집 중인 행은 덮어쓰지 않음 */
  remoteCells?: Record<string, string>;
  /** remoteCells 갱신 시 병합 트리거(React Query dataUpdatedAt 등) */
  remoteVersion?: number;
  /**
   * `undefined`: 상품 필터 없음(모든 행).
   * `[]`: 상품을 하나도 선택하지 않음 — 표시 행 없음.
   * 그 외: A열(trim)이 선택한 상품 코드 중 하나와 일치하는 행만(빈 칸은 선택에 없으면 제외).
   * 행 삽입 직후 해당 행은 잠시 예외 표시(상단 상품·상태 필터가 비어 있을 때 우회, 열 헤더 필터도 동일 행에 한해 생략).
   */
  visibleProductCodes?: readonly string[] | null;
  /**
   * `undefined`: 상태(C열) 필터 없음.
   * `[]`: 선택 없음 — 표시 행 없음.
   * 그 외: C열(트림)이 선택한 상태 값 중 하나와 일치하는 행만 표시(빈 칸은 값 없음으로, 선택 목록에 없으면 제외).
   */
  visibleStatusCodes?: readonly string[] | null;
  /** A열(상품) 헤더 필터 목록(상단 필터와 동일 소스) */
  productHeaderFilterOptions?: readonly SheetProductOption[];
  /** A열(상품) 헤더 필터 현재 선택 코드 목록 */
  productHeaderSelectedCodes?: readonly string[];
  /** A열(상품) 헤더 필터 변경 */
  onProductHeaderFilterChange?: (codes: string[]) => void;
  /** C열(상태) 헤더 필터 목록 */
  statusHeaderFilterOptions?: readonly { value: string; label: string }[];
  /** C열(상태) 헤더 필터 현재 선택 코드 목록 */
  statusHeaderSelectedCodes?: readonly string[];
  /** C열(상태) 헤더 필터 변경 */
  onStatusHeaderFilterChange?: (codes: string[]) => void;
  /** 헤더 드래그로 열 너비 조절 시 쿠키 등에서 복원한 px (컬럼 id → 너비) */
  columnSizing?: Record<string, number>;
  /** 열 너비 변경 시 — `useColumnSettings`의 `onColumnSizingChange`에 연결 */
  onColumnSizingChange?: (sizing: Record<string, number>) => void;
  /** 루트 컨테이너 — 페이지에서 `min-h-0 flex-1` 등으로 세로 채움 */
  className?: string;
}

export type QuotationSheetGridHandle = {
  exportExcel: () => void;
  openExcelImportPicker: () => void;
};

export const QuotationSheetGrid = React.forwardRef<
  QuotationSheetGridHandle,
  QuotationSheetGridProps
>(function QuotationSheetGrid(
  {
    firstColumnProductOptions = [],
    firstColumnProductOptionsLoading = false,
    blOptionsByProductCode = {},
    salesGradeOptionsByProductCode = {},
    foreignCellLocks,
    onBeforeEdit,
    onAfterEdit,
    onEditingCellChange,
    onPersistRow,
    remoteCells,
    remoteVersion = 0,
    visibleProductCodes,
    visibleStatusCodes,
    productHeaderFilterOptions = [],
    productHeaderSelectedCodes = [],
    onProductHeaderFilterChange,
    statusHeaderFilterOptions = [],
    statusHeaderSelectedCodes = [],
    onStatusHeaderFilterChange,
    columnSizing,
    onColumnSizingChange,
    className,
  },
  ref,
) {
  const [cells, setCells] = React.useState<Record<string, string>>({});
  /** 범위 선택 시작점(드래그 앵커) */
  const [anchor, setAnchor] = React.useState<CellPos>({ row: 0, col: 0 });
  /** 활성 셀(포커스) — 키보드 이동·F2·단일 선택의 끝점 */
  const [focus, setFocus] = React.useState<CellPos>({ row: 0, col: 0 });
  const [rowCount, setRowCount] = React.useState(MIN_ROW_COUNT);
  /** 우클릭 컨텍스트 메뉴 — 행 번호는 구글 시트처럼 삽입·삭제·데이터만 삭제 */
  const [sheetContextMenu, setSheetContextMenu] = React.useState<
    | { x: number; y: number; variant: 'grid' }
    | { x: number; y: number; variant: 'row-header'; rowIndex: number }
    | null
  >(null);
  const excelImportFileInputRef = React.useRef<HTMLInputElement>(null);
  const [excelImportDialogOpen, setExcelImportDialogOpen] =
    React.useState(false);
  const excelImportRowsRef = React.useRef<SrsImportRow[]>([]);
  /** `엑셀로 복구`에 사용한 파일 형식(견적 내보내기 vs 판매예약 양식) */
  const excelImportFormatRef = React.useRef<'quotation' | 'srs'>('srs');
  const [excelImportRowCount, setExcelImportRowCount] = React.useState(0);
  /** 헤더 필터(컬럼별). 키가 없으면 필터 없음, []면 표시 행 없음 */
  const [headerFilterValuesByCol, setHeaderFilterValuesByCol] = React.useState<
    Record<number, string[]>
  >({});
  const [editing, setEditing] = React.useState<CellPos | null>(null);
  const [draft, setDraft] = React.useState('');
  const draftRef = React.useRef(draft);
  /** commitEdit는 stale `draft` 클로저를 피하기 위해 ref를 사용(Select 열 + 업체명) */
  React.useLayoutEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const [sheetBlOptionsCache, setSheetBlOptionsCache] = React.useState<
    Record<string, SheetBlOption[]>
  >({});
  const queryClient = useQueryClient();
  /** 행 저장 성공 시 BL 프리패치 effect가 같은 visible 쌍이라도 다시 돌도록 */
  const [blOptionsRefreshEpoch, setBlOptionsRefreshEpoch] = React.useState(0);

  // 견적서: 판매예약의 "상품별 BL 옵션 lazy fetch" 기능은 사용하지 않음.
  // BL은 업체명처럼 전체 검색/선택(UI)로 대체 예정.
  const mergedBlOptionsByProductCode = blOptionsByProductCode;
  const sheetBlDropdownLoading = false;

  /** A열 상품 검색 */
  const firstColSearchInputRef = React.useRef<HTMLInputElement>(null);
  const [firstColSearchTerm, setFirstColSearchTerm] = React.useState('');
  const [firstColSearchDirty, setFirstColSearchDirty] = React.useState(false);
  const statusSearchInputRef = React.useRef<HTMLInputElement>(null);
  const salesGradeSearchInputRef = React.useRef<HTMLInputElement>(null);
  const blSearchInputRef = React.useRef<HTMLInputElement>(null);
  const vehicleSearchInputRef = React.useRef<HTMLInputElement>(null);
  /** 콤보 목록 Radix ScrollArea 루트 — 편집 중인 열만 마운트 */
  const firstColScrollAreaRootRef = React.useRef<HTMLDivElement>(null);
  const companyScrollAreaRootRef = React.useRef<HTMLDivElement>(null);
  const salesGradeScrollAreaRootRef = React.useRef<HTMLDivElement>(null);
  const statusScrollAreaRootRef = React.useRef<HTMLDivElement>(null);
  const blScrollAreaRootRef = React.useRef<HTMLDivElement>(null);
  const vehicleScrollAreaRootRef = React.useRef<HTMLDivElement>(null);
  const comboScrollHoverIntervalRef =
    React.useRef<ReturnType<typeof setInterval> | null>(null);
  /** 목록 스크롤 위/아래 힌트(호버 시 해당 방향으로 스크롤) — 한 번에 한 콤보만 열림 */
  const [comboScrollMoreAbove, setComboScrollMoreAbove] =
    React.useState(false);
  const [comboScrollMoreBelow, setComboScrollMoreBelow] =
    React.useState(false);

  const getComboScrollViewportElement = React.useCallback((): HTMLElement | null => {
    const col = editing?.col;
    const root =
      col === COL_COMPANY
        ? companyScrollAreaRootRef.current
        : col === COL_SALES_GRADE
          ? salesGradeScrollAreaRootRef.current
          : col === COL_STATUS
            ? statusScrollAreaRootRef.current
            : col === COL_BL
              ? blScrollAreaRootRef.current
              : col === COL_VEHICLE
                ? vehicleScrollAreaRootRef.current
                : null;
    return (
      (root?.querySelector(
        '[data-radix-scroll-area-viewport]',
      ) as HTMLElement | null) ?? null
    );
  }, [editing?.col]);

  const syncComboScrollHints = React.useCallback(() => {
    const col = editing?.col;
    const root =
      col === COL_COMPANY
        ? companyScrollAreaRootRef.current
        : col === COL_SALES_GRADE
          ? salesGradeScrollAreaRootRef.current
          : col === COL_STATUS
            ? statusScrollAreaRootRef.current
            : col === COL_BL
              ? blScrollAreaRootRef.current
              : col === COL_VEHICLE
                ? vehicleScrollAreaRootRef.current
                : null;
    if (!root) {
      setComboScrollMoreAbove(false);
      setComboScrollMoreBelow(false);
      return;
    }
    const v = root.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLElement | null;
    if (!v) {
      setComboScrollMoreAbove(false);
      setComboScrollMoreBelow(false);
      return;
    }
    const { scrollTop, clientHeight, scrollHeight } = v;
    setComboScrollMoreAbove(scrollTop > 2);
    setComboScrollMoreBelow(scrollTop + clientHeight < scrollHeight - 2);
  }, [editing?.col]);

  const clearComboHoverScroll = React.useCallback(() => {
    if (comboScrollHoverIntervalRef.current) {
      clearInterval(comboScrollHoverIntervalRef.current);
      comboScrollHoverIntervalRef.current = null;
    }
  }, []);

  const startComboHoverScrollDown = React.useCallback(() => {
    clearComboHoverScroll();
    comboScrollHoverIntervalRef.current = setInterval(() => {
      const el = getComboScrollViewportElement();
      if (!el) {
        clearComboHoverScroll();
        return;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        clearComboHoverScroll();
        syncComboScrollHints();
        return;
      }
      el.scrollTop += 10;
      syncComboScrollHints();
    }, 35);
  }, [
    clearComboHoverScroll,
    getComboScrollViewportElement,
    syncComboScrollHints,
  ]);

  const startComboHoverScrollUp = React.useCallback(() => {
    clearComboHoverScroll();
    comboScrollHoverIntervalRef.current = setInterval(() => {
      const el = getComboScrollViewportElement();
      if (!el) {
        clearComboHoverScroll();
        return;
      }
      if (el.scrollTop <= 2) {
        el.scrollTop = 0;
        clearComboHoverScroll();
        syncComboScrollHints();
        return;
      }
      el.scrollTop -= 10;
      syncComboScrollHints();
    }, 35);
  }, [
    clearComboHoverScroll,
    getComboScrollViewportElement,
    syncComboScrollHints,
  ]);

  const handleComboScrollWheel = React.useCallback(
    (e: React.WheelEvent) => {
      const sc = getComboScrollViewportElement();
      if (!sc || sc.scrollHeight <= sc.clientHeight) return;
      e.preventDefault();
      e.stopPropagation();
      sc.scrollTop += e.deltaY;
      syncComboScrollHints();
    },
    [getComboScrollViewportElement, syncComboScrollHints],
  );

  const [statusSearchTerm, setStatusSearchTerm] = React.useState('');
  const [salesGradeSearchTerm, setSalesGradeSearchTerm] = React.useState('');
  const [blSearchTerm, setBlSearchTerm] = React.useState('');
  const [vehicleSearchTerm, setVehicleSearchTerm] = React.useState('');
  const [statusSearchDirty, setStatusSearchDirty] = React.useState(false);
  const [salesGradeSearchDirty, setSalesGradeSearchDirty] =
    React.useState(false);
  const [blSearchDirty, setBlSearchDirty] = React.useState(false);
  const [vehicleSearchDirty, setVehicleSearchDirty] = React.useState(false);
  const [firstColActiveIndex, setFirstColActiveIndex] =
    React.useState(SHEET_COMBO_INPUT_MODE);
  const [salesGradeActiveIndex, setSalesGradeActiveIndex] =
    React.useState(SHEET_COMBO_INPUT_MODE);
  const [statusActiveIndex, setStatusActiveIndex] =
    React.useState(SHEET_COMBO_INPUT_MODE);
  const [blActiveIndex, setBlActiveIndex] =
    React.useState(SHEET_COMBO_INPUT_MODE);
  const [vehicleActiveIndex, setVehicleActiveIndex] =
    React.useState(SHEET_COMBO_INPUT_MODE);
  /** B열 업체명: -1=입력, 0=선택 안 함, 1..n=검색 결과 */
  const [companyActiveIndex, setCompanyActiveIndex] =
    React.useState(SHEET_COMBO_INPUT_MODE);
  /** B열 업체명 검색 */
  const companySearchInputRef = React.useRef<HTMLInputElement>(null);
  const [companySearchTerm, setCompanySearchTerm] = React.useState('');
  const [companySearchDirty, setCompanySearchDirty] = React.useState(false);
  const [companySearchResults, setCompanySearchResults] = React.useState<
    SheetBlSearchResult[]
  >([]);
  const [companySearchLoading, setCompanySearchLoading] = React.useState(false);
  const companySearchSeqRef = React.useRef(0);
  /**
   * 검색 입력(-1)에서 ↓로 「선택 안 함」(0)으로 들어간 직후, OS 키 반복이 곧바로 0→1로
   * 진행하는 것을 한 번만 막음(필터 입력 후 ↓가 첫 항목을 건너뛰던 현상).
   */
  const suppressComboArrowDownRepeatAfterLeaveInputRef = React.useRef(false);
  /** 선택 상태에서 첫 타이핑으로 편집 진입했는지 (true면 input 전체선택 금지) */
  const startedByTypingRef = React.useRef(false);
  /** F·J열 숫자 편집 */
  const numericInputRef = React.useRef<HTMLInputElement>(null);
  /** C·E·H·I·K 등 자유 텍스트 — contentEditable */
  const textEditorRef = React.useRef<HTMLDivElement>(null);
  const textEditorInitialRef = React.useRef('');
  const [textEditorKey, setTextEditorKey] = React.useState(0);
  const { data: requestVehicleCodes = [] } =
    useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: sheetStatusCodes = [] } =
    useCodeMastersByGroup('SALES_RESERVATION_SHEET_STATUS');
  const { data: salesGradeCodes = [] } = useCodeMastersByGroup('SALES_GRADE');

  const defaultSheetStatusItems = React.useMemo(
    () => [
      { value: '요청', label: '요청' },
      { value: '예약등록', label: '예약등록' },
      { value: '판매등록', label: '판매등록' },
      { value: '배차등록', label: '배차등록' },
      { value: '하차완료', label: '하차완료' },
      { value: '하역확인', label: '하역확인' },
    ],
    [],
  );

  const requestVehicleLabelMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of requestVehicleCodes) {
      const v = (c.value || c.name || '').trim();
      if (v) m.set(v, (c.name || c.value || v).trim());
    }
    return m;
  }, [requestVehicleCodes]);
  const salesGradeLabelMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of salesGradeCodes) {
      const v = (c.value || '').trim();
      if (v) m.set(v, (c.name || c.value || v).trim());
    }
    return m;
  }, [salesGradeCodes]);
  const allSalesGradeSelectBase = React.useMemo(() => {
    return (salesGradeCodes ?? [])
      .map((code) => {
        const v = (code.value || '').trim();
        const n = (code.name || code.value || '').trim();
        return v ? { value: v, label: n || v } : null;
      })
      .filter((x): x is { value: string; label: string } => x != null);
  }, [salesGradeCodes]);
  const cellsRef = React.useRef(cells);
  cellsRef.current = cells;
  const rowCountRef = React.useRef(rowCount);
  rowCountRef.current = rowCount;
  /** 상품 필터 적용 중에도 삽입된 빈 행(A열 미선택)을 잠시 표시 */
  const productFilterBypassRowsRef = React.useRef(new Set<number>());
  const [productFilterBypassEpoch, setProductFilterBypassEpoch] =
    React.useState(0);
  const bumpProductFilterBypass = React.useCallback(() => {
    setProductFilterBypassEpoch((e) => e + 1);
  }, []);
  const editingRef = React.useRef(editing);
  editingRef.current = editing;
  /** 저장 API 진행 중인 행 — 원격 병합으로 덮어쓰지 않음 */
  const pendingPersistRowsRef = React.useRef(new Set<number>());
  /** 행별: 이 시각까지 서버 셀 맵 병합 시 해당 행 스킵 */
  const remoteRowMergeSuppressUntilRef = React.useRef<Map<number, number>>(
    new Map(),
  );
  const onPersistRowRef = React.useRef(onPersistRow);
  onPersistRowRef.current = onPersistRow;
  /** undo/redo 등으로 대기 중인 로컬 저장을 무효화할 때 증가 */
  const persistGenRef = React.useRef(0);
  const persistDebounceByRowRef = React.useRef<Map<number, number>>(new Map());
  const persistLatestValsByRowRef = React.useRef<Map<number, string[]>>(
    new Map(),
  );
  type PersistQueueJob = { row: number; vals: string[]; gen: number };
  const persistQueueRef = React.useRef<PersistQueueJob[]>([]);
  const persistInFlightCountRef = React.useRef(0);
  const persistInFlightRowsRef = React.useRef(new Set<number>());

  const releasePersistPendingIfIdle = React.useCallback((row: number) => {
    if (persistDebounceByRowRef.current.has(row)) return;
    if (persistQueueRef.current.some((j) => j.row === row)) return;
    if (persistInFlightRowsRef.current.has(row)) return;
    pendingPersistRowsRef.current.delete(row);
  }, []);

  const runPersistQueueDrain = React.useCallback(() => {
    const onP = onPersistRowRef.current;
    if (!onP) return;
    while (
      persistInFlightCountRef.current < MAX_CONCURRENT_PERSIST_ROWS &&
      persistQueueRef.current.length > 0
    ) {
      const job = persistQueueRef.current.shift()!;
      persistInFlightCountRef.current += 1;
      persistInFlightRowsRef.current.add(job.row);
      void (async () => {
        try {
          if (job.gen === persistGenRef.current) {
            await onP(job.row, job.vals);
          }
        } finally {
          persistInFlightCountRef.current -= 1;
          persistInFlightRowsRef.current.delete(job.row);
          if (job.gen === persistGenRef.current) {
            const until = Date.now() + REMOTE_MERGE_SUPPRESS_MS_AFTER_PERSIST;
            const m = remoteRowMergeSuppressUntilRef.current;
            const cur = m.get(job.row);
            if (cur == null || until > cur) m.set(job.row, until);
          }
          releasePersistPendingIfIdle(job.row);
          runPersistQueueDrain();
        }
      })();
    }
  }, [releasePersistPendingIfIdle]);

  const enqueuePersistJob = React.useCallback(
    (job: PersistQueueJob) => {
      const q = persistQueueRef.current;
      const i = q.findIndex((j) => j.row === job.row);
      if (i >= 0) q[i] = job;
      else q.push(job);
      runPersistQueueDrain();
    },
    [runPersistQueueDrain],
  );

  const flushDebouncedPersistsNow = React.useCallback(() => {
    for (const t of persistDebounceByRowRef.current.values()) {
      clearTimeout(t);
    }
    persistDebounceByRowRef.current.clear();
    const latest = persistLatestValsByRowRef.current;
    const gen = persistGenRef.current;
    for (const [row, vals] of [...latest.entries()]) {
      latest.delete(row);
      enqueuePersistJob({ row, vals, gen });
    }
  }, [enqueuePersistJob]);

  const invalidatePendingPersists = React.useCallback(() => {
    persistGenRef.current += 1;
    for (const t of persistDebounceByRowRef.current.values()) {
      clearTimeout(t);
    }
    persistDebounceByRowRef.current.clear();
    persistLatestValsByRowRef.current.clear();
    persistQueueRef.current.length = 0;
    for (const row of [...pendingPersistRowsRef.current]) {
      if (!persistInFlightRowsRef.current.has(row)) {
        pendingPersistRowsRef.current.delete(row);
      }
    }
  }, []);
  const undoStackRef = React.useRef<Record<string, string>[]>([]);
  const redoStackRef = React.useRef<Record<string, string>[]>([]);
  /** 직전 클릭 셀 — 같은 셀 두 번 클릭 시 편집 진입 */
  const prevClickRef = React.useRef<CellPos | null>(null);
  const dragActiveRef = React.useRef(false);
  /** true: 행 번호(th)에서 눌러 구글 시트처럼 행 단위 드래그 선택 중 */
  const rowHeaderDragRef = React.useRef(false);
  const columnSizingRef = React.useRef<Record<string, number>>(columnSizing ?? {});
  React.useEffect(() => {
    columnSizingRef.current = columnSizing ?? {};
  }, [columnSizing]);

  /**
   * 구글 스프레드시트처럼: 드래그 중에는 열 너비(colgroup/td)를 바꾸지 않고
   * 세로 가이드만 DOM으로 이동 → 레이아웃·전체 그리드 리렌더 없음.
   * 확정은 pointerup 때만 onColumnSizingChange.
   */
  const columnResizeGuideRef = React.useRef<HTMLDivElement | null>(null);
  /** dom: th 실측 오른쪽 기준(DataTable과 동일). sum: 너비 누적 fallback */
  const columnResizeSessionRef = React.useRef<{
    anchor: 'dom' | 'sum';
    startW: number;
    startRightInParent?: number;
    leftEdgePx?: number;
  } | null>(null);
  const columnResizeRafRef = React.useRef<number | null>(null);
  const columnResizePendingWRef = React.useRef<number | null>(null);

  const sheetColWidths = React.useMemo(
    () =>
      Array.from({ length: COL_COUNT }, (_, c) => {
        const id = SHEET_COLUMN_IDS[c]!;
        const w = columnSizing?.[id];
        const def = DEFAULT_SHEET_COL_WIDTHS[c]!;
        return typeof w === 'number' && w > 0 ? w : def;
      }),
    [columnSizing],
  );

  const onColumnResizePointerDown = React.useCallback(
    (colIndex: number) => (e: React.PointerEvent) => {
      if (!onColumnSizingChange) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const colId = SHEET_COLUMN_IDS[colIndex]!;
      const startX = e.clientX;
      const baseWidths = Array.from({ length: COL_COUNT }, (_, c) => {
        const id = SHEET_COLUMN_IDS[c]!;
        const w = columnSizingRef.current[id];
        const def = DEFAULT_SHEET_COL_WIDTHS[c]!;
        return typeof w === 'number' && w > 0 ? w : def;
      });
      const startW = baseWidths[colIndex]!;
      const minW = MIN_SHEET_COL_WIDTHS[colIndex]!;

      const guide = columnResizeGuideRef.current;
      const parentEl = guide?.offsetParent;
      const thEl = (e.currentTarget as HTMLElement | null)?.closest?.('th');
      let session: NonNullable<(typeof columnResizeSessionRef)['current']>;

      if (
        guide &&
        parentEl instanceof HTMLElement &&
        thEl instanceof HTMLTableCellElement
      ) {
        const pr = parentEl.getBoundingClientRect();
        const tr = thEl.getBoundingClientRect();
        session = {
          anchor: 'dom',
          startW,
          startRightInParent: tr.right - pr.left,
        };
      } else {
        const leftEdgePx = getSheetDataColumnLeftEdgePx(
          colIndex,
          baseWidths,
          VISIBLE_SHEET_COL_ORDER,
        );
        session = { anchor: 'sum', startW, leftEdgePx };
      }
      columnResizeSessionRef.current = session;

      if (guide) {
        guide.style.visibility = 'visible';
        if (session.anchor === 'dom' && session.startRightInParent != null) {
          guide.style.left = `${session.startRightInParent - 1}px`;
        } else if (session.leftEdgePx != null) {
          guide.style.left = `${session.leftEdgePx + startW - 1}px`;
        }
      }

      const flushGuideFrame = () => {
        columnResizeRafRef.current = null;
        const pw = columnResizePendingWRef.current;
        const g = columnResizeGuideRef.current;
        const sess = columnResizeSessionRef.current;
        if (g && sess != null && pw != null) {
          if (sess.anchor === 'dom' && sess.startRightInParent != null) {
            g.style.left = `${sess.startRightInParent + (pw - sess.startW) - 1}px`;
          } else if (sess.leftEdgePx != null) {
            g.style.left = `${sess.leftEdgePx + pw - 1}px`;
          }
        }
      };

      const onMove = (pe: PointerEvent) => {
        const dw = pe.clientX - startX;
        const next = Math.round(
          Math.max(minW, Math.min(SHEET_MAX_COL_WIDTH, startW + dw)),
        );
        columnResizePendingWRef.current = next;
        if (columnResizeRafRef.current == null) {
          columnResizeRafRef.current = requestAnimationFrame(flushGuideFrame);
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (columnResizeRafRef.current != null) {
          cancelAnimationFrame(columnResizeRafRef.current);
          columnResizeRafRef.current = null;
        }
        const finalW =
          columnResizePendingWRef.current != null
            ? columnResizePendingWRef.current
            : startW;
        columnResizePendingWRef.current = null;
        columnResizeSessionRef.current = null;
        const g = columnResizeGuideRef.current;
        if (g) {
          g.style.visibility = 'hidden';
        }
        onColumnSizingChange({
          ...columnSizingRef.current,
          [colId]: finalW,
        });
      };
      columnResizePendingWRef.current = startW;
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [onColumnSizingChange],
  );
  const dragMovedRef = React.useRef(false);
  /** 드래그 직후 발생하는 click으로 범위가 무너지지 않게 함 */
  const suppressNextClickRef = React.useRef(false);

  React.useEffect(() => {
    if (!editing || editing.col !== 0) {
      setFirstColSearchTerm('');
      setFirstColSearchDirty(false);
      setFirstColActiveIndex(SHEET_COMBO_INPUT_MODE);
    }
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_STATUS) {
      setStatusSearchTerm('');
      setStatusSearchDirty(false);
      setStatusActiveIndex(SHEET_COMBO_INPUT_MODE);
    }
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_SALES_GRADE) {
      setSalesGradeSearchTerm('');
      setSalesGradeSearchDirty(false);
      setSalesGradeActiveIndex(SHEET_COMBO_INPUT_MODE);
    }
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_BL) {
      setBlSearchTerm('');
      setBlSearchDirty(false);
      setBlActiveIndex(SHEET_COMBO_INPUT_MODE);
    }
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_VEHICLE) {
      setVehicleSearchTerm('');
      setVehicleSearchDirty(false);
      setVehicleActiveIndex(SHEET_COMBO_INPUT_MODE);
    }
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_COMPANY) {
      setCompanySearchTerm('');
      setCompanySearchDirty(false);
      setCompanySearchResults([]);
      setCompanySearchLoading(false);
      setCompanyActiveIndex(SHEET_COMBO_INPUT_MODE);
    }
  }, [editing]);

  React.useEffect(() => {
    const maxIndex = companySearchResults.length;
    setCompanyActiveIndex((prev) => {
      if (prev < SHEET_COMBO_INPUT_MODE) return SHEET_COMBO_INPUT_MODE;
      if (prev > maxIndex) return maxIndex;
      return prev;
    });
  }, [companySearchResults]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_COMPANY) return;
    if (!companySearchDirty) {
      setCompanySearchResults([]);
      setCompanySearchLoading(false);
      return;
    }
    const q = companySearchTerm.trim();
    if (q.length < 2) {
      setCompanySearchResults([]);
      setCompanySearchLoading(false);
      return;
    }
    setCompanySearchLoading(true);
    const seq = ++companySearchSeqRef.current;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          // BK/BL/계약번호 검색 지원 (백엔드 listTradeOrders search)
          const { data } = await api.get<any[]>('/trade/contracts/orders', {
            params: { bookingOnly: true, search: q },
          });
          if (seq !== companySearchSeqRef.current) return;
          const list = Array.isArray(data) ? data : [];
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.info('[quotation-sheet] BL search:', q, 'results:', list.length);
          }
          const mapped: SheetBlSearchResult[] = list
            .filter((o) => {
              const bl = String(o?.bl ?? '').trim();
              const bk = String(o?.bk ?? '').trim();
              return bl !== '' || bk !== '';
            })
            .slice(0, 50)
            .map((o) => ({
              id: String(o?.id ?? ''),
              bl: String(o?.bl ?? '').trim(),
              bk: String(o?.bk ?? '').trim() || null,
              etaDate: o?.etaDate ?? null,
              salesStatus: o?.salesStatus ?? null,
              currency: o?.currency ?? null,
              currencyName: o?.currencyName ?? null,
              unitPrice: typeof o?.unitPrice === 'number' ? o.unitPrice : o?.unitPrice != null ? Number(o.unitPrice) : null,
              exportCountryName: o?.exportCountryName ?? null,
              productName: o?.productName ?? null,
              grade: o?.grade ?? null,
              packing: o?.packing ?? null,
              notes: o?.notes ?? null,
              salesNotes: o?.salesNotes ?? null,
            }))
            .filter((x) => x.id && sheetBookingSearchStoredValue(x) !== '');
          setCompanySearchResults(mapped);
        } catch (e: unknown) {
          if (seq !== companySearchSeqRef.current) return;
          setCompanySearchResults([]);
          const ax = e as { response?: { status?: number; data?: { message?: unknown } } };
          const msg = ax?.response?.data?.message;
          const status = ax?.response?.status;
          toast({
            title: 'BL/BK 검색 실패',
            description:
              (typeof msg === 'string' && msg) ||
              (status ? `서버 응답 ${status}` : '네트워크 오류가 발생했습니다.'),
            variant: 'destructive',
          });
        } finally {
          if (seq === companySearchSeqRef.current) {
            setCompanySearchLoading(false);
          }
        }
      })();
    }, 200);
    return () => window.clearTimeout(t);
  }, [companySearchTerm, companySearchDirty, editing]);

  // 견적서는 첫 번째 열(상품 select) 기능을 사용하지 않음.

  React.useEffect(() => {
    if (!editing || editing.col !== COL_STATUS) return;
    const t = window.setTimeout(() => {
      const el = statusSearchInputRef.current;
      if (!el) return;
      el.focus();
      if (startedByTypingRef.current) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.select();
      }
      startedByTypingRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_SALES_GRADE) return;
    const t = window.setTimeout(() => {
      const el = salesGradeSearchInputRef.current;
      if (!el) return;
      el.focus();
      if (startedByTypingRef.current) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.select();
      }
      startedByTypingRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_BL) return;
    const t = window.setTimeout(() => {
      const el = blSearchInputRef.current;
      if (!el) return;
      el.focus();
      if (startedByTypingRef.current) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.select();
      }
      startedByTypingRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_VEHICLE) return;
    const t = window.setTimeout(() => {
      const el = vehicleSearchInputRef.current;
      if (!el) return;
      el.focus();
      if (startedByTypingRef.current) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.select();
      }
      startedByTypingRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  React.useEffect(() => {
    if (!editing || editing.col !== COL_COMPANY) return;
    const t = window.setTimeout(() => {
      const el = companySearchInputRef.current;
      if (!el) return;
      el.focus();
      if (startedByTypingRef.current) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.select();
      }
      startedByTypingRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  /**
   * 서버 폴링 결과 병합 — 편집 중인 행·저장 중인 행은 건드리지 않음.
   * `editing`을 의존성에 넣지 않음: 포커스만 바뀔 때 전체 remote 스냅샷을 다시 덮어쓰면
   * 직전 행의 select 값이 stale remote로 되돌아가는 문제가 생김.
   * 건너뛸 행은 매 렌더에서 갱신되는 `editingRef.current`로만 읽는다.
   */
  React.useEffect(() => {
    if (remoteCells == null) return;
    setCells((prev) => {
      const skipRow = editingRef.current?.row ?? null;
      const next = { ...prev };
      for (const [k, v] of Object.entries(remoteCells)) {
        const rowNum = parseInt(k.split(',')[0] ?? '', 10);
        if (Number.isNaN(rowNum)) continue;
        if (skipRow !== null && skipRow === rowNum) continue;
        if (pendingPersistRowsRef.current.has(rowNum)) continue;
        const suppressUntil =
          remoteRowMergeSuppressUntilRef.current.get(rowNum);
        if (suppressUntil != null) {
          if (Date.now() < suppressUntil) continue;
          remoteRowMergeSuppressUntilRef.current.delete(rowNum);
        }
        next[k] = v;
      }
      return next;
    });
  }, [remoteCells, remoteVersion]);

  const schedulePersistRow = React.useCallback(
    (row: number, vals: string[]) => {
      if (!onPersistRowRef.current) return;
      /** 원격 병합이 디바운스 구간·저장 큐 동안 로컬 값을 덮지 않도록 */
      pendingPersistRowsRef.current.add(row);
      persistLatestValsByRowRef.current.set(row, vals);
      const scheduledGen = persistGenRef.current;
      const prevTimer = persistDebounceByRowRef.current.get(row);
      if (prevTimer != null) clearTimeout(prevTimer);
      const id = window.setTimeout(() => {
        persistDebounceByRowRef.current.delete(row);
        if (scheduledGen !== persistGenRef.current) {
          releasePersistPendingIfIdle(row);
          return;
        }
        const v = persistLatestValsByRowRef.current.get(row);
        persistLatestValsByRowRef.current.delete(row);
        if (!v) {
          releasePersistPendingIfIdle(row);
          return;
        }
        enqueuePersistJob({ row, vals: v, gen: scheduledGen });
      }, PERSIST_ROW_DEBOUNCE_MS);
      persistDebounceByRowRef.current.set(row, id);
    },
    [enqueuePersistJob, releasePersistPendingIfIdle],
  );

  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        flushDebouncedPersistsNow();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      flushDebouncedPersistsNow();
    };
  }, [flushDebouncedPersistsNow]);

  const setCellsWithHistory = React.useCallback(
    (updater: React.SetStateAction<Record<string, string>>) => {
      setCells((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (p: Record<string, string>) => Record<string, string>)(
                prev,
              )
            : updater;
        if (cellsEqual(prev, next)) return prev;
        undoStackRef.current.push(snapshotCells(prev));
        if (undoStackRef.current.length > MAX_UNDO_STACK) {
          undoStackRef.current.shift();
        }
        redoStackRef.current = [];
        return next;
      });
    },
    [],
  );

  const anchorFocusRef = React.useRef({ anchor, focus });
  React.useEffect(() => {
    anchorFocusRef.current = { anchor, focus };
  }, [anchor, focus]);

  const firstColumnProductOptionsRef = React.useRef(firstColumnProductOptions);
  React.useEffect(() => {
    firstColumnProductOptionsRef.current = firstColumnProductOptions;
  }, [firstColumnProductOptions]);

  const blOptionsByProductCodeRef = React.useRef(mergedBlOptionsByProductCode);
  React.useEffect(() => {
    blOptionsByProductCodeRef.current = mergedBlOptionsByProductCode;
  }, [mergedBlOptionsByProductCode]);
  const salesGradeOptionsByProductCodeRef = React.useRef(
    salesGradeOptionsByProductCode,
  );
  React.useEffect(() => {
    salesGradeOptionsByProductCodeRef.current = salesGradeOptionsByProductCode;
  }, [salesGradeOptionsByProductCode]);

  const foreignCellLocksRef = React.useRef(foreignCellLocks);
  React.useEffect(() => {
    foreignCellLocksRef.current = foreignCellLocks;
  }, [foreignCellLocks]);

  const requestVehicleCodesRef = React.useRef(requestVehicleCodes);
  React.useEffect(() => {
    requestVehicleCodesRef.current = requestVehicleCodes;
  }, [requestVehicleCodes]);
  const sheetStatusCodesRef = React.useRef(sheetStatusCodes);
  React.useEffect(() => {
    sheetStatusCodesRef.current = sheetStatusCodes;
  }, [sheetStatusCodes]);
  const salesGradeCodesRef = React.useRef(salesGradeCodes);
  React.useEffect(() => {
    salesGradeCodesRef.current = salesGradeCodes;
  }, [salesGradeCodes]);

  const copySelectionToClipboard = React.useCallback(() => {
    const { anchor: a, focus: f } = anchorFocusRef.current;
    const r0 = Math.min(a.row, f.row);
    const r1 = Math.max(a.row, f.row);
    const c0 = Math.min(a.col, f.col);
    const c1 = Math.max(a.col, f.col);
    const tsv = buildCopyTsv(cellsRef.current, r0, r1, c0, c1);
    void navigator.clipboard.writeText(tsv).catch(() => {
      toast({
        title: '복사하지 못했습니다',
        description: '클립보드 접근이 차단되었을 수 있습니다.',
        variant: 'destructive',
      });
    });
  }, []);

  const pasteFromClipboard = React.useCallback(() => {
    void navigator.clipboard.readText().then((text) => {
      const matrix = parseClipboardTsv(text);
      if (matrix.length === 0) return;

      const { anchor: a, focus: f } = anchorFocusRef.current;
      const r0 = Math.min(a.row, f.row);
      const c0 = Math.min(a.col, f.col);
      const requiredRowsForPaste = r0 + matrix.length;
      const rowLimit =
        requiredRowsForPaste > rowCount
          ? getExpandedRowCount(requiredRowsForPaste)
          : rowCount;
      if (rowLimit > rowCount) {
        setRowCount(rowLimit);
      }

      setCellsWithHistory((prev) => {
        const locks = foreignCellLocksRef.current;
        const products = firstColumnProductOptionsRef.current;
        const blByProduct = blOptionsByProductCodeRef.current;
        const vehicles = requestVehicleCodesRef.current;

        const fullGradeOpts = salesGradeCodesRef.current
          .map((code) => {
            const v = (code.value || '').trim();
            const n = (code.name || code.value || '').trim();
            return v ? { value: v, label: n || v } : null;
          })
          .filter((x): x is { value: string; label: string } => x != null);

        const next: Record<string, string> = { ...prev };
        let skippedInvalid = 0;
        let skippedLock = 0;
        let pasteProductBypassTouched = false;

        for (let i = 0; i < matrix.length; i++) {
          const r = r0 + i;
          if (r >= rowLimit) break;
          const rowVals = matrix[i];
          if (!rowVals) continue;

          let rowDirty = false;

          for (let j = 0; j < rowVals.length; j++) {
            const c = c0 + j;
            if (c >= COL_COUNT) break;
            const key = cellKey(r, c);
            if (locks?.[key]) {
              skippedLock++;
              continue;
            }

            const raw = rowVals[j] ?? '';

            if (c === 0) {
              const normalized = normalizeProductForPaste(raw, products);
              if (normalized === null) {
                skippedInvalid++;
                continue;
              }
              const prevP = (next[cellKey(r, 0)] ?? '').trim();
              next[key] = normalized;
              if (prevP !== normalized.trim()) {
                next[cellKey(r, COL_BL)] = '';
                next[cellKey(r, COL_SALES_GRADE)] = '';
              }
              if (
                normalized.trim() !== '' &&
                productFilterBypassRowsRef.current.delete(r)
              ) {
                pasteProductBypassTouched = true;
              }
              rowDirty = true;
            } else if (c === COL_BL) {
              const p = (next[cellKey(r, 0)] ?? '').trim();
              const grade = (next[cellKey(r, COL_SALES_GRADE)] ?? '').trim();
              const blList = p
                ? (blByProduct[sheetBlCompositeKey(p, grade)] ?? [])
                : [];
              const normalized = normalizeBlForPaste(raw, blList);
              if (normalized === null && raw.trim() !== '') {
                skippedInvalid++;
                continue;
              }
              next[key] = normalized ?? '';
              rowDirty = true;
            } else if (isQuotationReadonlySheetColumn(c)) {
              // 견적서: ETA~원가·판매가는 자동/BL 연동 — 붙여넣기 무시
              continue;
            } else if (c === COL_VEHICLE) {
              const normalized = normalizeVehicleForPaste(raw, vehicles);
              if (normalized === null && raw.trim() !== '') {
                skippedInvalid++;
                continue;
              }
              const veh = normalized ?? '';
              next[key] = veh;
              applyRequestedQtyFromVehicleSelection(next, r, veh);
              rowDirty = true;
            } else if (c === COL_STATUS) {
              const statusFromCodes = (
                sheetStatusCodesRef.current.length > 0
                  ? sheetStatusCodesRef.current.map((code) => {
                      const v = (code.value || '').trim();
                      const n = (code.name || code.value || '').trim();
                      return v ? { value: v, label: n || v } : null;
                    })
                  : defaultSheetStatusItems
              ).filter((x): x is { value: string; label: string } => x != null);
              const normalized = normalizeStatusForPaste(raw, statusFromCodes);
              if (normalized === null && raw.trim() !== '') {
                skippedInvalid++;
                continue;
              }
              next[key] = normalized ?? '';
              rowDirty = true;
            } else if (c === COL_SALES_GRADE) {
              const p = (next[cellKey(r, 0)] ?? '').trim();
              const allowed = salesGradeAllowedListForProduct(
                p,
                salesGradeOptionsByProductCodeRef.current,
                fullGradeOpts,
              );
              const normalized = normalizeStatusForPaste(raw, allowed);
              if (normalized === null && raw.trim() !== '') {
                skippedInvalid++;
                continue;
              }
              next[key] = normalized ?? '';
              const blAllowed = p
                ? (blByProduct[
                    sheetBlCompositeKey(p, normalized ?? '')
                  ] ?? [])
                : [];
              const curBl = (next[cellKey(r, COL_BL)] ?? '').trim();
              if (
                blAllowed.length > 0 &&
                curBl &&
                !blAllowed.some((o) => o.value === curBl)
              ) {
                next[cellKey(r, COL_BL)] = '';
              }
              rowDirty = true;
            } else if (isSheetNumericColumn(c)) {
              next[key] = sanitizeSheetNumericInput(
                raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
              );
              rowDirty = true;
            } else {
              next[key] = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
              rowDirty = true;
            }
          }

          if (rowDirty) {
            schedulePersistRow(r, extractRowStrings(next, r));
          }
        }

        if (pasteProductBypassTouched) {
          queueMicrotask(() => bumpProductFilterBypass());
        }

        if (skippedInvalid > 0 || skippedLock > 0) {
          queueMicrotask(() => {
            toast({
              title: '붙여넣기 일부 건너뜀',
              description: [
                skippedLock > 0
                  ? `다른 사용자가 편집 중인 셀 ${skippedLock}칸은 건너뛰었습니다.`
                  : '',
                skippedInvalid > 0
                  ? `목록에 없는 상품·BL·차량 등 ${skippedInvalid}칸은 반영하지 않았습니다.`
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
            });
          });
        }

        return next;
      });
    }).catch(() => {
      toast({
        title: '붙여넣기하지 못했습니다',
        description: '클립보드 읽기 권한을 확인해 주세요.',
        variant: 'destructive',
      });
    });
  }, [rowCount, setCellsWithHistory, schedulePersistRow, bumpProductFilterBypass]);

  const handleUndo = React.useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    invalidatePendingPersists();
    const previous = undoStackRef.current.pop()!;
    redoStackRef.current.push(snapshotCells(cellsRef.current));
    const ed = editingRef.current;
    setCells(previous);
    setEditing(null);
    if (ed) onAfterEdit?.(ed.row, ed.col);
  }, [invalidatePendingPersists, onAfterEdit]);

  const handleRedo = React.useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    invalidatePendingPersists();
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(snapshotCells(cellsRef.current));
    const ed = editingRef.current;
    setCells(next);
    setEditing(null);
    if (ed) onAfterEdit?.(ed.row, ed.col);
  }, [invalidatePendingPersists, onAfterEdit]);

  const getValue = React.useCallback(
    (row: number, col: number) => cells[cellKey(row, col)] ?? '',
    [cells],
  );

  const commitEdit = React.useCallback(() => {
    if (!editing) return;
    const { row, col } = editing;
    let cellValue: string;
    const d = draftRef.current;
    if (
      col === COL_BL ||
      col === COL_STATUS ||
      col === COL_SALES_GRADE
    ) {
      cellValue = d === FIRST_COL_EMPTY ? '' : d;
    } else if (col === COL_COMPANY) {
      // BL 검색/선택: 선택된 BL은 다른 컬럼도 함께 채움
      const pick =
        companyActiveIndex > 0
          ? companySearchResults[companyActiveIndex - 1]
          : null;
      cellValue = pick
        ? sheetBookingSearchStoredValue(pick)
        : d.trim();
    } else if (col === COL_VEHICLE) {
      cellValue =
        d === FIRST_COL_EMPTY
          ? ''
          : d.startsWith('__legacy__:')
            ? d.slice('__legacy__:'.length)
            : d;
    } else if (isSheetNumericColumn(col)) {
      cellValue = d;
    } else {
      const el = textEditorRef.current;
      cellValue = el
        ? el.innerText.replace(/\r\n|\n|\r/g, '')
        : d;
    }
    setCellsWithHistory((prev) => {
      const next: Record<string, string> = {
        ...prev,
        [cellKey(row, col)]: cellValue,
      };
      if (col === COL_COMPANY) {
        const pick =
          companyActiveIndex > 0
            ? companySearchResults[companyActiveIndex - 1]
            : null;
        if (pick) {
          next[cellKey(row, 1)] = pick.etaDate ?? '';
          next[cellKey(row, 2)] = (pick.currencyName ?? pick.currency ?? '').trim();
          next[cellKey(row, 3)] =
            pick.unitPrice != null && Number.isFinite(pick.unitPrice)
              ? String(pick.unitPrice)
              : '';
          next[cellKey(row, 4)] = pick.exportCountryName ?? '';
          next[cellKey(row, 5)] = pick.productName ?? '';
          next[cellKey(row, 6)] = pick.grade ?? '';
          next[cellKey(row, 7)] = pick.packing ?? '';
          next[cellKey(row, 8)] = (pick.salesNotes ?? pick.notes ?? '') || '';
        } else if (cellValue.trim() === '') {
          clearQuotationFieldsFilledFromBlBooking(next, row);
        }
      }
      // 견적서: 0열은 BL 검색 컬럼으로 사용 (상품/등급 리셋 로직 없음)
      if (col === COL_SALES_GRADE) {
        const product = (next[cellKey(row, 0)] ?? '').trim();
        const allowed = product
          ? (blOptionsByProductCodeRef.current[
              sheetBlCompositeKey(product, cellValue)
            ] ?? [])
          : [];
        const curBl = (next[cellKey(row, COL_BL)] ?? '').trim();
        if (
          allowed.length > 0 &&
          curBl &&
          !allowed.some((o) => o.value === curBl)
        ) {
          next[cellKey(row, COL_BL)] = '';
        }
      }
      if (sheetRowStringsChanged(prev, next, row)) {
        schedulePersistRow(row, extractRowStrings(next, row));
      }
      return next;
    });
    // 견적서: 상품 필터 bypass 로직 없음
    onAfterEdit?.(row, col);
    setEditing(null);
  }, [
    editing,
    setCellsWithHistory,
    onAfterEdit,
    onPersistRow,
    schedulePersistRow,
    visibleProductCodes,
    bumpProductFilterBypass,
    companyActiveIndex,
    companySearchResults,
  ]);

  const handleExcelExport = React.useCallback(() => {
    const aoa = quotationBuildExportAoA({
      rowCount: rowCountRef.current,
      getCell: (r, c) => {
        if (c === COL_QUOTE_FX_CALC) {
          return formatQuotationFxCalcStoredValue(
            cellsRef.current[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '',
            cellsRef.current[cellKey(r, COL_QUOTE_CURRENCY)] ?? '',
          );
        }
        if (c === COL_QUOTE_COST) {
          return formatQuotationCostStoredValue(
            cellsRef.current[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '',
            cellsRef.current[cellKey(r, COL_QUOTE_CURRENCY)] ?? '',
            cellsRef.current[cellKey(r, COL_QUOTE_EXPORT_COUNTRY)] ?? '',
          );
        }
        if (c === COL_QUOTE_SELLING) {
          return formatQuotationSellingPriceStoredValue(
            cellsRef.current[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '',
            cellsRef.current[cellKey(r, COL_QUOTE_CURRENCY)] ?? '',
            cellsRef.current[cellKey(r, COL_QUOTE_EXPORT_COUNTRY)] ?? '',
            cellsRef.current[cellKey(r, COL_QUOTE_MARGIN)] ?? '',
          );
        }
        return cellsRef.current[cellKey(r, c)] ?? '';
      },
    });
    const stamp = format(new Date(), 'yyyyMMdd-HHmmss');
    quotationDownloadXlsx(aoa, `견적서-${stamp}.xlsx`);
    toast({
      title: '엑셀 다운로드',
      description: `현재 ${rowCountRef.current}행까지 포함했습니다.`,
    });
  }, []);

  const onExcelImportFileSelected = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
        toast({
          title: '파일 형식 오류',
          description: '.xlsx 또는 .xls 파일만 선택해 주세요.',
          variant: 'destructive',
        });
        return;
      }
      try {
        const ab = await file.arrayBuffer();
        const parsedQuotation = quotationParseImportFromArrayBuffer(ab);
        if (parsedQuotation.ok) {
          excelImportFormatRef.current = 'quotation';
          excelImportRowsRef.current = parsedQuotation.rows;
          setExcelImportRowCount(parsedQuotation.rows.length);
          setExcelImportDialogOpen(true);
          return;
        }
        const parsed = srsParseImportFromArrayBuffer(ab);
        if (!parsed.ok) {
          toast({
            title: '엑셀을 읽을 수 없습니다',
            description: parsed.message,
            variant: 'destructive',
          });
          return;
        }
        excelImportFormatRef.current = 'srs';
        excelImportRowsRef.current = parsed.rows;
        setExcelImportRowCount(parsed.rows.length);
        setExcelImportDialogOpen(true);
      } catch {
        toast({
          title: '파일 읽기 실패',
          description: '파일을 열지 못했습니다.',
          variant: 'destructive',
        });
      }
    },
    [],
  );

  const confirmExcelImport = React.useCallback(() => {
    const rows = excelImportRowsRef.current;
    const importFmt = excelImportFormatRef.current;
    setExcelImportDialogOpen(false);
    if (rows.length === 0 || !onPersistRowRef.current) return;

    if (editingRef.current) {
      commitEdit();
    }
    flushDebouncedPersistsNow();
    productFilterBypassRowsRef.current.clear();
    bumpProductFilterBypass();

    const maxR = rows.reduce((m, x) => Math.max(m, x.rowIndex), 0);
    const rowCap = Math.max(
      rowCountRef.current,
      getExpandedRowCount(maxR + 1 + ROW_EXTEND_THRESHOLD),
    );
    if (rowCap > rowCountRef.current) {
      setRowCount(rowCap);
    }

    if (importFmt === 'quotation') {
      setCellsWithHistory((prev) => {
        const locks = foreignCellLocksRef.current;
        const products = firstColumnProductOptionsRef.current;
        const blByProduct = blOptionsByProductCodeRef.current;

        const gradeFromCodes = salesGradeCodesRef.current
          .map((code) => {
            const v = (code.value || '').trim();
            const n = (code.name || code.value || '').trim();
            return v ? { value: v, label: n || v } : null;
          })
          .filter((x): x is { value: string; label: string } => x != null);

        const next: Record<string, string> = { ...prev };
        let skippedInvalid = 0;
        let skippedLock = 0;

        for (const { rowIndex: r, values: rowVals } of rows) {
          if (r >= rowCap) continue;

          let rowDirty = false;

          const touch = (c: number, raw: string): void => {
            const key = cellKey(r, c);
            if (locks?.[key]) {
              skippedLock++;
              return;
            }
            if (c === 5) {
              const normalized = normalizeProductForPaste(raw, products);
              if (normalized === null) {
                if (raw.trim() !== '') skippedInvalid++;
                return;
              }
              const prevP = (next[cellKey(r, 5)] ?? '').trim();
              next[key] = normalized;
              if (prevP !== normalized.trim()) {
                next[cellKey(r, 0)] = '';
                next[cellKey(r, 6)] = '';
              }
              rowDirty = true;
              return;
            }
            if (c === 6) {
              const p = (next[cellKey(r, 5)] ?? '').trim();
              const allowed = salesGradeAllowedListForProduct(
                p,
                salesGradeOptionsByProductCodeRef.current,
                gradeFromCodes,
              );
              const normalized = normalizeStatusForPaste(raw, allowed);
              if (normalized === null && raw.trim() !== '') {
                skippedInvalid++;
                return;
              }
              next[key] = normalized ?? '';
              const blAllowed = p
                ? (blByProduct[
                    sheetBlCompositeKey(p, normalized ?? '')
                  ] ?? [])
                : [];
              const curBl = (next[cellKey(r, 0)] ?? '').trim();
              if (
                blAllowed.length > 0 &&
                curBl &&
                !blAllowed.some((o) => o.value === curBl)
              ) {
                next[cellKey(r, 0)] = '';
              }
              rowDirty = true;
              return;
            }
            if (c === 7 || c === 8) {
              next[key] = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
              rowDirty = true;
              return;
            }
            if (c === 11) {
              next[key] = sanitizeSheetNumericInput(
                raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
              );
              rowDirty = true;
              return;
            }
            if (c === 0) {
              const p = (next[cellKey(r, 5)] ?? '').trim();
              const grade = (next[cellKey(r, 6)] ?? '').trim();
              const blList = p
                ? (blByProduct[sheetBlCompositeKey(p, grade)] ?? [])
                : [];
              const normalized = normalizeBlForPaste(raw, blList);
              if (normalized === null && raw.trim() !== '') {
                skippedInvalid++;
                return;
              }
              next[key] = normalized ?? '';
              rowDirty = true;
            }
          };

          for (const c of [5, 6, 7, 8, 11, 0] as const) {
            touch(c, rowVals[c] ?? '');
          }

          if (rowDirty) {
            schedulePersistRow(r, extractRowStrings(next, r));
          }
        }

        if (skippedInvalid > 0 || skippedLock > 0) {
          queueMicrotask(() => {
            toast({
              title: '엑셀 복구 중 일부 건너뜀',
              description: [
                skippedLock > 0 ? `편집 잠금 셀 ${skippedLock}칸` : '',
                skippedInvalid > 0 ? `목록에 없는 값 ${skippedInvalid}칸` : '',
              ]
                .filter(Boolean)
                .join(' · '),
            });
          });
        } else {
          queueMicrotask(() => {
            toast({
              title: '엑셀 복구 반영',
              description: `${rows.length}개 행을 반영했습니다.`,
            });
          });
        }

        return next;
      });
      return;
    }

    setCellsWithHistory((prev) => {
      const locks = foreignCellLocksRef.current;
      const products = firstColumnProductOptionsRef.current;
      const blByProduct = blOptionsByProductCodeRef.current;
      const vehicles = requestVehicleCodesRef.current;

      const statusFromCodes = (
        sheetStatusCodesRef.current.length > 0
          ? sheetStatusCodesRef.current.map((code) => {
              const v = (code.value || '').trim();
              const n = (code.name || code.value || '').trim();
              return v ? { value: v, label: n || v } : null;
            })
          : defaultSheetStatusItems
      ).filter((x): x is { value: string; label: string } => x != null);

      const gradeFromCodes = salesGradeCodesRef.current
        .map((code) => {
          const v = (code.value || '').trim();
          const n = (code.name || code.value || '').trim();
          return v ? { value: v, label: n || v } : null;
        })
        .filter((x): x is { value: string; label: string } => x != null);

      const next: Record<string, string> = { ...prev };
      let skippedInvalid = 0;
      let skippedLock = 0;

      for (const { rowIndex: r, values: rowVals } of rows) {
        if (r >= rowCap) continue;

        let rowDirty = false;

        for (let j = 0; j < COL_COUNT; j++) {
          const c = j;
          const raw = rowVals[j] ?? '';
          const key = cellKey(r, c);
          if (locks?.[key]) {
            skippedLock++;
            continue;
          }

          if (isQuotationReadonlySheetColumn(c)) {
            continue;
          }

          if (c === 0) {
            const normalized = normalizeProductForPaste(raw, products);
            if (normalized === null) {
              skippedInvalid++;
              continue;
            }
            const prevP = (next[cellKey(r, 0)] ?? '').trim();
            next[key] = normalized;
            if (prevP !== normalized.trim()) {
              next[cellKey(r, COL_BL)] = '';
              next[cellKey(r, COL_SALES_GRADE)] = '';
            }
            rowDirty = true;
          } else if (c === COL_BL) {
            const p = (next[cellKey(r, 0)] ?? '').trim();
            const grade = (next[cellKey(r, COL_SALES_GRADE)] ?? '').trim();
            const blList = p
              ? (blByProduct[sheetBlCompositeKey(p, grade)] ?? [])
              : [];
            const normalized = normalizeBlForPaste(raw, blList);
            if (normalized === null && raw.trim() !== '') {
              skippedInvalid++;
              continue;
            }
            next[key] = normalized ?? '';
            rowDirty = true;
          } else if (c === COL_VEHICLE) {
            const normalized = normalizeVehicleForPaste(raw, vehicles);
            if (normalized === null && raw.trim() !== '') {
              skippedInvalid++;
              continue;
            }
            const veh = normalized ?? '';
            next[key] = veh;
            applyRequestedQtyFromVehicleSelection(next, r, veh);
            rowDirty = true;
          } else if (c === COL_STATUS) {
            const normalized = normalizeStatusForPaste(raw, statusFromCodes);
            if (normalized === null && raw.trim() !== '') {
              skippedInvalid++;
              continue;
            }
            next[key] = normalized ?? '';
            rowDirty = true;
          } else if (c === COL_SALES_GRADE) {
            const p = (next[cellKey(r, 0)] ?? '').trim();
            const allowed = salesGradeAllowedListForProduct(
              p,
              salesGradeOptionsByProductCodeRef.current,
              gradeFromCodes,
            );
            const normalized = normalizeStatusForPaste(raw, allowed);
            if (normalized === null && raw.trim() !== '') {
              skippedInvalid++;
              continue;
            }
            next[key] = normalized ?? '';
            const blAllowed = p
              ? (blByProduct[
                  sheetBlCompositeKey(p, normalized ?? '')
                ] ?? [])
              : [];
            const curBl = (next[cellKey(r, COL_BL)] ?? '').trim();
            if (
              blAllowed.length > 0 &&
              curBl &&
              !blAllowed.some((o) => o.value === curBl)
            ) {
              next[cellKey(r, COL_BL)] = '';
            }
            rowDirty = true;
          } else if (isSheetNumericColumn(c)) {
            next[key] = sanitizeSheetNumericInput(
              raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
            );
            rowDirty = true;
          } else {
            next[key] = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            rowDirty = true;
          }
        }

        if (rowDirty) {
          schedulePersistRow(r, extractRowStrings(next, r));
        }
      }

      if (skippedInvalid > 0 || skippedLock > 0) {
        queueMicrotask(() => {
          toast({
            title: '엑셀 복구 중 일부 건너뜀',
            description: [
              skippedLock > 0 ? `편집 잠금 셀 ${skippedLock}칸` : '',
              skippedInvalid > 0 ? `목록에 없는 값 ${skippedInvalid}칸` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          });
        });
      } else {
        queueMicrotask(() => {
          toast({
            title: '엑셀 복구 반영',
            description: `${rows.length}개 행을 반영했습니다.`,
          });
        });
      }

      return next;
    });
  }, [
    commitEdit,
    defaultSheetStatusItems,
    flushDebouncedPersistsNow,
    schedulePersistRow,
    setCellsWithHistory,
    bumpProductFilterBypass,
  ]);

  React.useImperativeHandle(
    ref,
    () => ({
      exportExcel: () => handleExcelExport(),
      openExcelImportPicker: () => {
        if (!onPersistRowRef.current) return;
        excelImportFileInputRef.current?.click();
      },
    }),
    [handleExcelExport],
  );

  const deleteSelectedRowsFromContextMenu = React.useCallback(() => {
    setSheetContextMenu(null);
    commitEdit();
    const { anchor: a, focus: f } = anchorFocusRef.current;
    const r0 = Math.min(a.row, f.row);
    const r1 = Math.max(a.row, f.row);
    const deletedCount = r1 - r0 + 1;
    const locks = foreignCellLocksRef.current;
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < COL_COUNT; c++) {
        const lockedBy = locks?.[cellKey(r, c)];
        if (lockedBy) {
          toast({
            title: '행을 삭제할 수 없습니다',
            description: `${lockedBy} 님이 편집 중인 셀이 포함되어 있습니다.`,
            variant: 'destructive',
          });
          return;
        }
      }
    }
    productFilterBypassRowsRef.current = remapProductFilterBypassAfterDelete(
      productFilterBypassRowsRef.current,
      r0,
      r1,
    );
    bumpProductFilterBypass();
    const nextRowCount = Math.max(
      MIN_ROW_COUNT,
      rowCountRef.current - deletedCount,
    );
    setRowCount(nextRowCount);
    const nextFocusCol = nudgeOffHiddenSheetCol(
      anchorFocusRef.current.focus.col,
    );
    const nextFocusRow = Math.max(0, Math.min(r0, nextRowCount - 1));
    setAnchor({ row: nextFocusRow, col: nextFocusCol });
    setFocus({ row: nextFocusRow, col: nextFocusCol });
    setEditing(null);

    setCellsWithHistory((prev) => {
      const oldMax = maxRowInCellMap(prev);
      const next = remapCellsAfterDeletingRowRange(prev, r0, r1);
      const newMax = maxRowInCellMap(next);
      const clearSuppressUntil =
        Date.now() + REMOTE_MERGE_SUPPRESS_MS_ON_RANGE_CLEAR;
      const suppressMap = remoteRowMergeSuppressUntilRef.current;
      const hi = Math.max(oldMax, rowCountRef.current - 1);
      for (let r = 0; r <= hi; r++) {
        const cur = suppressMap.get(r);
        if (cur == null || clearSuppressUntil > cur) {
          suppressMap.set(r, clearSuppressUntil);
        }
      }
      queueMicrotask(() => {
        if (!onPersistRow) return;
        /** r0 미만은 인덱스·내용 동일 — 재저장 생략 */
        for (let r = r0; r <= newMax; r++) {
          schedulePersistRow(r, extractRowStrings(next, r));
        }
        for (let r = newMax + 1; r <= oldMax; r++) {
          schedulePersistRow(r, [...EMPTY_SHEET_ROW_VALUES]);
        }
      });
      return next;
    });
    toast({
      title: '행 삭제됨',
      description: `${deletedCount}개 행을 삭제하고 아래 행을 당겼습니다.`,
    });
  }, [
    commitEdit,
    onPersistRow,
    schedulePersistRow,
    setCellsWithHistory,
    bumpProductFilterBypass,
  ]);

  const insertRowsAtFromContextMenu = React.useCallback(
    (insertAt: number, count: number, focusRow: number) => {
      setSheetContextMenu(null);
      commitEdit();
      const locks = foreignCellLocksRef.current;
      const rc = rowCountRef.current;
      for (let r = insertAt; r < rc; r++) {
        for (let c = 0; c < COL_COUNT; c++) {
          const lockedBy = locks?.[cellKey(r, c)];
          if (lockedBy) {
            toast({
              title: '행을 삽입할 수 없습니다',
              description: `${lockedBy} 님이 편집 중인 셀이 포함되어 있습니다.`,
              variant: 'destructive',
            });
            return;
          }
        }
      }
      productFilterBypassRowsRef.current = remapProductFilterBypassAfterInsert(
        productFilterBypassRowsRef.current,
        insertAt,
        count,
      );
      bumpProductFilterBypass();
      const nextRowCount = rc + count;
      const focusCol = nudgeOffHiddenSheetCol(0);
      setRowCount(nextRowCount);
      setAnchor({ row: focusRow, col: focusCol });
      setFocus({ row: focusRow, col: focusCol });
      setEditing(null);

      setCellsWithHistory((prev) => {
        const next = remapCellsAfterInsertingRowsAt(prev, insertAt, count);
        const newMax = maxRowInCellMap(next);
        const clearSuppressUntil =
          Date.now() + REMOTE_MERGE_SUPPRESS_MS_ON_RANGE_CLEAR;
        const suppressMap = remoteRowMergeSuppressUntilRef.current;
        const hi = Math.max(newMax, nextRowCount - 1);
        for (let r = 0; r <= hi; r++) {
          const cur = suppressMap.get(r);
          if (cur == null || clearSuppressUntil > cur) {
            suppressMap.set(r, clearSuppressUntil);
          }
        }
        const nr = nextRowCount;
        queueMicrotask(() => {
          if (!onPersistRow) return;
          for (let r = insertAt; r < nr; r++) {
            schedulePersistRow(r, extractRowStrings(next, r));
          }
        });
        return next;
      });
      toast({
        title: '행 삽입됨',
        description: `${count}개 행을 삽입했습니다.`,
      });
    },
    [
      commitEdit,
      onPersistRow,
      schedulePersistRow,
      setCellsWithHistory,
      bumpProductFilterBypass,
    ],
  );

  const clearSelectedRowsDataFromContextMenu = React.useCallback(() => {
    setSheetContextMenu(null);
    commitEdit();
    const { anchor: a, focus: f } = anchorFocusRef.current;
    const r0 = Math.min(a.row, f.row);
    const r1 = Math.max(a.row, f.row);
    const locks = foreignCellLocksRef.current;
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < COL_COUNT; c++) {
        const lockedBy = locks?.[cellKey(r, c)];
        if (lockedBy) {
          toast({
            title: '데이터를 지울 수 없습니다',
            description: `${lockedBy} 님이 편집 중인 셀이 포함되어 있습니다.`,
            variant: 'destructive',
          });
          return;
        }
      }
    }
    setCellsWithHistory((prev) => {
      const next: Record<string, string> = { ...prev };
      for (let r = r0; r <= r1; r++) {
        for (let c = 0; c < COL_COUNT; c++) {
          next[cellKey(r, c)] = '';
        }
        applyRequestedQtyFromVehicleSelection(
          next,
          r,
          next[cellKey(r, COL_VEHICLE)] ?? '',
        );
      }
      queueMicrotask(() => {
        if (!onPersistRow) return;
        for (let r = r0; r <= r1; r++) {
          schedulePersistRow(r, extractRowStrings(next, r));
        }
      });
      return next;
    });
    toast({
      title: '행 데이터 삭제됨',
      description: `${r1 - r0 + 1}개 행의 내용을 비웠습니다.`,
    });
  }, [commitEdit, onPersistRow, schedulePersistRow, setCellsWithHistory]);

  const onRowHeaderContextMenu = React.useCallback(
    (row: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (editing) {
        commitEdit();
      }
      const { anchor: a, focus: f } = anchorFocusRef.current;
      const r0 = Math.min(a.row, f.row);
      const r1 = Math.max(a.row, f.row);
      const preserveSelection =
        isFullRowSelection(a, f) && row >= r0 && row <= r1;
      if (!preserveSelection) {
        setAnchor({ row, col: 0 });
        setFocus({ row, col: MAX_VISIBLE_SHEET_COL });
      }
      setEditing(null);
      setSheetContextMenu({
        x: e.clientX,
        y: e.clientY,
        variant: 'row-header',
        rowIndex: row,
      });
    },
    [editing, commitEdit],
  );

  React.useEffect(() => {
    if (!sheetContextMenu) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setSheetContextMenu(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetContextMenu]);

  const cancelEdit = React.useCallback(() => {
    if (editing) {
      const raw = getValue(editing.row, editing.col);
      setDraft(
        editing.col === COL_BL ||
          editing.col === COL_STATUS ||
          editing.col === COL_SALES_GRADE
          ? storedToSelectValue(raw)
          : editing.col === COL_VEHICLE
            ? vehicleDraftFromStored(raw, requestVehicleCodes)
            : raw,
      );
      if (editing.col === COL_COMPANY) {
        setCompanySearchTerm('');
        setCompanySearchResults([]);
      }
      onAfterEdit?.(editing.row, editing.col);
    }
    setEditing(null);
  }, [editing, getValue, requestVehicleCodes, onAfterEdit]);

  type StartEditOptions = { replaceEntireCell?: boolean };

  const startEdit = React.useCallback(
    (
      row: number,
      col: number,
      initialChar?: string,
      opts?: StartEditOptions,
    ) => {
      const replaceEntireCell = opts?.replaceEntireCell === true;
      startedByTypingRef.current =
        initialChar !== undefined || replaceEntireCell;
      setAnchor({ row, col });
      setFocus({ row, col });
      if (isQuotationReadonlySheetColumn(col)) {
        setEditing(null);
        return;
      }
      setEditing({ row, col });
      const current = cells[cellKey(row, col)] ?? '';
      // 견적서: BL(0열)은 업체명 검색 UI(Select가 아닌 검색 팝오버)로 동작
      if (col === COL_COMPANY) {
        let initial: string;
        if (replaceEntireCell) {
          initial = '';
        } else if (initialChar !== undefined) {
          initial = initialChar;
        } else {
          initial = current;
        }
        setDraft(initial);
        if (replaceEntireCell) {
          setCompanySearchTerm('');
          setCompanySearchDirty(false);
        } else if (initialChar !== undefined) {
          setCompanySearchTerm(initial);
          setCompanySearchDirty(true);
        } else {
          setCompanySearchTerm('');
          setCompanySearchDirty(false);
        }
        setCompanySearchResults([]);
        setCompanyActiveIndex(SHEET_COMBO_INPUT_MODE);
        return;
      }
      if (
        col === COL_BL ||
        col === COL_STATUS ||
        col === COL_SALES_GRADE
      ) {
        setDraft(storedToSelectValue(current));
        if (col === COL_SALES_GRADE) {
          if (initialChar !== undefined && isAsciiPrintableKey(initialChar)) {
            setSalesGradeSearchTerm(initialChar);
            setSalesGradeSearchDirty(true);
          } else {
            setSalesGradeSearchTerm('');
            setSalesGradeSearchDirty(false);
          }
          setSalesGradeActiveIndex(SHEET_COMBO_INPUT_MODE);
        } else if (col === COL_STATUS) {
          if (initialChar !== undefined && isAsciiPrintableKey(initialChar)) {
            setStatusSearchTerm(initialChar);
            setStatusSearchDirty(true);
          } else {
            setStatusSearchTerm('');
            setStatusSearchDirty(false);
          }
          setStatusActiveIndex(SHEET_COMBO_INPUT_MODE);
        } else if (col === COL_BL) {
          if (initialChar !== undefined && isAsciiPrintableKey(initialChar)) {
            setBlSearchTerm(initialChar);
            setBlSearchDirty(true);
          } else {
            setBlSearchTerm('');
            setBlSearchDirty(false);
          }
          setBlActiveIndex(SHEET_COMBO_INPUT_MODE);
        }
      } else if (col === COL_VEHICLE) {
        setDraft(vehicleDraftFromStored(current, requestVehicleCodes));
        if (initialChar !== undefined && isAsciiPrintableKey(initialChar)) {
          setVehicleSearchTerm(initialChar);
          setVehicleSearchDirty(true);
        } else {
          setVehicleSearchTerm('');
          setVehicleSearchDirty(false);
        }
        setVehicleActiveIndex(SHEET_COMBO_INPUT_MODE);
      } else if (isSheetNumericColumn(col)) {
        const base = initialChar !== undefined ? initialChar : current;
        setDraft(sanitizeSheetNumericInput(base));
      } else if (isPlainTextSheetColumn(col)) {
        let initial: string;
        if (replaceEntireCell) {
          initial = '';
        } else if (initialChar !== undefined) {
          initial = initialChar;
        } else {
          initial = current;
        }
        textEditorInitialRef.current = initial;
        setTextEditorKey((k) => k + 1);
        setDraft(initial);
      } else {
        if (replaceEntireCell) {
          setDraft('');
        } else {
          setDraft(initialChar !== undefined ? initialChar : current);
        }
      }
    },
    [
      cells,
      requestVehicleCodes,
      firstColumnProductOptions,
      sheetStatusCodes,
      defaultSheetStatusItems,
      mergedBlOptionsByProductCode,
    ],
  );

  const tryStartEdit = React.useCallback(
    async (
      row: number,
      col: number,
      initialChar?: string,
      opts?: StartEditOptions,
    ) => {
      const key = cellKey(row, col);
      const lockedBy = foreignCellLocks?.[key];
      if (lockedBy) {
        toast({
          title: '편집 불가',
          description: `${lockedBy} 님이 이 셀을 편집 중입니다.`,
          variant: 'destructive',
        });
        return;
      }
      if (onBeforeEdit) {
        const ok = await onBeforeEdit(row, col);
        if (!ok) {
          return;
        }
      }
      if (opts?.replaceEntireCell) {
        flushSync(() => {
          startEdit(row, col, undefined, opts);
        });
      } else {
        startEdit(row, col, initialChar, opts);
      }
    },
    [foreignCellLocks, onBeforeEdit, startEdit],
  );

  const openSearchEditorFromCell = React.useCallback(
    (row: number, col: number) => {
      if (
        editingRef.current &&
        (editingRef.current.row !== row || editingRef.current.col !== col)
      ) {
        commitEdit();
      }
      flushSync(() => {
        setAnchor({ row, col });
        setFocus({ row, col });
      });
      void tryStartEdit(row, col);
    },
    [commitEdit, tryStartEdit],
  );

  const openDropdownEditorFromCell = React.useCallback(
    (row: number, col: number) => {
      if (
        editingRef.current &&
        (editingRef.current.row !== row || editingRef.current.col !== col)
      ) {
        commitEdit();
      }
      flushSync(() => {
        setAnchor({ row, col });
        setFocus({ row, col });
      });
      void tryStartEdit(row, col);
    },
    [commitEdit, tryStartEdit],
  );

  const openSearchEditorFromCellRef = React.useRef(openSearchEditorFromCell);
  openSearchEditorFromCellRef.current = openSearchEditorFromCell;
  const openDropdownEditorFromCellRef = React.useRef(openDropdownEditorFromCell);
  openDropdownEditorFromCellRef.current = openDropdownEditorFromCell;

  React.useEffect(() => {
    onEditingCellChange?.(editing);
  }, [editing, onEditingCellChange]);

  React.useLayoutEffect(() => {
    if (!editing) return;
    if (
      editing.col === COL_COMPANY ||
      editing.col === COL_SALES_GRADE ||
      editing.col === COL_STATUS ||
      editing.col === COL_BL ||
      editing.col === COL_VEHICLE
    ) {
      return;
    }
    if (isSheetNumericColumn(editing.col)) {
      const el = numericInputRef.current;
      if (!el) return;
      el.focus();
      if (startedByTypingRef.current) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.select();
      }
      startedByTypingRef.current = false;
      return;
    }
    if (isPlainTextSheetColumn(editing.col)) {
      const el = textEditorRef.current;
      if (!el) return;
      el.textContent = textEditorInitialRef.current;
      el.focus();
      if (startedByTypingRef.current) {
        placeCaretAtEnd(el);
      } else {
        selectContentEditable(el);
      }
      startedByTypingRef.current = false;
    }
  }, [editing, textEditorKey]);

  const handleCellClick = React.useCallback(
    (row: number, col: number, e?: React.MouseEvent) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        // 드래그 직후 클릭 무시 — Shift+범위 확장은 예외
        if (!e?.shiftKey) {
          return;
        }
      }
      if (e?.shiftKey) {
        if (editing && (editing.row !== row || editing.col !== col)) {
          commitEdit();
        }
        setFocus({ row, col });
        setEditing(null);
        prevClickRef.current = { row, col };
        return;
      }
      if (editing && (editing.row !== row || editing.col !== col)) {
        commitEdit();
        setAnchor({ row, col });
        setFocus({ row, col });
        prevClickRef.current = { row, col };
        return;
      }
      if (editing?.row === row && editing?.col === col) {
        return;
      }

      const single =
        anchor.row === focus.row && anchor.col === focus.col;
      const sameSingle =
        single &&
        anchor.row === row &&
        anchor.col === col &&
        prevClickRef.current?.row === row &&
        prevClickRef.current?.col === col &&
        !editing;
      if (sameSingle) {
        void tryStartEdit(row, col);
        return;
      }

      setAnchor({ row, col });
      setFocus({ row, col });
      prevClickRef.current = { row, col };
      setEditing(null);
    },
    [anchor, focus, editing, tryStartEdit, commitEdit],
  );

  const onDataCellContextMenu = React.useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, [contenteditable="true"], [data-sheet-skip-context-menu]',
        )
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (editing) {
        commitEdit();
      }
      const { anchor: a, focus: f } = anchorFocusRef.current;
      if (!isCellInAnchorFocusRange(row, col, a, f)) {
        setAnchor({ row, col });
        setFocus({ row, col });
      }
      setEditing(null);
      setSheetContextMenu({
        x: e.clientX,
        y: e.clientY,
        variant: 'grid',
      });
    },
    [editing, commitEdit],
  );

  const onCellPointerDown = React.useCallback(
    (row: number, col: number, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      rowHeaderDragRef.current = false;
      if (editing && (editing.row !== row || editing.col !== col)) {
        commitEdit();
      }
      if (e.shiftKey) {
        dragActiveRef.current = false;
        dragMovedRef.current = false;
        setFocus({ row, col });
        setEditing(null);
        return;
      }
      dragActiveRef.current = true;
      dragMovedRef.current = false;
      setAnchor({ row, col });
      setFocus({ row, col });
      setEditing(null);
    },
    [editing, commitEdit],
  );

  const onCellPointerEnter = React.useCallback(
    (row: number, col: number, e: React.PointerEvent) => {
      if (!dragActiveRef.current || e.buttons !== 1) return;
      dragMovedRef.current = true;
      if (rowHeaderDragRef.current) {
        setFocus({ row, col: MAX_VISIBLE_SHEET_COL });
      } else {
        setFocus({ row, col });
      }
    },
    [],
  );

  const onRowHeaderPointerDown = React.useCallback(
    (row: number, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (editing) {
        commitEdit();
      }
      if (e.shiftKey) {
        rowHeaderDragRef.current = false;
        dragActiveRef.current = false;
        dragMovedRef.current = false;
        setFocus({ row, col: MAX_VISIBLE_SHEET_COL });
        setEditing(null);
        return;
      }
      rowHeaderDragRef.current = true;
      dragActiveRef.current = true;
      dragMovedRef.current = false;
      setAnchor({ row, col: 0 });
      setFocus({ row, col: MAX_VISIBLE_SHEET_COL });
      setEditing(null);
    },
    [editing, commitEdit],
  );

  const onRowHeaderPointerEnter = React.useCallback(
    (row: number, e: React.PointerEvent) => {
      if (
        !dragActiveRef.current ||
        !rowHeaderDragRef.current ||
        e.buttons !== 1
      ) {
        return;
      }
      dragMovedRef.current = true;
      setFocus({ row, col: MAX_VISIBLE_SHEET_COL });
    },
    [],
  );

  React.useEffect(() => {
    const up = () => {
      if (dragActiveRef.current && dragMovedRef.current) {
        suppressNextClickRef.current = true;
      }
      dragActiveRef.current = false;
      rowHeaderDragRef.current = false;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const handleCellDoubleClick = React.useCallback(
    (row: number, col: number) => {
      void tryStartEdit(row, col);
    },
    [tryStartEdit],
  );

  const sheetRowHeaderHandlersRef = React.useRef({
    onRowHeaderPointerDown,
    onRowHeaderPointerEnter,
    onRowHeaderContextMenu,
  });
  sheetRowHeaderHandlersRef.current = {
    onRowHeaderPointerDown,
    onRowHeaderPointerEnter,
    onRowHeaderContextMenu,
  };

  const stableRowHeaderPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLTableCellElement>) => {
      const r = Number(e.currentTarget.getAttribute('data-sheet-row-index'));
      sheetRowHeaderHandlersRef.current.onRowHeaderPointerDown(r, e);
    },
    [],
  );
  const stableRowHeaderPointerEnter = React.useCallback(
    (e: React.PointerEvent<HTMLTableCellElement>) => {
      const r = Number(e.currentTarget.getAttribute('data-sheet-row-index'));
      sheetRowHeaderHandlersRef.current.onRowHeaderPointerEnter(r, e);
    },
    [],
  );
  const stableRowHeaderContextMenu = React.useCallback(
    (e: React.MouseEvent<HTMLTableCellElement>) => {
      const r = Number(e.currentTarget.getAttribute('data-sheet-row-index'));
      sheetRowHeaderHandlersRef.current.onRowHeaderContextMenu(r, e);
    },
    [],
  );

  const sheetDataCellHandlersRef = React.useRef({
    onCellPointerDown,
    onCellPointerEnter,
    handleCellClick,
    onDataCellContextMenu,
    handleCellDoubleClick,
  });
  sheetDataCellHandlersRef.current = {
    onCellPointerDown,
    onCellPointerEnter,
    handleCellClick,
    onDataCellContextMenu,
    handleCellDoubleClick,
  };

  const stableOnDataCellPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLTableCellElement>) => {
      const td = e.currentTarget;
      const r = Number(td.getAttribute('data-sheet-r'));
      const c = Number(td.getAttribute('data-sheet-c'));
      sheetDataCellHandlersRef.current.onCellPointerDown(r, c, e);
    },
    [],
  );
  const stableOnDataCellPointerEnter = React.useCallback(
    (e: React.PointerEvent<HTMLTableCellElement>) => {
      const td = e.currentTarget;
      const r = Number(td.getAttribute('data-sheet-r'));
      const c = Number(td.getAttribute('data-sheet-c'));
      sheetDataCellHandlersRef.current.onCellPointerEnter(r, c, e);
    },
    [],
  );
  const stableOnDataCellClick = React.useCallback(
    (ev: React.MouseEvent<HTMLTableCellElement>) => {
      const td = ev.currentTarget;
      const r = Number(td.getAttribute('data-sheet-r'));
      const c = Number(td.getAttribute('data-sheet-c'));
      sheetDataCellHandlersRef.current.handleCellClick(r, c, ev);
    },
    [],
  );
  const stableOnDataCellContextMenu = React.useCallback(
    (ev: React.MouseEvent<HTMLTableCellElement>) => {
      const td = ev.currentTarget;
      const r = Number(td.getAttribute('data-sheet-r'));
      const c = Number(td.getAttribute('data-sheet-c'));
      sheetDataCellHandlersRef.current.onDataCellContextMenu(r, c, ev);
    },
    [],
  );
  const stableOnDataCellDoubleClick = React.useCallback(
    (e: React.MouseEvent<HTMLTableCellElement>) => {
      e.preventDefault();
      const td = e.currentTarget;
      const r = Number(td.getAttribute('data-sheet-r'));
      const c = Number(td.getAttribute('data-sheet-c'));
      sheetDataCellHandlersRef.current.handleCellDoubleClick(r, c);
    },
    [],
  );

  const visibleSheetCols = VISIBLE_SHEET_COL_ORDER;

  React.useEffect(() => {
    const nf = nudgeOffHiddenSheetCol(focus.col);
    const na = nudgeOffHiddenSheetCol(anchor.col);
    if (nf === focus.col && na === anchor.col) return;
    setFocus((f) => ({ ...f, col: nf }));
    setAnchor((a) => ({ ...a, col: na }));
  }, [focus.col, anchor.col]);

  const maxDataRowIndex = React.useMemo(() => {
    let max = -1;
    for (const [k, v] of Object.entries(cells)) {
      if ((v ?? '').trim() === '') continue;
      const rowText = k.split(',')[0] ?? '';
      const row = Number(rowText);
      if (Number.isFinite(row) && row > max) max = row;
    }
    return max;
  }, [cells]);

  React.useEffect(() => {
    const requiredByData =
      maxDataRowIndex >= 0
        ? getExpandedRowCount(maxDataRowIndex + 1 + ROW_EXTEND_THRESHOLD)
        : MIN_ROW_COUNT;
    if (requiredByData > rowCount) {
      setRowCount(requiredByData);
    }
  }, [maxDataRowIndex, rowCount]);

  React.useEffect(() => {
    if (focus.row >= rowCount - ROW_EXTEND_THRESHOLD) {
      setRowCount((prev) => prev + ROW_EXTEND_STEP);
    }
  }, [focus.row, rowCount]);

  const rows = React.useMemo(
    () => Array.from({ length: rowCount }, (_, i) => i),
    [rowCount],
  );

  const visibleProductFilterSet = React.useMemo(() => {
    if (visibleProductCodes === undefined || visibleProductCodes === null) {
      return null;
    }
    const cleaned = visibleProductCodes
      .map((s) => (s ?? '').trim())
      .filter((s) => s.length > 0);
    if (cleaned.length === 0) {
      return new Set<string>();
    }
    return new Set(cleaned);
  }, [visibleProductCodes]);

  const visibleProductFilterKey = React.useMemo(() => {
    if (visibleProductFilterSet === null) return '';
    if (visibleProductFilterSet.size === 0) return '__empty__';
    return [...visibleProductFilterSet].sort().join('\0');
  }, [visibleProductFilterSet]);

  const visibleStatusFilterSet = React.useMemo(() => {
    if (visibleStatusCodes === undefined || visibleStatusCodes === null) {
      return null;
    }
    const cleaned = visibleStatusCodes
      .map((s) => (s ?? '').trim())
      .filter((s) => s.length > 0);
    if (cleaned.length === 0) {
      return new Set<string>();
    }
    return new Set(cleaned);
  }, [visibleStatusCodes]);

  const visibleStatusFilterKey = React.useMemo(() => {
    if (visibleStatusFilterSet === null) return '';
    if (visibleStatusFilterSet.size === 0) return '__empty__';
    return [...visibleStatusFilterSet].sort().join('\0');
  }, [visibleStatusFilterSet]);

  const headerFilterSetsByCol = React.useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const [k, arr] of Object.entries(headerFilterValuesByCol)) {
      const col = Number(k);
      if (!Number.isFinite(col)) continue;
      m.set(col, new Set((arr ?? []).map((s) => (s ?? '').trim()).filter(Boolean)));
    }
    return m;
  }, [headerFilterValuesByCol]);

  const headerFilterKey = React.useMemo(() => {
    const parts: string[] = [];
    const entries = Object.entries(headerFilterValuesByCol).sort(
      ([a], [b]) => Number(a) - Number(b),
    );
    for (const [k, vals] of entries) {
      const sorted = (vals ?? []).map((v) => (v ?? '').trim()).sort();
      parts.push(`${k}:${sorted.join('\0')}`);
    }
    return parts.join('|');
  }, [headerFilterValuesByCol]);

  const hasHeaderFilter = Object.keys(headerFilterValuesByCol).length > 0;

  const presentValuesByCol = React.useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const [k, raw] of Object.entries(cells)) {
      const v = (raw ?? '').trim();
      if (!v) continue;
      const parts = k.split(',');
      const col = Number(parts[1] ?? '-1');
      if (!Number.isFinite(col)) continue;
      if (!m.has(col)) m.set(col, new Set<string>());
      m.get(col)!.add(v);
    }
    return m;
  }, [cells]);

  const headerFilterOptionsByCol = React.useMemo(() => {
    const m = new Map<number, { value: string; label: string }[]>();
    for (const c of visibleSheetCols) {
      const values = [...(presentValuesByCol.get(c) ?? new Set<string>())].sort((a, b) =>
        a.localeCompare(b),
      );
      m.set(
        c,
        values.map((v) => {
          if (c === COL_SALES_GRADE) {
            return {
              value: v,
              label: salesGradeLabelMap.get(v) ?? v,
            };
          }
          if (c === COL_VEHICLE) {
            const stored = v.startsWith('__legacy__:')
              ? v.slice('__legacy__:'.length)
              : v;
            return {
              value: v,
              label: requestVehicleLabelMap.get(stored) ?? stored,
            };
          }
          return { value: v, label: v };
        }),
      );
    }
    return m;
  }, [presentValuesByCol, visibleSheetCols, requestVehicleLabelMap, salesGradeLabelMap]);

  const hasVisibleRowFilter =
    visibleProductFilterSet != null || visibleStatusFilterSet != null || hasHeaderFilter;

  const visibleRows = React.useMemo(() => {
    const bypass = productFilterBypassRowsRef.current;
    return rows.filter((r) =>
      rowPassesSheetFilters(
        r,
        cells,
        visibleProductFilterSet,
        visibleStatusFilterSet,
        headerFilterSetsByCol,
        bypass,
      ),
    );
  }, [
    rows,
    cells,
    visibleProductFilterSet,
    visibleStatusFilterSet,
    headerFilterSetsByCol,
    productFilterBypassEpoch,
  ]);

  // 견적서: 상품별 BL 옵션 프리패치 사용 안 함.

  React.useEffect(() => {
    if (
      visibleProductFilterSet === null &&
      visibleStatusFilterSet === null &&
      !hasHeaderFilter
    ) {
      return;
    }
    if (
      visibleProductFilterSet !== null &&
      visibleProductFilterSet.size === 0
    ) {
      return;
    }
    if (
      visibleStatusFilterSet !== null &&
      visibleStatusFilterSet.size === 0
    ) {
      return;
    }
    for (const selectedSet of headerFilterSetsByCol.values()) {
      if (selectedSet.size === 0) return;
    }
    const bypass = productFilterBypassRowsRef.current;
    const ok = (r: number) =>
      rowPassesSheetFilters(
        r,
        cells,
        visibleProductFilterSet,
        visibleStatusFilterSet,
        headerFilterSetsByCol,
        bypass,
      );
    if (ok(focus.row) && ok(anchor.row)) return;
    const first = rows.find((r) => ok(r));
    if (first === undefined) return;
    const col = focus.col;
    setAnchor({ row: first, col });
    setFocus({ row: first, col });
  }, [
    visibleProductFilterKey,
    visibleStatusFilterKey,
    headerFilterKey,
    hasHeaderFilter,
    visibleProductFilterSet,
    visibleStatusFilterSet,
    headerFilterSetsByCol,
    cells,
    focus.row,
    focus.col,
    anchor.row,
    anchor.col,
    rows,
    productFilterBypassEpoch,
  ]);

  const rangeBounds = React.useMemo(
    () => ({
      r0: Math.min(anchor.row, focus.row),
      r1: Math.max(anchor.row, focus.row),
      c0: Math.min(anchor.col, focus.col),
      c1: Math.max(anchor.col, focus.col),
    }),
    [anchor, focus],
  );

  const rangeBoundsRef = React.useRef(rangeBounds);
  rangeBoundsRef.current = rangeBounds;

  const sheetFillDraggingRef = React.useRef(false);
  const fillSourceBoundsRef = React.useRef<{
    r0: number;
    r1: number;
    c0: number;
    c1: number;
  } | null>(null);
  const pendingFillCornerRef = React.useRef<{ tr: number; tc: number } | null>(
    null,
  );
  const fillPreviewRafRef = React.useRef<number | null>(null);

  const [fillDragPreview, setFillDragPreview] = React.useState<{
    r0: number;
    c0: number;
    tr: number;
    tc: number;
  } | null>(null);

  const hiR0 = fillDragPreview?.r0 ?? rangeBounds.r0;
  const hiR1 = fillDragPreview?.tr ?? rangeBounds.r1;
  const hiC0 = fillDragPreview?.c0 ?? rangeBounds.c0;
  const hiC1 = fillDragPreview?.tc ?? rangeBounds.c1;

  const cellInSelectionHighlight = React.useCallback(
    (r: number, c: number) =>
      r >= hiR0 && r <= hiR1 && c >= hiC0 && c <= hiC1,
    [hiR0, hiR1, hiC0, hiC1],
  );

  const sheetTableWrapRef = React.useRef<HTMLDivElement>(null);
  const fillDragPreviewRef = React.useRef(fillDragPreview);
  fillDragPreviewRef.current = fillDragPreview;

  const [fillOutlineBox, setFillOutlineBox] = React.useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    if (!fillDragPreview) {
      setFillOutlineBox(null);
      return;
    }
    const wrap = sheetTableWrapRef.current;
    if (!wrap) {
      setFillOutlineBox(null);
      return;
    }
    const measure = () => {
      const fp = fillDragPreviewRef.current;
      const w = sheetTableWrapRef.current;
      if (!fp || !w) return;
      const { r0, c0, tr, tc } = fp;
      const tl = w.querySelector(
        `td[data-sheet-r="${r0}"][data-sheet-c="${c0}"]`,
      ) as HTMLElement | null;
      const br = w.querySelector(
        `td[data-sheet-r="${tr}"][data-sheet-c="${tc}"]`,
      ) as HTMLElement | null;
      if (!tl || !br) {
        setFillOutlineBox(null);
        return;
      }
      const wr = w.getBoundingClientRect();
      const a = tl.getBoundingClientRect();
      const b = br.getBoundingClientRect();
      setFillOutlineBox({
        left: a.left - wr.left,
        top: a.top - wr.top,
        width: b.right - a.left,
        height: b.bottom - a.top,
      });
    };

    measure();
    const onWin = () => measure();
    window.addEventListener('resize', onWin);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(wrap);
    }
    return () => {
      window.removeEventListener('resize', onWin);
      ro?.disconnect();
    };
  }, [
    fillDragPreview?.r0 ?? -1,
    fillDragPreview?.c0 ?? -1,
    fillDragPreview?.tr ?? -1,
    fillDragPreview?.tc ?? -1,
    visibleRows,
    sheetColWidths,
  ]);

  const onFillHandlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (editing) {
        commitEdit();
      }
      const src = { ...rangeBoundsRef.current };
      sheetFillDraggingRef.current = true;
      fillSourceBoundsRef.current = src;
      pendingFillCornerRef.current = { tr: src.r1, tc: src.c1 };
      setFillDragPreview({
        r0: src.r0,
        c0: src.c0,
        tr: src.r1,
        tc: src.c1,
      });

      const btn = e.currentTarget;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const applyFromPointer = (clientX: number, clientY: number) => {
        const hit = document.elementFromPoint(clientX, clientY);
        const td = hit?.closest?.('td[data-sheet-r]') as HTMLElement | null;
        if (!td) return;
        const hr = Number(td.dataset.sheetR);
        const hc = Number(td.dataset.sheetC);
        if (!Number.isFinite(hr) || !Number.isFinite(hc)) return;
        const tr = Math.max(src.r1, hr);
        const tc = Math.max(src.c1, hc);
        pendingFillCornerRef.current = { tr, tc };
        if (fillPreviewRafRef.current == null) {
          fillPreviewRafRef.current = requestAnimationFrame(() => {
            fillPreviewRafRef.current = null;
            const p = pendingFillCornerRef.current;
            const s = fillSourceBoundsRef.current;
            if (p && s && sheetFillDraggingRef.current) {
              setFillDragPreview({
                r0: s.r0,
                c0: s.c0,
                tr: p.tr,
                tc: p.tc,
              });
            }
          });
        }
      };

      const onMove = (ev: PointerEvent) => {
        applyFromPointer(ev.clientX, ev.clientY);
      };

      let finishCalled = false;
      const finish = () => {
        if (finishCalled) return;
        finishCalled = true;
        window.removeEventListener('pointermove', onMove);
        sheetFillDraggingRef.current = false;
        if (fillPreviewRafRef.current != null) {
          cancelAnimationFrame(fillPreviewRafRef.current);
          fillPreviewRafRef.current = null;
        }
        const s = fillSourceBoundsRef.current;
        const p = pendingFillCornerRef.current;
        fillSourceBoundsRef.current = null;
        pendingFillCornerRef.current = null;
        setFillDragPreview(null);
        try {
          btn.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }

        if (!s || !p) return;
        suppressNextClickRef.current = true;

        if (p.tr < s.r1 || p.tc < s.c1) return;
        if (p.tr === s.r1 && p.tc === s.c1) return;

        const locks = foreignCellLocksRef.current;
        for (let r = s.r0; r <= p.tr; r++) {
          for (let c = s.c0; c <= p.tc; c++) {
            const lockedBy = locks?.[cellKey(r, c)];
            if (lockedBy) {
              toast({
                title: '채우기할 수 없습니다',
                description: `${lockedBy} 님이 편집 중인 셀이 포함되어 있습니다.`,
                variant: 'destructive',
              });
              return;
            }
          }
        }

        const H = s.r1 - s.r0 + 1;
        const W = s.c1 - s.c0 + 1;
        const horizontalExtends = p.tc > s.c1;
        const numericSeries =
          W === 1 &&
          H > 1 &&
          !horizontalExtends &&
          sheetNumericArithmeticStepFromColumn(
            cellsRef.current,
            s.r0,
            s.r1,
            s.c0,
          );

        const requiredRows = p.tr + 1 + ROW_EXTEND_THRESHOLD;
        if (requiredRows > rowCountRef.current) {
          setRowCount(getExpandedRowCount(requiredRows));
        }

        setCellsWithHistory((prev) => {
          const next: Record<string, string> = { ...prev };
          if (numericSeries) {
            const col = s.c0;
            const { v0, d } = numericSeries;
            for (let r = s.r0; r <= p.tr; r++) {
              const n = v0 + (r - s.r0) * d;
              next[cellKey(r, col)] = sanitizeSheetNumericInput(String(n));
            }
          } else {
            for (let r = s.r0; r <= p.tr; r++) {
              for (let c = s.c0; c <= p.tc; c++) {
                if (isQuotationReadonlySheetColumn(c)) continue;
                const srcR = s.r0 + ((r - s.r0) % H);
                const srcC = s.c0 + ((c - s.c0) % W);
                next[cellKey(r, c)] = prev[cellKey(srcR, srcC)] ?? '';
              }
            }
          }
          for (let r = s.r0; r <= p.tr; r++) {
            const veh = next[cellKey(r, COL_VEHICLE)] ?? '';
            applyRequestedQtyFromVehicleSelection(next, r, veh);
          }
          for (let r = s.r0; r <= p.tr; r++) {
            schedulePersistRow(r, extractRowStrings(next, r));
          }
          return next;
        });

        setAnchor({ row: s.r0, col: s.c0 });
        setFocus({ row: p.tr, col: p.tc });
        prevClickRef.current = { row: p.tr, col: p.tc };
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish, { once: true });
      window.addEventListener('pointercancel', finish, { once: true });
    },
    [editing, commitEdit, schedulePersistRow, setCellsWithHistory],
  );

  const fillHandlePointerDownRef = React.useRef(onFillHandlePointerDown);
  fillHandlePointerDownRef.current = onFillHandlePointerDown;
  const stableOnFillHandlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      fillHandlePointerDownRef.current(e);
    },
    [],
  );

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'y')) {
        const ed = editingRef.current;
        if (
          ed &&
          (isPlainTextSheetColumn(ed.col) || isSheetNumericColumn(ed.col)) &&
          e.key === 'z' &&
          !e.shiftKey
        ) {
          return;
        }
        e.preventDefault();
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      const target = e.target as HTMLElement;
      if (target.closest('[data-sheet-skip-global-keys]')) return;

      if (e.key === 'F2' && !editing) {
        e.preventDefault();
        void tryStartEdit(focus.row, focus.col);
        return;
      }

      if (editing) return;

      if (mod && e.key.toLowerCase() === 'c' && !e.shiftKey) {
        e.preventDefault();
        copySelectionToClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v' && !e.shiftKey) {
        e.preventDefault();
        void pasteFromClipboard();
        return;
      }

      if (isSheetRangeClearKey(e)) {
        if (target.closest('[data-sheet-text-cell]')) return;
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          (target as HTMLElement).isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        const { anchor: a, focus: f } = anchorFocusRef.current;
        const r0 = Math.min(a.row, f.row);
        const r1 = Math.max(a.row, f.row);
        const c0 = Math.min(a.col, f.col);
        const c1 = Math.max(a.col, f.col);
        const locks = foreignCellLocksRef.current;
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const lockedBy = locks?.[cellKey(r, c)];
            if (lockedBy) {
              toast({
                title: '지울 수 없음',
                description: `${lockedBy} 님이 편집 중인 셀이 선택되어 있습니다.`,
                variant: 'destructive',
              });
              return;
            }
          }
        }
        const clearSuppressUntil =
          Date.now() + REMOTE_MERGE_SUPPRESS_MS_ON_RANGE_CLEAR;
        const suppressMap = remoteRowMergeSuppressUntilRef.current;
        for (let r = r0; r <= r1; r++) {
          const cur = suppressMap.get(r);
          if (cur == null || clearSuppressUntil > cur) {
            suppressMap.set(r, clearSuppressUntil);
          }
        }
        setCellsWithHistory((prev) => {
          const next: Record<string, string> = { ...prev };
          const rowsToPersist = new Set<number>();
          for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
              if (isQuotationReadonlySheetColumn(c)) continue;
              next[cellKey(r, c)] = '';
              if (c === 0) {
                next[cellKey(r, COL_BL)] = '';
                next[cellKey(r, COL_SALES_GRADE)] = '';
              }
            }
            if (c0 <= COL_COMPANY && c1 >= COL_COMPANY) {
              clearQuotationFieldsFilledFromBlBooking(next, r);
            }
            rowsToPersist.add(r);
          }
          for (const row of rowsToPersist) {
            const vals = extractRowStrings(next, row);
            schedulePersistRow(row, vals);
          }
          return next;
        });
        return;
      }

      /** Shift+방향: 앵커 고정·포커스만 이동(구글 시트처럼 범위 확장). */
      const move = (dr: number, dc: number, extendSelection: boolean) => {
        e.preventDefault();
        if (hasVisibleRowFilter && visibleRows.length === 0) {
          return;
        }
        const af = anchorFocusRef.current;
        const curFocus = af.focus;
        if (
          hasVisibleRowFilter &&
          visibleRows.length > 0 &&
          dr !== 0 &&
          dc === 0
        ) {
          const idx = visibleRows.indexOf(curFocus.row);
          const baseIdx = idx >= 0 ? idx : 0;
          const rawNext = baseIdx + dr;
          if (rawNext >= 0 && rawNext < visibleRows.length) {
            const nr = visibleRows[rawNext]!;
            const pos = { row: nr, col: curFocus.col };
            if (extendSelection) {
              setFocus(pos);
              anchorFocusRef.current = { anchor: af.anchor, focus: pos };
            } else {
              setAnchor(pos);
              setFocus(pos);
              anchorFocusRef.current = { anchor: pos, focus: pos };
            }
            return;
          }
          if (rawNext < 0 && dr < 0) {
            const nr = visibleRows[0]!;
            const pos = { row: nr, col: curFocus.col };
            if (extendSelection) {
              setFocus(pos);
              anchorFocusRef.current = { anchor: af.anchor, focus: pos };
            } else {
              setAnchor(pos);
              setFocus(pos);
              anchorFocusRef.current = { anchor: pos, focus: pos };
            }
            return;
          }
          /** 마지막 보이는 행 아래로: 필터 밖 빈 행으로 이동 — 상품·상태 필터에 걸리지 않게 bypass */
          if (rawNext >= visibleRows.length && dr > 0) {
            let nextRowCount = rowCount;
            let nr = curFocus.row + dr;
            while (nr >= nextRowCount) {
              nextRowCount += ROW_EXTEND_STEP;
            }
            if (nextRowCount > rowCount) {
              setRowCount(nextRowCount);
            }
            nr = Math.max(0, Math.min(nextRowCount - 1, nr));
            productFilterBypassRowsRef.current.add(nr);
            bumpProductFilterBypass();
            const pos = { row: nr, col: curFocus.col };
            if (extendSelection) {
              setFocus(pos);
              anchorFocusRef.current = { anchor: af.anchor, focus: pos };
            } else {
              setAnchor(pos);
              setFocus(pos);
              anchorFocusRef.current = { anchor: pos, focus: pos };
            }
            return;
          }
        }
        let nextRowCount = rowCount;
        if (dr > 0 && curFocus.row + dr >= rowCount) {
          nextRowCount = rowCount + ROW_EXTEND_STEP;
          setRowCount(nextRowCount);
        }
        const nr = Math.max(0, Math.min(nextRowCount - 1, curFocus.row + dr));
        const nc =
          dc !== 0
            ? stepVisibleSheetColumn(curFocus.col, dc)
            : Math.max(0, Math.min(COL_COUNT - 1, curFocus.col));
        const pos = { row: nr, col: nc };
        if (extendSelection) {
          setFocus(pos);
          anchorFocusRef.current = { anchor: af.anchor, focus: pos };
        } else {
          setAnchor(pos);
          setFocus(pos);
          anchorFocusRef.current = { anchor: pos, focus: pos };
        }
      };

      if (e.key === 'ArrowUp') move(-1, 0, e.shiftKey);
      else if (e.key === 'ArrowDown') move(1, 0, e.shiftKey);
      else if (e.key === 'ArrowLeft') move(0, -1, e.shiftKey);
      else if (e.key === 'ArrowRight') move(0, 1, e.shiftKey);
      else if (e.key === 'Enter') move(1, 0, false);
      else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) move(0, -1, false);
        else move(0, 1, false);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // 구글 스프레드시트처럼: 셀 선택 상태에서 거의 모든 출력 문자로 편집 시작,
        // 첫 입력이 셀 값을 통째로 바꿈(startEdit의 initialChar 경로).
        if (e.isComposing) return;
        if (e.key === 'Process' || e.key === 'Unidentified') return;
        // IME 조합 중인 키(브라우저마다 다름) — initialChar로 넣으면 한글 등이 깨짐
        if (e.keyCode === 229) return;
        if (
          focus.col === COL_BL ||
          focus.col === COL_VEHICLE ||
          focus.col === COL_STATUS ||
          focus.col === COL_SALES_GRADE
        ) {
          e.preventDefault();
          void tryStartEdit(
            focus.row,
            focus.col,
            isAsciiPrintableKey(e.key) ? e.key : undefined,
          );
          return;
        }
        if (isSheetNumericColumn(focus.col)) {
          if (!/^[\d.,]$/.test(e.key)) return;
          e.preventDefault();
          void tryStartEdit(focus.row, focus.col, e.key);
          return;
        }
        if (
          isPlainTextSheetColumn(focus.col) ||
          isCompanySheetColumn(focus.col)
        ) {
          e.preventDefault();
          if (isAsciiPrintableKey(e.key)) {
            void tryStartEdit(focus.row, focus.col, e.key);
          } else {
            void tryStartEdit(focus.row, focus.col, undefined, {
              replaceEntireCell: true,
            });
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    anchor,
    focus,
    editing,
    tryStartEdit,
    handleUndo,
    handleRedo,
    hasVisibleRowFilter,
    visibleRows,
    setCellsWithHistory,
    schedulePersistRow,
    copySelectionToClipboard,
    pasteFromClipboard,
    bumpProductFilterBypass,
    rowCount,
  ]);

  const commitEditAndMoveDown = React.useCallback(() => {
    commitEdit();
    const col = focus.col;
    if (hasVisibleRowFilter && visibleRows.length > 0) {
      const idx = visibleRows.indexOf(focus.row);
      const baseIdx = idx >= 0 ? idx : 0;
      if (baseIdx + 1 < visibleRows.length) {
        const nr = visibleRows[baseIdx + 1]!;
        const pos = { row: nr, col };
        setAnchor(pos);
        setFocus(pos);
      } else {
        let nextRowCount = rowCount;
        let nr = focus.row + 1;
        while (nr >= nextRowCount) {
          nextRowCount += ROW_EXTEND_STEP;
        }
        if (nextRowCount > rowCount) {
          setRowCount(nextRowCount);
        }
        nr = Math.min(nextRowCount - 1, nr);
        productFilterBypassRowsRef.current.add(nr);
        bumpProductFilterBypass();
        const pos = { row: nr, col };
        setAnchor(pos);
        setFocus(pos);
      }
    } else {
      let nextRowCount = rowCount;
      if (focus.row + 1 >= rowCount) {
        nextRowCount = rowCount + ROW_EXTEND_STEP;
        setRowCount(nextRowCount);
      }
      const nr = Math.min(nextRowCount - 1, focus.row + 1);
      const pos = { row: nr, col };
      setAnchor(pos);
      setFocus(pos);
    }
  }, [
    commitEdit,
    focus.col,
    focus.row,
    hasVisibleRowFilter,
    rowCount,
    visibleRows,
    bumpProductFilterBypass,
  ]);

  const commitEditAndMoveHorizontal = React.useCallback(
    (shiftKey: boolean) => {
      commitEdit();
      const nc = stepVisibleSheetColumn(
        focus.col,
        shiftKey ? -1 : 1,
      );
      const pos = { row: focus.row, col: nc };
      setAnchor(pos);
      setFocus(pos);
    },
    [commitEdit, focus.col, focus.row],
  );

  const handleSheetComboArrowDown = (
    e: React.KeyboardEvent,
    setIndex: React.Dispatch<React.SetStateAction<number>>,
    maxIndex: number,
  ) => {
    e.preventDefault();
    if (
      e.repeat &&
      suppressComboArrowDownRepeatAfterLeaveInputRef.current
    ) {
      suppressComboArrowDownRepeatAfterLeaveInputRef.current = false;
      return;
    }
    setIndex((prev) => {
      if (prev < 0) {
        if (!e.repeat) {
          suppressComboArrowDownRepeatAfterLeaveInputRef.current = true;
        }
        return 0;
      }
      return Math.min(maxIndex, prev + 1);
    });
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEditAndMoveDown();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEditAndMoveHorizontal(e.shiftKey);
    }
  };

  const onTextCellKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEditAndMoveDown();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEditAndMoveHorizontal(e.shiftKey);
    }
  };

  /** B열 업체명: 검색 + 목록 방향키(상품·상태와 동일) */
  const onCompanySearchKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const maxIndex = companySearchResults.length;
    const applyCompanyLabelAndCommit = (label: string) => {
      draftRef.current = label;
      flushSync(() => setDraft(label));
      commitEdit();
    };
    const applyCompanyLabelAndCommitHorizontal = (
      label: string,
      shiftKey: boolean,
    ) => {
      draftRef.current = label;
      flushSync(() => setDraft(label));
      commitEditAndMoveHorizontal(shiftKey);
    };
    const finishCommitAsTyped = () => {
      const t = draftRef.current.trim();
      draftRef.current = t;
      flushSync(() => setDraft(t));
      commitEdit();
    };
    const finishCommitHorizontalAsTyped = (shiftKey: boolean) => {
      const t = draftRef.current.trim();
      draftRef.current = t;
      flushSync(() => setDraft(t));
      commitEditAndMoveHorizontal(shiftKey);
    };

    if (e.key === 'Enter') {
      e.preventDefault();
      if (companyActiveIndex > 0) {
        const item = companySearchResults[companyActiveIndex - 1];
        const label = item
          ? sheetBookingSearchStoredValue(item)
          : '';
        applyCompanyLabelAndCommit(label || draftRef.current.trim());
      } else if (companyActiveIndex === 0) {
        applyCompanyLabelAndCommit('');
      } else if (companySearchResults.length > 0) {
        const label = sheetBookingSearchStoredValue(
          companySearchResults[0]!,
        );
        applyCompanyLabelAndCommit(label || draftRef.current.trim());
      } else {
        finishCommitAsTyped();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (companyActiveIndex > 0) {
        const item = companySearchResults[companyActiveIndex - 1];
        const label = item
          ? sheetBookingSearchStoredValue(item)
          : '';
        applyCompanyLabelAndCommitHorizontal(
          label || draftRef.current.trim(),
          e.shiftKey,
        );
      } else if (companyActiveIndex === 0) {
        applyCompanyLabelAndCommitHorizontal('', e.shiftKey);
      } else if (companySearchResults.length > 0) {
        const label = sheetBookingSearchStoredValue(
          companySearchResults[0]!,
        );
        applyCompanyLabelAndCommitHorizontal(
          label || draftRef.current.trim(),
          e.shiftKey,
        );
      } else {
        finishCommitHorizontalAsTyped(e.shiftKey);
      }
    } else if (e.key === 'ArrowDown') {
      handleSheetComboArrowDown(e, setCompanyActiveIndex, maxIndex);
    } else if (e.key === 'ArrowUp') {
      if (companyActiveIndex < 0) return;
      e.preventDefault();
      if (companyActiveIndex === 0) {
        flushSync(() => setCompanyActiveIndex(SHEET_COMBO_INPUT_MODE));
        const el = companySearchInputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          queueMicrotask(() => el.setSelectionRange(len, len));
        }
      } else {
        setCompanyActiveIndex((prev) => prev - 1);
      }
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const sc = getComboScrollViewportElement();
      if (!sc || sc.scrollHeight <= sc.clientHeight) return;
      e.preventDefault();
      const step = Math.max(48, Math.floor(sc.clientHeight * 0.85));
      sc.scrollTop += e.key === 'PageDown' ? step : -step;
      syncComboScrollHints();
    }
  };

  const applyFirstColSelection = React.useCallback(
    (row: number, col: number, value: string) => {
      setDraft(value);
      const stored = value === FIRST_COL_EMPTY ? '' : value;
      setCellsWithHistory((prev) => {
        const prevP = (prev[cellKey(row, 0)] ?? '').trim();
        const next: Record<string, string> = {
          ...prev,
          [cellKey(row, 0)]: stored,
        };
        if (prevP !== stored.trim()) {
          next[cellKey(row, COL_BL)] = '';
          next[cellKey(row, COL_SALES_GRADE)] = '';
        }
        if (sheetRowStringsChanged(prev, next, row)) {
          schedulePersistRow(row, extractRowStrings(next, row));
        }
        return next;
      });
      {
        const trimmed = stored.trim();
        if (trimmed !== '') {
          if (productFilterBypassRowsRef.current.delete(row)) {
            bumpProductFilterBypass();
          }
        } else if (hasActiveProductSubsetSheetFilter(visibleProductCodes)) {
          productFilterBypassRowsRef.current.add(row);
          bumpProductFilterBypass();
        }
      }
      onAfterEdit?.(row, col);
      setEditing(null);
    },
    [
      onAfterEdit,
      setCellsWithHistory,
      schedulePersistRow,
      visibleProductCodes,
      bumpProductFilterBypass,
    ],
  );

  const firstColSelectItems = React.useMemo(() => {
    const empty: SheetProductOption = {
      value: FIRST_COL_EMPTY,
      label: SELECT_NONE_LABEL,
    };
    const list: SheetProductOption[] = [empty, ...firstColumnProductOptions];
    if (
      editing?.col === 0 &&
      draft &&
      draft !== FIRST_COL_EMPTY &&
      !list.some((o) => o.value === draft)
    ) {
      return [...list, { value: draft, label: draft }];
    }
    return list;
  }, [firstColumnProductOptions, editing, draft]);

  const firstColSearchResults = React.useMemo(() => {
    const keyword = firstColSearchDirty
      ? firstColSearchTerm.trim().toLowerCase()
      : '';
    const list = firstColSelectItems.filter(
      (opt) => opt.value !== FIRST_COL_EMPTY,
    );
    if (!keyword) return list;
    return list.filter((opt) => {
      const label = opt.label.toLowerCase();
      const value = opt.value.toLowerCase();
      return label.includes(keyword) || value.includes(keyword);
    });
  }, [firstColSelectItems, firstColSearchTerm, firstColSearchDirty]);

  const onFirstColSearchKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    const maxIndex = firstColSearchResults.length;
    let selectedValue: string | undefined;
    if (firstColActiveIndex < 0) {
      if (firstColSearchResults.length > 0) {
        selectedValue = firstColSearchResults[0]!.value;
      } else {
        selectedValue = draftRef.current;
      }
    } else if (firstColActiveIndex === 0) {
      selectedValue = FIRST_COL_EMPTY;
    } else {
      selectedValue = firstColSearchResults[firstColActiveIndex - 1]?.value;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => {
          setDraft(selectedValue);
        });
      }
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => {
          setDraft(selectedValue);
        });
      }
      commitEditAndMoveHorizontal(e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      handleSheetComboArrowDown(e, setFirstColActiveIndex, maxIndex);
    } else if (e.key === 'ArrowUp') {
      if (firstColActiveIndex < 0) return;
      e.preventDefault();
      if (firstColActiveIndex === 0) {
        flushSync(() => setFirstColActiveIndex(SHEET_COMBO_INPUT_MODE));
        const el = firstColSearchInputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          queueMicrotask(() => el.setSelectionRange(len, len));
        }
      } else {
        setFirstColActiveIndex((prev) => prev - 1);
      }
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const sc = getComboScrollViewportElement();
      if (!sc || sc.scrollHeight <= sc.clientHeight) return;
      e.preventDefault();
      const step = Math.max(48, Math.floor(sc.clientHeight * 0.85));
      sc.scrollTop += e.key === 'PageDown' ? step : -step;
      syncComboScrollHints();
    }
  };

  // 견적서: 판매예약의 "상품/등급 기반 BL 옵션" 기능을 사용하지 않음.
  const blOptionsPerRowIndexed = React.useMemo(
    () => new Array<SheetBlOption[]>(rowCount).fill(EMPTY_BL_OPTIONS),
    [rowCount],
  );

  const sheetBlStoredByRow = React.useMemo(
    () => new Array<string>(rowCount).fill(''),
    [rowCount],
  );

  const secondColSelectItems = React.useMemo(() => {
    const empty: SheetProductOption = {
      value: FIRST_COL_EMPTY,
      label: SELECT_NONE_LABEL,
    };
    let list: (SheetProductOption | SheetBlOption)[] = [empty];
    if (
      draft &&
      draft !== FIRST_COL_EMPTY &&
      !list.some((o) => o.value === draft)
    ) {
      list = [
        ...list,
        {
          value: draft,
          label: draft,
          salesStatus: null,
          orphan: true,
        },
      ];
    }
    return list;
  }, [draft, rowCount]);

  const vehicleColSelectItems = React.useMemo(() => {
    const codes = requestVehicleCodes ?? [];
    const fromCodes = codes
      .map((code) => {
        const v = (code.value || code.name || '').trim();
        if (!v) return null;
        return {
          value: v,
          label: (code.name || code.value || v).trim(),
        };
      })
      .filter((x): x is { value: string; label: string } => x != null);
    if (editing?.col !== COL_VEHICLE) {
      return fromCodes;
    }
    const items: { value: string; label: string }[] = [
      { value: FIRST_COL_EMPTY, label: SELECT_NONE_LABEL },
      ...fromCodes,
    ];
    const d = draft;
    if (
      d &&
      d !== FIRST_COL_EMPTY &&
      !items.some((i) => i.value === d) &&
      d.startsWith('__legacy__:')
    ) {
      items.push({
        value: d,
        label: d.slice('__legacy__:'.length),
      });
    }
    return items;
  }, [editing, draft, requestVehicleCodes]);

  const statusLabelMap = React.useMemo(() => {
    const map = new Map<string, string>();
    const fromCodes = (sheetStatusCodes ?? [])
      .map((code) => {
        const v = (code.value || '').trim();
        const n = (code.name || code.value || '').trim();
        return v ? { value: v, label: n || v } : null;
      })
      .filter((x): x is { value: string; label: string } => x != null);
    const base = fromCodes.length > 0 ? fromCodes : defaultSheetStatusItems;
    for (const item of base) map.set(item.value, item.label);
    return map;
  }, [sheetStatusCodes, defaultSheetStatusItems]);

  const sheetReadonlyDisplayTextByKey = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (let r = 0; r < rowCount; r++) {
      for (const c of visibleSheetCols) {
        const k = cellKey(r, c);
        if (c === COL_BL) {
          out[k] = '';
          continue;
        }
        const v = cells[k] ?? '';
        if (c === 0) {
          out[k] = firstColDisplay(v, firstColumnProductOptions);
        } else if (c === COL_SALES_GRADE) {
          const raw = v.trim();
          out[k] = !raw
            ? EMPTY_CELL_DISPLAY
            : (salesGradeLabelMap.get(raw) ?? raw);
        } else if (c === COL_STATUS) {
          const raw = v.trim();
          out[k] = !raw
            ? EMPTY_CELL_DISPLAY
            : (statusLabelMap.get(raw) ?? raw);
        } else if (c === COL_VEHICLE) {
          const raw = v.trim();
          out[k] = !raw
            ? EMPTY_CELL_DISPLAY
            : (requestVehicleLabelMap.get(raw) ?? raw);
        } else if (c === COL_QUOTE_FX_CALC) {
          const cur = cells[cellKey(r, COL_QUOTE_CURRENCY)] ?? '';
          const price = cells[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '';
          const fx = formatQuotationFxCalcStoredValue(price, cur);
          out[k] = fx || '\u00a0';
        } else if (c === COL_QUOTE_COST) {
          const cur = cells[cellKey(r, COL_QUOTE_CURRENCY)] ?? '';
          const price = cells[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '';
          const ex = cells[cellKey(r, COL_QUOTE_EXPORT_COUNTRY)] ?? '';
          const cost = formatQuotationCostStoredValue(price, cur, ex);
          out[k] = cost || '\u00a0';
        } else if (c === COL_QUOTE_SELLING) {
          const cur = cells[cellKey(r, COL_QUOTE_CURRENCY)] ?? '';
          const price = cells[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '';
          const ex = cells[cellKey(r, COL_QUOTE_EXPORT_COUNTRY)] ?? '';
          const m = cells[cellKey(r, COL_QUOTE_MARGIN)] ?? '';
          const sp = formatQuotationSellingPriceStoredValue(price, cur, ex, m);
          out[k] = sp || '\u00a0';
        } else {
          out[k] = v || '\u00a0';
        }
      }
    }
    return out;
  }, [
    rowCount,
    cells,
    firstColumnProductOptions,
    salesGradeLabelMap,
    statusLabelMap,
    requestVehicleLabelMap,
    visibleSheetCols,
  ]);

  const selectionStatusBar = React.useMemo(() => {
    const { r0, r1, c0, c1 } = rangeBounds;
    const displayRowNum = (r: number) => {
      const i = visibleRows.indexOf(r);
      return i >= 0 ? i + 1 : r + 1;
    };
    const addr = (r: number, c: number) =>
      `${colLetter(c)}${displayRowNum(r)}`;
    const tl = addr(r0, c0);
    const br = addr(r1, c1);
    const rangeStr = tl === br ? tl : `${tl}:${br}`;
    const colSpan = c1 - c0 + 1;
    const visibleRowsInRange = visibleRows.filter(
      (r) => r >= r0 && r <= r1,
    );
    const rowSpanVisible = visibleRowsInRange.length;
    const areaVisible = rowSpanVisible * colSpan;

    const formatStoredCell = (r: number, c: number): string => {
      const raw = cells[cellKey(r, c)] ?? '';
      if (c === 0) {
        const t = firstColDisplay(raw, firstColumnProductOptions);
        if (!t || t === EMPTY_CELL_DISPLAY) return '비어 있음';
        return t;
      }
      if (c === COL_COMPANY) {
        return raw.trim() || '비어 있음';
      }
      if (c === COL_SALES_GRADE) {
        const t = raw.trim();
        if (!t) return '비어 있음';
        return salesGradeLabelMap.get(t) ?? t;
      }
      if (c === COL_STATUS) {
        const t = raw.trim();
        if (!t) return '비어 있음';
        return statusLabelMap.get(t) ?? t;
      }
      if (c === COL_BL) {
        const sel = storedToSelectValue(raw);
        if (sel === FIRST_COL_EMPTY) return '비어 있음';
        const p = (cells[cellKey(r, 0)] ?? '').trim();
        const gr = (cells[cellKey(r, COL_SALES_GRADE)] ?? '').trim();
        const blList = p
          ? (mergedBlOptionsByProductCode[sheetBlCompositeKey(p, gr)] ?? [])
          : [];
        const opt = blList.find((o) => o.value === sel);
        const blText = (opt?.label ?? sel).trim() || sel;
        const eta = formatBlEtaDateLabel(opt?.etaDate);
        return eta ? `${blText} · 입항 ${eta}` : blText;
      }
      if (c === COL_VEHICLE) {
        const t = raw.trim();
        if (!t) return '비어 있음';
        const stored = t.startsWith('__legacy__:')
          ? t.slice('__legacy__:'.length)
          : t;
        return (requestVehicleLabelMap.get(stored) ?? stored).trim() || stored;
      }
      if (c === COL_QUOTE_FX_CALC) {
        const cur = cells[cellKey(r, COL_QUOTE_CURRENCY)] ?? '';
        const price = cells[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '';
        const fx = formatQuotationFxCalcStoredValue(price, cur);
        return fx || '비어 있음';
      }
      if (c === COL_QUOTE_COST) {
        const cur = cells[cellKey(r, COL_QUOTE_CURRENCY)] ?? '';
        const price = cells[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '';
        const ex = cells[cellKey(r, COL_QUOTE_EXPORT_COUNTRY)] ?? '';
        const cost = formatQuotationCostStoredValue(price, cur, ex);
        return cost || '비어 있음';
      }
      if (c === COL_QUOTE_SELLING) {
        const cur = cells[cellKey(r, COL_QUOTE_CURRENCY)] ?? '';
        const price = cells[cellKey(r, COL_QUOTE_UNIT_PRICE)] ?? '';
        const ex = cells[cellKey(r, COL_QUOTE_EXPORT_COUNTRY)] ?? '';
        const m = cells[cellKey(r, COL_QUOTE_MARGIN)] ?? '';
        const sp = formatQuotationSellingPriceStoredValue(price, cur, ex, m);
        return sp || '비어 있음';
      }
      const t = raw.replace(/\r\n|\n|\r/g, ' ').trim();
      return t || '비어 있음';
    };

    let primary: string;
    const singlePhysicalCell = r0 === r1 && c0 === c1;
    if (singlePhysicalCell && rowSpanVisible === 1) {
      const summary = formatStoredCell(r0, c0);
      const clipped =
        summary.length > 120 ? `${summary.slice(0, 117)}…` : summary;
      primary = `${columnHeaderLabel(c0)} · ${clipped}`;
    } else if (singlePhysicalCell && rowSpanVisible === 0) {
      primary = `${columnHeaderLabel(c0)} · 필터로 숨겨진 행입니다`;
    } else {
      const colTitle =
        c0 === c1
          ? columnHeaderLabel(c0)
          : `${columnHeaderLabel(c0)}~${columnHeaderLabel(c1)}`;
      if (rowSpanVisible === 0) {
        primary = `${colTitle} · 표시된 행 없음`;
      } else {
        let allNumeric = true;
        let numericSum = 0;
        for (const r of visibleRowsInRange) {
          for (let c = c0; c <= c1; c++) {
            const raw = cells[cellKey(r, c)] ?? '';
            if (!isCellNumericOnlyForStats(raw)) {
              allNumeric = false;
            }
            numericSum += parseSheetNumericForSum(raw);
          }
        }
        const aggregate = allNumeric
          ? `합계 ${numericSum.toLocaleString('ko-KR')}`
          : `개수 ${areaVisible}`;
        primary = `${colTitle} · ${rowSpanVisible}행 × ${colSpan}열 · ${aggregate}`;
      }
    }
    return {
      rangeStr,
      primary,
      hint: hasVisibleRowFilter
        ? '행 번호는 필터 적용 후 화면에 보이는 순서입니다.'
        : null,
    };
  }, [
    rangeBounds,
    visibleRows,
    cells,
    firstColumnProductOptions,
    salesGradeLabelMap,
    statusLabelMap,
    requestVehicleLabelMap,
    mergedBlOptionsByProductCode,
    hasVisibleRowFilter,
  ]);

  const statusColSelectItems = React.useMemo(() => {
    const fromCodes = (sheetStatusCodes ?? [])
      .map((code) => {
        const v = (code.value || '').trim();
        const n = (code.name || code.value || '').trim();
        return v ? { value: v, label: n || v } : null;
      })
      .filter((x): x is { value: string; label: string } => x != null);
    const base = fromCodes.length > 0 ? fromCodes : defaultSheetStatusItems;
    const items: { value: string; label: string }[] = [
      { value: FIRST_COL_EMPTY, label: SELECT_NONE_LABEL },
      ...base,
    ];
    if (editing?.col === COL_STATUS) {
      const d = draft;
      if (d && d !== FIRST_COL_EMPTY && !items.some((i) => i.value === d)) {
        items.push({ value: d, label: d });
      }
    }
    return items;
  }, [sheetStatusCodes, defaultSheetStatusItems, editing, draft]);

  const applyStatusSelection = React.useCallback(
    (row: number, col: number, value: string) => {
      setDraft(value);
      const stored = value === FIRST_COL_EMPTY ? '' : value;
      setCellsWithHistory((prev) => {
        const next = {
          ...prev,
          [cellKey(row, col)]: stored,
        };
        if (sheetRowStringsChanged(prev, next, row)) {
          schedulePersistRow(row, extractRowStrings(next, row));
        }
        return next;
      });
      onAfterEdit?.(row, col);
      setEditing(null);
    },
    [onAfterEdit, schedulePersistRow, setCellsWithHistory],
  );

  const salesGradeColSelectItems = React.useMemo(() => {
    const fullBase = allSalesGradeSelectBase;
    let base: { value: string; label: string }[];
    if (editing?.col === COL_SALES_GRADE && editing.row != null) {
      const product = (cells[cellKey(editing.row, 0)] ?? '').trim();
      const scoped =
        product && salesGradeOptionsByProductCode[product]?.length
          ? salesGradeOptionsByProductCode[product]!
          : null;
      base = scoped ?? fullBase;
    } else {
      base = fullBase;
    }
    const items: { value: string; label: string }[] = [
      { value: FIRST_COL_EMPTY, label: SELECT_NONE_LABEL },
      ...base,
    ];
    if (editing?.col === COL_SALES_GRADE) {
      const d = draft;
      if (d && d !== FIRST_COL_EMPTY && !items.some((i) => i.value === d)) {
        items.push({ value: d, label: salesGradeLabelMap.get(d) ?? d });
      }
    }
    return items;
  }, [
    allSalesGradeSelectBase,
    salesGradeOptionsByProductCode,
    salesGradeLabelMap,
    editing,
    draft,
    cells,
  ]);

  const applySalesGradeSelection = React.useCallback(
    (row: number, col: number, value: string) => {
      setDraft(value);
      const stored = value === FIRST_COL_EMPTY ? '' : value;
      setCellsWithHistory((prev) => {
        const next = {
          ...prev,
          [cellKey(row, col)]: stored,
        };
        const product = (next[cellKey(row, 0)] ?? '').trim();
        const allowed = product
          ? (blOptionsByProductCodeRef.current[
              sheetBlCompositeKey(product, stored)
            ] ?? [])
          : [];
        const curBl = (next[cellKey(row, COL_BL)] ?? '').trim();
        if (
          allowed.length > 0 &&
          curBl &&
          !allowed.some((o) => o.value === curBl)
        ) {
          next[cellKey(row, COL_BL)] = '';
        }
        if (sheetRowStringsChanged(prev, next, row)) {
          schedulePersistRow(row, extractRowStrings(next, row));
        }
        return next;
      });
      onAfterEdit?.(row, col);
      setEditing(null);
    },
    [onAfterEdit, schedulePersistRow, setCellsWithHistory],
  );

  const applyBlSelection = React.useCallback(
    (row: number, col: number, value: string) => {
      setDraft(value);
      const stored = value === FIRST_COL_EMPTY ? '' : value;
      setCellsWithHistory((prev) => {
        const next: Record<string, string> = {
          ...prev,
          [cellKey(row, col)]: stored,
        };
        if (sheetRowStringsChanged(prev, next, row)) {
          schedulePersistRow(row, extractRowStrings(next, row));
        }
        return next;
      });
      onAfterEdit?.(row, col);
      setEditing(null);
    },
    [onAfterEdit, schedulePersistRow, setCellsWithHistory],
  );

  const applyVehicleSelection = React.useCallback(
    (row: number, col: number, value: string) => {
      setDraft(value);
      const stored =
        value === FIRST_COL_EMPTY
          ? ''
          : value.startsWith('__legacy__:')
            ? value.slice('__legacy__:'.length)
            : value;
      setCellsWithHistory((prev) => {
        const next: Record<string, string> = {
          ...prev,
          [cellKey(row, col)]: stored,
        };
        applyRequestedQtyFromVehicleSelection(next, row, stored);
        if (sheetRowStringsChanged(prev, next, row)) {
          schedulePersistRow(row, extractRowStrings(next, row));
        }
        return next;
      });
      onAfterEdit?.(row, col);
      setEditing(null);
    },
    [onAfterEdit, schedulePersistRow, setCellsWithHistory],
  );

  const statusSearchResults = React.useMemo(() => {
    const keyword = statusSearchDirty
      ? statusSearchTerm.trim().toLowerCase()
      : '';
    const list = statusColSelectItems.filter((opt) => opt.value !== FIRST_COL_EMPTY);
    if (!keyword) return list;
    return list.filter((opt) => {
      const label = opt.label.toLowerCase();
      const value = opt.value.toLowerCase();
      return label.includes(keyword) || value.includes(keyword);
    });
  }, [statusColSelectItems, statusSearchTerm, statusSearchDirty]);

  const salesGradeSearchResults = React.useMemo(() => {
    const keyword = salesGradeSearchDirty
      ? salesGradeSearchTerm.trim().toLowerCase()
      : '';
    const list = salesGradeColSelectItems.filter(
      (opt) => opt.value !== FIRST_COL_EMPTY,
    );
    if (!keyword) return list;
    return list.filter((opt) => {
      const label = opt.label.toLowerCase();
      const value = opt.value.toLowerCase();
      return label.includes(keyword) || value.includes(keyword);
    });
  }, [
    salesGradeColSelectItems,
    salesGradeSearchTerm,
    salesGradeSearchDirty,
  ]);

  React.useEffect(() => {
    const maxIndex = firstColSearchResults.length;
    setFirstColActiveIndex((prev) => {
      if (prev < SHEET_COMBO_INPUT_MODE) return SHEET_COMBO_INPUT_MODE;
      if (prev > maxIndex) return maxIndex;
      return prev;
    });
  }, [firstColSearchResults]);

  const blSearchResults = React.useMemo(() => {
    const keyword = blSearchDirty ? blSearchTerm.trim().toLowerCase() : '';
    const list = secondColSelectItems.filter((opt) => opt.value !== FIRST_COL_EMPTY);
    if (!keyword) return list;
    return list.filter((opt) => {
      const label = opt.label.toLowerCase();
      const value = opt.value.toLowerCase();
      return label.includes(keyword) || value.includes(keyword);
    });
  }, [secondColSelectItems, blSearchTerm, blSearchDirty]);

  React.useEffect(() => {
    const maxIndex = statusSearchResults.length;
    setStatusActiveIndex((prev) => {
      if (prev < SHEET_COMBO_INPUT_MODE) return SHEET_COMBO_INPUT_MODE;
      if (prev > maxIndex) return maxIndex;
      return prev;
    });
  }, [statusSearchResults]);

  React.useEffect(() => {
    const maxIndex = salesGradeSearchResults.length;
    setSalesGradeActiveIndex((prev) => {
      if (prev < SHEET_COMBO_INPUT_MODE) return SHEET_COMBO_INPUT_MODE;
      if (prev > maxIndex) return maxIndex;
      return prev;
    });
  }, [salesGradeSearchResults]);

  const vehicleSearchResults = React.useMemo(() => {
    const keyword = vehicleSearchDirty
      ? vehicleSearchTerm.trim().toLowerCase()
      : '';
    const list = vehicleColSelectItems.filter((opt) => opt.value !== FIRST_COL_EMPTY);
    if (!keyword) return list;
    return list.filter((opt) => {
      const label = opt.label.toLowerCase();
      const value = opt.value.toLowerCase();
      return label.includes(keyword) || value.includes(keyword);
    });
  }, [vehicleColSelectItems, vehicleSearchTerm, vehicleSearchDirty]);

  React.useEffect(() => {
    const maxIndex = blSearchResults.length;
    setBlActiveIndex((prev) => {
      if (prev < SHEET_COMBO_INPUT_MODE) return SHEET_COMBO_INPUT_MODE;
      if (prev > maxIndex) return maxIndex;
      return prev;
    });
  }, [blSearchResults]);

  React.useEffect(() => {
    const maxIndex = vehicleSearchResults.length;
    setVehicleActiveIndex((prev) => {
      if (prev < SHEET_COMBO_INPUT_MODE) return SHEET_COMBO_INPUT_MODE;
      if (prev > maxIndex) return maxIndex;
      return prev;
    });
  }, [vehicleSearchResults]);

  React.useLayoutEffect(() => {
    const col = editing?.col;
    if (
      col !== COL_COMPANY &&
      col !== COL_SALES_GRADE &&
      col !== COL_STATUS &&
      col !== COL_BL &&
      col !== COL_VEHICLE
    ) {
      return;
    }
    const viewport = getComboScrollViewportElement();
    if (!viewport) return;
    const activeIndex =
      col === COL_COMPANY
        ? companyActiveIndex
        : col === COL_SALES_GRADE
          ? salesGradeActiveIndex
          : col === COL_STATUS
            ? statusActiveIndex
            : col === COL_BL
              ? blActiveIndex
              : vehicleActiveIndex;
    if (activeIndex < 0) return;
    const el = viewport.querySelector(
      `[data-sheet-combo-item="${activeIndex}"]`,
    );
    if (el instanceof HTMLElement) {
      scrollElementIntoViewWithEdgeMargin(
        viewport,
        el,
        SHEET_COMBO_KEYBOARD_EDGE_MARGIN_PX,
      );
    }
    syncComboScrollHints();
  }, [
    companyActiveIndex,
    salesGradeActiveIndex,
    statusActiveIndex,
    blActiveIndex,
    vehicleActiveIndex,
    editing?.col,
    editing?.row,
    firstColSearchResults,
    companySearchResults,
    salesGradeSearchResults,
    statusSearchResults,
    blSearchResults,
    vehicleSearchResults,
    getComboScrollViewportElement,
    syncComboScrollHints,
  ]);

  React.useEffect(() => {
    const col = editing?.col;
    if (
      col !== COL_COMPANY &&
      col !== COL_SALES_GRADE &&
      col !== COL_STATUS &&
      col !== COL_BL &&
      col !== COL_VEHICLE
    ) {
      return;
    }
    const viewport = getComboScrollViewportElement();
    if (!viewport) return;
    const onScroll = () => {
      syncComboScrollHints();
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      syncComboScrollHints();
    });
    ro.observe(viewport);
    syncComboScrollHints();
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      ro.disconnect();
      clearComboHoverScroll();
    };
  }, [
    editing?.col,
    editing?.row,
    firstColSearchResults,
    companySearchResults,
    salesGradeSearchResults,
    statusSearchResults,
    blSearchResults,
    vehicleSearchResults,
    getComboScrollViewportElement,
    syncComboScrollHints,
    clearComboHoverScroll,
  ]);

  React.useEffect(() => {
    if (!editing) return;
    const col = editing.col;
    if (
      col !== COL_COMPANY &&
      col !== COL_SALES_GRADE &&
      col !== COL_STATUS &&
      col !== COL_BL &&
      col !== COL_VEHICLE
    ) {
      return;
    }
    const t = window.setTimeout(() => {
      if (col === COL_COMPANY) companySearchInputRef.current?.focus();
      else if (col === COL_SALES_GRADE)
        salesGradeSearchInputRef.current?.focus();
      else if (col === COL_STATUS) statusSearchInputRef.current?.focus();
      else if (col === COL_BL) blSearchInputRef.current?.focus();
      else if (col === COL_VEHICLE)
        vehicleSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing?.col, editing?.row]);

  const onStatusSearchKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    const maxIndex = statusSearchResults.length;
    let selectedValue: string | undefined;
    if (statusActiveIndex < 0) {
      if (statusSearchResults.length > 0) {
        selectedValue = statusSearchResults[0]!.value;
      } else {
        selectedValue = draftRef.current;
      }
    } else if (statusActiveIndex === 0) {
      selectedValue = FIRST_COL_EMPTY;
    } else {
      selectedValue = statusSearchResults[statusActiveIndex - 1]?.value;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => setDraft(selectedValue));
      }
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => setDraft(selectedValue));
      }
      commitEditAndMoveHorizontal(e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      handleSheetComboArrowDown(e, setStatusActiveIndex, maxIndex);
    } else if (e.key === 'ArrowUp') {
      if (statusActiveIndex < 0) return;
      e.preventDefault();
      if (statusActiveIndex === 0) {
        flushSync(() => setStatusActiveIndex(SHEET_COMBO_INPUT_MODE));
        const el = statusSearchInputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          queueMicrotask(() => el.setSelectionRange(len, len));
        }
      } else {
        setStatusActiveIndex((prev) => prev - 1);
      }
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const sc = getComboScrollViewportElement();
      if (!sc || sc.scrollHeight <= sc.clientHeight) return;
      e.preventDefault();
      const step = Math.max(48, Math.floor(sc.clientHeight * 0.85));
      sc.scrollTop += e.key === 'PageDown' ? step : -step;
      syncComboScrollHints();
    }
  };

  const onSalesGradeSearchKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    const maxIndex = salesGradeSearchResults.length;
    let selectedValue: string | undefined;
    if (salesGradeActiveIndex < 0) {
      if (salesGradeSearchResults.length > 0) {
        selectedValue = salesGradeSearchResults[0]!.value;
      } else {
        selectedValue = draftRef.current;
      }
    } else if (salesGradeActiveIndex === 0) {
      selectedValue = FIRST_COL_EMPTY;
    } else {
      selectedValue =
        salesGradeSearchResults[salesGradeActiveIndex - 1]?.value;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => setDraft(selectedValue));
      }
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => setDraft(selectedValue));
      }
      commitEditAndMoveHorizontal(e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      handleSheetComboArrowDown(e, setSalesGradeActiveIndex, maxIndex);
    } else if (e.key === 'ArrowUp') {
      if (salesGradeActiveIndex < 0) return;
      e.preventDefault();
      if (salesGradeActiveIndex === 0) {
        flushSync(() => setSalesGradeActiveIndex(SHEET_COMBO_INPUT_MODE));
        const el = salesGradeSearchInputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          queueMicrotask(() => el.setSelectionRange(len, len));
        }
      } else {
        setSalesGradeActiveIndex((prev) => prev - 1);
      }
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const sc = getComboScrollViewportElement();
      if (!sc || sc.scrollHeight <= sc.clientHeight) return;
      e.preventDefault();
      const step = Math.max(48, Math.floor(sc.clientHeight * 0.85));
      sc.scrollTop += e.key === 'PageDown' ? step : -step;
      syncComboScrollHints();
    }
  };

  const onBlSearchKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    const maxIndex = blSearchResults.length;
    let selectedValue: string | undefined;
    if (blActiveIndex < 0) {
      if (blSearchResults.length > 0) {
        selectedValue = blSearchResults[0]!.value;
      } else {
        selectedValue = draftRef.current;
      }
    } else if (blActiveIndex === 0) {
      selectedValue = FIRST_COL_EMPTY;
    } else {
      selectedValue = blSearchResults[blActiveIndex - 1]?.value;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => setDraft(selectedValue));
      }
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => setDraft(selectedValue));
      }
      commitEditAndMoveHorizontal(e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      handleSheetComboArrowDown(e, setBlActiveIndex, maxIndex);
    } else if (e.key === 'ArrowUp') {
      if (blActiveIndex < 0) return;
      e.preventDefault();
      if (blActiveIndex === 0) {
        flushSync(() => setBlActiveIndex(SHEET_COMBO_INPUT_MODE));
        const el = blSearchInputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          queueMicrotask(() => el.setSelectionRange(len, len));
        }
      } else {
        setBlActiveIndex((prev) => prev - 1);
      }
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const sc = getComboScrollViewportElement();
      if (!sc || sc.scrollHeight <= sc.clientHeight) return;
      e.preventDefault();
      const step = Math.max(48, Math.floor(sc.clientHeight * 0.85));
      sc.scrollTop += e.key === 'PageDown' ? step : -step;
      syncComboScrollHints();
    }
  };

  const onVehicleSearchKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    const maxIndex = vehicleSearchResults.length;
    let selectedValue: string | undefined;
    if (vehicleActiveIndex < 0) {
      if (vehicleSearchResults.length > 0) {
        selectedValue = vehicleSearchResults[0]!.value;
      } else {
        selectedValue = draftRef.current;
      }
    } else if (vehicleActiveIndex === 0) {
      selectedValue = FIRST_COL_EMPTY;
    } else {
      selectedValue = vehicleSearchResults[vehicleActiveIndex - 1]?.value;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => setDraft(selectedValue));
      }
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (selectedValue !== undefined) {
        draftRef.current = selectedValue;
        flushSync(() => setDraft(selectedValue));
      }
      commitEditAndMoveHorizontal(e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      handleSheetComboArrowDown(e, setVehicleActiveIndex, maxIndex);
    } else if (e.key === 'ArrowUp') {
      if (vehicleActiveIndex < 0) return;
      e.preventDefault();
      if (vehicleActiveIndex === 0) {
        flushSync(() => setVehicleActiveIndex(SHEET_COMBO_INPUT_MODE));
        const el = vehicleSearchInputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          queueMicrotask(() => el.setSelectionRange(len, len));
        }
      } else {
        setVehicleActiveIndex((prev) => prev - 1);
      }
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const sc = getComboScrollViewportElement();
      if (!sc || sc.scrollHeight <= sc.clientHeight) return;
      e.preventDefault();
      const step = Math.max(48, Math.floor(sc.clientHeight * 0.85));
      sc.scrollTop += e.key === 'PageDown' ? step : -step;
      syncComboScrollHints();
    }
  };

  const productHeaderSelectedSet = React.useMemo(() => {
    const next = new Set<string>();
    for (const c of productHeaderSelectedCodes) {
      const v = (c ?? '').trim();
      if (v) next.add(v);
    }
    return next;
  }, [productHeaderSelectedCodes]);

  const presentProductValues = React.useMemo(() => {
    const next = new Set<string>();
    for (const [k, raw] of Object.entries(cells)) {
      const v = (raw ?? '').trim();
      if (!v) continue;
      const parts = k.split(',');
      const col = Number(parts[1] ?? '-1');
      if (col === 0) {
        next.add(v);
      }
    }
    return next;
  }, [cells]);

  const presentStatusValues = React.useMemo(() => {
    const next = new Set<string>();
    for (const [k, raw] of Object.entries(cells)) {
      const v = (raw ?? '').trim();
      if (!v) continue;
      const parts = k.split(',');
      const col = Number(parts[1] ?? '-1');
      if (col === COL_STATUS) {
        next.add(v);
      }
    }
    return next;
  }, [cells]);

  const availableProductHeaderOptions = React.useMemo(() => {
    const fromMaster = productHeaderFilterOptions.filter((opt) =>
      presentProductValues.has(opt.value),
    );
    const known = new Set(fromMaster.map((opt) => opt.value));
    const legacy = [...presentProductValues]
      .filter((v) => !known.has(v))
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
    return [...fromMaster, ...legacy];
  }, [productHeaderFilterOptions, presentProductValues]);

  const availableStatusHeaderOptions = React.useMemo(() => {
    const fromMaster = statusHeaderFilterOptions.filter((opt) =>
      presentStatusValues.has(opt.value),
    );
    const known = new Set(fromMaster.map((opt) => opt.value));
    const legacy = [...presentStatusValues]
      .filter((v) => !known.has(v))
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
    return [...fromMaster, ...legacy];
  }, [statusHeaderFilterOptions, presentStatusValues]);

  const allProductHeaderSelected =
    availableProductHeaderOptions.length > 0 &&
    availableProductHeaderOptions.every((opt) =>
      productHeaderSelectedSet.has(opt.value),
    );
  const productHeaderHasFilter =
    availableProductHeaderOptions.length > 0 && !allProductHeaderSelected;
  const statusHeaderSelectedSet = React.useMemo(() => {
    const next = new Set<string>();
    for (const c of statusHeaderSelectedCodes) {
      const v = (c ?? '').trim();
      if (v) next.add(v);
    }
    return next;
  }, [statusHeaderSelectedCodes]);
  const allStatusHeaderSelected =
    availableStatusHeaderOptions.length > 0 &&
    availableStatusHeaderOptions.every((opt) =>
      statusHeaderSelectedSet.has(opt.value),
    );
  const statusHeaderHasFilter =
    availableStatusHeaderOptions.length > 0 && !allStatusHeaderSelected;

  const comboListScrollEdgeOverlays = (
    <>
      {comboScrollMoreAbove ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex justify-center bg-gradient-to-b from-popover from-40% to-transparent pb-4 pt-0.5"
          aria-hidden
        >
          <button
            type="button"
            tabIndex={-1}
            className="pointer-events-auto rounded-md p-0.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            onMouseEnter={startComboHoverScrollUp}
            onMouseLeave={clearComboHoverScroll}
          >
            <ChevronUp className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
      {comboScrollMoreBelow ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex justify-center bg-gradient-to-t from-popover from-40% to-transparent pt-4 pb-0.5"
          aria-hidden
        >
          <button
            type="button"
            tabIndex={-1}
            className="pointer-events-auto rounded-md p-0.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            onMouseEnter={startComboHoverScrollDown}
            onMouseLeave={clearComboHoverScroll}
          >
            <ChevronDown className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col rounded-md border border-border bg-background shadow-sm',
        className,
      )}
    >
      {onPersistRow ? (
        <input
          ref={excelImportFileInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="sr-only"
          aria-hidden
          onChange={onExcelImportFileSelected}
        />
      ) : null}
      <div className="shrink-0 border-b border-border bg-muted/25 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">견적 자동 계산</span>
            <span className="text-muted-foreground">
              {' · 환율·원가·판매가'}
            </span>
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="환율·원가·판매가 계산식 상세 보기"
                title="계산식 상세"
              >
                <Info className="size-3.5" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[min(calc(100vw-2rem),24rem)] p-3"
              align="start"
              side="bottom"
            >
              <p className="mb-3 border-b border-border pb-2 text-xs font-semibold text-foreground">
                계산식 상세
              </p>
              <div className="space-y-3">
                <section
                  className="rounded-md border border-border/70 bg-muted/25 px-2.5 py-2 dark:bg-muted/15"
                  aria-labelledby="quotation-hint-fx-heading"
                >
                  <h4
                    id="quotation-hint-fx-heading"
                    className="mb-2 text-xs font-semibold text-foreground"
                  >
                    환율 계산
                  </h4>
                  <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                    통화·단가 기준, 단가 × 배율. 해당 없으면 칸 비움.
                  </p>
                  <ul className="space-y-1.5 border-l-2 border-primary/35 pl-2.5 text-xs leading-snug text-foreground">
                    <li>
                      <span className="font-mono font-semibold tabular-nums">
                        $
                      </span>
                      <span className="text-muted-foreground"> — </span>
                      USD·$·미국달러 등 → 단가 ×{' '}
                      <span className="tabular-nums font-medium">
                        {QUOTATION_FX_USD_MULT}
                      </span>
                    </li>
                    <li>
                      <span className="font-semibold">유로</span>
                      <span className="text-muted-foreground"> — </span>€·EUR·유로
                      → 단가 ×{' '}
                      <span className="tabular-nums font-medium">
                        {QUOTATION_FX_EUR_MULT}
                      </span>
                    </li>
                  </ul>
                </section>
                <section
                  className="rounded-md border border-border/70 bg-muted/25 px-2.5 py-2 dark:bg-muted/15"
                  aria-labelledby="quotation-hint-cost-heading"
                >
                  <h4
                    id="quotation-hint-cost-heading"
                    className="mb-2 text-xs font-semibold text-foreground"
                  >
                    원가
                  </h4>
                  <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                    공통으로 환율계산 + 20을 적용한 뒤, 수출국에 따라 더합니다.
                  </p>
                  <ul className="space-y-1.5 border-l-2 border-amber-600/40 pl-2.5 text-xs leading-snug text-foreground dark:border-amber-500/45">
                    <li>
                      <span className="font-medium">공통</span>
                      <span className="text-muted-foreground"> — </span>
                      환율계산 + 20
                    </li>
                    <li>
                      <span className="font-medium">파키스탄</span>
                      <span className="text-muted-foreground"> — </span>
                      공통에 더해 (환율계산 × 0.08 + 5)
                    </li>
                    <li>
                      <span className="font-medium">이탈리아</span>
                      <span className="text-muted-foreground"> — </span>
                      위에 더해 +5 → 합: 환율계산 + 25
                    </li>
                    <li>
                      <span className="font-medium">호주</span>
                      <span className="text-muted-foreground"> — </span>
                      이탈리아와 동일 (+5) → 합: 환율계산 + 25
                    </li>
                    <li>
                      <span className="font-medium">기타</span>
                      <span className="text-muted-foreground"> — </span>
                      공통만 (환율계산 + 20, 수출국 비어 있음·그 외 국가)
                    </li>
                  </ul>
                </section>
                <section
                  className="rounded-md border border-border/70 bg-muted/25 px-2.5 py-2 dark:bg-muted/15"
                  aria-labelledby="quotation-hint-price-heading"
                >
                  <h4
                    id="quotation-hint-price-heading"
                    className="mb-1.5 text-xs font-semibold text-foreground"
                  >
                    판매가
                  </h4>
                  <p className="text-xs leading-snug text-foreground">
                    원가 + 마진 (마진 입력 시 자동)
                  </p>
                </section>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain"
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest(
              'input, textarea, [contenteditable="true"], [data-sheet-skip-context-menu]',
            )
          ) {
            return;
          }
          if (target.closest('td[data-sheet-r]')) {
            return;
          }
          e.preventDefault();
          setSheetContextMenu({
            x: e.clientX,
            y: e.clientY,
            variant: 'grid',
          });
        }}
      >
        <div ref={sheetTableWrapRef} className="relative w-max">
          <div
            ref={columnResizeGuideRef}
            className="pointer-events-none absolute top-0 bottom-0 z-[38] w-0.5 bg-primary shadow-[0_0_0_1px_hsl(var(--primary))]"
            style={{ left: 0, visibility: 'hidden' }}
            aria-hidden
          />
        <table className="w-max border-separate border-spacing-0 text-sm table-fixed">
          <colgroup>
            <col style={{ width: ROW_HEADER_COL_PX }} />
            {visibleSheetCols.map((c) => (
              <col key={c} style={{ width: sheetColWidths[c] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-[50] h-8 border border-[#dadce0] bg-[#f8f9fa] px-1 text-center text-xs font-medium text-muted-foreground dark:border-border dark:bg-muted"
                style={{
                  width: ROW_HEADER_COL_PX,
                  minWidth: ROW_HEADER_COL_PX,
                  maxWidth: ROW_HEADER_COL_PX,
                  boxShadow:
                    '1px 1px 0 0 #dadce0, 0 2px 4px -1px rgba(0,0,0,0.08)',
                }}
                scope="col"
              />
              {visibleSheetCols.map((c, colIdx) => (
                <th
                  key={c}
                  scope="col"
                  title={columnHeaderTitle(c)}
                  className={cn(
                    'sticky top-0 z-40 h-8 overflow-visible border border-[#dadce0] px-2 text-center text-xs font-medium dark:border-border',
                    c >= hiC0 && c <= hiC1
                      ? 'bg-[#d3e3fd] text-foreground dark:bg-primary/20 dark:text-foreground'
                      : 'bg-[#f8f9fa] text-muted-foreground dark:bg-muted',
                  )}
                  style={{
                    width: sheetColWidths[c],
                    minWidth: sheetColWidths[c],
                    maxWidth: sheetColWidths[c],
                    boxShadow:
                      '0 1px 0 0 #dadce0, 0 2px 4px -1px rgba(0,0,0,0.08)',
                  }}
                >
                  {c === 0 && onProductHeaderFilterChange ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'inline-flex w-full items-center justify-between gap-1 text-center hover:text-foreground',
                            productHeaderHasFilter && 'text-foreground',
                          )}
                          onClick={(e) => e.stopPropagation()}
                          title={
                            productHeaderHasFilter
                              ? '상품 필터 (적용 중)'
                              : '상품 필터'
                          }
                        >
                          <span className="min-w-0 flex-1 truncate text-center">
                            {columnHeaderLabel(c)}
                          </span>
                          <Filter
                            className={cn(
                              'size-3.5 shrink-0 self-center opacity-60',
                              productHeaderHasFilter && 'opacity-100',
                            )}
                            aria-hidden
                          />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className={SHEET_HEADER_FILTER_POPOVER_CONTENT_CLASS}
                        align="start"
                        side="bottom"
                        collisionPadding={12}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <SheetHeaderFilterPopoverFrame>
                          {(q) => {
                            const filtered = availableProductHeaderOptions.filter(
                              (opt) =>
                                sheetHeaderFilterOptionMatchesQuery(
                                  q,
                                  opt.label,
                                  opt.value,
                                ),
                            );
                            return (
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2 rounded p-2 hover:bg-muted/50">
                                  <Checkbox
                                    id="grid-header-product-filter-all"
                                    checked={allProductHeaderSelected}
                                    onCheckedChange={(checked) => {
                                      if (checked === true) {
                                        onProductHeaderFilterChange(
                                          availableProductHeaderOptions.map(
                                            (opt) => opt.value,
                                          ),
                                        );
                                      } else {
                                        onProductHeaderFilterChange([]);
                                      }
                                    }}
                                  />
                                  <Label
                                    htmlFor="grid-header-product-filter-all"
                                    className="flex-1 cursor-pointer text-sm font-medium"
                                  >
                                    전체
                                  </Label>
                                </div>
                                {filtered.length === 0 && q ? (
                                  <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                                    일치하는 항목이 없습니다.
                                  </p>
                                ) : (
                                  filtered.map((opt) => (
                                    <div
                                      key={opt.value}
                                      className="flex items-center space-x-2 rounded p-2 hover:bg-muted/50"
                                    >
                                      <Checkbox
                                        id={`grid-header-product-filter-${opt.value}`}
                                        checked={productHeaderSelectedSet.has(
                                          opt.value,
                                        )}
                                        onCheckedChange={(checked) => {
                                          const next = new Set(
                                            productHeaderSelectedSet,
                                          );
                                          if (checked === true)
                                            next.add(opt.value);
                                          else next.delete(opt.value);
                                          onProductHeaderFilterChange(
                                            Array.from(next),
                                          );
                                        }}
                                      />
                                      <Label
                                        htmlFor={`grid-header-product-filter-${opt.value}`}
                                        className="flex-1 cursor-pointer text-sm font-medium"
                                      >
                                        {opt.label}
                                      </Label>
                                    </div>
                                  ))
                                )}
                              </div>
                            );
                          }}
                        </SheetHeaderFilterPopoverFrame>
                      </PopoverContent>
                    </Popover>
                  ) : c === COL_STATUS && onStatusHeaderFilterChange ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'inline-flex w-full items-center justify-between gap-1 text-center hover:text-foreground',
                            statusHeaderHasFilter && 'text-foreground',
                          )}
                          onClick={(e) => e.stopPropagation()}
                          title={
                            statusHeaderHasFilter
                              ? '상태 필터 (적용 중)'
                              : '상태 필터'
                          }
                        >
                          <span className="min-w-0 flex-1 truncate text-center">
                            {columnHeaderLabel(c)}
                          </span>
                          <Filter
                            className={cn(
                              'size-3.5 shrink-0 self-center opacity-60',
                              statusHeaderHasFilter && 'opacity-100',
                            )}
                            aria-hidden
                          />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className={SHEET_HEADER_FILTER_POPOVER_CONTENT_CLASS}
                        align="start"
                        side="bottom"
                        collisionPadding={12}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <SheetHeaderFilterPopoverFrame>
                          {(q) => {
                            const filtered = availableStatusHeaderOptions.filter(
                              (opt) =>
                                sheetHeaderFilterOptionMatchesQuery(
                                  q,
                                  opt.label,
                                  opt.value,
                                ),
                            );
                            return (
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2 rounded p-2 hover:bg-muted/50">
                                  <Checkbox
                                    id="grid-header-status-filter-all"
                                    checked={allStatusHeaderSelected}
                                    onCheckedChange={(checked) => {
                                      if (checked === true) {
                                        onStatusHeaderFilterChange(
                                          availableStatusHeaderOptions.map(
                                            (opt) => opt.value,
                                          ),
                                        );
                                      } else {
                                        onStatusHeaderFilterChange([]);
                                      }
                                    }}
                                  />
                                  <Label
                                    htmlFor="grid-header-status-filter-all"
                                    className="flex-1 cursor-pointer text-sm font-medium"
                                  >
                                    전체
                                  </Label>
                                </div>
                                {filtered.length === 0 && q ? (
                                  <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                                    일치하는 항목이 없습니다.
                                  </p>
                                ) : (
                                  filtered.map((opt) => (
                                    <div
                                      key={opt.value}
                                      className="flex items-center space-x-2 rounded p-2 hover:bg-muted/50"
                                    >
                                      <Checkbox
                                        id={`grid-header-status-filter-${opt.value}`}
                                        checked={statusHeaderSelectedSet.has(
                                          opt.value,
                                        )}
                                        onCheckedChange={(checked) => {
                                          const next = new Set(
                                            statusHeaderSelectedSet,
                                          );
                                          if (checked === true)
                                            next.add(opt.value);
                                          else next.delete(opt.value);
                                          onStatusHeaderFilterChange(
                                            Array.from(next),
                                          );
                                        }}
                                      />
                                      <Label
                                        htmlFor={`grid-header-status-filter-${opt.value}`}
                                        className="flex-1 cursor-pointer text-sm font-medium"
                                      >
                                        {opt.label}
                                      </Label>
                                    </div>
                                  ))
                                )}
                              </div>
                            );
                          }}
                        </SheetHeaderFilterPopoverFrame>
                      </PopoverContent>
                    </Popover>
                  ) : c !== 0 && c !== COL_STATUS ? (
                    (() => {
                      const options = headerFilterOptionsByCol.get(c) ?? [];
                      const selected = headerFilterValuesByCol[c];
                      const selectedSet =
                        selected == null ? new Set(options.map((opt) => opt.value)) : new Set(selected);
                      const allSelected =
                        options.length > 0 &&
                        options.every((opt) => selectedSet.has(opt.value));
                      const hasFilter = selected != null && !allSelected;
                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex w-full items-center justify-between gap-1 text-center hover:text-foreground',
                                hasFilter && 'text-foreground',
                              )}
                              onClick={(e) => e.stopPropagation()}
                              title={
                                hasFilter
                                  ? `${columnHeaderLabel(c)} 필터 (적용 중)`
                                  : `${columnHeaderLabel(c)} 필터`
                              }
                            >
                              <span className="min-w-0 flex-1 truncate text-center">
                                {columnHeaderLabel(c)}
                              </span>
                              <Filter
                                className={cn(
                                  'size-3.5 shrink-0 self-center opacity-60',
                                  hasFilter && 'opacity-100',
                                )}
                                aria-hidden
                              />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className={SHEET_HEADER_FILTER_POPOVER_CONTENT_CLASS}
                            align="start"
                            side="bottom"
                            collisionPadding={12}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <SheetHeaderFilterPopoverFrame>
                              {(q) => {
                                const filtered = options.filter((opt) =>
                                  sheetHeaderFilterOptionMatchesQuery(
                                    q,
                                    opt.label,
                                    opt.value,
                                  ),
                                );
                                return (
                                  <div className="space-y-2">
                                    <div className="flex items-center space-x-2 rounded p-2 hover:bg-muted/50">
                                      <Checkbox
                                        id={`grid-header-generic-filter-all-${c}`}
                                        checked={allSelected}
                                        onCheckedChange={(checked) => {
                                          setHeaderFilterValuesByCol((prev) => {
                                            const next = { ...prev };
                                            if (checked === true) {
                                              delete next[c];
                                            } else {
                                              next[c] = [];
                                            }
                                            return next;
                                          });
                                        }}
                                      />
                                      <Label
                                        htmlFor={`grid-header-generic-filter-all-${c}`}
                                        className="flex-1 cursor-pointer text-sm font-medium"
                                      >
                                        전체
                                      </Label>
                                    </div>
                                    {filtered.length === 0 && q ? (
                                      <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                                        일치하는 항목이 없습니다.
                                      </p>
                                    ) : (
                                      filtered.map((opt) => (
                                        <div
                                          key={`${c}-${opt.value}`}
                                          className="flex items-center space-x-2 rounded p-2 hover:bg-muted/50"
                                        >
                                          <Checkbox
                                            id={`grid-header-generic-filter-${c}-${opt.value}`}
                                            checked={selectedSet.has(opt.value)}
                                            onCheckedChange={(checked) => {
                                              setHeaderFilterValuesByCol(
                                                (prev) => {
                                                  const base =
                                                    prev[c] ??
                                                    options.map((o) => o.value);
                                                  const nextSet = new Set(base);
                                                  if (checked === true)
                                                    nextSet.add(opt.value);
                                                  else nextSet.delete(opt.value);
                                                  const allNow =
                                                    options.length > 0 &&
                                                    options.every((o) =>
                                                      nextSet.has(o.value),
                                                    );
                                                  const next = { ...prev };
                                                  if (allNow) {
                                                    delete next[c];
                                                  } else {
                                                    next[c] = options
                                                      .map((o) => o.value)
                                                      .filter((v) =>
                                                        nextSet.has(v),
                                                      );
                                                  }
                                                  return next;
                                                },
                                              );
                                            }}
                                          />
                                          <Label
                                            htmlFor={`grid-header-generic-filter-${c}-${opt.value}`}
                                            className="flex-1 cursor-pointer text-sm font-medium"
                                          >
                                            {opt.label}
                                          </Label>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                );
                              }}
                            </SheetHeaderFilterPopoverFrame>
                          </PopoverContent>
                        </Popover>
                      );
                    })()
                  ) : (
                    <span className="block truncate">{columnHeaderLabel(c)}</span>
                  )}
                  {onColumnSizingChange ? (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`${columnHeaderLabel(c)} 열 너비 조절`}
                      onPointerDown={onColumnResizePointerDown(c)}
                      className={cn(
                        'pointer-events-auto absolute right-0 top-0 z-[60] h-full w-2 cursor-col-resize touch-none select-none bg-transparent',
                        'hover:bg-primary/15 active:bg-primary/25',
                        colIdx < visibleSheetCols.length - 1 && 'translate-x-1/2',
                      )}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && hasVisibleRowFilter ? (
              <tr>
                <td
                  colSpan={visibleSheetCols.length + 1}
                  className="border border-[#dadce0] bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  표시할 행이 없습니다. 표 상단 상품·상태 필터에서「전체」를 선택하거나
                  항목을 고른 뒤 다시 확인해 보세요.
                </td>
              </tr>
            ) : (
              visibleRows.map((r, visibleRowIndex) => {
                const rowStatusBgClass = sheetRowBackgroundForStatus(
                  (cells[cellKey(r, COL_STATUS)] ?? '').trim(),
                );
                return (
              <tr
                key={r}
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: 'auto 44px',
                }}
              >
                <MemoSheetRowHeader
                  row={r}
                  visibleRowIndex={visibleRowIndex}
                  className={cn(
                    'sticky left-0 z-10 h-7 cursor-default select-none border border-[#dadce0] px-1 text-center text-xs font-normal tabular-nums shadow-[1px_0_0_0_#dadce0]',
                    (() => {
                      const fsrc = fillDragPreview
                        ? fillSourceBoundsRef.current
                        : null;
                      const inRow =
                        fsrc != null
                          ? r >= fsrc.r0 && r <= fsrc.r1
                          : r >= hiR0 && r <= hiR1;
                      return inRow;
                    })()
                      ? 'bg-[#d3e3fd] text-foreground dark:bg-primary/20 dark:text-foreground'
                      : cn(
                          'text-muted-foreground',
                          rowStatusBgClass ?? 'bg-[#f8f9fa]',
                        ),
                  )}
                  stablePointerDown={stableRowHeaderPointerDown}
                  stablePointerEnter={stableRowHeaderPointerEnter}
                  stableContextMenu={stableRowHeaderContextMenu}
                />
                {visibleSheetCols.map((c) => {
                  const inRange = cellInSelectionHighlight(r, c);
                  const fillSrc =
                    fillDragPreview != null
                      ? fillSourceBoundsRef.current
                      : null;
                  const inRangeForBg =
                    fillDragPreview != null && fillSrc != null
                      ? r >= fillSrc.r0 &&
                        r <= fillSrc.r1 &&
                        c >= fillSrc.c0 &&
                        c <= fillSrc.c1
                      : inRange;
                  const isFillCornerCell =
                    !fillDragPreview &&
                    !editing &&
                    r === rangeBounds.r1 &&
                    c === rangeBounds.c1;
                  const isFocusCell = focus.row === r && focus.col === c;
                  const isEd =
                    editing?.row === r && editing?.col === c;
                  const foreignLockName = foreignCellLocks?.[cellKey(r, c)];
                  const isSheetSelectColumn =
                    c === COL_SALES_GRADE ||
                    c === COL_STATUS ||
                    c === COL_BL ||
                    c === COL_VEHICLE;
                  const w = sheetColWidths[c];
                  const ck = cellKey(r, c);
                  const cellDisplayText =
                    sheetReadonlyDisplayTextByKey[ck] ?? '';
                  const blOptsForCell =
                    c === COL_BL
                      ? (blOptionsPerRowIndexed[r] ?? [])
                      : EMPTY_BL_OPTIONS;

                  if (!isEd) {
                    return (
                      <ReadonlySheetDataCell
                        key={cellKey(r, c)}
                        row={r}
                        col={c}
                        width={w}
                        title={
                          foreignLockName
                            ? `${foreignLockName} 님이 편집 중`
                            : isQuotationReadonlySheetColumn(c)
                              ? '읽기 전용 — BL 검색·마진만 입력'
                              : undefined
                        }
                        quotationReadonlySurface={isQuotationReadonlySheetColumn(
                          c,
                        )}
                        tdClassName={cn(
                          'relative select-none border border-[#dadce0] p-0',
                          isFillCornerCell
                            ? 'overflow-visible'
                            : 'overflow-hidden',
                          c === COL_BL
                            ? 'min-h-[44px] align-middle'
                            : 'h-7 align-middle',
                          foreignLockName && 'bg-muted/40',
                        )}
                        inRangeForBg={inRangeForBg}
                        isFocusCell={isFocusCell}
                        foreignLockName={foreignLockName}
                        isFillCornerCell={isFillCornerCell}
                        isSheetSelectColumn={isSheetSelectColumn}
                        rowStatusBgClass={rowStatusBgClass}
                        cellDisplayText={cellDisplayText}
                        blStored={
                          c === COL_BL ? (sheetBlStoredByRow[r] ?? '') : ''
                        }
                        blOptions={blOptsForCell}
                        onFillHandlePointerDown={
                          isFillCornerCell
                            ? stableOnFillHandlePointerDown
                            : undefined
                        }
                        openSearchFromCellRef={openSearchEditorFromCellRef}
                        openDropdownFromCellRef={openDropdownEditorFromCellRef}
                        stablePointerDown={stableOnDataCellPointerDown}
                        stablePointerEnter={stableOnDataCellPointerEnter}
                        stableClick={stableOnDataCellClick}
                        stableContextMenu={stableOnDataCellContextMenu}
                        stableDoubleClick={stableOnDataCellDoubleClick}
                      />
                    );
                  }

                  return (
                    <td
                      key={cellKey(r, c)}
                      data-sheet-r={r}
                      data-sheet-c={c}
                      title={
                        foreignLockName
                          ? `${foreignLockName} 님이 편집 중`
                          : undefined
                      }
                      className={cn(
                        'relative select-none border border-[#dadce0] p-0',
                        isFillCornerCell ? 'overflow-visible' : 'overflow-hidden',
                        c === COL_BL
                          ? 'min-h-[44px] align-middle'
                          : 'h-7 align-middle',
                        foreignLockName && !isEd && 'bg-muted/40',
                      )}
                      style={{
                        width: w,
                        minWidth: w,
                        maxWidth: w,
                      }}
                      onPointerDown={stableOnDataCellPointerDown}
                      onPointerEnter={stableOnDataCellPointerEnter}
                      onClick={stableOnDataCellClick}
                      onContextMenu={stableOnDataCellContextMenu}
                      onDoubleClick={stableOnDataCellDoubleClick}
                    >
                      {false && c === 0 ? (
                          <div
                            data-sheet-skip-global-keys
                            className={cn(
                              'absolute inset-0 z-[5] flex min-h-[28px] items-stretch ring-2 ring-primary ring-inset',
                              rowStatusBgClass ?? 'bg-white',
                            )}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            {firstColumnProductOptionsLoading ? (
                              <div className="flex w-full items-center gap-2 px-2 text-xs text-muted-foreground">
                                <Loader2
                                  className="h-4 w-4 shrink-0 animate-spin"
                                  aria-hidden
                                />
                                상품 목록 불러오는 중…
                              </div>
                            ) : (
                              <Popover defaultOpen modal={false}>
                                <PopoverAnchor asChild>
                                  <div className="flex h-full min-h-0 w-full cursor-default items-center justify-between gap-2 px-2">
                                    <span className="min-w-0 truncate text-sm text-foreground">
                                      {(() => {
                                        if (draft === FIRST_COL_EMPTY) {
                                          return EMPTY_CELL_DISPLAY;
                                        }
                                        const selected = firstColSelectItems.find(
                                          (opt) => opt.value === draft,
                                        );
                                        return selected?.label ?? draft;
                                      })()}
                                    </span>
                                    <ChevronDown
                                      className="size-3.5 shrink-0 text-muted-foreground"
                                      aria-hidden
                                    />
                                  </div>
                                </PopoverAnchor>
                                <PopoverContent
                                  className="w-[min(100vw-1rem,320px)] p-2"
                                  align="start"
                                  side="bottom"
                                  sideOffset={2}
                                  collisionPadding={12}
                                  onPointerDownOutside={() => {
                                    if (editingRef.current?.col === 0) {
                                      commitEdit();
                                    }
                                  }}
                                  onEscapeKeyDown={(ev) => {
                                    ev.preventDefault();
                                    cancelEdit();
                                  }}
                                >
                                  <div className="flex flex-col gap-2">
                                    <input
                                      ref={firstColSearchInputRef}
                                      type="text"
                                      readOnly={firstColActiveIndex >= 0}
                                      className={cn(
                                        'placeholder:text-muted-foreground border-input h-8 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none',
                                        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                        firstColActiveIndex >= 0 &&
                                          'caret-transparent',
                                      )}
                                      placeholder="상품명 검색"
                                      value={firstColSearchTerm}
                                      onPointerDown={(e) =>
                                        comboSearchInputPointerDownReturnToTyping(
                                          e,
                                          firstColActiveIndex,
                                          setFirstColActiveIndex,
                                          suppressComboArrowDownRepeatAfterLeaveInputRef,
                                        )
                                      }
                                      onFocus={() => {
                                        suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                          false;
                                        setFirstColActiveIndex(
                                          SHEET_COMBO_INPUT_MODE,
                                        );
                                      }}
                                      onChange={(e) => {
                                        suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                          false;
                                        setFirstColSearchDirty(true);
                                        setFirstColSearchTerm(e.target.value);
                                        setFirstColActiveIndex(
                                          SHEET_COMBO_INPUT_MODE,
                                        );
                                      }}
                                      onKeyDown={(e) =>
                                        onFirstColSearchKeyDown(e, r, c)
                                      }
                                      onWheel={handleComboScrollWheel}
                                      aria-label={`셀 ${colLetter(c)}${r + 1} 상품 검색`}
                                    />
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {firstColSearchResults.length === 0 ? (
                                        <span>검색 결과가 없습니다.</span>
                                      ) : (
                                        <span>
                                          {firstColSearchResults.length}건
                                        </span>
                                      )}
                                    </div>
                                    <div className="relative min-w-0 overflow-hidden rounded-md border border-border/60 bg-popover">
                                      <ScrollArea
                                        ref={firstColScrollAreaRootRef}
                                        hideScrollbar
                                        className="h-[min(40vh,240px)]"
                                      >
                                        <div
                                          className="flex flex-col gap-0.5 py-0.5"
                                          role="listbox"
                                          aria-label="상품 목록"
                                        >
                                          <button
                                            type="button"
                                            data-sheet-combo-item="0"
                                            className={cn(
                                              'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                              firstColActiveIndex === 0 &&
                                                'bg-muted',
                                            )}
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onMouseEnter={() =>
                                              setFirstColActiveIndex(0)
                                            }
                                            onClick={() =>
                                              applyFirstColSelection(
                                                r,
                                                c,
                                                FIRST_COL_EMPTY,
                                              )
                                            }
                                          >
                                            {SELECT_NONE_LABEL}
                                          </button>
                                          {firstColSearchResults.map(
                                            (opt, idx) => (
                                              <button
                                                key={`${opt.value}-${idx}`}
                                                type="button"
                                                data-sheet-combo-item={String(
                                                  idx + 1,
                                                )}
                                                className={cn(
                                                  'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                                  firstColActiveIndex ===
                                                    idx + 1 && 'bg-muted',
                                                )}
                                                onMouseDown={(e) =>
                                                  e.preventDefault()
                                                }
                                                onMouseEnter={() => {
                                                  if (firstColActiveIndex < 0)
                                                    return;
                                                  setFirstColActiveIndex(
                                                    idx + 1,
                                                  );
                                                }}
                                                onClick={() =>
                                                  applyFirstColSelection(
                                                    r,
                                                    c,
                                                    opt.value,
                                                  )
                                                }
                                              >
                                                {opt.label}
                                              </button>
                                            ),
                                          )}
                                        </div>
                                      </ScrollArea>
                                      {comboListScrollEdgeOverlays}
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        ) : c === COL_SALES_GRADE ? (
                          <div
                            data-sheet-skip-global-keys
                            className={cn(
                              'absolute inset-0 z-[5] min-h-[28px] ring-2 ring-primary ring-inset',
                              rowStatusBgClass ?? 'bg-white',
                            )}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Popover defaultOpen modal={false}>
                              <PopoverAnchor asChild>
                                <div className="flex h-full min-h-0 w-full cursor-default items-center justify-between gap-2 px-2">
                                  <span className="min-w-0 truncate text-sm text-foreground">
                                    {(() => {
                                      if (draft === FIRST_COL_EMPTY) {
                                        return EMPTY_CELL_DISPLAY;
                                      }
                                      const selected =
                                        salesGradeColSelectItems.find(
                                          (opt) => opt.value === draft,
                                        );
                                      return selected?.label ?? draft;
                                    })()}
                                  </span>
                                  <ChevronDown
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                </div>
                              </PopoverAnchor>
                              <PopoverContent
                                className="w-[min(100vw-1rem,320px)] p-2"
                                align="start"
                                side="bottom"
                                sideOffset={2}
                                collisionPadding={12}
                                onPointerDownOutside={() => {
                                  if (
                                    editingRef.current?.col === COL_SALES_GRADE
                                  ) {
                                    commitEdit();
                                  }
                                }}
                                onEscapeKeyDown={(ev) => {
                                  ev.preventDefault();
                                  cancelEdit();
                                }}
                              >
                                <div className="flex flex-col gap-2">
                                  <input
                                    ref={salesGradeSearchInputRef}
                                    type="text"
                                    readOnly={salesGradeActiveIndex >= 0}
                                    className={cn(
                                      'placeholder:text-muted-foreground border-input h-8 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none',
                                      'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                      salesGradeActiveIndex >= 0 &&
                                        'caret-transparent',
                                    )}
                                    placeholder="등급 검색"
                                    value={salesGradeSearchTerm}
                                    onPointerDown={(e) =>
                                      comboSearchInputPointerDownReturnToTyping(
                                        e,
                                        salesGradeActiveIndex,
                                        setSalesGradeActiveIndex,
                                        suppressComboArrowDownRepeatAfterLeaveInputRef,
                                      )
                                    }
                                    onFocus={() => {
                                      suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                        false;
                                      setSalesGradeActiveIndex(
                                        SHEET_COMBO_INPUT_MODE,
                                      );
                                    }}
                                    onChange={(e) => {
                                      suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                        false;
                                      setSalesGradeSearchDirty(true);
                                      setSalesGradeSearchTerm(e.target.value);
                                      setSalesGradeActiveIndex(
                                        SHEET_COMBO_INPUT_MODE,
                                      );
                                    }}
                                    onKeyDown={(e) =>
                                      onSalesGradeSearchKeyDown(e, r, c)
                                    }
                                    onWheel={handleComboScrollWheel}
                                    aria-label={`셀 ${colLetter(c)}${r + 1} 등급 검색`}
                                  />
                                  <div className="relative min-w-0 overflow-hidden rounded-md border border-border/60 bg-popover">
                                    <ScrollArea
                                      ref={salesGradeScrollAreaRootRef}
                                      hideScrollbar
                                      className="h-[min(40vh,240px)]"
                                    >
                                      <div
                                        className="flex flex-col gap-0.5 py-0.5"
                                        role="listbox"
                                        aria-label="등급 목록"
                                      >
                                        <button
                                          type="button"
                                          data-sheet-combo-item="0"
                                          className={cn(
                                            'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                            salesGradeActiveIndex === 0 &&
                                              'bg-muted',
                                          )}
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onMouseEnter={() =>
                                            setSalesGradeActiveIndex(0)
                                          }
                                          onClick={() =>
                                            applySalesGradeSelection(
                                              r,
                                              c,
                                              FIRST_COL_EMPTY,
                                            )
                                          }
                                        >
                                          {SELECT_NONE_LABEL}
                                        </button>
                                        {salesGradeSearchResults.map(
                                          (opt, idx) => (
                                            <button
                                              key={`${opt.value}-${idx}`}
                                              type="button"
                                              data-sheet-combo-item={String(
                                                idx + 1,
                                              )}
                                              className={cn(
                                                'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                                salesGradeActiveIndex ===
                                                  idx + 1 && 'bg-muted',
                                              )}
                                              onMouseDown={(e) =>
                                                e.preventDefault()
                                              }
                                              onMouseEnter={() => {
                                                if (salesGradeActiveIndex < 0)
                                                  return;
                                                setSalesGradeActiveIndex(
                                                  idx + 1,
                                                );
                                              }}
                                              onClick={() =>
                                                applySalesGradeSelection(
                                                  r,
                                                  c,
                                                  opt.value,
                                                )
                                              }
                                            >
                                              {opt.label}
                                            </button>
                                          ),
                                        )}
                                      </div>
                                    </ScrollArea>
                                    {comboListScrollEdgeOverlays}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : c === COL_COMPANY ? (
                          <div
                            data-sheet-skip-global-keys
                            className={cn(
                              'absolute inset-0 z-[5] min-h-[28px] ring-2 ring-primary ring-inset',
                              rowStatusBgClass ?? 'bg-white',
                            )}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Popover defaultOpen modal={false}>
                              <PopoverAnchor asChild>
                                <div className="flex h-full min-h-0 w-full cursor-default items-center justify-between gap-2 px-2">
                                  <span className="min-w-0 truncate text-sm text-foreground">
                                    {draft || EMPTY_CELL_DISPLAY}
                                  </span>
                                  <ChevronDown
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                </div>
                              </PopoverAnchor>
                              <PopoverContent
                                className="w-[min(100vw-1rem,360px)] p-2"
                                align="start"
                                side="bottom"
                                sideOffset={2}
                                collisionPadding={12}
                                onPointerDownOutside={() => {
                                  if (
                                    editingRef.current?.col === COL_COMPANY
                                  ) {
                                    commitEdit();
                                  }
                                }}
                                onEscapeKeyDown={(ev) => {
                                  ev.preventDefault();
                                  cancelEdit();
                                }}
                              >
                                <div className="flex flex-col gap-2">
                                  <input
                                    ref={companySearchInputRef}
                                    type="text"
                                    readOnly={companyActiveIndex >= 0}
                                    className={cn(
                                      'placeholder:text-muted-foreground border-input h-8 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none',
                                      'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                      companyActiveIndex >= 0 &&
                                        'caret-transparent',
                                    )}
                                    placeholder="BL/BK 두 글자 이상 검색"
                                    value={companySearchTerm}
                                    onPointerDown={(e) =>
                                      comboSearchInputPointerDownReturnToTyping(
                                        e,
                                        companyActiveIndex,
                                        setCompanyActiveIndex,
                                        suppressComboArrowDownRepeatAfterLeaveInputRef,
                                      )
                                    }
                                    onFocus={() => {
                                      suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                        false;
                                      setCompanyActiveIndex(
                                        SHEET_COMBO_INPUT_MODE,
                                      );
                                    }}
                                    onChange={(e) => {
                                      suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                        false;
                                      setCompanySearchDirty(true);
                                      setCompanySearchTerm(e.target.value);
                                      setDraft(e.target.value);
                                      setCompanyActiveIndex(
                                        SHEET_COMBO_INPUT_MODE,
                                      );
                                    }}
                                    onKeyDown={onCompanySearchKeyDown}
                                    onWheel={handleComboScrollWheel}
                                    aria-label={`셀 ${colLetter(c)}${r + 1} BL/BK 검색`}
                                  />
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {companySearchLoading ? (
                                      <>
                                        <Loader2
                                          className="h-3.5 w-3.5 shrink-0 animate-spin"
                                          aria-hidden
                                        />
                                        검색 중…
                                      </>
                                    ) : companySearchTerm.trim().length < 2 ? (
                                      <span>
                                        2글자 이상 입력하면 BL/BK를 검색합니다.
                                      </span>
                                    ) : companySearchResults.length === 0 ? (
                                      <span>
                                        결과 없음 — Enter로 입력한 값을 그대로 저장할 수 있습니다.
                                      </span>
                                    ) : (
                                      <span>
                                        {companySearchResults.length}건 — 클릭하면
                                        선택
                                      </span>
                                    )}
                                  </div>
                                  <div className="relative min-w-0 overflow-hidden rounded-md border border-border/60 bg-popover">
                                    <ScrollArea
                                      ref={companyScrollAreaRootRef}
                                      hideScrollbar
                                      className="h-[min(40vh,240px)]"
                                    >
                                      <div
                                        className="flex flex-col gap-0.5 py-0.5"
                                        role="listbox"
                                        aria-label="BL/BK 검색 목록"
                                      >
                                        <button
                                          type="button"
                                          data-sheet-combo-item="0"
                                          className={cn(
                                            'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                            companyActiveIndex === 0 &&
                                              'bg-muted',
                                          )}
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onMouseEnter={() =>
                                            setCompanyActiveIndex(0)
                                          }
                                          onClick={() => {
                                            setCellsWithHistory((prev) => {
                                              const next = {
                                                ...prev,
                                                [cellKey(r, COL_COMPANY)]: '',
                                              };
                                              clearQuotationFieldsFilledFromBlBooking(
                                                next,
                                                r,
                                              );
                                              if (
                                                sheetRowStringsChanged(
                                                  prev,
                                                  next,
                                                  r,
                                                )
                                              ) {
                                                schedulePersistRow(
                                                  r,
                                                  extractRowStrings(next, r),
                                                );
                                              }
                                              return next;
                                            });
                                            onAfterEdit?.(r, COL_COMPANY);
                                            setEditing(null);
                                          }}
                                        >
                                          {SELECT_NONE_LABEL}
                                        </button>
                                        {companySearchResults.map(
                                          (item, idx) => {
                                            const label =
                                              sheetBookingSearchStoredValue(
                                                item,
                                              );
                                            const sub = [
                                              (item.bl ?? '').trim() &&
                                              (item.bk ?? '').trim() &&
                                              (item.bl ?? '').trim() !==
                                                (item.bk ?? '').trim()
                                                ? `BL: ${(item.bl ?? '').trim()} · BK: ${(item.bk ?? '').trim()}`
                                                : null,
                                              item.salesStatus
                                                ? `상태: ${item.salesStatus}`
                                                : null,
                                              item.etaDate
                                                ? `입항: ${formatBlEtaDateLabel(item.etaDate)}`
                                                : null,
                                              (item.currencyName ?? item.currency)
                                                ? `통화: ${(item.currencyName ?? item.currency) as string}`
                                                : null,
                                              item.unitPrice != null &&
                                              Number.isFinite(item.unitPrice)
                                                ? `단가: ${item.unitPrice}`
                                                : null,
                                              item.exportCountryName
                                                ? `수출국: ${item.exportCountryName}`
                                                : null,
                                              item.productName
                                                ? `상품: ${item.productName}`
                                                : null,
                                            ]
                                              .filter(Boolean)
                                              .join(' · ');
                                            return (
                                              <button
                                                key={`${item.id}-${idx}`}
                                                type="button"
                                                data-sheet-combo-item={String(
                                                  idx + 1,
                                                )}
                                                className={cn(
                                                  'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                                  companyActiveIndex ===
                                                    idx + 1 && 'bg-muted',
                                                )}
                                                onMouseDown={(e) =>
                                                  e.preventDefault()
                                                }
                                                onMouseEnter={() => {
                                                  if (companyActiveIndex < 0)
                                                    return;
                                                  setCompanyActiveIndex(
                                                    idx + 1,
                                                  );
                                                }}
                                                onClick={() => {
                                                  setCellsWithHistory(
                                                    (prev) => {
                                                      const next = {
                                                        ...prev,
                                                        [cellKey(
                                                          r,
                                                          COL_COMPANY,
                                                        )]: label,
                                                      };
                                                      next[cellKey(r, 1)] =
                                                        item.etaDate ?? '';
                                                      next[cellKey(r, 2)] =
                                                        (item.currencyName ??
                                                          item.currency ??
                                                          '') as string;
                                                      next[cellKey(r, 3)] =
                                                        item.unitPrice != null &&
                                                        Number.isFinite(item.unitPrice)
                                                          ? String(item.unitPrice)
                                                          : '';
                                                      next[cellKey(r, 4)] =
                                                        item.exportCountryName ?? '';
                                                      next[cellKey(r, 5)] =
                                                        item.productName ?? '';
                                                      next[cellKey(r, 6)] =
                                                        item.grade ?? '';
                                                      next[cellKey(r, 7)] =
                                                        item.packing ?? '';
                                                      next[cellKey(r, 8)] =
                                                        (item.salesNotes ?? item.notes ?? '') || '';
                                                      if (
                                                        sheetRowStringsChanged(
                                                          prev,
                                                          next,
                                                          r,
                                                        )
                                                      ) {
                                                        schedulePersistRow(
                                                          r,
                                                          extractRowStrings(
                                                            next,
                                                            r,
                                                          ),
                                                        );
                                                      }
                                                      return next;
                                                    },
                                                  );
                                                  onAfterEdit?.(r, COL_COMPANY);
                                                  setEditing(null);
                                                }}
                                              >
                                                <div className="truncate font-medium">
                                                  {label || '—'}
                                                </div>
                                                {sub ? (
                                                  <div className="truncate text-xs text-muted-foreground">
                                                    {sub}
                                                  </div>
                                                ) : null}
                                              </button>
                                            );
                                          },
                                        )}
                                      </div>
                                    </ScrollArea>
                                    {comboListScrollEdgeOverlays}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : c === COL_STATUS ? (
                          <div
                            data-sheet-skip-global-keys
                            className={cn(
                              'absolute inset-0 z-[5] min-h-[28px] ring-2 ring-primary ring-inset',
                              rowStatusBgClass ?? 'bg-white',
                            )}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Popover defaultOpen modal={false}>
                              <PopoverAnchor asChild>
                                <div className="flex h-full min-h-0 w-full cursor-default items-center justify-between gap-2 px-2">
                                  <span className="min-w-0 truncate text-sm text-foreground">
                                    {(() => {
                                      if (draft === FIRST_COL_EMPTY) {
                                        return EMPTY_CELL_DISPLAY;
                                      }
                                      const selected = statusColSelectItems.find(
                                        (opt) => opt.value === draft,
                                      );
                                      return selected?.label ?? draft;
                                    })()}
                                  </span>
                                  <ChevronDown
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                </div>
                              </PopoverAnchor>
                              <PopoverContent
                                className="w-[min(100vw-1rem,320px)] p-2"
                                align="start"
                                side="bottom"
                                sideOffset={2}
                                collisionPadding={12}
                                onPointerDownOutside={() => {
                                  if (
                                    editingRef.current?.col === COL_STATUS
                                  ) {
                                    commitEdit();
                                  }
                                }}
                                onEscapeKeyDown={(ev) => {
                                  ev.preventDefault();
                                  cancelEdit();
                                }}
                              >
                                <div className="flex flex-col gap-2">
                                  <input
                                    ref={statusSearchInputRef}
                                    type="text"
                                    readOnly={statusActiveIndex >= 0}
                                    className={cn(
                                      'placeholder:text-muted-foreground border-input h-8 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none',
                                      'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                      statusActiveIndex >= 0 &&
                                        'caret-transparent',
                                    )}
                                    placeholder="상태 검색"
                                    value={statusSearchTerm}
                                    onPointerDown={(e) =>
                                      comboSearchInputPointerDownReturnToTyping(
                                        e,
                                        statusActiveIndex,
                                        setStatusActiveIndex,
                                        suppressComboArrowDownRepeatAfterLeaveInputRef,
                                      )
                                    }
                                    onFocus={() => {
                                      suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                        false;
                                      setStatusActiveIndex(
                                        SHEET_COMBO_INPUT_MODE,
                                      );
                                    }}
                                    onChange={(e) => {
                                      suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                        false;
                                      setStatusSearchDirty(true);
                                      setStatusSearchTerm(e.target.value);
                                      setStatusActiveIndex(
                                        SHEET_COMBO_INPUT_MODE,
                                      );
                                    }}
                                    onKeyDown={(e) =>
                                      onStatusSearchKeyDown(e, r, c)
                                    }
                                    onWheel={handleComboScrollWheel}
                                    aria-label={`셀 ${colLetter(c)}${r + 1} 상태 검색`}
                                  />
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {statusSearchResults.length === 0 ? (
                                      <span>검색 결과가 없습니다.</span>
                                    ) : (
                                      <span>
                                        {statusSearchResults.length}건
                                      </span>
                                    )}
                                  </div>
                                  <div className="relative min-w-0 overflow-hidden rounded-md border border-border/60 bg-popover">
                                    <ScrollArea
                                      ref={statusScrollAreaRootRef}
                                      hideScrollbar
                                      className="h-[min(40vh,240px)]"
                                    >
                                      <div
                                        className="flex flex-col gap-0.5 py-0.5"
                                        role="listbox"
                                        aria-label="상태 목록"
                                      >
                                        <button
                                          type="button"
                                          data-sheet-combo-item="0"
                                          className={cn(
                                            'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                            statusActiveIndex === 0 &&
                                              'bg-muted',
                                          )}
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onMouseEnter={() =>
                                            setStatusActiveIndex(0)
                                          }
                                          onClick={() =>
                                            applyStatusSelection(
                                              r,
                                              c,
                                              FIRST_COL_EMPTY,
                                            )
                                          }
                                        >
                                          {SELECT_NONE_LABEL}
                                        </button>
                                        {statusSearchResults.map((opt, idx) => (
                                          <button
                                            key={`${opt.value}-${idx}`}
                                            type="button"
                                            data-sheet-combo-item={String(
                                              idx + 1,
                                            )}
                                            className={cn(
                                              'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                              statusActiveIndex === idx + 1 &&
                                                'bg-muted',
                                            )}
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onMouseEnter={() => {
                                              if (statusActiveIndex < 0)
                                                return;
                                              setStatusActiveIndex(idx + 1);
                                            }}
                                            onClick={() =>
                                              applyStatusSelection(
                                                r,
                                                c,
                                                opt.value,
                                              )
                                            }
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                    {comboListScrollEdgeOverlays}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : c === COL_BL ? (
                          <div
                            data-sheet-skip-global-keys
                            className={cn(
                              'absolute inset-0 z-[5] min-h-[28px] ring-2 ring-primary ring-inset',
                              rowStatusBgClass ?? 'bg-white',
                            )}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            {firstColumnProductOptionsLoading ||
                            sheetBlDropdownLoading ? (
                              <div className="flex w-full items-center gap-2 px-2 text-xs text-muted-foreground">
                                <Loader2
                                  className="h-4 w-4 shrink-0 animate-spin"
                                  aria-hidden
                                />
                                BL 목록 불러오는 중…
                              </div>
                            ) : (
                              <Popover defaultOpen modal={false}>
                                <PopoverAnchor asChild>
                                  <div className="flex h-full min-h-0 w-full cursor-default items-center justify-between gap-2 px-2">
                                    <span className="min-w-0 truncate text-sm text-foreground">
                                      {(() => {
                                        if (draft === FIRST_COL_EMPTY) {
                                          return EMPTY_CELL_DISPLAY;
                                        }
                                        const selected =
                                          secondColSelectItems.find(
                                            (opt) => opt.value === draft,
                                          );
                                        return selected?.label ?? draft;
                                      })()}
                                    </span>
                                    <ChevronDown
                                      className="size-3.5 shrink-0 text-muted-foreground"
                                      aria-hidden
                                    />
                                  </div>
                                </PopoverAnchor>
                                <PopoverContent
                                  className="w-[min(100vw-1rem,min(90vw,420px))] p-2"
                                  align="start"
                                  side="bottom"
                                  sideOffset={2}
                                  collisionPadding={12}
                                  onPointerDownOutside={() => {
                                    if (editingRef.current?.col === COL_BL) {
                                      commitEdit();
                                    }
                                  }}
                                  onEscapeKeyDown={(ev) => {
                                    ev.preventDefault();
                                    cancelEdit();
                                  }}
                                >
                                  <div className="flex flex-col gap-2">
                                    <input
                                      ref={blSearchInputRef}
                                      type="text"
                                      readOnly={blActiveIndex >= 0}
                                      className={cn(
                                        'placeholder:text-muted-foreground border-input h-8 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none',
                                        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                        blActiveIndex >= 0 &&
                                          'caret-transparent',
                                      )}
                                      placeholder="BL / BK 검색"
                                      value={blSearchTerm}
                                      onPointerDown={(e) =>
                                        comboSearchInputPointerDownReturnToTyping(
                                          e,
                                          blActiveIndex,
                                          setBlActiveIndex,
                                          suppressComboArrowDownRepeatAfterLeaveInputRef,
                                        )
                                      }
                                      onFocus={() => {
                                        suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                          false;
                                        setBlActiveIndex(
                                          SHEET_COMBO_INPUT_MODE,
                                        );
                                      }}
                                      onChange={(e) => {
                                        suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                          false;
                                        setBlSearchDirty(true);
                                        setBlSearchTerm(e.target.value);
                                        setBlActiveIndex(
                                          SHEET_COMBO_INPUT_MODE,
                                        );
                                      }}
                                      onKeyDown={(e) =>
                                        onBlSearchKeyDown(e, r, c)
                                      }
                                      onWheel={handleComboScrollWheel}
                                      aria-label={`셀 ${colLetter(c)}${r + 1} BL·BK 검색`}
                                    />
                                    <div className="relative min-w-0 overflow-hidden rounded-md border border-border/60 bg-popover">
                                      <ScrollArea
                                        ref={blScrollAreaRootRef}
                                        hideScrollbar
                                        className="h-[min(40vh,240px)]"
                                      >
                                        <div
                                          className="flex flex-col gap-0.5 py-0.5"
                                          role="listbox"
                                          aria-label="BL 목록"
                                        >
                                          <button
                                            type="button"
                                            data-sheet-combo-item="0"
                                            className={cn(
                                              'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                              blActiveIndex === 0 &&
                                                'bg-muted',
                                            )}
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onMouseEnter={() =>
                                              setBlActiveIndex(0)
                                            }
                                            onClick={() =>
                                              applyBlSelection(
                                                r,
                                                c,
                                                FIRST_COL_EMPTY,
                                              )
                                            }
                                          >
                                            {SELECT_NONE_LABEL}
                                          </button>
                                          {blSearchResults.map((opt, idx) => (
                                            <button
                                              key={`${opt.value}-${idx}`}
                                              type="button"
                                              data-sheet-combo-item={String(
                                                idx + 1,
                                              )}
                                              className={cn(
                                                'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                                blActiveIndex === idx + 1 &&
                                                  'bg-muted',
                                              )}
                                              onMouseDown={(e) =>
                                                e.preventDefault()
                                              }
                                              onMouseEnter={() => {
                                                if (blActiveIndex < 0) return;
                                                setBlActiveIndex(idx + 1);
                                              }}
                                              onClick={() =>
                                                applyBlSelection(
                                                  r,
                                                  c,
                                                  opt.value,
                                                )
                                              }
                                            >
                                              {'salesStatus' in opt ? (
                                                <BlOptionRow
                                                  bl={
                                                    (opt as SheetBlOption).label
                                                  }
                                                  salesStatus={
                                                    (opt as SheetBlOption)
                                                      .salesStatus
                                                  }
                                                  etaDate={
                                                    (opt as SheetBlOption)
                                                      .etaDate
                                                  }
                                                  orphan={Boolean(
                                                    (opt as SheetBlOption)
                                                      .orphan,
                                                  )}
                                                  availableContainerEquiv={
                                                    (opt as SheetBlOption)
                                                      .availableContainerEquiv
                                                  }
                                                  showAvailableBadge
                                                />
                                              ) : (
                                                <span className="font-mono text-xs">
                                                  {opt.value}
                                                </span>
                                              )}
                                            </button>
                                          ))}
                                        </div>
                                      </ScrollArea>
                                      {comboListScrollEdgeOverlays}
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        ) : c === COL_VEHICLE ? (
                          <div
                            data-sheet-skip-global-keys
                            className={cn(
                              'absolute inset-0 z-[5] min-h-[28px] ring-2 ring-primary ring-inset',
                              rowStatusBgClass ?? 'bg-white',
                            )}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Popover defaultOpen modal={false}>
                              <PopoverAnchor asChild>
                                <div className="flex h-full min-h-0 w-full cursor-default items-center justify-between gap-2 px-2">
                                  <span className="min-w-0 truncate text-sm text-foreground">
                                    {(() => {
                                      if (draft === FIRST_COL_EMPTY) {
                                        return EMPTY_CELL_DISPLAY;
                                      }
                                      const stored = draft.startsWith(
                                        '__legacy__:',
                                      )
                                        ? draft.slice('__legacy__:'.length)
                                        : draft;
                                      return (
                                        requestVehicleLabelMap.get(stored) ??
                                        stored
                                      );
                                    })()}
                                  </span>
                                  <ChevronDown
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                </div>
                              </PopoverAnchor>
                              <PopoverContent
                                className="w-[min(100vw-1rem,320px)] p-2"
                                align="start"
                                side="bottom"
                                sideOffset={2}
                                collisionPadding={12}
                                onPointerDownOutside={() => {
                                  if (
                                    editingRef.current?.col === COL_VEHICLE
                                  ) {
                                    commitEdit();
                                  }
                                }}
                                onEscapeKeyDown={(ev) => {
                                  ev.preventDefault();
                                  cancelEdit();
                                }}
                              >
                                <div className="flex flex-col gap-2">
                                  <input
                                    ref={vehicleSearchInputRef}
                                    type="text"
                                    readOnly={vehicleActiveIndex >= 0}
                                    className={cn(
                                      'placeholder:text-muted-foreground border-input h-8 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none',
                                      'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                      vehicleActiveIndex >= 0 &&
                                        'caret-transparent',
                                    )}
                                    placeholder="차량분류 검색"
                                    value={vehicleSearchTerm}
                                    onPointerDown={(e) =>
                                      comboSearchInputPointerDownReturnToTyping(
                                        e,
                                        vehicleActiveIndex,
                                        setVehicleActiveIndex,
                                        suppressComboArrowDownRepeatAfterLeaveInputRef,
                                      )
                                    }
                                    onFocus={() => {
                                      suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                        false;
                                      setVehicleActiveIndex(
                                        SHEET_COMBO_INPUT_MODE,
                                      );
                                    }}
                                    onChange={(e) => {
                                      suppressComboArrowDownRepeatAfterLeaveInputRef.current =
                                        false;
                                      setVehicleSearchDirty(true);
                                      setVehicleSearchTerm(e.target.value);
                                      setVehicleActiveIndex(
                                        SHEET_COMBO_INPUT_MODE,
                                      );
                                    }}
                                    onKeyDown={(e) =>
                                      onVehicleSearchKeyDown(e, r, c)
                                    }
                                    onWheel={handleComboScrollWheel}
                                    aria-label={`셀 ${colLetter(c)}${r + 1} 차량분류 검색`}
                                  />
                                  <div className="relative min-w-0 overflow-hidden rounded-md border border-border/60 bg-popover">
                                    <ScrollArea
                                      ref={vehicleScrollAreaRootRef}
                                      hideScrollbar
                                      className="h-[min(40vh,240px)]"
                                    >
                                      <div
                                        className="flex flex-col gap-0.5 py-0.5"
                                        role="listbox"
                                        aria-label="차량분류 목록"
                                      >
                                        <button
                                          type="button"
                                          data-sheet-combo-item="0"
                                          className={cn(
                                            'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                            vehicleActiveIndex === 0 &&
                                              'bg-muted',
                                          )}
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onMouseEnter={() =>
                                            setVehicleActiveIndex(0)
                                          }
                                          onClick={() =>
                                            applyVehicleSelection(
                                              r,
                                              c,
                                              FIRST_COL_EMPTY,
                                            )
                                          }
                                        >
                                          {SELECT_NONE_LABEL}
                                        </button>
                                        {vehicleSearchResults.map(
                                          (opt, idx) => (
                                            <button
                                              key={`${opt.value}-${idx}`}
                                              type="button"
                                              data-sheet-combo-item={String(
                                                idx + 1,
                                              )}
                                              className={cn(
                                                'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                                                vehicleActiveIndex ===
                                                  idx + 1 && 'bg-muted',
                                              )}
                                              onMouseDown={(e) =>
                                                e.preventDefault()
                                              }
                                              onMouseEnter={() => {
                                                if (vehicleActiveIndex < 0)
                                                  return;
                                                setVehicleActiveIndex(
                                                  idx + 1,
                                                );
                                              }}
                                              onClick={() =>
                                                applyVehicleSelection(
                                                  r,
                                                  c,
                                                  opt.value,
                                                )
                                              }
                                            >
                                              {opt.label}
                                            </button>
                                          ),
                                        )}
                                      </div>
                                    </ScrollArea>
                                    {comboListScrollEdgeOverlays}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : isSheetNumericColumn(c) ? (
                          <input
                            ref={numericInputRef}
                            data-sheet-skip-global-keys
                            data-sheet-text-cell
                            inputMode="decimal"
                            className={cn(
                              'absolute inset-0 z-[5] box-border h-full w-full min-w-0 border-0 px-2 text-sm leading-normal outline-none ring-2 ring-primary ring-inset',
                              rowStatusBgClass ?? 'bg-white',
                            )}
                            value={draft}
                            onChange={(e) =>
                              setDraft(
                                sanitizeSheetNumericInput(e.target.value),
                              )
                            }
                            onBlur={commitEdit}
                            onKeyDown={onInputKeyDown}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label={`셀 ${colLetter(c)}${r + 1}`}
                          />
                        ) : (
                          <div
                            ref={textEditorRef}
                            key={`te-${r}-${c}-${textEditorKey}`}
                            role="textbox"
                            aria-multiline="false"
                            aria-label={`셀 ${colLetter(c)}${r + 1}`}
                            contentEditable
                            suppressContentEditableWarning
                            spellCheck={false}
                            data-sheet-skip-global-keys
                            data-sheet-text-cell
                            className={cn(
                              'absolute inset-0 z-[5] flex h-full min-h-[28px] w-full min-w-0 items-center overflow-hidden text-ellipsis whitespace-nowrap border-0 px-2 pb-0.5 pt-[5px] text-sm leading-normal outline-none ring-2 ring-primary ring-inset',
                              rowStatusBgClass ?? 'bg-white',
                            )}
                            onBlur={commitEdit}
                            onKeyDown={onTextCellKeyDown}
                            onPointerDown={(e) => e.stopPropagation()}
                            onPaste={(e) => {
                              e.preventDefault();
                              const t = e.clipboardData.getData('text/plain');
                              if (!t) return;
                              try {
                                document.execCommand('insertText', false, t);
                              } catch {
                                /* ignore */
                              }
                            }}
                          />
                        )
                      }
                    </td>
                  );
                })}
              </tr>
                );
              })
            )}
          </tbody>
        </table>
        {fillOutlineBox ? (
          <div
            className="pointer-events-none absolute z-[36] box-border rounded-[1px] border-2 border-dashed border-primary bg-transparent"
            style={{
              left: fillOutlineBox.left,
              top: fillOutlineBox.top,
              width: Math.max(0, fillOutlineBox.width),
              height: Math.max(0, fillOutlineBox.height),
            }}
            aria-hidden
          />
        ) : null}
        </div>
      </div>
      <div
        className="shrink-0 border-t border-border bg-muted/30 px-3 py-1.5 text-xs"
        aria-live="polite"
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="shrink-0 font-mono font-medium text-foreground tabular-nums">
            {selectionStatusBar.rangeStr}
          </span>
          <span className="min-w-0 break-words text-muted-foreground">
            {selectionStatusBar.primary}
          </span>
        </div>
        {selectionStatusBar.hint ? (
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/85">
            {selectionStatusBar.hint}
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={excelImportDialogOpen}
        onOpenChange={setExcelImportDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>엑셀로 복구</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span>
                다운로드한 양식과 동일한 헤더를 유지한 파일입니다.{' '}
                <span className="font-medium text-foreground">
                  {excelImportRowCount}개
                </span>{' '}
                행을 불러왔습니다. 행번호가 같은 칸은 덮어쓰고 서버에 저장합니다.
                계속할까요?
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">취소</AlertDialogCancel>
            <Button type="button" size="sm" onClick={confirmExcelImport}>
              적용
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {sheetContextMenu != null &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[200]"
              aria-hidden
              onPointerDown={() => setSheetContextMenu(null)}
            />
            <div
              data-sheet-context-menu
              role="menu"
              className="bg-popover text-popover-foreground fixed z-[201] min-w-[240px] rounded-md border border-border/80 p-0.5 shadow-md"
              style={{
                left: Math.max(
                  8,
                  Math.min(
                    sheetContextMenu.x,
                    typeof window !== 'undefined'
                      ? window.innerWidth - 248
                      : sheetContextMenu.x,
                  ),
                ),
                top: Math.max(
                  8,
                  Math.min(
                    sheetContextMenu.y,
                    typeof window !== 'undefined'
                      ? window.innerHeight -
                          (sheetContextMenu.variant === 'row-header' ? 200 : 52)
                      : sheetContextMenu.y,
                  ),
                ),
              }}
            >
              {sheetContextMenu.variant === 'row-header' ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2.5 rounded-sm px-2.5 py-2 text-sm font-normal text-foreground hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none dark:hover:bg-muted/60"
                    onClick={() => {
                      const { anchor: a, focus: f } = anchorFocusRef.current;
                      const r0 = Math.min(a.row, f.row);
                      const r1 = Math.max(a.row, f.row);
                      const n = r1 - r0 + 1;
                      insertRowsAtFromContextMenu(r0, n, r0);
                    }}
                  >
                    <Plus
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                      strokeWidth={2}
                    />
                    {(() => {
                      const { anchor: a, focus: f } = anchorFocusRef.current;
                      const n = Math.abs(a.row - f.row) + 1;
                      return `위에 행 ${n}개 삽입`;
                    })()}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2.5 rounded-sm px-2.5 py-2 text-sm font-normal text-foreground hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none dark:hover:bg-muted/60"
                    onClick={() => {
                      const { anchor: a, focus: f } = anchorFocusRef.current;
                      const r0 = Math.min(a.row, f.row);
                      const r1 = Math.max(a.row, f.row);
                      const n = r1 - r0 + 1;
                      insertRowsAtFromContextMenu(r1 + 1, n, r1 + 1);
                    }}
                  >
                    <Plus
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                      strokeWidth={2}
                    />
                    {(() => {
                      const { anchor: a, focus: f } = anchorFocusRef.current;
                      const n = Math.abs(a.row - f.row) + 1;
                      return `아래에 행 ${n}개 삽입`;
                    })()}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2.5 rounded-sm px-2.5 py-2 text-sm font-normal text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:outline-none"
                    onClick={() => deleteSelectedRowsFromContextMenu()}
                  >
                    <Trash2 className="size-4 shrink-0" aria-hidden />
                    {(() => {
                      const { anchor: a, focus: f } = anchorFocusRef.current;
                      const n = Math.abs(a.row - f.row) + 1;
                      return n > 1 ? `행 삭제 (${n}행)` : '행 삭제';
                    })()}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2.5 rounded-sm px-2.5 py-2 text-sm font-normal text-foreground hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none dark:hover:bg-muted/60"
                    onClick={() => clearSelectedRowsDataFromContextMenu()}
                  >
                    <X
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                      strokeWidth={2}
                    />
                    {(() => {
                      const { anchor: a, focus: f } = anchorFocusRef.current;
                      const n = Math.abs(a.row - f.row) + 1;
                      return n > 1
                        ? `행 데이터 삭제 (${n}행)`
                        : '행 데이터 삭제';
                    })()}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-2.5 rounded-sm px-2.5 py-2 text-sm font-normal text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:outline-none"
                  onClick={() => deleteSelectedRowsFromContextMenu()}
                >
                  <Trash2 className="size-4 shrink-0" aria-hidden />
                  {(() => {
                    const { anchor: a, focus: f } = anchorFocusRef.current;
                    const n = Math.abs(a.row - f.row) + 1;
                    return `선택한 행 삭제 (${n}행)`;
                  })()}
                </Button>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
});

QuotationSheetGrid.displayName = 'QuotationSheetGrid';
