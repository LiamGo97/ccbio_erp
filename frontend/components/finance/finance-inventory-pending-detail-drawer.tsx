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
import { Label } from '@/components/ui/label';
import { Loader2, X } from 'lucide-react';
import { useTradeOrder } from '@/lib/hooks/use-trade-orders';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrderDetailContent } from '@/components/booking/trade-order-detail-content';

const renderNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
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

interface FinanceInventoryPendingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: string | null;
  onRefresh?: () => void;
}

export function FinanceInventoryPendingDetailDrawer({
  open,
  onOpenChange,
  orderId,
  onRefresh,
}: FinanceInventoryPendingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useTradeOrder(orderId ?? undefined);

  React.useEffect(() => {
    if (open && orderId) {
      refetch();
    }
  }, [open, orderId, refetch]);

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
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{
          width: isMobile ? '100%' : '85%',
          maxWidth: '1200px',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex gap-2 items-center">
                <DrawerTitle>입고예정 재고 상세정보</DrawerTitle>
                {data?.shipBack === true && (
                  <span className="rounded-md border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    쉽백
                  </span>
                )}
              </div>
              <DrawerDescription>
                BL 단위 입고예정 정보를 확인합니다. 송장·통관예정일 확인용입니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div
          className="flex-1 overflow-y-auto p-4"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          onDoubleClick={handleDoubleClick}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              데이터를 불러올 수 없습니다.
            </div>
          ) : (
            <>
              <TradeOrderDetailContent
                data={data}
                showDocumentsInfo={true}
                gradeDisplayMode="both"
                showCostAndSalesColumns={true}
              />

              {/* 입고 예정 데이터 섹션 */}
              <div className="space-y-3 pt-6 pb-6 border-t border-border mt-6">
                <h3 className="text-sm font-semibold text-foreground">입고 예정 데이터</h3>
                {data.pendingInbound ? (
                  <div className="space-y-4 pt-3">
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">D/O비용</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.doCost)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">통관수수료</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.customsFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">검역대행 수수료</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.quarantineAgencyFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">관세</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.customsDuty)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">소독비(훈증검역)</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.fumigationQuarantine)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">1단적재료(검역이적료)</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.firstTierLoadingFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">현물</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.spot)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">샘플채취</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.sampleCollection)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">추가항목</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.additionalItem)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">단미사료</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.document)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">이고</Label>
                        <p className="text-sm">{formatDate(data.pendingInbound.igodate) || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">검역</Label>
                        <p className="text-sm">{formatDate(data.pendingInbound.quarantineDate) || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">통관예정일</Label>
                        <p className="text-sm">{formatDate(data.customsScheduledDate) || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">DT</Label>
                        <p className="text-sm">{formatDate(data.pendingInbound.dtDate) || '-'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">창고</Label>
                        <p className="text-sm">{data.pendingInbound.warehouse || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">이고비 (컨당)</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.igobi)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">적출비</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.extractionFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">은행 수수료</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.bankFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">검역 작업비</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.quarantineWorkCost)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">수수료</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.fee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">쿼터 비용</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.quotaCost)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">예정 환율</Label>
                        <p className="text-sm">{renderNumber(data.pendingInbound.comparisonExchangeRate)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">예정 원가</Label>
                        <p className="text-sm font-semibold">{renderNumber(data.pendingInbound.comparisonPurchaseCost)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-4">
                    입고 예정 데이터가 입력되지 않았습니다.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DrawerFooter className="border-t border-border">
          <div className="flex justify-between items-center w-full">
            <div />
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
  );
}
