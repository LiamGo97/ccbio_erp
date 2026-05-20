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
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Save, MapPin, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { CustomerDeliveryAddressFormDialog } from '@/components/customers/customer-delivery-address-form-dialog';
import type { UseFormSetValue } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { useUnloadingCompanies } from '@/lib/hooks/use-unloading-companies';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useRegions } from '@/lib/hooks/use-regions';
import { useCities } from '@/lib/hooks/use-cities';
import { DatePicker } from '@/components/schedules/date-picker';
import { SalesDelivery, useUpdateSalesDelivery } from '@/lib/hooks/use-sales-delivery';
import { useIsMobile } from '@/hooks/use-mobile';
import api from '@/lib/api';
import type { DaumPostcodeData } from '@/types/daum-postcode';
import { cn } from '@/lib/utils';
import {
  useCustomerDeliveryAddresses,
  type Customer,
  type CustomerDeliveryAddress,
} from '@/lib/hooks/use-customers';
import { formatCustomerListDefaultAddress } from '@/lib/customer-default-address-kind';
import { salesUnloadingMainLine } from '@/lib/sales-unloading-display';
import { SalesDeliverySalesNotesSection } from './sales-delivery-sales-notes-section';

function resolveUnloadingLineFromParts(data: {
  unloadingAddressRoad?: string;
  unloadingAddressJibun?: string;
  unloadingAddressDefaultType?: string;
}): string {
  return formatCustomerListDefaultAddress({
    address: '',
    addressRoad: data.unloadingAddressRoad ?? '',
    addressJibun: data.unloadingAddressJibun ?? '',
    addressDefaultType: data.unloadingAddressDefaultType ?? '',
  } as Customer);
}

interface SalesDeliveryEditFormData {
  // 하차지 주소
  unloadingPostalCode: string;
  unloadingAddress: string;
  unloadingAddressRoad: string;
  unloadingAddressJibun: string;
  unloadingLegalBCode: string;
  unloadingAddressDefaultType: string;
  unloadingAddressDetail: string;
  unloadingRegion: string;
  unloadingCity: string;
  unloadingScheduleDate: string;
  unloadingScheduleTime: string;
  // 배차 정보
  dispatchCompanyId: string;
  requestVehicle: string;
  requestWeight: string;
  freightPaymentType: string;
  /** 운송비 지급 상태 (내부용) */
  transportFeePaymentStatus: string;
  loadingSchedule: string;
  loadingScheduleTime: string;
  unloadingCompanyId: string;
  directUnloadingContact: string;
  notes: string;
  // 상차지 정보
  loadingItems?: Array<{
    requestNotes?: string;
    notes?: string;
  }>;
}

const UNLOADING_CHOICE_CUSTOMER_DEFAULT = '__customer_default__';
const UNLOADING_CHOICE_SALE_SNAPSHOT = '__sale_snapshot__';

/** 판매 sales-form-drawer와 동일 — 선택이 저장 배송지 행 id인지 */
function isSavedDeliveryAddressChoice(choice: string, rows: CustomerDeliveryAddress[]): boolean {
  return (
    choice !== UNLOADING_CHOICE_CUSTOMER_DEFAULT &&
    choice !== UNLOADING_CHOICE_SALE_SNAPSHOT &&
    rows.some((a) => a.id === choice)
  );
}

interface DeliveryUnloadingSnap {
  unloadingPostalCode: string;
  unloadingAddress: string;
  unloadingAddressRoad: string;
  unloadingAddressJibun: string;
  unloadingLegalBCode: string;
  unloadingAddressDefaultType: string;
  unloadingAddressDetail: string;
  unloadingRegion: string;
  unloadingCity: string;
}

function savedDeliveryAddressLabel(row: CustomerDeliveryAddress): string {
  const title = row.label?.trim() || '배송지';
  const line = formatCustomerListDefaultAddress({
    id: row.customerId,
    region: '',
    address: '',
    addressDetail: '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: row.addressRoad,
    addressJibun: row.addressJibun,
    addressDefaultType: row.addressDefaultType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Customer);
  const bits = [row.postalCode?.trim(), line].filter((s) => (s || '').trim().length > 0);
  return bits.length > 0 ? `${title} · ${bits.join(' ')}` : `${title} · 주소 없음`;
}

function deliveryRowMatchesUnloading(
  row: CustomerDeliveryAddress,
  postal: string | undefined,
  line: string | undefined,
  detail: string | undefined,
): boolean {
  const resolvedLine = formatCustomerListDefaultAddress({
    id: row.customerId,
    region: '',
    address: '',
    addressDetail: row.addressDetail ?? '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: row.addressRoad,
    addressJibun: row.addressJibun,
    addressDefaultType: row.addressDefaultType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Customer);
  return (
    (postal || '').trim() === (row.postalCode || '').trim() &&
    (line || '').trim() === (resolvedLine || '').trim() &&
    (detail || '').trim() === (row.addressDetail || '').trim()
  );
}

function customerDefaultMatchesUnloading(
  customer: NonNullable<NonNullable<SalesDelivery['sales']>['customer']>,
  postal: string,
  line: string,
  detail: string,
): boolean {
  const resolvedLine = formatCustomerListDefaultAddress({
    id: customer.id,
    region: '',
    address: '',
    addressDetail: customer.addressDetail ?? '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: customer.addressRoad,
    addressJibun: customer.addressJibun,
    addressDefaultType: customer.addressDefaultType,
    createdAt: '',
    updatedAt: '',
  } as Customer);
  return (
    postal === (customer.postalCode || '').trim() &&
    line === (resolvedLine || '').trim() &&
    detail === (customer.addressDetail || '').trim()
  );
}

function applyUnloadingFromSavedDeliveryRow(
  row: CustomerDeliveryAddress,
  setValue: UseFormSetValue<SalesDeliveryEditFormData>,
) {
  const road = row.addressRoad?.trim() || '';
  const jibun = row.addressJibun?.trim() || '';
  const udt = row.addressDefaultType === 'JIBUN' ? 'JIBUN' : 'ROAD';
  const pseudo = {
    id: row.customerId,
    region: '',
    address: '',
    addressDetail: row.addressDetail ?? '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: row.addressRoad,
    addressJibun: row.addressJibun,
    addressDefaultType: row.addressDefaultType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Customer;
  const mainLine = formatCustomerListDefaultAddress(pseudo);
  const bcode = (row.legalBCode ?? '').replace(/\D/g, '').slice(0, 10);
  setValue('unloadingPostalCode', row.postalCode?.trim() || '', { shouldDirty: true });
  setValue('unloadingAddressRoad', road, { shouldDirty: true });
  setValue('unloadingAddressJibun', jibun, { shouldDirty: true });
  setValue('unloadingAddressDefaultType', udt, { shouldDirty: true });
  setValue('unloadingLegalBCode', bcode, { shouldDirty: true });
  setValue('unloadingAddress', mainLine || '', { shouldDirty: true });
  setValue('unloadingAddressDetail', row.addressDetail?.trim() || '', { shouldDirty: true });
  setValue('unloadingRegion', '', { shouldDirty: true });
  setValue('unloadingCity', '', { shouldDirty: true });
}

function applyUnloadingFromCustomerDefaultForDelivery(
  customer: NonNullable<NonNullable<SalesDelivery['sales']>['customer']>,
  regions: Array<{ id: number; name: string }> | undefined,
  setValue: UseFormSetValue<SalesDeliveryEditFormData>,
) {
  const road = customer.addressRoad?.trim() || '';
  const jibun = customer.addressJibun?.trim() || '';
  const udt = customer.addressDefaultType === 'JIBUN' ? 'JIBUN' : 'ROAD';
  const line = formatCustomerListDefaultAddress({
    id: customer.id,
    region: '',
    address: '',
    addressDetail: customer.addressDetail ?? '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: customer.addressRoad,
    addressJibun: customer.addressJibun,
    addressDefaultType: customer.addressDefaultType,
    createdAt: '',
    updatedAt: '',
  } as Customer);
  const bcode = (customer.legalBCode ?? '').replace(/\D/g, '').slice(0, 10);
  setValue('unloadingPostalCode', customer.postalCode?.trim() || '', { shouldDirty: true });
  setValue('unloadingAddressRoad', road, { shouldDirty: true });
  setValue('unloadingAddressJibun', jibun, { shouldDirty: true });
  setValue('unloadingAddressDefaultType', udt, { shouldDirty: true });
  setValue('unloadingLegalBCode', bcode, { shouldDirty: true });
  setValue('unloadingAddress', line || customer.address?.trim() || '', { shouldDirty: true });
  setValue('unloadingAddressDetail', customer.addressDetail?.trim() || '', { shouldDirty: true });
  const regionName =
    customer.regionEntity?.name ??
    regions?.find((r) => r.id === customer.regionId)?.name ??
    '';
  setValue('unloadingRegion', regionName, { shouldDirty: true });
  setValue('unloadingCity', customer.cityEntity?.name ?? '', { shouldDirty: true });
}

function applyDeliveryUnloadingSnapshot(
  snap: DeliveryUnloadingSnap,
  setValue: UseFormSetValue<SalesDeliveryEditFormData>,
) {
  setValue('unloadingPostalCode', snap.unloadingPostalCode, { shouldDirty: true });
  setValue('unloadingAddress', snap.unloadingAddress, { shouldDirty: true });
  setValue('unloadingAddressRoad', snap.unloadingAddressRoad, { shouldDirty: true });
  setValue('unloadingAddressJibun', snap.unloadingAddressJibun, { shouldDirty: true });
  setValue('unloadingLegalBCode', snap.unloadingLegalBCode, { shouldDirty: true });
  setValue('unloadingAddressDefaultType', snap.unloadingAddressDefaultType, { shouldDirty: true });
  setValue('unloadingAddressDetail', snap.unloadingAddressDetail, { shouldDirty: true });
  setValue('unloadingRegion', snap.unloadingRegion, { shouldDirty: true });
  setValue('unloadingCity', snap.unloadingCity, { shouldDirty: true });
}

function detectInitialUnloadingChoice(
  delivery: SalesDelivery,
  snap: DeliveryUnloadingSnap,
  rows: CustomerDeliveryAddress[],
): string {
  const postal = (snap.unloadingPostalCode || '').trim();
  const line = (snap.unloadingAddress || '').trim();
  const detail = (snap.unloadingAddressDetail || '').trim();
  const customer = delivery.sales?.customer;
  if (customer && customerDefaultMatchesUnloading(customer, postal, line, detail)) {
    return UNLOADING_CHOICE_CUSTOMER_DEFAULT;
  }
  const matched = rows.find((r) => deliveryRowMatchesUnloading(r, postal, line, detail));
  if (matched) return matched.id;
  return UNLOADING_CHOICE_SALE_SNAPSHOT;
}

interface SalesDeliveryEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: SalesDelivery | null;
  onSuccess?: () => void;
}

// 주소 검색 API에서 받은 지역명을 DB에 저장된 지역명으로 정규화 (판매 등록과 동일)
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

export function SalesDeliveryEditDrawer({
  open,
  onOpenChange,
  delivery,
  onSuccess,
}: SalesDeliveryEditDrawerProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateSalesDelivery();
  const [addDeliveryAddressDialogOpen, setAddDeliveryAddressDialogOpen] = React.useState(false);

  const unloadingSnapshotRef = React.useRef<DeliveryUnloadingSnap | null>(null);
  const unloadingChoiceInitRef = React.useRef<string | null>(null);
  /** 주소검색 직후 시·군구 목록이 아직 새 지역 기준이 아닐 때 — 판매 sales-form-drawer와 동일 */
  const [pendingUnloadingCity, setPendingUnloadingCity] = React.useState<string | null>(null);
  const [unloadingAddressChoice, setUnloadingAddressChoice] = React.useState<string>(
    UNLOADING_CHOICE_CUSTOMER_DEFAULT,
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
  } = useForm<SalesDeliveryEditFormData>({
    defaultValues: {
      unloadingPostalCode: '',
      unloadingAddress: '',
      unloadingAddressRoad: '',
      unloadingAddressJibun: '',
      unloadingLegalBCode: '',
      unloadingAddressDefaultType: '',
      unloadingAddressDetail: '',
      unloadingRegion: '',
      unloadingCity: '',
      unloadingScheduleDate: '',
      unloadingScheduleTime: '',
      dispatchCompanyId: '',
      requestVehicle: '',
      requestWeight: '',
      freightPaymentType: '',
      transportFeePaymentStatus: 'UNPAID',
      loadingSchedule: '',
      loadingScheduleTime: '',
      unloadingCompanyId: '',
      directUnloadingContact: '',
      notes: '',
      loadingItems: [],
    },
  });

  // 코드 데이터
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: freightPaymentTypeCodes } = useCodeMastersByGroup('FREIGHT_PAYMENT_TYPE');
  const { data: transportFeePaymentStatusCodes } = useCodeMastersByGroup('TRANSPORT_FEE_PAYMENT_STATUS');
  const { data: regions } = useRegions();
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  const { data: unloadingCompanies = [] } = useUnloadingCompanies();
  const { data: warehouses = [] } = useWarehouses({ status: true });

  const customerIdForAddresses =
    open && delivery ? delivery.sales?.customerId ?? delivery.sales?.customer?.id : undefined;
  const {
    data: savedDeliveryAddresses = [],
    isLoading: savedDeliveryAddressesLoading,
  } = useCustomerDeliveryAddresses(customerIdForAddresses);

  const savedDeliveryAddressesRef = React.useRef(savedDeliveryAddresses);
  React.useEffect(() => {
    savedDeliveryAddressesRef.current = savedDeliveryAddresses;
  }, [savedDeliveryAddresses]);

  const unloadingAddressChoiceRef = React.useRef(unloadingAddressChoice);
  React.useEffect(() => {
    unloadingAddressChoiceRef.current = unloadingAddressChoice;
  }, [unloadingAddressChoice]);

  /** 판매 수정 markUnloadingManualEdit와 동일 — 대표/저장 배송지 선택 유지, 그 외만 스냅샷으로 */
  const markUnloadingManualEdit = React.useCallback(() => {
    const cur = unloadingAddressChoiceRef.current;
    if (isSavedDeliveryAddressChoice(cur, savedDeliveryAddressesRef.current)) {
      return;
    }
    if (cur === UNLOADING_CHOICE_CUSTOMER_DEFAULT) {
      return;
    }
    setUnloadingAddressChoice(UNLOADING_CHOICE_SALE_SNAPSHOT);
  }, []);

  const warehouseMap = React.useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach((wh) => {
      if (wh.id) map.set(wh.id, wh.name || '');
    });
    return map;
  }, [warehouses]);

  const getWarehouseName = (id?: number | string | null) => {
    if (!id) return '-';
    // id가 문자열이면 그대로 반환 (이미 이름인 경우)
    if (typeof id === 'string') {
      return id.trim() || '-';
    }
    // 숫자면 코드 마스터에서 조회
    return warehouseMap.get(id) || '-';
  };

  // 하차지 주소 관련
  React.useEffect(() => {
    if (!open) {
      unloadingChoiceInitRef.current = null;
      setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
      setPendingUnloadingCity(null);
      setAddDeliveryAddressDialogOpen(false);
    }
  }, [open]);

  const unloadingSelectValue = React.useMemo(() => {
    if (unloadingAddressChoice === UNLOADING_CHOICE_CUSTOMER_DEFAULT) {
      return UNLOADING_CHOICE_CUSTOMER_DEFAULT;
    }
    if (unloadingAddressChoice === UNLOADING_CHOICE_SALE_SNAPSHOT) {
      return UNLOADING_CHOICE_SALE_SNAPSHOT;
    }
    if (savedDeliveryAddresses.some((a) => a.id === unloadingAddressChoice)) {
      return unloadingAddressChoice;
    }
    return UNLOADING_CHOICE_CUSTOMER_DEFAULT;
  }, [unloadingAddressChoice, savedDeliveryAddresses]);

  const unloadingRegionValue = watch('unloadingRegion') || '__none__';
  const unloadingRegionId = React.useMemo(() => {
    if (!unloadingRegionValue || unloadingRegionValue === '__none__' || unloadingRegionValue === '') {
      // delivery에서 직접 지역 ID 가져오기
      if (delivery?.unloadingRegionId) return delivery.unloadingRegionId;
      return undefined;
    }
    return regions?.find((r) => r.name === unloadingRegionValue)?.id;
  }, [unloadingRegionValue, regions, delivery]);
  const { data: unloadingCities } = useCities(unloadingRegionId);

  React.useEffect(() => {
    if (!pendingUnloadingCity) return;
    if (!unloadingCities || unloadingCities.length === 0) return;
    const matched = unloadingCities.find((c) => c.name === pendingUnloadingCity);
    if (matched) {
      setValue('unloadingCity', matched.name, { shouldDirty: true, shouldValidate: true });
      setPendingUnloadingCity(null);
    }
  }, [pendingUnloadingCity, unloadingCities, setValue]);

  // 주소 검색 모달
  const [addressModalOpen, setAddressModalOpen] = React.useState(false);
  const addressContentRef = React.useRef<HTMLDivElement | null>(null);

  const closeAddressSearch = React.useCallback(() => {
    setAddressModalOpen(false);
  }, []);

  // 카카오(다음) 주소검색 스크립트 로드 (판매 등록과 동일: open일 때만, 이미 있으면 스킵, 제거하지 않음)
  React.useEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const existingScript = document.querySelector('script[src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"]');
    if (existingScript || window.daum?.Postcode) return;

    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
  }, [open]);

  const editDrawerEnteredRef = React.useRef(false);

  // 초기값 설정 — 드로어가 닫혔다가 열릴 때만(판매 폼과 같이 regions/쿼리 갱신으로 폼이 덮이지 않게)
  React.useEffect(() => {
    if (!open || !delivery) {
      editDrawerEnteredRef.current = false;
      return;
    }
    if (editDrawerEnteredRef.current) return;
    editDrawerEnteredRef.current = true;

    const customer = delivery.sales?.customer;
    // 상차 일정은 첫 번째 loadingItem에서 가져옴
    const firstLoadingItem = delivery.loadingItems?.[0];
    
    // 하차지 지역/시군구 이름 조회
    const unloadingRegionName = delivery.unloadingRegion?.name || 
      (delivery.unloadingRegionId && regions?.find(r => r.id === delivery.unloadingRegionId)?.name) ||
      customer?.regionEntity?.name ||
      (customer?.regionId && regions?.find(r => r.id === customer.regionId)?.name) ||
      '';
    
    // 하차지 시군구는 지역 ID가 필요하므로 나중에 처리
    const unloadingCityName = delivery.unloadingCity?.name || '';
    
    const sales = delivery.sales;
    const salesMainLine = salesUnloadingMainLine(sales ?? undefined);
    const udtFromSales = sales?.unloadingAddressDefaultType?.trim();
    const udt =
      udtFromSales === 'JIBUN' || udtFromSales === 'ROAD'
        ? udtFromSales
        : (sales?.unloadingAddressRoad ?? '').trim()
          ? 'ROAD'
          : (sales?.unloadingAddressJibun ?? '').trim()
            ? 'JIBUN'
            : customer?.addressDefaultType === 'JIBUN'
              ? 'JIBUN'
              : 'ROAD';

    const snap: DeliveryUnloadingSnap = {
      unloadingPostalCode:
        sales?.unloadingPostalCode?.trim() ||
        delivery.unloadingPostalCode ||
        customer?.postalCode ||
        '',
      unloadingAddress: salesMainLine,
      unloadingAddressRoad: sales?.unloadingAddressRoad ?? '',
      unloadingAddressJibun: sales?.unloadingAddressJibun ?? '',
      unloadingLegalBCode: sales?.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) ?? '',
      unloadingAddressDefaultType: udt,
      unloadingAddressDetail:
        sales?.unloadingAddressDetail?.trim() ||
        delivery.unloadingAddressDetail ||
        customer?.addressDetail ||
        '',
      unloadingRegion: unloadingRegionName,
      unloadingCity: unloadingCityName,
    };
    unloadingSnapshotRef.current = snap;

    reset({
      unloadingPostalCode: snap.unloadingPostalCode,
      unloadingAddress: snap.unloadingAddress,
      unloadingAddressRoad: snap.unloadingAddressRoad,
      unloadingAddressJibun: snap.unloadingAddressJibun,
      unloadingLegalBCode: snap.unloadingLegalBCode,
      unloadingAddressDefaultType: snap.unloadingAddressDefaultType,
      unloadingAddressDetail: snap.unloadingAddressDetail,
      unloadingRegion: snap.unloadingRegion,
      unloadingCity: snap.unloadingCity,
      unloadingScheduleDate: delivery.unloadingScheduleDate || '',
      unloadingScheduleTime: delivery.unloadingScheduleTime || '',
      dispatchCompanyId: delivery.dispatchCompanyId?.toString() || '',
      requestVehicle: delivery.requestVehicle || '',
      requestWeight: delivery.requestWeight || '',
      freightPaymentType: delivery.freightPaymentType || '',
      transportFeePaymentStatus: delivery.transportFeePaymentStatus || 'UNPAID',
      loadingSchedule: firstLoadingItem?.loadingSchedule || '',
      loadingScheduleTime: firstLoadingItem?.loadingScheduleTime || '',
      unloadingCompanyId: delivery.directUnloadingContact
        ? '__direct__'
        : (delivery.unloadingCompanyId?.toString() || ''),
      directUnloadingContact: delivery.directUnloadingContact || '',
      notes: delivery.notes || '',
      loadingItems: delivery.loadingItems?.map((item) => ({
        requestNotes: item.requestNotes || '',
        notes: item.notes || '',
      })) || [],
    });
  }, [open, delivery, reset, regions]);

  // 지역 마스터가 초기 reset 이후에 도착한 경우 — 폼의 시·도만 보강(입력 중 덮어쓰기 방지: 비어 있을 때만)
  React.useEffect(() => {
    if (!open || !delivery || !regions?.length) return;
    const cur = (getValues('unloadingRegion') || '').trim();
    if (cur) return;
    const name =
      delivery.unloadingRegion?.name ||
      (delivery.unloadingRegionId != null
        ? regions.find((r) => r.id === delivery.unloadingRegionId)?.name
        : '') ||
      '';
    if (!name) return;
    setValue('unloadingRegion', name, { shouldDirty: false });
  }, [open, delivery, regions, setValue, getValues]);

  React.useEffect(() => {
    if (!open || !delivery) return;
    if (savedDeliveryAddressesLoading) return;
    if (unloadingChoiceInitRef.current === delivery.id) return;
    const snap = unloadingSnapshotRef.current;
    if (!snap) return;
    unloadingChoiceInitRef.current = delivery.id;
    setUnloadingAddressChoice(
      detectInitialUnloadingChoice(delivery, snap, savedDeliveryAddresses),
    );
  }, [open, delivery, savedDeliveryAddresses, savedDeliveryAddressesLoading]);

  // 하차지 시군구 초기값: 배송에 저장된 시군구명 (지역 선택 UI 없음 — 제출 시 ID 매칭용)
  React.useEffect(() => {
    if (!open || !delivery) return;
    const unloadingRegionName = watch('unloadingRegion');
    if (!unloadingRegionName || unloadingRegionName === '__none__' || unloadingRegionName === '') return;
    const currentCity = watch('unloadingCity');
    if (currentCity && currentCity !== '') return;
    if (unloadingCities && unloadingCities.length > 0) {
      const unloadingCityName =
        delivery.unloadingCity?.name ||
        (delivery.unloadingCityId && unloadingCities.find((c) => c.id === delivery.unloadingCityId)?.name) ||
        '';
      if (unloadingCityName) {
        setValue('unloadingCity', unloadingCityName, { shouldDirty: false });
      }
    }
  }, [open, delivery, watch, setValue, unloadingRegionId, unloadingCities]);

  // 주소 검색 (판매 등록 sales-form-drawer와 동일한 방식)
  const handleUnloadingAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    setAddressModalOpen(true);

    setTimeout(() => {
      const contentElement = addressContentRef.current;
      if (!contentElement) {
        setAddressModalOpen(false);
        toast({
          title: '오류',
          description: '주소 검색 UI를 불러올 수 없습니다.',
          className: 'border border-red-300 text-red-600',
        });
        return;
      }

      if (!window.daum?.Postcode) {
        setAddressModalOpen(false);
        toast({
          title: '주소검색 준비 중',
          description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
          className: 'border border-yellow-300 text-yellow-600',
        });
        return;
      }

      contentElement.innerHTML = '';
      const Postcode = window.daum.Postcode;

      // submitMode: false - 우편번호 검색 후 Enter 시 form submit 대신 location.replace 사용 (클릭 이슈 방지)
      new Postcode({
        oncomplete: (data: DaumPostcodeData) => {
          let roadLine = (data.roadAddress || '').trim();
          let extraAddress = '';
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
          if (roadLine) {
            roadLine = roadLine + extraAddress;
          }
          const jibunLine = (data.jibunAddress || '').trim();
          const bcode = (data.bcode ?? '').replace(/\D/g, '').slice(0, 10);
          const defaultType = data.userSelectedType === 'R' ? 'ROAD' : 'JIBUN';
          const line =
            resolveUnloadingLineFromParts({
              unloadingAddressRoad: roadLine,
              unloadingAddressJibun: jibunLine,
              unloadingAddressDefaultType: defaultType,
            }) ||
            jibunLine ||
            roadLine;

          setValue('unloadingPostalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
          setValue('unloadingLegalBCode', bcode, { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddressRoad', roadLine, { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddressJibun', jibunLine, { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddressDefaultType', defaultType, { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddress', line, { shouldDirty: true, shouldValidate: true });

          {
            const cur = unloadingAddressChoiceRef.current;
            if (
              !isSavedDeliveryAddressChoice(cur, savedDeliveryAddressesRef.current) &&
              cur !== UNLOADING_CHOICE_CUSTOMER_DEFAULT
            ) {
              setUnloadingAddressChoice(UNLOADING_CHOICE_SALE_SNAPSHOT);
            }
          }

          if (data.sido && regions) {
            const normalizedRegionName = normalizeRegionNameFromAddress(data.sido);
            const matchedRegion = regions.find((r) => r.name === normalizedRegionName);
            if (matchedRegion) {
              setValue('unloadingRegion', matchedRegion.name, { shouldDirty: true, shouldValidate: true });
            } else {
              setValue('unloadingRegion', normalizedRegionName, { shouldDirty: true, shouldValidate: true });
            }
          }

          if (data.sigungu) {
            setPendingUnloadingCity(data.sigungu);
            const normalizedRegionName = data.sido ? normalizeRegionNameFromAddress(data.sido) : null;
            const regionId = normalizedRegionName
              ? regions?.find((r) => r.name === normalizedRegionName)?.id
              : undefined;
            if (regionId && unloadingCities) {
              const matchedCity = unloadingCities.find((c) => c.name === data.sigungu);
              if (matchedCity) {
                setValue('unloadingCity', matchedCity.name, { shouldDirty: true, shouldValidate: true });
                setPendingUnloadingCity(null);
              } else {
                setValue('unloadingCity', data.sigungu, { shouldDirty: true, shouldValidate: true });
              }
            } else {
              setValue('unloadingCity', data.sigungu || '', { shouldDirty: true, shouldValidate: true });
            }
          }

          closeAddressSearch();
        },
        width: '100%',
        height: '100%',
        submitMode: false,
      } as { oncomplete: (data: DaumPostcodeData) => void; width: string; height: string; submitMode?: boolean }).embed(contentElement);
    }, 100);
  }, [closeAddressSearch, regions, unloadingCities, setValue, toast, setPendingUnloadingCity]);

  // Drawer가 닫힐 때 주소 검색 모달이 열려있으면 drawer를 닫지 않도록 처리 (판매 등록과 동일)
  const handleDrawerOpenChange = React.useCallback(
    (isOpen: boolean) => {
      if (!isOpen && addressModalOpen) return;
      onOpenChange(isOpen);
    },
    [addressModalOpen, onOpenChange]
  );

  // Drawer가 닫힐 때 주소 검색 모달도 닫기
  React.useEffect(() => {
    if (!open && addressModalOpen) {
      setAddressModalOpen(false);
    }
  }, [open, addressModalOpen]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addressModalOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setAddressModalOpen(false);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange, addressModalOpen]);

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

  const onSubmit = async (formData: SalesDeliveryEditFormData) => {
    if (!delivery) return;

    try {
      // 지역/시군구 이름을 ID로 변환
      const regionIdForSubmit = formData.unloadingRegion 
        ? regions?.find((r) => r.name === formData.unloadingRegion)?.id 
        : null;
      
      // 시군구는 지역 ID가 필요하므로, 지역 ID를 기반으로 시군구 목록을 다시 조회하거나
      // 현재 선택된 지역 ID를 사용하여 시군구 ID 찾기
      let cityIdForSubmit: number | undefined = undefined;
      if (formData.unloadingCity && regionIdForSubmit) {
        // 현재 선택된 지역의 시군구 목록에서 찾기
        cityIdForSubmit = unloadingCities?.find((c) => c.name === formData.unloadingCity)?.id;
      }

      // loadingItems 업데이트: 요청 정보는 판매 제품 정보(SalesItem) 기준으로 전송하여 상차 정보가 판매와 일치하도록 함
      const loadingItems = delivery.loadingItems?.map((item, index) => {
        const formItemRequestNotes = formData.loadingItems?.[index]?.requestNotes;
        const salesItem = item.salesItem;
        const container = salesItem?.container;
        const order = container?.order;
        const requestBL = order?.bl ?? item.requestBL ?? undefined;
        const requestContainer = container?.containerNo ?? item.requestContainer ?? undefined;
        const requestContainerType = (salesItem?.containerType ?? item.requestContainerType) || undefined;
        const requestBalesRaw = salesItem?.cargoBales ?? item.requestBales;
        const requestBales = requestBalesRaw != null ? (typeof requestBalesRaw === 'string' ? parseFloat(requestBalesRaw) : Number(requestBalesRaw)) : undefined;
        const requestWeightRaw = salesItem?.cargoWeight ?? item.requestWeight;
        const requestWeight = requestWeightRaw != null ? (typeof requestWeightRaw === 'string' ? parseFloat(requestWeightRaw) : Number(requestWeightRaw)) : undefined;
        return {
          id: item.id,
          salesItemId: item.salesItemId,
          loadingSchedule: formData.loadingSchedule || (item.loadingSchedule ? new Date(item.loadingSchedule).toISOString().split('T')[0] : undefined),
          loadingScheduleTime: formData.loadingScheduleTime || item.loadingScheduleTime || undefined,
          requestBL,
          requestContainer,
          requestContainerType,
          requestBales,
          requestWeight,
          workBL: item.workBL || undefined,
          workContainer: item.workContainer || undefined,
          workWeight: item.workWeight != null ? item.workWeight : undefined,
          workBales: item.workBales != null ? item.workBales : undefined,
          status: item.status || 'PENDING',
          order: item.order || index + 1,
          requestNotes: formItemRequestNotes?.trim() || undefined,
        };
      }) || [];

      // dispatchCompanyId와 unloadingCompanyId 처리 (__none__, __direct__는 null)
      const dispatchCompanyIdStr = formData.dispatchCompanyId?.trim() || '';
      const unloadingCompanyIdStr = formData.unloadingCompanyId?.trim() || '';
      
      const dispatchCompanyIdValue = dispatchCompanyIdStr !== '' 
        ? (() => {
            const parsed = parseInt(dispatchCompanyIdStr, 10);
            return isNaN(parsed) ? null : parsed;
          })()
        : null;
      
      const unloadingCompanyIdValue = unloadingCompanyIdStr !== '' && unloadingCompanyIdStr !== '__none__' && unloadingCompanyIdStr !== '__direct__'
        ? (() => {
            const parsed = parseInt(unloadingCompanyIdStr, 10);
            return isNaN(parsed) ? null : parsed;
          })()
        : null;
      
      const directUnloadingContactValue = unloadingCompanyIdStr === '__direct__' ? (formData.directUnloadingContact?.trim() || null) : null;

      const road = (formData.unloadingAddressRoad ?? '').trim();
      const jibun = (formData.unloadingAddressJibun ?? '').trim();
      const udt = (formData.unloadingAddressDefaultType ?? '').trim();
      const unloadingLine =
        (formData.unloadingAddress ?? '').trim() ||
        resolveUnloadingLineFromParts({
          unloadingAddressRoad: road,
          unloadingAddressJibun: jibun,
          unloadingAddressDefaultType: udt,
        }) ||
        jibun ||
        road;

      const legalB = (formData.unloadingLegalBCode ?? '').replace(/\D/g, '').slice(0, 10);

      const normalizedUnloadingChoice =
        unloadingAddressChoice !== UNLOADING_CHOICE_CUSTOMER_DEFAULT &&
        unloadingAddressChoice !== UNLOADING_CHOICE_SALE_SNAPSHOT &&
        !savedDeliveryAddresses.some((a) => a.id === unloadingAddressChoice)
          ? UNLOADING_CHOICE_SALE_SNAPSHOT
          : unloadingAddressChoice;

      let unloadingMirrorToCustomerDefault: boolean | undefined;
      let unloadingDeliveryAddressId: string | undefined;
      if (normalizedUnloadingChoice === UNLOADING_CHOICE_CUSTOMER_DEFAULT) {
        unloadingMirrorToCustomerDefault = true;
      } else if (normalizedUnloadingChoice === UNLOADING_CHOICE_SALE_SNAPSHOT) {
        unloadingMirrorToCustomerDefault = false;
      } else {
        unloadingDeliveryAddressId = normalizedUnloadingChoice;
        unloadingMirrorToCustomerDefault = false;
      }

      const updateData = {
        unloadingPostalCode: formData.unloadingPostalCode?.trim() ?? '',
        unloadingAddress: unloadingLine,
        unloadingAddressDetail: formData.unloadingAddressDetail?.trim() ?? '',
        unloadingAddressRoad: road,
        unloadingAddressJibun: jibun,
        unloadingLegalBCode: legalB,
        unloadingAddressDefaultType: udt,
        unloadingMirrorToCustomerDefault,
        unloadingDeliveryAddressId,
        unloadingRegion: regionIdForSubmit ? regionIdForSubmit.toString() : undefined,
        unloadingCity: cityIdForSubmit ? cityIdForSubmit.toString() : undefined,
        unloadingScheduleDate: formData.unloadingScheduleDate || undefined,
        unloadingScheduleTime: formData.unloadingScheduleTime || undefined,
        dispatchCompanyId: dispatchCompanyIdValue,
        requestVehicle: formData.requestVehicle?.trim() ? formData.requestVehicle : null,
        requestWeight: formData.requestWeight?.trim() ? formData.requestWeight : null,
        freightPaymentType: formData.freightPaymentType || undefined,
        transportFeePaymentStatus: formData.transportFeePaymentStatus || undefined,
        unloadingCompanyId: unloadingCompanyIdValue,
        directUnloadingContact: directUnloadingContactValue,
        notes: formData.notes || undefined,
        status: delivery.status === 'PENDING_DISPATCH' ? 'DISPATCH_REQUESTED' : delivery.status, // 배차 대기 상태일 때만 배차 요청으로 변경
        loadingItems: loadingItems,
      };

      await updateMutation.mutateAsync({
        id: delivery.id,
        data: updateData,
      });

      toast({
        title: '배송 정보 수정 완료',
        description: '배송 정보가 성공적으로 수정되었습니다.',
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        (Array.isArray(error?.response?.data?.message) ? error.response.data.message.join(', ') : null) ||
        error?.message ||
        '배송 정보 수정 중 오류가 발생했습니다.';
      toast({
        title: '수정 실패',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const customer = delivery?.sales?.customer;
  const unloadingAddressDetailReg = register('unloadingAddressDetail');

  return (
    <>
      <Drawer open={open} onOpenChange={handleDrawerOpenChange} direction="right" dismissible={false}>
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
                <DrawerTitle>배차 요청</DrawerTitle>
                <DrawerDescription>배차 요청을 위해 추가 정보를 입력하세요.</DrawerDescription>
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

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
              {/* 고객 정보 (읽기 전용) */}
              {customer && (
                <>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">고객 정보</h3>
                      <p className="text-xs text-muted-foreground">
                        연락처·업체 정보만 표시됩니다. 주소는 아래 <span className="text-foreground/90">하차지 주소</span>에서
                        수정합니다.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label>전화번호</Label>
                        <Input
                          value={formatPhone(customer.phone)}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>업체명 / 농장명</Label>
                        <Input
                          value={customer.companyName || '-'}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>대표자</Label>
                        <Input
                          value={customer.ceo || '-'}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border my-6" />
                </>
              )}

              {/* 하차지 주소 (지역·시군구 선택 없음 — 주소 검색 시 시·도·시군구는 폼 값으로만 반영되어 저장) */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">하차지 주소</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    판매 등록과 같이 대표 주소·저장 배송지·이 판매에 저장된 주소를 고를 수 있습니다. 저장 시 선택에 맞춰 판매·고객(또는 해당 배송지 행)에 반영됩니다.
                  </p>
                </div>
                {customerIdForAddresses ? (
                  <div className="space-y-2">
                    <Label htmlFor="unloadingAddressChoice" className="text-sm font-semibold text-foreground">
                      하차지 출처
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <Select
                            value={unloadingSelectValue}
                            onValueChange={(v) => {
                              setUnloadingAddressChoice(v);
                              const cust = delivery?.sales?.customer;
                              if (v === UNLOADING_CHOICE_CUSTOMER_DEFAULT) {
                                if (cust) {
                                  applyUnloadingFromCustomerDefaultForDelivery(cust, regions, setValue);
                                }
                                return;
                              }
                              if (v === UNLOADING_CHOICE_SALE_SNAPSHOT) {
                                const snap = unloadingSnapshotRef.current;
                                if (snap) {
                                  applyDeliveryUnloadingSnapshot(snap, setValue);
                                }
                                return;
                              }
                              const row = savedDeliveryAddresses.find((a) => a.id === v);
                              if (row) {
                                applyUnloadingFromSavedDeliveryRow(row, setValue);
                              }
                            }}
                            disabled={savedDeliveryAddressesLoading}
                          >
                            <SelectTrigger id="unloadingAddressChoice" className="h-9 w-full min-w-0">
                              <SelectValue placeholder="하차지를 선택하세요" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNLOADING_CHOICE_CUSTOMER_DEFAULT}>
                                고객 대표 주소
                              </SelectItem>
                              <SelectItem
                                value={UNLOADING_CHOICE_SALE_SNAPSHOT}
                                className="whitespace-normal py-2"
                                title="이 판매에 저장된 하차지입니다. 대표·배송지와 다를 때 초기값으로 쓰입니다."
                              >
                                이 판매에 저장된 주소
                              </SelectItem>
                              {savedDeliveryAddresses.map((row) => (
                                <SelectItem key={row.id} value={row.id} className="whitespace-normal py-2">
                                  {savedDeliveryAddressLabel(row)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {savedDeliveryAddressesLoading ? (
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                            aria-label="배송지 목록 불러오는 중"
                          />
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full shrink-0 gap-1.5 sm:w-auto"
                        onClick={() => setAddDeliveryAddressDialogOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        배송지 추가
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="space-y-4">
                  <div className="max-w-xs space-y-2">
                    <Label htmlFor="unloadingPostalCode">우편번호</Label>
                    <div className="flex gap-2">
                      <Input
                        id="unloadingPostalCode"
                        {...register('unloadingPostalCode')}
                        placeholder="우편번호"
                        className="cursor-pointer bg-muted flex-1"
                        onClick={handleUnloadingAddressSearch}
                        readOnly
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
                  <input type="hidden" {...register('unloadingRegion')} />
                  <input type="hidden" {...register('unloadingCity')} />
                  <input type="hidden" {...register('unloadingAddress')} />
                  <input type="hidden" {...register('unloadingLegalBCode')} />
                  <input type="hidden" {...register('unloadingAddressDefaultType')} />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="unloadingAddressRoad">도로명 주소</Label>
                      <div
                        className={cn(
                          'flex min-h-9 w-full min-w-0 overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow]',
                          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                        )}
                      >
                        <Input
                          id="unloadingAddressRoad"
                          readOnly
                          placeholder="주소검색 시 입력됩니다"
                          title="클릭하여 주소 검색"
                          className={cn(
                            'h-9 min-w-0 flex-1 cursor-pointer rounded-none border-0 bg-muted text-sm shadow-none',
                            'focus-visible:ring-0',
                          )}
                          onClick={handleUnloadingAddressSearch}
                          {...register('unloadingAddressRoad')}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unloadingAddressJibun">지번 주소</Label>
                      <div
                        className={cn(
                          'flex min-h-9 w-full min-w-0 overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow]',
                          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                        )}
                      >
                        <Input
                          id="unloadingAddressJibun"
                          readOnly
                          placeholder="주소검색 시 입력됩니다"
                          title="클릭하여 주소 검색"
                          className={cn(
                            'h-9 min-w-0 flex-1 cursor-pointer rounded-none border-0 bg-muted text-sm shadow-none',
                            'focus-visible:ring-0',
                          )}
                          onClick={handleUnloadingAddressSearch}
                          {...register('unloadingAddressJibun')}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unloadingAddressDetail">상세주소</Label>
                    <Input
                      id="unloadingAddressDetail"
                      {...unloadingAddressDetailReg}
                      onChange={(e) => {
                        void unloadingAddressDetailReg.onChange(e);
                        markUnloadingManualEdit();
                      }}
                      placeholder="상세주소"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border my-6" />

              {/* 배차 정보 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">배차 정보</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="dispatchCompanyId">배차 업체</Label>
                    <Select
                      value={watch('dispatchCompanyId') || ''}
                      onValueChange={(value) => setValue('dispatchCompanyId', value || '', { shouldDirty: true })}
                    >
                      <SelectTrigger id="dispatchCompanyId">
                        <SelectValue placeholder="배차 업체 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {dispatchCompanies.map((company) => (
                          <SelectItem key={company.id} value={company.id.toString()}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="requestVehicle">요청 차량</Label>
                    <Select
                      value={watch('requestVehicle') || ''}
                      onValueChange={(value) => setValue('requestVehicle', value, { shouldDirty: true })}
                    >
                      <SelectTrigger id="requestVehicle">
                        <SelectValue placeholder="요청 차량 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {requestVehicleCodes?.map((code) => (
                          <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                            {code.name || code.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="requestWeight">요청 중량</Label>
                    <Input
                      id="requestWeight"
                      value={watch('requestWeight') ?? ''}
                      onChange={(e) => setValue('requestWeight', e.target.value, { shouldDirty: true })}
                      placeholder="요청 중량 입력"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="freightPaymentType">운임</Label>
                    <Select
                      value={watch('freightPaymentType') || ''}
                      onValueChange={(value) => setValue('freightPaymentType', value, { shouldDirty: true })}
                    >
                      <SelectTrigger id="freightPaymentType">
                        <SelectValue placeholder="운임 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {freightPaymentTypeCodes?.map((code) => (
                          <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                            {code.name || code.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>운송비 지급</Label>
                    <Select
                      value={watch('transportFeePaymentStatus') || 'UNPAID'}
                      onValueChange={(value) => setValue('transportFeePaymentStatus', value || 'UNPAID', { shouldDirty: true })}
                    >
                      <SelectTrigger className="w-full sm:w-[140px]">
                        <SelectValue placeholder="지급 상태" />
                      </SelectTrigger>
                      <SelectContent>
                        {(transportFeePaymentStatusCodes?.length ? transportFeePaymentStatusCodes : [
                          { value: 'UNPAID', name: '미지급' },
                          { value: 'PAID', name: '지급완료' },
                        ]).map((code) => (
                          <SelectItem key={code.value || code.name} value={(code.value || code.name || '').trim()}>
                            {code.name || code.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">운송비·계근비 지급 여부 (내부 관리용)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="loadingSchedule">상차 일정</Label>
                    <DatePicker
                      value={watch('loadingSchedule') || undefined}
                      onChange={(dateStr) => {
                        setValue('loadingSchedule', dateStr || '', { shouldDirty: true });
                      }}
                      placeholder="상차 일정 선택"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="loadingScheduleTime">상차 시간</Label>
                    <Input
                      id="loadingScheduleTime"
                      {...register('loadingScheduleTime')}
                      placeholder="시간 입력 (예: 14:30)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unloadingScheduleDate">하차 일정</Label>
                    <DatePicker
                      value={watch('unloadingScheduleDate') || undefined}
                      onChange={(dateStr) => {
                        setValue('unloadingScheduleDate', dateStr || '', { shouldDirty: true });
                      }}
                      placeholder="날짜 선택"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unloadingScheduleTime">하차 시간</Label>
                    <Input
                      id="unloadingScheduleTime"
                      {...register('unloadingScheduleTime')}
                      placeholder="시간 입력 (예: 14:30)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="orderNumber">운송번호</Label>
                    <Input
                      id="orderNumber"
                      placeholder="자동 생성됨"
                      value={delivery?.orderNumber || ''}
                      readOnly
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">운송번호는 자동으로 생성됩니다.</p>
                  </div>
                </div>
              </div>

              {/* 하역 정보 */}
              <div className="border-t border-border my-6" />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">하역 정보</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="unloadingCompanyId">하역 업체</Label>
                    <Select
                      value={watch('unloadingCompanyId') || '__none__'}
                      onValueChange={(value) => setValue('unloadingCompanyId', value === '__none__' ? '' : value, { shouldDirty: true })}
                    >
                      <SelectTrigger id="unloadingCompanyId">
                        <SelectValue placeholder="하역 업체 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">미할당</SelectItem>
                        <SelectItem value="__direct__">직접 하차</SelectItem>
                        {unloadingCompanies.map((company) => (
                          <SelectItem key={company.id} value={company.id.toString()}>
                            {company.representativeName}
                            {company.contact ? ` (${company.contact})` : ''}
                            {company.notes ? ` - ${company.notes}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                          setValue('directUnloadingContact', formatted, { shouldDirty: true });
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 상차지 정보 */}
              {delivery?.loadingItems && delivery.loadingItems.length > 0 && (() => {
                // 하차완료 시 행 삭제(하차 제외)된 항목은 상차지 목록에서 제외
                const isUnloadingCompleted = delivery?.status === 'UNLOADING_COMPLETED';
                const loadingItemsToShow = isUnloadingCompleted
                  ? delivery.loadingItems.filter(
                      (item) =>
                        item.actualBL != null ||
                        item.actualContainer != null ||
                        item.actualBales != null ||
                        item.actualWeight != null,
                    )
                  : delivery.loadingItems;
                return loadingItemsToShow.length > 0 ? (
                <>
                  <div className="border-t border-border my-6" />
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">상차지 정보</h3>
                    <div className="space-y-4">
                      {loadingItemsToShow.map((item, index) => {
                        const originalIndex = delivery.loadingItems!.findIndex((li) => li.id === item.id);
                        const formIndex = originalIndex >= 0 ? originalIndex : index;
                        // SalesItem 참조로 정보 조회
                        const salesItem = item.salesItem;
                        const container = salesItem?.container;
                        const order = container?.order;
                        // 상차지: 입고확정 시 설정한 창고 (백엔드에서 item.loadingWarehouse로 채움)
                        const warehouseName = item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId) || '-';
                        const requestBL = order?.bl || '-';
                        const requestContainer = container?.containerNo || '-';
                        const containerSequence = container?.sequence;
                        // 요청 베일 (SalesItem의 cargoBales 우선, 없으면 Container의 bales)
                        const requestBalesRaw = salesItem?.cargoBales ?? (container != null ? (container.salesBales ?? container.tradeBales) : null) ?? null;
                        const requestBalesVal = requestBalesRaw != null ? Number(requestBalesRaw) : null;
                        const requestBales = requestBalesVal != null 
                          ? (requestBalesVal % 1 === 0 
                              ? requestBalesVal.toFixed(0) 
                              : String(requestBalesVal))
                          : '-';
                        // 요청 중량 (SalesItem의 cargoWeight 우선, 없으면 Container의 weight, MT)
                        const requestWeightMt = salesItem?.cargoWeight ?? container?.weight ?? null;
                        // 타입 (SalesItem의 containerType)
                        const containerType = salesItem?.containerType || 'CONTAINER';
                        const containerTypeLabel = containerType === 'CARGO' ? '카고' : '컨테이너';
                        
                        return (
                          <div key={item.id} className="p-4 border rounded-lg space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">항목 {index + 1}</span>
                            </div>
                            <div
                              className="grid gap-4"
                              style={{
                                gridTemplateColumns: 'minmax(0, 1fr) minmax(100px, 2fr) minmax(100px, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                              }}
                            >
                              <div className="space-y-2 min-w-0">
                                <Label>상차지</Label>
                                <Input
                                  value={warehouseName}
                                  readOnly
                                  className="bg-muted"
                                />
                              </div>
                              <div className="space-y-2 min-w-0">
                                <Label>요청 BL</Label>
                                <Input
                                  value={requestBL}
                                  readOnly
                                  className="bg-muted"
                                />
                              </div>
                              <div className="space-y-2 min-w-0">
                                <Label>요청 컨테이너</Label>
                                <Input
                                  value={`${requestContainer}${containerSequence != null ? ` [${containerSequence}]` : ''}`}
                                  readOnly
                                  className="bg-muted"
                                />
                              </div>
                              <div className="space-y-2 min-w-0">
                                <Label>타입</Label>
                                <Input
                                  value={containerTypeLabel}
                                  readOnly
                                  className="bg-muted"
                                />
                              </div>
                              <div className="space-y-2 min-w-0">
                                <Label>요청 베일</Label>
                                <Input
                                  value={requestBales}
                                  readOnly
                                  className="bg-muted"
                                />
                              </div>
                              <div className="space-y-2 min-w-0">
                                <Label>요청 중량</Label>
                                <Input
                                  value={requestWeightMt != null && requestWeightMt !== '' ? String(requestWeightMt) : '-'}
                                  readOnly
                                  className="bg-muted"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`loadingItems.${formIndex}.requestNotes`}>요청 비고</Label>
                              <Input
                                id={`loadingItems.${formIndex}.requestNotes`}
                                {...register(`loadingItems.${formIndex}.requestNotes` as any)}
                                placeholder="요청 시 관리자 비고"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null;
              })()}

              <SalesDeliverySalesNotesSection notes={delivery?.sales?.notes} />
              <div className="border-t border-border my-6" />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="notes">운송 비고</Label>
                  <Input
                    id="notes"
                    {...register('notes')}
                    placeholder="운송 비고 입력"
                  />
                </div>
              </div>
                </div>
              </ScrollArea>
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
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    {delivery?.status === 'PENDING_DISPATCH' ? '배차 요청' : '저장'}
                  </Button>
                </div>
              </div>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      {/* 주소 검색 모달 - 판매 등록(sales-form-drawer)과 동일: 항상 렌더링, opacity/pointerEvents로 보이기/숨기기 */}
      {open &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            style={{
              pointerEvents: addressModalOpen ? 'auto' : 'none',
              opacity: addressModalOpen ? 1 : 0,
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
              <div ref={addressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
            </div>
          </div>,
          document.body
        )}

      {customerIdForAddresses ? (
        <CustomerDeliveryAddressFormDialog
          customerId={customerIdForAddresses}
          open={addDeliveryAddressDialogOpen}
          onOpenChange={setAddDeliveryAddressDialogOpen}
          existingAddresses={savedDeliveryAddresses}
          editingAddress={null}
          description="현재 고객에 배송지 주소록으로 저장됩니다. 저장 후 이 운송의 하차지로 바로 적용됩니다."
          onAdded={(addr) => {
            const cid = delivery?.sales?.customerId ?? delivery?.sales?.customer?.id;
            if (cid) {
              queryClient.setQueryData<CustomerDeliveryAddress[]>(
                ['customers', cid, 'delivery-addresses'],
                (prev) => (prev?.some((a) => a.id === addr.id) ? prev : [...(prev ?? []), addr]),
              );
            }
            setUnloadingAddressChoice(addr.id);
            applyUnloadingFromSavedDeliveryRow(addr, setValue);
          }}
        />
      ) : null}
    </>
  );
}

