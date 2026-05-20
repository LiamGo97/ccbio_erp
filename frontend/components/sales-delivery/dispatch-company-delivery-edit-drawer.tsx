'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Save } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useUnloadingCompanies } from '@/lib/hooks/use-unloading-companies';
import { DatePicker } from '@/components/schedules/date-picker';
import { SalesDelivery, useUpdateSalesDelivery } from '@/lib/hooks/use-sales-delivery';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatNumber } from '@/lib/utils';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

interface DispatchCompanyDeliveryEditFormData {
  // 차량 정보
  vehicleNumber: string;
  driverContact: string;
  driverName: string;
  entryTime: string;
  // 실제 일시
  loadingDateTime: string;
  unloadingDateTime: string;
  // 비용 정보
  transportFee: string;
  weighingFee: string;
  // 상태
  status: string;
}

interface DispatchCompanyDeliveryEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: SalesDelivery | null;
  onSuccess?: () => void;
}

export const DispatchCompanyDeliveryEditDrawer: React.FC<DispatchCompanyDeliveryEditDrawerProps> = ({
  open,
  onOpenChange,
  delivery,
  onSuccess,
}) => {
  const isMobile = useIsMobile();
  const updateMutation = useUpdateSalesDelivery();
  const { data: unloadingCompanies = [] } = useUnloadingCompanies();
  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');

  // 배차 업체가 변경할 수 있는 상태 목록
  const allowedStatusValues = React.useMemo(() => {
    // 배차 업체: 배차 요청(DISPATCH_REQUESTED), 배차 중(DISPATCHING), 배차 완료(DISPATCH_COMPLETED), 배차 실패(FAILED), 일정 조정(RESCHEDULED)
    return ['DISPATCH_REQUESTED', 'DISPATCHING', 'DISPATCH_COMPLETED', 'FAILED', 'RESCHEDULED'];
  }, []);

  // 선택 가능한 상태 코드만 필터링
  // 데이터베이스에 상태 코드가 없을 경우를 대비해 하드코딩된 목록도 제공
  const availableStatusCodes = React.useMemo(() => {
    if (!statusCodes || statusCodes.length === 0) {
      // 데이터베이스에 상태 코드가 없을 경우 하드코딩된 목록 사용
      return [
        { value: 'DISPATCH_REQUESTED', name: '배차 요청' },
        { value: 'DISPATCHING', name: '배차 중' },
        { value: 'DISPATCH_COMPLETED', name: '배차 완료' },
        { value: 'FAILED', name: '배차 실패' },
        { value: 'RESCHEDULED', name: '일정 조정' },
      ];
    }
    
    const filtered = statusCodes.filter((code) => {
      const codeValue = (code.value || code.name || '').trim();
      return allowedStatusValues.includes(codeValue);
    });
    
    // 필터링된 결과가 없거나 DISPATCHING이 없는 경우 하드코딩된 목록 사용
    if (filtered.length === 0 || !filtered.some(code => (code.value || code.name || '').trim() === 'DISPATCHING')) {
      return [
        { value: 'DISPATCH_REQUESTED', name: '배차 요청' },
        { value: 'DISPATCHING', name: '배차 중' },
        { value: 'DISPATCH_COMPLETED', name: '배차 완료' },
        { value: 'FAILED', name: '배차 실패' },
        { value: 'RESCHEDULED', name: '일정 조정' },
      ];
    }
    
    return filtered;
  }, [statusCodes, allowedStatusValues]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<DispatchCompanyDeliveryEditFormData>({
    defaultValues: React.useMemo(
      () => ({
        vehicleNumber: delivery?.vehicleNumber || '',
        driverContact: delivery?.driverContact || '',
        driverName: delivery?.driverName || '',
        entryTime: delivery?.entryTime || '',
        loadingDateTime: delivery?.loadingDateTime || '',
        unloadingDateTime: delivery?.unloadingDateTime || '',
        transportFee: delivery?.transportFee ? (delivery.transportFee / 10000).toString() : '',
        weighingFee: delivery?.weighingFee ? (delivery.weighingFee / 10000).toString() : '',
        status: delivery?.status || '',
      }),
      [delivery],
    ),
  });

  React.useEffect(() => {
    if (open && delivery) {
      reset({
        vehicleNumber: delivery?.vehicleNumber || '',
        driverContact: delivery?.driverContact || '',
        driverName: delivery?.driverName || '',
        entryTime: delivery?.entryTime || '',
        loadingDateTime: delivery?.loadingDateTime || '',
        unloadingDateTime: delivery?.unloadingDateTime || '',
        transportFee: delivery?.transportFee ? (delivery.transportFee / 10000).toString() : '',
        weighingFee: delivery?.weighingFee ? (delivery.weighingFee / 10000).toString() : '',
        status: delivery?.status || '',
      });
    }
  }, [open, delivery, reset]);

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

  const onSubmit = async (data: DispatchCompanyDeliveryEditFormData) => {
    if (!delivery?.id) {
      toast({
        title: '오류',
        description: '배송 정보를 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    /** 변경하지 않은 필드는 undefined → 백엔드가 기존 값 유지. 의도적으로 비운 필드만 null */
    const dirtyString = (
      key: keyof Pick<
        DispatchCompanyDeliveryEditFormData,
        | 'vehicleNumber'
        | 'driverContact'
        | 'driverName'
        | 'entryTime'
        | 'loadingDateTime'
        | 'unloadingDateTime'
      >,
      value: string,
    ): string | null | undefined => {
      if (!dirtyFields[key]) return undefined;
      const t = value.trim();
      return t === '' ? null : t;
    };

    const dirtyFee = (
      key: 'transportFee' | 'weighingFee',
      value: string,
    ): number | null | undefined => {
      if (!dirtyFields[key]) return undefined;
      if (value === '' || value == null) return null;
      return parseFloat(String(value)) * 10000;
    };

    try {
      await updateMutation.mutateAsync({
        id: delivery.id.toString(),
        data: {
          vehicleNumber: dirtyString('vehicleNumber', data.vehicleNumber),
          driverContact: dirtyString('driverContact', data.driverContact),
          driverName: dirtyString('driverName', data.driverName),
          entryTime: dirtyString('entryTime', data.entryTime),
          loadingDateTime: dirtyString('loadingDateTime', data.loadingDateTime),
          unloadingDateTime: dirtyString('unloadingDateTime', data.unloadingDateTime),
          transportFee: dirtyFee('transportFee', data.transportFee),
          weighingFee: dirtyFee('weighingFee', data.weighingFee),
          status: dirtyFields.status ? data.status || undefined : undefined,
        },
      });

      toast({
        title: '수정 완료',
        description: '배차 정보가 수정되었습니다.',
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: '수정 실패',
        description: error.message || '배차 정보 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full flex flex-col"
        style={{
          width: isMobile ? '100%' : '900px',
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={(e) => {
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
        }}
        onDoubleClick={(e) => {
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
        }}
      >
        <DrawerHeader className="border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>배차 정보 수정</DrawerTitle>
              <DrawerDescription>배차 정보를 수정합니다.</DrawerDescription>
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

        <form 
          onSubmit={handleSubmit(onSubmit)} 
          className="flex flex-col flex-1 min-h-0"
          onKeyDown={(e) => {
            // Enter 키를 누르면 기본 제출 동작 방지 (다음 필드로 이동하도록 위에서 처리)
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
              // Input 필드에서 Enter를 누른 경우는 위의 onKeyDown에서 처리
              // 여기서는 기본 동작만 방지
              e.preventDefault();
            }
          }}
        >
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {/* 배차 정보 */}
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicleNumber">차량번호</Label>
                    <Input
                      id="vehicleNumber"
                      {...register('vehicleNumber')}
                      placeholder="차량번호를 입력하세요"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('driverContact')?.focus();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driverContact">운송차 연락처</Label>
                    <Input
                      id="driverContact"
                      {...register('driverContact')}
                      placeholder="운송차 연락처를 입력하세요 (예: 010-1234-5678)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('driverName')?.focus();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driverName">기사명</Label>
                    <Input
                      id="driverName"
                      {...register('driverName')}
                      placeholder="기사명을 입력하세요"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('entryTime')?.focus();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entryTime">입차예정시간</Label>
                    <Input
                      id="entryTime"
                      {...register('entryTime')}
                      placeholder="입차예정시간을 입력하세요 (예: 오전 11:30, 농)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('loadingDateTime')?.focus();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loadingDateTime">상차일시</Label>
                    <Input
                      id="loadingDateTime"
                      {...register('loadingDateTime')}
                      placeholder="상차일시를 입력하세요"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('unloadingDateTime')?.focus();
                        }
                      }}
                    />
                    {(() => {
                      // 배차 업체가 입력한 상차일시가 있으면 표시, 없으면 관리자가 입력한 일정 정보 표시
                      const existingDateTime = delivery?.loadingDateTime;
                      if (existingDateTime) {
                        return (
                          <p className="text-xs text-muted-foreground">
                            기존: {existingDateTime} (변경시 입력)
                          </p>
                        );
                      }
                      const firstLoadingItem = delivery?.loadingItems?.[0];
                      const loadingSchedule = firstLoadingItem?.loadingSchedule;
                      const loadingScheduleTime = firstLoadingItem?.loadingScheduleTime;
                      if (loadingSchedule) {
                        const scheduleStr = formatDate(loadingSchedule);
                        const timeStr = loadingScheduleTime ? ` ${loadingScheduleTime}` : '';
                        return (
                          <p className="text-xs text-muted-foreground">
                            기존: {scheduleStr}{timeStr} (변경시 입력)
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unloadingDateTime">하차일시</Label>
                    <Input
                      id="unloadingDateTime"
                      {...register('unloadingDateTime')}
                      placeholder="하차일시를 입력하세요"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('transportFee')?.focus();
                        }
                      }}
                    />
                    {(() => {
                      // 배차 업체가 입력한 하차일시가 있으면 표시, 없으면 관리자가 입력한 일정 정보 표시
                      const existingDateTime = delivery?.unloadingDateTime;
                      if (existingDateTime) {
                        return (
                          <p className="text-xs text-muted-foreground">
                            기존: {existingDateTime} (변경시 입력)
                          </p>
                        );
                      }
                      const unloadingScheduleDate = delivery?.unloadingScheduleDate;
                      const unloadingScheduleTime = delivery?.unloadingScheduleTime;
                      if (unloadingScheduleDate) {
                        const dateStr = formatDate(unloadingScheduleDate);
                        const timeStr = unloadingScheduleTime ? ` ${unloadingScheduleTime}` : '';
                        return (
                          <p className="text-xs text-muted-foreground">
                            기존: {dateStr}{timeStr} (변경시 입력)
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transportFee">운송비</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="transportFee"
                        {...register('transportFee')}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="운송비를 입력하세요"
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            document.getElementById('weighingFee')?.focus();
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">만원</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weighingFee">계근비</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="weighingFee"
                        {...register('weighingFee')}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="계근비를 입력하세요"
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            // 마지막 필드이므로 저장하지 않고 상태 필드로 이동
                            const statusTrigger = document.querySelector('[id="status"]') as HTMLElement;
                            if (statusTrigger) {
                              statusTrigger.focus();
                            }
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">만원</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">상태</Label>
                    <Select
                      value={watch('status') || ''}
                      onValueChange={(value) => setValue('status', value || '', { shouldDirty: true })}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="상태 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStatusCodes.map((code) => (
                          <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                            {code.name || code.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DrawerFooter className="border-t border-border flex-shrink-0">
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
                <Button type="submit" disabled={isSubmitting || updateMutation.isPending}>
                  {isSubmitting || updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      저장
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
};

