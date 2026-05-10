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
import { Loader2, X, DollarSign } from 'lucide-react';
import { useTradeOrder } from '@/lib/hooks/use-trade-orders';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrderDetailContent } from '@/components/booking/trade-order-detail-content';
import {
  PaymentProcessingDrawer,
  type PaymentProcessingTarget,
} from '@/components/trade-order/payment-processing-drawer';

interface PaymentPendingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string | null;
  onSuccess?: () => void;
}

export function PaymentPendingDetailDrawer({
  open,
  onOpenChange,
  bookingId,
  onSuccess,
}: PaymentPendingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useTradeOrder(bookingId ?? undefined);
  const [paymentProcessingDrawerOpen, setPaymentProcessingDrawerOpen] = React.useState(false);
  const [paymentProcessingTarget, setPaymentProcessingTarget] =
    React.useState<PaymentProcessingTarget>('payments');

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && bookingId) {
      refetch();
    }
  }, [open, bookingId, refetch]);

  const handlePaymentSuccess = React.useCallback(async () => {
    await refetch();
    if (onSuccess) {
      onSuccess();
    }
  }, [refetch, onSuccess]);

  // 텍스트 선택을 위한 핸들러 (드래그 선택 시 drawer 제스처 방지)
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
      if (paymentProcessingDrawerOpen) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange, paymentProcessingDrawerOpen]);

  return (
    <>
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
                <div className="flex items-center gap-2">
                  <DrawerTitle>결제 대기 상세정보</DrawerTitle>
                  {data?.shipBack === true && (
                    <span className="rounded-md border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                      쉽백
                    </span>
                  )}
                </div>
                <DrawerDescription>
                  결제 대기 정보를 확인하고 결제 처리를 할 수 있습니다.
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
              <TradeOrderDetailContent data={data} showDocumentsInfo={true} gradeDisplayMode="both" showCostAndSalesColumns={false} />
            )}
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-between items-center w-full">
              <div />
              <div className="flex items-center gap-2">
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
                {data?.payments && data.payments.length > 0 && (
                  <Button
                    variant="default"
                    disabled={!data}
                    onClick={() => {
                      setPaymentProcessingTarget('payments');
                      setPaymentProcessingDrawerOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <DollarSign className="mr-1.5 h-4 w-4" />
                    {data.tradeStatus === 'BOOKING' &&
                    data.bookingTempPayments &&
                    data.bookingTempPayments.length > 0
                      ? '정식 결제 처리'
                      : '결제하기'}
                  </Button>
                )}
                {data?.tradeStatus === 'BOOKING' &&
                  data.bookingTempPayments &&
                  data.bookingTempPayments.length > 0 && (
                    <Button
                      variant="default"
                      disabled={!data}
                      onClick={() => {
                        setPaymentProcessingTarget('bookingTempPayments');
                        setPaymentProcessingDrawerOpen(true);
                      }}
                      className="border-amber-600/80 bg-amber-600 text-white hover:bg-amber-700"
                    >
                      <DollarSign className="mr-1.5 h-4 w-4" />
                      임시(부킹) 결제 처리
                    </Button>
                  )}
              </div>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* 결제 처리 Drawer */}
      <PaymentProcessingDrawer
        open={paymentProcessingDrawerOpen}
        onOpenChange={setPaymentProcessingDrawerOpen}
        orderId={bookingId as string | null}
        onSuccess={handlePaymentSuccess}
        processingTarget={paymentProcessingTarget}
      />
    </>
  );
}

