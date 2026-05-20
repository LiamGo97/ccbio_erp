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
import { useSalesDelivery, SalesDelivery, useUpdateSalesDelivery } from '@/lib/hooks/use-sales-delivery';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Edit, X, Copy } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { useUnloadingCompanies } from '@/lib/hooks/use-unloading-companies';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatNumber } from '@/lib/utils';
import { DispatchCompanyDeliveryEditDrawer } from './dispatch-company-delivery-edit-drawer';
import { salesUnloadingMainLine } from '@/lib/sales-unloading-display';
import { SalesDeliverySalesNotesSection } from './sales-delivery-sales-notes-section';

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits;
};

export interface DispatchCompanyDeliveryDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId?: string | null;
  title?: string;
  description?: string;
  onSuccess?: () => void;
}

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

export const DispatchCompanyDeliveryDetailDrawer: React.FC<DispatchCompanyDeliveryDetailDrawerProps> = ({
  open,
  onOpenChange,
  deliveryId,
  title = '배차관리 상세정보',
  description = '배차 요청 배송 정보를 확인하고 관리합니다.',
  onSuccess,
}) => {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useSalesDelivery(deliveryId ?? null);
  const updateMutation = useUpdateSalesDelivery();
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);

  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: freightPaymentTypeCodes } = useCodeMastersByGroup('FREIGHT_PAYMENT_TYPE');
  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  const { data: unloadingCompanies = [] } = useUnloadingCompanies();

  const requestVehicleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (requestVehicleCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [requestVehicleCodes]);

  const warehouseMap = React.useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach((wh) => {
      if (wh.id) map.set(wh.id, wh.name || '');
    });
    return map;
  }, [warehouses]);

  const dispatchCompanyMap = React.useMemo(() => {
    const map = new Map<number, string>();
    dispatchCompanies.forEach((dc) => {
      if (dc.id) map.set(dc.id, dc.name || '');
    });
    return map;
  }, [dispatchCompanies]);

  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (statusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [statusCodes]);

  React.useEffect(() => {
    if (open && deliveryId) {
      refetch();
    }
  }, [open, deliveryId, refetch]);

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

  const getRequestVehicleName = (code?: string | null) => {
    if (!code) return '-';
    return requestVehicleMap.get(code) || code;
  };

  const getWarehouseName = (id?: number | string | null) => {
    if (!id) return '-';
    // id가 문자열이면 그대로 반환 (이미 이름인 경우)
    if (typeof id === 'string') {
      return id.trim() || '-';
    }
    // 숫자면 코드 마스터에서 조회
    return warehouseMap.get(id) || '-';
  };

  const getDispatchCompanyName = (id?: number | null) => {
    if (!id) return '-';
    return dispatchCompanyMap.get(id) || data?.dispatchCompany?.name || '-';
  };

  const freightPaymentTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (freightPaymentTypeCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [freightPaymentTypeCodes]);

  const getFreightPaymentTypeName = (code?: string | null) => {
    if (!code) return '-';
    return freightPaymentTypeMap.get(code) || code;
  };

  const getStatusLabel = (status?: string | null) => {
    const statusValue = status || 'PENDING_DISPATCH';
    return statusMap.get(statusValue) || statusValue;
  };

  const getStatusStyle = (status?: string | null): { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string } => {
    const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
      PENDING_DISPATCH: {
        variant: 'outline',
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      },
      DISPATCH_REQUESTED: {
        variant: 'outline',
        className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
      },
      DISPATCH_COMPLETED: {
        variant: 'outline',
        className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300',
      },
      LOADING: {
        variant: 'outline',
        className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
      },
      LOADING_COMPLETED: {
        variant: 'outline',
        className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
      },
      UNLOADING_COMPLETED: {
        variant: 'outline',
        className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
      },
      FAILED: {
        variant: 'outline',
        className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
      },
      RESCHEDULED: {
        variant: 'outline',
        className: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
      },
    };
    const statusValue = status || 'PENDING_DISPATCH';
    if (!statusStyles[statusValue]) {
      return {
        variant: 'outline',
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      };
    }
    return statusStyles[statusValue];
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!data || !deliveryId) return;

    try {
      await updateMutation.mutateAsync({
        id: deliveryId,
        data: { status: newStatus },
      });
      toast({
        title: '상태 변경 완료',
        description: '배송 상태가 변경되었습니다.',
      });
      void refetch();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: '상태 변경 실패',
        description: error.message || '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const getInfoText = React.useCallback(() => {
    if (!data) return '';

    // 기존 배차관리 페이지 형식 참조
    const parts: string[] = [];

    // 상차지 주소와 계근대 주소 처리
    // 입고확정 시 설정한 상차지(백엔드 loadingWarehouse)로 수집
    const warehouseSet = new Set<number>();
    const warehouseMap = new Map<number, typeof warehouses[0]>();
    
    if (data.loadingItems && data.loadingItems.length > 0) {
      data.loadingItems.forEach((item) => {
        const whId = item.loadingWarehouse?.id ?? item.loadingWarehouseId;
        if (whId && !warehouseSet.has(whId)) {
          const found = warehouses.find(w => w.id === whId);
          if (found) {
            warehouseSet.add(whId);
            warehouseMap.set(whId, found);
          }
        }
      });
    }
    
    const uniqueWarehouses = Array.from(warehouseMap.values());
    
    if (uniqueWarehouses.length > 0) {
      // 상차지가 하나일 때와 여러 개일 때 구분
      if (uniqueWarehouses.length === 1) {
        // 단건: 첫 번째 창고의 상차지 주소와 계근대 주소 사용
        const warehouse = uniqueWarehouses[0];
        
        // 상차지 주소
        const addressParts = [
          warehouse.address,
          warehouse.addressDetail,
        ].filter((part) => !!part && part.length > 0);
        
        const addressText = addressParts.length > 0
          ? `${warehouse.postalCode ? `[${warehouse.postalCode}] ` : ''}${addressParts.join(' ')}`
          : warehouse.postalCode
            ? `[${warehouse.postalCode}]`
            : '';
        
        parts.push(`상차지 주소 : ${addressText.trim() || ''}`);

        // 계근대 주소
        if (warehouse.useInternalGyegeundae) {
          parts.push(`계근대 주소 : 내부 계근대`);
        } else {
          const gyegeundaeAddressParts = [
            warehouse.gyegeundaeAddress,
            warehouse.gyegeundaeAddressDetail,
          ].filter((part) => !!part && part.length > 0);
          
          const gyegeundaeAddressText = gyegeundaeAddressParts.length > 0
            ? `${warehouse.gyegeundaePostalCode ? `[${warehouse.gyegeundaePostalCode}] ` : ''}${gyegeundaeAddressParts.join(' ')}`
            : warehouse.gyegeundaePostalCode
              ? `[${warehouse.gyegeundaePostalCode}]`
              : '';
          
          parts.push(`계근대 주소 : ${gyegeundaeAddressText.trim() || ''}`);
        }
      } else {
        // 다중건: 각 상차지마다 [상차지1], [상차지2] 구분자 추가
        uniqueWarehouses.forEach((warehouse, index) => {
          parts.push(`[상차지${index + 1}]`);
          
          // 상차지 주소
          const addressParts = [
            warehouse.address,
            warehouse.addressDetail,
          ].filter((part) => !!part && part.length > 0);
          
          const addressText = addressParts.length > 0
            ? `${warehouse.postalCode ? `[${warehouse.postalCode}] ` : ''}${addressParts.join(' ')}`
            : warehouse.postalCode
              ? `[${warehouse.postalCode}]`
              : '';
          
          parts.push(`상차지 주소 : ${addressText.trim() || ''}`);

          // 계근대 주소
          if (warehouse.useInternalGyegeundae) {
            parts.push(`계근대 주소 : 내부 계근대`);
          } else {
            const gyegeundaeAddressParts = [
              warehouse.gyegeundaeAddress,
              warehouse.gyegeundaeAddressDetail,
            ].filter((part) => !!part && part.length > 0);
            
            const gyegeundaeAddressText = gyegeundaeAddressParts.length > 0
              ? `${warehouse.gyegeundaePostalCode ? `[${warehouse.gyegeundaePostalCode}] ` : ''}${gyegeundaeAddressParts.join(' ')}`
              : warehouse.gyegeundaePostalCode
                ? `[${warehouse.gyegeundaePostalCode}]`
                : '';
            
            parts.push(`계근대 주소 : ${gyegeundaeAddressText.trim() || ''}`);
          }
        });
      }
    } else {
      // 창고 정보가 없으면 빈 값
      parts.push(`상차지 주소 : `);
      parts.push(`계근대 주소 : `);
    }

    // 상차 일정
    // 배차업체가 입력한 상차일시가 있으면 그것을 사용, 없으면 내부 사용자가 입력한 상차일정 사용
    const loadingSchedule = data.loadingDateTime 
      ? data.loadingDateTime
      : (() => {
          const firstLoadingItem = data.loadingItems?.[0];
          const loadingSchedule = firstLoadingItem?.loadingSchedule;
          const loadingScheduleTime = firstLoadingItem?.loadingScheduleTime;
          if (loadingSchedule) {
            return [
              formatDate(loadingSchedule),
              loadingScheduleTime || '',
            ]
              .filter(Boolean)
              .join(' ');
          }
          return '';
        })();
    parts.push(`상차 일정 : ${loadingSchedule.trim() || ''}`);

    // 하차 일정
    // 배차업체가 입력한 하차일시가 있으면 그것을 사용, 없으면 내부 사용자가 입력한 하차일정 사용
    const unloadingSchedule = data.unloadingDateTime
      ? data.unloadingDateTime
      : [
          data.unloadingScheduleDate ? formatDate(data.unloadingScheduleDate) : '',
          data.unloadingScheduleTime || '',
        ]
          .filter(Boolean)
          .join(' ');
    parts.push(`하차 일정 : ${unloadingSchedule.trim() || ''}`);

    const unloadingMain = salesUnloadingMainLine(data.sales);
    const unloadingDetail =
      data.sales?.unloadingAddressDetail?.trim() || data.unloadingAddressDetail?.trim() || '';
    const unloadingAddressLine = [unloadingMain, unloadingDetail].filter(Boolean).join(' ');
    if (unloadingAddressLine) {
      parts.push(`하차지 주소 : ${unloadingAddressLine}`);
    }

    // 업체명
    parts.push(`업체명 : ${data.sales?.customer?.companyName || ''}`);

    // 성함
    parts.push(`성함 : ${data.sales?.customer?.ceo || ''}`);

    // 연락처
    parts.push(`연락처 : ${formatPhone(data.sales?.customer?.phone) || ''}`);

    // 담당자 연락처 (등록자 연락처)
    parts.push(`담당자 연락처 : ${formatPhone(data.createdByUser?.phone) || ''}`);

    return parts.join('\n');
  }, [data, warehouses]);

  const handleCopyInfo = React.useCallback(() => {
    const textToCopy = getInfoText();

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        toast({
          title: '복사 완료',
          description: '정보가 클립보드에 복사되었습니다.',
        });
      }).catch(() => {
        toast({
          title: '복사 실패',
          description: '클립보드 복사에 실패했습니다.',
          variant: 'destructive',
        });
      });
    } else {
      toast({
        title: '복사할 정보 없음',
        description: '복사할 정보가 없습니다.',
        variant: 'destructive',
      });
    }
  }, [getInfoText, toast]);

  if (isLoading) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent
          className="h-full"
          style={{
            width: isMobile ? '100%' : '900px',
            maxWidth: '90vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!data) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent
          className="h-full"
          style={{
            width: isMobile ? '100%' : '900px',
            maxWidth: '90vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">배송 정보를 찾을 수 없습니다.</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full flex flex-col"
        style={{
          width: isMobile ? '100%' : '900px',
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <DrawerTitle>{title}</DrawerTitle>
                {(() => {
                  const statusStyle = getStatusStyle(data.status);
                  return (
                    <Badge variant={statusStyle.variant} className={statusStyle.className}>
                      {getStatusLabel(data.status)}
                    </Badge>
                  );
                })()}
                {data.status === 'LOADING_COMPLETED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange('UNLOADING_COMPLETED')}
                    disabled={updateMutation.isPending}
                  >
                    하차완료로 변경
                  </Button>
                )}
              </div>
              <DrawerDescription>{description}</DrawerDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!data}
                onClick={handleCopyInfo}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                정보 복사
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
            {/* 배차 내역 */}
            {(data.vehicleNumber || data.driverContact || data.driverName || data.entryTime || data.loadingDateTime || data.unloadingDateTime || data.transportFee != null || data.weighingFee != null) && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">배차 내역</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    {data.vehicleNumber && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">차량번호</span>
                        <span className="text-sm font-medium">{data.vehicleNumber}</span>
                      </div>
                    )}
                    {data.driverContact && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">운송차 연락처</span>
                        <span className="text-sm font-medium">{formatPhone(data.driverContact)}</span>
                      </div>
                    )}
                    {data.driverName && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">기사명</span>
                        <span className="text-sm font-medium">{data.driverName}</span>
                      </div>
                    )}
                    {data.entryTime && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">입차예정시간</span>
                        <span className="text-sm font-medium">{data.entryTime}</span>
                      </div>
                    )}
                    {data.loadingDateTime && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">상차일시</span>
                        <span className="text-sm font-medium">{data.loadingDateTime}</span>
                      </div>
                    )}
                    {data.unloadingDateTime && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">하차일시</span>
                        <span className="text-sm font-medium">{data.unloadingDateTime}</span>
                      </div>
                    )}
                    {data.transportFee != null && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">운송비</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{formatNumber(data.transportFee)}원</span>
                          {data.transportFeePaymentStatus === 'PAID' && (
                            <span className="text-xs text-green-600 dark:text-green-400">(지급완료)</span>
                          )}
                        </div>
                      </div>
                    )}
                    {data.weighingFee != null && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">계근비</span>
                        <span className="text-sm font-medium">{formatNumber(data.weighingFee)}원</span>
                      </div>
                    )}
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 하차지 정보 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">하차지 정보</h3>
              <div className="grid gap-4 md:grid-cols-4">
                {data.sales?.customer && (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">업체명</span>
                      <span className="text-sm font-medium">{data.sales.customer.companyName || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">대표자</span>
                      <span className="text-sm font-medium">{data.sales.customer.ceo || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">연락처</span>
                      <span className="text-sm font-medium">{formatPhone(data.sales.customer.phone)}</span>
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">하차 일정</span>
                  <span className="text-sm font-medium">
                    {data.unloadingScheduleDate ? formatDate(data.unloadingScheduleDate) : '-'}
                    {data.unloadingScheduleTime && ` ${data.unloadingScheduleTime}`}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">우편번호</span>
                  <span className="text-sm font-medium">
                    {data.sales?.unloadingPostalCode?.trim() || data.unloadingPostalCode?.trim() || '-'}
                  </span>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">도로명 주소</span>
                  <span className="text-sm font-medium">
                    {data.sales?.unloadingAddressRoad?.trim() || '-'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">지번 주소</span>
                  <span className="text-sm font-medium">
                    {data.sales?.unloadingAddressJibun?.trim() || '-'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">상세주소</span>
                <span className="text-sm font-medium">
                  {data.sales?.unloadingAddressDetail?.trim() || data.unloadingAddressDetail?.trim() || '-'}
                </span>
              </div>
            </section>

            <SalesDeliverySalesNotesSection notes={data.sales?.notes} />

            {/* 배차 정보 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">배차 정보</h3>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">운송번호</span>
                  <span className="text-sm font-medium font-mono">{data.orderNumber || '-'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">요청 차량</span>
                  <span className="text-sm font-medium">{getRequestVehicleName(data.requestVehicle)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">요청 중량 (KG)</span>
                  <span className="text-sm font-medium">
                    {(() => {
                      const raw = data.requestWeight;
                      if (raw == null || raw === '') return '-';
                      const num = parseFloat(String(raw).trim().replace(/,/g, ''));
                      if (Number.isNaN(num)) return String(raw).trim();
                      return Math.round(num * 1000).toLocaleString('ko-KR');
                    })()}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">운임</span>
                  <span className="text-sm font-medium">{getFreightPaymentTypeName(data.freightPaymentType)}</span>
                </div>
                {(() => {
                  // 관리자가 입력한 상차 일정 표시 (항상 표시)
                  const firstLoadingItem = data.loadingItems?.[0];
                  const loadingSchedule = firstLoadingItem?.loadingSchedule;
                  const loadingScheduleTime = firstLoadingItem?.loadingScheduleTime;
                  if (loadingSchedule) {
                    return (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">상차 일정</span>
                        <span className="text-sm font-medium">
                          {formatDate(loadingSchedule)}
                          {loadingScheduleTime && ` ${loadingScheduleTime}`}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {(() => {
                  // 관리자가 입력한 하차 일정 표시 (항상 표시)
                  const unloadingScheduleDate = data.unloadingScheduleDate;
                  const unloadingScheduleTime = data.unloadingScheduleTime;
                  if (unloadingScheduleDate) {
                    return (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">하차 일정</span>
                        <span className="text-sm font-medium">
                          {formatDate(unloadingScheduleDate)}
                          {unloadingScheduleTime && ` ${unloadingScheduleTime}`}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </section>

            <Separator />

            {/* 하역 정보 */}
            {(data.unloadingCompanyId || data.unloadingCompany || data.directUnloadingContact) && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">하역 정보</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">하역 업체</span>
                      <span className="text-sm font-medium">
                        {data.directUnloadingContact ? '직접 하차' : (data.unloadingCompany?.representativeName || '-')}
                      </span>
                    </div>
                    {(data.unloadingCompany?.contact || data.directUnloadingContact) && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">하역 업체 연락처</span>
                        <span className="text-sm font-medium">{formatPhone(data.directUnloadingContact || data.unloadingCompany?.contact)}</span>
                      </div>
                    )}
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 상차 정보 */}
            {data.loadingItems && data.loadingItems.length > 0 && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">상차 정보</h3>
                  <div className="space-y-4">
                    {data.loadingItems.map((item, index) => {
                      // 상차지: 입고확정 시 설정한 창고 (백엔드에서 item.loadingWarehouse로 채움)
                      const warehouseName = item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId) || '-';
                      // SalesItem 참조로 정보 조회
                      const salesItem = item.salesItem;
                      const container = salesItem?.container;
                      const order = container?.order;
                      
                      // 요청 정보: 저장된 필드 우선. 요청 컨테이너는 저장값만 사용(같은 SalesItem 다른 상차지에서 잘못 같은 요청으로 보이는 것 방지)
                      const requestBL = item.requestBL || order?.bl || '-';
                      const requestContainerRaw = item.requestContainer?.trim() || '';
                      const requestContainer = requestContainerRaw || '-';
                      const requestContainerType = item.requestContainerType || salesItem?.containerType || 'CONTAINER';
                      const requestContainerTypeLabel = requestContainerType === 'CARGO' ? '카고' : '컨테이너';
                      
                      // 요청 베일/중량: 요청 컨테이너가 없으면 요청 없음이므로 '-'
                      const requestBalesRaw = requestContainerRaw
                        ? (item.requestBales != null ? item.requestBales : (salesItem?.cargoBales || (container != null ? (container.salesBales ?? container.tradeBales) : null) || null))
                        : null;
                      const requestBales = requestBalesRaw != null
                        ? (parseFloat(String(requestBalesRaw)) % 1 === 0 
                            ? parseFloat(String(requestBalesRaw)).toFixed(0) 
                            : String(requestBalesRaw))
                        : '-';
                      const requestWeightRaw = requestContainerRaw
                        ? (item.requestWeight != null ? item.requestWeight : (salesItem?.cargoWeight != null ? String(salesItem.cargoWeight) : container?.weight != null ? String(container.weight) : null))
                        : null;
                      const requestWeightDisplay = requestWeightRaw != null && String(requestWeightRaw).trim() !== ''
                        ? (() => {
                            const num = parseFloat(String(requestWeightRaw).trim().replace(/,/g, ''));
                            return Number.isNaN(num) ? String(requestWeightRaw).trim() : Math.round(num * 1000).toLocaleString('ko-KR');
                          })()
                        : '-';
                      
                      // 타입 (요청 컨테이너 타입 사용)
                      const containerType = requestContainerType;
                      const containerTypeLabel = requestContainerTypeLabel;
                      
                      // 작업 베일/중량 포맷팅 (중량 MT → KG)
                      const workBalesFormatted = item.workBales != null 
                        ? (parseFloat(String(item.workBales)) % 1 === 0 
                            ? parseFloat(String(item.workBales)).toFixed(0) 
                            : String(item.workBales))
                        : '-';
                      const workWeightFormattedKg = item.workWeight != null 
                        ? Math.round(parseFloat(String(item.workWeight)) * 1000).toLocaleString('ko-KR')
                        : '-';
                      
                      return (
                        <div key={item.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                              상차지 {index + 1}: {warehouseName}
                            </span>
                          </div>
                          <div className="space-y-4">
                            {/* 첫 번째 줄: 요청 정보 */}
                            <div className="grid gap-4 md:grid-cols-5">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 BL</span>
                                <span className="text-sm">{requestBL}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 컨테이너</span>
                                <span className="text-sm">
                                  {requestContainer}
                                  {item.requestContainerSequence != null ? ` [${item.requestContainerSequence}]` : ''}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">타입</span>
                                <span className="text-sm">{containerTypeLabel}</span>
                              </div>
                              {/* 타입이 카고일 때만 요청 베일/중량 표시 */}
                              {containerType === 'CARGO' && (
                                <>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">요청 베일</span>
                                    <span className="text-sm">{requestBales}</span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">요청 중량 (KG)</span>
                                    <span className="text-sm">{requestWeightDisplay}</span>
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {/* 두 번째 줄: 작업 정보 */}
                            <div className="grid gap-4 md:grid-cols-5">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 BL</span>
                                <span className="text-sm">{item.workBL || '-'}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 컨테이너</span>
                                <span className="text-sm">
                                  {item.workContainer || '-'}
                                  {item.workContainerSequence != null ? ` [${item.workContainerSequence}]` : ''}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 타입</span>
                                <span className="text-sm">
                                  {item.workContainerType === 'CARGO' ? '카고' : item.workContainerType === 'CONTAINER' ? '컨테이너' : '-'}
                                </span>
                              </div>
                              {/* 작업 타입이 카고일 때만 작업 베일/중량 표시 */}
                              {(item.workContainerType === 'CARGO' || (item.workContainerType == null && containerType === 'CARGO')) && (
                                <>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">작업 베일</span>
                                    <span className="text-sm">{workBalesFormatted}</span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">작업 중량 (KG)</span>
                                    <span className="text-sm">{workWeightFormattedKg}</span>
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {/* 요청 비고 / 작업 비고 */}
                            {item.requestNotes?.trim() && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 비고</span>
                                <span className="text-sm whitespace-pre-wrap">{item.requestNotes.trim()}</span>
                              </div>
                            )}
                            {data.workLines?.[index]?.notes?.trim() && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 비고</span>
                                <span className="text-sm whitespace-pre-wrap">{data.workLines[index].notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 운송 비고 */}
            {data.notes && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">운송 비고</h3>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium whitespace-pre-wrap">{data.notes}</span>
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 등록자 정보 */}
            {data.createdByUser && (
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">등록자 정보</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">등록자</span>
                    <span className="text-sm font-medium">{data.createdByUser.name || '-'}</span>
                  </div>
                  {data.createdByUser.phone && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">등록자 연락처</span>
                      <span className="text-sm font-medium">{formatPhone(data.createdByUser.phone)}</span>
                    </div>
                  )}
                </div>
              </section>
            )}
            </div>
          </ScrollArea>
        </div>

        <div className="border-t border-border p-4 flex-shrink-0">
          <div className="flex justify-end gap-2">
            {data?.status === 'PENDING_DISPATCH' && (
              <Button
                variant="default"
                disabled={!data || updateMutation.isPending}
                onClick={() => setEditDrawerOpen(true)}
              >
                <Edit className="mr-1.5 h-4 w-4" />
                배차 요청
              </Button>
            )}
            {(data?.status === 'DISPATCH_REQUESTED' || data?.status === 'DISPATCHING' || data?.status === 'DISPATCH_COMPLETED' || data?.status === 'FAILED' || data?.status === 'RESCHEDULED') && (
              <Button
                variant="default"
                disabled={!data || updateMutation.isPending}
                onClick={() => setEditDrawerOpen(true)}
              >
                <Edit className="mr-1.5 h-4 w-4" />
                수정
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>

    {/* 수정 폼 */}
    <DispatchCompanyDeliveryEditDrawer
      open={editDrawerOpen}
      onOpenChange={setEditDrawerOpen}
      delivery={data ?? null}
      onSuccess={() => {
        void refetch();
        onSuccess?.();
      }}
    />
  </>
  );
};

