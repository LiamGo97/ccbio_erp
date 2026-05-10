import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Edit, X } from 'lucide-react';
import type { Schedule, ScheduleInbound } from '@/app/inbound/page';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useWarehouses } from '@/lib/hooks/use-warehouses';

interface InboundDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
  onEdit?: (schedule: Schedule, mode: 'PENDING' | 'CONFIRMED') => void;
  onConfirm?: (schedule: Schedule) => void;
  labelResolvers?: {
    destination?: (code?: string | null) => string;
    warehouse?: (code?: string | null) => string;
  };
}

const InfoRow = ({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1 ${className || ''}`}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

export function InboundDetailDrawer({
  open,
  onOpenChange,
  schedule,
  onEdit,
  onConfirm,
  labelResolvers,
}: InboundDetailDrawerProps) {
  const { data: warehouses = [] } = useWarehouses({ status: true });

  const resolveWarehouseLabel = React.useCallback(
    (code?: string | null) => {
      if (labelResolvers?.warehouse) {
        return labelResolvers.warehouse(code);
      }
      if (!code) return '-';
      const w = warehouses.find((w) => w.name === code || w.id.toString() === code);
      return w?.name ?? code;
    },
    [warehouses, labelResolvers]
  );

  const renderNumber = React.useCallback((value?: number | null) => {
    if (value === null || value === undefined) {
      return '-';
    }
    return value.toLocaleString();
  }, []);

  const resolveCodeValue = (resolver?: (code?: string | null) => string, code?: string | null) => {
    if (resolver) {
      const label = resolver(code);
      if (label && label.trim()) {
        return label;
      }
    } else if (code && code.trim()) {
      return code;
    }
    return '-';
  };

  const calculateInboundCost = React.useCallback(
    (rate?: number | null, data?: ScheduleInbound | null) => {
      if (!schedule || !data || rate === null || rate === undefined) {
        return null;
      }

      const unitPrice = schedule.unitPrice ?? 0;
      const qty = schedule.qty ?? 0;
      const firstPart = (rate * unitPrice) / 1000;

      const customsFee = data.customsFee ?? 0;
      const firstTierLoadingFee = data.firstTierLoadingFee ?? 0;
      const doCost = data.doCost ?? 0;
      const quarantineAgencyFee = data.quarantineAgencyFee ?? 0;
      const customsDuty = data.customsDuty ?? 0;
      const additionalItem = data.additionalItem ?? 0;
      const bankFee = data.bankFee ?? 0;
      const quarantineWorkCost = data.quarantineWorkCost ?? 0;
      const spot = data.spot ?? 0;
      const document = data.document ?? 0;
      const igobi = (data.igobi ?? 0) * qty;
      const extractionFee = data.extractionFee ?? 0;
      const sto = data.sto ?? 0;
      const fumigationQuarantine = data.fumigationQuarantine ?? 0;
      const fee = data.fee ?? 0;
      const sampleCollection = data.sampleCollection ?? 0;

      const sum =
        customsFee +
        firstTierLoadingFee +
        doCost +
        quarantineAgencyFee +
        customsDuty +
        additionalItem +
        bankFee +
        quarantineWorkCost +
        spot +
        document +
        igobi +
        extractionFee +
        sto +
        fumigationQuarantine +
        fee +
        sampleCollection;

      const totalAmount = schedule.totalAmount ?? schedule.invoiceWeight ?? 0;
      let secondPart = 0;
      if (totalAmount > 0) {
        secondPart = sum / totalAmount / 1000;
      }

      const quotaCost = data.quotaCost ?? 0;
      return firstPart + secondPart + quotaCost;
    },
    [schedule],
  );

  const renderInboundSection = (
    label: string,
    mode: 'PENDING' | 'CONFIRMED',
    data?: ScheduleInbound | null,
  ) => {
    const pendingSaleCost =
      mode === 'PENDING'
        ? calculateInboundCost(data?.comparisonExchangeRate ?? null, data)
        : null;
    const confirmedPurchaseCost =
      mode === 'CONFIRMED'
        ? calculateInboundCost(
            data?.dayExchangeRate !== null && data?.dayExchangeRate !== undefined
              ? data.dayExchangeRate + 10
              : null,
            data,
          )
        : null;

    return (
      <div className="space-y-4 rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{label}</h3>
            <p className="text-xs text-muted-foreground">
              {mode === 'PENDING'
                ? '판매 환율 기준으로 산출된 입고예정 데이터입니다.'
                : '실제 확정 환율을 반영한 입고확정 데이터입니다.'}
            </p>
          </div>
          {schedule && onEdit && (
            <Button
              size="sm"
              variant="default"
              onClick={() => onEdit(schedule, mode)}
            >
              <Edit className="mr-1.5 h-4 w-4" />
              {data ? '수정' : '추가'}
            </Button>
          )}
        </div>
        {data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-4">
              <InfoRow label="창고" value={resolveWarehouseLabel(data.warehouse)} />
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
              <InfoRow label="훈증검역" value={renderNumber(data.fumigationQuarantine)} />
              <InfoRow label="수수료" value={renderNumber(data.fee)} />
            </div>
            <div className="grid grid-cols-5 gap-4">
              <InfoRow label="샘플채취" value={renderNumber(data.sampleCollection)} />
              <InfoRow label="쿼터 비용" value={renderNumber(data.quotaCost)} />
              {mode === 'PENDING' ? (
                <>
                  <InfoRow label="판매 환율" value={renderNumber(data.comparisonExchangeRate)} />
                  <InfoRow label="판매 원가" value={renderNumber(pendingSaleCost)} />
                  <div aria-hidden className="opacity-0" />
                </>
              ) : (
                <>
                  <InfoRow label="ETA 환율" value={renderNumber(data.dayExchangeRate)} />
                  <InfoRow
                    label="적용 환율"
                    value={renderNumber(
                      data.dayExchangeRate !== null && data.dayExchangeRate !== undefined
                        ? data.dayExchangeRate + 10
                        : null,
                    )}
                  />
                  <InfoRow label="구매원가" value={renderNumber(confirmedPurchaseCost)} />
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">입력된 데이터가 없습니다.</p>
        )}
      </div>
    );
  };

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

  if (!schedule) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent 
        className="h-full" 
        style={{ 
          width: '800px', 
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b border-border">
          <DrawerTitle>입고일정 상세정보</DrawerTitle>
        </DrawerHeader>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-muted-foreground">스케줄을 선택하면 상세 정보가 표시됩니다.</p>
        </div>
      </DrawerContent>
    </Drawer>
    );
  }

  const payments = schedule.payments ?? [];
  const paymentMethods = payments
    .map((payment) => payment.method)
    .filter((method): method is string => method !== null && method !== undefined && method.trim() !== '');

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent 
        className="h-full" 
        style={{ 
          width: '800px', 
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>입고일정 상세정보</DrawerTitle>
              <DrawerDescription>입고일정의 모든 정보를 확인할 수 있습니다.</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <ScrollArea 
          className="flex-1"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          onDoubleClick={handleDoubleClick}
        >
          <div className="p-4 space-y-6">
            {/* 현재 데이터 (입고 데이터 추가/수정 화면과 동일) */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">현재 데이터</h3>
              <div className="grid grid-cols-4 gap-4">
                <InfoRow label="수출사" value={schedule.exporter || '-'} />
                <InfoRow label="수출국" value={schedule.exportCountry || '-'} />
                <InfoRow 
                  label="쿼터 유무" 
                  value={schedule.quota === 'Y' ? '있음' : schedule.quota === 'N' ? '없음' : '-'} 
                />
                <InfoRow 
                  label="훈증 유무" 
                  value={schedule.fumigation === 'Y' ? '있음' : schedule.fumigation === 'N' ? '없음' : '-'} 
                />
                <InfoRow 
                  label="현물 유무" 
                  value={schedule.spot === 'Y' ? '있음' : schedule.spot === 'N' ? '없음' : '-'} 
                />
                <InfoRow 
                  label="관세 유무" 
                  value={schedule.customsDuty === 'Y' ? '있음' : schedule.customsDuty === 'N' ? '없음' : '-'} 
                />
                <InfoRow label="상품" value={schedule.product || '-'} />
                <InfoRow label="BK" value={schedule.bk || '-'} />
                <InfoRow label="BL" value={schedule.bl || '-'} />
                <InfoRow label="Qty" value={schedule.qty ? schedule.qty.toLocaleString() : '-'} />
                <InfoRow
                  label="Currency"
                  value={schedule.currencyName || schedule.currencyUnit || '-'}
                />
                <InfoRow
                  label="Unit Price"
                  value={schedule.unitPrice ? schedule.unitPrice.toLocaleString() : '-'}
                />
                <InfoRow
                  label="도착지"
                  value={resolveCodeValue(labelResolvers?.destination, schedule.destination)}
                />
                <InfoRow label="ETA" value={schedule.eta || '-'} />
                <InfoRow
                  label="총량"
                  value={
                    schedule.totalAmount !== null && schedule.totalAmount !== undefined
                      ? schedule.totalAmount.toLocaleString()
                      : schedule.invoiceWeight !== null && schedule.invoiceWeight !== undefined
                        ? schedule.invoiceWeight.toLocaleString('ko-KR', {
                            minimumFractionDigits: 3,
                            maximumFractionDigits: 3,
                          }) + ' MT'
                        : '-'
                  }
                />
                {paymentMethods.length > 0 && (
                  <InfoRow label="결제조건" value={paymentMethods.join(', ')} className="col-span-4" />
                )}
                {schedule.notes && (
                  <InfoRow label="비고" value={schedule.notes} className="col-span-4" />
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-6">
              {renderInboundSection('입고예정 데이터', 'PENDING', schedule.pendingInbound)}
              {renderInboundSection('입고확정 데이터', 'CONFIRMED', schedule.confirmedInbound)}
            </div>
          </div>
        </ScrollArea>

        {/* 하단 버튼 제거 (입고확정 버튼 없음) */}
      </DrawerContent>
    </Drawer>
  );
}

