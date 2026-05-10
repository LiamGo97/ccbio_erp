'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import {
  TradeOrder,
  useTradeOrders,
  formatOrderSequence,
} from '@/lib/hooks/use-trade-orders';
import { PaymentPendingDetailDrawer } from '@/components/finance/payment-pending-detail-drawer';
import { useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Download, Filter, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useColumnSettings } from '@/hooks/use-column-settings';
import * as XLSX from 'xlsx';

// 쿠키에서 페이지당 행수 읽기
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

type PaymentResultFilterToken = 'pending' | 'completed';

const PAYMENT_RESULT_FILTER_OPTIONS: { value: PaymentResultFilterToken; label: string }[] = [
  { value: 'pending', label: '결제 대기' },
  { value: 'completed', label: '결제 완료' },
];

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (num % 1 === 0) {
    return num.toLocaleString('ko-KR');
  }
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface PaymentRow extends TradeOrder {
  payment: {
    id?: string;
    sequence: number;
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    krwAmount?: number | null;
    result?: string | null;
    notes?: string | null;
    paymentType?: string | null;
  };
  /** true면 부킹 단계 `bookingTempPayments`에서 온 행 (정식 `payments` 아님) */
  isTempBookingPayment?: boolean;
}

function PaymentManagementPageContent() {
  const columnSettings = useColumnSettings('finance-payment-management');
  const [user, setUser] = React.useState<User | null>(null);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedTradeOrderId, setSelectedTradeOrderId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [sortBy, setSortBy] = React.useState<string>('paymentDueDate');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [dueDateStartDate, setDueDateStartDate] = React.useState<Date | undefined>(undefined);
  const [dueDateEndDate, setDueDateEndDate] = React.useState<Date | undefined>(undefined);
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = React.useState<Set<PaymentResultFilterToken>>(
    () =>
      new Set(
        tabParam === 'completed'
          ? (['completed'] as const)
          : tabParam === 'pending'
            ? (['pending'] as const)
            : (['pending', 'completed'] as const),
      ),
  );
  /** 상품 필터 값 = 계약 `productName`과 동일한 PRODUCT 코드 (표시명이 아님 — 입고예정 재무와 동일) */
  const [selectedProductValues, setSelectedProductValues] = React.useState<Set<string>>(new Set());
  const productFilterDefaultAppliedRef = React.useRef(false);
  const [excelExportLoading, setExcelExportLoading] = React.useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  /** PRODUCT 코드 기준이어도 Label htmlFor는 인덱스+useId로 고정(다른 필터·페이지와 id 충돌 방지) */
  const productFilterDomId = React.useId();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  React.useEffect(() => {
    if (tabParam === 'completed') setSelectedPaymentStatuses(new Set(['completed']));
    else if (tabParam === 'pending') setSelectedPaymentStatuses(new Set(['pending']));
    else if (tabParam === 'all') setSelectedPaymentStatuses(new Set(['pending', 'completed']));
  }, [tabParam]);

  const { data: paymentTermsCodes } = useCodesByCategory('PAYMENT_TERMS');

  const getPaymentMethodName = (value: string | null | undefined) => {
    if (!value) return null;
    const code = paymentTermsCodes?.find((c) => c.value === value);
    return code?.name || value;
  };

  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');

  const productFilterOptions = React.useMemo(
    () =>
      productCodes
        .filter((c): c is typeof c & { value: string } => !!c.value)
        .map((c) => ({ value: c.value, label: c.name || c.value })),
    [productCodes],
  );

  const productOptionsKey = React.useMemo(
    () => productFilterOptions.map((o) => o.value).sort().join('|'),
    [productFilterOptions],
  );

  const selectedProductValuesKeySorted = React.useMemo(
    () => [...selectedProductValues].sort().join('|'),
    [selectedProductValues],
  );

  const allProductsSelected = React.useMemo(
    () =>
      productFilterOptions.length > 0 &&
      selectedProductValues.size === productFilterOptions.length &&
      selectedProductValuesKeySorted === productOptionsKey,
    [
      productFilterOptions.length,
      productOptionsKey,
      selectedProductValues.size,
      selectedProductValuesKeySorted,
    ],
  );

  // productOptionsKey만 의존: 옵션 집합이 바뀔 때만. 최초 1회만 전체 선택(이전에는 key 바뀔 때마다 사용자 선택이 덮어씌워짐)
  React.useEffect(() => {
    if (productFilterOptions.length === 0 || !productOptionsKey) return;
    if (!productFilterDefaultAppliedRef.current) {
      productFilterDefaultAppliedRef.current = true;
      setSelectedProductValues(new Set(productFilterOptions.map((o) => o.value)));
    }
  }, [productOptionsKey]);

  const productNamesParam = React.useMemo(() => {
    if (productFilterOptions.length === 0) return undefined;
    if (selectedProductValues.size === 0) {
      return productFilterDefaultAppliedRef.current ? [] : undefined;
    }
    if (allProductsSelected) return undefined;
    return Array.from(selectedProductValues);
  }, [productFilterOptions.length, allProductsSelected, selectedProductValues]);

  const { data: documentsOrders = [], isLoading: isLoadingDocuments } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DOCUMENTS',
    productNames: productNamesParam,
  });
  const { data: doOrders = [], isLoading: isLoadingDo } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DO',
    productNames: productNamesParam,
  });
  const { data: customsOrders = [], isLoading: isLoadingCustoms } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'CUSTOMS',
    productNames: productNamesParam,
  });
  const { data: bookingOrders = [], isLoading: isLoadingBooking } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'BOOKING',
    productNames: productNamesParam,
  });

  const paymentMatchesStatusFilter = React.useCallback(
    (result: string | null | undefined) => {
      if (selectedPaymentStatuses.size === 0) return false;
      const pendingSelected = selectedPaymentStatuses.has('pending');
      const completedSelected = selectedPaymentStatuses.has('completed');
      if (pendingSelected && completedSelected) return true;
      if (pendingSelected) return !result || result === 'PENDING';
      if (completedSelected) return result === 'COMPLETED';
      return false;
    },
    [selectedPaymentStatuses],
  );

  const applyPaymentStatusSelection = React.useCallback((next: Set<PaymentResultFilterToken>) => {
    setSelectedPaymentStatuses(next);
    setPage(1);
    const url = new URL(window.location.href);
    if (next.size === 0 || (next.has('pending') && next.has('completed'))) {
      url.searchParams.delete('tab');
    } else if (next.has('pending')) {
      url.searchParams.set('tab', 'pending');
    } else {
      url.searchParams.set('tab', 'completed');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const tradeOrders = React.useMemo(() => {
    const all = [...documentsOrders, ...doOrders, ...customsOrders];
    const unique = new Map<string, TradeOrder>();
    all.forEach((o) => { if (!unique.has(o.id)) unique.set(o.id, o); });
    return Array.from(unique.values());
  }, [documentsOrders, doOrders, customsOrders]);

  const isLoading = isLoadingDocuments || isLoadingDo || isLoadingCustoms || isLoadingBooking;
  const refetch = React.useCallback(() => queryClient.invalidateQueries({ queryKey: ['trade-orders'] }), [queryClient]);

  const paymentRows = React.useMemo(() => {
    const filtered = tradeOrders.filter((o) => {
      if (!o.payments?.length) return false;
      if (productNamesParam !== undefined) {
        if (productNamesParam.length === 0) return false;
        const allow = new Set(productNamesParam);
        const code = (o.productCode ?? o.productName)?.trim();
        if (!code || !allow.has(code)) return false;
      }
      return true;
    });

    const rows: PaymentRow[] = [];
    filtered.forEach((order) => {
      if (!order.payments?.length) return;
      order.payments.forEach((payment) => {
        if (!paymentMatchesStatusFilter(payment.result)) return;
        if (dueDateStartDate || dueDateEndDate) {
          if (!payment.dueDate) return;
          const dueDate = new Date(payment.dueDate);
          if (Number.isNaN(dueDate.getTime())) return;
          const dueDateOnly = new Date(dueDate);
          dueDateOnly.setHours(0, 0, 0, 0);
          if (dueDateStartDate) {
            const start = new Date(dueDateStartDate);
            start.setHours(0, 0, 0, 0);
            if (dueDateOnly < start) return;
          }
          if (dueDateEndDate) {
            const end = new Date(dueDateEndDate);
            end.setHours(23, 59, 59, 999);
            if (dueDateOnly > end) return;
          }
        }
        rows.push({ ...order, payment, isTempBookingPayment: false });
      });
    });
    return rows;
  }, [tradeOrders, dueDateStartDate, dueDateEndDate, paymentMatchesStatusFilter, productNamesParam]);

  /** 부킹 단계만: 저장된 임시 결제 행 (DOCUMENTS/DO/CUSTOMS 주문에는 포함하지 않음) */
  const tempBookingPaymentRows = React.useMemo(() => {
    const rows: PaymentRow[] = [];
    bookingOrders.forEach((order) => {
      if (order.tradeStatus !== 'BOOKING') return;
      if (!order.bookingTempPayments?.length) return;
      if (productNamesParam !== undefined) {
        if (productNamesParam.length === 0) return;
        const allow = new Set(productNamesParam);
        const code = (order.productCode ?? order.productName)?.trim();
        if (!code || !allow.has(code)) return;
      }
      order.bookingTempPayments.forEach((payment) => {
        if (!paymentMatchesStatusFilter(payment.result)) return;
        if (dueDateStartDate || dueDateEndDate) {
          if (!payment.dueDate) return;
          const dueDate = new Date(payment.dueDate);
          if (Number.isNaN(dueDate.getTime())) return;
          const dueDateOnly = new Date(dueDate);
          dueDateOnly.setHours(0, 0, 0, 0);
          if (dueDateStartDate) {
            const start = new Date(dueDateStartDate);
            start.setHours(0, 0, 0, 0);
            if (dueDateOnly < start) return;
          }
          if (dueDateEndDate) {
            const end = new Date(dueDateEndDate);
            end.setHours(23, 59, 59, 999);
            if (dueDateOnly > end) return;
          }
        }
        rows.push({
          ...order,
          payment: { ...payment, paymentType: 'REGULAR' },
          isTempBookingPayment: true,
        });
      });
    });
    return rows;
  }, [bookingOrders, dueDateStartDate, dueDateEndDate, paymentMatchesStatusFilter, productNamesParam]);

  const allPaymentRows = React.useMemo(
    () => [...paymentRows, ...tempBookingPaymentRows],
    [paymentRows, tempBookingPaymentRows],
  );

  const getPaymentStatusLabel = React.useCallback((result: string | null | undefined) => {
    if (!result || result === 'PENDING') return '결제 대기';
    if (result === 'COMPLETED') return '결제 완료';
    return result;
  }, []);

  const getPaymentStatusBadgeStyle = React.useCallback((result: string | null | undefined) => {
    if (!result || result === 'PENDING') return 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300';
    if (result === 'COMPLETED') return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  }, []);

  const columns: ColumnDef<PaymentRow>[] = React.useMemo(() => {
    const baseColumns: ColumnDef<PaymentRow>[] = [
      {
        accessorKey: 'paymentKind',
        header: '구분',
        enableSorting: true,
        cell: ({ row }) =>
          row.original.isTempBookingPayment ? (
            <Badge
              variant="outline"
              className="whitespace-nowrap border-amber-500/80 bg-amber-50 text-amber-900 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              임시(부킹)
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">정식</span>
          ),
        size: 100,
      },
      { accessorKey: 'contractNo', header: '계약번호', enableSorting: true, cell: ({ row }) => <div className="text-sm">{row.original.contractNo || '-'}</div>, size: 140 },
      { accessorKey: 'sequence', header: '순번', enableSorting: true, cell: ({ row }) => <div className="text-sm font-mono">{formatOrderSequence(row.original.sequence, row.original.sequenceSub)}</div>, size: 80 },
      { accessorKey: 'exporterName', header: '수출사', enableSorting: true, cell: ({ row }) => <div className="text-sm">{row.original.exporterName || '-'}</div>, size: 120 },
      { accessorKey: 'bk', header: 'BK', enableSorting: true, cell: ({ row }) => <div className="text-sm">{row.original.bk || '-'}</div>, size: 180 },
      { accessorKey: 'bl', header: 'BL', enableSorting: true, cell: ({ row }) => <div className="text-sm">{row.original.bl || '-'}</div>, size: 180 },
      { accessorKey: 'productName', header: '상품', enableSorting: true, cell: ({ row }) => <div className="text-sm">{row.original.productName || '-'}</div>, size: 150 },
      {
        accessorKey: 'paymentStatus',
        header: '결제 상태',
        enableSorting: true,
        cell: ({ row }) => {
          const result = row.original.payment.result;
          return (
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                getPaymentStatusBadgeStyle(result),
                row.original.shipBack && 'line-through',
                row.original.isTempBookingPayment && 'ring-1 ring-amber-200/80 dark:ring-amber-800/50',
              )}
            >
              {getPaymentStatusLabel(result)}
            </Badge>
          );
        },
        size: 100,
      },
    ];
    baseColumns.push(
      { accessorKey: 'paymentDueDate', header: '결제 예정일', enableSorting: true, cell: ({ row }) => <div className="text-sm">{formatDate(row.original.payment.dueDate)}</div>, size: 130 },
      {
        accessorKey: 'paymentDetails',
        header: '결제 정보',
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original.payment;
          const pt = p.paymentType || 'REGULAR';
          const currency = row.original.invoiceCurrencyName || row.original.invoiceCurrency || row.original.currencyName || '';
          if (pt !== 'REGULAR') return <div className="text-sm">-</div>;
          const seq = `${p.sequence}차`;
          const amt = p.amount != null ? `${currency ? `${currency} ` : ''}${formatNumber(p.amount)}` : '-';
          const method = p.method ? (getPaymentMethodName(p.method) || p.method) : '-';
          const ex = p.exchangeRate != null ? Number(p.exchangeRate).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '-';
          return <div className="text-sm">{seq} / {amt} / {method} / {ex}</div>;
        },
        size: 280,
      },
      {
        accessorKey: 'paymentKrwAmount',
        header: '결제 금액 (원화)',
        enableSorting: true,
        cell: ({ row }) => <div className="text-sm text-right font-medium">{row.original.payment.krwAmount != null ? `${formatNumber(row.original.payment.krwAmount)}원` : '-'}</div>,
        size: 150,
      },
      {
        accessorKey: 'paymentNotes',
        header: '비고',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm min-w-[120px] max-w-[320px] whitespace-pre-wrap break-words">
            {row.original.payment.notes || '-'}
          </div>
        ),
        size: 280,
      },
      { accessorKey: 'managerUser', header: '등록자', enableSorting: true, cell: ({ row }) => <div className="text-sm">{row.original.managerUser?.name || '-'}</div>, size: 120 },
    );
    return baseColumns;
  }, [paymentTermsCodes, getPaymentStatusLabel, getPaymentStatusBadgeStyle]);

  const getSortValue = React.useCallback((row: PaymentRow, key: string): string | number => {
    if (key === 'paymentKind') return row.isTempBookingPayment ? 1 : 0;
    if (key === 'paymentDueDate') return row.payment.dueDate ?? '';
    if (key === 'paymentStatus') return row.payment.result ?? 'PENDING';
    if (key === 'paymentKrwAmount') return row.payment.krwAmount ?? 0;
    if (key === 'sequence') return row.sequence * 1000 + (row.sequenceSub ?? 0);
    const v = (row as unknown as Record<string, unknown>)[key];
    if (key === 'managerUser') return (row.managerUser?.name ?? '') as string;
    if (v == null) return '';
    return v as string | number;
  }, []);

  const handleSortChange = React.useCallback((col: string, order: 'asc' | 'desc') => {
    setSortBy(col);
    setSortOrder(order);
    setPage(1);
  }, []);

  const sortedPaymentRows = React.useMemo(() => {
    const arr = [...allPaymentRows];
    const isDate = ['paymentDueDate'].includes(sortBy);
    const isNum = ['sequence', 'paymentKrwAmount', 'paymentKind'].includes(sortBy);
    arr.sort((a, b) => {
      const aVal = getSortValue(a, sortBy);
      const bVal = getSortValue(b, sortBy);
      if (aVal == null && bVal == null) return 0;
      if (aVal === '' && bVal === '') return 0;
      if (aVal === '' || aVal == null) return 1;
      if (bVal === '' || bVal == null) return -1;
      let cmp = 0;
      if (isNum || (typeof aVal === 'number' && typeof bVal === 'number')) {
        cmp = Number(aVal) - Number(bVal);
      } else if (isDate || (typeof aVal === 'string' && typeof bVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(aVal)))) {
        cmp = new Date(String(aVal)).getTime() - new Date(String(bVal)).getTime();
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [allPaymentRows, sortBy, sortOrder, getSortValue]);

  const paginatedRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedPaymentRows.slice(start, start + pageSize);
  }, [sortedPaymentRows, page, pageSize]);

  /** 엑셀 다운로드 - 필터 적용된 전체 데이터 */
  const handleExportExcel = React.useCallback(() => {
    if (sortedPaymentRows.length === 0) {
      toast({ title: '다운로드', description: '내보낼 데이터가 없습니다.', variant: 'destructive' });
      return;
    }
    setExcelExportLoading(true);
    try {
      const getMethodName = (value: string | null | undefined) => {
        if (!value) return null;
        const code = paymentTermsCodes?.find((c) => c.value === value);
        return code?.name || value;
      };
      const headers = ['구분', '계약번호', '순번', '수출사', 'BK', 'BL', '상품', '결제 상태', '결제 예정일', '결제 정보', '결제 금액 (원화)', '비고', '등록자'];
      const rows = sortedPaymentRows.map((row) => {
        const p = row.payment;
        const pt = p.paymentType || 'REGULAR';
        const currency = row.invoiceCurrencyName || row.invoiceCurrency || row.currencyName || '';
        let paymentDetails = '-';
        if (pt === 'REGULAR') {
          const seq = `${p.sequence}차`;
          const amt = p.amount != null ? `${currency ? `${currency} ` : ''}${formatNumber(p.amount)}` : '-';
          const method = p.method ? (getMethodName(p.method) || p.method) : '-';
          const ex = p.exchangeRate != null ? Number(p.exchangeRate).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '-';
          paymentDetails = `${seq} / ${amt} / ${method} / ${ex}`;
        }
        const statusLabel = !p.result || p.result === 'PENDING' ? '결제 대기' : p.result === 'COMPLETED' ? '결제 완료' : p.result;
        const krwText = p.krwAmount != null ? `${formatNumber(p.krwAmount)}원` : '-';
        return [
          row.isTempBookingPayment ? '임시(부킹)' : '정식',
          row.contractNo || '-',
          formatOrderSequence(row.sequence, row.sequenceSub),
          row.exporterName || '-',
          row.bk || '-',
          row.bl || '-',
          row.productName || '-',
          statusLabel,
          formatDate(p.dueDate),
          paymentDetails,
          krwText,
          p.notes || '-',
          row.managerUser?.name || '-',
        ];
      });
      const wsData = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '결제관리');
      const filename = `결제관리_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast({ title: '다운로드 완료', description: `${sortedPaymentRows.length}건 엑셀 파일이 다운로드되었습니다.` });
    } catch (err) {
      console.error('엑셀 다운로드 오류:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast({
        title: '다운로드 실패',
        description: error.response?.data?.message || '엑셀 파일 다운로드에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setExcelExportLoading(false);
    }
  }, [sortedPaymentRows, paymentTermsCodes, toast]);

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">결제관리</h1>
            <p className="hidden text-muted-foreground md:block">
              결제 대기 및 완료된 주문을 조회합니다.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={excelExportLoading || sortedPaymentRows.length === 0}
            className="shrink-0"
          >
            {excelExportLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            엑셀 다운로드
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={paginatedRows}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          onRowClick={(row) => { setSelectedTradeOrderId(row.id); setDetailDrawerOpen(true); }}
          manualPagination={true}
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          page={page}
          pageSize={pageSize}
          total={sortedPaymentRows.length}
          totalPages={Math.max(1, Math.ceil(sortedPaymentRows.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          rowClassName="h-10"
          getRowClassName={(row) => {
            const parts: string[] = [];
            if (row.shipBack === true) parts.push('line-through text-muted-foreground');
            if (row.isTempBookingPayment) parts.push('bg-amber-50/50 dark:bg-amber-950/15');
            return parts.length ? cn(...parts) : undefined;
          }}
          filterControls={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">결제 상태</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {selectedPaymentStatuses.size === PAYMENT_RESULT_FILTER_OPTIONS.length
                        ? '전체'
                        : selectedPaymentStatuses.size === 0
                          ? '선택 안됨'
                          : `${selectedPaymentStatuses.size}개 선택됨`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                        <Checkbox
                          id="payment-status-filter-all"
                          checked={selectedPaymentStatuses.size === PAYMENT_RESULT_FILTER_OPTIONS.length}
                          onCheckedChange={(checked: boolean) => {
                            if (checked) {
                              applyPaymentStatusSelection(new Set(PAYMENT_RESULT_FILTER_OPTIONS.map((o) => o.value)));
                            } else {
                              applyPaymentStatusSelection(new Set());
                            }
                          }}
                        />
                        <Label htmlFor="payment-status-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                          전체
                        </Label>
                      </div>
                      {PAYMENT_RESULT_FILTER_OPTIONS.map((opt) => (
                        <div
                          key={opt.value}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                        >
                          <Checkbox
                            id={`payment-status-filter-${opt.value}`}
                            checked={selectedPaymentStatuses.has(opt.value)}
                            onCheckedChange={(checked: boolean) => {
                              const next = new Set(selectedPaymentStatuses);
                              if (checked) next.add(opt.value);
                              else next.delete(opt.value);
                              applyPaymentStatusSelection(next);
                            }}
                          />
                          <Label htmlFor={`payment-status-filter-${opt.value}`} className="text-sm font-medium cursor-pointer flex-1">
                            {opt.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 min-w-40 max-w-52 justify-start">
                      <Filter className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {productFilterOptions.length === 0
                          ? '전체'
                          : allProductsSelected
                            ? '전체'
                            : selectedProductValues.size === 0
                              ? '선택 안됨'
                              : `${selectedProductValues.size}개 선택됨`}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3 max-h-[70vh] overflow-y-auto" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                        <Checkbox
                          id={`${productFilterDomId}-all`}
                          checked={productFilterOptions.length === 0 || allProductsSelected}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setSelectedProductValues(new Set(productFilterOptions.map((o) => o.value)));
                            } else if (checked === false) {
                              setSelectedProductValues(new Set());
                            }
                            setPage(1);
                          }}
                        />
                        <Label htmlFor={`${productFilterDomId}-all`} className="text-sm font-medium cursor-pointer flex-1">
                          전체
                        </Label>
                      </div>
                      {productFilterOptions.map((opt, index) => (
                        <div
                          key={opt.value}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                        >
                          <Checkbox
                            id={`${productFilterDomId}-row-${index}`}
                            checked={selectedProductValues.has(opt.value)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedProductValues);
                              if (checked === true) next.add(opt.value);
                              else if (checked === false) next.delete(opt.value);
                              setSelectedProductValues(next);
                              setPage(1);
                            }}
                          />
                          <Label
                            htmlFor={`${productFilterDomId}-row-${index}`}
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
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">결제 예정일 기간</Label>
                <DateRangePicker startDate={dueDateStartDate} endDate={dueDateEndDate} onChange={(s, e) => { setDueDateStartDate(s); setDueDateEndDate(e); setPage(1); }} className="w-64" />
              </div>
            </div>
          }
        />

        <PaymentPendingDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(o) => { setDetailDrawerOpen(o); if (!o) setSelectedTradeOrderId(null); }}
          bookingId={selectedTradeOrderId}
          onSuccess={refetch}
        />
      </div>
    </AppLayout>
  );
}

export default function PaymentManagementPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PaymentManagementPageContent />
    </Suspense>
  );
}
