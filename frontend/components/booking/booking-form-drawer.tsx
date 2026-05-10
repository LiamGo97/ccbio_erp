'use client';

import * as React from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
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
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Save, Search, Plus, Trash2, FileText } from 'lucide-react';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { DatePicker } from '@/components/schedules/date-picker';
import {
  useTradeContracts,
  TradeContract,
} from '@/lib/hooks/use-trade-contracts';
import { ContractInfoSection } from './contract-info-section';
import {
  CreateTradeOrderDto,
  UpdateTradeOrderDto,
  useCreateTradeOrder,
  useUpdateTradeOrder,
  useTradeOrder,
} from '@/lib/hooks/use-trade-orders';
import api from '@/lib/api';
import { auth, User } from '@/lib/auth';

/** 임시 결제 차수 상한 (1차·2차만) */
const MAX_TEMP_BOOKING_PAYMENTS = 2;

/** 부킹 수정 폼 전용 — 임시 결제 차수(서류 확정 전) */
interface TempPaymentFormRow {
  dueDate: string;
  ratio: string;
  amount: string;
  method: string;
  exchangeRate: string;
  krwAmount: string;
  result: string;
  notes: string;
}

function emptyTempPaymentRow(): TempPaymentFormRow {
  return {
    dueDate: '',
    ratio: '',
    amount: '',
    method: '',
    exchangeRate: '',
    krwAmount: '',
    result: '',
    notes: '',
  };
}

function mapBookingTempPaymentFromApi(p: {
  dueDate?: string | null;
  ratio?: number | null;
  amount?: number | null;
  method?: string | null;
  exchangeRate?: number | null;
  krwAmount?: number | null;
  result?: string | null;
  notes?: string | null;
}): TempPaymentFormRow {
  return {
    dueDate: p.dueDate ?? '',
    ratio: p.ratio != null ? String(p.ratio) : '',
    amount: p.amount != null ? String(p.amount) : '',
    method: p.method ?? '',
    exchangeRate: p.exchangeRate != null ? String(p.exchangeRate) : '',
    krwAmount: p.krwAmount != null ? String(p.krwAmount) : '',
    result: p.result ?? '',
    notes: p.notes ?? '',
  };
}

function parseBookingTempScalar(s: string | undefined): number | null {
  const t = s?.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function buildBookingTempPaymentsPayload(rows: TempPaymentFormRow[]) {
  return rows.slice(0, MAX_TEMP_BOOKING_PAYMENTS).map((r) => ({
    dueDate: r.dueDate?.trim() || null,
    ratio: r.ratio?.trim() ? Number(r.ratio) : null,
    amount: r.amount?.trim() ? Number(r.amount) : null,
    method: r.method?.trim() || null,
    exchangeRate: r.exchangeRate?.trim() ? Number(r.exchangeRate) : null,
    krwAmount: r.krwAmount?.trim() ? Number(r.krwAmount) : null,
    result: r.result?.trim() || null,
    notes: r.notes?.trim() || null,
  }));
}

interface ContainerFormData {
  /** 기존 컨테이너 매칭용. 수정 시 전송하면 해당 행 업데이트 */
  id?: string;
  containerNo?: string;
  product?: string;
  tradeGrade?: string;
  salesGrade?: string;
  packingType?: string;
  currency?: string;
  unitPrice?: number;
  weight?: number;
  /** 베일(무역)수(문서/계약 기준) */
  tradeBales?: number;
  /** 베일(영업)수. 비우면 베일(무역)과 동일 */
  salesBales?: number | null;
  /** 선적 조회로 추가된 컨테이너 표시용 (API 전송 제외) */
  _fromTracking?: boolean;
}

interface BookingFormData {
  contractId: string;
  bk?: string;
  bl?: string;
  shippingLine?: string;
  etd?: string;
  etdApi?: string; // API로 가져온 ETD (참조용)
  eta?: string;
  packingType?: string;
  destination?: string;
  notes?: string;
  spot?: string; // 현물 유무
  quotaOverride?: 'Y' | 'N'; // 주문별 쿼터 유무 (현물 유무와 동일 스위치)
  /** 순번: 자동(백엔드 할당) / 수동(사용자 입력) */
  sequenceMode?: 'auto' | 'manual';
  /** 순번 수동 입력 시 "7" 또는 "7-1", "7-2" 형식 */
  shipmentSeqText?: string;
  containers?: ContainerFormData[];
  /** 임시 중량(MT)·송장금액·결제 */
  tempWeightMt?: string;
  tempInvoiceAmount?: string;
  tempPayments?: TempPaymentFormRow[];
}

interface BookingFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (orderId?: string) => Promise<void>;
  bookingId?: string | null; // 수정 모드일 때 부킹 ID
  mode?: 'create' | 'edit';
}

type TrackingContainer = {
  containerNumber?: string | null;
  weight?: string | null;
  gateOutDate?: string | null;
  detentionDays?: number | null;
  lastEvent?: string | null;
  events?: Array<{
    date?: string | null;
    description?: string | null;
    code?: string | null;
  }> | null;
};

type TrackingUsageBreakdown = {
  used?: number | null;
  total?: number | null;
  remaining?: number | null;
};

type TrackingResult = {
  identifier?: string | null;
  identifierType?: 'BL' | 'BK' | null;
  etd?: string | null;
  eta?: string | null;
  etaPriority?: string | null;
  etaDestination?: string | null;
  shippingLine?: string | null;
  blNumber?: string | null;
  bookingNumber?: string | null;
  responseBlNumber?: string | null;
  responseBookingNumber?: string | null;
  containers?: TrackingContainer[] | null;
  usage?: {
    apiCalls?: TrackingUsageBreakdown | null;
    uniqueShipments?: TrackingUsageBreakdown | null;
  } | null;
  raw?: unknown;
};

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

const formatUsageValue = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR');
};

export function BookingFormDrawer({
  open,
  onOpenChange,
  onSubmit,
  bookingId,
  mode = 'create',
}: BookingFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [trackingDrawerOpen, setTrackingDrawerOpen] = React.useState(false);
  const [trackingLoading, setTrackingLoading] = React.useState(false);
  const [trackingError, setTrackingError] = React.useState<string | null>(null);
  const [trackingResult, setTrackingResult] = React.useState<TrackingResult | null>(null);
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);

  // 현재 로그인한 사용자 정보 가져오기
  React.useEffect(() => {
    const fetchCurrentUser = async () => {
      if (auth.isAuthenticated()) {
        const user = await auth.getCurrentUser();
        setCurrentUser(user);
      }
    };
    fetchCurrentUser();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (trackingDrawerOpen) {
        e.preventDefault();
        setTrackingDrawerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, trackingDrawerOpen, onOpenChange]);

  const isEditMode = mode === 'edit' && !!bookingId;
  const createMutation = useCreateTradeOrder();
  const updateMutation = useUpdateTradeOrder();
  const { data: existingBooking, isLoading: isLoadingBooking } = useTradeOrder(
    isEditMode ? bookingId : undefined
  );
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: currencyCodes } = useCodesByCategory('CURRENCY');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');
  const { data: paymentMethodCodes } = useCodesByCategory('PAYMENT_TERMS');
  const { data: paymentResultCodes = [] } = useCodeMastersByGroup('PAYMENT_RESULT');

  const shippingLineOptions = React.useMemo(() => {
    return (shippingLineCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [shippingLineCodes]);

  // 패킹 타입 옵션 필터링 및 정렬
  const packingOptions = React.useMemo(() => {
    return (packingCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [packingCodes]);

  // 최고 관리자 여부 확인
  const isSuperAdmin = React.useMemo(() => {
    if (!currentUser?.roles) return false;
    return currentUser.roles.some((role) => role.code === 'ROLE_SUPER_ADMIN');
  }, [currentUser]);

  // 부킹 가능한 계약 조회
  // 계약 상태가 'CONTRACT'이고, 주문을 더 추가할 수 있는 계약만 가져옴
  // 현재 로그인한 사용자가 등록한 계약만 표시 (최고 관리자는 모든 계약 표시)
  const { data: allContracts = [] } = useTradeContracts();
  const bookingEligibleContracts = React.useMemo(() => {
    return allContracts.filter((contract) => {
      // 최고 관리자가 아닌 경우, 현재 로그인한 사용자가 등록한 계약만 필터링
      if (!isSuperAdmin) {
        if (currentUser && contract.createdBy) {
          if (contract.createdBy.id !== currentUser.id) {
            return false;
          }
        } else if (currentUser && !contract.createdBy) {
          // createdBy가 없는 경우 현재 사용자 계약이 아니므로 제외
          return false;
        }
      }
      
      // 계약 상태가 'CONTRACT'인지 확인
      if (contract.contractStatus !== 'CONTRACT') {
        return false;
      }
      
      // 전체 주문 개수와 현재 주문 개수 확인
      const totalCount = contract.totalOrderCount;
      const currentCount = contract.orderCount ?? 0;
      
      // totalOrderCount가 null이거나 undefined면 제한 없음으로 간주하고 포함
      if (totalCount === null || totalCount === undefined) {
        return true;
      }
      
      // 현재 주문 개수가 전체 주문 개수보다 작으면 추가 가능
      return currentCount < totalCount;
    });
  }, [allContracts, currentUser, isSuperAdmin]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    control,
    formState: { errors },
  } = useForm<BookingFormData>({
    defaultValues: {
      contractId: '',
      bk: '',
      bl: '',
      shippingLine: '',
      etd: '',
      etdApi: '',
      eta: '',
      packingType: '',
      destination: '',
      notes: '',
      spot: '',
      quotaOverride: 'N',
      sequenceMode: 'auto',
      shipmentSeqText: '',
      containers: [],
      tempWeightMt: '',
      tempInvoiceAmount: '',
      tempPayments: [emptyTempPaymentRow()],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'containers',
  });

  const {
    fields: tempPaymentFields,
    append: appendTempPayment,
    remove: removeTempPayment,
  } = useFieldArray({
    control,
    name: 'tempPayments',
  });

  const tempInvoiceAmountWatch = useWatch({ control, name: 'tempInvoiceAmount' }) ?? '';
  const tempPaymentsWatch = useWatch({ control, name: 'tempPayments' }) ?? [];

  /** amount 갱신으로 tempPayments가 바뀌면 effect가 다시 돌아 무한 루프가 나므로, 의존성은 비율만 반영 */
  const tempPaymentRatiosKey = React.useMemo(
    () =>
      (tempPaymentsWatch as TempPaymentFormRow[])
        .map((p) => String(p?.ratio ?? '').trim())
        .join('\u0001'),
    [tempPaymentsWatch],
  );

  /** 임시 송장금액 × 비율(%) → 해당 차수 송장 금액 (서류 처리 결제와 동일) */
  React.useEffect(() => {
    const trimmed = String(tempInvoiceAmountWatch).trim();
    if (!trimmed) return;
    const invoiceAmount = Number(trimmed.replace(/,/g, ''));
    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) return;

    const payments = getValues('tempPayments') || [];
    payments.forEach((payment, index) => {
      const ratioStr = payment?.ratio?.trim() ?? '';
      if (!ratioStr) return;
      const ratio = Number(ratioStr.replace(/,/g, ''));
      if (!Number.isFinite(ratio)) return;
      const calculatedAmount = (invoiceAmount * ratio) / 100;
      const next = Number(calculatedAmount.toFixed(2)).toString();
      const current = String(payment?.amount ?? '').trim();
      const same =
        current !== '' &&
        Number.isFinite(Number(current.replace(/,/g, ''))) &&
        Math.abs(Number(current.replace(/,/g, '')) - Number(next)) < 1e-9;
      if (same) return;
      setValue(`tempPayments.${index}.amount`, next, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
  }, [tempInvoiceAmountWatch, tempPaymentRatiosKey, getValues, setValue]);

  const selectedContractId = watch('contractId');
  const selectedContract = React.useMemo<TradeContract | undefined>(() => {
    if (isEditMode && existingBooking) {
      // 수정 모드: existingBooking의 계약 정보 사용
      return bookingEligibleContracts.find((c) => c.id === existingBooking.contractId);
    }
    // 생성 모드: 선택한 계약 사용
    return bookingEligibleContracts.find((c) => c.id === selectedContractId);
  }, [isEditMode, existingBooking, bookingEligibleContracts, selectedContractId]);

  // 수정 모드일 때 기존 데이터 로드 (의존성에 existingBooking 객체 대신 id만 사용해 선적조회 적용 시 무한루프 방지)
  React.useEffect(() => {
    if (isEditMode && existingBooking && open) {
      reset({
        contractId: existingBooking.contractId || '',
        bk: existingBooking.bk || '',
        bl: existingBooking.bl || '',
        shippingLine: existingBooking.shippingLineCode || existingBooking.shippingLine || '',
        etd: existingBooking.etdDate || existingBooking.etdText || '',
        etdApi: existingBooking.etdApi || '',
        eta: existingBooking.etaDate || '',
        packingType: '',
        destination: existingBooking.destinationCode || '',
        notes: existingBooking.notes || '',
        spot: existingBooking.spot || '',
        // 주문에 쿼터 값이 있으면 사용, 없으면 계약 쿼터(아래 effect에서 설정)
        quotaOverride: (existingBooking.quota === 'Y' || existingBooking.quota === 'N') ? existingBooking.quota : 'N',
        sequenceMode: existingBooking.sequence != null ? 'manual' : 'auto',
        shipmentSeqText: existingBooking.sequence != null
          ? (existingBooking.sequenceSub ? `${existingBooking.sequence}-${existingBooking.sequenceSub}` : String(existingBooking.sequence))
          : '',
        containers: existingBooking.containers?.map((c) => ({
          id: c.id ?? undefined,
          containerNo: c.containerNo || '',
          product: c.product || '',
          tradeGrade: c.tradeGrade || '',
          packingType: c.packingType || '',
          currency: c.currency || '',
          unitPrice: c.unitPrice || undefined,
          weight: c.weight || undefined,
          tradeBales: c.tradeBales ?? undefined,
          salesBales: c.salesBales ?? undefined,
        })) || [],
        tempWeightMt:
          existingBooking.bookingTempWeightMt != null
            ? String(existingBooking.bookingTempWeightMt)
            : '',
        tempInvoiceAmount:
          existingBooking.bookingTempInvoiceAmount != null
            ? String(existingBooking.bookingTempInvoiceAmount)
            : '',
        tempPayments: (() => {
          const list = existingBooking.bookingTempPayments;
          if (!list?.length) return [emptyTempPaymentRow()];
          const sorted = [...list]
            .sort((a, b) => a.sequence - b.sequence)
            .slice(0, MAX_TEMP_BOOKING_PAYMENTS);
          return sorted.map(mapBookingTempPaymentFromApi);
        })(),
      });
    } else if (!open) {
      reset({
        contractId: '',
        bk: '',
        bl: '',
        shippingLine: '',
        etd: '',
        etdApi: '',
        eta: '',
        packingType: '',
        destination: '',
        notes: '',
        spot: '',
        quotaOverride: 'N',
        sequenceMode: 'auto',
        shipmentSeqText: '',
        containers: [],
        tempWeightMt: '',
        tempInvoiceAmount: '',
        tempPayments: [emptyTempPaymentRow()],
      });
      setTrackingDrawerOpen(false);
      setTrackingResult(null);
      setTrackingError(null);
    }
  }, [open, reset, isEditMode, bookingId, existingBooking?.id]);

  // 계약 선택 시 도착항 자동 설정
  React.useEffect(() => {
    if (selectedContract?.destination) {
      setValue('destination', selectedContract.destination);
    }
  }, [selectedContract, setValue]);

  // 계약 선택 시 주문별 쿼터 기본값 = 계약 쿼터 (변경 없으면 유지, 추후 여업 등에서 주문별 쿼터 유무로 사용)
  React.useEffect(() => {
    if (!selectedContract || !open) return;
    const contractQuota = selectedContract.quota === 'Y' || selectedContract.quota === 'N' ? selectedContract.quota : 'N';
    if (isEditMode && existingBooking && (existingBooking.quota === 'Y' || existingBooking.quota === 'N')) {
      setValue('quotaOverride', existingBooking.quota);
    } else {
      setValue('quotaOverride', contractQuota);
    }
  }, [selectedContract?.id, selectedContract?.quota, open, isEditMode, existingBooking?.quota, setValue]);

  const fetchTrackingByBk = React.useCallback(async (bk: string, bl?: string) => {
    setTrackingLoading(true);
    setTrackingError(null);
    setTrackingResult(null);

    try {
      const response = await api.post('/trade/contracts/tracking', {
        bk: bk.trim(),
        bl: bl?.trim() || null,
      });
      const data: TrackingResult = response.data ?? null;
      setTrackingResult(data);
    } catch (error: unknown) {
      console.error('선적 조회 중 오류가 발생했습니다.', error);
      const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const fallbackMessage = '선적 정보를 조회하는 중 문제가 발생했습니다.';
      setTrackingError(
        Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? fallbackMessage,
      );
    } finally {
      setTrackingLoading(false);
    }
  }, []);

  const handleApplyTracking = React.useCallback(() => {
    if (!trackingResult) return;

    const etaValue = trackingResult.eta ?? trackingResult.etaPriority ?? null;
    const blValue =
      trackingResult.responseBlNumber ??
      trackingResult.blNumber ??
      (watch('bl')?.trim() || null);
    const bookingValue =
      trackingResult.responseBookingNumber ??
      trackingResult.bookingNumber ??
      (watch('bk')?.trim() || null);

    if (etaValue) {
      setValue('eta', etaValue);
    }
    // ETD API는 참조용으로만 저장 (수기 입력 ETD는 건드리지 않음)
    if (trackingResult.etd) {
      setValue('etdApi', trackingResult.etd);
    }
    if (blValue && blValue !== watch('bl')) {
      setValue('bl', blValue);
    }
    if (bookingValue && bookingValue !== watch('bk')) {
      setValue('bk', bookingValue);
    }
    // 선사 정보 반영
    if (trackingResult.shippingLine?.trim()) {
      setValue('shippingLine', trackingResult.shippingLine.trim(), { shouldDirty: true });
    }

    // 컨테이너: 삭제 후 추가가 아님. 같은 컨테이너 번호면 해당 행만 업데이트(중량). id 유지로 판매(Sales) 연결 보존.
    if (trackingResult.containers && trackingResult.containers.length > 0) {
      const currentContainers = watch('containers') || [];
      let defaultProduct = '';
      let defaultTradeGrade = '';
      let defaultPackingType = '';
      let defaultCurrency = '';
      let defaultUnitPrice: number | undefined = undefined;

      const getPackingTypeCode = (packingNameOrCode: string | null | undefined): string => {
        if (!packingNameOrCode) return '';
        const foundByName = packingCodes?.find((code) => code.name === packingNameOrCode);
        if (foundByName?.value) return foundByName.value;
        const foundByValue = packingCodes?.find((code) => code.value === packingNameOrCode);
        if (foundByValue?.value) return foundByValue.value;
        return packingNameOrCode;
      };

      if (isEditMode && existingBooking) {
        const firstExistingContainer = existingBooking.containers?.[0];
        defaultProduct = firstExistingContainer?.product || existingBooking.productCode || selectedContract?.productName || '';
        defaultTradeGrade = firstExistingContainer?.tradeGrade || existingBooking.grade || selectedContract?.grade || '';
        const packingTypeFromContainer = firstExistingContainer?.packingType || '';
        const packingTypeFromOrder = existingBooking.packingCode || existingBooking.packingType || (existingBooking as any)?.packing || '';
        const packingTypeFromContract = selectedContract?.packingName || selectedContract?.packingType || '';
        defaultPackingType = getPackingTypeCode(packingTypeFromContainer || packingTypeFromOrder || packingTypeFromContract);
        defaultCurrency = firstExistingContainer?.currency || existingBooking.currencyCode || selectedContract?.currency || '';
        defaultUnitPrice = firstExistingContainer?.unitPrice
          ? Number(firstExistingContainer.unitPrice)
          : existingBooking.unitPrice
            ? Number(existingBooking.unitPrice)
            : selectedContract?.unitPrice
              ? Number(selectedContract.unitPrice)
              : undefined;
      } else {
        defaultProduct = selectedContract?.productName || '';
        defaultTradeGrade = selectedContract?.grade || '';
        defaultPackingType = getPackingTypeCode(selectedContract?.packingName || selectedContract?.packingType || '');
        defaultCurrency = selectedContract?.currency || '';
        defaultUnitPrice = selectedContract?.unitPrice ? Number(selectedContract.unitPrice) : undefined;
      }

      trackingResult.containers
        .filter((container) => !!container.containerNumber)
        .forEach((trackingContainer) => {
          const normalizedNo = (trackingContainer.containerNumber || '').trim().toUpperCase();
          const existingIndex = currentContainers.findIndex(
            (c: ContainerFormData) => (c.containerNo || '').trim().toUpperCase() === normalizedNo
          );
          const weightFromApi = trackingContainer.weight
            ? parseFloat(String(trackingContainer.weight).replace(/,/g, ''))
            : undefined;

          if (existingIndex >= 0) {
            if (weightFromApi !== undefined && weightFromApi !== null) {
              setValue(`containers.${existingIndex}.weight`, weightFromApi, { shouldDirty: true });
            }
          } else {
            append({
              containerNo: (trackingContainer.containerNumber || '').trim(),
              product: defaultProduct,
              tradeGrade: defaultTradeGrade,
              packingType: defaultPackingType,
              currency: defaultCurrency,
              unitPrice: defaultUnitPrice,
              weight: weightFromApi,
              _fromTracking: true,
            } as ContainerFormData);
          }
        });
    }

    setTrackingDrawerOpen(false);
    toastSuccess('선적 정보 반영 완료', '선적 조회 결과가 폼에 반영되었습니다.');
  }, [trackingResult, setValue, watch, append, selectedContract, isEditMode, existingBooking, packingCodes]);

  /** "7" → { seq: 7, sub: 0 }, "7-1" → { seq: 7, sub: 1 }. 빈 문자열/유효하지 않으면 null */
  const parseShipmentSeqText = (text: string | undefined): { seq: number; sub: number } | null => {
    const t = text?.trim();
    if (!t) return null;
    const dash = t.indexOf('-');
    if (dash === -1) {
      const n = parseInt(t, 10);
      if (Number.isNaN(n) || n < 1) return null;
      return { seq: n, sub: 0 };
    }
    const seq = parseInt(t.slice(0, dash).trim(), 10);
    const sub = parseInt(t.slice(dash + 1).trim(), 10);
    if (Number.isNaN(seq) || seq < 1 || Number.isNaN(sub) || sub < 0) return null;
    return { seq, sub };
  };

  const onFormSubmit = async (data: BookingFormData) => {
    if (!isEditMode && !data.contractId) {
      toastApiError({ response: { data: { message: '계약을 선택해주세요.' } } }, '계약 선택 필요');
      return;
    }

    if (!isEditMode && !selectedContract) {
      toastApiError({ response: { data: { message: '선택한 계약을 찾을 수 없습니다.' } } }, '계약 오류');
      return;
    }

    // 전체 주문 개수 검증 (생성 모드일 때만)
    if (!isEditMode && selectedContract) {
      const totalCount = selectedContract.totalOrderCount;
      const currentCount = selectedContract.orderCount ?? 0;
      
      if (totalCount !== null && totalCount !== undefined) {
        if (currentCount >= totalCount) {
          toastApiError(
            { response: { data: { message: `계약의 전체 주문 개수(${totalCount}개)를 초과할 수 없습니다. 현재 ${currentCount}개의 주문이 등록되어 있습니다.` } } },
            '주문 개수 초과'
          );
          return;
        }
      }
    }

    // 컨테이너가 있으면 모든 행에 컨테이너 번호 필수
    if (data.containers && data.containers.length > 0) {
      const emptyIndex = data.containers.findIndex((c) => !(c.containerNo != null && String(c.containerNo).trim() !== ''));
      if (emptyIndex !== -1) {
        toastApiError(
          { response: { data: { message: `컨테이너 ${emptyIndex + 1}번에 컨테이너 번호를 입력해주세요.` } } },
          '컨테이너 번호 필요'
        );
        return;
      }
      // 컨테이너 번호 중복 불가 (대소문자 구분 없이)
      const seen = new Set<string>();
      const duplicateIndex = data.containers.findIndex((c) => {
        const no = (c.containerNo != null && String(c.containerNo).trim() !== '') ? String(c.containerNo).trim().toUpperCase() : '';
        if (!no) return false;
        if (seen.has(no)) return true;
        seen.add(no);
        return false;
      });
      if (duplicateIndex !== -1) {
        const dupNo = data.containers[duplicateIndex].containerNo?.trim() ?? '';
        toastApiError(
          { response: { data: { message: `동일한 컨테이너 번호가 입력되어 있습니다. (${dupNo}) 컨테이너 번호는 행마다 서로 달라야 합니다.` } } },
          '컨테이너 번호 중복'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && bookingId) {
        // 수정 모드
        const parsedSeq = data.sequenceMode === 'manual' ? parseShipmentSeqText(data.shipmentSeqText) : null;
        const updateDto: UpdateTradeOrderDto = {
          bk: data.bk?.trim() || null,
          bl: data.bl?.trim() || null,
          shippingLine: data.shippingLine?.trim() || null,
          etd: data.etd || null,
          etdApi: data.etdApi || null,
          eta: data.eta || null,
          destination: data.destination || null,
          notes: data.notes?.trim() || null,
          spot: data.spot?.trim() || null,
          quota: data.quotaOverride === 'Y' || data.quotaOverride === 'N' ? data.quotaOverride : null,
          ...(parsedSeq !== null && { shipmentSeq: parsedSeq.seq, shipmentSeqSub: parsedSeq.sub }),
          // 컨테이너 정보. id 있으면 해당 행 갱신(번호/중량/베일 등), 없으면 신규. 목록에 없는 id는 삭제
          containers: data.containers && data.containers.length > 0
            ? data.containers
                .filter((c) => c.containerNo?.trim())
                .map((c) => ({
                  id: c.id != null ? String(c.id).trim() || undefined : undefined,
                  containerNo: c.containerNo?.trim() || null,
                  product: c.product?.trim() || null,
                  tradeGrade: c.tradeGrade?.trim() || null,
                  salesGrade: c.salesGrade?.trim() || null,
                  packingType: c.packingType?.trim() || null,
                  currency: c.currency?.trim() || null,
                  unitPrice: c.unitPrice || null,
                  weight: c.weight || null,
                  tradeBales: c.tradeBales ?? null,
                  salesBales: c.salesBales ?? null,
                }))
            : [],
          bookingTempWeightMt: parseBookingTempScalar(data.tempWeightMt),
          bookingTempInvoiceAmount: parseBookingTempScalar(data.tempInvoiceAmount),
          bookingTempPayments: buildBookingTempPaymentsPayload(data.tempPayments ?? []),
        };

        await updateMutation.mutateAsync({ id: bookingId, data: updateDto });
        toastSuccess('부킹 수정 완료', '부킹이 성공적으로 수정되었습니다.');
        onOpenChange(false);
        reset();
        if (onSubmit) {
          await onSubmit(bookingId);
        }
      } else {
        // 생성 모드
        const createDto: CreateTradeOrderDto = {
          contractId: data.contractId,
          contractNo: selectedContract!.contractNo || null,
          bk: data.bk?.trim() || null,
          bl: data.bl?.trim() || null,
          shippingLine: data.shippingLine?.trim() || null,
          etd: data.etd || null,
          etdApi: data.etdApi || null,
          eta: data.eta || null,
          destination: data.destination || null,
          notes: data.notes?.trim() || null,
          spot: data.spot?.trim() || null,
          // 계약 정보 복사
          exportCountry: selectedContract!.exportCountry || null,
          exporter: selectedContract!.exporter || null,
          productName: selectedContract!.productName || null,
          quota: data.quotaOverride === 'Y' || data.quotaOverride === 'N' ? data.quotaOverride : (selectedContract!.quota || null),
          fumigation: selectedContract!.fumigation || null,
          customsDuty: selectedContract!.customsDuty || null,
          // 순번: 자동이면 null(백엔드 할당), 수동이면 입력값 전송
          ...((): { shipmentSeq: number | null; shipmentSeqSub?: number } => {
            if (data.sequenceMode !== 'manual') return { shipmentSeq: null };
            const p = parseShipmentSeqText(data.shipmentSeqText);
            return p ? { shipmentSeq: p.seq, shipmentSeqSub: p.sub } : { shipmentSeq: null };
          })(),
          // 컨테이너 정보 (빈 컨테이너 번호 필터링)
          containers: data.containers && data.containers.length > 0
            ? data.containers
                .filter((c) => c.containerNo?.trim()) // 빈 컨테이너 번호 제거
                .map((c) => ({
                  containerNo: c.containerNo?.trim() || null,
                  product: c.product?.trim() || null,
                  tradeGrade: c.tradeGrade?.trim() || null,
                  salesGrade: c.salesGrade?.trim() || null,
                  packingType: c.packingType?.trim() || null,
                  currency: c.currency?.trim() || null,
                  unitPrice: c.unitPrice || null,
                  weight: c.weight || null,
                  tradeBales: c.tradeBales ?? null,
                  salesBales: c.salesBales ?? null,
                }))
            : [],
          bookingTempWeightMt: parseBookingTempScalar(data.tempWeightMt),
          bookingTempInvoiceAmount: parseBookingTempScalar(data.tempInvoiceAmount),
          bookingTempPayments: buildBookingTempPaymentsPayload(data.tempPayments ?? []),
        };

        const result = await createMutation.mutateAsync(createDto);
        toastSuccess('부킹 등록 완료', '부킹이 성공적으로 등록되었습니다.');
        onOpenChange(false);
        reset();
        if (onSubmit) {
          await onSubmit(result.orderId);
        }
      }
    } catch (error: unknown) {
      console.error(isEditMode ? '부킹 수정 오류:' : '부킹 등록 오류:', error);
      toastApiError(error as Parameters<typeof toastApiError>[0], isEditMode ? '부킹 수정 실패' : '부킹 등록 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 텍스트 선택을 위한 핸들러
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    // 텍스트 선택 중일 때는 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 텍스트 선택이 이미 시작된 경우에만 드래그 방지
    // 더블클릭으로 텍스트 선택을 시작하는 경우는 허용
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  // 더블클릭으로 텍스트 선택을 허용하기 위한 핸들러
  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    // 더블클릭 시 텍스트 선택이 가능하도록 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 더블클릭으로 텍스트 선택을 시작할 수 있도록 드래그 제스처 방지
    e.stopPropagation();
  }, []);

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent 
        className="h-full" 
        style={{ 
          width: '85%', 
          maxWidth: '1200px',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>{isEditMode ? '부킹 수정' : '부킹 등록'}</DrawerTitle>
              <DrawerDescription>
                {isEditMode
                  ? '부킹 정보를 수정하세요.'
                  : '계약을 선택하고 부킹 정보를 입력하세요. 순번은 자동/수동 중 선택할 수 있습니다.'}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-0"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            onDoubleClick={handleDoubleClick}
          >
            {isLoadingBooking && isEditMode ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* 계약 선택 - 생성 모드일 때만 표시 */}
                {!isEditMode && (
                  <div className="grid grid-cols-6 gap-4 pb-6">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="contractId" className="required">
                        계약 <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={watch('contractId') || undefined}
                        onValueChange={(value) => setValue('contractId', value, { shouldValidate: true })}
                      >
                        <SelectTrigger id="contractId" size="sm" className={errors.contractId ? 'border-destructive' : ''}>
                          <SelectValue placeholder="계약 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {bookingEligibleContracts.map((contract) => {
                            const productCode = productCodes?.find((code) => code.value === contract.productName);
                            const productName = productCode ? productCode.name : contract.productName || '';
                            return (
                              <SelectItem key={contract.id} value={contract.id}>
                                {contract.contractNo || '(계약번호 없음)'} - {productName}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

            {/* 계약 정보 상세 - 생성 모드: 선택한 계약, 수정 모드: 선택 계약 또는 기존 부킹(주문) 데이터로 표시 */}
            {(selectedContract || (isEditMode && existingBooking)) && (
              <div className={isEditMode ? 'pb-6' : 'pt-6 pb-6 border-t border-border'}>
                <ContractInfoSection
                  data={selectedContract ?? existingBooking!}
                  showTotalOrderCount={!isEditMode}
                />
              </div>
            )}

            {/* 부킹 섹션: 순번 ~ 주문별 쿼터 유무 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">부킹</h3>
              <div className="grid grid-cols-6 gap-4 pt-3">
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="shipmentSeqText">순번</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 flex-1 items-center gap-2">
                      {watch('sequenceMode') === 'auto' ? (
                        <div className="flex h-9 flex-1 items-center rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground">
                          자동 할당
                        </div>
                      ) : (
                        <Input
                          id="shipmentSeqText"
                          size="sm"
                          {...register('shipmentSeqText')}
                          placeholder="예: 7, 7-1, 7-2"
                          className="h-9 flex-1"
                        />
                      )}
                    </div>
                    <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm">
                      <Checkbox
                        checked={watch('sequenceMode') === 'manual'}
                        onCheckedChange={(checked) =>
                          setValue('sequenceMode', checked ? 'manual' : 'auto', { shouldDirty: true })
                        }
                      />
                      수동
                    </label>
                  </div>
                </div>
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="bk">BK</Label>
                  <div className="flex items-center gap-2">
                    <Input id="bk" size="sm" {...register('bk')} placeholder="BK 번호" className="flex-1" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => {
                        const bkValue = watch('bk')?.trim();
                        if (!bkValue) {
                          toastApiError(
                            { response: { data: { message: 'BK 번호를 입력해주세요.' } } },
                            'BK 번호 필요',
                          );
                          return;
                        }
                        setTrackingDrawerOpen(true);
                      }}
                      disabled={!watch('bk')?.trim()}
                      title="선적 조회"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="bl">BL</Label>
                  <Input id="bl" size="sm" {...register('bl')} placeholder="BL 번호" />
                </div>
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="shippingLine">선사</Label>
                  <Select
                    value={watch('shippingLine') || '__none__'}
                    onValueChange={(value) => setValue('shippingLine', value === '__none__' ? '' : value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="shippingLine" size="sm">
                      <SelectValue placeholder="선사 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안함</SelectItem>
                      {shippingLineOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="destination">도착항</Label>
                  <Select
                    value={watch('destination') || '__none__'}
                    onValueChange={(value) => setValue('destination', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id="destination" size="sm">
                      <SelectValue placeholder="도착항 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안함</SelectItem>
                      {destinationCodes?.map((code) => (
                        <SelectItem key={code.value} value={code.value || ''}>
                          {code.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-4 pt-3 mt-3">
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="etd">ETD (수기 입력)</Label>
                  <DatePicker
                    value={watch('etd') || undefined}
                    onChange={(value) => setValue('etd', value || '', { shouldValidate: true })}
                    placeholder="ETD 선택"
                  />
                </div>
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="etdApi" className="text-muted-foreground">ETD API (참조용)</Label>
                  <Input
                    id="etdApi"
                    size="sm"
                    value={watch('etdApi') || ''}
                    disabled={true}
                    className="bg-muted cursor-not-allowed"
                    placeholder="선적 조회 결과"
                  />
                </div>
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="eta">ETA</Label>
                  <DatePicker
                    value={watch('eta') || undefined}
                    onChange={(value) => setValue('eta', value || '', { shouldValidate: true })}
                    placeholder="ETA 선택"
                  />
                </div>
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="spot">현물 유무</Label>
                  <Switch
                    id="spot"
                    checked={watch('spot') === 'Y'}
                    onCheckedChange={(checked) => setValue('spot', checked ? 'Y' : 'N', { shouldDirty: true })}
                  />
                </div>
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="quotaOverride">주문별 쿼터 유무</Label>
                  <Switch
                    id="quotaOverride"
                    checked={watch('quotaOverride') === 'Y'}
                    onCheckedChange={(checked) => setValue('quotaOverride', checked ? 'Y' : 'N', { shouldDirty: true })}
                  />
                </div>
              </div>
            </div>

            {/* 임시 중량·송장·결제 (부킹 폼 전용 — 상세보기는 읽기 전용 2항목만) */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">임시 입력 (부킹)</h3>
                <p className="text-xs text-muted-foreground">저장 시 주문에 반영됩니다</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tempWeightMt">임시 중량 (MT)</Label>
                  <Input
                    id="tempWeightMt"
                    size="sm"
                    inputMode="decimal"
                    placeholder="예: 24.500"
                    className="font-mono"
                    {...register('tempWeightMt')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tempInvoiceAmount">임시 송장금액</Label>
                  <Input
                    id="tempInvoiceAmount"
                    size="sm"
                    inputMode="decimal"
                    placeholder="송장 확정 전 참고 금액"
                    className="font-mono"
                    {...register('tempInvoiceAmount')}
                  />
                </div>
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">임시 결제 정보</h3>
                  {tempPaymentFields.length < MAX_TEMP_BOOKING_PAYMENTS && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendTempPayment(emptyTempPaymentRow())}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      결제 추가
                    </Button>
                  )}
                </div>
                <div className="space-y-4">
                  {tempPaymentFields.map((tpField, tpIndex) => {
                    const baseId = `temp-pay-${tpIndex}`;
                    const currencyHint =
                      (isEditMode && existingBooking
                        ? existingBooking.invoiceCurrencyName ||
                          existingBooking.invoiceCurrency ||
                          existingBooking.currencyName ||
                          existingBooking.currencyCode
                        : '') ||
                      selectedContract?.currency ||
                      '';
                    return (
                      <div
                        key={tpField.id}
                        className="space-y-3 rounded-md border border-border bg-muted/10 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">{tpIndex + 1}차 결제</div>
                          {tempPaymentFields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeTempPayment(tpIndex)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="overflow-x-auto pb-1">
                          <div className="grid min-w-[56rem] grid-cols-7 gap-4">
                            <div className="space-y-2">
                              <Label>결제 예정일</Label>
                              <DatePicker
                                value={watch(`tempPayments.${tpIndex}.dueDate`) || undefined}
                                onChange={(value) =>
                                  setValue(`tempPayments.${tpIndex}.dueDate`, value || '', {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }
                                placeholder="결제 예정일"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`${baseId}-ratio`}>비율 (%)</Label>
                              <Input
                                id={`${baseId}-ratio`}
                                size="sm"
                                inputMode="decimal"
                                placeholder="예: 50"
                                className="font-mono text-sm"
                                {...register(`tempPayments.${tpIndex}.ratio`)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`${baseId}-amt`}>송장 금액</Label>
                              <Input
                                id={`${baseId}-amt`}
                                size="sm"
                                inputMode="decimal"
                                placeholder={currencyHint ? `${currencyHint} 금액` : '통화 금액'}
                                className="font-mono text-sm"
                                {...register(`tempPayments.${tpIndex}.amount`)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>결제 방법</Label>
                              <Select
                                value={watch(`tempPayments.${tpIndex}.method`) || '__none__'}
                                onValueChange={(value) =>
                                  setValue(
                                    `tempPayments.${tpIndex}.method`,
                                    value === '__none__' ? '' : value,
                                    { shouldDirty: true },
                                  )
                                }
                              >
                                <SelectTrigger size="sm" className="w-full">
                                  <SelectValue placeholder="선택" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">(미선택)</SelectItem>
                                  {(paymentMethodCodes ?? [])
                                    .filter((c): c is typeof c & { value: string } => Boolean(c.value))
                                    .map((c) => (
                                      <SelectItem key={c.value} value={c.value}>
                                        {c.name || c.value}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`${baseId}-fx`}>환율</Label>
                              <Input
                                id={`${baseId}-fx`}
                                size="sm"
                                inputMode="decimal"
                                placeholder="예: 1380.5"
                                className="font-mono text-sm"
                                {...register(`tempPayments.${tpIndex}.exchangeRate`)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`${baseId}-krw`}>결제 금액 (원화)</Label>
                              <Input
                                id={`${baseId}-krw`}
                                size="sm"
                                inputMode="decimal"
                                placeholder="원"
                                className="font-mono text-sm"
                                {...register(`tempPayments.${tpIndex}.krwAmount`)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>결과</Label>
                              <Select
                                value={watch(`tempPayments.${tpIndex}.result`) || '__none__'}
                                onValueChange={(value) =>
                                  setValue(
                                    `tempPayments.${tpIndex}.result`,
                                    value === '__none__' ? '' : value,
                                    { shouldDirty: true },
                                  )
                                }
                              >
                                <SelectTrigger size="sm" className="w-full">
                                  <SelectValue placeholder="선택" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">(미선택)</SelectItem>
                                  {paymentResultCodes
                                    .filter((c): c is typeof c & { value: string } => Boolean(c.value))
                                    .map((c) => (
                                      <SelectItem key={c.value} value={c.value}>
                                        {c.name || c.value}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 space-y-2">
                          <Label htmlFor={`${baseId}-notes`}>비고</Label>
                          <Textarea
                            id={`${baseId}-notes`}
                            placeholder="비고"
                            rows={2}
                            className="resize-y text-sm min-h-[3.5rem]"
                            {...register(`tempPayments.${tpIndex}.notes`)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 컨테이너 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">컨테이너 정보</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // 패킹 이름을 코드로 변환하는 헬퍼 함수
                    const getPackingTypeCode = (packingNameOrCode: string | null | undefined): string => {
                      if (!packingNameOrCode) return '';
                      const foundByName = packingCodes?.find((code) => code.name === packingNameOrCode);
                      if (foundByName?.value) return foundByName.value;
                      const foundByValue = packingCodes?.find((code) => code.value === packingNameOrCode);
                      if (foundByValue?.value) return foundByValue.value;
                      return packingNameOrCode;
                    };

                    // 수정 모드: 계약 선택 UI가 없으므로 빈 행만 추가
                    if (isEditMode) {
                      append({
                        containerNo: '',
                        product: '',
                        tradeGrade: '',
                        packingType: '',
                        currency: '',
                        unitPrice: undefined,
                        weight: undefined,
                        tradeBales: undefined,
                        salesBales: undefined,
                      });
                      return;
                    }

                    if (!selectedContract) {
                      toastApiError(
                        { response: { data: { message: '계약을 먼저 선택해주세요.' } } },
                        '계약 선택 필요',
                      );
                      return;
                    }
                    
                    const defaultProduct = selectedContract.productName || '';
                    const defaultTradeGrade = selectedContract.grade || '';
                    // packingName이 있으면 우선 사용, 없으면 packingType 사용
                    const packingTypeSource = selectedContract.packingName || selectedContract.packingType || '';
                    const defaultPackingType = getPackingTypeCode(packingTypeSource);
                    const defaultCurrency = selectedContract.currency || '';
                    const defaultUnitPrice = selectedContract.unitPrice
                      ? Number(selectedContract.unitPrice)
                      : undefined;
                    
                    append({
                      containerNo: '',
                      product: defaultProduct,
                      tradeGrade: defaultTradeGrade,
                      packingType: defaultPackingType,
                      currency: defaultCurrency,
                      unitPrice: defaultUnitPrice,
                      weight: undefined,
                      tradeBales: undefined,
                      salesBales: undefined,
                    });
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  컨테이너 추가
                </Button>
              </div>
              {fields.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  컨테이너 정보가 없습니다. &quot;컨테이너 추가&quot; 버튼을 클릭하거나 선적 조회에서 &quot;폼에 반영&quot;을 사용하세요.
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    파란색 배경은 선적 조회로 추가된 컨테이너입니다.
                  </p>
                  <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className={`space-y-3 p-3 border rounded-md ${
                        watch(`containers.${index}._fromTracking`)
                          ? 'bg-blue-100/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-semibold">컨테이너 {index + 1}</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,10rem)_minmax(0,10rem)_minmax(0,8rem)_5rem_5rem_5rem_5rem_5rem] gap-4">
                        <div className="space-y-2 min-w-0 max-w-[10rem]">
                          <Label>컨테이너 번호</Label>
                          <Input
                            size="sm"
                            {...register(`containers.${index}.containerNo`)}
                            placeholder="컨테이너 번호"
                          />
                        </div>
                        <div className="space-y-2 min-w-0 max-w-[10rem]">
                          <Label>상품</Label>
                          <Select
                            value={watch(`containers.${index}.product`) || '__none__'}
                            onValueChange={(value) => setValue(`containers.${index}.product`, value === '__none__' ? '' : value)}
                          >
                            <SelectTrigger size="sm">
                              <SelectValue placeholder="상품 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">선택 안함</SelectItem>
                              {productCodes?.map((code) => (
                                <SelectItem key={code.value} value={code.value || ''}>
                                  {code.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 min-w-0 max-w-[10rem]">
                          <Label>등급(무역)</Label>
                          <Input
                            size="sm"
                            {...register(`containers.${index}.tradeGrade`)}
                            placeholder="등급 입력"
                          />
                        </div>
                        <div className="space-y-2 min-w-0 max-w-[8rem]">
                          <Label>패킹 타입</Label>
                          <Select
                            value={watch(`containers.${index}.packingType`) || '__none__'}
                            onValueChange={(value) => setValue(`containers.${index}.packingType`, value === '__none__' ? '' : value)}
                          >
                            <SelectTrigger size="sm">
                              <SelectValue placeholder="패킹 타입 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">선택 안함</SelectItem>
                              {packingOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 min-w-0 max-w-[5rem]">
                          <Label>통화단위</Label>
                          <Select
                            value={watch(`containers.${index}.currency`) || '__none__'}
                            onValueChange={(value) => setValue(`containers.${index}.currency`, value === '__none__' ? '' : value)}
                          >
                            <SelectTrigger size="sm">
                              <SelectValue placeholder="통화 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">선택 안함</SelectItem>
                              {currencyCodes?.map((code) => (
                                <SelectItem key={code.value} value={code.value || ''}>
                                  {code.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 min-w-0 max-w-[5rem]">
                          <Label>단가</Label>
                          <Input
                            type="number"
                            step="0.01"
                            size="sm"
                            {...register(`containers.${index}.unitPrice`, { valueAsNumber: true })}
                            placeholder="단가"
                          />
                        </div>
                        <div className="space-y-2 min-w-0 max-w-[5rem]">
                          <Label>베일(무역)</Label>
                          <Input
                            type="number"
                            step="0.0001"
                            size="sm"
                            {...register(`containers.${index}.tradeBales`, { valueAsNumber: true })}
                            placeholder="베일(무역)"
                          />
                        </div>
                        <div className="space-y-2 min-w-0 max-w-[5rem]">
                          <Label>베일(영업)</Label>
                          <Input
                            type="number"
                            step="0.0001"
                            size="sm"
                            {...register(`containers.${index}.salesBales`, { valueAsNumber: true })}
                            placeholder="선택(동일시 비움)"
                          />
                        </div>
                        <div className="space-y-2 min-w-0 max-w-[5rem]">
                          <Label>중량</Label>
                          <NumberInput
                            value={watch(`containers.${index}.weight`)}
                            onChange={(value) => setValue(`containers.${index}.weight`, value ?? undefined)}
                            placeholder="0.000"
                            step={0.001}
                            decimals={3}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                </>
              )}
            </div>

                {/* 비고 */}
                <div className="space-y-3 pt-6 pb-6 border-t border-border">
                  <h3 className="text-sm font-semibold text-foreground">비고</h3>
                  <div className="space-y-2">
                    <Label htmlFor="notes">비고</Label>
                    <Textarea id="notes" rows={4} {...register('notes')} placeholder="비고" />
                  </div>
                </div>
              </>
            )}
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-end gap-2">
              <DrawerClose asChild>
                <Button type="button" variant="outline" size="sm" disabled={isSubmitting}>
                  <X className="mr-2 h-4 w-4" />
                  취소
                </Button>
              </DrawerClose>
              <Button type="submit" size="sm" disabled={isSubmitting || (isEditMode && isLoadingBooking)}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {isEditMode ? '수정' : '등록'}
                  </>
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
        </DrawerContent>
      </Drawer>

    {/* 선적 조회 Drawer */}
    <Drawer open={trackingDrawerOpen} onOpenChange={setTrackingDrawerOpen} direction="right">
          <DrawerContent className="h-full" style={{ width: '480px', maxWidth: '480px' }}>
            <DrawerHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <DrawerTitle>선적 조회</DrawerTitle>
                  <DrawerDescription>
                    SeaRates API를 통해 실시간 선적 정보를 확인합니다.
                  </DrawerDescription>
                </div>
                <DrawerClose asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <X className="h-4 w-4" />
                    <span className="sr-only">닫기</span>
                  </Button>
                </DrawerClose>
              </div>
            </DrawerHeader>
            <div className="flex flex-col flex-1 min-h-0">
              <div className="px-4 py-3 border-b text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>조회 기준</span>
                  <span className="font-semibold text-foreground">
                    {trackingResult?.identifier
                      ? `${trackingResult.identifierType === 'BK' ? 'Booking' : 'B/L'} (${trackingResult.identifier})`
                      : watch('bk')
                        ? `Booking (${watch('bk')})`
                        : watch('bl')
                          ? `B/L (${watch('bl')})`
                          : '-'}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {!trackingResult && !trackingLoading && (
                  <div className="text-xs text-muted-foreground mb-4">
                    BK 번호를 입력한 뒤 <strong>선적 조회</strong> 버튼을 누르면 SeaRates API를 통해 선적 정보를 조회합니다.
                  </div>
                )}
                {/* 선적 조회 버튼 */}
                {watch('bk')?.trim() && (
                  <div className="flex justify-end mb-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const bkValue = watch('bk')?.trim();
                        if (bkValue) {
                          void fetchTrackingByBk(bkValue, watch('bl'));
                        }
                      }}
                      disabled={trackingLoading || !watch('bk')?.trim()}
                    >
                      {trackingLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          조회 중...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          {trackingResult ? '다시 조회' : '선적 조회'}
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">선적 상태</span>
                </div>

                {trackingLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    선적 정보를 불러오는 중입니다...
                  </div>
                ) : trackingError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {trackingError}
                  </div>
                ) : trackingResult ? (
                  <>
                    <div className="rounded-md border border-border bg-muted/10 px-3 py-3">
                      <dl className="space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">ETD</dt>
                          <dd className="font-medium text-foreground">
                            {trackingResult.etd || '정보 없음'}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">ETA</dt>
                          <dd className="font-medium text-foreground">
                            {trackingResult.eta || '정보 없음'}
                          </dd>
                        </div>
                        {trackingResult.etaDestination && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-muted-foreground">도착지</dt>
                            <dd className="font-medium text-foreground">
                              {trackingResult.etaDestination}
                            </dd>
                          </div>
                        )}
                        {trackingResult.identifier && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-muted-foreground">조회 식별자</dt>
                            <dd className="font-medium text-foreground">
                              {trackingResult.identifierType === 'BK' ? 'Booking' : 'B/L'} · {trackingResult.identifier}
                            </dd>
                          </div>
                        )}
                        {trackingResult.shippingLine && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-muted-foreground">선사</dt>
                            <dd className="font-medium text-foreground">
                              {trackingResult.shippingLine}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    <div className="rounded-md border border-border bg-muted/10 px-3 py-3 text-xs space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">API 사용량</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">API 호출</span>
                        <span className="font-medium text-foreground">
                          {formatUsageValue(trackingResult.usage?.apiCalls?.used)} /{' '}
                          {formatUsageValue(trackingResult.usage?.apiCalls?.total)}
                          {trackingResult.usage?.apiCalls?.remaining !== null &&
                            trackingResult.usage?.apiCalls?.remaining !== undefined && (
                              <span className="text-muted-foreground ml-1">
                                (잔여 {formatUsageValue(trackingResult.usage?.apiCalls?.remaining)})
                              </span>
                            )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">고유 선적</span>
                        <span className="font-medium text-foreground">
                          {formatUsageValue(trackingResult.usage?.uniqueShipments?.used)} /{' '}
                          {formatUsageValue(trackingResult.usage?.uniqueShipments?.total)}
                          {trackingResult.usage?.uniqueShipments?.remaining !== null &&
                            trackingResult.usage?.uniqueShipments?.remaining !== undefined && (
                              <span className="text-muted-foreground ml-1">
                                (잔여 {formatUsageValue(trackingResult.usage?.uniqueShipments?.remaining)})
                              </span>
                            )}
                        </span>
                      </div>
                    </div>

                    {(trackingResult.blNumber ||
                      trackingResult.responseBlNumber ||
                      trackingResult.bookingNumber ||
                      trackingResult.responseBookingNumber) && (
                      <div className="rounded-md border border-border bg-background px-3 py-3 text-xs space-y-2">
                        <h3 className="text-sm font-semibold text-foreground">식별자 정보</h3>
                        {(trackingResult.responseBlNumber || trackingResult.blNumber) && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">B/L 번호</span>
                            <span className="font-medium text-foreground">
                              {trackingResult.responseBlNumber || trackingResult.blNumber || '-'}
                            </span>
                          </div>
                        )}
                        {(trackingResult.responseBookingNumber || trackingResult.bookingNumber) && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Booking 번호</span>
                            <span className="font-medium text-foreground">
                              {trackingResult.responseBookingNumber || trackingResult.bookingNumber || '-'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">컨테이너</h3>
                      {trackingResult.containers && trackingResult.containers.length > 0 ? (
                        <div className="space-y-3">
                          {trackingResult.containers.map((container, index) => (
                            <div
                              key={`${container.containerNumber ?? index}-${index}`}
                              className="rounded-md border border-border bg-background px-3 py-2 text-xs space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-semibold text-foreground">
                                  {container.containerNumber || `컨테이너 ${index + 1}`}
                                </div>
                                {container.weight && (
                                  <span className="text-muted-foreground">{container.weight}</span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                <div>
                                  <span className="text-muted-foreground">Gate Out</span>
                                  <div className="text-foreground">
                                    {container.gateOutDate || '-'}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Detention</span>
                                  <div className="text-foreground">
                                    {container.detentionDays != null
                                      ? `${container.detentionDays}일`
                                      : '-'}
                                  </div>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">마지막 이벤트</span>
                                  <div className="text-foreground">
                                    {container.lastEvent || '-'}
                                  </div>
                                </div>
                              </div>
                              {container.events && container.events.length > 0 && (
                                <details className="rounded border border-dashed border-border px-3 py-2">
                                  <summary className="cursor-pointer text-muted-foreground">
                                    이벤트 타임라인 보기
                                  </summary>
                                  <ul className="mt-2 space-y-1">
                                    {container.events.map((event, eventIndex) => (
                                      <li key={`${event.date ?? eventIndex}-${eventIndex}`}>
                                        <div className="flex flex-col">
                                          <span className="font-medium text-foreground">
                                            {event.date || '-'}
                                          </span>
                                          <span className="text-muted-foreground">
                                            {event.description || event.code || '이벤트 정보 없음'}
                                          </span>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-xs text-muted-foreground text-center">
                          컨테이너 정보가 없습니다.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-sm text-muted-foreground text-center">
                    선적 정보를 조회하려면 상단의 <strong>선적 조회</strong> 버튼을 눌러주세요.
                  </div>
                )}
              </div>
            </div>
            <DrawerFooter className="border-t">
              <DrawerClose asChild>
                <Button type="button" size="sm" variant="outline">
                  닫기
                </Button>
              </DrawerClose>
              <Button
                type="button"
                size="sm"
                disabled={trackingLoading || !!trackingError || !trackingResult}
                onClick={handleApplyTracking}
              >
                폼에 반영
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
    </>
  );
}

