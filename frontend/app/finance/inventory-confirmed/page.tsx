'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { useFinanceInventoryConfirmedByBl } from '@/lib/hooks/use-trade-contracts';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Download, Filter } from 'lucide-react';
import { FinanceInventoryConfirmedDetailDrawer } from '@/components/finance/finance-inventory-confirmed-detail-drawer';
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
  inboundWarehouseName: string | null;
  inboundDtDate: string | null;
  returnStatus: string | null;
  returnStatusName: string | null;
  returnStatusMixed: boolean;
  inventoryStatus: string | null;
  inventoryStatusMixed: boolean;
  packingType: string | null;
  packingName: string | null;
  destinationName: string | null;
  containerCount: number;
  totalBales: number;
  totalKg: number;
  availableBales: number;
  availableKg: number;
  firstContainerId: string;
  stoCost: number | null;
  dtCost: number | null;
  workFee: number | null;
  onsiteWorkFee?: number | null;
  confirmedPurchaseCost: string | null;
  finalPurchaseCost: string | null;
};

export default function FinanceInventoryConfirmedPage() {
  const columnSettings = useColumnSettings('finance-inventory-confirmed');
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('bl');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState<string>('');
  const [selectedProductValues, setSelectedProductValues] = useState<Set<string>>(new Set());
  const productFilterDefaultAppliedRef = useRef(false);
  const financeConfirmedProductFilterDomId = React.useId();
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedBlRow, setSelectedBlRow] = useState<BLRow | null>(null);

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

  const { data: blRowsRaw = [], isLoading: isBlRowsLoading } = useFinanceInventoryConfirmedByBl({
    search: search || undefined,
    productNames: productNamesParam,
  });
  const blRows: BLRow[] = useMemo(
    () =>
      (Array.isArray(blRowsRaw) ? blRowsRaw : []).map((r: BLRow & { product?: string | null }) => ({
        ...r,
        product: r.product ?? null,
      })),
    [blRowsRaw],
  );

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

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    void checkAuth();
  }, []);

  const handleSortChange = useCallback((column: string, order: 'asc' | 'desc') => {
    setSortBy(column);
    setSortOrder(order);
    setPage(1);
  }, []);

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

  const formatKg = useCallback((v: number | null) => {
    if (v == null) return '-';
    return v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) + ' kg';
  }, []);

  const handleDownloadCsv = useCallback(() => {
    const escapeCsv = (val: string): string => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const headers = ['상품명', 'BL', '재고중량', '총중량'];
    const rows = sortedBlRows.map((row) => {
      const availableText = formatKg(row.availableKg ?? null);
      const totalText = formatKg(row.totalKg ?? null);
      return [
        row.productName || '-', row.bl || '-',
        availableText, totalText,
      ].map((val) => escapeCsv(String(val ?? ''))).join(',');
    });
    const bom = '\uFEFF';
    const csv = bom + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `입고확정재고_재무_BL_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedBlRows, formatKg]);

  const columns: ColumnDef<BLRow>[] = useMemo(
    () => [
      { accessorKey: 'productName', header: '상품명', cell: ({ row }) => <div>{row.getValue('productName') as string || '-'}</div> },
      { accessorKey: 'bl', header: 'BL', cell: ({ row }) => <div className="font-medium">{row.getValue('bl') as string || '-'}</div> },
      {
        accessorKey: 'availableKg',
        header: '재고중량',
        cell: ({ row }) => {
          const r = row.original;
          const v = r.availableKg;
          const isNegative = v != null && v < 0;
          return (
            <div className="text-right">
              <span className={isNegative ? 'text-red-600 dark:text-red-400 font-medium' : undefined}>{formatKg(v)}</span>
            </div>
          );
        },
        meta: { align: 'right' },
      },
      {
        accessorKey: 'totalKg',
        header: '총중량',
        cell: ({ row }) => {
          const r = row.original;
          const v = r.totalKg;
          return (
            <div className="text-right">
              {formatKg(v)}
            </div>
          );
        },
        meta: { align: 'right' },
      },
    ],
    [formatKg],
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
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">입고확정 재고</h1>
            <p className="hidden text-muted-foreground md:block">
              BL 단위 재고 kg 및 이카운트 ERP 매칭용 입고확정 재고입니다.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadCsv} className="shrink-0">
            <Download className="mr-2 h-4 w-4" />
            CSV 다운로드
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
          onRowClick={(row) => { setSelectedBlRow(row); setDetailDrawerOpen(true); }}
          filterControls={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="searchFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">검색</Label>
                <Input id="searchFilter" value={search} placeholder="B/K, B/L, 컨테이너번호, 상품명 검색" className="w-64"
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
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
                          id={`${financeConfirmedProductFilterDomId}-all`}
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
                        <Label htmlFor={`${financeConfirmedProductFilterDomId}-all`} className="text-sm font-medium cursor-pointer flex-1">
                          전체
                        </Label>
                      </div>
                      {productFilterOptions.map((opt, index) => (
                        <div
                          key={opt.value}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                        >
                          <Checkbox
                            id={`${financeConfirmedProductFilterDomId}-row-${index}`}
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
                            htmlFor={`${financeConfirmedProductFilterDomId}-row-${index}`}
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

        <FinanceInventoryConfirmedDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => { setDetailDrawerOpen(open); if (!open) setSelectedBlRow(null); }}
          blRow={selectedBlRow}
          onInventoryAdjustmentSuccess={() => queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'finance', 'inventory-confirmed'] })}
        />
      </div>
    </AppLayout>
  );
}
