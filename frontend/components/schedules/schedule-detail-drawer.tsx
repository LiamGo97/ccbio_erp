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
import { Loader2, Edit, X, Trash2 } from 'lucide-react';
import type { Schedule } from '@/app/schedules/page';
import { format, parseISO } from 'date-fns';

interface ScheduleDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
  onEdit?: (schedule: Schedule) => void;
  onDelete?: (schedule: Schedule) => void;
  labelResolvers?: {
    grade?: (code?: string | null) => string;
    packingType?: (code?: string | null) => string;
    destination?: (code?: string | null) => string;
    finalDestination?: (code?: string | null) => string;
  };
}

const InfoRow = ({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1 ${className || ''}`}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

export function ScheduleDetailDrawer({
  open,
  onOpenChange,
  schedule,
  onEdit,
  onDelete,
  labelResolvers,
}: ScheduleDetailDrawerProps) {
  if (!schedule) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '1200px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>스케줄 상세정보</DrawerTitle>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">스케줄을 선택하면 상세 정보가 표시됩니다.</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      if (dateStr.includes('T')) {
        return format(parseISO(dateStr), 'yyyy-MM-dd');
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount?: number | null, currency?: string | null) => {
    if (amount === null || amount === undefined) return '-';
    // 소수점 2자리로 포맷팅
    const formatted = amount.toLocaleString('ko-KR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return currency ? `${currency} ${formatted}` : formatted;
  };

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

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '1200px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>스케줄 상세정보</DrawerTitle>
              <DrawerDescription>스케줄의 모든 정보를 확인할 수 있습니다.</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-0">
            {/* 계약 정보 */}
            <div className="space-y-3 pb-6">
              <h3 className="text-sm font-semibold text-foreground">계약 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <InfoRow label="Contract No." value={schedule.contractNo || '-'} />
                <InfoRow label="EXPORTER" value={schedule.exporter || '-'} />
                <InfoRow label="수출국" value={schedule.exportCountry || '-'} />
                <InfoRow label="쿼터 유무" value={schedule.quota === 'Y' ? '있음' : schedule.quota === 'N' ? '없음' : '-'} />
                <InfoRow label="훈증 유무" value={schedule.fumigation === 'Y' ? '있음' : schedule.fumigation === 'N' ? '없음' : '-'} />
                <InfoRow label="현물 유무" value={schedule.spot === 'Y' ? '있음' : schedule.spot === 'N' ? '없음' : '-'} />
                <InfoRow label="관세 유무" value={schedule.customsDuty === 'Y' ? '있음' : schedule.customsDuty === 'N' ? '없음' : '-'} />
                <InfoRow label="Product" value={schedule.product || '-'} />
                <InfoRow label="발주일" value={formatDate(schedule.orderDate)} />
                <InfoRow label="담당" value={schedule.manager || '-'} />
                <InfoRow label="구분 (신/구)" value={schedule.newOld || '-'} />
                <InfoRow label="선사" value={schedule.shippingLine || '-'} />
                <InfoRow label="커미션 월" value={formatDate(schedule.commissionMonth)} />
                <InfoRow label="커미션 $" value={schedule.commissionDollar || '-'} />
              </div>
            </div>

            {/* 선적 기본 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">선적 기본 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <InfoRow label="선적 순번" value={schedule.shipmentSeq ? schedule.shipmentSeq : '-'} />
                <InfoRow label="BK" value={schedule.bk || '-'} />
                <InfoRow label="BL" value={schedule.bl || '-'} />
              </div>
            </div>

            {/* 수량 및 가격 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">수량 및 가격 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <InfoRow label="Qty" value={schedule.qty ? schedule.qty.toLocaleString() : '-'} />
                <InfoRow label="Grade" value={resolveCodeValue(labelResolvers?.grade, schedule.grade)} />
                <InfoRow label="Packing" value={resolveCodeValue(labelResolvers?.packingType, schedule.packingType)} />
                <InfoRow label="Currency unit" value={schedule.currencyUnit || '-'} />
                <InfoRow label="Unit price" value={formatCurrency(schedule.unitPrice, schedule.currencyUnit)} />
                <InfoRow label="총량" value={schedule.totalAmount ? schedule.totalAmount.toLocaleString() : '-'} />
                <InfoRow
                  label="인보이스금액"
                  value={formatCurrency(schedule.invoiceAmount, schedule.currencyUnit)}
                />
              </div>
            </div>

            {/* 배송 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">배송 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <InfoRow label="도착지" value={resolveCodeValue(labelResolvers?.destination, schedule.destination)} />
                <InfoRow label="ETD" value={formatDate(schedule.etd)} />
                <InfoRow label="ETA" value={formatDate(schedule.eta)} />
                <InfoRow
                  label="최종 목적지"
                  value={resolveCodeValue(labelResolvers?.finalDestination, schedule.finalDestination)}
                />
                <InfoRow label="최종 목적지 도착일" value={formatDate(schedule.finalDestinationArrivalDate)} />
                <InfoRow label="원본발송" value={schedule.originalShipment || '-'} />
              </div>
            </div>

            {/* 통관 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">통관 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <InfoRow label="검역일" value={formatDate(schedule.quarantineDate)} />
                <InfoRow label="통관일" value={formatDate(schedule.customsDate)} />
                <InfoRow label="필증신청" value={schedule.certificateRequest || '-'} />
              </div>
            </div>

            {/* 결제 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">결제 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <InfoRow label="은행픽업" value={formatDate(schedule.bankPickup)} />
              </div>
              {schedule.payments && schedule.payments.length > 0 ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-md border border-border bg-muted/10 p-4 space-y-3">
                    <div className="text-sm font-semibold text-foreground">1차 결제</div>
                    <div className="grid grid-cols-6 gap-3">
                      <InfoRow label="결제 예정일" value={formatDate(schedule.payments[0]?.dueDate)} className="text-[11px]" />
                      <InfoRow
                        label="비율 (%)"
                        value={schedule.payments[0]?.ratio != null ? `${schedule.payments[0].ratio}%` : '-'}
                        className="text-[11px]"
                      />
                      <InfoRow
                        label="결제조건"
                        value={schedule.payments[0]?.method || '-'}
                        className="text-[11px]"
                      />
                      <InfoRow
                        label="금액"
                        value={formatCurrency(schedule.payments[0]?.amount, schedule.invoiceCurrencyName || schedule.currencyUnit)}
                        className="text-[11px]"
                      />
                      <InfoRow
                        label="환율"
                        value={schedule.payments[0]?.exchangeRate != null ? schedule.payments[0].exchangeRate.toLocaleString() : '-'}
                        className="text-[11px]"
                      />
                      <InfoRow
                        label="결제 결과"
                        value={schedule.payments[0]?.result || '-'}
                        className="text-[11px]"
                      />
                    </div>
                  </div>
                  {schedule.payments[1] && (
                    <div className="rounded-md border border-border bg-muted/10 p-4 space-y-3">
                      <div className="text-sm font-semibold text-foreground">2차 결제</div>
                      <div className="grid grid-cols-6 gap-3">
                        <InfoRow label="결제 예정일" value={formatDate(schedule.payments[1]?.dueDate)} className="text-[11px]" />
                        <InfoRow
                          label="비율 (%)"
                          value={schedule.payments[1]?.ratio != null ? `${schedule.payments[1].ratio}%` : '-'}
                          className="text-[11px]"
                        />
                        <InfoRow
                          label="결제조건"
                          value={schedule.payments[1]?.method || '-'}
                          className="text-[11px]"
                        />
                        <InfoRow
                          label="금액"
                          value={formatCurrency(schedule.payments[1]?.amount, schedule.invoiceCurrencyName || schedule.currencyUnit)}
                          className="text-[11px]"
                        />
                        <InfoRow
                          label="환율"
                          value={schedule.payments[1]?.exchangeRate != null ? schedule.payments[1].exchangeRate.toLocaleString() : '-'}
                          className="text-[11px]"
                        />
                        <InfoRow
                          label="결제 결과"
                          value={schedule.payments[1]?.result || '-'}
                          className="text-[11px]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 text-sm text-muted-foreground">결제 정보가 없습니다.</div>
              )}
            </div>

            {/* 파일 및 이미지 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">파일 및 이미지</h3>
              <div className="grid grid-cols-6 gap-4">
                <InfoRow
                  label="계약서 파일"
                  value={
                    schedule.contractFileName
                      ? (
                          <a
                            href={`https://drive.google.com/file/d/${schedule.contractGoogleDriveFileId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {schedule.contractFileName}
                          </a>
                        )
                      : '-'
                  }
                  className="col-span-2"
                />
                <InfoRow
                  label="송장 파일"
                  value={
                    schedule.invoiceFileName
                      ? (
                          <a
                            href={`https://drive.google.com/file/d/${schedule.invoiceGoogleDriveFileId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {schedule.invoiceFileName}
                          </a>
                        )
                      : '-'
                  }
                  className="col-span-2"
                />
                <InfoRow
                  label="제품 이미지 폴더"
                  value={
                    schedule.productImagesFolderName
                      ? (
                          <a
                            href={`https://drive.google.com/drive/folders/${schedule.productImagesFolderId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {schedule.productImagesFolderName}
                          </a>
                        )
                      : '-'
                  }
                  className="col-span-2"
                />
              </div>
            </div>

            {/* 기타 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">기타 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <InfoRow label="클레임" value={schedule.claim || '-'} />
                <InfoRow label="STO" value={schedule.sto || '-'} />
                <InfoRow label="DM" value={schedule.dm || '-'} />
                <InfoRow label="DT" value={schedule.dt || '-'} />
                <InfoRow label="CB" value={schedule.cb || '-'} />
                <InfoRow label="비고" value={schedule.notes || '-'} className="col-span-2" />
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
            {onDelete && (
              <Button
                variant="destructive"
                disabled={!schedule}
                onClick={() => {
                  if (schedule && onDelete) {
                    onDelete(schedule);
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                삭제
              </Button>
            )}
            {onEdit && (
              <Button
                variant="default"
                disabled={!schedule}
                onClick={() => {
                  if (schedule && onEdit) {
                    onEdit(schedule);
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
    </Drawer>
  );
}

