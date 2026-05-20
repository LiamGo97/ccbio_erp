'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, CheckCircle, Filter, Download, Loader2, AlertCircle } from 'lucide-react';
import { useIssuedInvoices, SalesInvoice, useAvailableSalesItems, fetchIssuedInvoices } from '@/lib/hooks/use-invoices';
import { flattenIssuedInvoicesForExcel, downloadIssuedInvoicesExcel } from '@/lib/issued-invoices-excel';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { InvoiceIssueDrawer } from '@/components/sales/invoice-issue-drawer';
import { InvoiceDetailDrawer } from '@/components/sales/invoice-detail-drawer';
import Cookies from 'js-cookie';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodes, type Code } from '@/lib/hooks/use-codes';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { format } from 'date-fns';
import { useColumnSettings } from '@/hooks/use-column-settings';

/** ISO 문자열이 타임존 없이 오면 UTC로 간주 (판매관리·운송관리와 동일) */
const parseAsUtcIfNeeded = (value: string): string => {
  const s = String(value).trim();
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (isIsoLike && !hasTimezone) {
    return s.replace(/\.\d{3}$/, '') + 'Z';
  }
  return s;
};

/** 등록일시/수정일시/발행일시용 - 한국시간 표시 (판매관리·운송관리와 동일) */
const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(parseAsUtcIfNeeded(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** 수정일시가 현재시간 5분 이내인지 여부 (노란색 배경 강조용, 판매관리와 동일) */
const isUpdatedWithin5Minutes = (updatedAt?: string | null): boolean => {
  if (!updatedAt) return false;
  const updated = new Date(parseAsUtcIfNeeded(updatedAt));
  if (Number.isNaN(updated.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  return diffMs >= 0 && diffMs <= 5 * 60 * 1000;
};

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) {
      return parsed;
    }
  }
  return 20;
};

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

/** 거래명세서 상세정보(InvoiceDetailDrawer)와 동일 계열 */
function abbreviateHeavyPackingSpec(spec: string): string {
  const key = spec.trim().toUpperCase().replace(/\s+/g, '_');
  if (key === 'HEAVY_BALE' || key === 'HEAVY_BALES') return '헤';
  return spec;
}

/** 상세 Drawer `getItemBl` / `getItemContainerNo` 와 동일 우선순위 */
function getInvoiceLineItemBl(item: any): string | null {
  if (item?.bl) return String(item.bl);
  const fromOrder = item?.salesItem?.container?.order?.bl;
  if (fromOrder) return String(fromOrder);
  return null;
}

function getInvoiceLineItemContainerNo(item: any): string | null {
  if (item?.containerNo) return String(item.containerNo);
  const no = item?.salesItem?.container?.containerNo;
  if (no) return String(no);
  return null;
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '-';
  // 숫자로 변환
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '-';
  
  // 소수점이 있는지 확인
  const hasDecimal = numValue % 1 !== 0;
  if (hasDecimal) {
    // 소수점이 있으면 최대 2자리까지 표시하되, 끝의 0은 제거
    const formatted = numValue.toLocaleString('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    // 끝의 0과 소수점 제거 (예: "1,000.50" -> "1,000.5", "1,000.00" -> "1,000")
    return formatted.replace(/\.?0+$/, '');
  }
  // 정수면 소수점 없이 표시 (3자리 콤마 포함)
  return numValue.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const ECOUNT_INVOICE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'processed', label: '처리완료' },
  { value: 'not_processed', label: '미처리' },
  { value: 'not_applicable', label: '해당없음' },
  { value: 'needs_confirmation', label: '확인 필요' },
];

/** DataTable 설정용 컬럼 id — `invoiceColumns` 정의 순서와 동일하게 유지 */
const INVOICE_MANAGEMENT_COLUMN_IDS: readonly string[] = [
  'invoiceNumber',
  'customerName',
  'supplier',
  'issuedAt',
  'items',
  'invoiceLineItems',
  'invoiceAmount',
  'issuedByUser',
  'updatedAt',
  'smsStatus',
  'ecountProcessingStatus',
];

/** 저장된 순서를 병합한 뒤, 거래명세서 항목은 항상 항목 수(items) 바로 다음 */
function mergeInvoiceManagementColumnOrder(saved: string[] | undefined): string[] {
  const defaultOrder = [...INVOICE_MANAGEMENT_COLUMN_IDS];
  const lineId = 'invoiceLineItems';
  const itemsId = 'items';

  const base =
    saved?.length
      ? [
          ...saved.filter((id) => defaultOrder.includes(id)),
          ...defaultOrder.filter((id) => !saved.includes(id)),
        ]
      : defaultOrder;

  const withoutLine = base.filter((id) => id !== lineId);
  const idxItems = withoutLine.indexOf(itemsId);
  if (idxItems >= 0) {
    return [...withoutLine.slice(0, idxItems + 1), lineId, ...withoutLine.slice(idxItems + 1)];
  }
  const idxAmt = withoutLine.indexOf('invoiceAmount');
  if (idxAmt >= 0) {
    return [...withoutLine.slice(0, idxAmt), lineId, ...withoutLine.slice(idxAmt)];
  }
  return [...withoutLine, lineId];
}

function InvoiceManagementPageContent() {
  const columnSettings = useColumnSettings('sales-invoice-management');

  const invoiceColumnOrder = React.useMemo(
    () => mergeInvoiceManagementColumnOrder(columnSettings.columnOrder),
    [columnSettings.columnOrder],
  );

  const handleInvoiceColumnOrderChange = React.useCallback(
    (order: string[]) => {
      columnSettings.onColumnOrderChange(mergeInvoiceManagementColumnOrder(order));
    },
    [columnSettings.onColumnOrderChange],
  );

  const [user, setUser] = React.useState<User | null>(null);
  const [issueDrawerOpen, setIssueDrawerOpen] = React.useState(false);
  const [selectedSalesIds, setSelectedSalesIds] = React.useState<string[]>([]);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [excelExportLoading, setExcelExportLoading] = React.useState(false);
  const [selectedSmsStatuses, setSelectedSmsStatuses] = React.useState<Set<string>>(new Set());
  const [selectedEcountStatuses, setSelectedEcountStatuses] = React.useState<Set<string>>(new Set());
  const [selectedSupplierIds, setSelectedSupplierIds] = React.useState<Set<string>>(new Set());
  const smsFilterDefaultAppliedRef = React.useRef(false);
  const ecountFilterDefaultAppliedRef = React.useRef(false);
  const supplierFilterDefaultAppliedRef = React.useRef(false);
  const [excludeCancelled, setExcludeCancelled] = React.useState<boolean>(false);
  const [issuedAtStartDate, setIssuedAtStartDate] = React.useState<Date | undefined>(undefined);
  const [issuedAtEndDate, setIssuedAtEndDate] = React.useState<Date | undefined>(undefined);
  const [sortBy, setSortBy] = React.useState<string>('invoiceNumber');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = React.useState('');
  const searchParams = useSearchParams();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // URL 쿼리 파라미터에서 invoice ID를 읽어서 상세 drawer 자동으로 열기
  React.useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam) {
      setSelectedInvoiceId(idParam);
      setDetailDrawerOpen(true);
      // URL에서 쿼리 파라미터 제거 (브라우저 히스토리 정리)
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  // URL 쿼리 파라미터에서 기간을 읽어서 날짜 필터 초기화 (대시보드에서 링크 시)
  React.useEffect(() => {
    const startParam = searchParams.get('issuedAtStart');
    const endParam = searchParams.get('issuedAtEnd');
    if (startParam && endParam) {
      const startDate = new Date(startParam);
      const endDate = new Date(endParam);
      if (!Number.isNaN(startDate.getTime())) setIssuedAtStartDate(startDate);
      if (!Number.isNaN(endDate.getTime())) setIssuedAtEndDate(endDate);
    }
  }, [searchParams]);

  const { data: suppliers } = useSuppliers({ status: true });

  // SMS 상태 코드 조회
  const { data: statusCodes } = useCodes({ group: 'SMS_STATUS' });
  // 이카운트 처리 상태 코드 조회
  const { data: ecountStatusCodes } = useCodes({ group: 'ECOUNT_PROCESSING_STATUS' });

  const smsFilterOptions = React.useMemo(() => {
    const isSmsStatusCode = (c: Code): c is Code & { value: string } =>
      Boolean(c.value) && c.value !== 'NOT_APPLICABLE';
    const fromCodes =
      statusCodes?.data?.filter(isSmsStatusCode).map((c) => ({ value: c.value, label: c.name })) ??
      [];
    return [
      { value: 'NONE', label: '미발송' },
      { value: 'not_applicable', label: '해당없음' },
      ...fromCodes,
    ];
  }, [statusCodes]);

  const supplierFilterOptions = React.useMemo(
    () => suppliers?.map((s) => ({ value: String(s.id), label: s.companyName })) ?? [],
    [suppliers],
  );

  const smsOptionsKey = React.useMemo(
    () => smsFilterOptions.map((o) => o.value).sort().join('|'),
    [smsFilterOptions],
  );
  const supplierOptionsKey = React.useMemo(
    () => supplierFilterOptions.map((o) => o.value).sort().join('|'),
    [supplierFilterOptions],
  );

  React.useEffect(() => {
    if (smsFilterOptions.length === 0) return;
    setSelectedSmsStatuses(new Set(smsFilterOptions.map((o) => o.value)));
    smsFilterDefaultAppliedRef.current = true;
  }, [smsOptionsKey]);

  React.useEffect(() => {
    setSelectedEcountStatuses(new Set(ECOUNT_INVOICE_FILTER_OPTIONS.map((o) => o.value)));
    ecountFilterDefaultAppliedRef.current = true;
  }, []);

  React.useEffect(() => {
    if (supplierFilterOptions.length === 0) return;
    setSelectedSupplierIds(new Set(supplierFilterOptions.map((o) => o.value)));
    supplierFilterDefaultAppliedRef.current = true;
  }, [supplierOptionsKey]);

  const smsStatusesParam = React.useMemo(() => {
    if (smsFilterOptions.length === 0 || selectedSmsStatuses.size === smsFilterOptions.length) {
      return undefined;
    }
    if (selectedSmsStatuses.size === 0) {
      return smsFilterDefaultAppliedRef.current ? [] : undefined;
    }
    return Array.from(selectedSmsStatuses);
  }, [smsFilterOptions.length, selectedSmsStatuses, smsFilterOptions]);

  const ecountProcessingStatusesParam = React.useMemo(() => {
    if (selectedEcountStatuses.size === ECOUNT_INVOICE_FILTER_OPTIONS.length) {
      return undefined;
    }
    if (selectedEcountStatuses.size === 0) {
      return ecountFilterDefaultAppliedRef.current ? [] : undefined;
    }
    return Array.from(selectedEcountStatuses);
  }, [selectedEcountStatuses]);

  const supplierIdsParam = React.useMemo(() => {
    if (supplierFilterOptions.length === 0 || selectedSupplierIds.size === supplierFilterOptions.length) {
      return undefined;
    }
    if (selectedSupplierIds.size === 0) {
      return supplierFilterDefaultAppliedRef.current ? [] : undefined;
    }
    return Array.from(selectedSupplierIds)
      .map((id) => parseInt(id, 10))
      .filter((n) => !Number.isNaN(n));
  }, [supplierFilterOptions.length, selectedSupplierIds, supplierFilterOptions]);

  /** 목록·엑셀 공통 (필터·정렬 동일) */
  const issuedListQueryParams = React.useMemo(
    () => ({
      search: search || undefined,
      smsStatuses: smsStatusesParam,
      ecountProcessingStatuses: ecountProcessingStatusesParam,
      supplierIds: supplierIdsParam,
      issuedAtStartDate: issuedAtStartDate ? format(issuedAtStartDate, 'yyyy-MM-dd') : undefined,
      issuedAtEndDate: issuedAtEndDate ? format(issuedAtEndDate, 'yyyy-MM-dd') : undefined,
      ...(excludeCancelled && { excludeCancelled: true as const }),
      sortBy,
      sortOrder,
    }),
    [
      search,
      smsStatusesParam,
      ecountProcessingStatusesParam,
      supplierIdsParam,
      issuedAtStartDate,
      issuedAtEndDate,
      excludeCancelled,
      sortBy,
      sortOrder,
    ],
  );

  const { data: issuedResponse, isLoading: isLoadingIssued } = useIssuedInvoices({
    page,
    limit: pageSize,
    ...issuedListQueryParams,
  });

  // 발행 가능한 판매항목 개수 조회 (total만 필요하므로 limit=1로 최소 조회)
  const { data: availableItemsResponse } = useAvailableSalesItems({
    page: 1,
    limit: 1,
  });

  const issuedInvoices = issuedResponse?.data || [];
  const issuedTotal = issuedResponse?.total || 0;
  const availableItemsCount = availableItemsResponse?.total || 0;

  // 정렬 변경 핸들러
  const handleSortChange = React.useCallback((newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1); // 정렬 변경 시 첫 페이지로
  }, []);

  const handleIssueInvoice = () => {
    setSelectedSalesIds([]);
    setIssueDrawerOpen(true);
  };

  const handleIssueSuccess = () => {
    setIssueDrawerOpen(false);
    setSelectedSalesIds([]);
  };

  const handleRowClick = (invoice: SalesInvoice) => {
    setSelectedInvoiceId(invoice.id);
    setDetailDrawerOpen(true);
  };

  /** 필터·정렬 동일, 페이지는 전체 — 품목이 여러 개면 행을 나눠 기록 */
  const handleExportExcel = React.useCallback(async () => {
    if (issuedTotal === 0) {
      toast({
        title: '다운로드',
        description: '보낼 거래명세서가 없습니다.',
        variant: 'destructive',
      });
      return;
    }
    setExcelExportLoading(true);
    try {
      const smsMap: Record<string, string> = {};
      statusCodes?.data?.forEach((c: Code) => {
        if (c.value) smsMap[String(c.value)] = c.name;
      });
      const ecMap: Record<string, string> = {};
      ecountStatusCodes?.data?.forEach((c: Code) => {
        if (c.value) ecMap[String(c.value)] = c.name;
      });

      const EXPORT_LIMIT_CAP = 50_000;
      const limit = Math.min(issuedTotal, EXPORT_LIMIT_CAP);
      const res = await fetchIssuedInvoices({
        ...issuedListQueryParams,
        page: 1,
        limit,
      });
      const list = res.data ?? [];
      const rows = flattenIssuedInvoicesForExcel(list, { sms: smsMap, ecount: ecMap });
      downloadIssuedInvoicesExcel(rows);

      const invoiceCount = list.length;
      const rowCount = rows.length;
      toast({
        title: '다운로드 완료',
        description:
          issuedTotal > EXPORT_LIMIT_CAP
            ? `필터 기준 상위 ${EXPORT_LIMIT_CAP}건만 저장했습니다. (${invoiceCount}건 명세, 품목 기준 ${rowCount}행)`
            : `필터 적용 전체 ${invoiceCount}건 명세, 품목 기준 ${rowCount}행으로 저장했습니다.`,
      });
    } catch (err) {
      console.error('[거래명세서 관리] 엑셀 다운로드', err);
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '다운로드 실패',
        description: message || '엑셀 파일을 만드는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setExcelExportLoading(false);
    }
  }, [issuedListQueryParams, issuedTotal, statusCodes?.data, ecountStatusCodes?.data]);

  // 이카운트 처리 상태 뱃지 생성 함수
  const getEcountStatusBadge = (status?: string | null) => {
    if (!status || status === 'NOT_PROCESSED') {
      return (
        <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
          미처리
        </Badge>
      );
    }
    if (status === 'NOT_APPLICABLE') {
      return (
        <Badge variant="outline" className="border-slate-400 bg-slate-100 text-slate-600 dark:border-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
          해당없음
        </Badge>
      );
    }
    if (status === 'PROCESSED') {
      const statusCode = ecountStatusCodes?.data?.find((code: { value?: string | null; name: string }) => code.value === status);
      const statusLabel = statusCode?.name || '처리완료';
      
      return (
        <Badge variant="outline" className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300">
          {statusLabel}
        </Badge>
      );
    }
    
    if (status === 'NEEDS_CONFIRMATION') {
      const statusCode = ecountStatusCodes?.data?.find((code: { value?: string | null; name: string }) => code.value === status);
      const statusLabel = statusCode?.name || '확인 필요';
      
      return (
        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300">
          {statusLabel}
        </Badge>
      );
    }
    
    // 알 수 없는 상태
    return (
      <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
        {status}
      </Badge>
    );
  };

  // SMS 상태 뱃지 생성 함수 (SMS 이력 페이지와 동일한 스타일)
  const getSmsStatusBadge = (status?: string | null) => {
    if (!status) {
      return (
        <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
          미발송
        </Badge>
      );
    }
    if (status === 'NOT_APPLICABLE') {
      return (
        <Badge
          variant="outline"
          className="border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300"
        >
          해당없음
        </Badge>
      );
    }
    const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
      SENT: {
        variant: 'outline',
        className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
      },
      PENDING: {
        variant: 'outline',
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      },
      FAILED: {
        variant: 'outline',
        className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
      },
      CANCELLED: {
        variant: 'outline',
        className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
      },
    };

    const style = statusStyles[status];
    if (!style) {
      return (
        <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
          {status}
        </Badge>
      );
    }

    const statusCode = statusCodes?.data?.find((code: { value?: string | null; name: string }) => code.value === status);
    const statusLabel = statusCode?.name || (status === 'SENT' ? '발송완료' : status === 'PENDING' ? '대기' : status === 'FAILED' ? '실패' : status === 'CANCELLED' ? '취소' : status);

    return (
      <Badge variant={style.variant} className={style.className}>
        {statusLabel}
      </Badge>
    );
  };

  // 발행된 거래명세서 목록 컬럼 (No는 DataTable showRowNumber로 공통 처리)
  const invoiceColumns: ColumnDef<SalesInvoice>[] = React.useMemo(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: '거래명세서 번호',
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{inv.invoiceNumber || '-'}</span>
              {inv.invoiceCancelled && (
                <Badge variant="outline" className="shrink-0 border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300 text-xs">
                  취소
                </Badge>
              )}
              {inv.salesCancelled && (
                <Badge variant="outline" className="shrink-0 border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300 text-xs">
                  판매 취소
                </Badge>
              )}
            </div>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'customerName',
        header: '고객명(대표자)',
        cell: ({ row }) => {
          const customer = row.original.customer;
          const companyName = customer?.companyName || '';
          const ceo = customer?.ceo || '';
          
          if (!companyName) return <div className="text-sm">-</div>;
          
          if (ceo) {
            return <div className="text-sm">{companyName} ({ceo})</div>;
          }
          return <div className="text-sm">{companyName}</div>;
        },
        size: 260,
      },
      {
        accessorKey: 'supplier',
        header: '공급자',
        cell: ({ row }) => {
          const supplier = row.original.supplier;
          return (
            <div className="text-sm">
              {supplier?.companyName || '-'}
            </div>
          );
        },
        size: 140,
      },
      {
        accessorKey: 'issuedAt',
        header: '발행일시',
        cell: ({ row }) => {
          return (
            <div className="text-sm">
              {row.original.issuedAt
                ? formatDateTime(row.original.issuedAt)
                : '-'}
            </div>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'items',
        header: '항목 수',
        cell: ({ row }) => {
          const items = row.original.items || [];
          return (
            <div className="text-sm tabular-nums whitespace-nowrap">
              {items.length}개
            </div>
          );
        },
        size: 72,
      },
      {
        id: 'invoiceLineItems',
        header: '거래명세서 항목',
        enableSorting: false,
        cell: ({ row }) => {
          const inv = row.original;
          const raw = inv.items || [];
          const sorted = [...raw].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          if (sorted.length === 0) {
            return <div className="text-sm text-muted-foreground">-</div>;
          }
          return (
            <div className="rounded-md border border-border w-full min-w-0 max-w-[min(98vw,1280px)] select-text">
              <table className="w-full text-xs border-collapse table-fixed">
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '11%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">
                      품목명
                    </th>
                    <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">BL</th>
                    <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">
                      컨테이너
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">
                      수량(단위 포함)
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">
                      단가
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">
                      공급가액
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">
                      부가세
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item, idx) => {
                    const itemAny = item as any;
                    const bl = getInvoiceLineItemBl(itemAny) || '-';
                    const containerNo = getInvoiceLineItemContainerNo(itemAny) || '-';
                    const qtyStr =
                      item.quantity != null
                        ? `${formatNumber(Number(item.quantity), 4)} ${item.unit || ''}`.trim()
                        : '-';
                    const unitPriceStr =
                      item.unitPrice != null ? `${formatNumber(Number(item.unitPrice), 0)}원` : '-';
                    const amountStr =
                      item.amount != null ? `${formatNumber(Number(item.amount), 0)}원` : '-';
                    const vatStr =
                      item.vatAmount == null
                        ? '-'
                        : Number(item.vatAmount) !== 0
                          ? `${formatNumber(Number(item.vatAmount), 0)}원`
                          : '0원';
                    const spec = itemAny.specification;
                    return (
                      <tr key={item.id ?? idx} className="border-b last:border-b-0">
                        <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">
                          <span className="text-sm">
                            {item.productName?.trim() || '-'}
                            {spec ? ` (${abbreviateHeavyPackingSpec(String(spec))})` : ''}
                          </span>
                        </td>
                        <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">
                          {bl}
                        </td>
                        <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">
                          {containerNo}
                        </td>
                        <td className="py-1 px-2 text-right overflow-hidden text-ellipsis border-r border-border last:border-r-0">
                          {qtyStr}
                        </td>
                        <td className="py-1 px-2 text-right overflow-hidden text-ellipsis border-r border-border last:border-r-0">
                          {unitPriceStr}
                        </td>
                        <td className="py-1 px-2 text-right overflow-hidden text-ellipsis font-medium border-r border-border last:border-r-0">
                          {amountStr}
                        </td>
                        <td className="py-1 px-2 text-right overflow-hidden text-ellipsis font-medium border-r border-border last:border-r-0">
                          {vatStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        },
        size: 750,
      },
      {
        accessorKey: 'invoiceAmount',
        header: '총 금액',
        cell: ({ row }) => {
          return (
            <div className="text-sm font-medium">
              {row.original.invoiceAmount
                ? formatCurrency(row.original.invoiceAmount) + '원'
                : '-'}
            </div>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'issuedByUser',
        header: '발행자',
        cell: ({ row }) => {
          return (
            <div className="text-sm">
              {row.original.issuedByUser?.name || '-'}
            </div>
          );
        },
        size: 120,
      },
      {
        accessorKey: 'updatedAt',
        header: '수정일시',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.updatedAt
              ? formatDateTime(row.original.updatedAt)
              : '-'}
          </div>
        ),
        size: 150,
      },
      {
        accessorKey: 'smsStatus',
        header: 'SMS 발송 상태',
        cell: ({ row }) => getSmsStatusBadge(row.original.smsStatus),
        size: 120,
      },
      {
        accessorKey: 'ecountProcessingStatus',
        header: '이카운트 처리',
        cell: ({ row }) => {
          return getEcountStatusBadge(row.original.ecountProcessingStatus);
        },
        size: 140,
      },
    ],
    [statusCodes, ecountStatusCodes, page, pageSize],
  );

  // 공통 DataTable 안에 넣을 필터 (운송관리 페이지와 동일한 패턴)
  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          업체명/고객명
        </Label>
        <Input
          id="search"
          value={search}
          placeholder="업체명, 고객명, 거래명세서 번호"
          className="w-48 md:w-60"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">SMS 발송 상태</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {smsFilterOptions.length === 0
                ? '전체'
                : selectedSmsStatuses.size === smsFilterOptions.length
                  ? '전체'
                  : selectedSmsStatuses.size === 0
                    ? '선택 안됨'
                    : `${selectedSmsStatuses.size}개 선택됨`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                <Checkbox
                  id="invoice-sms-filter-all"
                  checked={smsFilterOptions.length === 0 || selectedSmsStatuses.size === smsFilterOptions.length}
                  onCheckedChange={(checked: boolean) => {
                    if (checked) setSelectedSmsStatuses(new Set(smsFilterOptions.map((o) => o.value)));
                    else setSelectedSmsStatuses(new Set());
                    setPage(1);
                  }}
                />
                <Label htmlFor="invoice-sms-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                  전체
                </Label>
              </div>
              {smsFilterOptions.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                  <Checkbox
                    id={`invoice-sms-filter-${opt.value.replace(/[^a-zA-Z0-9_-]/g, '_')}`}
                    checked={selectedSmsStatuses.has(opt.value)}
                    onCheckedChange={(checked: boolean) => {
                      const next = new Set(selectedSmsStatuses);
                      if (checked) next.add(opt.value);
                      else next.delete(opt.value);
                      setSelectedSmsStatuses(next);
                      setPage(1);
                    }}
                  />
                  <Label
                    htmlFor={`invoice-sms-filter-${opt.value.replace(/[^a-zA-Z0-9_-]/g, '_')}`}
                    className="text-sm font-medium cursor-pointer flex-1"
                  >
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">이카운트 처리</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {selectedEcountStatuses.size === ECOUNT_INVOICE_FILTER_OPTIONS.length
                ? '전체'
                : selectedEcountStatuses.size === 0
                  ? '선택 안됨'
                  : `${selectedEcountStatuses.size}개 선택됨`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                <Checkbox
                  id="invoice-ecount-filter-all"
                  checked={selectedEcountStatuses.size === ECOUNT_INVOICE_FILTER_OPTIONS.length}
                  onCheckedChange={(checked: boolean) => {
                    if (checked) setSelectedEcountStatuses(new Set(ECOUNT_INVOICE_FILTER_OPTIONS.map((o) => o.value)));
                    else setSelectedEcountStatuses(new Set());
                    setPage(1);
                  }}
                />
                <Label htmlFor="invoice-ecount-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                  전체
                </Label>
              </div>
              {ECOUNT_INVOICE_FILTER_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                  <Checkbox
                    id={`invoice-ecount-filter-${opt.value}`}
                    checked={selectedEcountStatuses.has(opt.value)}
                    onCheckedChange={(checked: boolean) => {
                      const next = new Set(selectedEcountStatuses);
                      if (checked) next.add(opt.value);
                      else next.delete(opt.value);
                      setSelectedEcountStatuses(next);
                      setPage(1);
                    }}
                  />
                  <Label htmlFor={`invoice-ecount-filter-${opt.value}`} className="text-sm font-medium cursor-pointer flex-1">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">공급자</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {supplierFilterOptions.length === 0
                ? '전체'
                : selectedSupplierIds.size === supplierFilterOptions.length
                  ? '전체'
                  : selectedSupplierIds.size === 0
                    ? '선택 안됨'
                    : `${selectedSupplierIds.size}개 선택됨`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                <Checkbox
                  id="invoice-supplier-filter-all"
                  checked={
                    supplierFilterOptions.length === 0 ||
                    selectedSupplierIds.size === supplierFilterOptions.length
                  }
                  onCheckedChange={(checked: boolean) => {
                    if (checked) setSelectedSupplierIds(new Set(supplierFilterOptions.map((o) => o.value)));
                    else setSelectedSupplierIds(new Set());
                    setPage(1);
                  }}
                />
                <Label htmlFor="invoice-supplier-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                  전체
                </Label>
              </div>
              {supplierFilterOptions.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                  <Checkbox
                    id={`invoice-supplier-filter-${opt.value}`}
                    checked={selectedSupplierIds.has(opt.value)}
                    onCheckedChange={(checked: boolean) => {
                      const next = new Set(selectedSupplierIds);
                      if (checked) next.add(opt.value);
                      else next.delete(opt.value);
                      setSelectedSupplierIds(next);
                      setPage(1);
                    }}
                  />
                  <Label htmlFor={`invoice-supplier-filter-${opt.value}`} className="text-sm font-medium cursor-pointer flex-1">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          발행일시 기간
        </Label>
        <DateRangePicker
          startDate={issuedAtStartDate}
          endDate={issuedAtEndDate}
          onChange={(startDate, endDate) => {
            setIssuedAtStartDate(startDate);
            setIssuedAtEndDate(endDate);
            setPage(1);
          }}
          className="w-64"
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="excludeCancelled"
          checked={excludeCancelled}
          onCheckedChange={(checked) => {
            setExcludeCancelled(checked === true);
            setPage(1);
          }}
        />
        <Label htmlFor="excludeCancelled" className="text-sm font-medium text-muted-foreground cursor-pointer whitespace-nowrap">
          취소/판매취소 제외
        </Label>
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">거래명세서 관리</h1>
            <p className="hidden text-muted-foreground md:block">
              발행된 거래명세서를 조회하고 관리합니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* 발행 가능한 판매항목 개수 표시 */}
            {availableItemsCount > 0 ? (
              <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                <AlertCircle className="h-4 w-4" />
                <span>
                  발행 대기: <span className="font-semibold">{availableItemsCount}개</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>발행 대기: 0개</span>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={excelExportLoading || issuedTotal === 0}
              onClick={handleExportExcel}
            >
              {excelExportLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 shrink-0 animate-spin" />
                  엑셀 생성 중
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2 shrink-0" />
                  엑셀 다운로드
                </>
              )}
            </Button>
            <Button onClick={handleIssueInvoice}>
              <FileText className="h-4 w-4 mr-1" />
              거래명세서 발행
            </Button>
          </div>
        </div>

        <DataTable
          columns={invoiceColumns}
          data={issuedInvoices}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={invoiceColumnOrder}
          onColumnOrderChange={handleInvoiceColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoadingIssued}
          page={page}
          pageSize={pageSize}
          total={issuedTotal}
          totalPages={issuedResponse?.lastPage || Math.max(1, Math.ceil(issuedTotal / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            Cookies.set('data-table-page-size', size.toString());
          }}
          manualPagination={true}
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          skipTruncateColumnIds={['invoiceLineItems']}
          rowClassName="h-10"
          getRowClassName={(row) =>
            isUpdatedWithin5Minutes(row.updatedAt)
              ? 'bg-yellow-100 dark:bg-yellow-950/50 hover:!bg-yellow-200 dark:hover:!bg-yellow-900/60'
              : undefined
          }
          showRowNumber={true}
        />

        <InvoiceIssueDrawer
          open={issueDrawerOpen}
          onOpenChange={setIssueDrawerOpen}
          salesIds={selectedSalesIds}
          onSuccess={handleIssueSuccess}
        />

        {/* 상세 정보 Drawer - 항상 렌더링하여 애니메이션 보장 */}
        <InvoiceDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              // 애니메이션 완료 후 상태 초기화 (약 300ms 후)
              setTimeout(() => {
                setSelectedInvoiceId(null);
              }, 300);
            }
          }}
          invoiceId={selectedInvoiceId}
          title="거래명세서 상세정보"
          description="발행된 거래명세서 정보를 확인합니다."
          onSuccess={() => {
            // TODO: 목록 새로고침
          }}
        />
      </div>
    </AppLayout>
  );
}

export default function InvoiceManagementPage() {
  return (
    <Suspense fallback={
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    }>
      <InvoiceManagementPageContent />
    </Suspense>
  );
}

