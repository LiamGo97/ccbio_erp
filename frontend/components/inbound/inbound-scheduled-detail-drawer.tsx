'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
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
import { Loader2, X, Edit, FileText, Undo2 } from 'lucide-react';
import { useTradeOrder, useUpdateTradeOrder, type TradeOrder } from '@/lib/hooks/use-trade-orders';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrderDetailContent } from '@/components/booking/trade-order-detail-content';
import { InboundPendingDataDetailDrawer } from '@/components/inbound/inbound-pending-data-detail-drawer';
import { InboundConfirmedEditDrawer } from '@/components/inbound/inbound-confirmed-edit-drawer';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface InboundScheduledDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string | null;
  onEditSalesGrade?: (orderId: string) => void;
  onEditInboundData?: (order: TradeOrder) => void;
  onConfirmInbound?: (order: TradeOrder) => void;
  onSuccess?: () => void;
}

export function InboundScheduledDetailDrawer({
  open,
  onOpenChange,
  bookingId,
  onEditSalesGrade,
  onEditInboundData,
  onConfirmInbound,
  onSuccess,
}: InboundScheduledDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useTradeOrder(bookingId ?? undefined);
  const [pendingDataDrawerOpen, setPendingDataDrawerOpen] = React.useState(false);
  const [confirmedEditDrawerOpen, setConfirmedEditDrawerOpen] = React.useState(false);
  const [revertToPendingDialogOpen, setRevertToPendingDialogOpen] = React.useState(false);
  const [revertLoading, setRevertLoading] = React.useState(false);
  const [salesNotesEditOpen, setSalesNotesEditOpen] = React.useState(false);
  const [salesNotesInput, setSalesNotesInput] = React.useState('');
  const queryClient = useQueryClient();
  const updateOrderMutation = useUpdateTradeOrder();

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

  // 입고 예정 데이터는 TradeOrder에 포함되어 있음
  const inboundData = data?.pendingInbound;

  // 컨테이너 수량 계산
  const containerCount = React.useMemo(() => {
    return data?.containers?.length ?? 0;
  }, [data?.containers]);

  // 총 중량 계산
  const totalWeight = React.useMemo(() => {
    if (data?.containers) {
      return data.containers.reduce((sum, container) => {
        return sum + (container.weight != null ? Number(container.weight) : 0);
      }, 0);
    }
    return data?.totalAmount ?? 0;
  }, [data]);

  // 단가 (unitPrice) - 컨테이너의 unitPrice 우선, 없으면 TradeOrder의 unitPrice
  const unitPrice = React.useMemo(() => {
    return data?.containers?.[0]?.unitPrice ?? data?.unitPrice ?? 0;
  }, [data]);

  // 판매원가는 저장된 값을 사용 (없으면 null)
  const comparisonPurchaseCost = inboundData?.comparisonPurchaseCost ?? null;

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

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && bookingId) {
      refetch();
    }
  }, [open, bookingId, refetch]);

  // 텍스트 선택을 위한 핸들러
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
      if (revertToPendingDialogOpen) {
        e.preventDefault();
        if (!revertLoading) setRevertToPendingDialogOpen(false);
        return;
      }
      if (salesNotesEditOpen) {
        e.preventDefault();
        setSalesNotesEditOpen(false);
        return;
      }
      if (confirmedEditDrawerOpen) {
        e.preventDefault();
        setConfirmedEditDrawerOpen(false);
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
  }, [
    open,
    revertToPendingDialogOpen,
    revertLoading,
    salesNotesEditOpen,
    confirmedEditDrawerOpen,
    pendingDataDrawerOpen,
    onOpenChange,
  ]);

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
                <DrawerTitle>입고 예정 상세정보</DrawerTitle>
                {data?.shipBack === true && (
                  <span className="rounded-md border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    쉽백
                  </span>
                )}
              </div>
              <DrawerDescription>
                입고 예정 정보를 확인하고 수정할 수 있습니다.
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
              onEditSalesGrade={onEditSalesGrade}
              containerNumberColumn="sequence"
            />
              
              {/* 입고 예정 데이터 섹션 */}
              <div className="space-y-3 pt-6 pb-6 border-t border-border mt-6">
                <h3 className="text-sm font-semibold text-foreground">입고 예정 데이터</h3>
                {inboundData ? (
                  <div className="space-y-4 pt-3">
                    {/* 입고 예정 수정 화면과 동일 배치 */}
                    {/* 첫 번째 줄: D/O비용, 통관수수료, 검역대행 수수료, 관세, 소독비(훈증검역) */}
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">D/O비용</Label>
                        <p className="text-sm">{renderNumber(inboundData.doCost)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">통관수수료</Label>
                        <p className="text-sm">{renderNumber(inboundData.customsFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">검역대행 수수료</Label>
                        <p className="text-sm">{renderNumber(inboundData.quarantineAgencyFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">관세</Label>
                        <p className="text-sm">{renderNumber(inboundData.customsDuty)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">소독비(훈증검역)</Label>
                        <p className="text-sm">{renderNumber(inboundData.fumigationQuarantine)}</p>
                      </div>
                    </div>

                    {/* 두 번째 줄: 1단적재료(검역이적료), 현물, 샘플채취, 추가항목, 단미사료 */}
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">1단적재료(검역이적료)</Label>
                        <p className="text-sm">{renderNumber(inboundData.firstTierLoadingFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">현물</Label>
                        <p className="text-sm">{renderNumber(inboundData.spot)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">샘플채취</Label>
                        <p className="text-sm">{renderNumber(inboundData.sampleCollection)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">추가항목</Label>
                        <p className="text-sm">{renderNumber(inboundData.additionalItem)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">단미사료</Label>
                        <p className="text-sm">{renderNumber(inboundData.document)}</p>
                      </div>
                    </div>

                    {/* 이고, 검역, DT */}
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">이고</Label>
                        <p className="text-sm">{formatDate(inboundData.igodate) || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">검역</Label>
                        <p className="text-sm">{formatDate(inboundData.quarantineDate) || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">DT</Label>
                        <p className="text-sm">{formatDate(inboundData.dtDate) || '-'}</p>
                      </div>
                    </div>

                    {/* 창고, 이고비, 적출비, 은행 수수료, 검역 작업비 */}
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">창고</Label>
                        <p className="text-sm">{inboundData.warehouse || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">이고비 (컨당)</Label>
                        <p className="text-sm">{renderNumber(inboundData.igobi)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">적출비</Label>
                        <p className="text-sm">{renderNumber(inboundData.extractionFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">은행 수수료</Label>
                        <p className="text-sm">{renderNumber(inboundData.bankFee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">검역 작업비</Label>
                        <p className="text-sm">{renderNumber(inboundData.quarantineWorkCost)}</p>
                      </div>
                    </div>

                    {/* 수수료, 쿼터 비용, 예정 환율, 예정 원가 */}
                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">수수료</Label>
                        <p className="text-sm">{renderNumber(inboundData.fee)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">쿼터 비용</Label>
                        <p className="text-sm">{renderNumber(inboundData.quotaCost)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">예정 환율</Label>
                        <p className="text-sm">{renderNumber(inboundData.comparisonExchangeRate)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">예정 원가</Label>
                        <p className="text-sm font-semibold">{renderNumber(comparisonPurchaseCost)}</p>
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

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
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
            {/* 이전 단계로 되돌리기: 입고 예정 → 입고 대기 (수정 버튼 왼쪽) */}
            {data && (
              <Button
                type="button"
                variant="outline"
                disabled={!data}
                onClick={() => setRevertToPendingDialogOpen(true)}
              >
                <Undo2 className="mr-1.5 h-4 w-4" />
                입고대기로 변경
              </Button>
            )}
            {onConfirmInbound && data && inboundData && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => setConfirmedEditDrawerOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                입고 확정
              </Button>
            )}
            {onEditInboundData && data && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => {
                  if (data && onEditInboundData) {
                    onEditInboundData(data);
                  }
                }}
              >
                <Edit className="mr-1.5 h-4 w-4" />
                수정
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>

      <AlertDialog open={revertToPendingDialogOpen} onOpenChange={(open) => !revertLoading && setRevertToPendingDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>입고대기로 되돌리기</AlertDialogTitle>
            <AlertDialogDescription>
              이 주문을 입고대기로 되돌리시겠습니까? 입고 데이터는 유지되고, 상태만 입고대기로 변경됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertLoading}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={revertLoading}
              onClick={async () => {
                if (!data?.id || revertLoading) return;
                setRevertLoading(true);
                try {
                  await api.put(`/trade/contracts/orders/${data.id}`, { salesStatus: 'INBOUND_PENDING' });
                  toast({ title: '변경 완료', description: '입고대기로 되돌렸습니다.' });
                  setRevertToPendingDialogOpen(false);
                  await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
                  await queryClient.invalidateQueries({ queryKey: ['trade-order', data.id] });
                  onOpenChange(false);
                  onSuccess?.();
                } catch (err) {
                  console.error('입고대기로 되돌리기 오류:', err);
                  toast({
                    title: '변경 실패',
                    description: err instanceof Error ? err.message : '상태 변경 중 오류가 발생했습니다.',
                    variant: 'destructive',
                  });
                } finally {
                  setRevertLoading(false);
                }
              }}
            >
              {revertLoading ? '처리 중...' : '되돌리기'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* 입고 확정 drawer */}
      {data && (
        <InboundConfirmedEditDrawer
          open={confirmedEditDrawerOpen}
          onOpenChange={setConfirmedEditDrawerOpen}
          tradeOrder={data}
          onSubmit={async (formData) => {
            if (!data?.id) return;
            try {
              // 입고 확정 데이터 저장 (status: 'CONFIRMED')
              await api.put(`/trade/contracts/orders/${data.id}/inbound`, {
                ...formData,
                status: 'CONFIRMED',
                // containerConfirmedPurchaseCosts는 InboundConfirmedEditDrawer의 internalSubmit에서 처리됨
              });
              
              // 영업 상태를 입고 확정으로 업데이트
              await api.put(`/trade/contracts/orders/${data.id}`, {
                salesStatus: 'INBOUND_CONFIRMED',
              });

              setConfirmedEditDrawerOpen(false);
              if (onSuccess) {
                onSuccess();
              }
              await refetch();
            } catch (error) {
              console.error('입고 확정 저장 중 오류:', error);
            }
          }}
        />
      )}
    </Drawer>
  );
}

