'use client';

import * as React from 'react';
import { ColumnDef, OnChangeFn, RowSelectionState } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type ContainerForBlGrouping = {
  id: string;
  orderId: string;
  bl?: string | null;
  bk?: string | null;
  packingType?: string | null;
  packingName?: string | null;
  productName?: string | null;
  exporterName?: string | null;
  exportCountryName?: string | null;
  salesGrade?: string | null;
  tradeGrade?: string | null;
  inboundStatus?: string | null;
  inventoryStatus?: string | null;
  etaDate?: string | null;
  warehouseName?: string | null;
  weight?: number | null;
  salesBales?: number | null;
  tradeBales?: number | null;
  availableBales?: number | null;
  soldBales?: number | null;
  availableWeight?: number | null;
  soldWeight?: number | null;
};

export type SalesBlPackingSelectRow = {
  rowKey: string;
  orderId: string;
  bl: string | null;
  bk: string | null;
  packingType: string | null;
  packingName: string | null;
  productName: string | null;
  exporterName: string | null;
  exportCountryName: string | null;
  salesGrade: string | null;
  tradeGrade: string | null;
  inboundStatus: string | null;
  inboundStatusMixed: boolean;
  inventoryStatus: string | null;
  inventoryStatusMixed: boolean;
  etaDate: string | null;
  etaDateMixed: boolean;
  warehouseName: string | null;
  warehouseMixed: boolean;
  containerCount: number;
  totalBales: number;
  availableBales: number;
  soldBales: number;
  totalKg: number;
  availableKg: number;
  soldKg: number;
  containers: ContainerForBlGrouping[];
};

function uniqueNonEmpty(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))];
}

export function getBlPackingRowKey(c: ContainerForBlGrouping): string {
  const orderId = String(c.orderId ?? c.id);
  const packingKey = (c.packingType ?? '').trim() || '__none__';
  return `${orderId}::${packingKey}`;
}

export function groupContainersByBlPacking<T extends ContainerForBlGrouping>(
  list: T[],
): (Omit<SalesBlPackingSelectRow, 'containers'> & { containers: T[] })[] {
  const map = new Map<string, T[]>();
  for (const c of list) {
    const key = getBlPackingRowKey(c);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }

  return Array.from(map.entries())
    .map(([rowKey, containers]) => {
      const first = containers[0];
      const totalBales = containers.reduce(
        (sum, c) => sum + (Number(c.salesBales ?? c.tradeBales ?? 0) || 0),
        0,
      );
      const availableBales = containers.reduce(
        (sum, c) => sum + (Number(c.availableBales ?? 0) || 0),
        0,
      );
      const soldBales = containers.reduce((sum, c) => sum + (Number(c.soldBales ?? 0) || 0), 0);
      const totalKg = containers.reduce((sum, c) => sum + (Number(c.weight ?? 0) || 0) * 1000, 0);
      const availableKg = containers.reduce(
        (sum, c) => sum + (Number(c.availableWeight ?? 0) || 0) * 1000,
        0,
      );
      const soldKg = containers.reduce((sum, c) => sum + (Number(c.soldWeight ?? 0) || 0) * 1000, 0);

      const invStatuses = uniqueNonEmpty(containers.map((c) => c.inventoryStatus));
      const inboundStatuses = uniqueNonEmpty(containers.map((c) => c.inboundStatus));
      const warehouses = uniqueNonEmpty(containers.map((c) => c.warehouseName));
      const etas = uniqueNonEmpty(containers.map((c) => c.etaDate));
      const salesGrades = uniqueNonEmpty(containers.map((c) => c.salesGrade));

      return {
        rowKey,
        orderId: String(first.orderId ?? first.id),
        bl: first.bl ?? null,
        bk: first.bk ?? null,
        packingType: first.packingType ?? null,
        packingName: first.packingName ?? null,
        productName: first.productName ?? null,
        exporterName: first.exporterName ?? null,
        exportCountryName: first.exportCountryName ?? null,
        salesGrade: salesGrades.length === 1 ? salesGrades[0] : null,
        tradeGrade: first.tradeGrade ?? null,
        inboundStatus: inboundStatuses.length === 1 ? inboundStatuses[0] : null,
        inboundStatusMixed: inboundStatuses.length > 1,
        inventoryStatus: invStatuses.length === 1 ? invStatuses[0] : null,
        inventoryStatusMixed: invStatuses.length > 1,
        etaDate: etas.length === 1 ? etas[0] : null,
        etaDateMixed: etas.length > 1,
        warehouseName: warehouses.length === 1 ? warehouses[0] : null,
        warehouseMixed: warehouses.length > 1,
        containerCount: containers.length,
        totalBales,
        availableBales,
        soldBales,
        totalKg,
        availableKg,
        soldKg,
        containers,
      };
    })
    .filter((r) => r.totalBales > 0 || r.totalKg >= 0.01);
}

const INBOUND_LABELS: Record<string, string> = {
  INBOUND_PENDING: '입고대기',
  INBOUND_SCHEDULED: '입고예정',
  INBOUND_CONFIRMED: '입고확정',
};

const INBOUND_STYLES: Record<string, string> = {
  INBOUND_PENDING:
    'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
  INBOUND_SCHEDULED:
    'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
  INBOUND_CONFIRMED:
    'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
};

const INVENTORY_LABELS: Record<string, string> = {
  AVAILABLE: '가용',
  RESERVED: '예약됨',
  PARTIALLY_RESERVED: '부분 예약',
  PARTIALLY_SOLD: '부분 판매중',
  PARTIALLY_SOLD_COMPLETED: '부분 판매완료',
  SELLING: '판매중',
  SOLD_OUT: '판매 완료',
};

const INVENTORY_STYLES: Record<string, string> = {
  AVAILABLE:
    'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
  RESERVED:
    'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
  PARTIALLY_RESERVED:
    'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
  PARTIALLY_SOLD:
    'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
  PARTIALLY_SOLD_COMPLETED:
    'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
  SELLING:
    'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
  SOLD_OUT:
    'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
};

function formatQtyCell(
  available: number | null,
  total: number | null,
  sold: number | null,
  maxDecimals: number,
) {
  if (available == null || total == null) return <span className="text-muted-foreground">-</span>;
  const eps = maxDecimals >= 3 ? 0.001 : 0.0001;
  const hasRemaining = (sold ?? 0) > eps || Math.abs(total - available) > eps;
  const fmt = (v: number) =>
    v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });

  if (!hasRemaining) {
    const isNegative = available < 0;
    return (
      <div className="truncate text-right">
        <span className={isNegative ? 'font-medium text-red-600 dark:text-red-400' : undefined}>
          {fmt(total)}
        </span>
      </div>
    );
  }

  const isNegative = available < 0;
  return (
    <div className="flex items-center justify-end gap-1 truncate">
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
      <span className="text-sm text-muted-foreground">{fmt(total)}</span>
    </div>
  );
}

function StatusBadge({
  status,
  mixed,
  labels,
  styles,
}: {
  status: string | null;
  mixed: boolean;
  labels: Record<string, string>;
  styles: Record<string, string>;
}) {
  if (mixed) return <span className="text-sm text-muted-foreground">혼합</span>;
  if (!status || !labels[status]) return <span className="text-sm text-muted-foreground">-</span>;
  return (
    <Badge variant="outline" className={styles[status]}>
      {labels[status]}
    </Badge>
  );
}

export function BlPackingSelectionTable({
  rows,
  salesGradeCodes,
  rowSelection,
  onRowSelectionChange,
  selectedInboundStatus,
  onInboundStatusChange,
  selectedInventoryStatus,
  onInventoryStatusChange,
  selectedProduct,
  onProductChange,
  products,
  bkBlSearch,
  setBkBlSearch,
  onSearch,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder,
  onSortChange,
}: {
  rows: SalesBlPackingSelectRow[];
  salesGradeCodes: Array<{ value: string; name: string }>;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  selectedInboundStatus: string;
  onInboundStatusChange: (value: string) => void;
  selectedInventoryStatus: string;
  onInventoryStatusChange: (value: string) => void;
  selectedProduct: string;
  onProductChange: (value: string) => void;
  products: Array<{ id: string; value?: string | null; name?: string | null }>;
  bkBlSearch: string;
  setBkBlSearch: (value: string) => void;
  onSearch: () => void;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
}) {
  const columns: ColumnDef<SalesBlPackingSelectRow>[] = React.useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <div className="flex w-full items-center justify-center px-2">
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div
            className="flex w-full items-center justify-center px-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
            />
          </div>
        ),
        enableSorting: false,
        size: 80,
      },
      {
        id: 'inboundStatus',
        accessorKey: 'inboundStatus',
        header: '입고 상태',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.inboundStatus}
            mixed={row.original.inboundStatusMixed}
            labels={INBOUND_LABELS}
            styles={INBOUND_STYLES}
          />
        ),
        size: 100,
      },
      {
        id: 'inventoryStatus',
        accessorKey: 'inventoryStatus',
        header: '재고 상태',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.inventoryStatus}
            mixed={row.original.inventoryStatusMixed}
            labels={INVENTORY_LABELS}
            styles={INVENTORY_STYLES}
          />
        ),
        size: 100,
      },
      {
        id: 'exportCountryName',
        accessorKey: 'exportCountryName',
        header: '수출국',
        enableSorting: true,
        cell: ({ row }) => row.original.exportCountryName || '-',
        size: 100,
      },
      {
        id: 'exporterName',
        accessorKey: 'exporterName',
        header: '수출사',
        enableSorting: true,
        cell: ({ row }) => row.original.exporterName || '-',
        size: 120,
      },
      {
        id: 'productName',
        accessorKey: 'productName',
        header: '상품',
        enableSorting: true,
        cell: ({ row }) => row.original.productName || '-',
        size: 120,
      },
      {
        id: 'bk',
        accessorKey: 'bk',
        header: 'BK',
        enableSorting: true,
        cell: ({ row }) => row.original.bk || '-',
        size: 140,
      },
      {
        id: 'bl',
        accessorKey: 'bl',
        header: 'BL',
        enableSorting: true,
        cell: ({ row }) => <span className="font-medium">{row.original.bl || '-'}</span>,
        size: 150,
      },
      {
        id: 'packingName',
        accessorKey: 'packingName',
        header: '패킹',
        enableSorting: true,
        cell: ({ row }) => row.original.packingName || row.original.packingType || '-',
        size: 100,
      },
      {
        id: 'containerCount',
        accessorKey: 'containerCount',
        header: '컨 수',
        enableSorting: true,
        cell: ({ row }) => row.original.containerCount.toLocaleString('ko-KR'),
        size: 72,
      },
      {
        id: 'etaDate',
        accessorKey: 'etaDate',
        header: 'ETA',
        enableSorting: true,
        cell: ({ row }) => {
          if (row.original.etaDateMixed) return <span className="text-muted-foreground">혼합</span>;
          const date = row.original.etaDate;
          return date ? new Date(date).toLocaleDateString('ko-KR') : '-';
        },
        size: 110,
      },
      {
        id: 'warehouseName',
        accessorKey: 'warehouseName',
        header: '창고',
        enableSorting: true,
        cell: ({ row }) => {
          if (row.original.warehouseMixed) return <span className="text-muted-foreground">혼합</span>;
          return row.original.warehouseName || '-';
        },
        size: 110,
      },
      {
        id: 'salesGrade',
        accessorKey: 'salesGrade',
        header: '등급(영업)',
        cell: ({ row }) => {
          const grade = row.original.salesGrade;
          return salesGradeCodes.find((c) => c.value === grade)?.name || grade || '-';
        },
        size: 100,
      },
      {
        id: 'availableKg',
        accessorKey: 'availableKg',
        header: '중량 (KG)',
        enableSorting: true,
        cell: ({ row }) =>
          formatQtyCell(row.original.availableKg, row.original.totalKg, row.original.soldKg, 0),
        size: 120,
      },
      {
        id: 'availableBales',
        accessorKey: 'availableBales',
        header: '베일(영업)',
        enableSorting: true,
        cell: ({ row }) =>
          formatQtyCell(
            row.original.availableBales,
            row.original.totalBales,
            row.original.soldBales,
            0,
          ),
        size: 100,
      },
    ],
    [salesGradeCodes],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      getRowId={(row) => row.rowKey}
      enableSorting
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortChange={onSortChange}
      onRowClick={(row) => {
        if (typeof window !== 'undefined' && (window.getSelection()?.toString() ?? '').length > 0) {
          return;
        }
        const rowId = row.rowKey;
        const currentSelection = rowSelection[rowId] || false;
        onRowSelectionChange({ ...rowSelection, [rowId]: !currentSelection });
      }}
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      manualPagination
      filterControls={
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">검색</Label>
            <Input
              className="h-9 w-64"
              placeholder="BK, BL, 상품 등 검색"
              value={bkBlSearch}
              onChange={(e) => setBkBlSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch();
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">입고 상태</Label>
            <Select value={selectedInboundStatus || '__all__'} onValueChange={onInboundStatusChange}>
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
            <Select
              value={selectedInventoryStatus || '__all__'}
              onValueChange={onInventoryStatusChange}
            >
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
            <Select value={selectedProduct || '__all__'} onValueChange={onProductChange}>
              <SelectTrigger className="w-40" size="sm">
                <SelectValue placeholder="상품 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                {products?.map((product) => (
                  <SelectItem key={product.id} value={product.value ?? product.name ?? ''}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      }
    />
  );
}
