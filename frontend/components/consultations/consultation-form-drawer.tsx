'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/schedules/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Consultation,
  CreateConsultationPayload,
  useConsultationLookup,
} from '@/lib/hooks/use-consultations';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useRegions } from '@/lib/hooks/use-regions';
import { useCities } from '@/lib/hooks/use-cities';
import { useUsers } from '@/lib/hooks/use-users';
import api from '@/lib/api';
import { Loader2, Search, X, MapPin, XCircle, Save, Plus, ArrowLeft, FileText, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import dynamic from 'next/dynamic';
import type { DaumPostcodeData } from '@/types/daum-postcode';

const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });

const HistoryDetailRow = ({
  label,
  value,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  className?: string;
}) => (
  <div className={`space-y-1 text-sm ${className ?? ''}`}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-medium text-foreground break-words">{value ?? '-'}</p>
  </div>
);

const formatKoreanDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

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
  species?: string | null;
  feeding?: string | null;
  chamchamStatus?: string | null;
  operations?: { operation: string; operationSub?: string | null; herdSize?: number | null }[];
}

interface ConsultationFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  consultation: Consultation | null;
  onSubmit: (payload: CreateConsultationPayload) => Promise<void>;
  isSubmitting?: boolean;
  /** 로그인한 사용자 ID. 생성 시 자동으로 담당자 지정에 사용 */
  currentUserId?: number | null;
  /** 표시용 로그인 사용자 이름 (스케줄과 동일 UI) */
  currentUserName?: string | null;
  /** 수정 모드에서 취소 시 상세보기로 이동하는 콜백 */
  onCancel?: () => void;
}


const defaultValues: CreateConsultationPayload = {
  phone: '',
  companyName: '',
  ceo: '',
  region: '',
  customerPostalCode: '',
  customerAddress: '',
  customerCity: '',
  addressDetail: '',
  species: '',
  operation: '',
  herdSize: '',
  feeding: '',
  chamchamStatus: '',
  inquiryProduct: '',
  consultationDate: '',
  type: '',
  source: '',
  inOut: 'IN',
  productName: '',
  grade: '',
  requestedWeight: '',
  deliveryRegion: '',
  deliveryPostalCode: '',
  deliveryAddress: '',
  deliveryAddressDetail: '',
  deliveryCity: '',
  proposedPrice: '',
  notes: '',
  hasHandling: false,
  hasUnloading: false,
  managerId: null,
  replyStatus: '',
  replyAssigneeId: null,
  startedAt: '',
  endedAt: '',
  mainProduct: '',
  arrivalPrice: '',
};

/**
 * 상담 추가/수정 폼 드로어
 * - 좌우 분할 레이아웃: 왼쪽에 기존 상담 이력, 오른쪽에 입력 폼
 * - 오버레이 클릭으로 닫히지 않음 (실수 방지)
 * - 전화번호 조회로 고객 정보 및 상담 이력 자동 로드
 */
export function ConsultationFormDrawer({
  open,
  onOpenChange,
  mode,
  consultation,
  onSubmit,
  isSubmitting = false,
  currentUserId = null,
  currentUserName = null,
  onCancel,
}: ConsultationFormDrawerProps) {
  const lookupMutation = useConsultationLookup();
  const [history, setHistory] = React.useState<Consultation[]>([]);
  const [historySearch, setHistorySearch] = React.useState('');
  const [historyRange, setHistoryRange] = React.useState<{ start?: Date; end?: Date }>({});
  const [selectedHistory, setSelectedHistory] = React.useState<Consultation | null>(null);
  const [bulkInputText, setBulkInputText] = React.useState('');
  const [showBulkInput, setShowBulkInput] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CreateConsultationPayload>({
    defaultValues,
  });
  const selectedCustomerRegion = watch('region') || '__none__';
  const selectedDeliveryRegion = watch('deliveryRegion') || '__none__';
  const chamchamValue = watch('chamchamStatus') ?? '__none__';
  const speciesValue = watch('species') ?? '__none__';
  const feedingValue = watch('feeding') ?? '__none__';
  const typeValue = watch('type') ?? '__none__';
  const sourceValue = watch('source') ?? '__none__';
  const inOutValue = watch('inOut') || (mode === 'create' ? 'IN' : '__none__');
  const replyStatusWatch = watch('replyStatus');
  const replyAssigneeIdWatch = watch('replyAssigneeId');
  const customerPostalCodeValue = watch('customerPostalCode');
  const customerAddressValue = watch('customerAddress');
  const customerAddressDetailValue = watch('addressDetail');
  const customerCityValue = watch('customerCity');
  const [activeAddressModal, setActiveAddressModal] = React.useState<'delivery' | 'customer' | null>(null);
  const deliveryAddressContentRef = React.useRef<HTMLDivElement | null>(null);
  const customerAddressContentRef = React.useRef<HTMLDivElement | null>(null);

  // register select-only fields so they are included in form submission
  React.useEffect(() => {
    register('region');
    register('customerCity');
    register('deliveryRegion');
    register('deliveryCity');
    register('chamchamStatus');
    register('species');
    register('feeding');
    register('type');
    register('source');
    register('inOut');
    register('startedAt');
    register('endedAt');
    register('replyStatus');
    register('replyAssigneeId');
  }, [register]);

  // 전화번호 포맷터 (한국형)
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

  // 코드 옵션 로드
  const { data: regions } = useRegions();
  const { data: speciesCodes } = useCodesByCategory('SPECIES');
  const { data: operationCodes } = useCodesByCategory('OPERATION_TYPE');
  const { data: operationSubCodes } = useCodesByCategory('OPERATION_SUBTYPE');
  const { data: feedingCodes } = useCodesByCategory('FEEDING_METHOD');
  const { data: chamchamCodes } = useCodesByCategory('CHAMCHAM_STATUS');
  const { data: replyStatusCodes } = useCodesByCategory('CONSULTATION_REPLY_STATUS');
  const { data: consultationTypeCodes } = useCodeMastersByGroup('CONSULTATION_TYPE');
  const { data: consultationSourceCodes } = useCodeMastersByGroup('CONSULTATION_SOURCE');
  const { data: consultationInOutCodes } = useCodeMastersByGroup('CONSULTATION_INOUT');
  const { data: requestWeightCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: salesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: packingTypeCodes } = useCodeMastersByGroup('PACKING_TYPE');
  const { data: usersData } = useUsers({ limit: 1000 }); // 담당자 검색용
  const { data: salesUsersForReplyResponse } = useUsers({
    page: 1,
    limit: 100,
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
    roleCode: 'ROLE_SALES',
  });
  const salesUsersForReply = salesUsersForReplyResponse?.data ?? [];

  // 제품 분류 및 제품
  const { data: productCategories } = useCodeMastersByGroup('PRODUCT_CATEGORY');
  const { data: allProducts } = useCodeMastersByGroup('PRODUCT'); // 모든 제품
  
  // 제품 정보 배열 (제품 분류, 문의 제품, 등급, 포장유형, 요청중량, 요청차량)
  interface ProductItem {
    id: string; // 고유 ID
    categoryId: number | null;
    productName: string;
    grade: string;
    packingType: string;
    requestedWeight: string;
    requestedVehicle: string;
  }
  const [products, setProducts] = React.useState<ProductItem[]>([
    { id: '1', categoryId: null, productName: '', grade: '', packingType: '', requestedWeight: '', requestedVehicle: '' }
  ]);
  const [pendingCustomerCity, setPendingCustomerCity] = React.useState<string | null>(null);
  const [pendingDeliveryCity, setPendingDeliveryCity] = React.useState<string | null>(null);

  // 운영방식 정보 배열
  interface OperationItem {
    id: string; // 고유 ID
    operation: string; // 'COMPANY' | 'BEEF' | 'DAIRY'
    operationSub: string | null; // 'INTEGRATED' | 'BREEDING' | 'FATTENING' | 'RAISING' | 'MILKING' | 'DRY_MILKING' | null
    herdSize: number | null;
  }
  const [operations, setOperations] = React.useState<OperationItem[]>([
    { id: '1', operation: '', operationSub: null, herdSize: null }
  ]);
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

  // 텍스트 선택을 위한 핸들러 (운송관리·고객관리 drawer와 동일)
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'SELECT' ||
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
      target.tagName === 'SELECT' ||
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
      if (companySearchOpen) {
        setCompanySearchOpen(false);
        return;
      }
      if (phoneSearchOpen) {
        setPhoneSearchOpen(false);
        return;
      }
      if (activeAddressModal) {
        setActiveAddressModal(null);
        return;
      }
      if (showBulkInput) {
        setShowBulkInput(false);
        return;
      }
      if (selectedHistory) {
        setSelectedHistory(null);
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    open,
    companySearchOpen,
    phoneSearchOpen,
    activeAddressModal,
    showBulkInput,
    selectedHistory,
    onOpenChange,
  ]);

  // Customer region/city
  const selectedCustomerRegionId = React.useMemo(() => {
    if (!selectedCustomerRegion || selectedCustomerRegion === '__none__') return undefined;
    return regions?.find((r) => r.name === selectedCustomerRegion)?.id;
  }, [selectedCustomerRegion, regions]);
  const { data: customerCities } = useCities(selectedCustomerRegionId);

  // Delivery region/city
  const selectedDeliveryRegionId = React.useMemo(() => {
    if (!selectedDeliveryRegion || selectedDeliveryRegion === '__none__') return undefined;
    return regions?.find((r) => r.name === selectedDeliveryRegion)?.id;
  }, [selectedDeliveryRegion, regions]);
  const { data: deliveryCities } = useCities(selectedDeliveryRegionId);

  // 코드 라벨 매핑
  const toCodeMap = React.useCallback(
    (codes?: Array<{ value?: string | null; name?: string | null }>) => {
      const map = new Map<string, string>();
      (codes ?? []).forEach((c) => {
        const key = (c.value ?? c.name ?? '').trim();
        const label = (c.name ?? c.value ?? '').trim();
        if (key) map.set(key, label || key);
      });
      return map;
    },
    [],
  );
  const typeMap = React.useMemo(() => toCodeMap(consultationTypeCodes), [toCodeMap, consultationTypeCodes]);
  const sourceMap = React.useMemo(() => toCodeMap(consultationSourceCodes), [toCodeMap, consultationSourceCodes]);
  const inOutMap = React.useMemo(() => toCodeMap(consultationInOutCodes), [toCodeMap, consultationInOutCodes]);
  const requestWeightMap = React.useMemo(() => toCodeMap(requestWeightCodes), [toCodeMap, requestWeightCodes]);
  const salesGradeMap = React.useMemo(() => toCodeMap(salesGradeCodes), [toCodeMap, salesGradeCodes]);
  const packingTypeMap = React.useMemo(() => toCodeMap(packingTypeCodes), [toCodeMap, packingTypeCodes]);
  const productMap = React.useMemo(() => toCodeMap(allProducts), [toCodeMap, allProducts]);
  const productCategoryMap = React.useMemo(() => {
    const map = new Map<number, string>();
    (productCategories ?? []).forEach((category) => {
      if (typeof category.id === 'number') {
        map.set(category.id, category.name ?? '');
      }
    });
    return map;
  }, [productCategories]);
  const labelOr = React.useCallback((map: Map<string, string>, value?: string | null) => {
    const key = (value ?? '').trim();
    if (!key) return '';
    return map.get(key) ?? key;
  }, []);

  const [syncDeliveryAddress, setSyncDeliveryAddress] = React.useState(mode === 'create');
  const [isClient, setIsClient] = React.useState(false);

  const [sessionStartIso, setSessionStartIso] = React.useState<string | null>(null);
  const [currentTime, setCurrentTime] = React.useState<Date>(new Date());

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (open && mode === 'create') {
      const iso = new Date().toISOString();
      setSessionStartIso(iso);
      setValue('startedAt', iso, { shouldDirty: false });
      setValue('endedAt', '', { shouldDirty: false });
    }
    if (!open) {
      setSessionStartIso(null);
      setValue('startedAt', '', { shouldDirty: false });
      setValue('endedAt', '', { shouldDirty: false });
    }
  }, [open, mode, setValue]);

  // 현재 시간 실시간 업데이트 (create 모드일 때만)
  React.useEffect(() => {
    if (!open || mode !== 'create') {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [open, mode]);

  // 자동 임시 저장 (create 모드일 때만)
  const DRAFT_STORAGE_KEY = 'consultation-draft-create';
  const saveDraftTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);


  // 폼 값 변경 시 자동 임시 저장 (create 모드일 때만, debounce 적용)
  const watchedValues = watch();
  React.useEffect(() => {
    if (mode !== 'create' || !open) {
      return;
    }

    // 이전 타이머 취소
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
    }

    // 1초 후 저장
    saveDraftTimeoutRef.current = setTimeout(() => {
      try {
        const formData = getValues();
        const draft = {
          formData,
          products,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch (error) {
        console.error('임시 저장 실패:', error);
      }
    }, 1000);

    return () => {
      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
      }
    };
  }, [mode, open, getValues, products, watchedValues]);

  React.useEffect(() => {
    if (!open) return;
    setSyncDeliveryAddress(mode === 'create');
  }, [open, mode]);

  React.useEffect(() => {
    if (!open && selectedHistory) {
      setSelectedHistory(null);
    }
  }, [open, selectedHistory]);

  React.useEffect(() => {
    if (!syncDeliveryAddress) {
      return;
    }
    const mapping: Array<[keyof CreateConsultationPayload, string | undefined]> = [
      ['deliveryPostalCode', customerPostalCodeValue ?? undefined],
      ['deliveryAddress', customerAddressValue ?? undefined],
      ['deliveryAddressDetail', customerAddressDetailValue ?? undefined],
      ['deliveryRegion', selectedCustomerRegion === '__none__' ? undefined : selectedCustomerRegion],
      ['deliveryCity', customerCityValue ?? undefined],
    ];
    mapping.forEach(([field, value]) => {
      const current = getValues(field);
      const currentStr = (current ?? '') as string;
      const nextStr = (value ?? '') as string;
      if (currentStr !== nextStr) {
        setValue(field, value as CreateConsultationPayload[typeof field], {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    });
  }, [
    syncDeliveryAddress,
    customerPostalCodeValue,
    customerAddressValue,
    customerAddressDetailValue,
    selectedCustomerRegion,
    customerCityValue,
    getValues,
    setValue,
  ]);

  React.useEffect(() => {
    if (!selectedHistory) return;
    const exists = history.some((item) => item.id === selectedHistory.id);
    if (!exists) {
      setSelectedHistory(null);
    }
  }, [history, selectedHistory]);

  const regionOptions = React.useMemo(() => {
    return (regions ?? []).map((r) => ({ value: r.name, label: r.name }));
  }, [regions]);

  const speciesOptions = React.useMemo(() => {
    return (speciesCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [speciesCodes]);

  const operationOptions = React.useMemo(() => {
    return (operationCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [operationCodes]);

  const operationSubOptions = React.useMemo(() => {
    return (operationSubCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [operationSubCodes]);

  const feedingOptions = React.useMemo(() => {
    return (feedingCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [feedingCodes]);

  const chamchamOptions = React.useMemo(() => {
    return (chamchamCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [chamchamCodes]);

  const consultationTypeOptions = React.useMemo(() => {
    return (consultationTypeCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [consultationTypeCodes]);

  const consultationSourceOptions = React.useMemo(() => {
    return (consultationSourceCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [consultationSourceCodes]);

  const consultationInOutOptions = React.useMemo(() => {
    return (consultationInOutCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [consultationInOutCodes]);

  const requestWeightOptions = React.useMemo(() => {
    return (requestWeightCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [requestWeightCodes]);

  const salesGradeOptions = React.useMemo(() => {
    return (salesGradeCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [salesGradeCodes]);

  const packingTypeOptions = React.useMemo(() => {
    return (packingTypeCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [packingTypeCodes]);

  const managerDisplay = React.useMemo(() => {
    if (mode === 'edit') {
      return consultation?.managerName ?? '미지정';
    }
    return currentUserName ?? '로그인한 사용자';
  }, [mode, consultation?.managerName, currentUserName]);

  // 텍스트를 코드 값으로 변환하는 헬퍼 함수
  const findCodeValue = React.useCallback(
    (text: string, options: Array<{ value: string; label: string }>): string | null => {
      if (!text || !options || options.length === 0) return null;

      // 점(.) 제거 및 공백 정리
      const normalized = text.trim().replace(/\./g, '').replace(/\s+/g, '');

      // 정확한 매칭
      const exactMatch = options.find(
        (opt) =>
          opt.label.trim().replace(/\./g, '').replace(/\s+/g, '') === normalized ||
          opt.value === normalized ||
          opt.label === text.trim()
      );
      if (exactMatch) return exactMatch.value;

      // 대소문자 무시 매칭
      const caseInsensitiveMatch = options.find(
        (opt) =>
          opt.label.trim().replace(/\./g, '').replace(/\s+/g, '').toLowerCase() === normalized.toLowerCase() ||
          opt.value.toLowerCase() === normalized.toLowerCase()
      );
      if (caseInsensitiveMatch) return caseInsensitiveMatch.value;

      // 부분 매칭 (포함)
      const partialMatch = options.find(
        (opt) =>
          opt.label.trim().replace(/\./g, '').replace(/\s+/g, '').includes(normalized) ||
          normalized.includes(opt.label.trim().replace(/\./g, '').replace(/\s+/g, ''))
      );
      if (partialMatch) return partialMatch.value;

      return null;
    },
    []
  );

  // 탭 구분 데이터 파싱 함수
  const parseBulkData = React.useCallback(() => {
    if (!bulkInputText.trim()) {
      toast({
        title: '입력 오류',
        description: '데이터를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const lines = bulkInputText.trim().split('\n');
      if (lines.length === 0) {
        toast({
          title: '입력 오류',
          description: '데이터가 없습니다.',
          variant: 'destructive',
        });
        return;
      }

      // 첫 번째 줄은 헤더일 수 있으므로, 데이터가 있는 줄 찾기
      let dataLine = lines[0];
      if (lines.length > 1 && lines[0].includes('월') && lines[0].includes('일')) {
        // 헤더가 있는 경우
        dataLine = lines[1];
      }

      const columns = dataLine.split('\t');
      // 컬럼 수가 23개 미만이어도 처리 (마지막 컬럼이 비어있을 수 있음)
      if (columns.length < 20) {
        toast({
          title: '입력 오류',
          description: `데이터 형식이 올바르지 않습니다. (컬럼 수: ${columns.length}, 최소: 20)`,
          variant: 'destructive',
        });
        return;
      }
      
      // 컬럼 수가 부족하면 빈 문자열로 채우기 (최대 23개까지)
      while (columns.length < 23) {
        columns.push('');
      }

      // 컬럼 매핑 (0부터 시작) - 점(.) 제거 및 공백 정리
      const month = (columns[0]?.trim() || '').replace(/\./g, '');
      const day = (columns[1]?.trim() || '').replace(/\./g, '');
      const region = (columns[2]?.trim() || '').replace(/\./g, '');
      const addressDetail = (columns[3]?.trim() || '').replace(/\./g, '');
      const companyName = (columns[4]?.trim() || '').replace(/\./g, '');
      const ceo = (columns[5]?.trim() || '').replace(/\./g, '');
      const phone = (columns[6]?.trim() || '').replace(/\./g, '');
      const species = (columns[7]?.trim() || '').replace(/\./g, '');
      const operation = (columns[8]?.trim() || '').replace(/\./g, '');
      const herdSize = (columns[9]?.trim() || '').replace(/\./g, '');
      const feeding = (columns[10]?.trim() || '').replace(/\./g, '');
      const inquiryProduct = (columns[11]?.trim() || '').replace(/\./g, '');
      const grade = (columns[12]?.trim() || '').replace(/\./g, '');
      const requestedWeight = (columns[13]?.trim() || '').replace(/\./g, '');
      const source = (columns[14]?.trim() || '').replace(/\./g, '');
      const inOut = (columns[15]?.trim() || '').replace(/\./g, '');
      const type = (columns[16]?.trim() || '').replace(/\./g, '');
      const deliveryRegion = (columns[17]?.trim() || '').replace(/\./g, '');
      const proposedPrice = (columns[18]?.trim() || '').replace(/\./g, '');
      const hasHandling = columns[19]?.trim().toUpperCase() === 'TRUE' || columns[19]?.trim() === '예';
      const hasUnloading = columns[20]?.trim().toUpperCase() === 'TRUE' || columns[20]?.trim() === '예';
      const managerName = (columns[21]?.trim() || '').replace(/\./g, '');
      const notes = (columns[22]?.trim() || '').replace(/\./g, '');

      // 전화번호 필수 체크
      if (!phone) {
        toast({
          title: '입력 오류',
          description: '전화번호가 없습니다.',
          variant: 'destructive',
        });
        return;
      }

      // 날짜 처리 (월/일 -> YYYY-MM-DD)
      let consultationDate = '';
      if (month && day) {
        const currentYear = new Date().getFullYear();
        const monthNum = month.replace(/월/g, '').trim();
        const dayNum = day.replace(/일/g, '').trim();
        if (monthNum && dayNum) {
          const monthPadded = monthNum.padStart(2, '0');
          const dayPadded = dayNum.padStart(2, '0');
          consultationDate = `${currentYear}-${monthPadded}-${dayPadded}`;
        }
      }

      // 폼에 값 설정
      setValue('phone', formatPhone(phone));
      if (companyName) setValue('companyName', companyName);
      if (ceo) setValue('ceo', ceo);
      if (region) setValue('region', region);
      if (addressDetail) setValue('addressDetail', addressDetail);

      // 축종 처리 (텍스트 -> 코드 값)
      if (species) {
        const speciesCode = findCodeValue(species, speciesOptions);
        if (speciesCode) {
          setValue('species', speciesCode);
        } else {
          // 코드를 찾지 못한 경우 원본 값 사용 (사용자가 수동으로 수정 가능)
          setValue('species', species);
          console.warn(`축종 코드를 찾을 수 없습니다: ${species}`);
        }
      }

      // 급여방식 처리 (텍스트 -> 코드 값)
      if (feeding) {
        const feedingCode = findCodeValue(feeding, feedingOptions);
        if (feedingCode) {
          setValue('feeding', feedingCode);
        } else {
          setValue('feeding', feeding);
          console.warn(`급여방식 코드를 찾을 수 없습니다: ${feeding}`);
        }
      }

      if (consultationDate) setValue('consultationDate', consultationDate);

      // 상담 유형 처리 (텍스트 -> 코드 값)
      if (type) {
        const typeCode = findCodeValue(type, consultationTypeOptions);
        if (typeCode) {
          setValue('type', typeCode);
        } else {
          setValue('type', type);
          console.warn(`상담 유형 코드를 찾을 수 없습니다: ${type}`);
        }
      }

      // 유입경로 처리 (텍스트 -> 코드 값)
      if (source) {
        const sourceCode = findCodeValue(source, consultationSourceOptions);
        if (sourceCode) {
          setValue('source', sourceCode);
        } else {
          setValue('source', source);
          console.warn(`유입경로 코드를 찾을 수 없습니다: ${source}`);
        }
      }

      // IN/OUT 처리 (텍스트 -> 코드 값)
      if (inOut) {
        const inOutCode = findCodeValue(inOut, consultationInOutOptions);
        if (inOutCode) {
          setValue('inOut', inOutCode);
        } else {
          setValue('inOut', inOut);
          console.warn(`IN/OUT 코드를 찾을 수 없습니다: ${inOut}`);
        }
      }

      if (inquiryProduct) {
        setValue('productName', inquiryProduct);
        setValue('inquiryProduct', inquiryProduct);
      }
      if (grade) setValue('grade', grade);
      if (requestedWeight) setValue('requestedWeight', requestedWeight);
      if (deliveryRegion) setValue('deliveryRegion', deliveryRegion);
      if (proposedPrice && proposedPrice !== '#N/A') setValue('proposedPrice', proposedPrice);
      setValue('hasHandling', hasHandling);
      setValue('hasUnloading', hasUnloading);
      if (notes) setValue('notes', notes);

      // 운영방식 처리 (텍스트 -> 코드 값)
      // 운영방식은 두 단계: OPERATION_TYPE (메인) + OPERATION_SUBTYPE (서브)
      // "번식", "비육", "착유" 등은 OPERATION_SUBTYPE에 있음
      if (operation) {
        // 먼저 OPERATION_TYPE에서 찾기 (업체, 조합 등)
        let operationCode = findCodeValue(operation, operationOptions);
        let operationSubCode: string | null = null;

        // OPERATION_TYPE에서 찾지 못했으면 OPERATION_SUBTYPE에서 찾기
        if (!operationCode) {
          operationSubCode = findCodeValue(operation, operationSubOptions);
          
          // OPERATION_SUBTYPE을 찾았으면, 축종에 따라 OPERATION_TYPE 결정
          if (operationSubCode) {
            // 축종 코드 값 가져오기 (이미 위에서 설정했거나 원본 값 사용)
            const speciesCodeValue = speciesOptions.find(
              (opt) => opt.label === species || opt.value === species
            )?.value || getValues('species');
            
            // 축종에 따라 메인 타입 결정
            if (speciesCodeValue === 'HANWOO' || speciesCodeValue === 'ORGANIC_HANWOO') {
              operationCode = 'BEEF'; // 한우 -> BEEF
            } else if (speciesCodeValue === 'DAIRY' || speciesCodeValue === 'ORGANIC_DAIRY') {
              operationCode = 'DAIRY'; // 낙우 -> DAIRY
            } else {
              operationCode = 'COMPANY'; // 기본값
            }
          }
        }

        const operationItem: OperationItem = {
          id: '1',
          operation: operationCode || 'COMPANY', // 기본값 COMPANY
          operationSub: operationSubCode,
          herdSize: herdSize ? parseInt(herdSize, 10) || null : null,
        };
        setOperations([operationItem]);
        
        if (!operationCode && !operationSubCode) {
          console.warn(`운영방식 코드를 찾을 수 없습니다: ${operation}`);
          toast({
            title: '운영방식 매칭 실패',
            description: `"${operation}" 운영방식을 찾을 수 없습니다. 수동으로 선택해주세요.`,
            variant: 'default',
          });
        }
      }

      // 제품 정보 처리
      if (inquiryProduct) {
        const productItem: ProductItem = {
          id: '1',
          categoryId: null,
          productName: inquiryProduct,
          grade: grade || '',
          packingType: '',
          requestedWeight: requestedWeight || '',
          requestedVehicle: requestedWeight || '',
        };
        setProducts([productItem]);
      }

      // 담당자 처리 (이름으로 찾기)
      if (managerName && usersData?.data) {
        const manager = usersData.data.find((u) => u.name === managerName);
        if (manager) {
          setValue('managerId', manager.id);
        } else {
          toast({
            title: '담당자 찾기 실패',
            description: `"${managerName}" 담당자를 찾을 수 없습니다. 수동으로 선택해주세요.`,
            variant: 'default',
          });
        }
      }

      toast({
        title: '데이터 입력 완료',
        description: '데이터가 폼에 자동으로 입력되었습니다. 주소는 수동으로 입력해주세요.',
      });

      setShowBulkInput(false);
      setBulkInputText('');
    } catch (error) {
      console.error('파싱 오류:', error);
      toast({
        title: '파싱 오류',
        description: error instanceof Error ? error.message : '데이터를 파싱하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  }, [
    bulkInputText,
    setValue,
    formatPhone,
    usersData,
    setOperations,
    setProducts,
    findCodeValue,
    speciesOptions,
    feedingOptions,
    operationOptions,
    operationSubOptions,
    consultationTypeOptions,
    consultationSourceOptions,
    consultationInOutOptions,
    getValues,
  ]);

  // 카카오 주소검색 스크립트 로드
  React.useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // 컴포넌트 언마운트 시 스크립트 제거
      const existingScript = document.querySelector('script[src*="postcode.v2.js"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, []);

  // 주소 검색 팝업 닫기
  const closeAddressSearch = React.useCallback(() => {
    setActiveAddressModal(null);
  }, []);

  // 주소 검색 팝업 열기
  const handleAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    const contentElement = deliveryAddressContentRef.current;
    if (!contentElement) {
      toast({
        title: '오류',
        description: '주소 검색 UI를 불러올 수 없습니다.',
        className: 'border border-red-300 text-red-600',
      });
      return;
    }

    // 기존에 embed된 주소 검색 UI가 있으면 제거
    contentElement.innerHTML = '';

    const Postcode = window.daum.Postcode;

    new Postcode({
      oncomplete: (data: DaumPostcodeData) => {
        // 주소 선택 시 실행되는 콜백
        let fullAddress = data.address; // 기본 주소
        let extraAddress = ''; // 참고항목

        // 사용자가 선택한 주소 타입에 따라 해당 주소 값을 가져온다.
        if (data.userSelectedType === 'R') {
          // 사용자가 도로명 주소를 선택했을 경우
          fullAddress = data.roadAddress;
        } else {
          // 사용자가 지번 주소를 선택했을 경우(J)
          fullAddress = data.jibunAddress;
        }

        // 사용자가 선택한 주소가 도로명 타입일때 참고항목을 조합한다.
        if (data.userSelectedType === 'R') {
          // 법정동명이 있을 경우 추가한다. (법정리는 제외)
          // 법정동의 경우 마지막 문자가 "동/로/가"로 끝난다.
          if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) {
            extraAddress += data.bname;
          }
          // 건물명이 있고, 공동주택일 경우 추가한다.
          if (data.buildingName !== '' && data.apartment === 'Y') {
            extraAddress += extraAddress !== '' ? ', ' + data.buildingName : data.buildingName;
          }
          // 표시할 참고항목이 있을 경우, 괄호까지 추가한 최종 문자열을 만든다.
          if (extraAddress !== '') {
            extraAddress = ' (' + extraAddress + ')';
          }
        }

        // 우편번호와 주소를 각각 폼에 입력
        setValue('deliveryPostalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
        setValue('deliveryAddress', fullAddress + extraAddress, { shouldDirty: true, shouldValidate: true });
        // 시도(sido) 값을 deliveryRegion에 저장 (예: "경기도")
        if (data.sido && regions) {
          const matchedRegion = regions.find((r) => r.name === data.sido);
          if (matchedRegion) {
            setValue('deliveryRegion', matchedRegion.name, { shouldDirty: true, shouldValidate: true });
            setPendingDeliveryCity(null);
          } else {
            setValue('deliveryRegion', data.sido, { shouldDirty: true, shouldValidate: true });
          }
        }
        // 시군구(sigungu) 값을 deliveryCity에 저장 (예: "평택시")
        if (data.sigungu) {
          setPendingDeliveryCity(data.sigungu);
          const regionId = regions?.find((r) => r.name === data.sido)?.id;
          if (regionId && deliveryCities) {
            const matchedCity = deliveryCities.find((c) => c.name === data.sigungu);
            if (matchedCity) {
              setValue('deliveryCity', matchedCity.name, { shouldDirty: true, shouldValidate: true });
              setPendingDeliveryCity(null);
            } else {
              setValue('deliveryCity', data.sigungu, { shouldDirty: true, shouldValidate: true });
            }
          } else {
            setValue('deliveryCity', data.sigungu || '', { shouldDirty: true, shouldValidate: true });
          }
        }
        // 상세주소는 기존 값 유지 (사용자가 직접 입력)
        
        // 팝업 닫기
        closeAddressSearch();
      },
      width: '100%',
      height: '100%',
    }).embed(contentElement);

    setActiveAddressModal('delivery');
  }, [setValue, closeAddressSearch, regions, deliveryCities]);

  const handleCustomerAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    const contentElement = customerAddressContentRef.current;
    if (!contentElement) {
      toast({
        title: '오류',
        description: '주소 검색 UI를 불러올 수 없습니다.',
        className: 'border border-red-300 text-red-600',
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
          const matchedRegion = regions.find((r) => r.name === data.sido);
          if (matchedRegion) {
            setValue('region', matchedRegion.name, { shouldDirty: true, shouldValidate: true });
            setPendingCustomerCity(null);
          } else {
            setValue('region', data.sido, { shouldDirty: true, shouldValidate: true });
          }
        }
        if (data.sigungu) {
          setPendingCustomerCity(data.sigungu);
          const regionId = regions?.find((r) => r.name === data.sido)?.id;
          if (regionId && customerCities) {
            const matchedCity = customerCities.find((c) => c.name === data.sigungu);
            if (matchedCity) {
              setValue('customerCity', matchedCity.name, { shouldDirty: true, shouldValidate: true });
              setPendingCustomerCity(null);
            } else {
              setValue('customerCity', data.sigungu, { shouldDirty: true, shouldValidate: true });
            }
          } else {
            setValue('customerCity', data.sigungu || '', { shouldDirty: true, shouldValidate: true });
          }
        }

        closeAddressSearch();
      },
      width: '100%',
      height: '100%',
    }).embed(contentElement);

    setActiveAddressModal('customer');
  }, [closeAddressSearch, regions, customerCities, setValue]);

  React.useEffect(() => {
    if (!pendingCustomerCity) return;
    if (!customerCities || customerCities.length === 0) return;
    const matched = customerCities.find((c) => c.name === pendingCustomerCity);
    if (matched) {
      setValue('customerCity', matched.name, { shouldDirty: true, shouldValidate: true });
      setPendingCustomerCity(null);
    }
  }, [pendingCustomerCity, customerCities, setValue]);

  React.useEffect(() => {
    if (!pendingDeliveryCity) return;
    if (!deliveryCities || deliveryCities.length === 0) return;
    const matched = deliveryCities.find((c) => c.name === pendingDeliveryCity);
    if (matched) {
      setValue('deliveryCity', matched.name, { shouldDirty: true, shouldValidate: true });
      setPendingDeliveryCity(null);
    }
  }, [pendingDeliveryCity, deliveryCities, setValue]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'edit' && consultation) {
      reset({
        phone: formatPhone(consultation.phone ?? ''),
        companyName: consultation.companyName ?? '',
        ceo: consultation.ceo ?? '',
        region: consultation.region ?? '',
        customerPostalCode: consultation.customerPostalCode ?? '',
        customerAddress: consultation.customerAddress ?? '',
        customerCity: consultation.customerCity ?? '',
        addressDetail: consultation.addressDetail ?? '',
        species: consultation.species ?? '',
        operation: consultation.operation ?? '',
        herdSize: consultation.herdSize ?? '',
        feeding: consultation.feeding ?? '',
        chamchamStatus: consultation.chamchamStatus ?? '',
        inquiryProduct: consultation.inquiryProduct ?? '',
        consultationDate: consultation.consultationDate ?? '',
        type: consultation.type ?? '',
        source: consultation.source ?? '',
        inOut: consultation.inOut || 'IN',
        productName: consultation.productName ?? '',
        grade: consultation.grade ?? '',
        requestedWeight: consultation.requestedWeight ?? '',
        deliveryRegion: consultation.deliveryRegion ?? '',
        deliveryPostalCode: consultation.deliveryPostalCode ?? '',
        deliveryAddress: consultation.deliveryAddress ?? '',
        deliveryAddressDetail: consultation.deliveryAddressDetail ?? '',
        deliveryCity: consultation.deliveryCity ?? '',
        proposedPrice: consultation.proposedPrice ?? '',
        notes: consultation.notes ?? '',
        hasHandling: consultation.hasHandling,
        hasUnloading: consultation.hasUnloading,
        mainProduct: consultation.mainProduct ?? '',
        arrivalPrice: consultation.arrivalPrice ?? '',
        managerId: consultation.managerId,
        replyStatus: consultation.replyStatus ?? '',
        replyAssigneeId: consultation.replyAssigneeId ?? null,
        startedAt: consultation.startedAt ?? '',
        endedAt: consultation.endedAt ?? '',
      });
      // 기존 운영방식 정보로 operations 배열 초기화
      if (consultation.operations && consultation.operations.length > 0) {
        const operationNameToValue = new Map(operationOptions.map((opt) => [opt.label, opt.value]));
        const operationSubNameToValue = new Map(operationSubOptions.map((opt) => [opt.label, opt.value]));

        setOperations(
          consultation.operations.map((op, index) => ({
            id: `operation-${index}`,
            operation: operationNameToValue.get(op.operation || '') || op.operation || '',
            operationSub: op.operationSub ? (operationSubNameToValue.get(op.operationSub) || op.operationSub) : null,
            herdSize: op.herdSize ?? null,
          }))
        );
      } else if (consultation.operation) {
        // 호환성: 기존 operation, herdSize 사용
        setOperations([
          {
            id: '1',
            operation: consultation.operation ?? '',
            operationSub: null,
            herdSize: consultation.herdSize ? parseInt(consultation.herdSize, 10) || null : null,
          }
        ]);
      } else {
        setOperations([{ id: '1', operation: '', operationSub: null, herdSize: null }]);
      }

      // 기존 제품 정보로 products 배열 초기화
      if (consultation.products && consultation.products.length > 0) {
        // 새로운 products 배열 사용
        setProducts(
          consultation.products.map((p, index) => ({
            id: p.id?.toString() ?? `product-${index}`,
            categoryId: p.productCategoryId ?? null,
            productName: p.productName ?? '',
            grade: p.grade ?? '',
            packingType: p.packingType ?? '',
            requestedWeight: p.requestedWeight ?? '',
            requestedVehicle: p.requestedVehicle ?? '',
          }))
        );
      } else if (consultation.productName || consultation.grade) {
        // 호환성: 기존 productName, grade 사용
        let categoryId: number | null = null;
        if (consultation.productName && allProducts) {
          const matchedProduct = allProducts.find(
            (p) => (p.value ?? p.name) === consultation.productName || p.name === consultation.productName
          );
          if (matchedProduct?.parentId) {
            categoryId = matchedProduct.parentId;
          }
        }
        setProducts([
          {
            id: '1',
            categoryId,
            productName: consultation.productName ?? '',
            grade: consultation.grade ?? '',
            packingType: '',
            requestedWeight: '',
            requestedVehicle: consultation.requestedWeight ?? '',
          }
        ]);
      } else {
        setProducts([
          {
            id: '1',
            categoryId: null,
            productName: '',
            grade: '',
            packingType: '',
            requestedWeight: '',
            requestedVehicle: '',
          },
        ]);
      }
      setHistory([]);
    } else {
      // 생성 모드: operations 배열 초기화
      setOperations([{ id: '1', operation: '', operationSub: null, herdSize: null }]);
      
      // 생성 모드: products 배열 초기화
      setProducts([
        {
          id: '1',
          categoryId: null,
          productName: '',
          grade: '',
          packingType: '',
          requestedWeight: '',
          requestedVehicle: '',
        },
      ]);
      // 생성 모드: 상담일 기본값을 오늘 날짜(YYYY-MM-DD)로 설정
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      reset({ ...defaultValues, consultationDate: `${yyyy}-${mm}-${dd}` });
      setHistory([]);
    }
  }, [open, mode, consultation, reset, formatPhone, allProducts, operationOptions, operationSubOptions]);

  /**
   * 전화번호로 고객 정보 및 상담 이력 조회
   * - 고객 정보가 있으면 폼에 자동 입력
   * - 해당 고객의 기존 상담 이력을 왼쪽 패널에 표시
   */
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
          setValue('companyName', result.customer.companyName ?? '');
          setValue('ceo', result.customer.ceo ?? '');
          setValue('region', result.customer.region ?? '');
          setValue('addressDetail', result.customer.addressDetail ?? '');
          setValue('customerPostalCode', result.customer.customerPostalCode ?? '');
          setValue('customerAddress', result.customer.customerAddress ?? '');
          if (result.customer.customerCity) {
            setPendingCustomerCity(result.customer.customerCity);
          } else {
            setValue('customerCity', '');
          }
          setValue('species', result.customer.species ?? '');
          setValue('feeding', result.customer.feeding ?? '');

          if (result.customer.operations && result.customer.operations.length > 0) {
            const operationNameToValue = new Map(operationOptions.map((opt) => [opt.label, opt.value]));
            const operationSubNameToValue = new Map(operationSubOptions.map((opt) => [opt.label, opt.value]));

            setOperations(
              result.customer.operations.map((op, index) => ({
                id: `operation-${index}`,
                operation: operationNameToValue.get(op.operation) || op.operation || '',
                operationSub: op.operationSub
                  ? operationSubNameToValue.get(op.operationSub) || op.operationSub
                  : null,
                herdSize: op.herdSize ?? null,
              })),
            );
          } else if (result.customer.operation) {
            const operationNameToValue = new Map(operationOptions.map((opt) => [opt.label, opt.value]));
            const operationValue = operationNameToValue.get(result.customer.operation) || result.customer.operation || '';
            setOperations([
              {
                id: '1',
                operation: operationValue,
                operationSub: null,
                herdSize: result.customer.herdSize ? parseInt(result.customer.herdSize, 10) || null : null,
              },
            ]);
          } else {
            setOperations([{ id: '1', operation: '', operationSub: null, herdSize: null }]);
          }
          setValue('chamchamStatus', result.customer.chamchamStatus ?? '');
          setValue('inquiryProduct', result.customer.inquiryProduct ?? '');
        }
        setHistory(result.consultations ?? []);
        if (!result.customer) {
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
          className: 'border border-red-300 text-red-600',
        });
      }
    },
    [
      formatPhone,
      lookupMutation,
      operationOptions,
      operationSubOptions,
      setPendingCustomerCity,
      setValue,
      setOperations,
      setHistory,
      toast,
    ],
  );

  const handleLookup = React.useCallback(async () => {
    const phone = getValues('phone');
    if (!phone) {
      toast({
        title: '전화번호 입력 필요',
        description: '전화번호를 입력한 후 조회해주세요.',
        className: 'border border-red-300 text-red-600',
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
        setValue('ceo', item.ceo, { shouldDirty: true });
      }
      if (item.phone) {
        setValue('phone', formatPhone(item.phone), { shouldDirty: true });
        // 기존 상담 이력 로드 (lookup API 호출)
        performLookup(item.phone);
      } else {
        toast({
          title: '전화번호 정보 없음',
          description: '선택한 업체에는 전화번호가 없어 기본 정보만 채웠습니다.',
        });
      }
      // 주소·지역·축종·운영형태 등 검색 결과의 전체 고객정보를 폼에 반영 (저장 시 null 방지)
      setValue('region', item.region ?? '', { shouldDirty: true });
      setValue('customerPostalCode', item.customerPostalCode ?? '', { shouldDirty: true });
      setValue('customerAddress', item.customerAddress ?? '', { shouldDirty: true });
      setValue('addressDetail', item.addressDetail ?? '', { shouldDirty: true });
      setValue('species', item.species ?? '', { shouldDirty: true });
      setValue('feeding', item.feeding ?? '', { shouldDirty: true });
      setValue('chamchamStatus', item.chamchamStatus ?? '', { shouldDirty: true });
      if (item.customerCity) {
        setPendingCustomerCity(item.customerCity);
      } else {
        setValue('customerCity', '', { shouldDirty: true });
      }
      if (item.operations && item.operations.length > 0) {
        setOperations(
          item.operations.map((op, idx) => ({
            id: String(Date.now() + idx),
            operation: op.operation,
            operationSub: op.operationSub ?? null,
            herdSize: op.herdSize ?? null,
          }))
        );
      }
    },
    [handleCompanySearchOpenChange, setValue, formatPhone, toast, performLookup],
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
        setValue('ceo', item.ceo, { shouldDirty: true });
      }
      if (item.phone) {
        setValue('phone', formatPhone(item.phone), { shouldDirty: true });
        // 기존 상담 이력 로드 (lookup API 호출)
        performLookup(item.phone);
      }
      // 주소·지역·축종·운영형태 등 검색 결과의 전체 고객정보를 폼에 반영 (저장 시 null 방지)
      setValue('region', item.region ?? '', { shouldDirty: true });
      setValue('customerPostalCode', item.customerPostalCode ?? '', { shouldDirty: true });
      setValue('customerAddress', item.customerAddress ?? '', { shouldDirty: true });
      setValue('addressDetail', item.addressDetail ?? '', { shouldDirty: true });
      setValue('species', item.species ?? '', { shouldDirty: true });
      setValue('feeding', item.feeding ?? '', { shouldDirty: true });
      setValue('chamchamStatus', item.chamchamStatus ?? '', { shouldDirty: true });
      if (item.customerCity) {
        setPendingCustomerCity(item.customerCity);
      } else {
        setValue('customerCity', '', { shouldDirty: true });
      }
      if (item.operations && item.operations.length > 0) {
        setOperations(
          item.operations.map((op, idx) => ({
            id: String(Date.now() + idx),
            operation: op.operation,
            operationSub: op.operationSub ?? null,
            herdSize: op.herdSize ?? null,
          }))
        );
      }
    },
    [handlePhoneSearchOpenChange, setValue, formatPhone, performLookup],
  );

  // 운영방식 추가 함수
  const addOperation = () => {
    setOperations([
      ...operations,
      {
        id: Date.now().toString(),
        operation: '',
        operationSub: null,
        herdSize: null,
      },
    ]);
  };

  // 운영방식 삭제 함수
  const removeOperation = (id: string) => {
    if (operations.length > 1) {
      setOperations(operations.filter(op => op.id !== id));
    }
  };

  // 운영방식 업데이트 함수
  const updateOperation = React.useCallback(
    (
      id: string,
      field: 'operation' | 'operationSub' | 'herdSize',
      value: string | number | null
    ) => {
      setOperations((prev) =>
        prev.map((op) => {
          if (op.id !== id) return op;
          if (field === 'herdSize') {
            return { ...op, herdSize: value === '' ? null : (typeof value === 'number' ? value : parseInt(String(value), 10) || null) };
          }
          if (field === 'operationSub') {
            return { ...op, operationSub: value === '__none__' || value === '' ? null : (value as string | null) };
          }
          // operation 변경 시 operationSub 초기화
          if (field === 'operation') {
            return { ...op, operation: value as string, operationSub: null };
          }
          return { ...op, [field]: value };
        })
      );
    },
    []
  );

  // 제품 추가 함수
  const addProduct = () => {
    setProducts([
      ...products,
      {
        id: Date.now().toString(),
        categoryId: null,
        productName: '',
        grade: '',
        packingType: '',
        requestedWeight: '',
        requestedVehicle: '',
      },
    ]);
  };

  // 제품 삭제 함수
  const removeProduct = (id: string) => {
    if (products.length > 1) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  // 제품 업데이트 함수
  const updateProduct = React.useCallback(
    (
      id: string,
      field:
        | 'categoryId'
        | 'productName'
        | 'grade'
        | 'packingType'
        | 'requestedWeight'
        | 'requestedVehicle',
      value: number | null | string,
    ) => {
    setProducts(prevProducts => prevProducts.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
    },
    [],
  );

  // 각 제품 항목별 필터링된 제품 목록
  const getFilteredProductsForItem = (categoryId: number | null) => {
    if (!categoryId) return allProducts ?? [];
    return (allProducts ?? []).filter(p => p.parentId === categoryId);
  };

  const internalSubmit = async (payload: CreateConsultationPayload) => {
    const next: CreateConsultationPayload = { ...payload };
    
    // operations 배열을 전송 (빈 값 제외)
    const validOperations = operations
      .filter((op) => op.operation)
      .map((op) => ({
        operation: op.operation,
        operationSub: op.operationSub || null,
        herdSize: op.herdSize || null,
      }));
    
    if (validOperations.length > 0) {
      next.operations = validOperations;
    } else {
      next.operations = [];
    }
    
    // products 배열을 전송 (빈 값 제외)
    const validProducts = products
      .filter((p) => p.productName || p.grade || p.packingType || p.requestedWeight || p.requestedVehicle)
      .map((p, index) => ({
        productCategoryId: p.categoryId ?? null,
        productName: p.productName || null,
        grade: p.grade || null,
        packingType: p.packingType || null,
        requestedWeight: p.requestedWeight || null,
        requestedVehicle: p.requestedVehicle || null,
        order: index,
      }));
    
    if (validProducts.length > 0) {
      next.products = validProducts;
      // 호환성을 위해 첫 번째 제품 정보도 productName, grade로 설정
      next.productName = validProducts[0].productName || undefined;
      next.grade = validProducts[0].grade || undefined;
      next.requestedWeight = validProducts[0].requestedVehicle || undefined;
    } else {
      next.products = [];
      next.productName = undefined;
      next.grade = undefined;
      next.requestedWeight = undefined;
    }
    
    const rs = typeof next.replyStatus === 'string' ? next.replyStatus.trim() : '';
    next.replyStatus = rs.length > 0 ? rs : null;
    const ra = next.replyAssigneeId;
    next.replyAssigneeId =
      ra != null && !Number.isNaN(Number(ra)) && Number(ra) > 0 ? Number(ra) : null;

    if (mode === 'create') {
      if (currentUserId != null) {
        const parsed = Number(currentUserId);
        if (!Number.isNaN(parsed)) {
          next.managerId = parsed;
        }
      }
      const nowIso = new Date().toISOString();
      next.startedAt = sessionStartIso ?? payload.startedAt ?? nowIso;
      next.endedAt = nowIso;
    } else {
      delete next.managerId;
      delete next.startedAt;
      delete next.endedAt;
    }
    await onSubmit(next);
    
    // 저장 성공 시 임시 저장 데이터 삭제 (create 모드일 때만)
    if (mode === 'create') {
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (error) {
        console.error('임시 저장 데이터 삭제 실패:', error);
      }
    }
  };

  const submitLabel = mode === 'create' ? '상담 추가' : '상담 수정';

  const startOfDay = React.useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const endOfDay = React.useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const filteredHistory = React.useMemo(() => {
    const text = historySearch.trim().toLowerCase();
    const start = historyRange.start ? new Date(historyRange.start) : null;
    const end = historyRange.end ? new Date(historyRange.end) : null;

    return history.filter((item) => {
      let matchesText = true;
      if (text) {
        // 검색 대상 텍스트 수집
        const searchTexts: string[] = [];
        
        // 기존 필드들
        if (item.productName) searchTexts.push(item.productName);
        if (item.inquiryProduct) searchTexts.push(item.inquiryProduct);
        if (item.notes) searchTexts.push(item.notes);
        
        // products 배열의 모든 제품 정보
        if (item.products && item.products.length > 0) {
          item.products.forEach((product) => {
            if (product.productName) {
              // 제품명 (코드값과 이름 모두 검색)
              searchTexts.push(product.productName);
              const productName = labelOr(productMap, product.productName);
              if (productName && productName !== product.productName) {
                searchTexts.push(productName);
              }
            }
            if (product.grade) {
              // 등급 (코드값과 이름 모두 검색)
              searchTexts.push(product.grade);
              const gradeName = labelOr(salesGradeMap, product.grade);
              if (gradeName && gradeName !== product.grade) {
                searchTexts.push(gradeName);
              }
            }
            if (product.packingType) {
              // 포장유형 (코드값과 이름 모두 검색)
              searchTexts.push(product.packingType);
              const packingTypeName = labelOr(packingTypeMap, product.packingType);
              if (packingTypeName && packingTypeName !== product.packingType) {
                searchTexts.push(packingTypeName);
              }
            }
                if (product.requestedWeight) {
                  searchTexts.push(product.requestedWeight);
                }
                if (product.requestedVehicle) {
                  searchTexts.push(product.requestedVehicle);
                  const vehicleName = labelOr(requestWeightMap, product.requestedVehicle);
                  if (vehicleName && vehicleName !== product.requestedVehicle) {
                    searchTexts.push(vehicleName);
                  }
                }
          });
        }
        
        const combined = searchTexts.join(' ').toLowerCase();
        matchesText = combined.includes(text);
      }

      let matchesDate = true;
      if (item.consultationDate && (start || end)) {
        const itemDate = new Date(item.consultationDate);
        if (start && itemDate < startOfDay(start)) {
          matchesDate = false;
        }
        if (end && itemDate > endOfDay(end)) {
          matchesDate = false;
        }
      }
      return matchesText && matchesDate;
    });
  }, [
    history,
    historySearch,
    historyRange,
    startOfDay,
    endOfDay,
    productMap,
    salesGradeMap,
    packingTypeMap,
    requestWeightMap,
    labelOr,
  ]);

  const productStats = React.useMemo(() => {
    const counts = new Map<string, number>();
    history.forEach((item) => {
      // products 배열이 있으면 모든 제품 카운트
      if (item.products && item.products.length > 0) {
        item.products.forEach((product) => {
          const productKey = labelOr(productMap, product.productName) || '기타';
          counts.set(productKey, (counts.get(productKey) ?? 0) + 1);
        });
      } else if (item.productName) {
        // 기존 호환성: productName 사용
        const productKey = labelOr(productMap, item.productName) || item.productName;
        counts.set(productKey, (counts.get(productKey) ?? 0) + 1);
      } else if (item.inquiryProduct) {
        // 기존 호환성: inquiryProduct 사용
        counts.set(item.inquiryProduct, (counts.get(item.inquiryProduct) ?? 0) + 1);
      } else {
        // 제품 정보가 없으면 기타로 카운트
        counts.set('기타', (counts.get('기타') ?? 0) + 1);
      }
    });
    const entries = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const total = entries.reduce((sum, item) => sum + item.count, 0);
    const labels = entries.map((item) => item.name);
    const data = entries.map((item) => item.count);
    return { entries, total, labels, data };
  }, [history, productMap, labelOr]);

  return (
    <>
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction="right"
      dismissible={false}
    >
      <DrawerContent
        className="flex h-screen flex-col"
        style={{
          width: mode === 'edit' ? '800px' : '1500px',
          maxWidth: '98vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle>{mode === 'create' ? '상담 등록' : '상담 수정'}</DrawerTitle>
              <DrawerDescription>
                상담 내용을 {mode === 'create' ? '등록' : '수정'}합니다. 전화번호로 고객 정보를 불러올 수
                있습니다.
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-2">
              {mode === 'create' && sessionStartIso && (() => {
                const startTime = new Date(sessionStartIso);
                const elapsed = currentTime.getTime() - startTime.getTime();
                const totalSeconds = Math.floor(elapsed / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                
                let elapsedText = '';
                if (hours > 0) {
                  elapsedText = `${hours}시간 ${minutes}분`;
                } else if (minutes > 0) {
                  elapsedText = `${minutes}분 ${seconds}초`;
                } else {
                  elapsedText = `${seconds}초`;
                }
                
                return (
                  <div className="flex flex-col items-end gap-0.5">
                    <p className="text-sm text-muted-foreground">
                      {startTime.toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {elapsedText}
                    </p>
                  </div>
                );
              })()}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">닫기</span>
            </Button>
            </div>
          </div>
        </DrawerHeader>

        {/* 일괄 입력 영역 (생성 모드에서만 표시) */}
        {mode === 'create' && (
          <div className="border-b border-border p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">일괄 데이터 입력</Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowBulkInput(!showBulkInput);
                  if (showBulkInput) {
                    setBulkInputText('');
                  }
                }}
              >
                {showBulkInput ? '닫기' : '열기'}
              </Button>
            </div>
            {showBulkInput && (
              <div className="space-y-2">
                <Textarea
                  placeholder="탭으로 구분된 데이터를 붙여넣으세요...&#10;예: 11월	03일	인천	강화 양사면 인화로 247	별립산농장	송병인	010-5303-5721	한우	번식	200		믹스 스몰	1등급	5톤축카고	재상담	IN	구매문의	강화군	#N/A	FALSE	FALSE	Alex	애뉴얼 문의, 라이 1등급 안내 425도착"
                  value={bulkInputText}
                  onChange={(e) => setBulkInputText(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    탭으로 구분된 데이터를 붙여넣고 버튼을 클릭하면 폼에 자동으로 입력됩니다.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={parseBulkData}
                    disabled={!bulkInputText.trim()}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    데이터 입력
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(internalSubmit)} className="flex flex-1 min-h-0 flex-col">
          <div className="flex-1 flex gap-4 p-0 overflow-hidden">
            {/* 왼쪽: 기존 상담 이력 (생성 모드에서만 표시) */}
            {mode === 'create' && (
              <div className="relative flex-[4] border-r border-border bg-muted/20 flex flex-col min-h-0">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">기존 상담 이력</Label>
                    <p className="text-xs text-muted-foreground">최근 상담순</p>
                  </div>
                <span className="text-xs text-muted-foreground">
                    {filteredHistory.length > 0 ? `${filteredHistory.length}건` : '0건'}
                </span>
              </div>
                <div className="flex-1 px-3 py-4 overflow-hidden">
                  <div className="grid grid-cols-1 xl:grid-cols-7 gap-3 h-full">
                  <div className="rounded-lg border bg-card p-3 flex flex-col min-h-[240px] xl:col-span-3 h-[400px]">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <Label className="text-sm font-semibold">제품별 상담 비중</Label>
                        <p className="text-xs text-muted-foreground">전체 상담 대비</p>
                      </div>
                      {productStats.total > 0 && (
                        <span className="text-xs text-muted-foreground">{productStats.total}건</span>
                      )}
                    </div>
                    {productStats.total === 0 ? (
                      <p className="text-xs text-muted-foreground">집계할 상담 이력이 없습니다.</p>
                    ) : (
                      <div className="flex-1 flex items-center justify-center overflow-visible p-4">
                        <div className="w-[90%] h-[90%] max-w-full max-h-full flex items-center justify-center">
                          <Chart
                            type="pie"
                            series={productStats.data}
                            options={{
                              labels: productStats.labels,
                              legend: {
                                position: 'bottom',
                                fontSize: '11px',
                                itemMargin: {
                                  horizontal: 8,
                                  vertical: 4,
                                },
                              },
                              chart: {
                                toolbar: {
                                  show: false,
                                },
                              },
                              plotOptions: {
                                pie: {
                                  donut: {
                                    size: '0%',
                                  },
                                  dataLabels: {
                                    offset: -15
                                  }
                                },
                              },
                              dataLabels: {
                                enabled: true,
                                formatter: (_val: number, opts: { seriesIndex: number }) => {
                                  const label = productStats.labels[opts.seriesIndex] || '';
                                  const count = productStats.data[opts.seriesIndex] || 0;
                                  return `${label}\n${count}건`;
                                },
                                style: {
                                  fontSize: '14px',
                                  fontWeight: 500,
                                },
                              },
                              tooltip: {
                                y: {
                                  formatter: (val: number) => `${val}건`,
                                },
                              },
                            }}
                            width="100%"
                            height="100%"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border bg-card flex flex-col overflow-hidden xl:col-span-4">
                    <div className="px-3 py-3 border-b space-y-2">
                      <Input
                        placeholder="제품명 / 메모 검색"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <DateRangePicker
                        startDate={historyRange.start}
                        endDate={historyRange.end}
                        onChange={(startDate, endDate) => {
                          setHistoryRange({ start: startDate ?? undefined, end: endDate ?? undefined });
                        }}
                        className="h-8 text-xs w-full"
                      />
                      <p className="text-xs font-semibold text-foreground pt-1">상담 이력 목록</p>
                    </div>
                    <ScrollArea className="flex-1 p-3">
                      <div className="space-y-3">
                {history.length === 0 && (
                          <div className="rounded-md border border-dashed p-6 text-center">
                            <p className="text-sm text-muted-foreground">전화번호를 입력하고 조회 버튼을 눌러</p>
                            <p className="text-sm text-muted-foreground">기존 상담 이력을 불러오세요.</p>
                  </div>
                )}
                        {filteredHistory.map((item) => {
                          const isActive = selectedHistory?.id === item.id;
                          return (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedHistory(item)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedHistory(item);
                                }
                              }}
                              className={`rounded-md border bg-background p-3 space-y-2.5 text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                isActive ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : 'hover:bg-accent/50'
                              }`}
                            >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                        {item.consultationDate
                          ? new Date(item.consultationDate).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })
                          : '-'}
                      </span>
                      <span>{item.managerName || '담당자 없음'}</span>
                    </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                      {item.type && (
                                <Badge variant="default" className="text-xs px-1.5 py-0">
                          {labelOr(typeMap, item.type)}
                                </Badge>
                      )}
                      {item.inOut && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {labelOr(inOutMap, item.inOut)}
                                </Badge>
                              )}
                            </div>
                            <div className="font-semibold text-foreground space-y-1.5">
                              {(() => {
                                // products 배열이 있으면 모든 제품 표시
                                if (item.products && item.products.length > 0) {
                                  return item.products.map((product, idx) => {
                                    const productName = labelOr(productMap, product.productName) || '-';
                                    const gradeName = product.grade ? labelOr(salesGradeMap, product.grade) : '';
                                    const packingTypeName = product.packingType ? labelOr(packingTypeMap, product.packingType) : '';
                                        const weightText = product.requestedWeight || '';
                                        const vehicleName = product.requestedVehicle ? labelOr(requestWeightMap, product.requestedVehicle) : '';
                                    
                                    const parts = [productName];
                                    if (gradeName) parts.push(`등급: ${gradeName}`);
                                    if (packingTypeName) parts.push(`포장: ${packingTypeName}`);
                                    
                                    return (
                                      <div key={idx} className="text-sm space-y-0.5">
                                        <div>{productName}</div>
                                        {(gradeName || packingTypeName) && (
                                          <div className="text-xs text-muted-foreground font-normal">
                                            {gradeName && <span>등급: {gradeName}</span>}
                                            {gradeName && packingTypeName && <span className="mx-1.5">·</span>}
                                            {packingTypeName && <span>포장: {packingTypeName}</span>}
                                          </div>
                                        )}
                                            {(weightText || vehicleName) && (
                                              <div className="text-xs text-muted-foreground font-normal">
                                                {weightText && <span>요청 중량: {weightText}</span>}
                                                {weightText && vehicleName && <span className="mx-1.5">·</span>}
                                                {vehicleName && <span>요청 차량: {vehicleName}</span>}
                                              </div>
                                            )}
                                      </div>
                                    );
                                  });
                                }
                                // 기존 호환성: productName 또는 inquiryProduct 사용
                                const productName = item.productName 
                                  ? labelOr(productMap, item.productName)
                                  : (item.inquiryProduct || '문의 제품 미정');
                                const gradeName = item.grade ? labelOr(salesGradeMap, item.grade) : '';
                                    const vehicleName = item.requestedWeight ? labelOr(requestWeightMap, item.requestedWeight) : '';
                                return (
                                  <div className="text-sm">
                                    {gradeName 
                                      ? `${productName}(${gradeName})`
                                      : productName}
                                        {vehicleName && (
                                          <div className="text-xs text-muted-foreground font-normal mt-0.5">
                                            요청 차량: {vehicleName}
                                          </div>
                                        )}
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {item.source && (
                                <div>
                                  <span className="text-muted-foreground/70">유입: </span>
                                  <span>{labelOr(sourceMap, item.source)}</span>
                                </div>
                              )}
                              {item.requestedWeight && (
                                <div>
                                  <span className="text-muted-foreground/70">요청 차량: </span>
                                  <span>{labelOr(requestWeightMap, item.requestedWeight)}</span>
                                </div>
                              )}
                              {(item.deliveryAddress || item.deliveryAddressDetail) && (
                                <div>
                                  <span className="text-muted-foreground/70">배송지: </span>
                                  <span>
                                    {item.deliveryPostalCode && `[${item.deliveryPostalCode}] `}
                                    {item.deliveryAddress || ''}
                                    {item.deliveryAddressDetail && ` ${item.deliveryAddressDetail}`}
                        </span>
                                </div>
                      )}
                              {item.proposedPrice && (
                                <div>
                                  <span className="text-muted-foreground/70">제안가: </span>
                                  <span>{item.proposedPrice}</span>
                    </div>
                              )}
                              {(item.hasUnloading || item.hasHandling) && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-muted-foreground/70">서비스: </span>
                                  {item.hasUnloading && (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">
                                      적출
                                    </Badge>
                                  )}
                                  {item.hasHandling && (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">
                                      하역
                                    </Badge>
                                  )}
                    </div>
                              )}
                            </div>
                            {item.notes && (
                              <div className="pt-2 border-t border-border/50">
                                <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                  {item.notes}
                                </div>
                              </div>
                            )}
                          </div>
                          );
                        })}
              </div>
                    </ScrollArea>
            </div>
                  </div>
                </div>
                {selectedHistory && (
                  <div className="absolute inset-0 z-20 bg-background/98 backdrop-blur-sm border-r border-border shadow-lg flex flex-col">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">상담 상세 보기</p>
                        <p className="text-xs text-muted-foreground">
                          {formatKoreanDate(selectedHistory.consultationDate)} ·{' '}
                          {selectedHistory.managerName || '담당자 없음'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedHistory(null)}
                        className="gap-1.5"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        목록으로
                      </Button>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-4 space-y-6">
                        <section className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold">상담 기본 정보</h4>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {selectedHistory.type && (
                                <Badge variant="secondary">
                                  {labelOr(typeMap, selectedHistory.type)}
                                </Badge>
                              )}
                              {selectedHistory.inOut && (
                                <Badge variant="outline">
                                  {labelOr(inOutMap, selectedHistory.inOut)}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-4 md:grid-cols-4">
                            <HistoryDetailRow
                              label="상담일"
                              value={formatKoreanDate(selectedHistory.consultationDate)}
                            />
                            <HistoryDetailRow
                              label="담당자"
                              value={selectedHistory.managerName || '-'}
                            />
                            <HistoryDetailRow
                              label="상담 유형"
                              value={selectedHistory.type ? labelOr(typeMap, selectedHistory.type) : '-'}
                            />
                            <HistoryDetailRow
                              label="유입 경로"
                              value={selectedHistory.source ? labelOr(sourceMap, selectedHistory.source) : '-'}
                            />
                            <HistoryDetailRow
                              label="IN/OUT"
                              value={selectedHistory.inOut ? labelOr(inOutMap, selectedHistory.inOut) : '-'}
                            />
                            <HistoryDetailRow
                              label="제안가"
                              value={selectedHistory.proposedPrice || '-'}
                            />
                            <HistoryDetailRow
                              label="적출 여부"
                              value={selectedHistory.hasUnloading ? '예' : '아니오'}
                            />
                            <HistoryDetailRow
                              label="하역 여부"
                              value={selectedHistory.hasHandling ? '예' : '아니오'}
                            />
                          </div>
                        </section>

                        <section className="space-y-3">
                          <h4 className="text-sm font-semibold">제품 정보</h4>
                          {selectedHistory.products && selectedHistory.products.length > 0 ? (
                            <div className="space-y-3">
                              {selectedHistory.products.map((product) => {
                                const categoryName =
                                  product.productCategoryId != null
                                    ? productCategoryMap.get(product.productCategoryId) || '-'
                                    : '-';
                                const productName = product.productName
                                  ? labelOr(productMap, product.productName)
                                  : '-';
                                const gradeName = product.grade
                                  ? labelOr(salesGradeMap, product.grade)
                                  : '-';
                                const packingName = product.packingType
                                  ? labelOr(packingTypeMap, product.packingType)
                                  : '-';
                                const vehicleName = product.requestedVehicle
                                  ? labelOr(requestWeightMap, product.requestedVehicle)
                                  : '-';
                                return (
                                  <div key={`${product.id}_${product.productName ?? ''}`} className="rounded-lg border bg-card p-4 space-y-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                      <HistoryDetailRow label="제품 분류" value={categoryName || '-'} />
                                      <HistoryDetailRow label="문의 제품" value={productName || '-'} />
                                      <HistoryDetailRow label="등급(세일즈)" value={gradeName || '-'} />
                                      <HistoryDetailRow label="포장 유형" value={packingName || '-'} />
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-4">
                                      <HistoryDetailRow label="요청 중량" value={product.requestedWeight || '-'} />
                                      <HistoryDetailRow label="요청 차량" value={vehicleName || '-'} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : selectedHistory.productName || selectedHistory.inquiryProduct ? (
                            <div className="rounded-lg border bg-card p-4 space-y-2">
                              <HistoryDetailRow
                                label="문의 제품"
                                value={
                                  selectedHistory.productName
                                    ? labelOr(productMap, selectedHistory.productName)
                                    : selectedHistory.inquiryProduct || '-'
                                }
                              />
                              <HistoryDetailRow
                                label="등급(세일즈)"
                                value={
                                  selectedHistory.grade
                                    ? labelOr(salesGradeMap, selectedHistory.grade)
                                    : '-'
                                }
                              />
                              <HistoryDetailRow
                                label="요청 차량"
                                value={
                                  selectedHistory.requestedWeight
                                    ? labelOr(requestWeightMap, selectedHistory.requestedWeight)
                                    : '-'
                                }
                              />
                            </div>
                          ) : (
                            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                              제품 정보가 없습니다.
                            </div>
                          )}
                        </section>

                        <section className="space-y-3">
                          <h4 className="text-sm font-semibold">배송 정보</h4>
                          <div className="grid gap-4 md:grid-cols-4">
                            <HistoryDetailRow label="우편번호" value={selectedHistory.deliveryPostalCode || '-'} />
                            <HistoryDetailRow label="지역" value={selectedHistory.deliveryRegion || '-'} />
                            <HistoryDetailRow label="시/군/구" value={selectedHistory.deliveryCity || '-'} />
                            <div className="hidden md:block" />
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <HistoryDetailRow label="주소" value={selectedHistory.deliveryAddress || '-'} />
                            <HistoryDetailRow label="상세주소" value={selectedHistory.deliveryAddressDetail || '-'} />
                          </div>
                        </section>

                        <section className="space-y-2">
                          <h4 className="text-sm font-semibold">상담 메모</h4>
                          <div className="min-h-[80px] rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                            {selectedHistory.notes ? (
                              selectedHistory.notes
                            ) : (
                              <span className="text-muted-foreground">메모가 없습니다.</span>
                            )}
                          </div>
                        </section>
                      </div>
                    </ScrollArea>
                  </div>
                )}
          </div>
          )}

            {/* 오른쪽: 상담 입력 폼 */}
            <div className="flex-[5] min-w-0 flex flex-col">
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-8">
                  <section className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">고객 정보</h3>
                      <p className="text-xs text-muted-foreground">기본 고객 정보와 주소, 축종 정보를 입력합니다.</p>
                    </div>
                    {/* 기본 정보 */}
                    <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">전화번호 *</Label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                      <Input
                        id="phone"
                        placeholder="010-1234-5678"
                        {...register('phone', {
                          required: '전화번호는 필수입니다.',
                          onChange: (e) => {
                            const formatted = formatPhone(e.target.value);
                            setValue('phone', formatted, { shouldDirty: true, shouldValidate: true });
                          },
                        })}
                            disabled={mode === 'edit'}
                      />
                        </div>
                        {mode === 'create' && (
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
                        )}
                    </div>
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">업체명 / 농장명</Label>
                    <div className="flex gap-2">
                      <Input
                        id="companyName"
                        placeholder="업체명"
                        className="flex-1"
                        {...register('companyName')}
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
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ceo">대표자</Label>
                    <Input id="ceo" placeholder="대표자명" {...register('ceo')} />
                  </div>
                    <div className="space-y-2">
                      <Label htmlFor="chamchamStatus">참참 여부</Label>
                      <Select
                        value={chamchamValue}
                        onValueChange={(v) =>
                          setValue('chamchamStatus', v === '__none__' ? undefined : v, { shouldDirty: true })
                        }
                      >
                        <SelectTrigger id="chamchamStatus">
                          <SelectValue placeholder="선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">선택 안함</SelectItem>
                          {chamchamOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                    {/* 고객 주소 및 지역 */}
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label htmlFor="customerPostalCode">우편번호</Label>
                          <div className="flex gap-2">
                            <Input
                              id="customerPostalCode"
                              placeholder="우편번호"
                            {...register('customerPostalCode')}
                              readOnly
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
                  <Label htmlFor="region">지역</Label>
                  <Select
                          value={selectedCustomerRegion}
                          onValueChange={(v) => {
                            const nextValue = v === '__none__' ? undefined : v;
                            setValue('region', nextValue, { shouldDirty: true });
                            if (v === '__none__') {
                              setValue('customerCity', undefined, { shouldDirty: true });
                              setPendingCustomerCity(null);
                            }
                          }}
                  >
                    <SelectTrigger id="region">
                              <SelectValue placeholder="지역을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                              <SelectItem value="__none__">선택 안함</SelectItem>
                      {regionOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
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
                            setValue('customerCity', value === '__none__' ? undefined : value, { shouldDirty: true })
                          }
                          disabled={!selectedCustomerRegion || selectedCustomerRegion === '__none__'}
                        >
                          <SelectTrigger id="customerCity">
                            <SelectValue placeholder={selectedCustomerRegion === '__none__' ? '지역 선택 후' : '시/군/구'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {customerCities?.map((city, index) => {
                              // city.id가 없으면 index를 사용하되, regionId와 조합하여 고유성 보장
                              const cityKey = city?.id != null && city.id !== undefined 
                                ? `customer-city-${city.id}` 
                                : `customer-city-${selectedCustomerRegionId ?? 'all'}-${index}`;
                              if (!city?.id) {
                                console.warn('City without id:', city, 'at index', index);
                              }
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
                            placeholder="주소"
                            {...register('customerAddress')}
                            readOnly
                            className="cursor-pointer bg-muted"
                            onClick={handleCustomerAddressSearch}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="addressDetail">상세주소</Label>
                  <Input id="addressDetail" placeholder="상세주소" {...register('addressDetail')} />
                  </div>
                      </div>
                    </div>

                    {/* 고객 정보 (축종 등) */}
                    <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                  <Label htmlFor="species">축종</Label>
                  <Select
                        value={speciesValue}
                        onValueChange={(v) => setValue('species', v === '__none__' ? undefined : v, { shouldDirty: true })}
                  >
                    <SelectTrigger id="species">
                      <SelectValue placeholder="선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                          <SelectItem value="__none__">선택 안함</SelectItem>
                      {speciesOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  </div>
                  <div className="space-y-2">
                  <Label htmlFor="feeding">사료형태</Label>
                  <Select
                        value={feedingValue}
                        onValueChange={(v) => setValue('feeding', v === '__none__' ? undefined : v, { shouldDirty: true })}
                  >
                    <SelectTrigger id="feeding">
                      <SelectValue placeholder="선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                          <SelectItem value="__none__">선택 안함</SelectItem>
                      {feedingOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  </div>
                  <div className="hidden md:block" />
                  <div className="hidden md:block" />
                  {/* 운영방식 정보 */}
                  <div className="col-span-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>운영형태</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addOperation}
                        className="h-8"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        추가
                      </Button>
                    </div>
                    {operations.map((op) => (
                      <div key={op.id} className="relative rounded-lg border p-4 space-y-3">
                        {operations.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-2 h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => removeOperation(op.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label>운영방식</Label>
                            <Select
                              value={op.operation || '__none__'}
                              onValueChange={(v) => updateOperation(op.id, 'operation', v === '__none__' ? '' : v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="선택하세요" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">선택 안함</SelectItem>
                                {operationOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>세부 유형</Label>
                            <Select
                              value={op.operationSub || '__none__'}
                              onValueChange={(v) => updateOperation(op.id, 'operationSub', v === '__none__' ? null : v)}
                              disabled={!op.operation || op.operation === 'COMPANY'}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={op.operation === 'COMPANY' ? '세부 유형 없음' : '선택하세요'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">선택 안함</SelectItem>
                                {operationSubOptions
                                  .filter((opt) => {
                                    // 한우(BEEF)인 경우: 일괄, 번식, 비육, 육성
                                    if (op.operation === 'BEEF') {
                                      return ['INTEGRATED', 'BREEDING', 'FATTENING', 'RAISING'].includes(opt.value);
                                    }
                                    // 낙농(DAIRY)인 경우: 착유, 건유
                                    if (op.operation === 'DAIRY') {
                                      return ['MILKING', 'DRY_MILKING'].includes(opt.value);
                                    }
                                    return false;
                                  })
                                  .map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>사육두수</Label>
                            <Input
                              type="number"
                              placeholder="사육두수"
                              value={op.herdSize ?? ''}
                              onChange={(e) => updateOperation(op.id, 'herdSize', e.target.value ? parseInt(e.target.value, 10) : null)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  </div>
                  </section>

                  <Separator />

                  <section className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">상담 정보</h3>
                      <p className="text-xs text-muted-foreground">상담 일정과 요청 사항, 배송 및 서비스 정보를 입력합니다.</p>
                  </div>

                  {/* 상담일, 상담유형, 유입경로, IN/OUT */}
                  <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="consultationDate">상담일</Label>
                    <DatePicker
                      value={watch('consultationDate') || ''}
                      onChange={(v) => setValue('consultationDate', v ?? '', { shouldDirty: true })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">상담 유형</Label>
                    <Select
                      value={typeValue}
                      onValueChange={(v) => setValue('type', v === '__none__' ? undefined : v, { shouldDirty: true })}
                    >
                      <SelectTrigger id="type">
                        <SelectValue placeholder="선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안함</SelectItem>
                        {consultationTypeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="source">유입 경로</Label>
                    <Select
                      value={sourceValue}
                      onValueChange={(v) => setValue('source', v === '__none__' ? undefined : v, { shouldDirty: true })}
                    >
                      <SelectTrigger id="source">
                        <SelectValue placeholder="선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안함</SelectItem>
                        {consultationSourceOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inOut">IN / OUT</Label>
                    <Select
                      value={inOutValue}
                      onValueChange={(v) => setValue('inOut', v === '__none__' ? undefined : v, { shouldDirty: true })}
                    >
                      <SelectTrigger id="inOut">
                        <SelectValue placeholder="선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안함</SelectItem>
                        {consultationInOutOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </div>

                  {/* 담당, 주 사용제품, 도착가 */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="managerDisplay">담당</Label>
                      <Input
                        id="managerDisplay"
                        value={managerDisplay}
                        readOnly
                        disabled
                        className="w-full bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mainProduct">주 사용제품</Label>
                      <Select
                        value={watch('mainProduct') || '__none__'}
                        onValueChange={(v) => setValue('mainProduct', v === '__none__' ? '' : v, { shouldDirty: true })}
                      >
                        <SelectTrigger id="mainProduct">
                          <SelectValue placeholder="선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">선택 안함</SelectItem>
                          {allProducts?.map((product) => (
                            <SelectItem key={product.id} value={product.value ?? product.name}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="arrivalPrice">도착가</Label>
                      <Input
                        id="arrivalPrice"
                        type="text"
                        value={
                          watch('arrivalPrice')
                            ? Number(watch('arrivalPrice')?.replace(/,/g, '') || 0).toLocaleString('ko-KR')
                            : ''
                        }
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/,/g, '');
                          if (cleaned === '' || /^\d+$/.test(cleaned)) {
                            setValue('arrivalPrice', cleaned, { shouldDirty: true });
                          }
                        }}
                        placeholder="금액을 입력하세요"
                      />
                    </div>
                    <div></div>
                  </div>

                  {/* 제품 정보 배열 (제품 분류, 문의 제품, 등급) */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>제품 정보</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addProduct}
                        className="h-8"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        추가
                      </Button>
                    </div>
                    {products.map((product) => {
                      const filteredProductsForItem = getFilteredProductsForItem(product.categoryId);
                      return (
                        <div key={product.id} className="relative border rounded-lg p-4 space-y-4">
                          {products.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeProduct(product.id)}
                              className="absolute top-3 right-3 h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <div className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-2">
                              <Label>제품 분류</Label>
                              <Select
                                value={product.categoryId?.toString() ?? '__none__'}
                                onValueChange={(v) => {
                                  const categoryId = v === '__none__' ? null : parseInt(v, 10);
                                  setProducts((prevProducts) =>
                                    prevProducts.map((p) =>
                                      p.id === product.id ? { ...p, categoryId, productName: '' } : p,
                                    ),
                                  );
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="선택하세요" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">선택 안함</SelectItem>
                                  {productCategories?.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id.toString()}>
                                      {cat.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>문의 제품</Label>
                              <Select
                                value={product.productName || '__none__'}
                                onValueChange={(v) => updateProduct(product.id, 'productName', v === '__none__' ? '' : v)}
                                disabled={!product.categoryId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={product.categoryId ? '제품 선택' : '분류 선택 후'} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">선택 안함</SelectItem>
                                  {filteredProductsForItem.map((p) => (
                                    <SelectItem key={p.id} value={p.value ?? p.name}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>등급(세일즈)</Label>
                              <Select
                                value={product.grade || '__none__'}
                                onValueChange={(v) => updateProduct(product.id, 'grade', v === '__none__' ? '' : v)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="선택하세요" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">선택 안함</SelectItem>
                                  {salesGradeOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>포장유형</Label>
                              <Select
                                value={product.packingType || '__none__'}
                                onValueChange={(v) => updateProduct(product.id, 'packingType', v === '__none__' ? '' : v)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="선택하세요" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">선택 안함</SelectItem>
                                  {packingTypeOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-2">
                              <Label>요청 중량</Label>
                              <Input
                                placeholder="예: 20톤"
                                value={product.requestedWeight}
                                onChange={(e) => updateProduct(product.id, 'requestedWeight', e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>요청 차량</Label>
                              <Select
                                value={product.requestedVehicle || '__none__'}
                                onValueChange={(v) => updateProduct(product.id, 'requestedVehicle', v === '__none__' ? '' : v)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="선택하세요" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">선택 안함</SelectItem>
                                  {requestWeightOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2" />
                            <div className="space-y-2" />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 적출여부, 하역여부, 제안가 */}
                  <div className="grid gap-4 md:grid-cols-4">
                  <label className="flex items-center space-x-2 text-sm font-medium text-foreground">
                    <Checkbox
                      checked={!!watch('hasUnloading')}
                      onCheckedChange={(checked) => setValue('hasUnloading', checked === true)}
                    />
                    <span>적출 여부</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm font-medium text-foreground">
                    <Checkbox
                      checked={!!watch('hasHandling')}
                      onCheckedChange={(checked) => setValue('hasHandling', checked === true)}
                    />
                    <span>하역 여부</span>
                  </label>
                  <div className="space-y-2">
                    <Label htmlFor="proposedPrice">제안가</Label>
                    <Input id="proposedPrice" placeholder="제안가" {...register('proposedPrice')} />
                  </div>
                  <div></div>
                  </div>

                  {/* 메모 */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">상담 메모</Label>
                    <Textarea
                      id="notes"
                      rows={4}
                      placeholder="상담 내용을 입력하세요"
                      {...register('notes')}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="reply-progress-status">답변 진행상태</Label>
                        <Select
                          value={
                            (replyStatusWatch && String(replyStatusWatch).trim()) || '__none__'
                          }
                          onValueChange={(v) =>
                            setValue('replyStatus', v === '__none__' ? '' : v, { shouldDirty: true })
                          }
                        >
                          <SelectTrigger id="reply-progress-status" className="w-full">
                            <SelectValue placeholder="선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {(replyStatusCodes ?? [])
                              .slice()
                              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                              .map((c) => {
                                const val = (c.value ?? c.name ?? '').trim();
                                if (!val) return null;
                                const label = (c.name ?? c.value ?? val).trim() || val;
                                return (
                                  <SelectItem key={c.id} value={val}>
                                    {label}
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reply-assignee">답변 담당자</Label>
                        <Select
                          value={
                            replyAssigneeIdWatch != null && !Number.isNaN(Number(replyAssigneeIdWatch))
                              ? String(replyAssigneeIdWatch)
                              : '__none__'
                          }
                          onValueChange={(v) =>
                            setValue(
                              'replyAssigneeId',
                              v === '__none__' ? null : Number(v),
                              { shouldDirty: true },
                            )
                          }
                        >
                          <SelectTrigger id="reply-assignee" className="w-full">
                            <SelectValue placeholder="영업팀원 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {salesUsersForReply.map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>
                                {u.name || u.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="hidden md:block" />
                      <div className="hidden md:block" />
                  </div>

                  {/* 배송지 */}
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">배송지 주소</h4>
                        <p className="text-xs text-muted-foreground">
                          고객 주소와 동일하게 사용하거나, 필요 시 별도로 수정하세요.
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <Checkbox
                          checked={syncDeliveryAddress}
                          onCheckedChange={(checked) => setSyncDeliveryAddress(checked === true)}
                        />
                        <span>고객 주소와 동일</span>
                      </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="deliveryPostalCode">우편번호</Label>
                        <div className="flex gap-2">
                          <Input
                            id="deliveryPostalCode"
                            placeholder="우편번호"
                            {...register('deliveryPostalCode')}
                            readOnly
                            className={syncDeliveryAddress ? 'bg-muted' : 'cursor-pointer bg-muted'}
                            onClick={syncDeliveryAddress ? undefined : handleAddressSearch}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleAddressSearch}
                            className="flex-shrink-0"
                            size="icon"
                            title="주소검색"
                            disabled={syncDeliveryAddress}
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="hidden md:block" />
                      <div className="space-y-2">
                        <Label htmlFor="deliveryRegion">지역</Label>
                        <Select
                          value={selectedDeliveryRegion}
                          onValueChange={(v) => {
                            const nextValue = v === '__none__' ? undefined : v;
                            setValue('deliveryRegion', nextValue, { shouldDirty: true });
                            if (v === '__none__') {
                              setValue('deliveryCity', undefined, { shouldDirty: true });
                              setPendingDeliveryCity(null);
                            }
                          }}
                          disabled={syncDeliveryAddress}
                        >
                          <SelectTrigger id="deliveryRegion">
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
                        <Label htmlFor="deliveryCity">시/군/구</Label>
                        <Select
                          value={watch('deliveryCity') || '__none__'}
                          onValueChange={(value) =>
                            setValue('deliveryCity', value === '__none__' ? undefined : value, { shouldDirty: true })
                          }
                          disabled={
                            syncDeliveryAddress || !selectedDeliveryRegion || selectedDeliveryRegion === '__none__'
                          }
                        >
                          <SelectTrigger id="deliveryCity">
                            <SelectValue
                              placeholder={selectedDeliveryRegion === '__none__' ? '지역 선택 후' : '시/군/구'}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {deliveryCities?.map((city, index) => {
                              const cityKey =
                                city?.id != null && city.id !== undefined
                                  ? `delivery-city-${city.id}`
                                  : `delivery-city-${selectedDeliveryRegionId ?? 'all'}-${index}`;
                              if (!city?.id) {
                                console.warn('City without id:', city, 'at index', index);
                              }
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
                        <Label htmlFor="deliveryAddress">주소</Label>
                        <Input
                          id="deliveryAddress"
                          placeholder="주소"
                          {...register('deliveryAddress')}
                          readOnly
                          className={syncDeliveryAddress ? 'bg-muted' : 'cursor-pointer bg-muted'}
                          onClick={syncDeliveryAddress ? undefined : handleAddressSearch}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="deliveryAddressDetail">상세주소</Label>
                        <Input
                          id="deliveryAddressDetail"
                          placeholder="상세주소"
                          {...register('deliveryAddressDetail')}
                          readOnly={syncDeliveryAddress}
                        />
                      </div>
                    </div>
                  </div>
                </section>
                </div>
              </div>
            </div>
          </div>
          
          <DrawerFooter className="border-t border-border">
            <div className="flex justify-end gap-2 w-full">
              {mode === 'edit' && onCancel ? (
                <Button type="button" variant="outline" onClick={onCancel}>
                  <XCircle className="mr-1.5 h-4 w-4" />
                  취소
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  <XCircle className="mr-1.5 h-4 w-4" />
                  취소
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-4 w-4" />
                    {submitLabel}
                  </>
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>

        {isClient &&
          createPortal(
            <div
              style={{
                pointerEvents: activeAddressModal === 'delivery' ? 'auto' : 'none',
                opacity: activeAddressModal === 'delivery' ? 1 : 0,
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 11000,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                transition: 'opacity 0.15s ease-in-out',
              }}
              onClick={closeAddressSearch}
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
                    onClick={closeAddressSearch}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div ref={deliveryAddressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
              </div>
            </div>,
            document.body,
          )}

        {isClient &&
          createPortal(
            <div
              style={{
                pointerEvents: activeAddressModal === 'customer' ? 'auto' : 'none',
                opacity: activeAddressModal === 'customer' ? 1 : 0,
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 11000,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                transition: 'opacity 0.15s ease-in-out',
              }}
              onClick={closeAddressSearch}
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
                    onClick={closeAddressSearch}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div ref={customerAddressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
              </div>
            </div>,
            document.body,
          )}
      </DrawerContent>
    </Drawer>
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

