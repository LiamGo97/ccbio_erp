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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Save } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { formatNumberWithDecimals, parseNumber } from '@/lib/utils';
import {
  VehicleDispatch,
  UpdateVehicleDispatchDto,
  useUpdateVehicleDispatch,
} from '@/lib/hooks/use-vehicle-dispatch';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useIsMobile } from '@/hooks/use-mobile';
import { auth, User } from '@/lib/auth';
import { Separator } from '@/components/ui/separator';

interface LoadingItemWorkData {
  id: number;
  workBL: string;
  workContainer: string;
  workWeight: string;
}

interface VehicleDispatchUserFormData {
  vehicleNumber: string; // 차량번호
  driverContact: string; // 운송차 연락처
  driverName: string; // 기사명
  entryTime: string; // 입차예정시간
  transportFee: string; // 운송비
  weighingFee: string; // 계근비
  loadingDateTime: string; // 상차일시
  unloadingDateTime: string; // 하차일시
  workBL: string; // 작업 BL (기존 호환성)
  workContainer: string; // 작업 컨테이너 (기존 호환성)
  workWeight: string; // 작업 중량 (기존 호환성)
  loadingItems: LoadingItemWorkData[]; // loadingItems별 작업 정보
  status: string; // 상태
  statusReason: string; // 상태 사유 (배차 실패, 일정 조정일 때만)
}

export interface VehicleDispatchUserFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleDispatch: VehicleDispatch | null;
  onSubmit?: () => void;
  onCancel?: () => void;
  showWorkFields?: boolean;
  warehouseId?: number; // 창고 업체의 창고 ID
  [key: string]: any;
}

export const VehicleDispatchUserFormDrawer: React.FC<VehicleDispatchUserFormDrawerProps> = (
  props: VehicleDispatchUserFormDrawerProps,
) => {
  const {
    open,
    onOpenChange,
    vehicleDispatch,
    onSubmit,
    onCancel,
    showWorkFields = true,
    warehouseId,
  } = props;
  const isMobile = useIsMobile();
  const updateMutation = useUpdateVehicleDispatch();
  const { data: warehouses = [] } = useWarehouses({ status: true });
  // 모든 상태 코드는 VEHICLE_DISPATCH_STATUS 그룹에서 가져옴
  const { data: dispatchStatusCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_STATUS');
  const { data: editableStatusByRoleCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_EDITABLE_STATUS_BY_ROLE');
  const [user, setUser] = React.useState<User | null>(null);
  
  // 창고 맵 생성
  const warehouseMap = React.useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach((wh) => {
      if (wh.id) map.set(wh.id, wh.name || '');
    });
    return map;
  }, [warehouses]);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 모든 상태 코드는 VEHICLE_DISPATCH_STATUS 그룹 사용
  const statusCodes = dispatchStatusCodes;
  
  // 권한별로 변경 가능한 상태 목록 가져오기
  const allowedStatusValues = React.useMemo(() => {
    const isWarehouseContext = showWorkFields === true;
    
    // 창고 업체 컨텍스트: 배차 완료, 상차 중, 상차 완료
    if (isWarehouseContext) {
      return ['DISPATCH_COMPLETED', 'ASSIGNED', 'LOADING_COMPLETED'];
    }
    
    // 배차 업체 컨텍스트: 배차 상태 코드 사용
    const hasDispatchRole = user?.roles?.some((r) => r.code === 'ROLE_DISPATCH_COMPANY_USER');
    // 배차 업체: 배차 요청(DRAFT), 배차 중(DISPATCHING), 배차 완료(DISPATCH_COMPLETED), 배차 실패(FAILED), 일정 조정(RESCHEDULED)
    const dispatchAllowed = ['DRAFT', 'DISPATCHING', 'DISPATCH_COMPLETED', 'FAILED', 'RESCHEDULED'];
    
    if (hasDispatchRole) {
      return dispatchAllowed;
    }
    
    // 기본값
    return ['DRAFT', 'DISPATCHING', 'DISPATCH_COMPLETED', 'FAILED', 'RESCHEDULED'];
  }, [user?.roles, showWorkFields]);

  const availableStatusCodes = React.useMemo(() => {
    if (!statusCodes) return [];
    
    // allowedStatusValues에 포함된 상태만 필터링
    const filtered = statusCodes.filter(
      (code) => code.value && allowedStatusValues.includes(code.value.toUpperCase())
    );
    
    // 중복 제거 (value 기준)
    const uniqueMap = new Map<string, typeof statusCodes[0]>();
    filtered.forEach((code) => {
      if (code.value) {
        const upperValue = code.value.toUpperCase();
        // 이미 존재하지 않거나, 존재하더라도 order가 더 작은 것(우선순위가 높은 것)을 유지
        if (!uniqueMap.has(upperValue) || (uniqueMap.get(upperValue)?.order ?? 999) > (code.order ?? 999)) {
          uniqueMap.set(upperValue, code);
        }
      }
    });
    
    // 명시적 순서로 정렬: 배차 요청 → 배차 중 → 배차 완료 → 배차 실패 → 일정 조정
    const statusOrder = ['DRAFT', 'DISPATCHING', 'DISPATCH_COMPLETED', 'FAILED', 'RESCHEDULED'];
    const result = Array.from(uniqueMap.values()).sort((a, b) => {
      const aIndex = statusOrder.indexOf(a.value?.toUpperCase() || '');
      const bIndex = statusOrder.indexOf(b.value?.toUpperCase() || '');
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    return result;
  }, [statusCodes, allowedStatusValues]);

  // 전화번호 포맷터 (한국형)
  // 만원 단위를 원 단위로 변환 (DB 저장용)
  const convertManwonToWon = React.useCallback((manwon: string | number | undefined | null): number | undefined => {
    if (manwon === undefined || manwon === null || manwon === '') return undefined;
    const num = typeof manwon === 'string' ? parseNumber(manwon) : manwon;
    if (num === undefined || isNaN(num)) return undefined;
    return num * 10000; // 만원을 원으로 변환
  }, []);

  // 원 단위를 만원 단위로 변환 (표시용)
  const convertWonToManwon = React.useCallback((won: number | string | undefined | null): string => {
    if (won === undefined || won === null || won === '') return '';
    const num = typeof won === 'string' ? parseFloat(won.replace(/,/g, '')) : won;
    if (isNaN(num)) return '';
    const manwon = num / 10000; // 원을 만원으로 변환
    // 소수점까지 표시(필요 시) - 운송비/계근비 소수점 입력 지원
    return formatNumberWithDecimals(String(manwon));
  }, []);

  const formatPhone = React.useCallback((input: string): string => {
    if (!input) return '';
    const digits = input.replace(/[^0-9]/g, '');
    // 서울(02) 국번 처리
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
    // 휴대폰/일반지역번호
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }, []);

  // 차량번호 포맷터 (숫자와 한글만 허용, 자유 입력)
  // 구형: 경기90자4139, 신형: 경기123가4567 등 다양한 형식 지원
  const formatVehicleNumber = React.useCallback((input: string): string => {
    if (!input) return '';
    // 숫자와 한글만 허용 (한글 조합 중인 문자도 허용)
    return input.replace(/[^0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
  }, []);

  // 한글 입력 상태 관리
  const [isComposing, setIsComposing] = React.useState(false);

  // Enter 키를 눌렀을 때 다음 input 필드로 포커스 이동
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    
    // Enter 키이고, Textarea가 아닌 경우에만 처리
    // SelectTrigger도 포함 (다음 필드로 이동)
    if (e.key === 'Enter' && target.tagName !== 'TEXTAREA') {
      // Select의 드롭다운이 열려있는 경우는 제외 (기본 동작 유지)
      const isSelectDropdownOpen = document.querySelector('[role="listbox"][data-state="open"]');
      if (isSelectDropdownOpen) {
        return; // 드롭다운이 열려있으면 기본 동작 유지
      }

      // SelectTrigger나 Select 관련 요소에서 Enter를 누른 경우
      const isSelectTrigger = target.closest('[data-slot="select-trigger"]') || 
                             target.closest('[role="combobox"]') ||
                             target.hasAttribute('data-slot') && target.getAttribute('data-slot')?.includes('select');
      
      if (isSelectTrigger) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        e.preventDefault();
      }
      
      const form = e.currentTarget;
      // input, textarea, select trigger 모두 포함
      const inputs = Array.from(form.querySelectorAll<HTMLElement>(
        'input:not([type="submit"]):not([type="button"]), textarea, [data-slot="select-trigger"], [role="combobox"]'
      )).filter((el) => {
        // disabled나 hidden이 아닌 요소만 선택
        return !(el as HTMLInputElement).disabled && 
               el.offsetParent !== null && 
               !el.hasAttribute('readonly');
      });

      // SelectTrigger를 찾을 때는 실제 trigger 요소를 사용
      const getCurrentElement = (element: HTMLElement) => {
        const selectTrigger = element.closest('[data-slot="select-trigger"]');
        return selectTrigger as HTMLElement || element;
      };

      const currentElement = getCurrentElement(target);
      const currentIndex = inputs.findIndex((el) => {
        const elTrigger = el.closest('[data-slot="select-trigger"]');
        const elToCompare = (elTrigger as HTMLElement) || el;
        return elToCompare === currentElement;
      });
      
      if (currentIndex !== -1 && currentIndex < inputs.length - 1) {
        // 다음 필드로 포커스 이동
        const nextInput = inputs[currentIndex + 1];
        const nextElement = nextInput.closest('[data-slot="select-trigger"]') || nextInput;
        
        // SelectTrigger인 경우 클릭하여 포커스, input인 경우 focus
        const nextElementHTMLElement = nextElement as HTMLElement;
        if (nextElementHTMLElement.hasAttribute('data-slot') && nextElementHTMLElement.getAttribute('data-slot') === 'select-trigger') {
          nextElementHTMLElement.focus();
          // SelectTrigger는 클릭하면 드롭다운이 열리므로, 포커스만 주기
        } else {
          nextElementHTMLElement.focus();
          
          // input이면 전체 선택 (기존 값을 쉽게 덮어쓸 수 있도록)
          if (nextElementHTMLElement.tagName === 'INPUT' && (nextElementHTMLElement as HTMLInputElement).type === 'text') {
            (nextElementHTMLElement as HTMLInputElement).select();
          }
        }
      }
    }
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VehicleDispatchUserFormData>({
    defaultValues: {
      vehicleNumber: '',
      driverContact: '',
      driverName: '',
      entryTime: '',
      transportFee: '',
      weighingFee: '',
      loadingDateTime: '',
      unloadingDateTime: '',
      workBL: '',
      workContainer: '',
      workWeight: '',
      status: 'DRAFT',
      statusReason: '',
    },
  });

  // 자신의 창고에 해당하는 모든 loading items 찾기
  const myLoadingItems = React.useMemo(() => {
    if (!vehicleDispatch?.loadingItems || !warehouseId) return [];
    return vehicleDispatch.loadingItems.filter(item => item.loadingWarehouseId === warehouseId);
  }, [vehicleDispatch?.loadingItems, warehouseId]);

  // 운송비/계근비: 소수점 입력을 위해 표시용 입력값을 별도로 관리 (parseFloat로 즉시 변환하면 "1." 같은 입력이 끊김)
  const [transportFeeInput, setTransportFeeInput] = React.useState<string>('');
  const [weighingFeeInput, setWeighingFeeInput] = React.useState<string>('');

  const formatMoneyInput = React.useCallback((raw: string, decimals = 2) => {
    if (!raw) return '';
    // 숫자/콤마/소수점만 허용
    const cleaned = raw.replace(/[^0-9.,]/g, '');
    const normalized = cleaned.replace(/,/g, '');

    // 소수점은 첫 번째만 유지 + 소수점 자리 제한
    const parts = normalized.split('.');
    const integerPart = parts[0] || '';
    const hasDot = parts.length > 1;
    const decimalRaw = hasDot ? parts.slice(1).join('') : '';
    const decimalPart = hasDot ? decimalRaw.slice(0, decimals) : '';

    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // 사용자가 '1.' 처럼 소수점만 입력한 상태도 유지
    return hasDot ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  }, []);

  // 배차 정보가 변경되면 폼 초기화
  React.useEffect(() => {
    if (vehicleDispatch && open) {
      // 창고 업체인 경우 자신의 loading items에서 작업 정보 가져오기
      // 작업 정보가 없으면 요청 정보를 기본값으로 사용
      // 작업 BL/컨테이너가 null/undefined이거나 빈 문자열이면 요청 값을 기본값으로 사용
      const loadingItemsData: LoadingItemWorkData[] = showWorkFields && myLoadingItems.length > 0
        ? myLoadingItems.map(item => {
            // workBL이나 workContainer가 값이 있으면 사용, 없으면 요청 값 사용
            const workBL = (item.workBL && item.workBL.trim() !== '')
              ? item.workBL 
              : (item.requestBL || '');
            const workContainer = (item.workContainer && item.workContainer.trim() !== '')
              ? item.workContainer
              : (item.requestContainer || '');
            
            return {
              id: item.id!,
              workBL,
              workContainer,
              workWeight: item.workWeight || '',
            };
          })
        : [];

      // 기존 호환성을 위한 단일 필드 (첫 번째 항목 사용)
      const firstItem = myLoadingItems[0];
      const workBL = showWorkFields && firstItem ? (firstItem.workBL || '') : ((vehicleDispatch as any).workBL || '');
      const workContainer = showWorkFields && firstItem ? (firstItem.workContainer || '') : ((vehicleDispatch as any).workContainer || '');
      const workWeight = showWorkFields && firstItem ? (firstItem.workWeight || '') : ((vehicleDispatch as any).workWeight || '');

      reset({
        vehicleNumber: (vehicleDispatch as any).vehicleNumber || '',
        driverContact: (vehicleDispatch as any).driverContact || '',
        driverName: (vehicleDispatch as any).driverName || '',
        entryTime: (vehicleDispatch as any).entryTime || '',
        // 원 단위를 만원 단위로 변환하여 표시
        transportFee: convertWonToManwon((vehicleDispatch as any).transportFee),
        weighingFee: convertWonToManwon((vehicleDispatch as any).weighingFee),
        loadingDateTime: (vehicleDispatch as any).loadingDateTime || '',
        unloadingDateTime: (vehicleDispatch as any).unloadingDateTime || '',
        workBL,
        workContainer,
        workWeight,
        loadingItems: loadingItemsData,
        status: vehicleDispatch.status || 'DRAFT',
        statusReason: (vehicleDispatch as any).statusReason || '',
      });

      // 표시용 입력값 세팅
      setTransportFeeInput(convertWonToManwon((vehicleDispatch as any).transportFee));
      setWeighingFeeInput(convertWonToManwon((vehicleDispatch as any).weighingFee));
    } else if (!vehicleDispatch && open) {
      reset({
        vehicleNumber: '',
        driverContact: '',
        driverName: '',
        entryTime: '',
        transportFee: '',
        weighingFee: '',
        loadingDateTime: '',
        unloadingDateTime: '',
        workBL: '',
        workContainer: '',
        workWeight: '',
        loadingItems: [],
        status: 'DRAFT',
        statusReason: '',
      });
      setTransportFeeInput('');
      setWeighingFeeInput('');
    }
  }, [vehicleDispatch, open, reset, convertWonToManwon, showWorkFields, myLoadingItems]);

  const onSubmitInternal = async (data: VehicleDispatchUserFormData) => {
    if (!vehicleDispatch) {
      toast({
        title: '오류',
        description: '배차 정보를 찾을 수 없습니다.',
      });
      return;
    }

    try {
      // blur 없이 바로 저장을 눌러도 값이 반영되도록(특히 소수점 입력 시)
      const transportFeeFromInput = parseNumber(transportFeeInput);
      const weighingFeeFromInput = parseNumber(weighingFeeInput);
      const transportFeeForSubmit = data.transportFee?.trim()
        ? data.transportFee.trim()
        : (transportFeeFromInput !== undefined ? String(transportFeeFromInput) : '');
      const weighingFeeForSubmit = data.weighingFee?.trim()
        ? data.weighingFee.trim()
        : (weighingFeeFromInput !== undefined ? String(weighingFeeFromInput) : '');

      const submitData: UpdateVehicleDispatchDto = showWorkFields
        ? {
            // 창고 업체: 자신의 loading items 업데이트 및 상태 변경
            loadingItems: vehicleDispatch.loadingItems?.map(item => {
              // 같은 창고의 항목인지 확인
              if (item.loadingWarehouseId === warehouseId) {
                // 폼에서 해당 항목의 작업 정보 찾기
                // 1. ID로 찾기
                let itemData = data.loadingItems?.find(li => li.id === item.id);
                
                // 2. ID로 찾지 못했으면, myLoadingItems의 인덱스로 찾기
                if (!itemData && data.loadingItems && data.loadingItems.length > 0) {
                  const itemIndex = myLoadingItems.findIndex(li => li.id === item.id);
                  if (itemIndex >= 0 && itemIndex < data.loadingItems.length) {
                    itemData = data.loadingItems[itemIndex];
                    // itemData에 id가 없으면 추가
                    if (itemData && !itemData.id) {
                      itemData = { ...itemData, id: item.id };
                    }
                  }
                }
                
                // itemData를 찾았으면 작업 정보 업데이트
                // 빈 문자열도 명시적으로 처리 (값을 비우면 undefined로 저장)
                const workBL = itemData?.workBL?.trim();
                const workContainer = itemData?.workContainer?.trim();
                const workWeight = itemData?.workWeight?.trim();
                
                // 백엔드는 기존 항목을 삭제하고 새로 생성하므로 id는 필요 없음
                return {
                  loadingWarehouseId: item.loadingWarehouseId ?? undefined,
                  requestBL: item.requestBL ?? undefined,
                  requestContainer: item.requestContainer ?? undefined,
                  workBL: workBL !== undefined && workBL !== '' ? workBL : undefined,
                  workContainer: workContainer !== undefined && workContainer !== '' ? workContainer : undefined,
                  workWeight: workWeight !== undefined && workWeight !== '' ? workWeight : undefined,
                  status: item.status || 'PENDING',
                  order: item.order,
                  notes: item.notes ?? undefined,
                };
              }
              // 다른 창고의 item은 그대로 유지
              // 백엔드는 기존 항목을 삭제하고 새로 생성하므로 id는 필요 없음
              return {
                loadingWarehouseId: item.loadingWarehouseId ?? undefined,
                requestBL: item.requestBL ?? undefined,
                requestContainer: item.requestContainer ?? undefined,
                workBL: item.workBL ?? undefined,
                workContainer: item.workContainer ?? undefined,
                workWeight: item.workWeight ?? undefined,
                status: item.status || 'PENDING',
                order: item.order,
                notes: item.notes ?? undefined,
              };
            }) || [],
            status: (data.status as 'DRAFT' | 'DISPATCH_COMPLETED' | 'ASSIGNED' | 'LOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED') || undefined,
            statusReason: (watch('status') === 'FAILED' || watch('status') === 'RESCHEDULED') 
              ? (data.statusReason?.trim() || undefined)
              : undefined,
          }
        : {
            // 배차 업체: 기존 필드들 전송
            vehicleNumber: data.vehicleNumber?.trim() || undefined,
            driverContact: data.driverContact?.trim() || undefined,
            driverName: data.driverName?.trim() || undefined,
            entryTime: data.entryTime?.trim() || undefined,
            // 만원 단위를 원 단위로 변환하여 저장
            transportFee: transportFeeForSubmit ? convertManwonToWon(transportFeeForSubmit) : undefined,
            weighingFee: weighingFeeForSubmit ? convertManwonToWon(weighingFeeForSubmit) : undefined,
            loadingDateTime: data.loadingDateTime?.trim() || undefined,
            unloadingDateTime: data.unloadingDateTime?.trim() || undefined,
            status: (data.status as 'DRAFT' | 'DISPATCH_COMPLETED' | 'ASSIGNED' | 'LOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED') || undefined,
            statusReason: (watch('status') === 'FAILED' || watch('status') === 'RESCHEDULED') 
              ? (data.statusReason?.trim() || undefined)
              : undefined,
          };

      await updateMutation.mutateAsync({
        id: vehicleDispatch.id,
        data: submitData,
      });

      toast({
        title: '저장 완료',
        description: '배차 정보를 저장했습니다.',
      });

      // 데이터 갱신을 먼저 완료한 후 drawer 닫기
      if (onSubmit) {
        await onSubmit();
      }
      
      onOpenChange(false);
    } catch (error: any) {
      console.error('배차 저장 오류:', error);
      console.error('배차 저장 오류 상세:', {
        response: error?.response,
        data: error?.response?.data,
        message: error?.message,
      });
      const message =
        error?.response?.data?.message ??
        error?.message ??
        '배차 정보를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: '배차 저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent className="h-full flex flex-col" style={{ width: isMobile ? '100vw' : '900px', maxWidth: isMobile ? '100vw' : '95vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <DrawerTitle>{showWorkFields ? '상차 정보 입력' : '배차 정보 입력'}</DrawerTitle>
              <DrawerDescription>
                {showWorkFields 
                  ? '작업 BL, 작업 컨테이너, 상태를 입력하세요.'
                  : '차량번호, 운송차 연락처, 입차예정시간, 운송비를 입력하세요.'}
              </DrawerDescription>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">닫기</span>
            </Button>
          </div>
        </DrawerHeader>

        <form onSubmit={handleSubmit(onSubmitInternal)} onKeyDown={handleKeyDown} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-6">
              {showWorkFields ? (
                /* 창고 업체: 작업 BL, 작업 컨테이너, 작업 중량을 각 loadingItem별로 그룹화하여 표시 */
                <div className="space-y-6">
                  {myLoadingItems.length > 0 ? (
                    myLoadingItems.map((item, index) => {
                      const currentItems = watch('loadingItems') || [];
                      // currentItems[index]를 가져오되, id가 없거나 맞지 않으면 새로 생성
                      let itemData = currentItems[index];
                      if (!itemData || itemData.id !== item.id) {
                        // itemData가 없거나 ID가 맞지 않으면 기본값으로 생성
                        // 작업 BL/컨테이너가 값이 있으면 사용, 없으면 요청 값을 기본값으로 사용
                        const workBL = (item.workBL && item.workBL.trim() !== '')
                          ? item.workBL
                          : (item.requestBL || '');
                        const workContainer = (item.workContainer && item.workContainer.trim() !== '')
                          ? item.workContainer
                          : (item.requestContainer || '');
                        
                        itemData = { 
                          id: item.id!, 
                          workBL,
                          workContainer,
                          workWeight: item.workWeight || '' 
                        };
                      }
                      const warehouseName = item.loadingWarehouse?.name || warehouseMap.get(item.loadingWarehouseId || 0) || `창고 #${item.loadingWarehouseId}`;
                      
                      return (
                        <div key={item.id || index} className="space-y-4 p-4 border rounded-lg">
                          {myLoadingItems.length > 1 && (
                            <h4 className="text-sm font-semibold text-foreground">항목 {index + 1} - {warehouseName}</h4>
                          )}
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {/* 작업 BL */}
                            <div className="space-y-2">
                              <Label htmlFor={`workBL-${item.id}`} className="text-sm font-medium text-muted-foreground">작업 BL</Label>
                              <Input
                                id={`workBL-${item.id}`}
                                type="text"
                                value={itemData.workBL || ''}
                                onChange={(e) => {
                                  const currentItems = watch('loadingItems') || [];
                                  const updatedItems = [...currentItems];
                                  // 배열 길이를 맞추고 id 보장
                                  while (updatedItems.length <= index) {
                                    updatedItems.push({ id: item.id!, workBL: '', workContainer: '', workWeight: '' });
                                  }
                                  updatedItems[index] = { ...itemData, id: item.id!, workBL: e.target.value };
                                  setValue('loadingItems', updatedItems, { shouldValidate: true });
                                }}
                                placeholder="작업 BL을 입력하세요"
                                size="sm"
                              />
                            </div>

                            {/* 작업 컨테이너 */}
                            <div className="space-y-2">
                              <Label htmlFor={`workContainer-${item.id}`} className="text-sm font-medium text-muted-foreground">작업 컨테이너</Label>
                              <Input
                                id={`workContainer-${item.id}`}
                                type="text"
                                value={itemData.workContainer || ''}
                                onChange={(e) => {
                                  const currentItems = watch('loadingItems') || [];
                                  const updatedItems = [...currentItems];
                                  // 배열 길이를 맞추고 id 보장
                                  while (updatedItems.length <= index) {
                                    updatedItems.push({ id: item.id!, workBL: '', workContainer: '', workWeight: '' });
                                  }
                                  updatedItems[index] = { ...itemData, id: item.id!, workContainer: e.target.value };
                                  setValue('loadingItems', updatedItems, { shouldValidate: true });
                                }}
                                placeholder="작업 컨테이너를 입력하세요"
                                size="sm"
                              />
                            </div>

                            {/* 작업 중량 */}
                            <div className="space-y-2">
                              <Label htmlFor={`workWeight-${item.id}`} className="text-sm font-medium text-muted-foreground">작업 중량</Label>
                              <Input
                                id={`workWeight-${item.id}`}
                                type="text"
                                value={itemData.workWeight || ''}
                                onChange={(e) => {
                                  const currentItems = watch('loadingItems') || [];
                                  const updatedItems = [...currentItems];
                                  // 배열 길이를 맞추고 id 보장
                                  while (updatedItems.length <= index) {
                                    updatedItems.push({ id: item.id!, workBL: '', workContainer: '', workWeight: '' });
                                  }
                                  updatedItems[index] = { ...itemData, id: item.id!, workWeight: e.target.value };
                                  setValue('loadingItems', updatedItems, { shouldValidate: true });
                                }}
                                placeholder="작업 중량을 입력하세요"
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-sm text-muted-foreground">해당 창고의 상차 정보가 없습니다.</div>
                  )}

                  {/* 상태 (모든 항목 공통) */}
                  {myLoadingItems.length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <div className="space-y-2">
                        <Label htmlFor="status" className="text-sm font-medium text-muted-foreground">상태</Label>
                        <Select
                          value={watch('status') || 'DRAFT'}
                          onValueChange={(value) => {
                            setValue('status', value, { shouldValidate: true });
                            // 상태 변경 시 사유 초기화 (배차 실패나 일정 조정이 아니면)
                            const currentStatus = value || '';
                            if (currentStatus !== 'FAILED' && currentStatus !== 'RESCHEDULED') {
                              setValue('statusReason', '', { shouldValidate: true });
                            }
                          }}
                        >
                          <SelectTrigger id="status" size="sm">
                            <SelectValue placeholder="상태를 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableStatusCodes.map((code) => (
                              <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                                {code.name || code.value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.status && (
                          <p className="text-sm text-destructive">{errors.status.message}</p>
                        )}
                      </div>

                      {/* 상태 사유 (배차 실패 또는 일정 조정일 때만) */}
                      {(watch('status') === 'FAILED' || watch('status') === 'RESCHEDULED') && (
                        <div className="space-y-2">
                          <Label htmlFor="statusReason" className="text-sm font-medium text-muted-foreground">
                            사유
                          </Label>
                          <Textarea
                            id="statusReason"
                            value={watch('statusReason') || ''}
                            onChange={(e) => {
                              setValue('statusReason', e.target.value, {
                                shouldValidate: true,
                              });
                            }}
                            placeholder="사유를 입력하세요"
                            rows={3}
                            className="resize-none"
                          />
                          {errors.statusReason && (
                            <p className="text-sm text-destructive">{errors.statusReason.message}</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                /* 배차 업체: 기존 필드들 표시 */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {/* 차량번호 */}
                    <div className="space-y-2">
                      <Label htmlFor="vehicleNumber" className="text-sm font-medium text-muted-foreground">차량번호</Label>
                  <Input
                    id="vehicleNumber"
                    type="text"
                    value={watch('vehicleNumber') || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      // 한글 조합 중이 아닐 때만 포맷팅 적용
                      if (!isComposing) {
                        const formatted = formatVehicleNumber(value);
                        setValue('vehicleNumber', formatted, {
                          shouldValidate: true,
                        });
                      } else {
                        setValue('vehicleNumber', value, {
                          shouldValidate: true,
                        });
                      }
                    }}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={(e) => {
                      setIsComposing(false);
                      // 조합 완료 후 포맷팅 적용
                      const formatted = formatVehicleNumber(e.currentTarget.value);
                      setValue('vehicleNumber', formatted, {
                        shouldValidate: true,
                      });
                    }}
                      placeholder="차량번호를 입력하세요"
                      size="sm"
                    />
                      {errors.vehicleNumber && (
                        <p className="text-sm text-destructive">{errors.vehicleNumber.message}</p>
                      )}
                    </div>

                    {/* 운송차 연락처 */}
                    <div className="space-y-2">
                      <Label htmlFor="driverContact" className="text-sm font-medium text-muted-foreground">운송차 연락처</Label>
                  <Input
                    id="driverContact"
                    value={formatPhone(watch('driverContact'))}
                    onChange={(e) => {
                      const formatted = formatPhone(e.target.value);
                      setValue('driverContact', formatted, {
                        shouldValidate: true,
                      });
                    }}
                      placeholder="운송차 연락처를 입력하세요 (예: 010-1234-5678)"
                      size="sm"
                  />
                      {errors.driverContact && (
                        <p className="text-sm text-destructive">{errors.driverContact.message}</p>
                      )}
                    </div>

                    {/* 기사명 */}
                    <div className="space-y-2">
                      <Label htmlFor="driverName" className="text-sm font-medium text-muted-foreground">기사명</Label>
                  <Input
                    id="driverName"
                    type="text"
                    value={watch('driverName') || ''}
                    onChange={(e) => {
                      setValue('driverName', e.target.value, {
                        shouldValidate: true,
                      });
                    }}
                      placeholder="기사명을 입력하세요"
                      size="sm"
                  />
                      {errors.driverName && (
                        <p className="text-sm text-destructive">{errors.driverName.message}</p>
                      )}
                    </div>

                    {/* 입차예정시간 */}
                    <div className="space-y-2">
                      <Label htmlFor="entryTime" className="text-sm font-medium text-muted-foreground">입차예정시간</Label>
                      <Input
                        id="entryTime"
                        type="text"
                        value={watch('entryTime') || ''}
                        onChange={(e) => {
                          setValue('entryTime', e.target.value, {
                            shouldValidate: true,
                          });
                        }}
                        placeholder="입차예정시간을 입력하세요 (예: 오전 11:30, 농가직접상차 등)"
                        size="sm"
                      />
                      {errors.entryTime && (
                        <p className="text-sm text-destructive">{errors.entryTime.message}</p>
                      )}
                    </div>

                    {/* 운송비 */}
                    <div className="space-y-2">
                      <Label htmlFor="transportFee" className="text-sm font-medium text-muted-foreground">운송비</Label>
                      <div className="relative">
                        <Input
                          id="transportFee"
                          type="text"
                          value={transportFeeInput}
                          onChange={(e) => {
                            setTransportFeeInput(formatMoneyInput(e.target.value, 2));
                          }}
                          onFocus={(e) => {
                            // 편집이 쉬우도록 콤마 제거
                            setTransportFeeInput((prev) => prev.replace(/,/g, ''));
                            // 커서 이동 등 기본 동작 유지
                            e.currentTarget.select?.();
                          }}
                          onBlur={(e) => {
                            const num = parseNumber(e.target.value);
                            setValue('transportFee', num !== undefined ? String(num) : '', {
                              shouldValidate: true,
                              shouldDirty: true,
                            });
                            setTransportFeeInput(num !== undefined ? formatNumberWithDecimals(num) : '');
                          }}
                          placeholder="운송비를 입력하세요"
                          size="sm"
                          className="pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                          만원
                        </span>
                      </div>
                      {errors.transportFee && (
                        <p className="text-sm text-destructive">{errors.transportFee.message}</p>
                      )}
                    </div>

                    {/* 계근비 */}
                    <div className="space-y-2">
                      <Label htmlFor="weighingFee" className="text-sm font-medium text-muted-foreground">계근비</Label>
                      <div className="relative">
                        <Input
                          id="weighingFee"
                          type="text"
                          value={weighingFeeInput}
                          onChange={(e) => {
                            setWeighingFeeInput(formatMoneyInput(e.target.value, 2));
                          }}
                          onFocus={(e) => {
                            setWeighingFeeInput((prev) => prev.replace(/,/g, ''));
                            e.currentTarget.select?.();
                          }}
                          onBlur={(e) => {
                            const num = parseNumber(e.target.value);
                            setValue('weighingFee', num !== undefined ? String(num) : '', {
                              shouldValidate: true,
                              shouldDirty: true,
                            });
                            setWeighingFeeInput(num !== undefined ? formatNumberWithDecimals(num) : '');
                          }}
                          placeholder="계근비를 입력하세요"
                          size="sm"
                          className="pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                          만원
                        </span>
                      </div>
                      {errors.weighingFee && (
                        <p className="text-sm text-destructive">{errors.weighingFee.message}</p>
                      )}
                    </div>

                    {/* 상차일시 */}
                    <div className="space-y-2">
                      <Label htmlFor="loadingDateTime" className="text-sm font-medium text-muted-foreground">상차일시</Label>
                      <Input
                        id="loadingDateTime"
                        type="text"
                        value={watch('loadingDateTime') || ''}
                        onChange={(e) => {
                          setValue('loadingDateTime', e.target.value, {
                            shouldValidate: true,
                          });
                        }}
                        placeholder="상차일시를 입력하세요"
                        size="sm"
                      />
                      {vehicleDispatch?.loadingSchedule && (
                        <p className="text-xs text-muted-foreground">
                          기존: {vehicleDispatch.loadingSchedule ? new Date(vehicleDispatch.loadingSchedule).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          }) : ''}
                          {vehicleDispatch.loadingScheduleTime ? ` ${vehicleDispatch.loadingScheduleTime}` : ''} (변경 시만 입력)
                        </p>
                      )}
                      {errors.loadingDateTime && (
                        <p className="text-sm text-destructive">{errors.loadingDateTime.message}</p>
                      )}
                    </div>

                    {/* 하차일시 */}
                    <div className="space-y-2">
                      <Label htmlFor="unloadingDateTime" className="text-sm font-medium text-muted-foreground">하차일시</Label>
                      <Input
                        id="unloadingDateTime"
                        type="text"
                        value={watch('unloadingDateTime') || ''}
                        onChange={(e) => {
                          setValue('unloadingDateTime', e.target.value, {
                            shouldValidate: true,
                          });
                        }}
                        placeholder="하차일시를 입력하세요"
                        size="sm"
                      />
                      {vehicleDispatch?.unloadingScheduleDate && (
                        <p className="text-xs text-muted-foreground">
                          기존: {vehicleDispatch.unloadingScheduleDate ? new Date(vehicleDispatch.unloadingScheduleDate).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          }) : ''}
                          {vehicleDispatch.unloadingScheduleTime ? ` ${vehicleDispatch.unloadingScheduleTime}` : ''} (변경 시만 입력)
                        </p>
                      )}
                      {errors.unloadingDateTime && (
                        <p className="text-sm text-destructive">{errors.unloadingDateTime.message}</p>
                      )}
                    </div>

                    {/* 상태 */}
                    <div className="space-y-2">
                      <Label htmlFor="status" className="text-sm font-medium text-muted-foreground">상태</Label>
                      <Select
                        value={watch('status') || 'DRAFT'}
                        onValueChange={(value) => {
                          setValue('status', value, { shouldValidate: true });
                          // 상태 변경 시 사유 초기화 (배차 실패나 일정 조정이 아니면)
                          const currentStatus = value || '';
                          if (currentStatus !== 'FAILED' && currentStatus !== 'RESCHEDULED') {
                            setValue('statusReason', '', { shouldValidate: true });
                          }
                        }}
                      >
                        <SelectTrigger id="status" size="sm">
                          <SelectValue placeholder="상태를 선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableStatusCodes.map((code) => (
                            <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                              {code.name || code.value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.status && (
                        <p className="text-sm text-destructive">{errors.status.message}</p>
                      )}
                    </div>

                    {/* 상태 사유 (배차 실패 또는 일정 조정일 때만) */}
                    {(watch('status') === 'FAILED' || watch('status') === 'RESCHEDULED') && (
                      <div className="space-y-2 col-span-2 md:col-span-3">
                        <Label htmlFor="statusReason" className="text-sm font-medium text-muted-foreground">
                          사유
                        </Label>
                        <Textarea
                          id="statusReason"
                          value={watch('statusReason') || ''}
                          onChange={(e) => {
                            setValue('statusReason', e.target.value, {
                              shouldValidate: true,
                            });
                          }}
                          placeholder="사유를 입력하세요"
                          rows={3}
                          className="resize-none"
                        />
                        {errors.statusReason && (
                          <p className="text-sm text-destructive">{errors.statusReason.message}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border p-4">
            <div className="flex gap-2 justify-end">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  <X className="mr-2 h-4 w-4" />
                  취소
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
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
        </form>
      </DrawerContent>
    </Drawer>
  );
}

