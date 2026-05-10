'use client';

import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Save, Plus, Trash2, FileText, Eye, Search, Calculator, Folder } from 'lucide-react';
import { toastSuccess, toastApiError, toastError } from '@/lib/utils/toast-helpers';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { InvoiceAnalysisDrawer } from '@/components/trade-order/invoice-analysis-drawer';
import { DatePicker } from '@/components/schedules/date-picker';
import { NumberInput } from '@/components/ui/number-input';
import {
  TradeOrder,
  UpdateTradeOrderDto,
  useUpdateTradeOrder,
  useTradeOrder,
  formatOrderSequence,
} from '@/lib/hooks/use-trade-orders';
import { useTradeContract } from '@/lib/hooks/use-trade-contracts';
import { Separator } from '@/components/ui/separator';
import { useQueryClient } from '@tanstack/react-query';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { ContractInfoSection } from '@/components/booking/contract-info-section';
import api from '@/lib/api';
import { calculatePacking } from '@/lib/utils/packing-calculator';

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
  tradeBales?: number | null;
  salesBales?: number | null;
  /** 선적 조회로 추가된 컨테이너 표시용 (API 전송 제외) */
  _fromTracking?: boolean;
}

interface PaymentFormData {
  dueDate?: string;
  ratio?: number;
  amount?: number;
  method?: string;
  exchangeRate?: number;
  result?: string;
  notes?: string;
  useRatio?: boolean; // 비율 사용 여부 (기본값: true)
}

interface CustomsProcessingFormData {
  bk?: string;
  bl?: string;
  shippingLine?: string;
  etd?: string;
  etdApi?: string;
  eta?: string;
  packingType?: string;
  destination?: string;
  notes?: string;
  spot?: string; // 현물 유무
  quota?: string; // 주문별 쿼터 유무
  invoiceDate?: string;
  invoiceAmount?: number;
  invoiceWeight?: number;
  certificateNumber?: string; // 필증번호
  hasOriginalShipment?: string | null; // 원본발송 유무 ('Y'/'N')
  originalShipment?: string | null; // 원본발송일
  quarantineDate?: string | null; // 검역일
  customsDate?: string; // 통관일
  customsCertificateGoogleDriveFileId?: string | null; // 면장 파일
  customsCertificateFileName?: string | null; // 면장 파일명
  customsCertificateGoogleDriveFileId2?: string | null; // 면장 파일(추가)
  customsCertificateFileName2?: string | null;
  doGoogleDriveFileId?: string | null; // DO 파일
  doFileName?: string | null; // DO 파일명
  customsScheduledDate?: string | null; // 통관예정일
  payments?: PaymentFormData[];
  containers?: ContainerFormData[];
}

interface CustomsProcessingFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: string | null;
  onSubmit?: () => void;
  onCancel?: () => void;
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

const formatUsageValue = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR');
};

export function CustomsProcessingFormDrawer({
  open,
  onOpenChange,
  orderId,
  onSubmit,
  onCancel,
}: CustomsProcessingFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [invoiceFile, setInvoiceFile] = React.useState<GoogleDriveFile | null>(null);
  const [certificateFile, setCertificateFile] = React.useState<GoogleDriveFile | null>(null);
  const [certificateFile2, setCertificateFile2] = React.useState<GoogleDriveFile | null>(null);
  const [doFile, setDoFile] = React.useState<GoogleDriveFile | null>(null);
  const [trackingDrawerOpen, setTrackingDrawerOpen] = React.useState(false);
  const [trackingLoading, setTrackingLoading] = React.useState(false);
  const [trackingError, setTrackingError] = React.useState<string | null>(null);
  const [trackingResult, setTrackingResult] = React.useState<TrackingResult | null>(null);
  const [trackingIdentifierType, setTrackingIdentifierType] = React.useState<'BK' | 'BL'>('BK');
  const [invoiceAnalysisDrawerOpen, setInvoiceAnalysisDrawerOpen] = React.useState(false);
  const [certificateFilePickerOpen, setCertificateFilePickerOpen] = React.useState(false);
  const [certificateFilePreviewOpen, setCertificateFilePreviewOpen] = React.useState(false);
  const [certificateFilePicker2Open, setCertificateFilePicker2Open] = React.useState(false);
  const [certificateFilePreview2Open, setCertificateFilePreview2Open] = React.useState(false);
  const [doFilePickerOpen, setDoFilePickerOpen] = React.useState(false);
  const [doFilePreviewOpen, setDoFilePreviewOpen] = React.useState(false);
  
  const updateMutation = useUpdateTradeOrder();
  const queryClient = useQueryClient();
  const { data: existingOrder, isLoading: isLoadingOrder } = useTradeOrder(orderId ?? undefined);
  
  // 계약 정보 조회 (패킹 타입 기본값을 위해)
  const { data: contractData } = useTradeContract(existingOrder?.contractId ?? undefined);

  // 기존 송장 파일 메타데이터 조회 (수정 모드일 때만)
  const invoiceFileId = existingOrder?.invoiceGoogleDriveFileId || null;
  const shouldFetchInvoiceMetadata = open && !!existingOrder?.invoiceGoogleDriveFileId;
  
  const { data: existingInvoiceFileMetadata } = useGoogleDriveFileMetadata(
    invoiceFileId,
    shouldFetchInvoiceMetadata,
  );

  // 기존 면장 파일 메타데이터 조회 (수정 모드일 때만)
  const certificateFileId = existingOrder?.customsCertificateGoogleDriveFileId || null;
  const shouldFetchCertificateMetadata = open && !!existingOrder?.customsCertificateGoogleDriveFileId;
  
  const { data: existingCertificateFileMetadata } = useGoogleDriveFileMetadata(
    certificateFileId,
    shouldFetchCertificateMetadata,
  );

  const certificateFileId2 = existingOrder?.customsCertificateGoogleDriveFileId2 || null;
  const shouldFetchCertificateMetadata2 = open && !!existingOrder?.customsCertificateGoogleDriveFileId2;

  const { data: existingCertificateFileMetadata2 } = useGoogleDriveFileMetadata(
    certificateFileId2,
    shouldFetchCertificateMetadata2,
  );

  // 기존 DO 파일 메타데이터 조회 (수정 모드일 때만)
  const doFileId = existingOrder?.doGoogleDriveFileId || null;
  const shouldFetchDoMetadata = open && !!existingOrder?.doGoogleDriveFileId;
  
  const { data: existingDoFileMetadata } = useGoogleDriveFileMetadata(
    doFileId,
    shouldFetchDoMetadata,
  );
  
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const shippingLineOptions = React.useMemo(() => {
    return (shippingLineCodes ?? []).map((code) => ({ value: code.value || '', label: code.name || code.value || '' }));
  }, [shippingLineCodes]);
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: currencyCodes } = useCodesByCategory('CURRENCY');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: paymentMethodCodes } = useCodesByCategory('PAYMENT_TERMS');
  const { data: paymentResultCodes } = useCodesByCategory('PAYMENT_RESULT');

  const paymentMethodOptions = React.useMemo(() => {
    return paymentMethodCodes?.map((code) => ({
      value: code.value || '',
      label: code.name || code.value || '',
    })) || [];
  }, [paymentMethodCodes]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<CustomsProcessingFormData>({
    defaultValues: {
      bk: '',
      bl: '',
      etd: '',
      etdApi: '',
      eta: '',
      packingType: '',
      destination: '',
      notes: '',
      invoiceDate: '',
      invoiceAmount: undefined,
      invoiceWeight: undefined,
      certificateNumber: '',
      hasOriginalShipment: null,
      originalShipment: null,
      quarantineDate: null,
      customsDate: '',
      customsCertificateGoogleDriveFileId: null,
      customsCertificateFileName: null,
      customsCertificateGoogleDriveFileId2: null,
      customsCertificateFileName2: null,
      doGoogleDriveFileId: null,
      doFileName: null,
      customsScheduledDate: null,
      payments: [{ dueDate: '', ratio: undefined, amount: undefined, method: '', exchangeRate: undefined, result: '', notes: '', useRatio: true }], // 최소 1개는 항상 있음
      containers: [],
    },
  });

  const { fields: containerFields, append: appendContainer, remove: removeContainer } = useFieldArray({
    control,
    name: 'containers',
  });

  const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({
    control,
    name: 'payments',
  });

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (doFilePreviewOpen) {
        e.preventDefault();
        setDoFilePreviewOpen(false);
        return;
      }
      if (doFilePickerOpen) {
        e.preventDefault();
        setDoFilePickerOpen(false);
        return;
      }
      if (certificateFilePreview2Open) {
        e.preventDefault();
        setCertificateFilePreview2Open(false);
        return;
      }
      if (certificateFilePicker2Open) {
        e.preventDefault();
        setCertificateFilePicker2Open(false);
        return;
      }
      if (certificateFilePreviewOpen) {
        e.preventDefault();
        setCertificateFilePreviewOpen(false);
        return;
      }
      if (certificateFilePickerOpen) {
        e.preventDefault();
        setCertificateFilePickerOpen(false);
        return;
      }
      if (invoiceAnalysisDrawerOpen) {
        e.preventDefault();
        setInvoiceAnalysisDrawerOpen(false);
        return;
      }
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
  }, [
    open,
    doFilePreviewOpen,
    doFilePickerOpen,
    certificateFilePreview2Open,
    certificateFilePicker2Open,
    certificateFilePreviewOpen,
    certificateFilePickerOpen,
    invoiceAnalysisDrawerOpen,
    trackingDrawerOpen,
    onOpenChange,
  ]);

  // 송장 금액과 비율을 감시하여 자동 계산
  const payments = watch('payments') || [];
  const invoiceAmount = watch('invoiceAmount');

  // 비율 변경 시 금액 자동 계산
  React.useEffect(() => {
    if (!invoiceAmount) return;
    
    payments.forEach((payment, index) => {
      if (payment.ratio !== undefined && payment.ratio !== null) {
        const calculatedAmount = (invoiceAmount * payment.ratio) / 100;
        setValue(`payments.${index}.amount`, Number(calculatedAmount.toFixed(2)));
      }
    });
  }, [invoiceAmount, payments, setValue]);

  // 영업일 계산 함수 (주말 제외, Google Sheets의 WORKDAY 함수와 동일)
  const addWorkdays = React.useCallback((startDate: Date, days: number): Date => {
    if (days === 0) {
      return new Date(startDate);
    }

    const result = new Date(startDate);
    let remainingDays = Math.abs(days);
    const direction = days > 0 ? 1 : -1;

    while (remainingDays > 0) {
      result.setDate(result.getDate() + direction);
      const dayOfWeek = result.getDay();
      // 토요일(6)과 일요일(0)이 아니면 영업일로 간주
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        remainingDays--;
      }
    }

    return result;
  }, []);

  // 날짜를 YYYY-MM-DD 형식으로 변환
  const formatDateToString = React.useCallback((date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // 결제 예정일 계산 핸들러
  const handleCalculatePaymentDate = React.useCallback((
    paymentIndex: number,
    calculationType: 'etd+3' | 'etd+88' | 'eta-5'
  ) => {
    let baseDate: Date | null = null;
    let message = '';

    if (calculationType === 'etd+3' || calculationType === 'etd+88') {
      const etdValue = watch('etd');
      if (!etdValue) {
        toastError('ETD 필요', 'ETD를 먼저 입력해주세요.');
        return;
      }
      
      const etdDate = typeof etdValue === 'string' ? new Date(etdValue) : etdValue;
      if (isNaN(etdDate.getTime())) {
        toastError('유효하지 않은 날짜', 'ETD 날짜 형식이 올바르지 않습니다.');
        return;
      }
      
      baseDate = etdDate;
      const days = calculationType === 'etd+3' ? 3 : 88;
      
      // ETD + 3일 또는 ETD + 88일
      const afterDays = new Date(baseDate);
      afterDays.setDate(afterDays.getDate() + days);
      
      // 영업일 1일 더하기 (주말 제외)
      const resultDate = addWorkdays(afterDays, 1);
      const dateString = formatDateToString(resultDate);
      
      setValue(`payments.${paymentIndex}.dueDate`, dateString);
      message = `ETD+${days}일 후 영업일 1일 계산 완료`;
    } else if (calculationType === 'eta-5') {
      const etaValue = watch('eta');
      if (!etaValue) {
        toastError('ETA 필요', 'ETA를 먼저 입력해주세요.');
        return;
      }
      
      const etaDate = typeof etaValue === 'string' ? new Date(etaValue) : etaValue;
      if (isNaN(etaDate.getTime())) {
        toastError('유효하지 않은 날짜', 'ETA 날짜 형식이 올바르지 않습니다.');
        return;
      }
      
      baseDate = etaDate;
      
      // ETA - 5일
      const afterMinus5Days = new Date(baseDate);
      afterMinus5Days.setDate(afterMinus5Days.getDate() - 5);
      
      // 영업일 1일 더하기 (주말 제외)
      const resultDate = addWorkdays(afterMinus5Days, 1);
      const dateString = formatDateToString(resultDate);
      
      setValue(`payments.${paymentIndex}.dueDate`, dateString);
      message = 'ETA-5일 후 영업일 1일 계산 완료';
    }
    
    if (message) {
      toastSuccess('계산 완료', message);
    }
  }, [watch, setValue, addWorkdays, formatDateToString]);

  // 선적조회 함수
  const fetchTracking = React.useCallback(async (identifier: string, type: 'BK' | 'BL') => {
    setTrackingLoading(true);
    setTrackingError(null);
    setTrackingResult(null);
    setTrackingIdentifierType(type);

    try {
      const response = await api.post('/trade/contracts/tracking', {
        [type.toLowerCase()]: identifier.trim(),
        ...(type === 'BK' && watch('bl')?.trim() ? { bl: watch('bl')?.trim() } : {}),
        ...(type === 'BL' && watch('bk')?.trim() ? { bk: watch('bk')?.trim() } : {}),
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
  }, [watch]);

  // 선적조회 결과를 폼에 반영
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
      const firstExistingContainer = existingOrder?.containers?.[0];

      const getPackingTypeCode = (packingNameOrCode: string | null | undefined): string => {
        if (!packingNameOrCode) return '';
        const foundByName = packingCodes?.find((code) => code.name === packingNameOrCode);
        if (foundByName?.value) return foundByName.value;
        const foundByValue = packingCodes?.find((code) => code.value === packingNameOrCode);
        if (foundByValue?.value) return foundByValue.value;
        return packingNameOrCode;
      };

      const defaultProduct = firstExistingContainer?.product || existingOrder?.productCode || '';
      const defaultTradeGrade = firstExistingContainer?.tradeGrade || existingOrder?.grade || '';
      const packingTypeFromContainer = firstExistingContainer?.packingType || '';
      const packingTypeFromOrder = existingOrder?.packingCode
        || existingOrder?.packingType
        || (existingOrder as any)?.packing
        || '';
      const packingTypeFromContract = contractData?.packingName || contractData?.packingType || '';
      const defaultPackingType = getPackingTypeCode(packingTypeFromContainer || packingTypeFromOrder || packingTypeFromContract);
      const defaultCurrency = firstExistingContainer?.currency || existingOrder?.currencyCode || '';
      const defaultUnitPrice = firstExistingContainer?.unitPrice
        ? Number(firstExistingContainer.unitPrice)
        : existingOrder?.unitPrice
          ? Number(existingOrder.unitPrice)
          : undefined;

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
            appendContainer({
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
    toastSuccess('적용 완료', '선적 조회 결과가 폼에 반영되었습니다.');
  }, [trackingResult, watch, setValue, appendContainer, existingOrder, packingCodes, contractData]);

  // 기존 데이터 로드 (의존성에 existingOrder 객체 대신 orderId/existingOrder?.id 사용해 선적조회 적용 시 무한루프 방지)
  React.useEffect(() => {
    if (existingOrder && open) {
      reset({
        bk: existingOrder.bk || '',
        bl: existingOrder.bl || '',
        shippingLine: existingOrder.shippingLineCode || existingOrder.shippingLine || '',
        etd: existingOrder.etdDate || existingOrder.etdText || '',
        etdApi: existingOrder.etdApi || '',
        eta: existingOrder.etaDate || '',
        packingType: existingOrder.packingType || '',
        destination: existingOrder.destinationCode || '',
        notes: existingOrder.notes || '',
        spot: existingOrder.spot || '',
        quota: (existingOrder.quota === 'Y' || existingOrder.quota === 'N') ? existingOrder.quota : '',
        invoiceDate: existingOrder.invoiceDate || '',
        invoiceAmount: existingOrder.invoiceAmount || undefined,
        invoiceWeight: existingOrder.invoiceWeight || undefined,
        certificateNumber: existingOrder.certificateNumber || '',
        hasOriginalShipment: existingOrder.hasOriginalShipment || null,
        originalShipment: existingOrder.originalShipment || null,
        quarantineDate: existingOrder.quarantineDate || null,
        customsDate: existingOrder.customsDate || '',
        customsCertificateGoogleDriveFileId: existingOrder.customsCertificateGoogleDriveFileId || null,
        customsCertificateFileName: existingOrder.customsCertificateFileName || null,
        customsCertificateGoogleDriveFileId2: existingOrder.customsCertificateGoogleDriveFileId2 || null,
        customsCertificateFileName2: existingOrder.customsCertificateFileName2 || null,
        doGoogleDriveFileId: existingOrder.doGoogleDriveFileId || null,
        doFileName: existingOrder.doFileName || null,
        customsScheduledDate: existingOrder.customsScheduledDate || null,
        payments: existingOrder.payments && existingOrder.payments.length > 0
          ? existingOrder.payments
              .slice()
              .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
              // DO 비용, 통관 비용 결제 항목 제외
              .filter((p) => p.paymentType !== 'DO_COST' && p.paymentType !== 'CUSTOMS_COST')
              .map((p) => ({
                dueDate: p.dueDate || '',
                ratio: p.ratio || undefined,
                amount: p.amount || undefined,
                method: p.method || '',
                exchangeRate: p.exchangeRate || undefined,
                result: p.result || '',
                notes: p.notes || '',
                useRatio: (p as any).useRatio !== undefined ? (p as any).useRatio : true, // DB에서 불러온 값 또는 기본값: true
              }))
          : [{ dueDate: '', ratio: undefined, amount: undefined, method: '', exchangeRate: undefined, result: '', notes: '', useRatio: true }], // 최소 1개
        containers: existingOrder.containers?.map((c) => ({
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
      });
      
      // 송장 파일 설정
      if (existingInvoiceFileMetadata) {
        setInvoiceFile(existingInvoiceFileMetadata);
      } else {
        setInvoiceFile(null);
      }

      // 면장 파일 설정
      if (existingCertificateFileMetadata) {
        setCertificateFile(existingCertificateFileMetadata);
      } else {
        setCertificateFile(null);
      }

      if (existingCertificateFileMetadata2) {
        setCertificateFile2(existingCertificateFileMetadata2);
      } else {
        setCertificateFile2(null);
      }

      // DO 파일 설정
      if (existingDoFileMetadata) {
        setDoFile(existingDoFileMetadata);
      } else {
        setDoFile(null);
      }
    } else if (!open) {
      setInvoiceFile(null);
      setCertificateFile(null);
      setCertificateFile2(null);
      setDoFile(null);
      reset({
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
        quota: '',
        invoiceDate: '',
        invoiceAmount: undefined,
        invoiceWeight: undefined,
        certificateNumber: '',
        hasOriginalShipment: null,
        originalShipment: null,
        customsDate: '',
        customsCertificateGoogleDriveFileId: null,
        customsCertificateFileName: null,
        customsCertificateGoogleDriveFileId2: null,
        customsCertificateFileName2: null,
        doGoogleDriveFileId: null,
        doFileName: null,
        payments: [{ dueDate: '', ratio: undefined, amount: undefined, method: '', exchangeRate: undefined, result: '', notes: '', useRatio: true }],
        containers: [],
      });
    }
  }, [
    open,
    reset,
    orderId,
    existingOrder?.id,
    existingInvoiceFileMetadata,
    existingCertificateFileMetadata,
    existingCertificateFileMetadata2,
    existingDoFileMetadata,
  ]);

  // 분석 결과를 폼에 적용하는 핸들러
  const handleApplyAnalysisResult = React.useCallback((result: {
    invoiceFile: GoogleDriveFile | null;
    analysisResult: any | null;
  }) => {
    const { invoiceFile: analyzedFile, analysisResult } = result;

    // 송장 파일 삭제 반영: 드로어에서 파일을 지우고 적용한 경우
    if (analyzedFile === null && analysisResult === null) {
      setInvoiceFile(null);
      return;
    }

    if (!analysisResult || !existingOrder) return;

    // 송장 파일 설정
    if (analyzedFile) {
      setInvoiceFile(analyzedFile);
    }

    // 분석 결과에서 송장 정보를 폼에 반영
    if (analysisResult.invoice) {
      if (analysisResult.invoice.invoiceAmount != null) {
        setValue('invoiceAmount', analysisResult.invoice.invoiceAmount);
      }
      if (analysisResult.invoice.invoiceWeight != null) {
        setValue('invoiceWeight', analysisResult.invoice.invoiceWeight);
      }
    }
    
    // 분석 결과에서 컨테이너 정보를 폼에 반영
    // 단, 불일치 항목은 사용자가 매핑한 경우에만 적용
    if (analysisResult.containers && analysisResult.containers.length > 0) {
      const currentContainers = watch('containers') || [];
      
      // 매핑 정보 가져오기
      const containerMappings = analysisResult.containerMappings || {};
      
      analysisResult.containers.forEach((analyzedContainer: { containerNo: string | null; weight: number | null; tradeBales?: number | null; salesBales?: number | null; unitPrice?: number | null }, index: number) => {
        if (!analyzedContainer.containerNo?.trim()) return;
        
        // 컨테이너 비교 결과 확인
        const comparison = analysisResult.containerComparisons?.[index];
        const isContainerNoMismatched = comparison && comparison.containerNoMatched === false;
        const isUnitPriceMismatched = comparison && comparison.unitPriceMatched === false;
        
        // 컨테이너 번호 불일치인 경우: 매핑 정보가 있으면 해당 컨테이너에 적용
        if (isContainerNoMismatched) {
          const mappedContainerNo = containerMappings[index];
          if (mappedContainerNo) {
            // 매핑된 컨테이너 찾기
            const mappedIndex = currentContainers.findIndex(
              (c: ContainerFormData) => c.containerNo?.trim().toUpperCase() === mappedContainerNo.trim().toUpperCase()
            );
            
            if (mappedIndex >= 0) {
              // 매핑된 컨테이너에 데이터 적용
              if (analyzedContainer.weight !== null && analyzedContainer.weight !== undefined) {
                setValue(`containers.${mappedIndex}.weight`, analyzedContainer.weight);
              }
              if (analyzedContainer.tradeBales !== null && analyzedContainer.tradeBales !== undefined) {
                setValue(`containers.${mappedIndex}.tradeBales`, analyzedContainer.tradeBales);
                
                // 패킹 자동 계산
                const packingType = watch(`containers.${mappedIndex}.packingType`);
                const exportCountryCode = existingOrder?.exportCountryCode;
                const calculatedPacking = calculatePacking(
                  analyzedContainer.tradeBales,
                  packingType,
                  exportCountryCode
                );
              }
              if (analyzedContainer.unitPrice !== null && analyzedContainer.unitPrice !== undefined) {
                setValue(`containers.${mappedIndex}.unitPrice`, analyzedContainer.unitPrice);
              }
            }
          }
          // 매핑 정보가 없으면 제외
          return;
        }
        
        const analyzedContainerNo = analyzedContainer.containerNo.trim().toUpperCase();
        
        const existingIndex = currentContainers.findIndex(
          (c: ContainerFormData) => c.containerNo?.trim().toUpperCase() === analyzedContainerNo
        );
        
        if (existingIndex >= 0) {
          // 기존 컨테이너가 있으면: 중량과 베일만 업데이트 (다른 필드 유지)
          // 단가 불일치만 있는 경우에도 단가는 업데이트
          if (analyzedContainer.weight !== null && analyzedContainer.weight !== undefined) {
            setValue(`containers.${existingIndex}.weight`, analyzedContainer.weight);
          }
          if (analyzedContainer.tradeBales !== null && analyzedContainer.tradeBales !== undefined) {
            setValue(`containers.${existingIndex}.tradeBales`, analyzedContainer.tradeBales);
            
            // 패킹 자동 계산
            const packingType = watch(`containers.${existingIndex}.packingType`);
            const exportCountryCode = existingOrder?.exportCountryCode;
            const calculatedPacking = calculatePacking(
              analyzedContainer.tradeBales,
              packingType,
              exportCountryCode
            );
            // packing은 계산된 값이므로 저장하지 않음 (packingType만 저장)
          }
          // 단가 불일치만 있는 경우에도 단가 업데이트
          if (analyzedContainer.unitPrice !== null && analyzedContainer.unitPrice !== undefined) {
            setValue(`containers.${existingIndex}.unitPrice`, analyzedContainer.unitPrice);
          }
        } else {
          // 새 컨테이너 번호면: 매핑 정보 확인
          const comparison = analysisResult.containerComparisons?.[index];
          const isNewContainer = comparison && comparison.containerNoMatched === null && comparison.existingContainerNo === null;
          
          if (isNewContainer) {
            // 매핑 정보가 있으면 매핑된 컨테이너에 적용
            const mappedContainerNo = containerMappings[index];
            if (mappedContainerNo) {
              const mappedIndex = currentContainers.findIndex(
                (c: ContainerFormData) => c.containerNo?.trim().toUpperCase() === mappedContainerNo.trim().toUpperCase()
              );
              
              if (mappedIndex >= 0) {
                // 매핑된 컨테이너에 데이터 적용
                if (analyzedContainer.weight !== null && analyzedContainer.weight !== undefined) {
                  setValue(`containers.${mappedIndex}.weight`, analyzedContainer.weight);
                }
                if (analyzedContainer.tradeBales !== null && analyzedContainer.tradeBales !== undefined) {
                  setValue(`containers.${mappedIndex}.tradeBales`, analyzedContainer.tradeBales);
                  
                  const packingType = watch(`containers.${mappedIndex}.packingType`);
                  const exportCountryCode = existingOrder?.exportCountryCode;
                  const calculatedPacking = calculatePacking(
                    analyzedContainer.tradeBales,
                    packingType,
                    exportCountryCode
                  );
                }
                if (analyzedContainer.unitPrice !== null && analyzedContainer.unitPrice !== undefined) {
                  setValue(`containers.${mappedIndex}.unitPrice`, analyzedContainer.unitPrice);
                }
                return; // 매핑된 경우 새로 추가하지 않음
              }
            }
            
            // 매핑 정보가 없으면 새로 추가 - 선적 조회와 동일한 기본값 로직 사용
            const firstExistingContainer = existingOrder?.containers?.[0];
            
            // 패킹 이름을 코드로 변환하는 헬퍼 함수
            const getPackingTypeCode = (packingNameOrCode: string | null | undefined): string => {
              if (!packingNameOrCode) return '';
              // packingCodes에서 이름으로 찾기
              const foundByName = packingCodes?.find((code) => code.name === packingNameOrCode);
              if (foundByName?.value) return foundByName.value;
              // packingCodes에서 코드로 찾기 (이미 코드인 경우)
              const foundByValue = packingCodes?.find((code) => code.value === packingNameOrCode);
              if (foundByValue?.value) return foundByValue.value;
              // 못 찾으면 그대로 반환
              return packingNameOrCode;
            };
            
            // 제품과 패킹은 코드 값을 사용해야 함 (Select는 code.value를 사용)
            // 우선순위: 기존 컨테이너 > 계약 정보 > 주문 레벨
            const defaultProduct = firstExistingContainer?.product 
              || contractData?.productName 
              || existingOrder?.productCode 
              || '';
            const defaultTradeGrade = firstExistingContainer?.tradeGrade 
              || contractData?.grade 
              || existingOrder?.grade 
              || '';
            // 패킹은 이름일 수 있으므로 코드로 변환 필요
            // 우선순위: 기존 컨테이너 > 계약 정보 > 주문 레벨
            const packingTypeFromContainer = firstExistingContainer?.packingType || '';
            // 계약 정보에서 패킹 타입 가져오기 (packingName 우선, 없으면 packingType)
            const packingTypeFromContract = contractData?.packingName || contractData?.packingType || '';
            // 백엔드에서 packing 필드로도 반환하므로 확인 (packingCode > packingType > packing 순서)
            const packingTypeFromOrder = existingOrder?.packingCode 
              || existingOrder?.packingType 
              || (existingOrder as any)?.packing 
              || '';
            const defaultPackingType = getPackingTypeCode(packingTypeFromContainer || packingTypeFromContract || packingTypeFromOrder);
            const defaultCurrency = firstExistingContainer?.currency 
              || contractData?.currency 
              || existingOrder?.currencyCode 
              || '';
            const defaultUnitPrice = firstExistingContainer?.unitPrice
              ? Number(firstExistingContainer.unitPrice)
              : contractData?.unitPrice
                ? Number(contractData.unitPrice)
                : existingOrder?.unitPrice
                  ? Number(existingOrder.unitPrice)
                  : undefined;
            
            const exportCountryCode = existingOrder?.exportCountryCode;
            const calculatedPacking = calculatePacking(
              analyzedContainer.tradeBales ?? undefined,
              defaultPackingType,
              exportCountryCode
            );
            
            appendContainer({
              containerNo: analyzedContainer.containerNo.trim(),
              product: defaultProduct,
              tradeGrade: defaultTradeGrade,
              packingType: defaultPackingType,
              currency: defaultCurrency,
              unitPrice: analyzedContainer.unitPrice ?? defaultUnitPrice,
              weight: analyzedContainer.weight || undefined,
              tradeBales: analyzedContainer.tradeBales ?? undefined,
              salesBales: analyzedContainer.salesBales ?? undefined,
              // packing은 계산된 값이므로 저장하지 않음 (packingType만 저장)
            } as ContainerFormData);
          }
        }
      });
    }
  }, [existingOrder, setValue, watch, appendContainer, packingCodes, contractData]);

  const onFormSubmit = async (data: CustomsProcessingFormData) => {
    if (!orderId || !existingOrder) return;

    if (data.containers && data.containers.length > 0) {
      const emptyIndex = data.containers.findIndex((c) => !(c.containerNo != null && String(c.containerNo).trim() !== ''));
      if (emptyIndex !== -1) {
        toastApiError(
          { response: { data: { message: `컨테이너 ${emptyIndex + 1}번에 컨테이너 번호를 입력해주세요.` } } },
          '컨테이너 번호 필요',
        );
        return;
      }
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
          '컨테이너 번호 중복',
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const updateDto: any = {
        bk: data.bk?.trim() || null,
        bl: data.bl?.trim() || null,
        shippingLine: data.shippingLine?.trim() || null,
        etd: data.etd?.trim() || null,
        etdApi: data.etdApi?.trim() || null,
        eta: data.eta?.trim() || null,
        packingType: data.packingType?.trim() || null,
        destination: data.destination?.trim() || null,
        notes: data.notes?.trim() || null,
        spot: data.spot || null,
        quota: (data.quota === 'Y' || data.quota === 'N') ? data.quota : null,
        invoiceDate: data.invoiceDate?.trim() || null,
        invoiceAmount: data.invoiceAmount || null,
        invoiceWeight: data.invoiceWeight || null,
        certificateNumber: data.certificateNumber?.trim() || null,
        hasOriginalShipment: data.hasOriginalShipment || null,
        originalShipment: data.originalShipment?.trim() || null,
        quarantineDate: data.quarantineDate?.trim() || null,
        customsDate: data.customsDate?.trim() || null,
        customsCertificateGoogleDriveFileId: certificateFile?.id || null,
        customsCertificateFileName: certificateFile?.name || null,
        customsCertificateGoogleDriveFileId2: certificateFile2?.id || null,
        customsCertificateFileName2: certificateFile2?.name || null,
        doGoogleDriveFileId: doFile?.id || null,
        doFileName: doFile?.name || null,
        customsScheduledDate: data.customsScheduledDate?.trim() || null,
        invoiceGoogleDriveFileId: invoiceFile?.id || null,
        invoiceFileName: invoiceFile?.name || null,
        payments: (() => {
          const allPayments: any[] = [];
          
          // 일반 결제 항목 (paymentType: 'REGULAR' 또는 없음)
          if (data.payments && data.payments.length > 0) {
            const validPayments = data.payments
              .map((payment, index) => ({
                sequence: index + 1,
                dueDate: payment.dueDate?.trim() || null,
                ratio: payment.ratio || null,
                amount: payment.amount || null,
                method: payment.method?.trim() || null,
                exchangeRate: payment.exchangeRate || null,
                result: payment.result?.trim() || null,
                notes: payment.notes?.trim() || null,
                useRatio: payment.useRatio !== undefined && payment.useRatio !== null 
                  ? payment.useRatio 
                  : true, // DB 저장용 (false도 명시적으로 처리)
                paymentType: 'REGULAR' as const,
              }))
              .filter((payment) => 
                payment.dueDate || 
                payment.ratio !== null && payment.ratio !== undefined ||
                payment.amount !== null && payment.amount !== undefined ||
                payment.method ||
                payment.exchangeRate !== null && payment.exchangeRate !== undefined ||
                payment.result
              );
            
            if (validPayments.length > 0) {
              allPayments.push(...validPayments);
            }
          }
          
          return allPayments.length > 0 ? allPayments : null;
        })(),
        containers: (() => {
          if (!data.containers || data.containers.length === 0) {
            return [];
          }
          return data.containers
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
            }));
        })(),
      };

      await updateMutation.mutateAsync({
        id: orderId,
        data: updateDto,
      });

      toastSuccess('수정 완료', '통관 처리 정보가 수정되었습니다.');
      
      // 데이터 갱신
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-order', orderId] });
      
      onOpenChange(false);
      if (onSubmit) {
        onSubmit();
      }
    } catch (error: any) {
      console.error('통관 처리 수정 오류:', error);
      toastApiError(error, '수정 실패');
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

  if (isLoadingOrder) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[96vh]">
          <DrawerHeader>
            <DrawerTitle>통관 처리 수정</DrawerTitle>
            <DrawerDescription>데이터를 불러오는 중...</DrawerDescription>
          </DrawerHeader>
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
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
          <DrawerHeader>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DrawerTitle>통관 처리 수정</DrawerTitle>
                <DrawerDescription>통관 처리 정보를 수정합니다.</DrawerDescription>
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

          <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div 
              className="flex-1 overflow-y-auto p-4 space-y-0"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              onDoubleClick={handleDoubleClick}
            >
              {/* 계약 정보 - 읽기 전용 */}
              {existingOrder && (
                <div className="pt-6 pb-6 border-t border-border">
                  <ContractInfoSection data={existingOrder} />
                </div>
              )}

              {/* 부킹 정보 - 서류/DO 처리와 동일 배치: 1행 순번/BK/BL/선사/도착항, 2행 ETD/ETA/현물/쿼터 */}
              <div className="space-y-3 pt-6 pb-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">부킹 정보</h3>
                <div className="grid grid-cols-6 gap-4 pt-3">
                  <div className="space-y-2 col-span-1">
                    <Label className="text-muted-foreground">순번</Label>
                    <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 py-1 text-sm">
                      {formatOrderSequence(existingOrder?.sequence, existingOrder?.sequenceSub)}
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
                          <SelectItem key={code.value || ''} value={code.value || ''}>
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
                    <Label htmlFor="quota">주문별 쿼터 유무</Label>
                    <Switch
                      id="quota"
                      checked={watch('quota') === 'Y'}
                      onCheckedChange={(checked) => setValue('quota', checked ? 'Y' : 'N', { shouldDirty: true })}
                    />
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
                    onClick={() => appendContainer({})}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    컨테이너 추가
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  파란색 배경은 선적 조회로 추가된 컨테이너입니다.
                </p>
                <div className="space-y-4">
                  {containerFields.map((field, index) => (
                    <div
                      key={field.id}
                      className={`grid grid-cols-[minmax(0,10rem)_minmax(0,10rem)_minmax(0,10rem)_minmax(0,8rem)_5rem_5rem_5rem_7.5rem] gap-4 p-4 border rounded-lg ${
                        watch(`containers.${index}._fromTracking`) ? 'bg-blue-100/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800' : ''
                      }`}
                    >
                      <div className="space-y-2 min-w-0 max-w-[10rem]">
                        <Label>컨테이너 번호</Label>
                        <Input {...register(`containers.${index}.containerNo`)} />
                      </div>
                      <div className="space-y-2 min-w-0 max-w-[10rem]">
                        <Label>제품</Label>
                        <Select
                          value={watch(`containers.${index}.product`) || ''}
                          onValueChange={(value) => setValue(`containers.${index}.product`, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="제품 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {productCodes?.map((code) => (
                              <SelectItem key={code.value || ''} value={code.value || ''}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 min-w-0 max-w-[10rem]">
                        <Label>등급(무역)</Label>
                        <Input
                          {...register(`containers.${index}.tradeGrade`)}
                          placeholder="등급 입력"
                        />
                      </div>
                      <div className="space-y-2 min-w-0 max-w-[8rem]">
                        <Label>패킹 타입</Label>
                        <Select
                          value={watch(`containers.${index}.packingType`) || ''}
                          onValueChange={(value) => setValue(`containers.${index}.packingType`, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="패킹 타입 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {packingCodes?.map((code) => (
                              <SelectItem key={code.value || ''} value={code.value || ''}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 min-w-0 max-w-[5rem]">
                        <Label>통화단위</Label>
                        <Select
                          value={watch(`containers.${index}.currency`) || ''}
                          onValueChange={(value) => setValue(`containers.${index}.currency`, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="통화 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {currencyCodes?.map((code) => (
                              <SelectItem key={code.value || ''} value={code.value || ''}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 min-w-0 max-w-[5rem]">
                        <Label>단가</Label>
                        <NumberInput
                          value={watch(`containers.${index}.unitPrice`)}
                          onChange={(value) => setValue(`containers.${index}.unitPrice`, value ?? undefined)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2 min-w-0 max-w-[5rem]">
                        <Label>베일(무역)</Label>
                        <NumberInput
                          value={watch(`containers.${index}.tradeBales`)}
                          onChange={(value) => setValue(`containers.${index}.tradeBales`, value ?? undefined)}
                          placeholder="0"
                          step={0.0001}
                          decimals={4}
                        />
                      </div>
                      <div className="space-y-2 min-w-0 max-w-[5rem]">
                        <Label>베일(영업)</Label>
                        <NumberInput
                          value={watch(`containers.${index}.salesBales`)}
                          onChange={(value) => setValue(`containers.${index}.salesBales`, value ?? undefined)}
                          placeholder="선택"
                          step={0.0001}
                          decimals={4}
                        />
                      </div>
                      <div className="space-y-2 min-w-0 max-w-[7.5rem]">
                        <Label>중량</Label>
                        <div className="flex items-center gap-2">
                          <NumberInput
                            value={watch(`containers.${index}.weight`)}
                            onChange={(value) => setValue(`containers.${index}.weight`, value ?? undefined)}
                            placeholder="0.000"
                            step={0.001}
                            decimals={3}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeContainer(index)}
                            className="h-9 w-9"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {containerFields.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      컨테이너가 없습니다. "컨테이너 추가" 버튼을 클릭하여 추가하세요.
                    </p>
                  )}
                </div>
              </div>

              {/* 송장 정보 */}
              <div className="space-y-3 pt-6 pb-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">송장 정보</h3>
                <div className="grid grid-cols-6 gap-4 pt-3">
                  <div className="space-y-2">
                    <Label htmlFor="invoiceDate">송장 입력 날짜</Label>
                    <DatePicker
                      value={watch('invoiceDate') || undefined}
                      onChange={(value) => setValue('invoiceDate', value || '', { shouldValidate: true })}
                      placeholder="날짜 선택"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceAmount">송장 금액</Label>
                    <NumberInput
                      id="invoiceAmount"
                      value={watch('invoiceAmount')}
                      onChange={(value) => setValue('invoiceAmount', value ?? undefined)}
                      placeholder="0.000"
                      decimals={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceWeight">송장 중량</Label>
                    <NumberInput
                      id="invoiceWeight"
                      value={watch('invoiceWeight')}
                      onChange={(value) => setValue('invoiceWeight', value ?? undefined)}
                      placeholder="0.000"
                      step={0.001}
                      decimals={3}
                    />
                  </div>
                  <div className="space-y-2 col-span-3">
                    <Label>송장 파일</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 text-sm text-muted-foreground border rounded-md bg-muted/50">
                        {invoiceFile ? invoiceFile.name : '파일이 선택되지 않았습니다'}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setInvoiceAnalysisDrawerOpen(true)}
                        disabled={isSubmitting}
                        size="sm"
                      >
                        <Search className="mr-2 h-4 w-4" />
                        파일 선택 및 분석
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-4 pt-3">
                  <div className="space-y-2">
                    <Label htmlFor="certificateNumber">필증번호</Label>
                    <Input
                      id="certificateNumber"
                      {...register('certificateNumber')}
                      placeholder="필증번호 입력"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>원본발송</Label>
                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox
                        id="originalShipmentCheck"
                        checked={watch('hasOriginalShipment') === 'Y'}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setValue('hasOriginalShipment', 'Y', { shouldDirty: true });
                            setValue('originalShipment', null, { shouldDirty: true });
                          } else {
                            setValue('hasOriginalShipment', 'N', { shouldDirty: true });
                            setValue('originalShipment', null, { shouldDirty: true });
                          }
                        }}
                      />
                      <Label htmlFor="originalShipmentCheck" className="cursor-pointer text-sm font-normal">
                        원본발송
                      </Label>
                    </div>
                  </div>
                  {watch('hasOriginalShipment') === 'Y' && (
                    <div className="space-y-2">
                      <Label htmlFor="originalShipmentDate">원본발송일</Label>
                      <Input
                        id="originalShipmentDate"
                        {...register('originalShipment')}
                        placeholder="원본발송일 입력"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="customsScheduledDate">통관예정일</Label>
                    <DatePicker
                      value={watch('customsScheduledDate') || undefined}
                      onChange={(value) => setValue('customsScheduledDate', value || '', { shouldValidate: true })}
                      placeholder="통관예정일 선택"
                    />
                  </div>
                </div>
              </div>

              {/* DO 정보 */}
              <div className="space-y-3 pt-6 pb-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">DO 정보</h3>
                <div className="grid grid-cols-6 gap-4 pt-3">
                  <div className="space-y-2 col-span-3">
                    <Label>DO 파일 (Google Drive)</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDoFilePickerOpen(true)}
                        disabled={isSubmitting}
                        className="flex-1 min-w-0"
                      >
                        <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{doFile ? doFile.name : '파일 선택'}</span>
                      </Button>
                      {doFile && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setDoFilePreviewOpen(true)}
                            disabled={isSubmitting}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              setDoFile(null);
                              setValue('doGoogleDriveFileId', null);
                              setValue('doFileName', null);
                            }}
                            disabled={isSubmitting}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    {doFile && (
                      <p className="text-xs text-muted-foreground truncate" title={doFile.name}>
                        선택된 파일: {doFile.name}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label htmlFor="quarantineDate">검역일</Label>
                    <DatePicker
                      value={watch('quarantineDate') || undefined}
                      onChange={(value) => setValue('quarantineDate', value || '', { shouldValidate: true })}
                      placeholder="검역일 선택"
                    />
                  </div>
                </div>
              </div>

              {/* 통관 정보 */}
              <div className="space-y-3 pt-6 pb-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">통관 정보</h3>
                <div className="grid grid-cols-6 gap-4 pt-3">
                  <div className="space-y-4 col-span-3">
                    <div className="space-y-2">
                      <Label>면장 파일 (Google Drive)</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCertificateFilePickerOpen(true)}
                          disabled={isSubmitting}
                          className="flex-1 min-w-0"
                        >
                          <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{certificateFile ? certificateFile.name : '파일 선택'}</span>
                        </Button>
                        {certificateFile && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setCertificateFilePreviewOpen(true)}
                              disabled={isSubmitting}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                setCertificateFile(null);
                                setValue('customsCertificateGoogleDriveFileId', null);
                                setValue('customsCertificateFileName', null);
                              }}
                              disabled={isSubmitting}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      {certificateFile && (
                        <p className="text-xs text-muted-foreground truncate" title={certificateFile.name}>
                          선택된 파일: {certificateFile.name}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>면장 파일 추가 (Google Drive)</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCertificateFilePicker2Open(true)}
                          disabled={isSubmitting}
                          className="flex-1 min-w-0"
                        >
                          <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{certificateFile2 ? certificateFile2.name : '파일 선택'}</span>
                        </Button>
                        {certificateFile2 && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setCertificateFilePreview2Open(true)}
                              disabled={isSubmitting}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                setCertificateFile2(null);
                                setValue('customsCertificateGoogleDriveFileId2', null);
                                setValue('customsCertificateFileName2', null);
                              }}
                              disabled={isSubmitting}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      {certificateFile2 && (
                        <p className="text-xs text-muted-foreground truncate" title={certificateFile2.name}>
                          선택된 파일: {certificateFile2.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label htmlFor="customsDate">통관일</Label>
                    <DatePicker
                      value={watch('customsDate') || undefined}
                      onChange={(value) => setValue('customsDate', value || '', { shouldValidate: true })}
                      placeholder="통관일 선택"
                    />
                  </div>
                </div>
              </div>

              {/* 결제 정보 */}
              <div className="space-y-3 pt-6 pb-6 border-t border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">결제 정보</h3>
                  {paymentFields.length < 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        appendPayment({
                          dueDate: '',
                          ratio: undefined,
                          amount: undefined,
                          method: '',
                          exchangeRate: undefined,
                          result: '',
                          notes: '',
                          useRatio: true,
                        });
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      결제 추가
                    </Button>
                  )}
                </div>
                <div className="space-y-4">
                  {paymentFields.map((field, index) => (
                    <div key={field.id} className="rounded-md border border-border bg-muted/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-foreground">
                          {index + 1}차 결제
                        </div>
                        {paymentFields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removePayment(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-7 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={`payments.${index}.dueDate`}>결제 예정일</Label>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 p-0"
                                >
                                  <Calculator className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleCalculatePaymentDate(index, 'etd+3')}
                                >
                                  ETD+3일 (영업일+1)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleCalculatePaymentDate(index, 'etd+88')}
                                >
                                  ETD+88일 (영업일+1)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleCalculatePaymentDate(index, 'eta-5')}
                                >
                                  ETA-5일 (영업일+1)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <DatePicker
                            value={watch(`payments.${index}.dueDate`)}
                            onChange={(date) => setValue(`payments.${index}.dueDate`, date || '')}
                            placeholder="날짜 선택"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`payments.${index}.ratio`}>비율 (%)</Label>
                          <div className="flex items-center relative">
                            <NumberInput
                              id={`payments.${index}.ratio`}
                              value={watch(`payments.${index}.ratio`)}
                              onChange={(value) => {
                                setValue(`payments.${index}.ratio`, value ?? undefined);
                                // 비율 변경 시 금액 자동 계산 (체크박스가 체크되어 있을 때만)
                                const useRatio = watch(`payments.${index}.useRatio`) ?? true;
                                if (useRatio && invoiceAmount && value !== undefined && value !== null) {
                                  const calculatedAmount = (invoiceAmount * value) / 100;
                                  setValue(`payments.${index}.amount`, Number(calculatedAmount.toFixed(2)));
                                }
                              }}
                              placeholder="0.00"
                              step={0.01}
                              className="flex-1 pr-8"
                              disabled={!(watch(`payments.${index}.useRatio`) ?? true)}
                            />
                            <div 
                              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const currentValue = watch(`payments.${index}.useRatio`) ?? true;
                                setValue(`payments.${index}.useRatio`, !currentValue, { shouldDirty: true });
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <Checkbox
                                id={`payments.${index}.useRatio`}
                                checked={watch(`payments.${index}.useRatio`) ?? true}
                                onCheckedChange={(checked) => {
                                  setValue(`payments.${index}.useRatio`, checked === true, { shouldDirty: true });
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`payments.${index}.method`}>결제조건</Label>
                          <Select
                            value={watch(`payments.${index}.method`) || ''}
                            onValueChange={(value) => setValue(`payments.${index}.method`, value || '')}
                          >
                            <SelectTrigger id={`payments.${index}.method`}>
                              <SelectValue placeholder="결제조건 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentMethodOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`payments.${index}.amount`}>금액</Label>
                          <NumberInput
                            id={`payments.${index}.amount`}
                            value={watch(`payments.${index}.amount`)}
                            onChange={(value) => {
                              setValue(`payments.${index}.amount`, value ?? undefined);
                            }}
                            placeholder="0.00"
                            decimals={2}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`payments.${index}.exchangeRate`}>환율</Label>
                          <NumberInput
                            id={`payments.${index}.exchangeRate`}
                            value={watch(`payments.${index}.exchangeRate`)}
                            onChange={(value) => setValue(`payments.${index}.exchangeRate`, value ?? undefined)}
                            placeholder="0.000000"
                            decimals={6}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>결제 금액 (원화)</Label>
                          <div className="h-10 flex items-center px-3 py-2 text-sm border border-input bg-muted text-muted-foreground rounded-md cursor-default pointer-events-none">
                            {(() => {
                              const amount = watch(`payments.${index}.amount`);
                              const exchangeRate = watch(`payments.${index}.exchangeRate`);
                              if (amount && exchangeRate) {
                                const krwAmount = Number(amount) * Number(exchangeRate);
                                return `${krwAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`;
                              }
                              return '-';
                            })()}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`payments.${index}.result`}>결제 결과</Label>
                          <Select
                            value={
                              (() => {
                                const resultValue = watch(`payments.${index}.result`);
                                if (!resultValue || resultValue === '') {
                                  return 'NONE';
                                }
                                return resultValue;
                              })()
                            }
                            onValueChange={(value) => {
                              if (value === 'NONE') {
                                setValue(`payments.${index}.result`, '');
                              } else {
                                setValue(`payments.${index}.result`, value);
                              }
                            }}
                          >
                            <SelectTrigger id={`payments.${index}.result`}>
                              <SelectValue placeholder="결제 결과 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">선택 안함</SelectItem>
                              {paymentResultCodes
                                ?.sort((a, b) => (a.order || 0) - (b.order || 0))
                                .map((code) => (
                                  <SelectItem key={code.value || code.id} value={code.value || ''}>
                                    {code.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* 비고 */}
                      <div className="space-y-2">
                        <Label htmlFor={`payments.${index}.notes`}>비고</Label>
                        <Input
                          id={`payments.${index}.notes`}
                          {...register(`payments.${index}.notes`)}
                          placeholder="비고를 입력하세요"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 비고 */}
              <div className="space-y-3 pt-6 pb-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">비고</h3>
                <div className="space-y-2 pt-3">
                  <Label htmlFor="notes">비고</Label>
                  <Textarea
                    id="notes"
                    {...register('notes')}
                    rows={3}
                    placeholder="비고를 입력하세요"
                  />
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t border-border">
              <div className="flex justify-between gap-2">
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (onCancel) {
                        onCancel();
                      } else {
                        onOpenChange(false);
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    저장
                  </Button>
                </div>
              </div>
            </DrawerFooter>
          </form>

          {/* 송장 파일 분석 Drawer */}
          <InvoiceAnalysisDrawer
            open={invoiceAnalysisDrawerOpen}
            onOpenChange={setInvoiceAnalysisDrawerOpen}
            orderId={orderId ?? null}
            existingInvoiceFileId={existingOrder?.invoiceGoogleDriveFileId || null}
            onApply={handleApplyAnalysisResult}
          />

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
                        : trackingIdentifierType === 'BK'
                          ? watch('bk')
                            ? `Booking (${watch('bk')})`
                            : '-'
                          : watch('bl')
                            ? `B/L (${watch('bl')})`
                            : '-'}
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {!trackingResult && !trackingLoading && (
                    <div className="text-xs text-muted-foreground mb-4">
                      {trackingIdentifierType === 'BK' ? 'BK' : 'BL'} 번호를 입력한 뒤 <strong>선적 조회</strong> 버튼을 누르면 SeaRates API를 통해 선적 정보를 조회합니다.
                    </div>
                  )}
                  {/* 선적 조회 버튼 */}
                  {(trackingIdentifierType === 'BK' ? watch('bk')?.trim() : watch('bl')?.trim()) && (
                    <div className="flex justify-end mb-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const identifier = trackingIdentifierType === 'BK' ? watch('bk')?.trim() : watch('bl')?.trim();
                          if (identifier) {
                            void fetchTracking(identifier, trackingIdentifierType);
                          }
                        }}
                        disabled={trackingLoading || !(trackingIdentifierType === 'BK' ? watch('bk')?.trim() : watch('bl')?.trim())}
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
        </DrawerContent>
      </Drawer>

      {/* Google Drive 면장 파일 선택 */}
      <GoogleDriveFilePicker
        open={certificateFilePickerOpen}
        onOpenChange={setCertificateFilePickerOpen}
        onSelect={(file) => {
          setCertificateFile(file);
          setValue('customsCertificateGoogleDriveFileId', file.id || null);
          setValue('customsCertificateFileName', file.name || null);
        }}
        acceptMimeTypes={[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.google-apps.document',
          'application/vnd.google-apps.spreadsheet',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/*'
        ]}
        title="면장 파일 선택"
        description="구글 드라이브에서 면장 파일을 선택하세요"
      />

      {/* Google Drive 면장 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={certificateFilePreviewOpen}
        onOpenChange={setCertificateFilePreviewOpen}
        file={certificateFile}
      />

      <GoogleDriveFilePicker
        open={certificateFilePicker2Open}
        onOpenChange={setCertificateFilePicker2Open}
        onSelect={(file) => {
          setCertificateFile2(file);
          setValue('customsCertificateGoogleDriveFileId2', file.id || null);
          setValue('customsCertificateFileName2', file.name || null);
        }}
        acceptMimeTypes={[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.google-apps.document',
          'application/vnd.google-apps.spreadsheet',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/*',
        ]}
        title="면장 파일 추가 선택"
        description="구글 드라이브에서 분할통관 등 추가 면장 파일을 선택하세요"
      />

      <GoogleDriveFilePreview
        open={certificateFilePreview2Open}
        onOpenChange={setCertificateFilePreview2Open}
        file={certificateFile2}
      />

      {/* Google Drive DO 파일 선택 */}
      <GoogleDriveFilePicker
        open={doFilePickerOpen}
        onOpenChange={setDoFilePickerOpen}
        onSelect={(file) => {
          setDoFile(file);
          setValue('doGoogleDriveFileId', file.id || null);
          setValue('doFileName', file.name || null);
        }}
        acceptMimeTypes={[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.google-apps.document',
          'application/vnd.google-apps.spreadsheet',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/*'
        ]}
        title="DO 파일 선택"
        description="구글 드라이브에서 DO 파일을 선택하세요"
      />

      {/* Google Drive DO 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={doFilePreviewOpen}
        onOpenChange={setDoFilePreviewOpen}
        file={doFile}
      />

    </>
  );
}

