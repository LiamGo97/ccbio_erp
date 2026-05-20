'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import {
  useSalesInventoryPendingByBlPacking,
  type SalesInventoryPendingByBlPackingRow,
} from '@/lib/hooks/use-trade-contracts';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Eye, EyeOff, Filter } from 'lucide-react';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { SalesInventoryPendingDetailDrawer } from '@/components/inventory/sales-inventory-pending-detail-drawer';

const INVENTORY_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '가용',
  RESERVED: '예약됨',
  PARTIALLY_RESERVED: '부분 예약',
  PARTIALLY_SOLD: '부분 판매중',
  PARTIALLY_SOLD_COMPLETED: '부분 판매완료',
  SELLING: '판매중',
  SOLD_OUT: '판매 완료',
};

export type SalesInventoryPendingPageContentProps = {
  instanceId: string;
  /** 상위 레이아웃(판매관리 신규)에 embed 시 AppLayout·대제목 생략 */
  embedded?: boolean;
  title?: string;
  description?: string;
};

export function SalesInventoryPendingPageContent({
  instanceId,
  embedded = false,
  title = '입고예정재고',
  description = 'BL·패킹 단위로 베일·중량을 합산합니다. 행을 클릭하면 BL 정보·컨테이너·연결 판매를 확인할 수 있습니다.',
}: SalesInventoryPendingPageContentProps) {
  const columnSettings = useColumnSettings(instanceId);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>('bl');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const productDefaultAppliedRef = useRef(false);
  const productFilterDomId = React.useId();
  const [selectedInventoryStatuses, setSelectedInventoryStatuses] = useState<Set<string>>(
    new Set([
      'AVAILABLE',
      'RESERVED',
      'PARTIALLY_RESERVED',
      'PARTIALLY_SOLD',
      'PARTIALLY_SOLD_COMPLETED',
      'SELLING',
      'SOLD_OUT', // 기존 입고확정재고와 동일 — 미선택 시 판매완료 컨이 목록·컨 수에서 빠짐
    ]),
  );
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<SalesInventoryPendingByBlPackingRow | null>(null);

  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');

  const availableProductCodes = useMemo(
    () =>
      productCodes
        .filter((c): c is typeof c & { value: string } => Boolean(c?.value?.trim()))
        .map((c) => c.value.trim())
        .sort((a, b) => a.localeCompare(b)),
    [productCodes],
  );

  const availableProductCodesKey = useMemo(
    () => availableProductCodes.join('\u0001'),
    [availableProductCodes],
  );

  const selectedProductsKeySorted = useMemo(
    () => [...selectedProducts].sort((a, b) => a.localeCompare(b)).join('\u0001'),
    [selectedProducts],
  );

  const allProductsSelected = useMemo(
    () =>
      availableProductCodes.length > 0 &&
      selectedProducts.size === availableProductCodes.length &&
      selectedProductsKeySorted === availableProductCodesKey,
    [
      availableProductCodes.length,
      availableProductCodesKey,
      selectedProducts.size,
      selectedProductsKeySorted,
    ],
  );

  const productsParam = useMemo(() => {
    if (availableProductCodes.length === 0) return undefined;
    if (selectedProducts.size === 0) {
      return productDefaultAppliedRef.current ? [] : undefined;
    }
    if (allProductsSelected) return undefined;
    return Array.from(selectedProducts);
  }, [availableProductCodes.length, allProductsSelected, selectedProducts]);

  const inventoryStatusParam = useMemo(() => {
    if (selectedInventoryStatuses.size === 0) return [];
    return Array.from(selectedInventoryStatuses);
  }, [selectedInventoryStatuses]);

  const { data: rowsRaw = [], isLoading: isRowsLoading } = useSalesInventoryPendingByBlPacking({
    search: search || undefined,
    productNames: productsParam,
    includeExcluded,
    inventoryStatus: inventoryStatusParam.length > 0 ? inventoryStatusParam : undefined,
  });

  const rows = useMemo(
    () => (Array.isArray(rowsRaw) ? rowsRaw : []),
    [rowsRaw],
  );

  useEffect(() => {
    if (availableProductCodes.length === 0 || !availableProductCodesKey) return;
    if (!productDefaultAppliedRef.current) {
      productDefaultAppliedRef.current = true;
      setSelectedProducts(new Set(availableProductCodes));
    }
  }, [availableProductCodesKey, availableProductCodes.length]);

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

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let aValue: string | number = a[sortBy as keyof SalesInventoryPendingByBlPackingRow] as string | number;
      let bValue: string | number = b[sortBy as keyof SalesInventoryPendingByBlPackingRow] as string | number;
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';
      if (typeof aValue === 'string') aValue = aValue.toUpperCase();
      if (typeof bValue === 'string') bValue = bValue.toUpperCase();
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, sortBy, sortOrder]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const formatQuantity = useCallback(
    (available: number | null, total: number | null, sold: number | null, maxDecimals: number) => {
      if (available == null || total == null) return { text: '-', hasRemaining: false as const };
      const fmt = (v: number) =>
        v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
      const eps = maxDecimals >= 3 ? 0.001 : 0.0001;
      const hasRemaining =
        (sold ?? 0) > eps || Math.abs(total - available) > eps;
      if (hasRemaining) {
        return {
          text: `${fmt(available)}/${fmt(total)}`,
          hasRemaining: true as const,
          available: fmt(available),
          total: fmt(total),
        };
      }
      return { text: fmt(total), hasRemaining: false as const, total: fmt(total) };
    },
    [],
  );

  const renderQuantityCell = useCallback(
    (
      available: number | null,
      total: number | null,
      sold: number | null,
      maxDecimals: number,
      unitSuffix?: string,
    ) => {
      const result = formatQuantity(available, total, sold, maxDecimals);
      const suffix = (v: string) => (unitSuffix && v !== '-' ? `${v} ${unitSuffix}` : v);
      if (!result.hasRemaining) {
        const isNegative = available != null && available < 0;
        return (
          <div className="truncate text-right" title={suffix(result.text)}>
            <span className={isNegative ? 'text-red-600 dark:text-red-400 font-medium' : undefined}>
              {suffix(result.text)}
            </span>
          </div>
        );
      }
      const isNegative = available != null && available < 0;
      const displayText = `${suffix(result.available!)} / ${suffix(result.total!)}`;
      return (
        <div className="flex items-center justify-end gap-1 truncate" title={displayText}>
          <span
            className={
              isNegative
                ? 'font-semibold text-red-600 dark:text-red-400'
                : 'font-semibold text-blue-600 dark:text-blue-400'
            }
          >
            {suffix(result.available!)}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">{suffix(result.total!)}</span>
        </div>
      );
    },
    [formatQuantity],
  );

  const inventoryStatusOptions = useMemo(
    () =>
      Object.entries(INVENTORY_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    [],
  );

  const renderMixedDate = useCallback(
    (mixed: boolean, value: string | null, fallback?: string | null) => {
      if (mixed) return <span className="text-muted-foreground">혼합</span>;
      const display = value || fallback;
      return (
        <div className="truncate" title={display || undefined}>
          {display || '-'}
        </div>
      );
    },
    [],
  );

  const columns: ColumnDef<SalesInventoryPendingByBlPackingRow>[] = useMemo(
    () => [
      {
        accessorKey: 'bl',
        header: 'BL',
        cell: ({ row }) => (
          <div className="font-medium">{row.getValue('bl') as string || '-'}</div>
        ),
      },
      {
        accessorKey: 'packingName',
        header: '패킹',
        cell: ({ row }) => {
          const r = row.original;
          return <div>{r.packingName || r.packingType || '-'}</div>;
        },
      },
      {
        accessorKey: 'productName',
        header: '상품명',
        cell: ({ row }) => <div>{row.getValue('productName') as string || '-'}</div>,
      },
      {
        accessorKey: 'inboundCustomsScheduledDate',
        header: '통관예정일',
        cell: ({ row }) => {
          const r = row.original;
          return renderMixedDate(
            r.customsScheduledMixed,
            r.inboundCustomsScheduledDate,
            r.inboundDtDate,
          );
        },
        size: 100,
      },
      {
        accessorKey: 'inboundIgodate',
        header: '이고날짜',
        cell: ({ row }) => {
          const r = row.original;
          return renderMixedDate(r.inboundIgodateMixed, r.inboundIgodate);
        },
        size: 95,
      },
      {
        accessorKey: 'inboundQuarantineDate',
        header: '검역날짜',
        cell: ({ row }) => {
          const r = row.original;
          return renderMixedDate(r.inboundQuarantineDateMixed, r.inboundQuarantineDate);
        },
        size: 95,
      },
      {
        accessorKey: 'availableBales',
        header: '베일(영업)',
        cell: ({ row }) => {
          const r = row.original;
          return renderQuantityCell(r.availableBales, r.totalBales, r.soldBales, 4);
        },
        meta: { align: 'right' },
        size: 100,
      },
      {
        accessorKey: 'availableKg',
        header: '중량',
        cell: ({ row }) => {
          const r = row.original;
          return renderQuantityCell(r.availableKg, r.totalKg, r.soldKg, 3, 'kg');
        },
        meta: { align: 'right' },
        size: 120,
      },
      {
        accessorKey: 'containerCount',
        header: '컨 수',
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{row.original.containerCount}</div>
        ),
        meta: { align: 'right' },
      },
      {
        accessorKey: 'inboundWarehouseName',
        header: '창고',
        cell: ({ row }) => {
          const r = row.original;
          if (r.inboundWarehouseMixed) return <span className="text-muted-foreground">혼합</span>;
          return <div>{r.inboundWarehouseName || '-'}</div>;
        },
      },
      {
        accessorKey: 'etaDate',
        header: 'ETA',
        cell: ({ row }) => {
          const r = row.original;
          return renderMixedDate(r.etaDateMixed, r.etaDate);
        },
        size: 100,
      },
    ],
    [renderMixedDate, renderQuantityCell],
  );

  if (loading) {
    if (embedded) {
      return <div className="text-muted-foreground text-sm py-8 text-center">로딩 중...</div>;
    }
    return (
      <AppLayout user={user}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    );
  }

  const pageBody = (
    <div className="space-y-4 pb-4">
      <div>
        {embedded ? (
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        )}
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

        <DataTable
          isLoading={isRowsLoading}
          columns={columns}
          data={paginatedRows}
          getRowId={(row) => row.rowKey}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          manualPagination
          enableSorting
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          rowClassName="h-10 cursor-pointer"
          onRowClick={(row) => {
            setSelectedRow(row);
            setDetailDrawerOpen(true);
          }}
          filterControls={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="salesInvPendingSearch" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  검색
                </Label>
                <Input
                  id="salesInvPendingSearch"
                  value={search}
                  placeholder="B/K, B/L, 컨테이너번호, 상품명"
                  className="w-64"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 min-w-40 max-w-52 justify-start">
                      <Filter className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {availableProductCodes.length === 0
                          ? '전체'
                          : allProductsSelected
                            ? '전체'
                            : selectedProducts.size === 0
                              ? '선택 안됨'
                              : `${selectedProducts.size}개 선택`}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3 max-h-[70vh] overflow-y-auto" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                        <Checkbox
                          id={`${productFilterDomId}-all`}
                          checked={availableProductCodes.length === 0 || allProductsSelected}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setSelectedProducts(new Set(availableProductCodes));
                            } else if (checked === false) {
                              setSelectedProducts(new Set());
                            }
                            setPage(1);
                          }}
                        />
                        <Label htmlFor={`${productFilterDomId}-all`} className="text-sm font-medium cursor-pointer flex-1">
                          전체
                        </Label>
                      </div>
                      {availableProductCodes.map((code, index) => (
                        <div
                          key={code}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                        >
                          <Checkbox
                            id={`${productFilterDomId}-${index}`}
                            checked={selectedProducts.has(code)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedProducts);
                              if (checked === true) next.add(code);
                              else if (checked === false) next.delete(code);
                              setSelectedProducts(next);
                              setPage(1);
                            }}
                          />
                          <Label
                            htmlFor={`${productFilterDomId}-${index}`}
                            className="text-sm font-medium cursor-pointer flex-1"
                          >
                            {productCodes.find((c) => c.value === code)?.name || code}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="salesInvPendingIncludeExcluded"
                  checked={includeExcluded}
                  onCheckedChange={(checked) => {
                    setIncludeExcluded(checked === true);
                    setPage(1);
                  }}
                />
                <Label htmlFor="salesInvPendingIncludeExcluded" className="text-sm cursor-pointer">
                  제외된 재고 포함
                </Label>
                {includeExcluded ? (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">재고상태</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 min-w-36 justify-start">
                      <Filter className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {selectedInventoryStatuses.size === inventoryStatusOptions.length
                          ? '전체'
                          : selectedInventoryStatuses.size === 0
                            ? '선택 안됨'
                            : `${selectedInventoryStatuses.size}개`}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="start">
                    <div className="space-y-2">
                      {inventoryStatusOptions.map((opt) => (
                        <div key={opt.value} className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50">
                          <Checkbox
                            checked={selectedInventoryStatuses.has(opt.value)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedInventoryStatuses);
                              if (checked === true) next.add(opt.value);
                              else next.delete(opt.value);
                              setSelectedInventoryStatuses(next);
                              setPage(1);
                            }}
                          />
                          <Label className="text-sm cursor-pointer flex-1">{opt.label}</Label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          }
        />

      <SalesInventoryPendingDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={(open) => {
          setDetailDrawerOpen(open);
          if (!open) setSelectedRow(null);
        }}
        row={selectedRow}
      />
    </div>
  );

  if (embedded) {
    return pageBody;
  }

  return <AppLayout user={user}>{pageBody}</AppLayout>;
}
