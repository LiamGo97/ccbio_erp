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
import { Badge } from '@/components/ui/badge';
import { Loader2, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InventoryPendingDetailDrawer } from '@/components/inventory/inventory-pending-detail-drawer';
import { TradeOrderDetailContent } from '@/components/booking/trade-order-detail-content';
import {
  useSalesInventoryConfirmedSalesLinked,
  type SalesInventoryPendingByBlPackingRow,
} from '@/lib/hooks/use-trade-contracts';
import { useTradeOrder, type TradeOrder } from '@/lib/hooks/use-trade-orders';
import { SalesDetailDrawer } from '@/components/sales/sales-detail-drawer';
import { cn } from '@/lib/utils';

interface SalesInventoryPendingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row?: SalesInventoryPendingByBlPackingRow | null;
}

type ContainerRow = {
  id: string;
  containerNo: string;
  inboundWarehouseName?: string | null;
  inboundIgodate?: string | null;
  inboundQuarantineDate?: string | null;
  inboundCustomsScheduledDate?: string | null;
  inboundDtDate?: string | null;
  pendingPurchaseCost?: string | number | null;
  notes?: string | null;
};

function formatContainerMoney(value: string | number | null | undefined): string {
  if (value == null || value === '') return '-';
  return Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatWorkFeeSum(
  workFee?: string | number | null,
  onsiteWorkFee?: string | number | null,
): string {
  const w = workFee != null && workFee !== '' ? Number(workFee) : 0;
  const o = onsiteWorkFee != null && onsiteWorkFee !== '' ? Number(onsiteWorkFee) : 0;
  const has =
    (workFee != null && workFee !== '') || (onsiteWorkFee != null && onsiteWorkFee !== '');
  return has
    ? (w + o).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '-';
}

function formatQuantityDisplay(
  available: number | null,
  total: number | null,
  sold: number | null,
  maxDecimals: number,
  unitSuffix?: string,
) {
  if (available == null || total == null) return <span className="text-muted-foreground">-</span>;
  const hasSales = (sold ?? 0) > 0;
  const fmt = (v: number) =>
    v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
  const suffix = (v: string) => (unitSuffix ? `${v} ${unitSuffix}` : v);
  const isNegative = available < 0;

  if (!hasSales) {
    return (
      <span className={isNegative ? 'text-red-600 dark:text-red-400 font-medium' : undefined}>
        {suffix(fmt(total))}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={
          isNegative
            ? 'font-semibold text-red-600 dark:text-red-400'
            : 'font-semibold text-blue-600 dark:text-blue-400'
        }
      >
        {suffix(fmt(available))}
      </span>
      <span className="text-muted-foreground">/</span>
      <span className="text-muted-foreground">{suffix(fmt(total))}</span>
    </span>
  );
}

const formatNumber = (value?: number | null, decimals = 2) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

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

const getSalesItemStatusBadgeStyle = (status?: string | null) => {
  if (!status) {
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  }
  const normalizedStatus = status.trim().toUpperCase();
  if (normalizedStatus === 'SALES_ITEM_RESERVED') {
    return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
  }
  if (normalizedStatus === 'SALES_ITEM_SOLD') {
    return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
  }
  if (normalizedStatus === 'SALES_ITEM_COMPLETED') {
    return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
  }
  if (normalizedStatus === 'INVENTORY_INBOUND' || normalizedStatus === 'INVENTORY_CONSUMPTION') {
    return 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300';
  }
  return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
};

function remainingQuantityClassName(value: number | null | undefined, hasDeduction: boolean) {
  if (value != null && value < 0) {
    return 'font-semibold tabular-nums text-red-600 dark:text-red-400';
  }
  if (hasDeduction) {
    return 'font-semibold tabular-nums text-blue-600 dark:text-blue-400';
  }
  return 'font-medium tabular-nums text-foreground';
}

function filterOrderByPacking(order: TradeOrder, packingType: string | null | undefined): TradeOrder {
  const packingKey = packingType?.trim() || '__none__';
  const containers = (order.containers ?? []).filter((c) => {
    const p = (c.packingType ?? order.packingType ?? '').trim() || '__none__';
    return p === packingKey;
  });
  return { ...order, containers };
}

export function SalesInventoryPendingDetailDrawer({
  open,
  onOpenChange,
  row,
}: SalesInventoryPendingDetailDrawerProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = React.useState('bl');
  const [containerDetailOpen, setContainerDetailOpen] = React.useState(false);
  const [selectedContainerId, setSelectedContainerId] = React.useState<string | null>(null);
  const [salesDrawerOpen, setSalesDrawerOpen] = React.useState(false);
  const [selectedSalesId, setSelectedSalesId] = React.useState<string | null>(null);

  const orderId = row?.orderId;
  const containerIds = row?.containerIds ?? [];
  const containerIdsKey = containerIds.join(',');

  const { data: order, isLoading: isOrderLoading, refetch } = useTradeOrder(
    open && orderId ? orderId : undefined,
  );

  const orderForView = React.useMemo(
    () => (order && row ? filterOrderByPacking(order, row.packingType) : order),
    [order, row],
  );

  const {
    data: salesLinked,
    isLoading: isSalesLinkedLoading,
    refetch: refetchSalesLinked,
  } = useSalesInventoryConfirmedSalesLinked(
    {
      containerIds,
      orderId: row?.orderId,
      packingType: row?.packingType,
    },
    open && (!!row?.orderId || containerIds.length > 0),
  );

  const salesLinkedItems = salesLinked?.items ?? [];

  const invalidateRelatedQueries = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'sales', 'inventory-pending'] });
    void queryClient.invalidateQueries({
      queryKey: ['trade-contracts', 'sales', 'inventory-pending', 'sales-linked'],
    });
    void queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'containers', 'by-bl-packing'] });
    void queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'containers', 'pending'] });
    if (orderId) void queryClient.invalidateQueries({ queryKey: ['trade-order', orderId] });
  }, [queryClient, orderId]);

  const { data: containers = [], isLoading: isContainersLoading } = useQuery({
    queryKey: ['trade-contracts', 'containers', 'by-bl-packing', row?.rowKey ?? '', containerIdsKey],
    queryFn: async () => {
      if (containerIds.length === 0) return [];
      const response = await api.get('/trade/contracts/containers', {
        params: {
          inboundStatus: 'PENDING',
          includeSheetReservations: 'false',
          requestedContainers: containerIds.join(','),
        },
      });
      const list = (response.data ?? []) as ContainerRow[];
      const idSet = new Set(containerIds.map(String));
      const filtered = list.filter((c) => idSet.has(String(c.id)));
      const orderMap = new Map(containerIds.map((id, i) => [String(id), i]));
      filtered.sort((a, b) => (orderMap.get(String(a.id)) ?? 0) - (orderMap.get(String(b.id)) ?? 0));
      return filtered;
    },
    enabled: open && containerIds.length > 0,
  });

  React.useEffect(() => {
    if (open && orderId) void refetch();
  }, [open, orderId, refetch]);

  React.useEffect(() => {
    if (!open) {
      setActiveTab('bl');
      setContainerDetailOpen(false);
      setSelectedContainerId(null);
      setSalesDrawerOpen(false);
      setSelectedSalesId(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && row) void refetchSalesLinked();
  }, [open, row?.rowKey, refetchSalesLinked]);

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    e.stopPropagation();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (containerDetailOpen || salesDrawerOpen) return;
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, containerDetailOpen, salesDrawerOpen, onOpenChange]);

  const packingLabel = row?.packingName || row?.packingType || '패킹 미지정';

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="h-full flex flex-col"
          style={{
            width: isMobile ? '100%' : '85%',
            maxWidth: '1200px',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <DrawerHeader className="border-b shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DrawerTitle className="truncate">입고 예정 재고 상세</DrawerTitle>
                  {row?.bl ? (
                    <Badge variant="outline" className="font-mono text-xs shrink-0">
                      {row.bl}
                    </Badge>
                  ) : null}
                  {row ? (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {packingLabel}
                    </Badge>
                  ) : null}
                </div>
                <DrawerDescription className="mt-1">
                  BL·패킹 재고, 연결 판매·예약, 컨테이너 정보를 확인합니다.
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          {!row ? (
            <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground text-sm">
              행을 선택해 주세요.
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-1 flex-col min-h-0 gap-0"
            >
              <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-3">
                <TabsList className="h-auto flex-wrap justify-start gap-1">
                  <TabsTrigger value="bl" className="flex-none px-3">
                    BL 정보
                  </TabsTrigger>
                  <TabsTrigger value="containers" className="flex-none px-3">
                    컨테이너
                  </TabsTrigger>
                  <TabsTrigger value="sales" className="flex-none px-3">
                    판매 연결
                    {(salesLinked?.linkedCount ?? 0) > 0 ? (
                      <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
                        {salesLinked?.linkedCount}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="sales"
                className="flex-1 overflow-y-auto p-4 mt-0 focus-visible:outline-none"
              >
                <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-2">
                  <p className="font-medium text-foreground">
                    패킹 <span className="text-primary">{packingLabel}</span>
                    {' · '}
                    {row.containerCount}컨
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">총 베일(영업)</p>
                      <p className="font-medium tabular-nums">
                        {formatNumber(row.totalBales, 4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">남은 베일</p>
                      <p
                        className={remainingQuantityClassName(
                          row.availableBales,
                          (row.soldBales ?? 0) > 0,
                        )}
                      >
                        {formatNumber(row.availableBales, 4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">총 중량</p>
                      <p className="font-medium tabular-nums">
                        {formatNumber(row.totalKg, 3)} kg
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">남은 중량</p>
                      <p
                        className={remainingQuantityClassName(
                          row.availableKg,
                          (row.soldKg ?? 0) > 0,
                        )}
                      >
                        {formatNumber(row.availableKg, 3)} kg
                      </p>
                    </div>
                  </div>
                  {(row.soldBales > 0 || row.soldKg > 0) && (
                    <p className="text-xs text-muted-foreground">
                      차감(판매·예약 포함): 베일 {formatNumber(row.soldBales, 4)} · 중량{' '}
                      {formatNumber(row.soldKg, 3)} kg
                    </p>
                  )}
                </div>

                {isSalesLinkedLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : salesLinkedItems.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    연결된 판매·예약이 없습니다.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">
                      판매 {salesLinked?.salesCount ?? 0}건 · 연결 항목 {salesLinkedItems.length}건
                      (판매등록·판매예약·시트예약)
                    </p>
                    <div className="rounded-lg border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[72px]">구분</TableHead>
                            <TableHead className="min-w-[120px]">고객명</TableHead>
                            <TableHead>상태</TableHead>
                            <TableHead className="text-right">베일</TableHead>
                            <TableHead className="text-right">중량</TableHead>
                            <TableHead className="text-right">판매단가</TableHead>
                            <TableHead>예약일</TableHead>
                            <TableHead className="min-w-[100px]">비고</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {salesLinkedItems.map((item) => {
                            const canOpenSales =
                              item.sourceType === 'SALES' && !!item.salesId && !!item.customerId;
                            const sourceLabel =
                              item.sourceType === 'SALES'
                                ? '판매'
                                : item.sourceType === 'RESERVATION'
                                  ? '예약'
                                  : '시트';
                            return (
                              <TableRow
                                key={item.id}
                                className={cn(canOpenSales && 'cursor-pointer hover:bg-muted/50')}
                                onClick={() => {
                                  if (!canOpenSales || !item.salesId) return;
                                  setSelectedSalesId(item.salesId);
                                  setSalesDrawerOpen(true);
                                }}
                              >
                                <TableCell className="text-xs text-muted-foreground">
                                  {sourceLabel}
                                </TableCell>
                                <TableCell className="text-sm">{item.customerName || '-'}</TableCell>
                                <TableCell>
                                  {item.status ? (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'text-xs',
                                        getSalesItemStatusBadgeStyle(item.status),
                                      )}
                                    >
                                      {item.statusName || item.status}
                                    </Badge>
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums">
                                  {item.cargoBales !== 0
                                    ? (item.cargoBales < 0 ? '-' : '') +
                                      formatNumber(Math.abs(item.cargoBales), 4)
                                    : '-'}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums">
                                  {item.cargoWeight !== 0
                                    ? (item.cargoWeight < 0 ? '-' : '') +
                                      formatNumber(Math.abs(item.cargoWeight) * 1000, 0) +
                                      ' kg'
                                    : '-'}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums">
                                  {item.salesUnitPrice != null
                                    ? formatNumber(item.salesUnitPrice, 2)
                                    : '-'}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {formatDate(item.reservationDate ?? item.salesDate)}
                                </TableCell>
                                <TableCell
                                  className="text-sm max-w-[160px] truncate"
                                  title={item.notes?.trim() || undefined}
                                >
                                  {item.notes?.trim() || '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="bl" className="flex-1 overflow-y-auto p-4 mt-0 focus-visible:outline-none">
                {isOrderLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : !orderForView ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    데이터를 불러올 수 없습니다.
                  </div>
                ) : (
                  <>
                    <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                      <p className="font-medium text-foreground">
                        이 목록 행 기준: 패킹 <span className="text-primary">{packingLabel}</span>
                        {' · '}
                        {row.containerCount}컨
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                        <span>
                          베일(영업):{' '}
                          {formatQuantityDisplay(
                            row.availableBales,
                            row.totalBales,
                            row.soldBales,
                            4,
                          )}
                        </span>
                        <span>
                          중량:{' '}
                          {formatQuantityDisplay(row.availableKg, row.totalKg, row.soldKg, 3, 'kg')}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        아래는 입고 대기/무역 상세와 동일한 BL(주문) 화면이며, 컨테이너 목록은 선택한 패킹만
                        표시합니다.
                      </p>
                    </div>
                    <TradeOrderDetailContent
                      data={orderForView}
                      showDocumentsInfo={true}
                      gradeDisplayMode="both"
                      containerNumberColumn="sequence"
                    />
                  </>
                )}
              </TabsContent>

              <TabsContent
                value="containers"
                className="flex-1 overflow-y-auto p-4 mt-0 focus-visible:outline-none"
              >
                <p className="text-xs text-muted-foreground mb-3">
                  컨테이너별 입고 예정 정보를 확인합니다. 행을 클릭하면 상세를 엽니다.
                </p>
                {isContainersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : containers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">컨테이너가 없습니다.</p>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="min-w-[88px]">컨테이너</TableHead>
                          <TableHead className="min-w-[72px]">창고</TableHead>
                          <TableHead>이고</TableHead>
                          <TableHead>검역</TableHead>
                          <TableHead>통관예정</TableHead>
                          <TableHead className="text-right">예정원가</TableHead>
                          <TableHead className="min-w-[120px]">비고</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {containers.map((c) => {
                          const customsDate =
                            c.inboundCustomsScheduledDate?.trim() || c.inboundDtDate?.trim() || null;
                          return (
                            <TableRow
                              key={c.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setSelectedContainerId(c.id);
                                setContainerDetailOpen(true);
                              }}
                            >
                              <TableCell className="font-medium">{c.containerNo || '-'}</TableCell>
                              <TableCell
                                className="text-sm truncate max-w-[100px]"
                                title={c.inboundWarehouseName ?? undefined}
                              >
                                {c.inboundWarehouseName || '-'}
                              </TableCell>
                              <TableCell className="text-sm">{c.inboundIgodate || '-'}</TableCell>
                              <TableCell className="text-sm">{c.inboundQuarantineDate || '-'}</TableCell>
                              <TableCell className="text-sm">{customsDate || '-'}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">
                                {formatContainerMoney(c.pendingPurchaseCost)}
                              </TableCell>
                              <TableCell
                                className="text-sm max-w-[180px] truncate"
                                title={c.notes?.trim() || undefined}
                              >
                                {c.notes?.trim() || '-'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

            </Tabs>
          )}

          <DrawerFooter className="border-t shrink-0">
            <div className="flex justify-end">
              <DrawerClose asChild>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  <X className="mr-1.5 h-4 w-4" />
                  닫기
                </Button>
              </DrawerClose>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <InventoryPendingDetailDrawer
        open={containerDetailOpen}
        onOpenChange={(o) => {
          setContainerDetailOpen(o);
          if (!o) setSelectedContainerId(null);
        }}
        containerId={selectedContainerId}
        onRefresh={invalidateRelatedQueries}
      />

      <SalesDetailDrawer
        open={salesDrawerOpen}
        onOpenChange={(o) => {
          setSalesDrawerOpen(o);
          if (!o) {
            setSelectedSalesId(null);
            void refetchSalesLinked();
            invalidateRelatedQueries();
          }
        }}
        salesId={selectedSalesId}
        noOverlay
      />
    </>
  );
}
