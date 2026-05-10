'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
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
import { SalesDelivery, useUpdateSalesDelivery, SalesDeliveryLoadingItem } from '@/lib/hooks/use-sales-delivery';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';

interface LoadingItemFormData {
  id: string;
  salesItemId: string;
  workBL: string;
  workContainer: string;
  workContainerType: string;
  workBales: string;
  workWeight: string;
  notes: string;
}

interface LoadingCompanyDeliveryEditFormData {
  loadingItems: LoadingItemFormData[];
  status: string;
}

interface LoadingCompanyDeliveryEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: SalesDelivery | null;
  warehouseId?: number | null;
  onSuccess?: () => void;
}

export const LoadingCompanyDeliveryEditDrawer: React.FC<LoadingCompanyDeliveryEditDrawerProps> = ({
  open,
  onOpenChange,
  delivery,
  warehouseId,
  onSuccess,
}) => {
  const isMobile = useIsMobile();
  const updateMutation = useUpdateSalesDelivery();
  // SALES_DELIVERY_STATUS 그룹 사용 (DISPATCH_COMPLETED, LOADING, LOADING_COMPLETED 포함)
  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  

  // 상차 업체가 변경할 수 있는 상태 목록
  const allowedStatusValues = React.useMemo(() => {
    // 상차 업체: 배차 완료(DISPATCH_COMPLETED), 상차 중(LOADING), 상차 완료(LOADING_COMPLETED)
    // SALES_DELIVERY_STATUS 그룹의 상태 코드 사용
    return ['DISPATCH_COMPLETED', 'LOADING', 'LOADING_COMPLETED'];
  }, []);

  // 선택 가능한 상태 코드만 필터링
  // 데이터베이스에 상태 코드가 없을 경우를 대비해 하드코딩된 목록도 제공
  const availableStatusCodes = React.useMemo(() => {
    if (!statusCodes || statusCodes.length === 0) {
      // 데이터베이스에 상태 코드가 없을 경우 하드코딩된 목록 사용
      return [
        { value: 'DISPATCH_COMPLETED', name: '배차 완료' },
        { value: 'LOADING', name: '상차 중' },
        { value: 'LOADING_COMPLETED', name: '상차 완료' },
      ];
    }
    
    const filtered = statusCodes.filter((code) => {
      const codeValue = (code.value || code.name || '').trim().toUpperCase();
      return allowedStatusValues.includes(codeValue);
    });
    
    // 필터링된 결과가 없으면 하드코딩된 목록 사용
    if (filtered.length === 0) {
      return [
        { value: 'DISPATCH_COMPLETED', name: '배차 완료' },
        { value: 'LOADING', name: '상차 중' },
        { value: 'LOADING_COMPLETED', name: '상차 완료' },
      ];
    }
    
    // 상태 순서 정렬 (배차 완료 -> 상차 중 -> 상차 완료)
    const statusOrder = ['DISPATCH_COMPLETED', 'LOADING', 'LOADING_COMPLETED'];
    return filtered.sort((a, b) => {
      const aValue = (a.value || a.name || '').trim().toUpperCase();
      const bValue = (b.value || b.name || '').trim().toUpperCase();
      const aIndex = statusOrder.indexOf(aValue);
      const bIndex = statusOrder.indexOf(bValue);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [statusCodes, allowedStatusValues]);

  // warehouseId 없음(undefined) = 관리자 화면 → 전체 상차지 표시 / warehouseId 있음 = 해당 창고만
  const myLoadingItems = React.useMemo(() => {
    if (!delivery?.loadingItems) return [];
    if (warehouseId === undefined) return delivery.loadingItems; // 관리자: 모든 상차지
    if (warehouseId === null) return [];
    return delivery.loadingItems.filter((item) => {
      return item.loadingWarehouse?.id === warehouseId || item.loadingWarehouseId === warehouseId;
    });
  }, [delivery?.loadingItems, warehouseId]);

  // 각 loadingItem의 요청 BL/컨테이너 정보 (괄호 "요청:" 표시용, 작업 정보와 구분)
  const getRequestBL = React.useCallback((item: SalesDeliveryLoadingItem) => {
    if (item.requestBL) return item.requestBL;
    const salesItem = item.salesItem;
    const order = salesItem?.container?.order;
    return order?.bl || '';
  }, []);

  const getRequestContainer = React.useCallback((item: SalesDeliveryLoadingItem) => {
    if (item.requestContainer) return item.requestContainer;
    const salesItem = item.salesItem;
    const container = salesItem?.container;
    return container?.containerNo || '';
  }, []);

  const getRequestContainerType = React.useCallback((item: SalesDeliveryLoadingItem) => {
    if (item.requestContainerType) return item.requestContainerType;
    const salesItem = item.salesItem;
    return salesItem?.containerType || '';
  }, []);


  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LoadingCompanyDeliveryEditFormData>({
    defaultValues: React.useMemo(
      () => ({
        loadingItems: myLoadingItems.map((item) => {
          const requestBL = getRequestBL(item);
          const requestContainer = getRequestContainer(item);
          const requestContainerType = getRequestContainerType(item);
          
          return {
            id: item.id,
            salesItemId: item.salesItemId,
            workBL: item.workBL || requestBL || '',
            workContainer: item.workContainer || requestContainer || '',
            workContainerType: requestContainerType || '',
            workBales: item.workBales?.toString() || '',
            workWeight: item.workWeight?.toString() || '',
            notes: (delivery?.workLines?.[delivery.loadingItems?.findIndex((li) => li.id === item.id) ?? -1]?.notes ?? item.notes) || '',
          };
        }),
        status: delivery?.status || '',
      }),
      [delivery, myLoadingItems, getRequestBL, getRequestContainer, getRequestContainerType],
    ),
  });

  React.useEffect(() => {
    if (open && delivery) {
      const resetData = {
        loadingItems: myLoadingItems.map((item) => {
          const requestBL = getRequestBL(item);
          const requestContainer = getRequestContainer(item);
          const requestContainerType = getRequestContainerType(item);
          
          // 작업 BL/컨테이너: 기존 값이 있으면 우선 사용, 없으면 요청 값 사용
          const workBL = item.workBL || requestBL || '';
          const workContainer = item.workContainer || requestContainer || '';
          
          // 작업 베일/중량: 기존 값이 있으면 우선 사용
          let workBales = item.workBales?.toString() || '';
          let workWeight = item.workWeight?.toString() || '';
          
          // 타입 설정: 기존 값 우선, 없으면 요청 타입 사용
          const workContainerType = item.workContainerType || requestContainerType || '';
          
          return {
            id: item.id,
            salesItemId: item.salesItemId,
            workBL,
            workContainer,
            workContainerType,
            workBales,
            workWeight,
            notes: (delivery?.workLines?.[delivery.loadingItems?.findIndex((li) => li.id === item.id) ?? -1]?.notes ?? (item as any).notes) || '',
          };
        }),
        status: delivery?.status || '',
      };
      
      reset(resetData);
    }
  }, [open, delivery, reset, myLoadingItems, getRequestBL, getRequestContainer, getRequestContainerType]);

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

  const onSubmit = async (data: LoadingCompanyDeliveryEditFormData) => {
    if (!delivery?.id) {
      toast({
        title: '오류',
        description: '배송 정보를 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // 전체 loadingItems를 가져와서 해당 창고의 항목만 업데이트
      const allLoadingItems = delivery.loadingItems || [];
      const updatedLoadingItems = allLoadingItems.map((item) => {
        // 해당 창고의 항목인지 확인
        const isMyItem = myLoadingItems.some((myItem) => myItem.id === item.id);
        
        if (isMyItem) {
          // 폼에서 해당 항목 찾기
          const formItem = data.loadingItems.find((formItem) => formItem.id === item.id);
          if (formItem) {
            return {
              id: item.id,
              salesItemId: item.salesItemId,
              loadingSchedule: item.loadingSchedule ? new Date(item.loadingSchedule).toISOString().split('T')[0] : undefined,
              loadingScheduleTime: item.loadingScheduleTime || undefined,
              workBL: formItem.workBL?.trim() || undefined,
              workContainer: formItem.workContainer?.trim() || undefined,
              workContainerType: formItem.workContainerType || undefined,
              workBales: formItem.workBales ? parseFloat(formItem.workBales) : undefined,
              workWeight: formItem.workWeight ? parseFloat(formItem.workWeight) : undefined,
              notes: formItem.notes?.trim() || undefined,
              order: item.order || undefined,
            };
          }
        }
        
        // 다른 창고의 항목은 기존 값 유지 (작업 비고는 work_line에서)
        const otherIndex = allLoadingItems.findIndex((li) => li.id === item.id);
        const otherNotes = delivery?.workLines?.[otherIndex]?.notes ?? (item as any).notes;
        return {
          id: item.id,
          salesItemId: item.salesItemId,
          loadingSchedule: item.loadingSchedule ? new Date(item.loadingSchedule).toISOString().split('T')[0] : undefined,
          loadingScheduleTime: item.loadingScheduleTime || undefined,
          workBL: item.workBL || undefined,
          workContainer: item.workContainer || undefined,
          workContainerType: item.workContainerType || undefined,
          workBales: item.workBales || undefined,
          workWeight: item.workWeight || undefined,
          notes: otherNotes ?? undefined,
          order: item.order || undefined,
        };
      });

      await updateMutation.mutateAsync({
        id: delivery.id.toString(),
        data: {
          loadingItems: updatedLoadingItems,
          status: data.status || undefined,
          syncWorkLine: true,
        },
      });

      toast({
        title: '수정 완료',
        description: '상차 정보가 수정되었습니다.',
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: '수정 실패',
        description: error.message || '상차 정보 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const formLoadingItems = watch('loadingItems');

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
              <DrawerTitle>상차 정보 수정</DrawerTitle>
              <DrawerDescription>상차 작업 정보를 수정합니다.</DrawerDescription>
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
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement && !(e.target instanceof HTMLTextAreaElement)) {
              // Input 필드에서 Enter를 누른 경우는 위의 onKeyDown에서 처리
              // 여기서는 기본 동작만 방지
              e.preventDefault();
            }
          }}
        >
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {/* 상차 작업 정보 */}
              {formLoadingItems && formLoadingItems.length > 0 && (
                <div className="space-y-4">
                  {formLoadingItems.map((item, index) => {
                    const originalItem = myLoadingItems.find((li) => li.id === item.id);
                    const requestBL = originalItem ? getRequestBL(originalItem) : '';
                    const requestContainer = originalItem ? getRequestContainer(originalItem) : '';
                    const requestContainerType = originalItem ? getRequestContainerType(originalItem) : '';
                    // 요청 베일/중량: SalesItem의 cargoBales/cargoWeight 우선, 없으면 Container의 bales/weight 사용
                    const salesItem = originalItem?.salesItem;
                    const container = salesItem?.container;
                    const containerSequence = container?.sequence;
                    // 요청 베일: 소수점 이하가 0이면 정수로 표시
                    const requestBalesRaw = salesItem?.cargoBales || (container != null ? (container.salesBales ?? container.tradeBales) : null) || null;
                    const requestBales = requestBalesRaw 
                      ? (parseFloat(String(requestBalesRaw)) % 1 === 0 
                          ? parseFloat(String(requestBalesRaw)).toFixed(0) 
                          : String(requestBalesRaw))
                      : null;
                    const requestWeightRaw = salesItem?.cargoWeight || container?.weight || null;
                    const requestWeight = requestWeightRaw 
                      ? (parseFloat(String(requestWeightRaw)) % 1 === 0 
                          ? parseFloat(String(requestWeightRaw)).toFixed(0) 
                          : String(requestWeightRaw))
                      : null;
                    
                    return (
                    <div key={item.id} className="border rounded-lg p-4 space-y-4">
                      <h4 className="text-sm font-semibold">상차지 {index + 1}</h4>
                      
                      {/* 작업 정보 */}
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label htmlFor={`workBL-${item.id}`}>
                            작업 BL {requestBL && <span className="text-xs text-muted-foreground">(요청: {requestBL})</span>}
                          </Label>
                          <Input
                            id={`workBL-${item.id}`}
                            {...register(`loadingItems.${index}.workBL`)}
                            placeholder="작업 BL을 입력하세요"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById(`workContainer-${item.id}`)?.focus();
                              }
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`workContainer-${item.id}`}>
                            작업 컨테이너 {requestContainer && <span className="text-xs text-muted-foreground">(요청: {requestContainer}{containerSequence != null ? ` [${containerSequence}]` : ''})</span>}
                          </Label>
                          <Controller
                            name={`loadingItems.${index}.workContainer`}
                            control={control}
                            render={({ field }) => {
                              const displayValue = field.value && requestContainer && field.value === requestContainer && containerSequence != null
                                ? `${field.value} [${containerSequence}]`
                                : field.value || '';
                              return (
                                <Input
                                  id={`workContainer-${item.id}`}
                                  value={displayValue}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\s*\[\d+\]\s*$/, '').trim();
                                    field.onChange(v);
                                  }}
                                  onBlur={field.onBlur}
                                  placeholder="작업 컨테이너를 입력하세요"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const currentType = watch(`loadingItems.${index}.workContainerType`);
                                      if (currentType === 'CARGO') {
                                        const nextBalesId = `workBales-${item.id}`;
                                        const nextBalesElement = document.getElementById(nextBalesId);
                                        if (nextBalesElement) {
                                          nextBalesElement.focus();
                                        } else {
                                          document.getElementById(`notes-${item.id}`)?.focus();
                                        }
                                      } else {
                                        document.getElementById(`notes-${item.id}`)?.focus();
                                      }
                                    }
                                  }}
                                />
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`workContainerType-${item.id}`}>
                            타입 {requestContainerType && <span className="text-xs text-muted-foreground">(요청: {requestContainerType === 'CONTAINER' ? '컨테이너' : '카고'})</span>}
                          </Label>
                          <Select
                            value={watch(`loadingItems.${index}.workContainerType`) || ''}
                            onValueChange={(value) => {
                              setValue(`loadingItems.${index}.workContainerType`, value, { shouldDirty: true });
                              // 타입이 컨테이너로 변경되면 작업 베일/중량 초기화
                              if (value === 'CONTAINER') {
                                setValue(`loadingItems.${index}.workBales`, '', { shouldDirty: true });
                                setValue(`loadingItems.${index}.workWeight`, '', { shouldDirty: true });
                              }
                            }}
                          >
                            <SelectTrigger id={`workContainerType-${item.id}`}>
                              <SelectValue placeholder="타입 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CONTAINER">컨테이너</SelectItem>
                              <SelectItem value="CARGO">카고</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {/* 타입이 카고일 때만 작업 베일/중량 표시 */}
                        {watch(`loadingItems.${index}.workContainerType`) === 'CARGO' && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor={`workBales-${item.id}`}>
                                작업 베일 {requestBales != null && <span className="text-xs text-muted-foreground">(요청: {requestBales})</span>}
                              </Label>
                              <Input
                                id={`workBales-${item.id}`}
                                {...register(`loadingItems.${index}.workBales`)}
                                type="number"
                                step="1"
                                min="0"
                                placeholder="작업 베일을 입력하세요"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    document.getElementById(`workWeight-${item.id}`)?.focus();
                                  }
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`workWeight-${item.id}`}>
                                작업 중량 (KG) {requestWeight != null && String(requestWeight).trim() !== '' && <span className="text-xs text-muted-foreground">(요청: {String(requestWeight).trim()})</span>}
                              </Label>
                              <Input
                                id={`workWeight-${item.id}`}
                                value={watch(`loadingItems.${index}.workWeight`) !== '' && watch(`loadingItems.${index}.workWeight`) != null
                                  ? Math.round(parseFloat(String(watch(`loadingItems.${index}.workWeight`)) || '0') * 1000).toLocaleString('ko-KR')
                                  : ''}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/,/g, '').trim();
                                  if (raw === '') {
                                    setValue(`loadingItems.${index}.workWeight`, '', { shouldDirty: true });
                                    return;
                                  }
                                  const num = parseFloat(raw);
                                  if (!Number.isNaN(num) && num >= 0) setValue(`loadingItems.${index}.workWeight`, String(num / 1000), { shouldDirty: true });
                                }}
                                onBlur={(e) => {
                                  const raw = e.target.value.replace(/,/g, '').trim();
                                  if (raw === '') {
                                    setValue(`loadingItems.${index}.workWeight`, '', { shouldDirty: true });
                                    return;
                                  }
                                  const num = parseFloat(raw);
                                  if (!Number.isNaN(num) && num >= 0) setValue(`loadingItems.${index}.workWeight`, String(num / 1000), { shouldDirty: true });
                                }}
                                type="text"
                                inputMode="numeric"
                                placeholder="작업 중량 입력 (KG)"
                                onKeyDown={(e) => {
                                  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    document.getElementById(`notes-${item.id}`)?.focus();
                                  }
                                }}
                              />
                            </div>
                          </>
                        )}
                        {originalItem?.requestNotes?.trim() && (
                          <div className="space-y-2 md:col-span-3">
                            <Label className="text-muted-foreground">요청 비고 (관리자)</Label>
                            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">
                              {originalItem.requestNotes.trim()}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2 md:col-span-3">
                          <Label htmlFor={`notes-${item.id}`}>비고 (상차 업체 입력)</Label>
                          <Input
                            id={`notes-${item.id}`}
                            {...register(`loadingItems.${index}.notes`)}
                            placeholder="비고를 입력하세요"
                            onKeyDown={(e) => {
                              // Enter 키: 다음 상차지의 작업 BL로 이동하거나, 마지막이면 상태 필드로 이동
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                // 다음 상차지의 작업 BL 찾기
                                const nextIndex = index + 1;
                                if (formLoadingItems && formLoadingItems[nextIndex]) {
                                  const nextItem = formLoadingItems[nextIndex];
                                  document.getElementById(`workBL-${nextItem.id}`)?.focus();
                                } else {
                                  // 마지막 상차지이면 상태 필드로 이동
                                  const statusTrigger = document.querySelector('[id="status"]') as HTMLElement;
                                  if (statusTrigger) {
                                    statusTrigger.focus();
                                  }
                                }
                              }
                            }}
                          />
                        </div>
                        <input type="hidden" {...register(`loadingItems.${index}.id`)} value={item.id} />
                        <input type="hidden" {...register(`loadingItems.${index}.salesItemId`)} value={item.salesItemId} />
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
              
              {/* 상태 */}
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

