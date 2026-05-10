'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { useFinanceInventoryPendingByBl } from '@/lib/hooks/use-trade-contracts';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { FinanceInventoryPendingDetailDrawer } from '@/components/finance/finance-inventory-pending-detail-drawer';
import { Button } from '@/components/ui/button';
import { Download, Filter } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { useColumnSettings } from '@/hooks/use-column-settings';

/** BL 단위 행 (API 응답) */
type BLRow = {
  orderId: string;
  exporterName: string | null;
  exportCountryName: string | null;
  /** 상품 코드 — API `product`, 상품 필터와 동일 */
  product?: string | null;
  productName: string | null;
  salesGrade: string | null;
  bk: string | null;
  bl: string | null;
  inboundWarehouse: string | null;
  inboundIgodate: string | null;
  inboundQuarantineDate: string | null;
  inboundCustomsScheduledDate: string | null;
  inboundDtDate: string | null;
  pendingPurchaseCost: string | null;
  packingType: string | null;
  destinationName: string | null;
  etaDate: string | null;
  containerCount: number;
  totalBales: number;
  totalKg: number;
  /** 상세 Drawer용 첫 번째 컨테이너 ID */
  firstContainerId: string;
  invoiceAmount: number | null;
  invoiceCurrency: string | null;
  invoiceCurrencyName: string | null;
  comparisonExchangeRate: number | null;
  appliedExchangeRate: number | null;
};

export default function FinanceInventoryPendingPage() {
  const columnSettings = useColumnSettings('finance-inventory-pending');
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('inboundCustomsScheduledDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState<string>('');
  const [selectedProductValues, setSelectedProductValues] = useState<Set<string>>(new Set());
  const productFilterDefaultAppliedRef = useRef(false);
  const financePendingProductFilterDomId = React.useId();
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [excelExportLoading, setExcelExportLoading] = useState(false);

  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');

  const productFilterOptions = useMemo(
    () =>
      productCodes
        .filter((c): c is typeof c & { value: string } => !!c.value)
        .map((c) => ({ value: c.value, label: c.name || c.value })),
    [productCodes],
  );

  const productOptionsKey = useMemo(
    () => productFilterOptions.map((o) => o.value).sort().join('|'),
    [productFilterOptions],
  );

  const selectedProductValuesKeySorted = useMemo(
    () => [...selectedProductValues].sort().join('|'),
    [selectedProductValues],
  );

  const allProductsSelected = useMemo(
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

  useEffect(() => {
    if (productFilterOptions.length === 0 || !productOptionsKey) return;
    if (!productFilterDefaultAppliedRef.current) {
      productFilterDefaultAppliedRef.current = true;
      setSelectedProductValues(new Set(productFilterOptions.map((o) => o.value)));
    }
  }, [productOptionsKey]);

  const productNamesParam = useMemo(() => {
    if (productFilterOptions.length === 0) return undefined;
    if (selectedProductValues.size === 0) {
      return productFilterDefaultAppliedRef.current ? [] : undefined;
    }
    if (allProductsSelected) return undefined;
    return Array.from(selectedProductValues);
  }, [productFilterOptions.length, allProductsSelected, selectedProductValues]);

  const { data: blRowsRaw = [], isLoading: isBlRowsLoading } = useFinanceInventoryPendingByBl({
    search: search || undefined,
    productNames: productNamesParam,
    dateFrom: dateRange.start?.toISOString().slice(0, 10),
    dateTo: dateRange.end?.toISOString().slice(0, 10),
  });
  const blRows: BLRow[] = useMemo(() => {
    const raw = Array.isArray(blRowsRaw) ? blRowsRaw : [];
    return raw.map((r: BLRow & { inboundCustomsScheduledDate?: string | null; product?: string | null }) => ({
      ...r,
      product: r.product ?? null,
      // 통관예정일: customsScheduledDate 우선, 없으면 dtDate (기존 데이터 호환)
      inboundCustomsScheduledDate: r.inboundCustomsScheduledDate ?? r.inboundDtDate ?? null,
    }));
  }, [blRowsRaw]);

  const blRowsAfterProductClient = useMemo(() => {
    if (productNamesParam === undefined) return blRows;
    if (productNamesParam.length === 0) return [];
    const allow = new Set(productNamesParam);
    return blRows.filter((r) => {
      const code = r.product?.trim();
      if (!code) return false;
      return allow.has(code);
    });
  }, [blRows, productNamesParam]);

  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    void checkAuth();
  }, []);

  const resolveDestinationLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const destination = destinationCodes?.find((c) => c.value === code || c.name === code);
      return destination?.name || destination?.value || code;
    },
    [destinationCodes],
  );

  const handleSortChange = useCallback((column: string, order: 'asc' | 'desc') => {
    setSortBy(column);
    setSortOrder(order);
    setPage(1);
  }, []);

  const handleDownloadExcel = useCallback(async () => {
    setExcelExportLoading(true);
    try {
      const sp = new URLSearchParams();
      if (search?.trim()) sp.set('search', search.trim());
      if (productNamesParam !== undefined) {
        if (productNamesParam.length === 0) sp.append('productName', '');
        else productNamesParam.forEach((p) => sp.append('productName', p));
      }
      if (dateRange.start) sp.set('dateFrom', dateRange.start.toISOString().slice(0, 10));
      if (dateRange.end) sp.set('dateTo', dateRange.end.toISOString().slice(0, 10));
      sp.set('sortBy', sortBy);
      sp.set('sortOrder', sortOrder);
      const qs = sp.toString();

      const response = await api.get(
        `/trade/contracts/finance/inventory-pending/export/excel${qs ? `?${qs}` : ''}`,
        { responseType: 'blob' },
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `입고예정재고_재무_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({ title: '다운로드 완료', description: '엑셀 파일이 다운로드되었습니다.' });
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
  }, [search, productNamesParam, dateRange.start, dateRange.end, sortBy, sortOrder]);

  const sortedBlRows = useMemo(() => {
    return [...blRowsAfterProductClient].sort((a, b) => {
      let aValue: any = a[sortBy as keyof BLRow];
      let bValue: any = b[sortBy as keyof BLRow];
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';
      if (typeof aValue === 'string') aValue = aValue.toUpperCase();
      if (typeof bValue === 'string') bValue = bValue.toUpperCase();
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [blRowsAfterProductClient, sortBy, sortOrder]);

  const paginatedBlRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedBlRows.slice(start, start + pageSize);
  }, [sortedBlRows, page, pageSize]);

  const total = sortedBlRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns: ColumnDef<BLRow>[] = useMemo(
    () => [
      { accessorKey: 'exporterName', header: '수출사', cell: ({ row }) => <div>{row.getValue('exporterName') as string || '-'}</div> },
      { accessorKey: 'exportCountryName', header: '수출국', cell: ({ row }) => <div>{row.getValue('exportCountryName') as string || '-'}</div> },
      { accessorKey: 'productName', header: '상품명', cell: ({ row }) => <div>{row.getValue('productName') as string || '-'}</div> },
      { accessorKey: 'bk', header: 'bk', cell: ({ row }) => <div>{row.getValue('bk') as string || '-'}</div> },
      { accessorKey: 'bl', header: 'bl', cell: ({ row }) => <div className="font-medium">{row.getValue('bl') as string || '-'}</div> },
      {
        accessorKey: 'containerCount',
        header: '컨테이너 수량',
        cell: ({ row }) => <div className="text-right">{row.original.containerCount}</div>,
        meta: { align: 'right' },
      },
      {
        accessorKey: 'totalKg',
        header: '중량',
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.totalKg.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}
          </div>
        ),
        meta: { align: 'right' },
      },
      {
        accessorKey: 'invoiceAmount',
        header: '중량 인보이스금액',
        cell: ({ row }) => {
          const amount = row.original.invoiceAmount;
          const code = (row.original.invoiceCurrency ?? '').trim().toUpperCase();
          if (amount == null) return <div className="text-right">-</div>;
          const formatted = Number(amount).toLocaleString('ko-KR', { maximumFractionDigits: 0 });
          const symbolMap: Record<string, string> = {
            USD: '$', EUR: '€', KRW: '₩', GBP: '£', JPY: '¥', CNY: '¥', CHF: 'CHF', AUD: 'A$', CAD: 'C$',
          };
          const symbol = code ? (symbolMap[code] ?? code) : '';
          return <div className="text-right">{symbol ? `${symbol} ${formatted}` : formatted}</div>;
        },
        meta: { align: 'right' },
      },
      { accessorKey: 'destinationName', header: '목적지', cell: ({ row }) => <div>{resolveDestinationLabel(row.getValue('destinationName') as string)}</div> },
      {
        accessorKey: 'inboundCustomsScheduledDate',
        header: '통관예정일',
        cell: ({ row }) => <div className="font-medium">{row.getValue('inboundCustomsScheduledDate') as string || '-'}</div>,
      },
      { accessorKey: 'etaDate', header: 'ETA', cell: ({ row }) => <div>{row.getValue('etaDate') as string || '-'}</div> },
    ],
    [resolveDestinationLabel],
  );

  if (loading) {
    return (
      <AppLayout user={user}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-3 min-w-0 max-w-full">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">입고예정 재고</h1>
            <p className="text-sm text-muted-foreground mt-1">
              송장·통관예정일 확인용 입고예정 재고입니다.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            disabled={excelExportLoading}
            className="shrink-0"
          >
            <Download className="mr-2 h-4 w-4" />
            {excelExportLoading ? '다운로드 중...' : '엑셀 다운로드'}
          </Button>
        </div>

        <DataTable
          isLoading={isBlRowsLoading}
          columns={columns}
          data={paginatedBlRows}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          manualPagination={true}
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          rowClassName="h-10"
          onRowClick={(row) => {
            setSelectedOrderId(row.orderId);
            setDetailDrawerOpen(true);
          }}
          filterControls={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="searchFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">검색</Label>
                <Input
                  id="searchFilter"
                  value={search}
                  placeholder="B/K, B/L, 컨테이너번호, 상품명 검색"
                  className="w-64"
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">통관예정일</Label>
                <DateRangePicker
                  startDate={dateRange.start}
                  endDate={dateRange.end}
                  onChange={(start, end) => {
                    setDateRange({ start, end });
                    setPage(1);
                  }}
                  placeholder="기간 선택"
                />
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
                          id={`${financePendingProductFilterDomId}-all`}
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
                        <Label htmlFor={`${financePendingProductFilterDomId}-all`} className="text-sm font-medium cursor-pointer flex-1">
                          전체
                        </Label>
                      </div>
                      {productFilterOptions.map((opt, index) => (
                        <div
                          key={opt.value}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                        >
                          <Checkbox
                            id={`${financePendingProductFilterDomId}-row-${index}`}
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
                            htmlFor={`${financePendingProductFilterDomId}-row-${index}`}
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
            </div>
          }
        />

        <FinanceInventoryPendingDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) setSelectedOrderId(null);
          }}
          orderId={selectedOrderId}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'finance', 'inventory-pending'] })}
        />
      </div>
    </AppLayout>
  );
}
