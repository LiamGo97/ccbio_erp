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
import { Loader2, X, FileCheck, Edit, Trash2, Ship, Undo2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTradeOrder, useUpdateTradeOrder, type TradeOrder } from '@/lib/hooks/use-trade-orders';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrderDetailContent } from '@/components/booking/trade-order-detail-content';
import { DocumentsProcessingDrawer } from '@/components/booking/documents-processing-drawer';
import { BookingFormDrawer } from '@/components/booking/booking-form-drawer';
import { useQueryClient } from '@tanstack/react-query';

interface BookingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string | null;
  onEdit?: (order: TradeOrder) => void;
  onDelete?: (order: TradeOrder) => void;
  /** 서류 처리 완료 후 호출 (상태가 DOCUMENTS로 변경된 order 전달, 상위에서 서류처리 상세로 전환 시 사용) */
  onDocumentsProcessingSuccess?: (order: TradeOrder) => void;
}

export function BookingDetailDrawer({
  open,
  onOpenChange,
  bookingId,
  onEdit,
  onDelete,
  onDocumentsProcessingSuccess,
}: BookingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useTradeOrder(bookingId ?? undefined);
  const queryClient = useQueryClient();
  const updateOrderMutation = useUpdateTradeOrder();
  const [documentsDrawerOpen, setDocumentsDrawerOpen] = React.useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  /** 쉽백 처리/해제 확인 다이얼로그: 'ship_back' | 'release' | null */
  const [shipBackConfirm, setShipBackConfirm] = React.useState<'ship_back' | 'release' | null>(null);

  const isShipBack = data?.shipBack === true;

  const handleShipBackConfirm = async () => {
    if (!data?.id || !shipBackConfirm) return;
    const isShipBackValue = shipBackConfirm === 'ship_back';
    try {
      await updateOrderMutation.mutateAsync({
        id: data.id,
        data: { shipBack: isShipBackValue },
      });
      toast({
        title: isShipBackValue ? '쉽백 처리 완료' : '쉽백 해제 완료',
        description: isShipBackValue ? '이 주문을 쉽백(반송)으로 표시했습니다.' : '쉽백 표시를 해제했습니다.',
      });
      setShipBackConfirm(null);
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-order', data.id] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '변경 중 오류가 발생했습니다.';
      toast({
        title: isShipBackValue ? '쉽백 처리 실패' : '쉽백 해제 실패',
        description: message,
        variant: 'destructive',
      });
      setShipBackConfirm(null);
    }
  };

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && bookingId) {
      refetch();
    }
  }, [open, bookingId, refetch]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (shipBackConfirm !== null) {
        e.preventDefault();
        setShipBackConfirm(null);
        return;
      }
      if (documentsDrawerOpen) {
        e.preventDefault();
        setDocumentsDrawerOpen(false);
        return;
      }
      if (editDrawerOpen) {
        e.preventDefault();
        setEditDrawerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, shipBackConfirm, documentsDrawerOpen, editDrawerOpen, onOpenChange]);

  // 텍스트 선택을 위한 핸들러
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    // 텍스트 선택 중일 때는 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 텍스트 선택이 이미 시작된 경우에만 드래그 방지
    // 더블클릭으로 텍스트 선택을 시작하는 경우는 허용
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  // 더블클릭으로 텍스트 선택을 허용하기 위한 핸들러
  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    // 더블클릭 시 텍스트 선택이 가능하도록 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 더블클릭으로 텍스트 선택을 시작할 수 있도록 드래그 제스처 방지
    e.stopPropagation();
  }, []);

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
                  <DrawerTitle>부킹 상세정보</DrawerTitle>
                  {isShipBack && (
                    <span className="rounded-md border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                      쉽백
                    </span>
                  )}
                </div>
                <DrawerDescription>
                  부킹 정보를 확인하고 관리합니다.
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
              <TradeOrderDetailContent data={data} showDocumentsInfo={false} showCostAndSalesColumns={false} />
            )}
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-between gap-2">
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
              <div className="flex gap-2">
                {/* 쉽백 처리 / 쉽백 해제 */}
                {!isShipBack ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!data || updateOrderMutation.isPending}
                    onClick={() => setShipBackConfirm('ship_back')}
                    className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  >
                    <Ship className="mr-1.5 h-4 w-4" />
                    쉽백 처리
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!data || updateOrderMutation.isPending}
                    onClick={() => setShipBackConfirm('release')}
                  >
                    <Undo2 className="mr-1.5 h-4 w-4" />
                    쉽백 해제
                  </Button>
                )}
              </div>
              {onDelete && (
                <Button
                  variant="destructive"
                  disabled={!data}
                  onClick={() => {
                    if (data && onDelete) {
                      onDelete(data);
                    }
                  }}
                  className="bg-destructive hover:bg-destructive/90 text-white"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  삭제
                </Button>
              )}
              {/* 서류 처리 버튼: 무역 상태가 BOOKING일 때만 표시 */}
              {data?.tradeStatus === 'BOOKING' && (
                <Button
                  variant="default"
                  disabled={!data}
                  onClick={() => setDocumentsDrawerOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <FileCheck className="mr-1.5 h-4 w-4" />
                  서류 처리
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="default"
                  disabled={!data}
                  onClick={() => {
                    if (data) {
                      setEditDrawerOpen(true);
                    }
                  }}
                >
                  <Edit className="mr-1.5 h-4 w-4" />
                  수정
                </Button>
              )}
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* 서류 처리 Drawer */}
      <DocumentsProcessingDrawer
        open={documentsDrawerOpen}
        onOpenChange={setDocumentsDrawerOpen}
        booking={data ?? null}
        onSuccess={async () => {
          const result = await refetch();
          await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
          if (data?.id) {
            await queryClient.invalidateQueries({ queryKey: ['trade-order', data.id] });
          }
          const updatedOrder = result.data;
          if (updatedOrder && onDocumentsProcessingSuccess) {
            onDocumentsProcessingSuccess(updatedOrder);
          }
        }}
      />

      {/* 수정 Drawer - 중첩으로 열림 (항상 렌더링하여 애니메이션 보장) */}
      <BookingFormDrawer
        open={editDrawerOpen && !!data}
        onOpenChange={(open) => {
          setEditDrawerOpen(open);
          if (!open) {
            // 수정 drawer가 닫힐 때 상세 drawer는 유지하고 데이터만 갱신
            refetch();
          }
        }}
        bookingId={data?.id ?? undefined}
        mode="edit"
        onSubmit={async () => {
          setEditDrawerOpen(false);
          await refetch();
          // 페이지의 데이터도 갱신하기 위해 queryClient 사용
          if (data?.id) {
            await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
            await queryClient.invalidateQueries({ queryKey: ['trade-order', data.id] });
          }
        }}
      />

      {/* 쉽백 처리/해제 확인 */}
      <AlertDialog open={shipBackConfirm !== null} onOpenChange={(open) => !open && setShipBackConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {shipBackConfirm === 'ship_back' ? '쉽백 처리' : '쉽백 해제'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {shipBackConfirm === 'ship_back'
                ? '이 주문을 쉽백(반송)으로 표시하시겠습니까? 입고대기·입고예정·결재관리 목록에서 제외됩니다.'
                : '쉽백 표시를 해제하시겠습니까? 다시 입고대기·입고예정·결재관리 목록에 노출됩니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShipBackConfirm(null)}>취소</AlertDialogCancel>
            <Button
              onClick={handleShipBackConfirm}
              disabled={updateOrderMutation.isPending}
              variant={shipBackConfirm === 'ship_back' ? 'default' : 'outline'}
              className={shipBackConfirm === 'ship_back' ? 'bg-amber-600 hover:bg-amber-700' : ''}
            >
              {updateOrderMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {shipBackConfirm === 'ship_back' ? '쉽백 처리' : '쉽백 해제'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

