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
import { useVehicleDispatch, VehicleDispatch } from '@/lib/hooks/use-vehicle-dispatch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Edit, X, Trash2, Copy, Truck, Warehouse } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { useUnloadingCompanies } from '@/lib/hooks/use-unloading-companies';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { VehicleDispatchUserFormDrawer } from './vehicle-dispatch-user-form-drawer';

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

export interface VehicleDispatchDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleDispatchId?: number | null;
  onEdit?: (dispatch: VehicleDispatch) => void;
  onDelete?: (dispatch: VehicleDispatch) => void;
  visibleWarehouseId?: number;
  showWorkFields?: boolean;
  showCompanyEditButtons?: boolean; // 배차 업체 수정, 상차업체 수정 버튼 표시 여부
  [key: string]: any;
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

export const VehicleDispatchDetailDrawer: React.FC<VehicleDispatchDetailDrawerProps> = (
  props: VehicleDispatchDetailDrawerProps,
) => {
  const {
    open,
    onOpenChange,
    vehicleDispatchId,
    onEdit,
    onDelete,
    visibleWarehouseId,
    showWorkFields = true,
    showCompanyEditButtons = false, // 기본값: true (기존 동작 유지)
  } = props;
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useVehicleDispatch(vehicleDispatchId ?? undefined);
  
  // 배차 관리자 수정 drawer 상태
  const [dispatchCompanyEditOpen, setDispatchCompanyEditOpen] = React.useState(false);
  const [warehouseEditOpen, setWarehouseEditOpen] = React.useState(false);
  
  // 디버깅: loadingItems 데이터 확인
  React.useEffect(() => {
    if (data?.loadingItems) {
      console.log('[상차 상세정보] loadingItems 데이터:', JSON.stringify(data.loadingItems, null, 2));
    }
  }, [data?.loadingItems]);
  
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: freightPaymentTypeCodes } = useCodeMastersByGroup('FREIGHT_PAYMENT_TYPE');
  const { data: statusCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_STATUS');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  const { data: unloadingCompanies = [] } = useUnloadingCompanies();

  // 코드 맵 생성
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

  const unloadingCompanyMap = React.useMemo(() => {
    const map = new Map<number, string>();
    unloadingCompanies.forEach((uc) => {
      if (uc.id) map.set(uc.id, uc.representativeName || '');
    });
    return map;
  }, [unloadingCompanies]);

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && vehicleDispatchId) {
      refetch();
    }
  }, [open, vehicleDispatchId, refetch]);

  const getRequestVehicleName = (code?: string | null) => {
    if (!code) return '-';
    return requestVehicleMap.get(code) || code;
  };

  const getWarehouseName = (id?: number | null) => {
    if (!id) return '-';
    return warehouseMap.get(id) || '-';
  };

  const getDispatchCompanyName = (id?: number | null) => {
    if (!id) return '-';
    return dispatchCompanyMap.get(id) || data?.dispatchCompany?.name || '-';
  };

  const getUnloadingCompanyName = (id?: number | null) => {
    if (!id) return '-';
    return unloadingCompanyMap.get(id) || data?.unloadingCompany?.representativeName || '-';
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

  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (statusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [statusCodes]);

  const getStatusLabel = (status?: string | null) => {
    const statusValue = status || 'DRAFT';
    return statusMap.get(statusValue) || statusValue;
  };

  const getStatusVariant = (status?: string | null): 'default' | 'secondary' | 'outline' | 'destructive' => {
    const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      DRAFT: 'secondary',
      DISPATCH_COMPLETED: 'default',
      ASSIGNED: 'default',
      LOADING_COMPLETED: 'default',
      FAILED: 'destructive',
      RESCHEDULED: 'outline',
    };
    return statusVariants[status || 'DRAFT'] || 'secondary';
  };

  const getStatusClassName = (status?: string | null): string => {
    const statusStyles: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
      DISPATCH_COMPLETED: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
      ASSIGNED: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
      LOADING_COMPLETED: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
      FAILED: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
      RESCHEDULED: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    };
    return statusStyles[status || 'DRAFT'] || '';
  };

  const getInfoText = React.useCallback(() => {
    if (!data) return '';

    // 창고 업체 화면용 형식
    if (showWorkFields) {
      const parts: string[] = [];

      // 상차지 (창고명)
      const warehouseName = visibleWarehouseId 
        ? (data.loadingItems?.find(item => item.loadingWarehouseId === visibleWarehouseId)?.loadingWarehouse?.name || 
           getWarehouseName(visibleWarehouseId))
        : (data.loadingWarehouse?.name || getWarehouseName(data.loadingWarehouseId));
      parts.push(`상차지 : ${warehouseName || ''}`);

      // 날짜 (상차일정, 한국 날짜 형식)
      const loadingDate = data.loadingDateTime 
        ? data.loadingDateTime.split(' ')[0] // 날짜 부분만 추출
        : data.loadingSchedule;
      
      if (loadingDate) {
        const date = new Date(loadingDate);
        if (!Number.isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          parts.push(`날짜 : ${year}. ${month}. ${day}.`);
        }
      }

      // 차량번호
      if (data.vehicleNumber) {
        parts.push(`차량번호 : ${data.vehicleNumber}`);
      }

      // 작업 BL, 작업 컨테이너, 작업 중량 (visibleWarehouseId가 있으면 해당 창고의 항목 중 작업 정보가 있는 항목만)
      const itemsToShow = visibleWarehouseId 
        ? (data.loadingItems?.filter(item => 
            item.loadingWarehouseId === visibleWarehouseId && 
            (item.workBL || item.workContainer || item.workWeight)
          ) || [])
        : (data.loadingItems?.filter(item => item.workBL || item.workContainer || item.workWeight) || []);

      if (itemsToShow.length > 0) {
        // 단건일 때와 다중건일 때 구분
        if (itemsToShow.length === 1) {
          // 단건: 각 항목별로 줄바꿈하여 나열
          const item = itemsToShow[0];
          if (item.workBL || item.workContainer || item.workWeight) {
            parts.push(`작업 BL : ${item.workBL || '-'}`);
            parts.push(`작업 컨테이너 : ${item.workContainer || '-'}`);
            parts.push(`작업 중량 : ${item.workWeight || '-'}`);
          }
        } else {
          // 다중건: 각 항목마다 [항목1], [항목2] 구분자 추가
          itemsToShow.forEach((item, index) => {
            // 작업 정보가 있는 항목만 추가
            if (item.workBL || item.workContainer || item.workWeight) {
              parts.push(`[항목${index + 1}]`);
              parts.push(`작업 BL : ${item.workBL || '-'}`);
              parts.push(`작업 컨테이너 : ${item.workContainer || '-'}`);
              parts.push(`작업 중량 : ${item.workWeight || '-'}`);
            }
          });
        }
      }

      return parts.join('\n');
    }

    // 배차 업체 화면용 형식 (기존)
    const parts: string[] = [];

    // 상차지 주소
    // loadingItems에서 loadingWarehouse를 찾거나, 직접 loadingWarehouse 사용
    const warehouse = (data.loadingItems?.find(item => item.loadingWarehouse)?.loadingWarehouse 
      || data.loadingWarehouse) as typeof data.loadingWarehouse;
    
    if (warehouse) {
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
    } else {
      parts.push(`상차지 주소 : `);
    }

    // 계근대 주소
    if (warehouse) {
      // 내부 계근대를 사용하는 경우
      if (warehouse.useInternalGyegeundae) {
        parts.push(`계근대 주소 : 내부 계근대`);
      } else {
        // 별도 계근대 주소가 있는 경우
        const addressParts = [
          warehouse.gyegeundaeAddress,
          warehouse.gyegeundaeAddressDetail,
        ].filter((part) => !!part && part.length > 0);
        
        const addressText = addressParts.length > 0
          ? `${warehouse.gyegeundaePostalCode ? `[${warehouse.gyegeundaePostalCode}] ` : ''}${addressParts.join(' ')}`
          : warehouse.gyegeundaePostalCode
            ? `[${warehouse.gyegeundaePostalCode}]`
            : '';
        
        parts.push(`계근대 주소 : ${addressText.trim() || ''}`);
      }
    } else {
      parts.push(`계근대 주소 : `);
    }

    // 상차 일정
    // 배차업체/창고업체가 입력한 상차일시가 있으면 그것을 사용, 없으면 내부 사용자가 입력한 상차일정 사용
    const loadingSchedule = data.loadingDateTime 
      ? data.loadingDateTime
      : [
          formatDate(data.loadingSchedule),
          data.loadingScheduleTime,
        ]
          .filter(Boolean)
          .join(' ');
    parts.push(`상차 일정 : ${loadingSchedule.trim() || ''}`);

    // 하차 일정
    // 배차업체/창고업체가 입력한 하차일시가 있으면 그것을 사용, 없으면 내부 사용자가 입력한 하차일정 사용
    const unloadingSchedule = data.unloadingDateTime
      ? data.unloadingDateTime
      : [
          formatDate(data.unloadingScheduleDate),
          data.unloadingScheduleTime,
        ]
          .filter(Boolean)
          .join(' ');
    parts.push(`하차 일정 : ${unloadingSchedule.trim() || ''}`);

    // 업체명
    parts.push(`업체명 : ${data.companyName || ''}`);

    // 성함
    parts.push(`성함 : ${data.representativeName || ''}`);

    // 연락처
    parts.push(`연락처 : ${formatPhone(data.phone) || ''}`);

    // 담당자 연락처 (등록자 연락처)
    const registeredByPhone = data.createdByUser?.phone;
    parts.push(`담당자 연락처 : ${registeredByPhone ? formatPhone(registeredByPhone) : ''}`);

    return parts.join('\n');
  }, [data, showWorkFields, visibleWarehouseId, getWarehouseName]);

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

  const handleSendToKakaoTalk = React.useCallback(() => {
    const textToSend = getInfoText();

    if (!textToSend) {
      toast({
        title: '전송 실패',
        description: '전송할 정보가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    // 모바일 기기 감지
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 클립보드에 복사
    navigator.clipboard.writeText(textToSend).then(() => {
      if (isMobile) {
        // 모바일: 클립보드 복사 후 카카오톡 앱 열기 시도
        const kakaoTalkUrl = 'kakaotalk://';
        try {
          window.location.href = kakaoTalkUrl;
          toast({
            title: '복사 완료',
            description: '정보가 클립보드에 복사되었습니다. 카카오톡이 열리면 붙여넣기 하세요.',
          });
        } catch (error) {
          toast({
            title: '복사 완료',
            description: '정보가 클립보드에 복사되었습니다. 카카오톡에 붙여넣기 하세요.',
          });
        }
      } else {
        // PC: 클립보드 복사만 수행
        toast({
          title: '복사 완료',
          description: '정보가 클립보드에 복사되었습니다. 카카오톡에 붙여넣기 하세요.',
        });
      }
    }).catch(() => {
      toast({
        title: '복사 실패',
        description: '클립보드 복사에 실패했습니다.',
        variant: 'destructive',
      });
    });
  }, [getInfoText, toast]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent 
        className="h-full select-text" 
        style={{ width: isMobile ? '100vw' : '900px', maxWidth: isMobile ? '100vw' : '95vw' }}
      >
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3">
                <DrawerTitle>{showWorkFields ? '상차 상세정보' : '배차 상세정보'}</DrawerTitle>
                {data && (
                  <Badge variant={getStatusVariant(data.status)} className={getStatusClassName(data.status)}>
                    {getStatusLabel(data.status)}
                  </Badge>
                )}
              </div>
              <DrawerDescription>
                {showWorkFields ? '상차 정보를 확인할 수 있습니다.' : '배차 정보를 확인할 수 있습니다.'}
              </DrawerDescription>
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
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenChange(false);
                  }}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>

        <div 
          className="flex-1 overflow-y-auto p-4 select-text"
          style={{ userSelect: 'text' }}
          onPointerDown={(e) => {
            // 텍스트 선택을 시작할 때 Drawer의 드래그 제스처 방지
            const target = e.target as HTMLElement;
            // 버튼이나 인터랙티브 요소는 제외
            if (target.closest('button, [role="button"], a, input, select, textarea')) {
              return;
            }
            // 텍스트 요소에서 포인터 다운 시 이벤트 전파 중지
            if (target.tagName === 'P' || target.tagName === 'SPAN' || target.tagName === 'DIV' || 
                target.closest('p, span, div, label, h3, h4')) {
              e.stopPropagation();
            }
          }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data ? (
            <div className="space-y-6">

              {/* 상차 관리자 입력 정보 (창고업체가 입력한 정보 - 가장 위에 표시) */}
              {showWorkFields && data.loadingItems && data.loadingItems.length > 0 && (() => {
                // visibleWarehouseId가 있으면 해당 창고의 항목만, 없으면 모든 항목 표시
                const itemsToShow = visibleWarehouseId 
                  ? data.loadingItems.filter(item => 
                      item.loadingWarehouseId === visibleWarehouseId
                    )
                  : data.loadingItems;
                
                if (itemsToShow.length === 0) return null;
                
                return (
                  <>
                    <div className="space-y-4">
                      {itemsToShow.map((item, index) => {
                        const warehouseName = item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId);
                        
                        return (
                          <div key={item.id || index} className="space-y-3">
                            {itemsToShow.length > 1 && (
                              <h4 className="text-sm font-medium text-muted-foreground">{warehouseName}</h4>
                            )}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground">작업 BL</Label>
                                <p className="mt-1 text-sm">{item.workBL != null ? item.workBL : '-'}</p>
                              </div>
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground">작업 컨테이너</Label>
                                <p className="mt-1 text-sm">{item.workContainer != null ? item.workContainer : '-'}</p>
                              </div>
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground">작업 중량</Label>
                                <p className="mt-1 text-sm">{item.workWeight != null ? item.workWeight : '-'}</p>
                              </div>
                            </div>
                            {index < itemsToShow.length - 1 && <Separator className="my-4" />}
                          </div>
                        );
                      })}
                    </div>
                    <Separator />
                  </>
                );
              })()}

              {/* 배차 업체 직원 입력 정보 (제목 없음) */}
              {/* showWorkFields가 false여도 배차 업체가 입력한 정보는 표시 */}
              {(data.vehicleNumber
                || data.driverContact
                || data.driverName
                || data.entryTime
                || data.transportFee !== null && data.transportFee !== undefined
                || data.weighingFee !== null && data.weighingFee !== undefined
                || data.loadingDateTime
                || data.unloadingDateTime) && (
                <>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {data.vehicleNumber && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">차량번호</Label>
                          <p className="mt-1 text-sm">{data.vehicleNumber}</p>
                        </div>
                      )}
                      {data.driverContact && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">운송차 연락처</Label>
                          <p className="mt-1 text-sm">{formatPhone(data.driverContact)}</p>
                        </div>
                      )}
                      {data.driverName && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">기사명</Label>
                          <p className="mt-1 text-sm">{data.driverName}</p>
                        </div>
                      )}
                      {data.entryTime && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">입차예정시간</Label>
                          <p className="mt-1 text-sm">{data.entryTime}</p>
                        </div>
                      )}
                      {data.transportFee !== null && data.transportFee !== undefined && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">운송비</Label>
                          <p className="mt-1 text-sm">
                            {typeof data.transportFee === 'number' 
                              ? `${(data.transportFee / 10000).toLocaleString('ko-KR')}만원`
                              : `${(Number(data.transportFee) / 10000).toLocaleString('ko-KR')}만원`}
                          </p>
                        </div>
                      )}
                      {data.weighingFee !== null && data.weighingFee !== undefined && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">계근비</Label>
                          <p className="mt-1 text-sm">
                            {typeof data.weighingFee === 'number' 
                              ? `${(data.weighingFee / 10000).toLocaleString('ko-KR')}만원`
                              : `${(Number(data.weighingFee) / 10000).toLocaleString('ko-KR')}만원`}
                          </p>
                        </div>
                      )}
                      {data.loadingDateTime && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">상차일시</Label>
                          <p className="mt-1 text-sm">{data.loadingDateTime}</p>
                        </div>
                      )}
                      {data.unloadingDateTime && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">하차일시</Label>
                          <p className="mt-1 text-sm">{data.unloadingDateTime}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* 상태 사유 (배차 실패 또는 일정 조정일 때만) */}
                    {data.statusReason && (data.status === 'FAILED' || data.status === 'RESCHEDULED') && (
                      <div className="space-y-2 col-span-2 md:col-span-3">
                        <Label className="text-sm font-medium text-muted-foreground">사유</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{data.statusReason}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <Separator />
                </>
              )}

              {/* 하차 정보 (고객 정보 포함) */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">하차 정보</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">업체명</Label>
                    <p className="mt-1 text-sm">{data.companyName || '-'}</p>
                  </div>
                  {!showWorkFields && (
                    <>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">대표자명</Label>
                        <p className="mt-1 text-sm">{data.representativeName || '-'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">연락처</Label>
                        <p className="mt-1 text-sm">{formatPhone(data.phone)}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">하차 일정</Label>
                        <p className="mt-1 text-sm">{formatDate(data.unloadingScheduleDate)}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">하차 시간</Label>
                        <p className="mt-1 text-sm">{data.unloadingScheduleTime || '-'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">우편번호</Label>
                        <p className="mt-1 text-sm">{data.unloadingPostalCode || '-'}</p>
                      </div>
                      <div className="col-span-2 md:col-span-3">
                        <Label className="text-sm font-medium text-muted-foreground">주소</Label>
                        <p className="mt-1 text-sm">{data.unloadingAddress || '-'}</p>
                      </div>
                      <div className="col-span-2 md:col-span-3">
                        <Label className="text-sm font-medium text-muted-foreground">상세주소</Label>
                        <p className="mt-1 text-sm">{data.unloadingAddressDetail || '-'}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* 배차 정보 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">배차 정보</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">배차 업체</Label>
                    <p className="mt-1 text-sm">{getDispatchCompanyName(data.dispatchCompanyId)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">요청 차량</Label>
                    <p className="mt-1 text-sm">{getRequestVehicleName(data.requestVehicle)}</p>
                  </div>
                  {data.orderNumber && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">운송번호</Label>
                      <p className="mt-1 text-sm font-mono">{data.orderNumber}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">요청 중량</Label>
                    <p className="mt-1 text-sm">
                      {data.requestWeight || '-'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">운임</Label>
                    <p className="mt-1 text-sm">{getFreightPaymentTypeName(data.freightPaymentType)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">상차 일정</Label>
                    <p className="mt-1 text-sm">{formatDate(data.loadingSchedule)}</p>
                  </div>
                  {data.loadingScheduleTime && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">상차 시간</Label>
                      <p className="mt-1 text-sm">{data.loadingScheduleTime}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 하역정보 */}
              {(data.unloadingCompanyId || data.directUnloadingContact) && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">하역정보</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {data.unloadingCompanyId && (
                        <>
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground">하역 업체</Label>
                            <p className="mt-1 text-sm">{getUnloadingCompanyName(data.unloadingCompanyId)}</p>
                          </div>
                          {data.unloadingCompany?.contact && (
                            <div>
                              <Label className="text-sm font-medium text-muted-foreground">하역 업체 연락처</Label>
                              <p className="mt-1 text-sm">{formatPhone(data.unloadingCompany.contact)}</p>
                            </div>
                          )}
                        </>
                      )}
                      {data.directUnloadingContact && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">직접 하차 연락처</Label>
                          <p className="mt-1 text-sm">{formatPhone(data.directUnloadingContact)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* 상차지, 요청 BL, 요청 컨테이너 (비고 위) */}
              {((data.loadingItems && data.loadingItems.length > 0) || data.loadingWarehouseId || data.requestBL || data.requestContainer) && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">상차지 및 요청 정보</h3>
                    {data.loadingItems && data.loadingItems.length > 0 ? (
                      (() => {
                        const filteredItems = visibleWarehouseId
                          ? data.loadingItems.filter((item) => item.loadingWarehouseId === visibleWarehouseId)
                          : data.loadingItems;
                        if (filteredItems.length === 0) {
                          return <p className="text-sm text-muted-foreground">해당 창고에 해당하는 상차지 정보가 없습니다.</p>;
                        }
                        return (
                          <div className="space-y-4">
                            {filteredItems.map((item, index) => (
                              <div key={item.id || index} className="p-4 border rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-muted-foreground">항목 {index + 1}</span>
                                  {item.status && (
                                    <Badge variant={
                                      item.status === 'LOADED' ? 'default' :
                                      item.status === 'FAILED' ? 'destructive' :
                                      item.status === 'LOADING' ? 'secondary' :
                                      'outline'
                                    }>
                                      {item.status === 'PENDING' ? '대기' :
                                       item.status === 'LOADING' ? '상차 중' :
                                       item.status === 'LOADED' ? '상차 완료' :
                                       item.status === 'FAILED' ? '실패' :
                                       item.status === 'CANCELLED' ? '취소' : item.status}
                                    </Badge>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                  {item.loadingWarehouseId && (
                                    <div>
                                      <Label className="text-sm font-medium text-muted-foreground">상차지</Label>
                                      <p className="mt-1 text-sm">
                                        {item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId)}
                                      </p>
                                    </div>
                                  )}
                                  {item.requestBL && (
                                    <div>
                                      <Label className="text-sm font-medium text-muted-foreground">요청 BL</Label>
                                      <p className="mt-1 text-sm">{item.requestBL}</p>
                                    </div>
                                  )}
                                  {item.requestContainer && (
                                    <div>
                                      <Label className="text-sm font-medium text-muted-foreground">요청 컨테이너</Label>
                                      <p className="mt-1 text-sm">{item.requestContainer}</p>
                                    </div>
                                  )}
                                  {item.notes && (
                                    <div className="col-span-2 md:col-span-3">
                                      <Label className="text-sm font-medium text-muted-foreground">비고</Label>
                                      <p className="mt-1 text-sm whitespace-pre-wrap">{item.notes}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    ) : (
                      // 기존 데이터 호환성 (loadingItems가 없는 경우)
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {(!visibleWarehouseId || data.loadingWarehouseId === visibleWarehouseId) && data.loadingWarehouseId && (
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground">상차지</Label>
                            <p className="mt-1 text-sm">{getWarehouseName(data.loadingWarehouseId)}</p>
                          </div>
                        )}
                        {data.requestBL && (
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground">요청 BL</Label>
                            <p className="mt-1 text-sm">{data.requestBL}</p>
                          </div>
                        )}
                        {data.requestContainer && (
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground">요청 컨테이너</Label>
                            <p className="mt-1 text-sm">{data.requestContainer}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {data.notes && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <Label className="text-sm font-semibold">비고</Label>
                    <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
                  </div>
                </>
              )}

              {/* 재배차 요청 정보 (재배차 요청 항목인 경우) */}
              {(data.hasFailed || data.hasRescheduled) && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">재배차 요청 정보</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="col-span-2 md:col-span-3">
                        <Label className="text-sm font-medium text-muted-foreground">재배차 요청 경험</Label>
                        <div className="flex items-center gap-2 mt-1">
                          {data.hasFailed && (
                            <Badge variant="destructive" className="text-xs">
                              배차실패
                            </Badge>
                          )}
                          {data.hasRescheduled && (
                            <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 bg-orange-50">
                              일정조정
                            </Badge>
                          )}
                        </div>
                      </div>
                      {data.reprocessReason && (
                        <div className="col-span-2 md:col-span-3">
                          <Label className="text-sm font-medium text-muted-foreground">재배차 요청 사유</Label>
                          <div className="p-3 bg-muted rounded-md mt-1">
                            <p className="text-sm whitespace-pre-wrap">{data.reprocessReason}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* 등록자 정보 */}
              {(data.createdByUser?.name || data.createdByUser?.phone) && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">등록자 정보</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {data.createdByUser.name && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">등록자</Label>
                          <p className="mt-1 text-sm">{data.createdByUser.name}</p>
                        </div>
                      )}
                      {data.createdByUser.phone && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">등록자 연락처</Label>
                          <p className="mt-1 text-sm">{formatPhone(data.createdByUser.phone)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">데이터를 불러올 수 없습니다.</div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
            {onDelete && (
              <Button
                variant="destructive"
                disabled={!data}
                onClick={() => {
                  if (data && onDelete) {
                    onDelete(data);
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                삭제
              </Button>
            )}
            {/* 배차 업체 수정 버튼 */}
            {showCompanyEditButtons && data && (
              <Button
                variant="outline"
                disabled={!data}
                onClick={() => {
                  if (data) {
                    setDispatchCompanyEditOpen(true);
                  }
                }}
              >
                <Truck className="mr-1.5 h-4 w-4" />
                배차 업체 수정
              </Button>
            )}
            {/* 상차업체 수정 버튼 */}
            {showCompanyEditButtons && data && (
              <Button
                variant="outline"
                disabled={!data}
                onClick={() => {
                  if (data) {
                    setWarehouseEditOpen(true);
                  }
                }}
              >
                <Warehouse className="mr-1.5 h-4 w-4" />
                상차업체 수정
              </Button>
            )}
            {onEdit && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => {
                  if (data && onEdit) {
                    onEdit(data);
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
      
      {/* 배차 업체 수정 Drawer */}
      <VehicleDispatchUserFormDrawer
        open={dispatchCompanyEditOpen}
        onOpenChange={(open) => {
          setDispatchCompanyEditOpen(open);
          if (!open) {
            refetch();
          }
        }}
        vehicleDispatch={data ?? null}
        showWorkFields={false}
        onSubmit={() => {
          setDispatchCompanyEditOpen(false);
          refetch();
        }}
        onCancel={() => {
          setDispatchCompanyEditOpen(false);
        }}
      />
      
      {/* 상차업체 수정 Drawer */}
      <VehicleDispatchUserFormDrawer
        open={warehouseEditOpen}
        onOpenChange={(open) => {
          setWarehouseEditOpen(open);
          if (!open) {
            refetch();
          }
        }}
        vehicleDispatch={data ?? null}
        showWorkFields={true}
        warehouseId={visibleWarehouseId ?? (data?.loadingItems && data.loadingItems.length > 0 
          ? (data.loadingItems.find(item => item.loadingWarehouseId)?.loadingWarehouseId ?? data.loadingItems[0].loadingWarehouseId ?? undefined)
          : undefined)}
        onSubmit={() => {
          setWarehouseEditOpen(false);
          refetch();
        }}
        onCancel={() => {
          setWarehouseEditOpen(false);
        }}
      />
    </Drawer>
  );
}

