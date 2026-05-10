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
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import api from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useTradeOrder } from '@/lib/hooks/use-trade-orders';

interface InboundPendingDataDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  onEdit?: () => void;
}

interface PendingInboundData {
  id: string;
  warehouse?: string | null;
  igodate?: string | null;
  quarantineDate?: string | null;
  dtDate?: string | null;
  targetMargin?: number | null;
  customsFee?: number | null;
  firstTierLoadingFee?: number | null;
  doCost?: number | null;
  quarantineAgencyFee?: number | null;
  customsDuty?: number | null;
  additionalItem?: number | null;
  bankFee?: number | null;
  quarantineWorkCost?: number | null;
  spot?: number | null;
  document?: number | null;
  igobi?: number | null;
  extractionFee?: number | null;
  sto?: number | null;
  fumigationQuarantine?: number | null;
  fee?: number | null;
  sampleCollection?: number | null;
  quotaCost?: number | null;
  comparisonExchangeRate?: number | null;
  comparisonPurchaseCost?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const InfoRow = ({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1 ${className || ''}`}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

const renderNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
};

export function InboundPendingDataDetailDrawer({
  open,
  onOpenChange,
  orderId,
  onEdit,
}: InboundPendingDataDetailDrawerProps) {
  const isMobile = useIsMobile();

  const { data, isLoading } = useQuery<PendingInboundData | null>({
    queryKey: ['trade-order-inbound-pending', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      try {
        const response = await api.get(`/trade/contracts/orders/${orderId}/inbound`);
        return response.data?.pendingInbound || null;
      } catch (error) {
        console.error('입고 예정 데이터 조회 오류:', error);
        return null;
      }
    },
    enabled: open && !!orderId,
  });

  // TradeOrder에서 훈증 유무 가져오기
  const { data: tradeOrder } = useTradeOrder(orderId ?? undefined);

  // 예정 원가: API에 저장된 값 사용 (없으면 null)
  const expectedPurchaseCost = data?.comparisonPurchaseCost ?? null;

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
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{ 
          width: isMobile ? '100%' : '600px', 
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>입고 예정 데이터</DrawerTitle>
              <DrawerDescription>
                입고 예정 데이터 상세 정보를 확인할 수 있습니다.
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
              입고 예정 데이터가 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4 rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">입고 예정 데이터</h3>
                    <p className="text-xs text-muted-foreground">
                      예정 환율 기준으로 산출된 입고예정 데이터입니다.
                    </p>
                  </div>
                  {onEdit && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={onEdit}
                    >
                      수정
                    </Button>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-5 gap-4">
                    <InfoRow label="창고" value={data.warehouse || '-'} />
                    <InfoRow label="이고" value={data.igodate || '-'} />
                    <InfoRow label="검역" value={data.quarantineDate || '-'} />
                    <InfoRow label="DT" value={data.dtDate || '-'} />
                    <InfoRow label="목표 마진" value={renderNumber(data.targetMargin)} />
                  </div>
                  <div className="grid grid-cols-5 gap-4">
                    <InfoRow label="통관 수수료" value={renderNumber(data.customsFee)} />
                    <InfoRow label="1단 적재료" value={renderNumber(data.firstTierLoadingFee)} />
                    <InfoRow label="D/O비용" value={renderNumber(data.doCost)} />
                    <InfoRow label="검역 대행료" value={renderNumber(data.quarantineAgencyFee)} />
                    <InfoRow label="관세" value={renderNumber(data.customsDuty)} />
                  </div>
                  <div className="grid grid-cols-5 gap-4">
                    <InfoRow label="항목 추가란" value={renderNumber(data.additionalItem)} />
                    <InfoRow label="은행 수수료" value={renderNumber(data.bankFee)} />
                    <InfoRow label="검역 작업비" value={renderNumber(data.quarantineWorkCost)} />
                    <InfoRow label="현물" value={renderNumber(data.spot)} />
                    <InfoRow label="서류" value={renderNumber(data.document)} />
                  </div>
                  <div className="grid grid-cols-5 gap-4">
                    <InfoRow label="이고비 (컨당)" value={renderNumber(data.igobi)} />
                    <InfoRow label="적출비" value={renderNumber(data.extractionFee)} />
                    <InfoRow label="STO" value={renderNumber(data.sto)} />
                    <InfoRow 
                      label="훈증 유무" 
                      value={tradeOrder?.fumigation === 'Y' ? '있음' : tradeOrder?.fumigation === 'N' ? '없음' : '-'} 
                    />
                    <InfoRow label="훈증검역" value={renderNumber(data.fumigationQuarantine)} />
                  </div>
                  <div className="grid grid-cols-5 gap-4">
                    <InfoRow label="수수료" value={renderNumber(data.fee)} />
                    <div aria-hidden className="opacity-0" />
                    <div aria-hidden className="opacity-0" />
                    <div aria-hidden className="opacity-0" />
                    <div aria-hidden className="opacity-0" />
                  </div>
                  <div className="grid grid-cols-5 gap-4">
                    <InfoRow label="샘플채취" value={renderNumber(data.sampleCollection)} />
                    <InfoRow label="쿼터 비용" value={renderNumber(data.quotaCost)} />
                    <InfoRow label="예정 환율" value={renderNumber(data.comparisonExchangeRate)} />
                    <InfoRow label="예정 원가" value={renderNumber(expectedPurchaseCost)} />
                    <div aria-hidden className="opacity-0" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

