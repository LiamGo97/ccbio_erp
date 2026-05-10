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
import { Loader2, X, Edit, Trash2, Undo2 } from 'lucide-react';
import { useTradeOrder, useUpdateTradeOrder, type TradeOrder } from '@/lib/hooks/use-trade-orders';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrderDetailContent } from '@/components/booking/trade-order-detail-content';
import { CustomsProcessingFormDrawer } from '@/components/logistics/customs-processing-form-drawer';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';

interface CustomsProcessingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeOrderId?: string | null;
  onEdit?: (order: TradeOrder) => void;
  onDelete?: (order: TradeOrder) => void;
}

export function CustomsProcessingDetailDrawer({
  open,
  onOpenChange,
  tradeOrderId,
  onEdit,
  onDelete,
}: CustomsProcessingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useTradeOrder(tradeOrderId ?? undefined);
  const queryClient = useQueryClient();
  const updateOrderMutation = useUpdateTradeOrder();
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);

  const currentStatus = data?.tradeStatus ?? data?.status;
  const canRevertToPrevious = currentStatus === 'CUSTOMS';

  const handleRevertToPreviousState = async () => {
    if (!data?.id || !canRevertToPrevious) return;
    try {
      await updateOrderMutation.mutateAsync({
        id: data.id,
        data: { tradeStatus: 'DO' },
      });
      toast({
        title: 'DO로 변경 완료',
        description: '통관 → DO(이전 단계)로 되돌렸습니다.',
      });
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-order', data.id] });
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '상태 변경 중 오류가 발생했습니다.';
      toast({
        title: '이전 단계로 변경 실패',
        description: message,
        variant: 'destructive',
      });
    }
  };

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && tradeOrderId) {
      refetch();
    }
  }, [open, tradeOrderId, refetch]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
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
  }, [open, editDrawerOpen, onOpenChange]);

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
              <DrawerTitle>통관 처리 상세정보</DrawerTitle>
              <DrawerDescription>
                통관 처리 정보를 확인하고 관리합니다.
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
            <TradeOrderDetailContent data={data} showDocumentsInfo={true} showCostAndSalesColumns={false} />
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
              {canRevertToPrevious && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!data || updateOrderMutation.isPending}
                  onClick={handleRevertToPreviousState}
                >
                  {updateOrderMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="mr-1.5 h-4 w-4" />
                  )}
                  DO로 변경
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
          </div>
        </DrawerFooter>
      </DrawerContent>

      {/* 수정 Drawer - 중첩으로 열림 (항상 렌더링하여 애니메이션 보장) */}
      <CustomsProcessingFormDrawer
        open={editDrawerOpen && !!data}
        onOpenChange={(open) => {
          setEditDrawerOpen(open);
          if (!open) {
            // 수정 drawer가 닫힐 때 상세 drawer는 유지하고 데이터만 갱신
            refetch();
          }
        }}
        orderId={data?.id ?? undefined}
        onSubmit={async () => {
          setEditDrawerOpen(false);
          await refetch();
          // 페이지의 데이터도 갱신하기 위해 queryClient 사용
          if (data?.id) {
            await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
            await queryClient.invalidateQueries({ queryKey: ['trade-order', data.id] });
          }
        }}
        onCancel={() => {
          setEditDrawerOpen(false);
        }}
      />
    </Drawer>
  );
}


