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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, FileCheck, Edit, FileText } from 'lucide-react';
import { useTradeOrder, useUpdateTradeOrder, type TradeOrder } from '@/lib/hooks/use-trade-orders';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrderDetailContent } from '@/components/booking/trade-order-detail-content';
import { InboundPendingDataDetailDrawer } from '@/components/inbound/inbound-pending-data-detail-drawer';
import { toast } from '@/components/ui/use-toast';

interface InboundPendingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string | null;
  onScheduleInbound?: (order: TradeOrder) => void;
  onEditSalesGrade?: (orderId: string) => void;
  onEditInboundData?: (order: TradeOrder) => void;
}

export function InboundPendingDetailDrawer({
  open,
  onOpenChange,
  bookingId,
  onScheduleInbound,
  onEditSalesGrade,
  onEditInboundData,
}: InboundPendingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useTradeOrder(bookingId ?? undefined);
  const [pendingDataDrawerOpen, setPendingDataDrawerOpen] = React.useState(false);
  const [salesNotesEditOpen, setSalesNotesEditOpen] = React.useState(false);
  const [salesNotesInput, setSalesNotesInput] = React.useState('');
  const updateOrderMutation = useUpdateTradeOrder();

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && bookingId) {
      refetch();
    }
  }, [open, bookingId, refetch]);

  // 영업 비고 수정 다이얼로그 열릴 때 현재 값으로 초기화
  React.useEffect(() => {
    if (salesNotesEditOpen && data) {
      setSalesNotesInput(data.salesNotes ?? '');
    }
  }, [salesNotesEditOpen, data?.salesNotes]);

  const handleSaveSalesNotes = React.useCallback(async () => {
    if (!data?.id) return;
    try {
      await updateOrderMutation.mutateAsync({
        id: data.id,
        data: { salesNotes: salesNotesInput?.trim() || null },
      });
      toast({ title: '저장 완료', description: '영업 비고가 저장되었습니다.' });
      setSalesNotesEditOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: '저장 실패',
        description: '영업 비고 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  }, [data?.id, salesNotesInput, updateOrderMutation, refetch]);

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

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (salesNotesEditOpen) {
        e.preventDefault();
        setSalesNotesEditOpen(false);
        return;
      }
      if (pendingDataDrawerOpen) {
        e.preventDefault();
        setPendingDataDrawerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, salesNotesEditOpen, pendingDataDrawerOpen, onOpenChange]);

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
              <div className="flex items-center gap-2">
                <DrawerTitle>입고 대기 상세정보</DrawerTitle>
                {data?.shipBack === true && (
                  <span className="rounded-md border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    쉽백
                  </span>
                )}
              </div>
              <DrawerDescription>
                입고 대기 정보를 확인하고 입고예정으로 변경할 수 있습니다.
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
            <TradeOrderDetailContent 
              data={data} 
              showDocumentsInfo={true} 
              gradeDisplayMode="both"
              onEditSalesGrade={onEditSalesGrade}
              containerNumberColumn="sequence"
            />
          )}
        </div>

        <DrawerFooter className="border-t border-border">
          <div className="flex flex-wrap justify-end gap-2">
            <DrawerClose asChild>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
            {/* 영업 비고 수정 버튼 */}
            {data && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSalesNotesEditOpen(true)}
              >
                <Edit className="mr-1.5 h-4 w-4" />
                영업 비고
              </Button>
            )}
            {/* 입고 예정 데이터 버튼: 입고 예정 데이터가 있는 경우 */}
            {data && data.salesStatus === 'INBOUND_SCHEDULED' && (
              <Button
                variant="outline"
                onClick={() => {
                  setPendingDataDrawerOpen(true);
                }}
              >
                <FileText className="mr-1.5 h-4 w-4" />
                입고 예정 데이터
              </Button>
            )}
            {/* 입고예정 버튼: 영업 상태가 아직 입고예정/입고확정이 아닐 때 표시 */}
            {onScheduleInbound && 
             data &&
             data.salesStatus !== 'INBOUND_SCHEDULED' && 
             data.salesStatus !== 'INBOUND_CONFIRMED' && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => {
                  if (data && onScheduleInbound) {
                    onScheduleInbound(data);
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <FileCheck className="mr-1.5 h-4 w-4" />
                입고예정
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>

      {/* 입고 예정 데이터 상세 drawer */}
      {data?.id && (
        <InboundPendingDataDetailDrawer
          open={pendingDataDrawerOpen}
          onOpenChange={setPendingDataDrawerOpen}
          orderId={data.id}
          onEdit={() => {
            if (data && onEditInboundData) {
              setPendingDataDrawerOpen(false);
              onEditInboundData(data);
            }
          }}
        />
      )}

      {/* 영업 비고 수정 다이얼로그 */}
      <Dialog open={salesNotesEditOpen} onOpenChange={setSalesNotesEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>영업 비고</DialogTitle>
            <DialogDescription>
              입고 관련 영업 비고를 입력하세요. (예: 3/20 예정, 특이사항 등)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="salesNotes">비고 내용</Label>
              <Textarea
                id="salesNotes"
                value={salesNotesInput}
                onChange={(e) => setSalesNotesInput(e.target.value)}
                placeholder="영업/입고 관련 비고를 입력하세요"
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSalesNotesEditOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handleSaveSalesNotes}
              disabled={updateOrderMutation.isPending}
            >
              {updateOrderMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                '저장'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
}

