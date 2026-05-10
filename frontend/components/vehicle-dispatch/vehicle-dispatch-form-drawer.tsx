'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
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
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Save, MapPin, XCircle, Search, Building2, Plus, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { useUnloadingCompanies } from '@/lib/hooks/use-unloading-companies';
import { useRegions } from '@/lib/hooks/use-regions';
import { useCities } from '@/lib/hooks/use-cities';
import { DatePicker } from '@/components/schedules/date-picker';
import {
  VehicleDispatch,
  CreateVehicleDispatchDto,
  UpdateVehicleDispatchDto,
  useCreateVehicleDispatch,
  useUpdateVehicleDispatch,
} from '@/lib/hooks/use-vehicle-dispatch';
import { useConsultationLookup } from '@/lib/hooks/use-consultations';
import { useIsMobile } from '@/hooks/use-mobile';
import api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DaumPostcodeData } from '@/types/daum-postcode';

interface VehicleDispatchFormData {
  requestVehicle: string;
  requestWeight: string;
  loadingWarehouseId: string;
  loadingSchedule: string;
  loadingScheduleTime: string;
  customerPostalCode: string;
  customerAddress: string;
  customerAddressDetail: string;
  customerRegion: string;
  customerCity: string;
  unloadingPostalCode: string;
  unloadingAddress: string;
  unloadingAddressDetail: string;
  unloadingRegion: string;
  unloadingCity: string;
  unloadingScheduleDate: string;
  unloadingScheduleTime: string;
  freightPaymentType: string;
  requestBL: string;
  requestContainer: string;
  orderNumber: string;
  notes: string;
  companyName: string;
  representativeName: string;
  phone: string;
  dispatchCompanyId: string;
  unloadingCompanyId: string;
  status?: string;
  directUnloadingContact?: string;
  reprocessReason?: string;
}

interface CompanySearchResult {
  id: string;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
  region?: string | null;
  customerPostalCode?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  addressDetail?: string | null;
}

interface VehicleDispatchFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  vehicleDispatch?: VehicleDispatch | null;
  onSubmit?: (data: CreateVehicleDispatchDto | UpdateVehicleDispatchDto) => Promise<void>;
  onCancel?: () => void;
}

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '';
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

// 주소 검색 API에서 받은 지역명을 DB에 저장된 지역명으로 정규화
const normalizeRegionNameFromAddress = (sido: string): string => {
  const regionMapping: Record<string, string> = {
    '전북특별자치도': '전라북도',
    '전라북도': '전라북도',
    '강원특별자치도': '강원도',
    '강원도': '강원도',
    '제주특별자치도': '제주특별자치도',
    '서울특별시': '서울특별시',
    '부산광역시': '부산광역시',
    '대구광역시': '대구광역시',
    '인천광역시': '인천광역시',
    '광주광역시': '광주광역시',
    '대전광역시': '대전광역시',
    '울산광역시': '울산광역시',
    '세종특별자치시': '세종특별자치시',
    '경기도': '경기도',
    '충청북도': '충청북도',
    '충청남도': '충청남도',
    '전라남도': '전라남도',
    '경상북도': '경상북도',
    '경상남도': '경상남도',
  };
  return regionMapping[sido] || sido;
};

export function VehicleDispatchFormDrawer({
  open,
  onOpenChange,
  mode,
  vehicleDispatch,
  onSubmit,
  onCancel,
}: VehicleDispatchFormDrawerProps) {
  const isMobile = useIsMobile();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isClient, setIsClient] = React.useState(false);
  const [unloadingAddressModalOpen, setUnloadingAddressModalOpen] = React.useState(false);
  const unloadingAddressContentRef = React.useRef<HTMLDivElement>(null);
  
  // 업체 검색 관련 state
  const [companySearchOpen, setCompanySearchOpen] = React.useState(false);
  const [companySearchTerm, setCompanySearchTerm] = React.useState('');
  const [companySearchResults, setCompanySearchResults] = React.useState<CompanySearchResult[]>([]);
  const [companySearchLoading, setCompanySearchLoading] = React.useState(false);
  const [companySearchError, setCompanySearchError] = React.useState<string | null>(null);
  const [companySearchAttempted, setCompanySearchAttempted] = React.useState(false);

  // 전화번호 검색 상태
  const [phoneSearchOpen, setPhoneSearchOpen] = React.useState(false);
  const [phoneSearchTerm, setPhoneSearchTerm] = React.useState('');
  const [phoneSearchResults, setPhoneSearchResults] = React.useState<CompanySearchResult[]>([]);
  const [phoneSearchLoading, setPhoneSearchLoading] = React.useState(false);
  const [phoneSearchError, setPhoneSearchError] = React.useState<string | null>(null);
  const [phoneSearchAttempted, setPhoneSearchAttempted] = React.useState(false);

  // 고객 시군구 자동 설정을 위한 pending state
  const [pendingCustomerCity, setPendingCustomerCity] = React.useState<string | null>(null);
  
  // 상차지, 요청 BL, 요청 컨테이너 다중 항목 관리
  interface LoadingItem {
    id: string;
    loadingWarehouseId: string;
    requestBL: string;
    requestContainer: string;
    workBL?: string;
    workContainer?: string;
    workWeight?: string;
    notes?: string;
  }
  const [loadingItems, setLoadingItems] = React.useState<LoadingItem[]>([
    { id: '1', loadingWarehouseId: '', requestBL: '', requestContainer: '' }
  ]);
  
  // 고객 주소와 동일 체크박스
  const [syncUnloadingAddress, setSyncUnloadingAddress] = React.useState(false);
  
  // drawer가 열릴 때 체크박스 초기화
  React.useEffect(() => {
    if (open) {
      setSyncUnloadingAddress(false);
    }
  }, [open]);
  
  // 고객 주소 모달
  const [customerAddressModalOpen, setCustomerAddressModalOpen] = React.useState(false);
  const customerAddressContentRef = React.useRef<HTMLDivElement>(null);
  
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: freightPaymentTypeCodes } = useCodeMastersByGroup('FREIGHT_PAYMENT_TYPE');
  const { data: statusCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_STATUS');
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses({ status: true });
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  const { data: unloadingCompanies = [] } = useUnloadingCompanies();
  const { data: regions } = useRegions();
  const lookupMutation = useConsultationLookup();
  const createMutation = useCreateVehicleDispatch();
  const updateMutation = useUpdateVehicleDispatch();

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // 카카오 주소 검색 스크립트 로드
  React.useEffect(() => {
    if (!open || !isClient || typeof window === 'undefined') return;

    // 이미 스크립트가 로드되어 있는지 확인
    const existingScript = document.querySelector('script[src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"]');
    if (existingScript || window.daum?.Postcode) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // 컴포넌트가 닫힐 때 스크립트를 제거하지 않음 (다른 컴포넌트에서도 사용할 수 있음)
    };
  }, [open, isClient]);

  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<VehicleDispatchFormData>({
    defaultValues: {
      requestVehicle: '',
      requestWeight: '',
      loadingWarehouseId: '',
      loadingSchedule: '',
      loadingScheduleTime: '',
      customerPostalCode: '',
      customerAddress: '',
      customerAddressDetail: '',
      customerRegion: '',
      customerCity: '',
      unloadingPostalCode: '',
      unloadingAddress: '',
      unloadingAddressDetail: '',
      unloadingRegion: '',
      unloadingCity: '',
      unloadingScheduleDate: '',
      unloadingScheduleTime: '',
      freightPaymentType: '',
      requestBL: '',
      requestContainer: '',
      orderNumber: '',
      notes: '',
      companyName: '',
      representativeName: '',
      phone: '',
      dispatchCompanyId: '',
      unloadingCompanyId: '',
      status: 'DRAFT',
    },
  });

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'edit' && vehicleDispatch) {
      // 하차 일정 날짜와 시간 (분리된 필드 사용)
      const unloadingScheduleDate = vehicleDispatch.unloadingScheduleDate 
        ? new Date(vehicleDispatch.unloadingScheduleDate).toISOString().split('T')[0]
        : '';
      const unloadingScheduleTime = vehicleDispatch.unloadingScheduleTime || '';
      
      // 상차지, 요청 BL, 요청 컨테이너 초기화 (작업 정보 포함)
      if (vehicleDispatch.loadingItems && vehicleDispatch.loadingItems.length > 0) {
        setLoadingItems(
          vehicleDispatch.loadingItems.map((item, index) => ({
            id: item.id?.toString() || `${index + 1}`,
            loadingWarehouseId: item.loadingWarehouseId?.toString() || '',
            requestBL: item.requestBL || '',
            requestContainer: item.requestContainer || '',
            workBL: item.workBL || '',
            workContainer: item.workContainer || '',
            workWeight: item.workWeight || '',
            notes: item.notes || '',
          }))
        );
      } else {
        // 기존 데이터 호환성 (loadingItems가 없는 경우)
        setLoadingItems([
          {
            id: '1',
            loadingWarehouseId: vehicleDispatch.loadingWarehouseId?.toString() || '',
            requestBL: (vehicleDispatch as any).requestBL || '',
            requestContainer: (vehicleDispatch as any).requestContainer || '',
            workBL: (vehicleDispatch as any).workBL || '',
            workContainer: (vehicleDispatch as any).workContainer || '',
            workWeight: (vehicleDispatch as any).workWeight || '',
            notes: '',
          }
        ]);
      }
      
      reset({
        requestVehicle: vehicleDispatch.requestVehicle || '',
        requestWeight: vehicleDispatch.requestWeight?.toString() || '',
        loadingWarehouseId: vehicleDispatch.loadingWarehouseId?.toString() || '',
        loadingSchedule: vehicleDispatch.loadingSchedule ? new Date(vehicleDispatch.loadingSchedule).toISOString().split('T')[0] : '',
        loadingScheduleTime: vehicleDispatch.loadingScheduleTime || '',
        unloadingPostalCode: vehicleDispatch.unloadingPostalCode || '',
        unloadingAddress: vehicleDispatch.unloadingAddress || '',
        unloadingAddressDetail: vehicleDispatch.unloadingAddressDetail || '',
        unloadingRegion: (vehicleDispatch as any).unloadingRegion?.name || '',
        unloadingCity: (vehicleDispatch as any).unloadingCity?.name || '',
        unloadingScheduleDate,
        unloadingScheduleTime,
        freightPaymentType: (vehicleDispatch as any).freightPaymentType || '',
        requestBL: (vehicleDispatch as any).requestBL || '',
        requestContainer: (vehicleDispatch as any).requestContainer || '',
        orderNumber: (vehicleDispatch as any).orderNumber || '',
        notes: (vehicleDispatch as any).notes || '',
        companyName: vehicleDispatch.companyName || '',
        representativeName: vehicleDispatch.representativeName || '',
        phone: vehicleDispatch.phone || '',
        dispatchCompanyId: vehicleDispatch.dispatchCompanyId?.toString() || '',
        unloadingCompanyId: (vehicleDispatch as any).unloadingCompanyId 
          ? (vehicleDispatch as any).unloadingCompanyId.toString() 
          : ((vehicleDispatch as any).directUnloadingContact ? '__direct__' : ''),
        directUnloadingContact: (vehicleDispatch as any).directUnloadingContact || '',
        status: vehicleDispatch.status || 'DRAFT',
        reprocessReason: '',
      });

      // 초기 로드 시 하차지 주소 상태 확인
      const initialUnloadingPostalCode = (vehicleDispatch.unloadingPostalCode ?? '').trim();
      const initialUnloadingAddress = (vehicleDispatch.unloadingAddress ?? '').trim();
      const initialUnloadingAddressDetail = (vehicleDispatch.unloadingAddressDetail ?? '').trim();
      // unloadingRegion과 unloadingCity는 객체일 수도 있고 문자열일 수도 있음
      const initialUnloadingRegionObj = (vehicleDispatch as any).unloadingRegion;
      const initialUnloadingCityObj = (vehicleDispatch as any).unloadingCity;
      const initialUnloadingRegion = (typeof initialUnloadingRegionObj === 'string' 
        ? initialUnloadingRegionObj 
        : initialUnloadingRegionObj?.name ?? '').trim();
      const initialUnloadingCity = (typeof initialUnloadingCityObj === 'string' 
        ? initialUnloadingCityObj 
        : initialUnloadingCityObj?.name ?? '').trim();
      
      const hasUnloadingAddress = initialUnloadingPostalCode || initialUnloadingAddress || initialUnloadingAddressDetail || initialUnloadingRegion || initialUnloadingCity;
      
      console.log('[FORM] 초기 하차지 주소 상태:', {
        postalCode: initialUnloadingPostalCode || '(빈값)',
        address: initialUnloadingAddress || '(빈값)',
        addressDetail: initialUnloadingAddressDetail || '(빈값)',
        region: initialUnloadingRegion || '(빈값)',
        city: initialUnloadingCity || '(빈값)',
        hasAddress: hasUnloadingAddress,
      });
      
      // 하차지 주소가 없으면 초기에는 체크박스 체크 안 함
      if (!hasUnloadingAddress) {
        console.log('[FORM] 하차지 주소가 없어 초기 체크박스 체크 안 함');
        setSyncUnloadingAddress(false);
      }

      // 수정 모드일 때 전화번호로 고객 정보 조회
      if (vehicleDispatch.phone) {
        lookupMutation.mutate(vehicleDispatch.phone, {
          onSuccess: (result) => {
            if (result.customer) {
              setValue('customerPostalCode', result.customer.customerPostalCode ?? '', { shouldDirty: false });
              setValue('customerAddress', result.customer.customerAddress ?? '', { shouldDirty: false });
              setValue('customerAddressDetail', result.customer.addressDetail ?? '', { shouldDirty: false });
              // 지역을 먼저 설정
              if (result.customer.region) {
                setValue('customerRegion', result.customer.region, { shouldDirty: false });
              }
              // 시군구는 pending 상태로 저장 (useEffect에서 처리)
              if (result.customer.customerCity) {
                setPendingCustomerCity(result.customer.customerCity);
              }
              
              // 하차지 주소와 고객 주소가 같은지 확인하여 체크박스 자동 체크
              const customerPostalCode = (result.customer.customerPostalCode ?? '').trim();
              const customerAddress = (result.customer.customerAddress ?? '').trim();
              const customerAddressDetail = (result.customer.addressDetail ?? '').trim();
              const customerRegion = (result.customer.region ?? '').trim();
              const customerCity = (result.customer.customerCity ?? '').trim();
              
              const unloadingPostalCode = (vehicleDispatch.unloadingPostalCode ?? '').trim();
              const unloadingAddress = (vehicleDispatch.unloadingAddress ?? '').trim();
              const unloadingAddressDetail = (vehicleDispatch.unloadingAddressDetail ?? '').trim();
              // unloadingRegion과 unloadingCity는 객체일 수도 있고 문자열일 수도 있음
              const unloadingRegionObj = (vehicleDispatch as any).unloadingRegion;
              const unloadingCityObj = (vehicleDispatch as any).unloadingCity;
              const unloadingRegion = (typeof unloadingRegionObj === 'string' 
                ? unloadingRegionObj 
                : unloadingRegionObj?.name ?? '').trim();
              const unloadingCity = (typeof unloadingCityObj === 'string' 
                ? unloadingCityObj 
                : unloadingCityObj?.name ?? '').trim();
              
              // 디버깅: 비교 결과 로그 (상세)
              const comparisonResult = {
                customer: {
                  postalCode: customerPostalCode || '(빈값)',
                  address: customerAddress || '(빈값)',
                  addressDetail: customerAddressDetail || '(빈값)',
                  region: customerRegion || '(빈값)',
                  city: customerCity || '(빈값)',
                },
                unloading: {
                  postalCode: unloadingPostalCode || '(빈값)',
                  address: unloadingAddress || '(빈값)',
                  addressDetail: unloadingAddressDetail || '(빈값)',
                  region: unloadingRegion || '(빈값)',
                  city: unloadingCity || '(빈값)',
                },
                matches: {
                  postalCode: customerPostalCode === unloadingPostalCode,
                  address: customerAddress === unloadingAddress,
                  addressDetail: customerAddressDetail === unloadingAddressDetail,
                  region: customerRegion === unloadingRegion,
                  city: customerCity === unloadingCity,
                },
              };
              console.log('[FORM] 주소 비교 상세:', JSON.stringify(comparisonResult, null, 2));
              console.log('[FORM] 고객 주소 (원본):', {
                postalCode: result.customer.customerPostalCode,
                address: result.customer.customerAddress,
                addressDetail: result.customer.addressDetail,
                region: result.customer.region,
                city: result.customer.customerCity,
              });
              console.log('[FORM] 하차지 주소 (원본):', {
                postalCode: vehicleDispatch.unloadingPostalCode,
                address: vehicleDispatch.unloadingAddress,
                addressDetail: vehicleDispatch.unloadingAddressDetail,
                region: (vehicleDispatch as any).unloadingRegion,
                regionType: typeof (vehicleDispatch as any).unloadingRegion,
                regionName: typeof (vehicleDispatch as any).unloadingRegion === 'string' 
                  ? (vehicleDispatch as any).unloadingRegion 
                  : (vehicleDispatch as any).unloadingRegion?.name,
                city: (vehicleDispatch as any).unloadingCity,
                cityType: typeof (vehicleDispatch as any).unloadingCity,
                cityName: typeof (vehicleDispatch as any).unloadingCity === 'string' 
                  ? (vehicleDispatch as any).unloadingCity 
                  : (vehicleDispatch as any).unloadingCity?.name,
              });
              console.log('[FORM] 비교에 사용된 값:', {
                customerRegion,
                unloadingRegion,
                customerCity,
                unloadingCity,
              });
              
              // 주소가 모두 일치하면 체크박스 자동 체크
              // 모든 필드가 비어있지 않고 일치해야 함 (빈 문자열끼리 일치하는 경우는 제외)
              const hasCustomerAddress = customerPostalCode || customerAddress || customerAddressDetail || customerRegion || customerCity;
              const hasUnloadingAddress = unloadingPostalCode || unloadingAddress || unloadingAddressDetail || unloadingRegion || unloadingCity;
              
              if (hasCustomerAddress && hasUnloadingAddress) {
                const allMatch = 
                  customerPostalCode === unloadingPostalCode &&
                  customerAddress === unloadingAddress &&
                  customerAddressDetail === unloadingAddressDetail &&
                  customerRegion === unloadingRegion &&
                  customerCity === unloadingCity;
                
                if (allMatch) {
                  console.log('[FORM] 주소가 일치하여 체크박스 자동 체크');
                  setSyncUnloadingAddress(true);
                } else {
                  console.log('[FORM] 주소가 일치하지 않아 체크박스 체크 안 함');
                  setSyncUnloadingAddress(false);
                }
              } else {
                // 주소가 없으면 체크박스 체크 안 함
                console.log('[FORM] 주소 정보가 없어 체크박스 체크 안 함');
                setSyncUnloadingAddress(false);
              }
            }
          },
          onError: () => {
            // 고객 정보를 찾을 수 없어도 에러 표시하지 않음 (정상적인 경우일 수 있음)
          },
        });
      } else {
        // 전화번호가 없으면 pending 초기화
        setPendingCustomerCity(null);
      }
    } else {
      // 새로 생성할 때 기본 1개 항목
      setLoadingItems([
        { id: '1', loadingWarehouseId: '', requestBL: '', requestContainer: '' }
      ]);
      
      reset({
        requestVehicle: '',
        requestWeight: '',
        loadingWarehouseId: '',
        loadingSchedule: '',
        loadingScheduleTime: '',
        unloadingPostalCode: '',
        unloadingAddress: '',
        unloadingAddressDetail: '',
        unloadingScheduleDate: '',
        unloadingScheduleTime: '',
        freightPaymentType: '',
        requestBL: '',
        requestContainer: '',
        notes: '',
        companyName: '',
        representativeName: '',
        phone: '',
        dispatchCompanyId: '',
        unloadingCompanyId: '',
        status: 'DRAFT',
        directUnloadingContact: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, vehicleDispatch?.id]);

  // drawer가 닫힐 때 pending 초기화
  React.useEffect(() => {
    if (!open) {
      setPendingCustomerCity(null);
    }
  }, [open]);

  const onSubmitInternal = async (data: VehicleDispatchFormData) => {
    setIsSubmitting(true);
    try {
      console.log('[FORM] 제출 데이터 (원본):', data);

      // 하차지 주소 동일 체크 시 고객 주소 값 사용
      const finalUnloadingPostalCode = syncUnloadingAddress 
        ? (data.customerPostalCode?.trim() || data.unloadingPostalCode?.trim() || undefined)
        : (data.unloadingPostalCode?.trim() || undefined);
      const finalUnloadingAddress = syncUnloadingAddress
        ? (data.customerAddress?.trim() || data.unloadingAddress?.trim() || undefined)
        : (data.unloadingAddress?.trim() || undefined);
      const finalUnloadingAddressDetail = syncUnloadingAddress
        ? (data.customerAddressDetail?.trim() || data.unloadingAddressDetail?.trim() || undefined)
        : (data.unloadingAddressDetail?.trim() || undefined);
      const finalUnloadingRegion = syncUnloadingAddress
        ? (data.customerRegion && data.customerRegion !== '__none__' ? data.customerRegion : (data.unloadingRegion && data.unloadingRegion !== '__none__' ? data.unloadingRegion : undefined))
        : (data.unloadingRegion && data.unloadingRegion !== '__none__' ? data.unloadingRegion : undefined);
      const finalUnloadingCity = syncUnloadingAddress
        ? (data.customerCity && data.customerCity !== '__none__' ? data.customerCity : (data.unloadingCity && data.unloadingCity !== '__none__' ? data.unloadingCity : undefined))
        : (data.unloadingCity && data.unloadingCity !== '__none__' ? data.unloadingCity : undefined);

      const submitData: CreateVehicleDispatchDto | UpdateVehicleDispatchDto = {
        requestVehicle: data.requestVehicle?.trim() || undefined,
        requestWeight: data.requestWeight?.trim() || undefined,
        loadingWarehouseId: data.loadingWarehouseId && data.loadingWarehouseId !== '' && data.loadingWarehouseId !== '__none__' 
          ? (() => {
              const parsed = parseInt(data.loadingWarehouseId, 10);
              return isNaN(parsed) ? undefined : parsed;
            })()
          : undefined,
        loadingSchedule: data.loadingSchedule || undefined,
        loadingScheduleTime: data.loadingScheduleTime?.trim() || undefined,
        unloadingPostalCode: finalUnloadingPostalCode,
        unloadingAddress: finalUnloadingAddress,
        unloadingAddressDetail: finalUnloadingAddressDetail,
        unloadingRegion: finalUnloadingRegion,
        unloadingCity: finalUnloadingCity,
        unloadingScheduleDate: data.unloadingScheduleDate || undefined,
        unloadingScheduleTime: data.unloadingScheduleTime?.trim() || undefined,
        freightPaymentType: data.freightPaymentType?.trim() || undefined,
        requestBL: data.requestBL?.trim() || undefined,
        requestContainer: data.requestContainer?.trim() || undefined,
        // orderNumber는 백엔드에서 자동 생성되므로 전송하지 않음 (undefined 또는 빈 문자열)
        orderNumber: undefined,
        notes: data.notes?.trim() || undefined,
        companyName: data.companyName?.trim() || undefined,
        representativeName: data.representativeName?.trim() || undefined,
        phone: data.phone?.trim() || undefined,
        dispatchCompanyId:
          data.dispatchCompanyId === '__none__' || data.dispatchCompanyId === ''
            ? null
            : (() => {
                const parsed = parseInt(data.dispatchCompanyId, 10);
                return isNaN(parsed) ? undefined : parsed;
              })(),
        unloadingCompanyId: data.unloadingCompanyId && data.unloadingCompanyId !== '' && data.unloadingCompanyId !== '__none__' && data.unloadingCompanyId !== '__direct__'
          ? (() => {
              const parsed = parseInt(data.unloadingCompanyId, 10);
              return isNaN(parsed) ? undefined : parsed;
            })()
          : undefined,
        directUnloadingContact: data.unloadingCompanyId === '__direct__' ? (data.directUnloadingContact?.trim() || undefined) : undefined,
        status: (data.status || 'DRAFT') as 'DRAFT' | 'DISPATCHING' | 'DISPATCH_COMPLETED' | 'ASSIGNED' | 'LOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED' | 'UNLOADING_COMPLETED',
        // 고객 정보 업데이트용 필드
        customerPostalCode: data.customerPostalCode?.trim() || undefined,
        customerAddress: data.customerAddress?.trim() || undefined,
        customerAddressDetail: data.customerAddressDetail?.trim() || undefined,
        customerRegion: data.customerRegion && data.customerRegion !== '__none__' ? data.customerRegion : undefined,
        customerCity: data.customerCity && data.customerCity !== '__none__' ? data.customerCity : undefined,
        // loadingItems 전송 (관리자 수정 시 작업 정보는 전송하지 않음 - 상차 업체 입력 정보 보호)
        loadingItems: loadingItems.map((item, index) => {
          // 기존 데이터에서 해당 loadingItem 찾기 (id 기준)
          const existingItem = mode === 'edit' && vehicleDispatch?.loadingItems
            ? vehicleDispatch.loadingItems.find(
                (existing) => existing.id?.toString() === item.id
              )
            : undefined;
          
          return {
            loadingWarehouseId: item.loadingWarehouseId ? parseInt(item.loadingWarehouseId, 10) : undefined,
            requestBL: item.requestBL?.trim() || undefined,
            requestContainer: item.requestContainer?.trim() || undefined,
            // 작업 정보는 관리자가 수정할 수 없음 (상차 업체 입력 정보 보호)
            // workBL, workContainer, workWeight는 전송하지 않음 (undefined로 전송하면 백엔드에서 업데이트하지 않음)
            // 상태: 기존 상태 유지, 없으면 PENDING
            status: (existingItem?.status as 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED' | undefined) || 'PENDING' as const,
            order: index + 1,
            notes: item.notes?.trim() || existingItem?.notes || undefined,
          };
        }),
      };
      
      // 재배차 요청 로직: FAILED/RESCHEDULED → DRAFT
      if (mode === 'edit' && vehicleDispatch && 
          (vehicleDispatch.status === 'FAILED' || vehicleDispatch.status === 'RESCHEDULED')) {
        (submitData as UpdateVehicleDispatchDto).status = 'DRAFT';
        if (data.reprocessReason?.trim()) {
          (submitData as UpdateVehicleDispatchDto).reprocessReason = data.reprocessReason.trim();
        }
      }
      
      console.log('[FORM] 전송할 데이터:', submitData);
      console.log('[FORM] 각 필드 상세:');
      Object.entries(submitData).forEach(([key, value]) => {
        console.log(`  ${key}:`, value, `(type: ${typeof value})`);
      });

      if (mode === 'create') {
        await createMutation.mutateAsync(submitData);
        toast({
          title: '배차 추가 완료',
          description: '배차 정보를 성공적으로 추가했습니다.',
        });
      } else if (vehicleDispatch) {
        await updateMutation.mutateAsync({ id: vehicleDispatch.id, data: submitData });
        // 재배차 요청인 경우 다른 메시지 표시
        const isReprocessing = (vehicleDispatch.status === 'FAILED' || vehicleDispatch.status === 'RESCHEDULED') && 
                               (submitData as UpdateVehicleDispatchDto).status === 'DRAFT';
        toast({
          title: isReprocessing ? '재배차 요청 완료' : '배차 수정 완료',
          description: isReprocessing 
            ? '재배차 요청 상태로 변경되었습니다.' 
            : '배차 정보를 성공적으로 수정했습니다.',
        });
      }

      if (onSubmit) {
        await onSubmit(submitData);
      }
      
      console.log('[FORM] onSubmit 완료');
      onOpenChange(false);
      reset();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        '배차 정보를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: '저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeUnloadingAddressSearch = React.useCallback(() => {
    setUnloadingAddressModalOpen(false);
  }, []);

  const closeCustomerAddressSearch = React.useCallback(() => {
    setCustomerAddressModalOpen(false);
  }, []);

  const handleDrawerOpenChange = React.useCallback((isOpen: boolean) => {
    if (!isOpen && (unloadingAddressModalOpen || customerAddressModalOpen)) {
      return;
    }
    onOpenChange(isOpen);
  }, [unloadingAddressModalOpen, customerAddressModalOpen, onOpenChange]);

  // 전화번호로 고객 정보 조회
  const performLookup = React.useCallback(
    async (rawPhone: string) => {
      const phoneValue = rawPhone?.trim();
      if (!phoneValue) {
        return;
      }
      setValue('phone', formatPhone(phoneValue), { shouldDirty: true });
      try {
        const result = await lookupMutation.mutateAsync(phoneValue);
        if (result.customer) {
          setValue('companyName', result.customer.companyName ?? '', { shouldDirty: true });
          setValue('representativeName', result.customer.ceo ?? '', { shouldDirty: true });
          // 고객 주소 정보를 폼 필드에 저장
          setValue('customerPostalCode', result.customer.customerPostalCode ?? '', { shouldDirty: true });
          setValue('customerAddress', result.customer.customerAddress ?? '', { shouldDirty: true });
          setValue('customerAddressDetail', result.customer.addressDetail ?? '', { shouldDirty: true });
          if (result.customer.region) {
            setValue('customerRegion', result.customer.region, { shouldDirty: true });
          }
          if (result.customer.customerCity) {
            setPendingCustomerCity(result.customer.customerCity);
          } else {
            setValue('customerCity', '', { shouldDirty: true });
            setPendingCustomerCity(null);
          }
          toast({
            title: '고객 정보 조회 완료',
            description: '고객 정보가 자동으로 입력되었습니다.',
          });
        } else {
          // 고객 정보 초기화
          setValue('customerPostalCode', '', { shouldDirty: true });
          setValue('customerAddress', '', { shouldDirty: true });
          setValue('customerAddressDetail', '', { shouldDirty: true });
          setValue('customerRegion', '', { shouldDirty: true });
          setValue('customerCity', '', { shouldDirty: true });
          toast({
            title: '기존 고객 없음',
            description: '해당 전화번호로 등록된 고객이 없습니다. 새로 입력해주세요.',
          });
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '고객 조회 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        toast({
          title: '조회 실패',
          description: message,
          variant: 'destructive',
        });
      }
    },
    [formatPhone, lookupMutation, setValue, setPendingCustomerCity, syncUnloadingAddress, toast],
  );

  const handleLookup = React.useCallback(async () => {
    const phone = getValues('phone');
    if (!phone) {
      toast({
        title: '전화번호 입력 필요',
        description: '전화번호를 입력한 후 조회해주세요.',
        variant: 'destructive',
      });
      return;
    }
    await performLookup(phone);
  }, [getValues, performLookup, toast]);

  const resetCompanySearchState = React.useCallback(() => {
    setCompanySearchResults([]);
    setCompanySearchError(null);
    setCompanySearchTerm('');
    setCompanySearchLoading(false);
    setCompanySearchAttempted(false);
  }, []);

  const handleCompanySearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setCompanySearchOpen(nextOpen);
      if (!nextOpen) {
        resetCompanySearchState();
      }
    },
    [resetCompanySearchState],
  );

  const handleCompanySearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const keyword = companySearchTerm.trim();
      if (keyword.length < 2) {
        setCompanySearchError('두 글자 이상 입력해주세요.');
        setCompanySearchResults([]);
        setCompanySearchAttempted(false);
        return;
      }
      setCompanySearchAttempted(true);
      setCompanySearchLoading(true);
      setCompanySearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/company', {
          params: { keyword },
        });
        setCompanySearchResults(response.data);
        if (response.data.length === 0) {
          setCompanySearchError('일치하는 업체가 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        setCompanySearchError(message);
        setCompanySearchResults([]);
      } finally {
        setCompanySearchLoading(false);
      }
    },
    [companySearchTerm],
  );

  const handleSelectCompany = React.useCallback(
    (item: CompanySearchResult) => {
      handleCompanySearchOpenChange(false);
      if (item.companyName) {
        setValue('companyName', item.companyName, { shouldDirty: true });
      }
      if (item.ceo) {
        setValue('representativeName', item.ceo, { shouldDirty: true });
      }
      if (item.phone) {
        setValue('phone', formatPhone(item.phone), { shouldDirty: true });
      } else {
        setValue('phone', '', { shouldDirty: true });
        toast({
          title: '전화번호 정보 없음',
          description: '선택한 업체에는 전화번호가 없어 기본 정보만 채웠습니다.',
        });
      }
      // 주소·지역 등 검색 결과의 전체 고객정보를 폼에 반영 (저장 시 null 방지)
      setValue('customerRegion', item.region ?? '', { shouldDirty: true });
      setValue('customerPostalCode', item.customerPostalCode ?? '', { shouldDirty: true });
      setValue('customerAddress', item.customerAddress ?? '', { shouldDirty: true });
      setValue('customerAddressDetail', item.addressDetail ?? '', { shouldDirty: true });
      if (item.customerCity) {
        setPendingCustomerCity(item.customerCity);
      } else {
        setValue('customerCity', '', { shouldDirty: true });
      }
    },
    [handleCompanySearchOpenChange, setValue, formatPhone, toast],
  );

  // 전화번호 검색 관련 핸들러
  const resetPhoneSearchState = React.useCallback(() => {
    setPhoneSearchResults([]);
    setPhoneSearchError(null);
    setPhoneSearchTerm('');
    setPhoneSearchLoading(false);
    setPhoneSearchAttempted(false);
  }, []);

  const handlePhoneSearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setPhoneSearchOpen(nextOpen);
      if (!nextOpen) {
        resetPhoneSearchState();
      }
    },
    [resetPhoneSearchState],
  );

  const handlePhoneSearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const phone = phoneSearchTerm.trim();
      if (!phone) {
        setPhoneSearchError('전화번호를 입력해주세요.');
        setPhoneSearchResults([]);
        setPhoneSearchAttempted(false);
        return;
      }
      setPhoneSearchAttempted(true);
      setPhoneSearchLoading(true);
      setPhoneSearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/phone', {
          params: { phone },
        });
        setPhoneSearchResults(response.data);
        if (response.data.length === 0) {
          setPhoneSearchError('일치하는 고객이 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        setPhoneSearchError(message);
        setPhoneSearchResults([]);
      } finally {
        setPhoneSearchLoading(false);
      }
    },
    [phoneSearchTerm],
  );

  const handleSelectPhone = React.useCallback(
    (item: CompanySearchResult) => {
      handlePhoneSearchOpenChange(false);
      if (item.companyName) {
        setValue('companyName', item.companyName, { shouldDirty: true });
      }
      if (item.ceo) {
        setValue('representativeName', item.ceo, { shouldDirty: true });
      }
      if (item.phone) {
        setValue('phone', formatPhone(item.phone), { shouldDirty: true });
      }
      // 주소·지역 등 검색 결과의 전체 고객정보를 폼에 반영 (저장 시 null 방지)
      setValue('customerRegion', item.region ?? '', { shouldDirty: true });
      setValue('customerPostalCode', item.customerPostalCode ?? '', { shouldDirty: true });
      setValue('customerAddress', item.customerAddress ?? '', { shouldDirty: true });
      setValue('customerAddressDetail', item.addressDetail ?? '', { shouldDirty: true });
      if (item.customerCity) {
        setPendingCustomerCity(item.customerCity);
      } else {
        setValue('customerCity', '', { shouldDirty: true });
      }
    },
    [handlePhoneSearchOpenChange, setValue, formatPhone],
  );
  
  const customerPostalCodeValue = watch('customerPostalCode');
  const customerAddressValue = watch('customerAddress');
  const customerAddressDetailValue = watch('customerAddressDetail');
  const customerRegionValue = watch('customerRegion') || '__none__';
  const customerCityValue = watch('customerCity') || '__none__';
  
  const customerRegionId = React.useMemo(() => {
    if (!customerRegionValue || customerRegionValue === '__none__') return undefined;
    return regions?.find((r) => r.name === customerRegionValue)?.id;
  }, [customerRegionValue, regions]);
  const { data: customerCities, isLoading: customerCitiesLoading } = useCities(customerRegionId);
  
  // 시군구 목록이 로드된 후 pending 시군구 설정
  React.useEffect(() => {
    if (pendingCustomerCity && customerRegionId && customerCities && !customerCitiesLoading) {
      // 시군구 목록에 해당 시군구가 있는지 확인
      const matched = customerCities.find((c) => c.name === pendingCustomerCity);
      if (matched) {
        setValue('customerCity', matched.name, { shouldDirty: true, shouldValidate: true });
        setPendingCustomerCity(null);
      } else {
        // 매칭되는 시군구가 없으면 빈 값으로 설정
        setValue('customerCity', '', { shouldDirty: true, shouldValidate: true });
        setPendingCustomerCity(null);
      }
    }
  }, [pendingCustomerCity, customerRegionId, customerCities, customerCitiesLoading, setValue]);

  // 고객 정보 조회 후 시군구를 pending 상태로 저장
  React.useEffect(() => {
    if (mode === 'edit' && vehicleDispatch?.phone && lookupMutation.isSuccess && lookupMutation.data?.customer?.customerCity) {
      const cityName = lookupMutation.data.customer.customerCity;
      // 지역이 설정되어 있고 시군구 목록이 로드되었으면 바로 설정, 아니면 pending으로 저장
      if (customerRegionId && customerCities && !customerCitiesLoading) {
        const cityExists = customerCities.some((c) => c.name === cityName);
        if (cityExists) {
          setValue('customerCity', cityName, { shouldDirty: false });
        } else {
          setPendingCustomerCity(cityName);
        }
      } else {
        setPendingCustomerCity(cityName);
      }
    }
  }, [mode, vehicleDispatch?.phone, lookupMutation.isSuccess, lookupMutation.data, customerRegionId, customerCities, customerCitiesLoading, setValue]);

  const handleCustomerAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    // 모달을 먼저 열어서 contentElement가 준비되도록 함
    setCustomerAddressModalOpen(true);

    // 다음 틱에서 embed 실행
    setTimeout(() => {
      const contentElement = customerAddressContentRef.current;
      if (!contentElement) {
        setCustomerAddressModalOpen(false);
        toast({
          title: '오류',
          description: '주소 검색 UI를 불러올 수 없습니다.',
          className: 'border border-red-300 text-red-600',
        });
        return;
      }

      if (!window.daum?.Postcode) {
        setCustomerAddressModalOpen(false);
        toast({
          title: '주소검색 준비 중',
          description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
          className: 'border border-yellow-300 text-yellow-600',
        });
        return;
      }

      contentElement.innerHTML = '';

      const Postcode = window.daum.Postcode;

      new Postcode({
        oncomplete: (data: DaumPostcodeData) => {
          let fullAddress = data.address;
          let extraAddress = '';

          if (data.userSelectedType === 'R') {
            fullAddress = data.roadAddress;
          } else {
            fullAddress = data.jibunAddress;
          }

          if (data.userSelectedType === 'R') {
            if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) {
              extraAddress += data.bname;
            }
            if (data.buildingName !== '' && data.apartment === 'Y') {
              extraAddress += extraAddress !== '' ? ', ' + data.buildingName : data.buildingName;
            }
            if (extraAddress !== '') {
              extraAddress = ' (' + extraAddress + ')';
            }
          }

          setValue('customerPostalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
          setValue('customerAddress', fullAddress + extraAddress, { shouldDirty: true, shouldValidate: true });
          if (data.sido && regions) {
            // 주소 검색 API에서 받은 지역명을 DB에 저장된 지역명으로 정규화
            const normalizedRegionName = normalizeRegionNameFromAddress(data.sido);
            const matchedRegion = regions.find((r) => r.name === normalizedRegionName);
            if (matchedRegion) {
              setValue('customerRegion', matchedRegion.name, { shouldDirty: true, shouldValidate: true });
            } else {
              // 정규화된 이름으로도 찾지 못하면 정규화된 이름을 그대로 사용
              setValue('customerRegion', normalizedRegionName, { shouldDirty: true, shouldValidate: true });
            }
          }
          if (data.sigungu) {
            // 시군구 검색을 위해 정규화된 지역명으로 regionId 찾기
            const normalizedRegionName = data.sido ? normalizeRegionNameFromAddress(data.sido) : null;
            const regionId = normalizedRegionName ? regions?.find((r) => r.name === normalizedRegionName)?.id : undefined;
            if (regionId && customerCities) {
              const matchedCity = customerCities.find((c) => c.name === data.sigungu);
              if (matchedCity) {
                setValue('customerCity', matchedCity.name, { shouldDirty: true, shouldValidate: true });
              } else {
                setValue('customerCity', data.sigungu, { shouldDirty: true, shouldValidate: true });
              }
            } else {
              setValue('customerCity', data.sigungu || '', { shouldDirty: true, shouldValidate: true });
            }
          }

          closeCustomerAddressSearch();
        },
        width: '100%',
        height: '100%',
      }).embed(contentElement);
    }, 100);
  }, [closeCustomerAddressSearch, regions, customerCities, setValue, toast]);

  const requestVehicleValue = watch('requestVehicle');
  const requestWeightValue = watch('requestWeight');
  const loadingWarehouseIdValue = watch('loadingWarehouseId');
  const loadingScheduleValue = watch('loadingSchedule');
  const loadingScheduleTimeValue = watch('loadingScheduleTime');
  const unloadingPostalCodeValue = watch('unloadingPostalCode');
  const unloadingAddressValue = watch('unloadingAddress');
  const unloadingAddressDetailValue = watch('unloadingAddressDetail');
  const unloadingScheduleDateValue = watch('unloadingScheduleDate');
  const unloadingScheduleTimeValue = watch('unloadingScheduleTime');
  const freightPaymentTypeValue = watch('freightPaymentType');
  const companyNameValue = watch('companyName');
  const representativeNameValue = watch('representativeName');
  const phoneValue = watch('phone');
  const unloadingRegionValue = watch('unloadingRegion') || '__none__';
  
  const unloadingRegionId = React.useMemo(() => {
    if (!unloadingRegionValue || unloadingRegionValue === '__none__') return undefined;
    return regions?.find((r) => r.name === unloadingRegionValue)?.id;
  }, [unloadingRegionValue, regions]);
  const { data: unloadingCities } = useCities(unloadingRegionId);

  // 고객 주소와 동일 체크박스 변경 시 하차지 주소 동기화
  // 고객 주소가 변경될 때도 동기화 (체크박스가 체크되어 있을 때만)
  React.useEffect(() => {
    if (syncUnloadingAddress) {
      setValue('unloadingPostalCode', customerPostalCodeValue || '', { shouldDirty: true });
      setValue('unloadingAddress', customerAddressValue || '', { shouldDirty: true });
      setValue('unloadingAddressDetail', customerAddressDetailValue || '', { shouldDirty: true });
      if (customerRegionValue && customerRegionValue !== '__none__') {
        setValue('unloadingRegion', customerRegionValue, { shouldDirty: true });
      } else {
        setValue('unloadingRegion', '', { shouldDirty: true });
      }
      // 시/군/구는 지역이 설정되고 목록이 로드된 후에 설정 (별도 useEffect에서 처리)
    }
  }, [syncUnloadingAddress, customerPostalCodeValue, customerAddressValue, customerAddressDetailValue, customerRegionValue, setValue]);

  // 하차지 지역이 설정되고 시/군/구 목록이 로드된 후, 고객 주소와 동일 체크 시 시/군/구 동기화
  React.useEffect(() => {
    if (syncUnloadingAddress && customerCityValue && customerCityValue !== '__none__' && unloadingCities) {
      // 시/군/구 목록에서 고객 시/군/구와 일치하는 항목이 있는지 확인
      const matchedCity = unloadingCities.find((c) => c.name === customerCityValue);
      if (matchedCity) {
        setValue('unloadingCity', customerCityValue, { shouldDirty: true });
      }
    }
  }, [syncUnloadingAddress, customerCityValue, unloadingCities, setValue]);

  const handleUnloadingAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    // 모달을 먼저 열어서 contentElement가 준비되도록 함
    setUnloadingAddressModalOpen(true);

    // 다음 틱에서 embed 실행
    setTimeout(() => {
      const contentElement = unloadingAddressContentRef.current;
      if (!contentElement) {
        setUnloadingAddressModalOpen(false);
        toast({
          title: '오류',
          description: '주소 검색 UI를 불러올 수 없습니다.',
          className: 'border border-red-300 text-red-600',
        });
        return;
      }

      if (!window.daum?.Postcode) {
        setUnloadingAddressModalOpen(false);
        toast({
          title: '주소검색 준비 중',
          description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
          className: 'border border-yellow-300 text-yellow-600',
        });
        return;
      }

      contentElement.innerHTML = '';

      const Postcode = window.daum.Postcode;

      new Postcode({
        oncomplete: (data: DaumPostcodeData) => {
          let fullAddress = data.address;
          let extraAddress = '';

          if (data.userSelectedType === 'R') {
            fullAddress = data.roadAddress;
          } else {
            fullAddress = data.jibunAddress;
          }

          if (data.userSelectedType === 'R') {
            if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) {
              extraAddress += data.bname;
            }
            if (data.buildingName !== '' && data.apartment === 'Y') {
              extraAddress += extraAddress !== '' ? ', ' + data.buildingName : data.buildingName;
            }
            if (extraAddress !== '') {
              extraAddress = ' (' + extraAddress + ')';
            }
          }

          setValue('unloadingPostalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddress', fullAddress + extraAddress, { shouldDirty: true, shouldValidate: true });
          if (data.sido && regions) {
            // 주소 검색 API에서 받은 지역명을 DB에 저장된 지역명으로 정규화
            const normalizedRegionName = normalizeRegionNameFromAddress(data.sido);
            const matchedRegion = regions.find((r) => r.name === normalizedRegionName);
            if (matchedRegion) {
              setValue('unloadingRegion', matchedRegion.name, { shouldDirty: true, shouldValidate: true });
            } else {
              // 정규화된 이름으로도 찾지 못하면 정규화된 이름을 그대로 사용
              setValue('unloadingRegion', normalizedRegionName, { shouldDirty: true, shouldValidate: true });
            }
          }
          if (data.sigungu) {
            // 시군구 검색을 위해 정규화된 지역명으로 regionId 찾기
            const normalizedRegionName = data.sido ? normalizeRegionNameFromAddress(data.sido) : null;
            const regionId = normalizedRegionName ? regions?.find((r) => r.name === normalizedRegionName)?.id : undefined;
            if (regionId && unloadingCities) {
              const matchedCity = unloadingCities.find((c) => c.name === data.sigungu);
              if (matchedCity) {
                setValue('unloadingCity', matchedCity.name, { shouldDirty: true, shouldValidate: true });
              } else {
                setValue('unloadingCity', data.sigungu, { shouldDirty: true, shouldValidate: true });
              }
            } else {
              setValue('unloadingCity', data.sigungu || '', { shouldDirty: true, shouldValidate: true });
            }
          }
          closeUnloadingAddressSearch();
        },
        width: '100%',
        height: '100%',
      }).embed(contentElement);
    }, 100);
  }, [setValue, toast, closeUnloadingAddressSearch, regions, unloadingCities]);

  const requestVehicleOptions =
    requestVehicleCodes?.map((code) => ({
      value: code.value ?? code.name ?? '',
      label: code.name ?? code.value ?? '',
    })) ?? [];

  const warehouseOptions = warehouses.map((wh) => ({
    value: wh.id.toString(),
    label: wh.name,
  }));

  const unloadingCompanyOptions = unloadingCompanies.map((uc) => ({
    value: uc.id.toString(),
    label: `${uc.representativeName} (${uc.contact})${uc.notes ? ` - ${uc.notes}` : ''}`,
  }));

  return (
    <>
      <Drawer open={open} onOpenChange={handleDrawerOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: isMobile ? '100vw' : '900px', maxWidth: isMobile ? '100vw' : '95vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>{mode === 'create' ? '배차 추가' : '배차 수정'}</DrawerTitle>
                <DrawerDescription>
                  {mode === 'create' ? '새로운 배차 정보를 추가합니다.' : '배차 정보를 수정합니다.'}
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <form onSubmit={handleSubmit(onSubmitInternal)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-6">
                {/* 고객 정보 */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">고객 정보</h3>
                    <p className="text-xs text-muted-foreground">기본 고객 정보와 주소를 입력합니다.</p>
                  </div>
                  {/* 기본 정보 */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">전화번호 *</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            id="phone"
                            type="text"
                            value={phoneValue}
                            onChange={(e) => {
                              const formatted = formatPhone(e.target.value);
                              setValue('phone', formatted, { shouldValidate: true });
                            }}
                            placeholder="010-1234-5678"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const currentPhone = getValues('phone');
                            if (currentPhone) {
                              setPhoneSearchTerm(currentPhone);
                            }
                            setPhoneSearchOpen(true);
                          }}
                          className="flex-shrink-0"
                          size="icon"
                          title="전화번호 검색"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                      {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyName">업체명 / 농장명</Label>
                      <div className="flex gap-2">
                        <Input
                          id="companyName"
                          value={companyNameValue}
                          onChange={(e) => setValue('companyName', e.target.value, { shouldValidate: true })}
                          placeholder="업체명"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const currentCompanyName = getValues('companyName');
                            if (currentCompanyName) {
                              setCompanySearchTerm(currentCompanyName);
                            }
                            setCompanySearchOpen(true);
                          }}
                          title="업체 검색"
                        >
                          <Building2 className="h-4 w-4" />
                          <span className="sr-only">업체 검색</span>
                        </Button>
                      </div>
                      {errors.companyName && (
                        <p className="text-xs text-destructive">{errors.companyName.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="representativeName">대표자</Label>
                      <Input
                        id="representativeName"
                        value={representativeNameValue}
                        onChange={(e) => setValue('representativeName', e.target.value, { shouldValidate: true })}
                        placeholder="대표자명"
                      />
                      {errors.representativeName && (
                        <p className="text-xs text-destructive">{errors.representativeName.message}</p>
                      )}
                    </div>
                  </div>

                  {/* 고객 주소 및 지역 */}
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="text-sm font-semibold">고객 주소</h4>
                      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <Checkbox
                          checked={syncUnloadingAddress}
                          onCheckedChange={(checked) => setSyncUnloadingAddress(checked === true)}
                        />
                        <span>하차지 주소와 동일</span>
                      </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="customerPostalCode">우편번호</Label>
                        <div className="flex gap-2">
                          <Input
                            id="customerPostalCode"
                            value={customerPostalCodeValue || ''}
                            readOnly
                            onChange={() => {}}
                            placeholder="우편번호"
                            className="cursor-pointer bg-muted"
                            onClick={handleCustomerAddressSearch}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCustomerAddressSearch}
                            className="flex-shrink-0"
                            size="icon"
                            title="주소검색"
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="hidden md:block" />
                      <div className="space-y-2">
                        <Label htmlFor="customerRegion">지역</Label>
                        <Select
                          value={customerRegionValue}
                          onValueChange={(v) => {
                            const nextValue = v === '__none__' ? undefined : v;
                            setValue('customerRegion', nextValue || '', { shouldDirty: true });
                            if (v === '__none__') {
                              setValue('customerCity', '', { shouldDirty: true });
                            }
                          }}
                        >
                          <SelectTrigger id="customerRegion">
                            <SelectValue placeholder="지역을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {regions?.map((region) => (
                              <SelectItem key={region.id} value={region.name}>
                                {region.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customerCity">시/군/구</Label>
                        <Select
                          value={watch('customerCity') || '__none__'}
                          onValueChange={(value) =>
                            setValue('customerCity', value === '__none__' ? '' : value, { shouldDirty: true })
                          }
                          disabled={!customerRegionValue || customerRegionValue === '__none__'}
                        >
                          <SelectTrigger id="customerCity">
                            <SelectValue
                              placeholder={customerRegionValue === '__none__' ? '지역 선택 후' : '시/군/구'}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {customerCities?.map((city, index) => {
                              const cityKey =
                                city?.id != null && city.id !== undefined
                                  ? `customer-city-${city.id}`
                                  : `customer-city-${customerRegionId ?? 'all'}-${index}`;
                              return (
                                <SelectItem key={cityKey} value={city.name}>
                                  {city.name}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="customerAddress">주소</Label>
                        <Input
                          id="customerAddress"
                          value={customerAddressValue || ''}
                          readOnly
                          onChange={() => {}}
                          placeholder="주소"
                          className="cursor-pointer bg-muted"
                          onClick={handleCustomerAddressSearch}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customerAddressDetail">상세주소</Label>
                        <Input
                          id="customerAddressDetail"
                          value={customerAddressDetailValue || ''}
                          onChange={(e) => setValue('customerAddressDetail', e.target.value, { shouldValidate: true })}
                          placeholder="상세주소"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 하차지 주소 */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">하차지 주소</h3>
                    {syncUnloadingAddress ? (
                      <p className="text-xs text-muted-foreground">
                        고객 주소와 동일하게 설정됩니다.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        고객 주소와 다른 경우 별도로 입력하세요.
                      </p>
                    )}
                  </div>
                  {syncUnloadingAddress ? (
                    /* 동기화된 하차지 주소 (읽기 전용) */
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label>우편번호</Label>
                          <Input
                            value={unloadingPostalCodeValue || '-'}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                        <div className="hidden md:block" />
                        <div className="space-y-2">
                          <Label>지역</Label>
                          <Input
                            value={unloadingRegionValue !== '__none__' ? unloadingRegionValue : '-'}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>시/군/구</Label>
                          <Input
                            value={watch('unloadingCity') && watch('unloadingCity') !== '__none__' ? watch('unloadingCity') : '-'}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>주소</Label>
                          <Input
                            value={unloadingAddressValue || '-'}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>상세주소</Label>
                          <Input
                            value={unloadingAddressDetailValue || '-'}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* 하차지 주소 직접 입력 */
                    <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="unloadingPostalCode">우편번호</Label>
                        <div className="flex gap-2">
                          <Input
                            id="unloadingPostalCode"
                            value={unloadingPostalCodeValue}
                            onChange={() => {}}
                            placeholder="우편번호"
                            className="cursor-pointer bg-muted"
                            onClick={handleUnloadingAddressSearch}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleUnloadingAddressSearch}
                            className="flex-shrink-0"
                            size="icon"
                            title="주소검색"
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="hidden md:block" />
                      <div className="space-y-2">
                        <Label htmlFor="unloadingRegion">지역</Label>
                        <Select
                          value={unloadingRegionValue}
                          onValueChange={(v) => {
                            const nextValue = v === '__none__' ? undefined : v;
                            setValue('unloadingRegion', nextValue || '', { shouldDirty: true });
                            if (v === '__none__') {
                              setValue('unloadingCity', '', { shouldDirty: true });
                            }
                          }}
                        >
                          <SelectTrigger id="unloadingRegion">
                            <SelectValue placeholder="지역을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {regions?.map((region) => (
                              <SelectItem key={region.id} value={region.name}>
                                {region.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unloadingCity">시/군/구</Label>
                        <Select
                          value={watch('unloadingCity') || '__none__'}
                          onValueChange={(value) =>
                            setValue('unloadingCity', value === '__none__' ? '' : value, { shouldDirty: true })
                          }
                          disabled={!unloadingRegionValue || unloadingRegionValue === '__none__'}
                        >
                          <SelectTrigger id="unloadingCity">
                            <SelectValue
                              placeholder={unloadingRegionValue === '__none__' ? '지역 선택 후' : '시/군/구'}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {unloadingCities?.map((city, index) => {
                              const cityKey =
                                city?.id != null && city.id !== undefined
                                  ? `unloading-city-${city.id}`
                                  : `unloading-city-${unloadingRegionId ?? 'all'}-${index}`;
                              return (
                                <SelectItem key={cityKey} value={city.name}>
                                  {city.name}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="unloadingAddress">주소</Label>
                        <Input
                          id="unloadingAddress"
                          value={unloadingAddressValue}
                          onChange={() => {}}
                          placeholder="주소"
                          className="cursor-pointer bg-muted"
                          onClick={handleUnloadingAddressSearch}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unloadingAddressDetail">상세주소</Label>
                        <Input
                          id="unloadingAddressDetail"
                          value={unloadingAddressDetailValue}
                          onChange={(e) => setValue('unloadingAddressDetail', e.target.value, { shouldValidate: true })}
                          placeholder="상세주소"
                        />
                      </div>
                    </div>
                  </div>
                  )}
                </div>

                <div className="border-t border-border my-6" />

                {/* 배차 정보 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">배차 정보</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="dispatchCompanyId">배차 업체</Label>
                      <Select
                        value={watch('dispatchCompanyId') || '__none__'}
                        onValueChange={(value) => {
                          setValue('dispatchCompanyId', value === '__none__' ? '' : value, { shouldValidate: true });
                        }}
                      >
                        <SelectTrigger id="dispatchCompanyId">
                          <SelectValue placeholder="배차 업체 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">미할당</SelectItem>
                          {dispatchCompanies.map((dc) => (
                            <SelectItem key={dc.id} value={dc.id.toString()}>
                              {dc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.dispatchCompanyId && (
                        <p className="text-sm text-red-500">{errors.dispatchCompanyId.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="requestVehicle">요청 차량</Label>
                      <Select
                        value={requestVehicleValue || ''}
                        onValueChange={(value) => setValue('requestVehicle', value, { shouldValidate: true })}
                      >
                        <SelectTrigger id="requestVehicle">
                          <SelectValue placeholder="요청 차량 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {requestVehicleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.requestVehicle && (
                        <p className="text-sm text-red-500">{errors.requestVehicle.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="requestWeight">요청 중량</Label>
                      <Input
                        id="requestWeight"
                        type="text"
                        value={requestWeightValue}
                        onChange={(e) => setValue('requestWeight', e.target.value, { shouldValidate: true })}
                        placeholder="중량 입력"
                      />
                      {errors.requestWeight && (
                        <p className="text-sm text-red-500">{errors.requestWeight.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="orderNumber">운송번호</Label>
                      <Input
                        id="orderNumber"
                        size="sm"
                        placeholder="자동 생성됨"
                        value={watch('orderNumber') || ''}
                        readOnly
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">운송번호는 자동으로 생성됩니다.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="status">상태</Label>
                      <Select
                        value={watch('status') || 'DRAFT'}
                        onValueChange={(value) => setValue('status', value, { shouldValidate: true })}
                      >
                        <SelectTrigger id="status">
                          <SelectValue placeholder="상태 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {React.useMemo(() => {
                            if (!statusCodes) return [];
                            // 순서: 배차 요청 → 배차 중 → 배차 완료 → 배차 실패 → 일정 조정
                            const statusOrder = ['DRAFT', 'DISPATCHING', 'DISPATCH_COMPLETED', 'FAILED', 'RESCHEDULED'];
                            return (statusCodes ?? [])
                              .filter((code) => code.value && statusOrder.includes(code.value.toUpperCase()))
                              .sort((a, b) => {
                                const aIndex = statusOrder.indexOf(a.value?.toUpperCase() || '');
                                const bIndex = statusOrder.indexOf(b.value?.toUpperCase() || '');
                                if (aIndex === -1 && bIndex === -1) return 0;
                                if (aIndex === -1) return 1;
                                if (bIndex === -1) return -1;
                                return aIndex - bIndex;
                              })
                              .map((code) => (
                                <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                                  {code.name || code.value}
                                </SelectItem>
                              ));
                          }, [statusCodes])}
                        </SelectContent>
                      </Select>
                      {errors.status && (
                        <p className="text-sm text-red-500">{errors.status.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="freightPaymentType">운임</Label>
                      <Select
                        value={freightPaymentTypeValue || ''}
                        onValueChange={(value) => setValue('freightPaymentType', value, { shouldValidate: true })}
                      >
                        <SelectTrigger id="freightPaymentType">
                          <SelectValue placeholder="운임 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {(freightPaymentTypeCodes || []).map((code) => (
                            <SelectItem key={code.id} value={code.value || code.name}>
                              {code.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.freightPaymentType && (
                        <p className="text-sm text-red-500">{errors.freightPaymentType.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="loadingSchedule">상차 일정</Label>
                      <DatePicker
                        value={loadingScheduleValue || ''}
                        onChange={(value) => setValue('loadingSchedule', value || '', { shouldValidate: true })}
                        placeholder="상차 일정 선택"
                      />
                      {errors.loadingSchedule && (
                        <p className="text-sm text-red-500">{errors.loadingSchedule.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="loadingScheduleTime">상차 시간</Label>
                      <Input
                        id="loadingScheduleTime"
                        type="text"
                        value={loadingScheduleTimeValue}
                        onChange={(e) => setValue('loadingScheduleTime', e.target.value, { shouldValidate: true })}
                        placeholder="시간 입력 (예: 14:30)"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="unloadingScheduleDate">하차 일정</Label>
                      <DatePicker
                        value={unloadingScheduleDateValue || ''}
                        onChange={(value) => setValue('unloadingScheduleDate', value || '', { shouldValidate: true })}
                        placeholder="날짜 선택"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unloadingScheduleTime">하차 시간</Label>
                      <Input
                        id="unloadingScheduleTime"
                        type="text"
                        value={unloadingScheduleTimeValue}
                        onChange={(e) => setValue('unloadingScheduleTime', e.target.value, { shouldValidate: true })}
                        placeholder="시간 입력 (예: 14:30)"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-3">
                      <Label htmlFor="unloadingCompanyId">하차 업체</Label>
                      <Select
                        value={watch('unloadingCompanyId') || '__none__'}
                        onValueChange={(value) => {
                          setValue('unloadingCompanyId', value === '__none__' ? '' : value, { shouldValidate: true });
                        }}
                      >
                        <SelectTrigger id="unloadingCompanyId">
                          <SelectValue placeholder="하차 업체 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">미할당</SelectItem>
                          <SelectItem value="__direct__">직접 하차</SelectItem>
                          {unloadingCompanyOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.unloadingCompanyId && (
                        <p className="text-sm text-red-500">{errors.unloadingCompanyId.message}</p>
                      )}
                    </div>
                    {watch('unloadingCompanyId') === '__direct__' && (
                      <div className="space-y-2 md:col-span-1">
                        <Label htmlFor="directUnloadingContact">직접 하차 연락처</Label>
                        <Input
                          id="directUnloadingContact"
                          type="tel"
                          size="sm"
                          placeholder="010-1234-5678"
                          value={watch('directUnloadingContact') || ''}
                          onChange={(e) => {
                            const formatted = formatPhone(e.target.value);
                            setValue('directUnloadingContact', formatted, { shouldDirty: true, shouldValidate: true });
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 상차지, 요청 BL, 요청 컨테이너 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">상차지 정보</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newId = Date.now().toString();
                        setLoadingItems([...loadingItems, { id: newId, loadingWarehouseId: '', requestBL: '', requestContainer: '' }]);
                      }}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      추가
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {loadingItems.map((item, index) => (
                      <div key={item.id} className="p-4 border rounded-lg space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">항목 {index + 1}</span>
                          {loadingItems.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setLoadingItems(loadingItems.filter((i) => i.id !== item.id));
                              }}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid gap-4 md:grid-cols-4">
                          <div className="space-y-2">
                            <Label htmlFor={`loadingWarehouseId-${item.id}`}>상차지</Label>
                            <Select
                              value={item.loadingWarehouseId || ''}
                              onValueChange={(value) => {
                                const updated = loadingItems.map((i) =>
                                  i.id === item.id ? { ...i, loadingWarehouseId: value } : i
                                );
                                setLoadingItems(updated);
                              }}
                              disabled={warehousesLoading}
                            >
                              <SelectTrigger id={`loadingWarehouseId-${item.id}`}>
                                <SelectValue placeholder={warehousesLoading ? "로딩 중..." : "창고 선택"} />
                              </SelectTrigger>
                              <SelectContent>
                                {warehouseOptions.length === 0 ? (
                                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                    {warehousesLoading ? '로딩 중...' : '등록된 창고가 없습니다.'}
                                  </div>
                                ) : (
                                  warehouseOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`requestBL-${item.id}`}>요청 BL</Label>
                            <Input
                              id={`requestBL-${item.id}`}
                              type="text"
                              value={item.requestBL}
                              onChange={(e) => {
                                const updated = loadingItems.map((i) =>
                                  i.id === item.id ? { ...i, requestBL: e.target.value } : i
                                );
                                setLoadingItems(updated);
                              }}
                              placeholder="BL 번호 입력"
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor={`requestContainer-${item.id}`}>요청 컨테이너</Label>
                            <Input
                              id={`requestContainer-${item.id}`}
                              type="text"
                              value={item.requestContainer}
                              onChange={(e) => {
                                const updated = loadingItems.map((i) =>
                                  i.id === item.id ? { ...i, requestContainer: e.target.value } : i
                                );
                                setLoadingItems(updated);
                              }}
                              placeholder="컨테이너 번호 입력"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 비고 */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="notes">비고</Label>
                    <Textarea
                      id="notes"
                      value={watch('notes')}
                      onChange={(e) => setValue('notes', e.target.value, { shouldValidate: true })}
                      placeholder="비고 입력"
                      rows={3}
                    />
                  </div>
                </div>

                {/* 재배차 요청 사유 (재배차 요청인 경우에만 표시) */}
                {mode === 'edit' && vehicleDispatch && 
                 (vehicleDispatch.status === 'FAILED' || vehicleDispatch.status === 'RESCHEDULED') && (
                  <div className="space-y-4">
                    <Separator />
                    <div className="space-y-2">
                      <Label htmlFor="reprocessReason" className="text-base font-semibold">
                        재배차 요청 사유
                      </Label>
                      {vehicleDispatch.reprocessReason && (
                        <div className="p-3 bg-muted rounded-md">
                          <Label className="text-sm text-muted-foreground mb-2 block">기존 재배차 요청 사유:</Label>
                          <p className="text-sm whitespace-pre-wrap">{vehicleDispatch.reprocessReason}</p>
                        </div>
                      )}
                      <Textarea
                        id="reprocessReason"
                        value={watch('reprocessReason') || ''}
                        onChange={(e) => setValue('reprocessReason', e.target.value, { shouldValidate: true })}
                        placeholder="추가 재배차 요청 사유를 입력하세요"
                        rows={3}
                        className="mt-2"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DrawerFooter className="border-t border-border">
              <div className="flex gap-2 justify-end">
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onCancel?.();
                    }}
                    disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
                <Button
                  type="submit"
                  disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
                >
                  {(isSubmitting || createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {mode === 'create' 
                    ? '추가' 
                    : (vehicleDispatch && (vehicleDispatch.status === 'FAILED' || vehicleDispatch.status === 'RESCHEDULED')
                      ? '재배차 요청'
                      : '수정')}
                </Button>
              </div>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      {/* 고객 주소 검색 모달 */}
      {isClient &&
        createPortal(
          <div
            style={{
              pointerEvents: customerAddressModalOpen ? 'auto' : 'none',
              opacity: customerAddressModalOpen ? 1 : 0,
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 11000,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              transition: 'opacity 0.15s ease-in-out',
            }}
            onClick={closeCustomerAddressSearch}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '500px',
                height: '600px',
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">주소 검색</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeCustomerAddressSearch}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div ref={customerAddressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
            </div>
          </div>,
          document.body
        )}

      {/* 하차지 주소 검색 모달 */}
      {isClient &&
        createPortal(
          <div
            style={{
              pointerEvents: unloadingAddressModalOpen ? 'auto' : 'none',
              opacity: unloadingAddressModalOpen ? 1 : 0,
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 11000,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              transition: 'opacity 0.15s ease-in-out',
            }}
            onClick={closeUnloadingAddressSearch}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '500px',
                height: '600px',
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">주소 검색</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeUnloadingAddressSearch}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div ref={unloadingAddressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
            </div>
          </div>,
          document.body
        )}
      <Dialog open={companySearchOpen} onOpenChange={handleCompanySearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>업체명으로 고객 검색</DialogTitle>
            <DialogDescription>업체명 또는 대표자명을 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCompanySearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={companySearchTerm}
                onChange={(e) => setCompanySearchTerm(e.target.value)}
                placeholder="업체명 또는 대표자명"
                autoFocus
              />
              <Button type="submit" disabled={companySearchLoading}>
                {companySearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>
            {companySearchError && (
              <p className="text-sm text-destructive">{companySearchError}</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {companySearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : companySearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {companySearchAttempted ? '검색 결과가 없습니다.' : '업체명을 입력해 검색하세요.'}
                </div>
              ) : (
                companySearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelectCompany(item)}
                  >
                    <p className="font-medium">{item.companyName || '업체명 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(item.phone ?? '') || '전화번호 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={phoneSearchOpen} onOpenChange={handlePhoneSearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>전화번호로 고객 검색</DialogTitle>
            <DialogDescription>전화번호를 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePhoneSearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={phoneSearchTerm}
                onChange={(e) => setPhoneSearchTerm(e.target.value)}
                placeholder="010-1234-5678"
                autoFocus
              />
              <Button type="submit" disabled={phoneSearchLoading}>
                {phoneSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>
            {phoneSearchError && (
              <p className="text-sm text-destructive">{phoneSearchError}</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {phoneSearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : phoneSearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {phoneSearchAttempted ? '검색 결과가 없습니다.' : '전화번호를 입력해 검색하세요.'}
                </div>
              ) : (
                phoneSearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelectPhone(item)}
                  >
                    <p className="font-medium">{formatPhone(item.phone ?? '') || '전화번호 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.companyName || '업체명 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

