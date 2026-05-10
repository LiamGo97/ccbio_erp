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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Schedule } from '@/app/schedules/page';
import { Loader2, X, FileText, Eye, Folder, XCircle, Save } from 'lucide-react';
import { parse, format, addDays, isValid } from 'date-fns';
import { DatePicker } from '@/components/schedules/date-picker';
import { cn, formatNumberWithDecimals, parseNumber, formatNumber } from '@/lib/utils';
import { NumberInput } from '@/components/ui/number-input';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCalculateFreeTime } from '@/lib/hooks/use-free-time';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';
import { toast } from '@/components/ui/use-toast';

interface ScheduleFormData {
  newOld?: string;
  shippingLine?: string;
  commissionMonth?: string;
  commissionDollar?: string;
  orderDate?: string;
  exporter?: string;
  contractNo?: string;
  quota?: string; // 쿼터 유무
  fumigation?: string; // 훈증 유무
  spot?: string; // 현물 유무
  customsDuty?: string; // 관세 유무
  shipmentSeq?: number; // 선적 순번
  exportCountry?: string;
  product?: string;
  bk?: string;
  bl?: string;
  qty?: number;
  grade?: string;
  packingType?: string;
  currencyUnit?: string;
  unitPrice?: number;
  destination?: string;
  etd?: string;
  eta?: string;
  notes?: string;
  certificateRequest?: string;
  totalAmount?: number;
  originalShipment?: string;
  quarantineDate?: string;
  customsDate?: string;
  paymentDetail1Date?: string;
  paymentDetail1Ratio?: number;
  paymentDetail1Amount?: number;
  paymentDetail1Method?: string;
  paymentDetail1ExchangeRate?: number;
  paymentDetail1Result?: string;
  paymentDetail2Date?: string;
  paymentDetail2Ratio?: number;
  paymentDetail2Amount?: number;
  paymentDetail2Method?: string;
  paymentDetail2ExchangeRate?: number;
  paymentDetail2Result?: string;
  invoiceAmount?: number;
  claim?: string;
  bankPickup?: string;
  sto?: string;
  dm?: string;
  dt?: string;
  cb?: string;
  finalDestination?: string;
  finalDestinationArrivalDate?: string;
}

interface ScheduleFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
  mode: 'create' | 'edit';
  schedules?: Schedule[]; // 전체 스케줄 목록 (고유값 추출용)
  currentUserName?: string | null;
  onSubmit?: (
    data: ScheduleFormData & {
      payments?: Array<{
        sequence: number;
        dueDate?: string | null;
        ratio?: number | null;
        amount?: number | null;
        method?: string | null;
        exchangeRate?: number | null;
        result?: string | null;
      }>;
      googleDriveFileId?: string | null; // 계약서 Google Drive 파일 ID
      contractFileName?: string | null; // 계약서 파일명
      invoiceGoogleDriveFileId?: string | null; // 송장 Google Drive 파일 ID
      invoiceFileName?: string | null; // 송장 파일명
      productImagesFolderId?: string | null; // 제품 이미지 폴더 Google Drive ID
      productImagesFolderName?: string | null; // 제품 이미지 폴더명
    },
  ) => Promise<void>;
}

export function ScheduleFormDrawer({
  open,
  onOpenChange,
  schedule,
  mode,
  schedules = [],
  currentUserName,
  onSubmit,
}: ScheduleFormDrawerProps) {
  React.useEffect(() => {
    if (open) {
      // Drawer가 열릴 때 확인
    }
  }, [open]);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { mutateAsync: calculateFreeTime } = useCalculateFreeTime();
  const [contractFile, setContractFile] = React.useState<GoogleDriveFile | null>(null);
  const [contractFilePickerOpen, setContractFilePickerOpen] = React.useState(false);
  const [contractFilePreviewOpen, setContractFilePreviewOpen] = React.useState(false);
  
  const [invoiceFile, setInvoiceFile] = React.useState<GoogleDriveFile | null>(null);
  const [invoiceFilePickerOpen, setInvoiceFilePickerOpen] = React.useState(false);
  const [invoiceFilePreviewOpen, setInvoiceFilePreviewOpen] = React.useState(false);
  
  const [productImagesFolder, setProductImagesFolder] = React.useState<GoogleDriveFile | null>(null);
  const [productImagesFolderPickerOpen, setProductImagesFolderPickerOpen] = React.useState(false);
  
  
  // 기존 계약서 파일 메타데이터 조회 (수정 모드일 때만)
  const contractFileId = mode === 'edit' && schedule?.contractGoogleDriveFileId ? schedule.contractGoogleDriveFileId : null;
  const shouldFetchMetadata = open && mode === 'edit' && !!schedule?.contractGoogleDriveFileId;
  
  const { data: existingContractFileMetadata } = useGoogleDriveFileMetadata(
    contractFileId,
    shouldFetchMetadata,
  );

  // 기존 invoice 파일 메타데이터 조회 (수정 모드일 때만)
  const invoiceFileId = mode === 'edit' && schedule?.invoiceGoogleDriveFileId ? schedule.invoiceGoogleDriveFileId : null;
  const shouldFetchInvoiceMetadata = open && mode === 'edit' && !!schedule?.invoiceGoogleDriveFileId;
  
  const { data: existingInvoiceFileMetadata } = useGoogleDriveFileMetadata(
    invoiceFileId,
    shouldFetchInvoiceMetadata,
  );

  // 기존 제품 이미지 폴더 메타데이터 조회 (수정 모드일 때만)
  const productImagesFolderId = mode === 'edit' && schedule?.productImagesFolderId ? schedule.productImagesFolderId : null;
  const shouldFetchProductImagesFolderMetadata = open && mode === 'edit' && !!schedule?.productImagesFolderId;
  
  const { data: existingProductImagesFolderMetadata } = useGoogleDriveFileMetadata(
    productImagesFolderId,
    shouldFetchProductImagesFolderMetadata,
  );

  const lastAutoFreeTimeRef = React.useRef<{ dm: string | null; dt: string | null; cb: string | null }>(
    { dm: null, dt: null, cb: null },
  );
  const lastFreeTimeParamsRef = React.useRef<{
    exporterCode: string;
    shippingLineCode: string;
    eta: string;
  } | null>(null);

  // 코드 관리에서 공통 코드 조회
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');
  const { data: exportCountryCodes } = useCodesByCategory('EXPORT_COUNTRY');
  const { data: exporterCodes } = useCodesByCategory('EXPORTER');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: paymentMethodCodes } = useCodesByCategory('PAYMENT_TERMS');
  const { data: tradeGradeCodes } = useCodesByCategory('TRADE_GRADE');
  const { data: packingTypeCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: currencyCodes } = useCodesByCategory('CURRENCY');
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
 
  const formatDateForInput = React.useCallback((input?: string | null) => {
    if (!input) {
      return '';
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return '';
    }
    const formats = ['yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy', 'MM/dd'];
    for (const fmt of formats) {
      try {
        const parsed =
          fmt === 'MM/dd'
            ? (() => {
                const tentative = parse(trimmed, fmt, new Date());
                if (!isValid(tentative)) {
                  return null;
                }
                return tentative;
              })()
            : parse(trimmed, fmt, new Date());
        if (parsed && isValid(parsed)) {
          return format(parsed, 'yyyy-MM-dd');
        }
      } catch {
        // ignore parsing errors
      }
    }
    const fallback = new Date(trimmed);
    if (isValid(fallback)) {
      return format(fallback, 'yyyy-MM-dd');
    }
    return trimmed;
  }, []);

  const parseDateInput = React.useCallback((input?: string | null) => {
    if (!input) {
      return null;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }
    const formats = ['yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy', 'MM/dd'];
    for (const fmt of formats) {
      try {
        const parsed =
          fmt === 'MM/dd'
            ? (() => {
                const tentative = parse(trimmed, fmt, new Date());
                if (!isValid(tentative)) {
                  return null;
                }
                return tentative;
              })()
            : parse(trimmed, fmt, new Date());
        if (parsed && isValid(parsed)) {
          return parsed;
        }
      } catch {
        // ignore parsing errors
      }
    }
    const fallback = new Date(trimmed);
    return isValid(fallback) ? fallback : null;
  }, []);

  const payment1 = schedule?.payments?.find((payment) => payment.sequence === 1);
  const payment2 = schedule?.payments?.find((payment) => payment.sequence === 2);
  
  // 선사 옵션: 코드 관리 데이터를 우선 사용하고, 없으면 기존 스케줄에서 추출한 값도 포함
  const shippingLineOptions = React.useMemo(() => {
    const map = new Map<string, string>();

    shippingLineCodes?.forEach((code) => {
      const value = code.value?.trim();
      if (!value) {
        return;
      }
      const label = code.name?.trim() || value;
      map.set(value.toUpperCase(), label);
    });

    schedules.forEach((scheduleItem) => {
      const codeValue =
        scheduleItem.shippingLineCode ??
        scheduleItem.shippingLine?.trim() ??
        scheduleItem.shippingLineName ??
        '';
      if (!codeValue) {
        return;
      }
      const normalized = codeValue.trim().toUpperCase();
      if (normalized.length === 0) {
        return;
      }
      if (!map.has(normalized)) {
        const label =
          scheduleItem.shippingLineName?.trim() ??
          scheduleItem.shippingLine?.trim() ??
          normalized;
        map.set(normalized, label);
      }
    });

    return Array.from(map.entries())
      .map(([value, label]) => ({
        value,
        label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [shippingLineCodes, schedules]);

  const productOptions = React.useMemo(() => {
    const map = new Map<string, string>();

    productCodes?.forEach((code) => {
      const value = code.value?.trim();
      if (!value) {
        return;
      }
      const label = code.name?.trim() || value;
      map.set(value.toUpperCase(), label);
    });

    schedules.forEach((s) => {
      const value = (s.productCode ?? s.product)?.trim();
      if (!value) {
        return;
      }
      const normalizedKey = value.toUpperCase();
      if (!map.has(normalizedKey)) {
        const label = s.product?.trim() || value;
        map.set(normalizedKey, label);
      }
    });

    return Array.from(map.entries())
      .map(([value, label]) => ({
        value,
        label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [productCodes, schedules]);

  const uniqueExporters = React.useMemo(() => {
    const codeValues =
      exporterCodes?.map((code) => code.name?.trim() || code.value?.trim() || '').filter(Boolean) ||
      [];
    const scheduleValues = schedules
      .map((s) => s.exporter)
      .filter((v): v is string => !!v && v.trim().length > 0);
    const allValues = [...codeValues, ...scheduleValues];
    return Array.from(new Set(allValues)).sort();
  }, [exporterCodes, schedules]);

  const uniqueExportCountries = React.useMemo(() => {
    // 코드 관리에서 코드(value)와 이름(name) 매핑 생성
    const codeMap = new Map<string, string>();
    exportCountryCodes?.forEach(code => {
      if (code.value) {
        codeMap.set(code.value, code.name || code.value);
      }
    });
    
    // 기존 스케줄에서 사용된 값들도 추가 (코드 또는 이름일 수 있음)
    schedules.forEach(s => {
      if (s.exportCountry) {
        // exportCountry가 코드일 수도 있고 이름일 수도 있음
        // 코드 관리에서 찾아보고, 없으면 그대로 사용
        const foundCode = exportCountryCodes?.find(c => c.value === s.exportCountry || c.name === s.exportCountry);
        if (foundCode && foundCode.value) {
          codeMap.set(foundCode.value, foundCode.name || foundCode.value);
        } else if (s.exportCountry && !codeMap.has(s.exportCountry)) {
          // 코드 관리에 없으면 이름으로 간주
          codeMap.set(s.exportCountry, s.exportCountry);
        }
      }
    });
    
    return Array.from(codeMap.entries()).map(([code, name]) => ({ code, name }));
  }, [exportCountryCodes, schedules]);

  // 담당자 선택 UI 제거로 인해 더 이상 사용하지 않음
  // const uniqueManagers = React.useMemo(() => {
  //   const values = schedules
  //     .map((s) => s.manager?.trim())
  //     .filter((v): v is string => !!v && v.length > 0);
  //   const managerName = currentUserName?.trim();
  //   if (managerName) {
  //     values.push(managerName);
  //   }
  //   return Array.from(new Set(values)).sort();
  // }, [schedules, currentUserName]);

  const baseDestinationOptions = React.useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    destinationCodes?.forEach((code) => {
      const codeValue = code.value?.trim();
      const codeName = code.name?.trim();
      const optionValue = codeValue || codeName;
      if (!optionValue) {
        return;
      }
      const optionLabel = codeName || optionValue;
      map.set(optionValue, { value: optionValue, label: optionLabel });
    });
    return map;
  }, [destinationCodes]);

  const destinationOptions = React.useMemo(() => {
    const map = new Map(baseDestinationOptions);
    schedules.forEach((scheduleItem) => {
      const value = scheduleItem.destination?.trim();
      if (!value || map.has(value)) {
        return;
      }
      map.set(value, { value, label: value });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [baseDestinationOptions, schedules]);

  const finalDestinationOptions = React.useMemo(() => {
    const map = new Map(baseDestinationOptions);
    schedules.forEach((scheduleItem) => {
      const value = scheduleItem.finalDestination?.trim();
      if (!value || map.has(value)) {
        return;
      }
      map.set(value, { value, label: value });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [baseDestinationOptions, schedules]);

  const resolveDestinationCodeValue = React.useCallback(
    (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return trimmed ?? '';
      }
      const normalized = trimmed.toUpperCase();
      const matched = destinationCodes?.find((code) => {
        const codeValue = code.value?.trim();
        const codeName = code.name?.trim();
        return (
          (codeValue && codeValue.toUpperCase() === normalized) ||
          (codeName && codeName.toUpperCase() === normalized) ||
          codeName === trimmed
        );
      });
      return matched?.value?.trim() || trimmed;
    },
    [destinationCodes],
  );

  const currencyUnitOptions = React.useMemo(() => {
    const map = new Map<string, string>();

    currencyCodes?.forEach((code) => {
      const value = code.value?.trim();
      if (!value) {
        return;
      }
      const label = code.name?.trim() || value;
      map.set(value.toUpperCase(), label);
    });

    schedules.forEach((s) => {
      const value = s.currencyUnit?.trim();
      if (!value) {
        return;
      }
      const normalized = value.toUpperCase();
      if (!map.has(normalized)) {
        map.set(normalized, value);
      }
    });

    return Array.from(map.entries())
      .map(([value, label]) => ({
        value,
        label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [currencyCodes, schedules]);

  const tradeGradeOptions = React.useMemo(() => {
    return (tradeGradeCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tradeGradeCodes]);

  const packingOptions = React.useMemo(() => {
    return (packingTypeCodes ?? [])
      .map((c) => ({ value: c.value ?? c.name ?? '', label: c.name ?? c.value ?? '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [packingTypeCodes]);

  const paymentMethodOptions = React.useMemo(() => {
    const codeValues =
      paymentMethodCodes
        ?.map((code) => {
          const value = code.value?.trim();
          const name = code.name?.trim();
          if (!value) {
            return null;
          }
          return {
            value,
            label: name || value,
          };
        })
        .filter((item): item is { value: string; label: string } => !!item) ?? [];

    const scheduleValues =
      schedules.flatMap((s) =>
        (s.payments ?? [])
          .map((payment) => payment.method?.trim())
          .filter((value): value is string => !!value && value.length > 0),
      ) ?? [];

    const uniqueMap = new Map<string, string>();
    codeValues.forEach((item) => {
      uniqueMap.set(item.value.toUpperCase(), item.label);
    });

    scheduleValues.forEach((value) => {
      const upper = value.toUpperCase();
      if (!uniqueMap.has(upper)) {
        uniqueMap.set(upper, value);
      }
    });

    return Array.from(uniqueMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [paymentMethodCodes, schedules]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<ScheduleFormData>({
    defaultValues: {
      newOld: schedule?.newOld || '',
      shippingLine: schedule?.shippingLineCode || schedule?.shippingLine || '',
      commissionMonth: formatDateForInput(schedule?.commissionMonth ?? null),
      commissionDollar: schedule?.commissionDollar || '',
      orderDate: schedule?.orderDate || '',
      exporter: schedule?.exporter || '',
      contractNo: schedule?.contractNo || '',
      quota: schedule?.quota || 'N',
      fumigation: schedule?.fumigation || 'N',
      spot: schedule?.spot || 'N',
      customsDuty: schedule?.customsDuty || 'N',
      shipmentSeq: schedule?.shipmentSeq || undefined,
      exportCountry: schedule?.exportCountry || '',
      product: schedule?.productCode || schedule?.product || '',
      bk: schedule?.bk || '',
      bl: schedule?.bl || '',
      qty: schedule?.qty || undefined,
      grade: schedule?.grade || '',
      packingType: schedule?.packingType || '',
      currencyUnit: schedule?.currencyUnit || '',
      unitPrice: schedule?.unitPrice || undefined,
      destination: schedule?.destination || '',
      etd: formatDateForInput(schedule?.etd ?? null),
      eta: formatDateForInput(schedule?.eta ?? null),
      notes: schedule?.notes || '',
      certificateRequest: schedule?.certificateRequest || '',
      totalAmount: schedule?.totalAmount || undefined,
      originalShipment: schedule?.originalShipment || '',
      quarantineDate: schedule?.quarantineDate || '',
      customsDate: schedule?.customsDate || '',
      paymentDetail1Date: formatDateForInput(payment1?.dueDate ?? null),
      paymentDetail1Ratio: payment1?.ratio ?? undefined,
      paymentDetail1Amount: payment1?.amount ?? undefined,
      paymentDetail1Method: payment1?.method ?? undefined,
      paymentDetail1ExchangeRate: payment1?.exchangeRate ?? undefined,
      paymentDetail1Result: payment1?.result ?? '',
      paymentDetail2Date: formatDateForInput(payment2?.dueDate ?? null),
      paymentDetail2Ratio: payment2?.ratio ?? undefined,
      paymentDetail2Amount: payment2?.amount ?? undefined,
      paymentDetail2Method: payment2?.method ?? undefined,
      paymentDetail2ExchangeRate: payment2?.exchangeRate ?? undefined,
      paymentDetail2Result: payment2?.result ?? '',
      invoiceAmount: schedule?.invoiceAmount ?? undefined,
      claim: schedule?.claim || '',
      bankPickup: schedule?.bankPickup || '',
      sto: schedule?.sto || '',
      dm: schedule?.dm || '',
      dt: schedule?.dt || '',
      cb: schedule?.cb || '',
      finalDestination: schedule?.finalDestination || '',
      finalDestinationArrivalDate: schedule?.finalDestinationArrivalDate || '',
    },
  });

  const watchedExporter = watch('exporter');
  const watchedShippingLine = watch('shippingLine');
  const watchedEta = watch('eta');
  const watchedEtd = watch('etd');
  const watchedDm = watch('dm');
  const watchedDt = watch('dt');
  const watchedCb = watch('cb');
  const watchedDestination = watch('destination');
  const watchedFinalDestination = watch('finalDestination');

  React.useEffect(() => {
    if (!destinationCodes?.length) {
      return;
    }
    if (watchedDestination) {
      const resolved = resolveDestinationCodeValue(watchedDestination);
      if (resolved && resolved !== watchedDestination) {
        setValue('destination', resolved, { shouldDirty: true });
      }
    }
    if (watchedFinalDestination) {
      const resolvedFinal = resolveDestinationCodeValue(watchedFinalDestination);
      if (resolvedFinal && resolvedFinal !== watchedFinalDestination) {
        setValue('finalDestination', resolvedFinal, { shouldDirty: true });
      }
    }
  }, [
    destinationCodes,
    watchedDestination,
    watchedFinalDestination,
    resolveDestinationCodeValue,
    setValue,
  ]);

  const computeEtdOffsetDate = React.useCallback(
    (offsetDays: number) => {
      const baseDate = parseDateInput(watchedEtd);
      if (!baseDate) {
        return null;
      }
      return addDays(baseDate, offsetDays);
    },
    [parseDateInput, watchedEtd],
  );

  const applyAutoValue = React.useCallback(
    (
      key: 'dm' | 'dt' | 'cb',
      currentValue: string | undefined,
      nextValue: string | null,
      forceUpdate = false,
    ) => {
      const trimmedCurrent = currentValue?.trim() ?? '';
      const trimmedNext = nextValue?.trim() ?? '';
      const lastValue = lastAutoFreeTimeRef.current[key] ?? '';

      console.debug('[ScheduleFormDrawer] applyAutoValue', {
        field: key,
        currentValue: trimmedCurrent,
        nextValue: trimmedNext,
        forceUpdate,
        lastValue,
      });

      if (trimmedCurrent === trimmedNext && !forceUpdate) {
        return;
      }

      const shouldUpdate =
        forceUpdate || trimmedCurrent === '' || trimmedCurrent === lastValue;

      if (shouldUpdate) {
        console.debug('[ScheduleFormDrawer] setValue', { field: key, value: trimmedNext, forceUpdate });
        setValue(key, trimmedNext, { shouldDirty: true });
        lastAutoFreeTimeRef.current[key] = trimmedNext;
      }
    },
    [setValue],
  );

  const resolveExporterCode = React.useCallback(
    (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return null;
      }
      const normalized = trimmed.toUpperCase();
      const matched = exporterCodes?.find((code) => {
        const codeValue = code.value?.trim().toUpperCase();
        const codeName = code.name?.trim().toUpperCase();
        if (!codeValue && !codeName) {
          return false;
        }
        return (
          codeValue === normalized ||
          codeName === normalized ||
          (codeName ? codeName.includes(normalized) || normalized.includes(codeName) : false)
        );
      });
      if (matched?.value?.trim()) {
        return matched.value.trim().toUpperCase();
      }
      return trimmed.length ? trimmed.toUpperCase() : null;
    },
    [exporterCodes],
  );

  const resolveExportCountryCode = React.useCallback(
    (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return null;
      }
      const normalized = trimmed.toUpperCase();
      const matched = exportCountryCodes?.find((code) => {
        const codeValue = code.value?.trim().toUpperCase();
        const codeName = code.name?.trim().toUpperCase();
        if (!codeValue && !codeName) {
          return false;
        }
        return (
          codeValue === normalized ||
          codeName === normalized ||
          (codeName ? codeName.includes(normalized) || normalized.includes(codeName) : false) ||
          (codeValue ? codeValue.includes(normalized) || normalized.includes(codeValue) : false)
        );
      });
      if (matched?.value?.trim()) {
        return matched.value.trim();
      }
      return trimmed;
    },
    [exportCountryCodes],
  );

  const resolveShippingLineCode = React.useCallback(
    (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return null;
      }
      const normalized = trimmed.toUpperCase();
      const matched = shippingLineCodes?.find((code) => {
        const codeValue = code.value?.trim().toUpperCase();
        const codeName = code.name?.trim().toUpperCase();
        if (!codeValue && !codeName) {
          return false;
        }
        return (
          codeValue === normalized ||
          codeName === normalized ||
          (codeName ? codeName.includes(normalized) || normalized.includes(codeName) : false) ||
          (codeValue ? codeValue.includes(normalized) || normalized.includes(codeValue) : false)
        );
      });
      if (matched?.value?.trim()) {
        return matched.value.trim().toUpperCase();
      }
      return normalized;
    },
    [shippingLineCodes],
  );

  const normalizeDateToIso = React.useCallback((value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }
    const possibleFormats = ['yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy', 'MM/dd'];
    for (const fmt of possibleFormats) {
      try {
        const parsed = fmt === 'MM/dd'
          ? (() => {
              const date = parse(trimmed, fmt, new Date());
              if (!isValid(date)) {
                return null;
              }
              date.setFullYear(new Date().getFullYear());
              return date;
            })()
          : parse(trimmed, fmt, new Date());
        if (parsed && isValid(parsed)) {
          return format(parsed, 'yyyy-MM-dd');
        }
      } catch {
        // ignore parse errors and try next format
      }
    }
    // fallback: if already ISO-like (length 10 with '-') just return as is
    if (trimmed.length === 10 && trimmed.includes('-')) {
      return trimmed;
    }
    return null;
  }, []);

  // 기존 계약서 파일 메타데이터가 로드되면 contractFile state 업데이트
  React.useEffect(() => {
    if (existingContractFileMetadata) {
      setContractFile(existingContractFileMetadata);
    }
  }, [existingContractFileMetadata]);

  // 기존 invoice 파일 메타데이터가 로드되면 invoiceFile state 업데이트 (수정 모드일 때만)
  React.useEffect(() => {
    if (mode === 'edit' && existingInvoiceFileMetadata) {
      setInvoiceFile(existingInvoiceFileMetadata);
    }
  }, [mode, existingInvoiceFileMetadata]);

  // 기존 제품 이미지 폴더 메타데이터가 로드되면 productImagesFolder state 업데이트
  React.useEffect(() => {
    if (existingProductImagesFolderMetadata) {
      setProductImagesFolder(existingProductImagesFolderMetadata);
    }
  }, [existingProductImagesFolderMetadata]);

  React.useEffect(() => {
    if (open) {
      // Drawer가 열릴 때 계약서 파일 초기화
      if (mode === 'edit' && schedule?.contractGoogleDriveFileId && schedule?.contractFileName) {
        // 수정 모드이고 기존 계약서 파일이 있으면, 파일명만이라도 먼저 표시
        // 메타데이터가 로드되면 자동으로 업데이트됨
        setContractFile({
          id: schedule.contractGoogleDriveFileId,
          name: schedule.contractFileName,
          mimeType: '',
          size: undefined,
          modifiedTime: undefined,
          webViewLink: undefined,
          thumbnailLink: undefined,
        });
      } else {
        // 생성 모드이거나 기존 계약서 파일이 없으면 초기화
        setContractFile(null);
      }

      // 송장 파일 초기화
      if (mode === 'edit' && schedule?.invoiceGoogleDriveFileId && schedule?.invoiceFileName) {
        // 수정 모드이고 기존 송장 파일이 있으면, 파일명만이라도 먼저 표시
        // 메타데이터가 로드되면 자동으로 업데이트됨
        setInvoiceFile({
          id: schedule.invoiceGoogleDriveFileId,
          name: schedule.invoiceFileName,
          mimeType: '',
          size: undefined,
          modifiedTime: undefined,
          webViewLink: undefined,
          thumbnailLink: undefined,
        });
      } else {
        // 생성 모드이거나 기존 송장 파일이 없으면 초기화
        setInvoiceFile(null);
      }

      // 제품 이미지 폴더 초기화
      if (mode === 'edit' && schedule?.productImagesFolderId) {
        // 폴더명이 있으면 사용, 없으면 폴더 ID 사용
        setProductImagesFolder({
          id: schedule.productImagesFolderId,
          name: schedule.productImagesFolderName || '제품 이미지 폴더',
          mimeType: 'application/vnd.google-apps.folder',
          size: undefined,
          modifiedTime: undefined,
          webViewLink: undefined,
          thumbnailLink: undefined,
        });
      } else {
        setProductImagesFolder(null);
      }
      
      if (mode === 'edit' && schedule) {
        const editPayment1 = schedule.payments?.find((payment) => payment.sequence === 1);
        const editPayment2 = schedule.payments?.find((payment) => payment.sequence === 2);
        reset({
          newOld: schedule.newOld || '',
          shippingLine: schedule.shippingLine || '',
          commissionMonth: formatDateForInput(schedule.commissionMonth ?? null),
          commissionDollar: schedule.commissionDollar || '',
          orderDate: schedule.orderDate || '',
          exporter: schedule.exporter || '',
          contractNo: schedule.contractNo || '',
          quota: schedule.quota === 'Y' ? 'Y' : 'N',
          fumigation: schedule.fumigation === 'Y' ? 'Y' : 'N',
          spot: schedule.spot === 'Y' ? 'Y' : 'N',
          customsDuty: schedule.customsDuty === 'Y' ? 'Y' : 'N',
          shipmentSeq: schedule.shipmentSeq || undefined,
          exportCountry: schedule.exportCountryCode || resolveExportCountryCode(schedule.exportCountry) || '',
          product: schedule.productCode || schedule.product || '',
          bk: schedule.bk || '',
          bl: schedule.bl || '',
          qty: schedule.qty || undefined,
          grade: schedule.grade || '',
          packingType: schedule.packingType || '',
          currencyUnit: schedule.currencyUnit || '',
          unitPrice: schedule.unitPrice || undefined,
          destination: schedule.destination || '',
          etd: formatDateForInput(schedule.etd ?? null),
          eta: formatDateForInput(schedule.eta ?? null),
          notes: schedule.notes || '',
          certificateRequest: schedule.certificateRequest || '',
          totalAmount: schedule.totalAmount || undefined,
          originalShipment: schedule.originalShipment || '',
          quarantineDate: schedule.quarantineDate || '',
          customsDate: schedule.customsDate || '',
          paymentDetail1Date: formatDateForInput(editPayment1?.dueDate ?? null),
          paymentDetail1Ratio: editPayment1?.ratio ?? undefined,
          paymentDetail1Amount: editPayment1?.amount ?? undefined,
          paymentDetail1Method: editPayment1?.method ?? undefined,
          paymentDetail1ExchangeRate: editPayment1?.exchangeRate ?? undefined,
          paymentDetail1Result: editPayment1?.result ?? '',
          paymentDetail2Date: formatDateForInput(editPayment2?.dueDate ?? null),
          paymentDetail2Ratio: editPayment2?.ratio ?? undefined,
          paymentDetail2Amount: editPayment2?.amount ?? undefined,
          paymentDetail2Method: editPayment2?.method ?? undefined,
          paymentDetail2ExchangeRate: editPayment2?.exchangeRate ?? undefined,
          paymentDetail2Result: editPayment2?.result ?? '',
          invoiceAmount: schedule.invoiceAmount ?? undefined,
          claim: schedule.claim || '',
          bankPickup: schedule.bankPickup || '',
          sto: schedule.sto || '',
          dm: schedule.dm || '',
          dt: schedule.dt || '',
          cb: schedule.cb || '',
          finalDestination: schedule.finalDestination || '',
          finalDestinationArrivalDate: schedule.finalDestinationArrivalDate || '',
        });
      } else {
        reset({
          newOld: '',
          shippingLine: '',
          commissionMonth: '',
          commissionDollar: '',
          orderDate: '',
          exporter: '',
          contractNo: '',
          quota: 'N',
          fumigation: 'N',
          spot: 'N',
          customsDuty: 'N',
          shipmentSeq: undefined,
          exportCountry: '',
          product: '',
          bk: '',
          bl: '',
          qty: undefined,
          grade: '',
          packingType: '',
          currencyUnit: '',
          unitPrice: undefined,
          destination: '',
          etd: '',
          eta: '',
          notes: '',
          certificateRequest: '',
          totalAmount: undefined,
          originalShipment: '',
          quarantineDate: '',
          customsDate: '',
          paymentDetail1Date: '',
          paymentDetail1Ratio: undefined,
          paymentDetail1Amount: undefined,
          paymentDetail1Method: undefined,
          paymentDetail1ExchangeRate: undefined,
          paymentDetail1Result: '',
          paymentDetail2Date: '',
          paymentDetail2Ratio: undefined,
          paymentDetail2Amount: undefined,
          paymentDetail2Method: undefined,
          paymentDetail2ExchangeRate: undefined,
          paymentDetail2Result: '',
          invoiceAmount: undefined,
          claim: '',
          bankPickup: '',
          sto: '',
          dm: '',
          dt: '',
          cb: '',
          finalDestination: '',
          finalDestinationArrivalDate: '',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, schedule?.id]);


  // 총량과 unitPrice가 변경되면 인보이스 금액 자동 계산
  const totalAmount = watch('totalAmount') || 0;
  const unitPrice = watch('unitPrice') || 0;
  React.useEffect(() => {
    if (totalAmount > 0 && unitPrice > 0) {
      const calculatedInvoiceAmount = totalAmount * unitPrice;
      // 소수점 2자리로 반올림
      const roundedAmount = Math.round(calculatedInvoiceAmount * 100) / 100;
      setValue('invoiceAmount', roundedAmount);
    } else {
      setValue('invoiceAmount', undefined);
    }
  }, [totalAmount, unitPrice, setValue]);


  // 인보이스 금액 또는 비율이 변경되면 1차, 2차 금액 재계산
  const invoiceAmount = watch('invoiceAmount');
  const paymentDetail1Ratio = watch('paymentDetail1Ratio');
  const paymentDetail2Ratio = watch('paymentDetail2Ratio');

  React.useEffect(() => {
    if (
      invoiceAmount !== undefined &&
      invoiceAmount !== null &&
      !Number.isNaN(invoiceAmount) &&
      paymentDetail1Ratio !== undefined &&
      paymentDetail1Ratio !== null &&
      !Number.isNaN(paymentDetail1Ratio)
    ) {
        setValue('paymentDetail1Amount', (invoiceAmount * paymentDetail1Ratio) / 100);
      }
  }, [invoiceAmount, paymentDetail1Ratio, setValue]);

  React.useEffect(() => {
    if (
      invoiceAmount !== undefined &&
      invoiceAmount !== null &&
      !Number.isNaN(invoiceAmount) &&
      paymentDetail2Ratio !== undefined &&
      paymentDetail2Ratio !== null &&
      !Number.isNaN(paymentDetail2Ratio)
    ) {
        setValue('paymentDetail2Amount', (invoiceAmount * paymentDetail2Ratio) / 100);
      }
  }, [invoiceAmount, paymentDetail2Ratio, setValue]);

  const handleFormSubmit = async (data: ScheduleFormData) => {
    setIsSubmitting(true);
    try {
      if (onSubmit) {
        // 계약서, 송장 파일 및 제품 이미지 폴더 정보 추가
        const submitData = {
          ...data,
          googleDriveFileId: contractFile?.id || null,
          contractFileName: contractFile?.name || null,
          invoiceGoogleDriveFileId: invoiceFile?.id || null,
          invoiceFileName: invoiceFile?.name || null,
          productImagesFolderId: productImagesFolder?.id || null,
          productImagesFolderName: productImagesFolder?.name || null,
        };
        const normalizePaymentDateValue = (dateString?: string | null) => {
          if (!dateString) {
            return null;
          }
          const trimmed = dateString.trim();
          if (!trimmed) {
            return null;
          }
          if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
          }
          if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
            try {
              const parsed = parse(trimmed, 'yyyy/MM/dd', new Date());
              if (isValid(parsed)) {
                return format(parsed, 'yyyy-MM-dd');
              }
            } catch {
              // ignore parsing failures, fallback later
            }
          }
          if (/^\d{2}\/\d{2}$/.test(trimmed)) {
            try {
              const currentYear = new Date().getFullYear();
              const parsedDate = parse(trimmed, 'MM/dd', new Date());
              parsedDate.setFullYear(currentYear);
              if (isValid(parsedDate)) {
                return format(parsedDate, 'yyyy-MM-dd');
              }
            } catch {
              // ignore parsing failures, fallback to original value
            }
          }
          const parsedFallback = parseDateInput(trimmed);
          if (parsedFallback) {
            return format(parsedFallback, 'yyyy-MM-dd');
          }
          return trimmed;
        };

        const toNullableNumber = (value?: number) =>
          value !== undefined && value !== null && !Number.isNaN(value) ? value : null;

        const toNullableString = (value?: string | null) =>
          value !== undefined && value !== null && value.trim().length > 0 ? value.trim() : null;

        const paymentsPayload: Array<{
          sequence: number;
          dueDate?: string | null;
          ratio?: number | null;
          amount?: number | null;
          method?: string | null;
          exchangeRate?: number | null;
          result?: string | null;
        }> = [];

        const payment1: {
          sequence: number;
          dueDate?: string | null;
          ratio?: number | null;
          amount?: number | null;
          method?: string | null;
          exchangeRate?: number | null;
          result?: string | null;
        } = { sequence: 1 };
        const payment1Date = normalizePaymentDateValue(data.paymentDetail1Date);
        const payment1Ratio = toNullableNumber(data.paymentDetail1Ratio);
        const payment1Amount = toNullableNumber(data.paymentDetail1Amount);
        const payment1Method = toNullableString(data.paymentDetail1Method ?? null);
        const payment1ExchangeRate = toNullableNumber(data.paymentDetail1ExchangeRate);
        const payment1Result = toNullableString(data.paymentDetail1Result ?? null);
        if (payment1Date) {
          payment1.dueDate = payment1Date;
        }
        if (payment1Ratio !== null) {
          payment1.ratio = payment1Ratio;
        }
        if (payment1Amount !== null) {
          payment1.amount = payment1Amount;
        }
        if (payment1Method) {
          payment1.method = payment1Method;
        }
        if (payment1ExchangeRate !== null) {
          payment1.exchangeRate = payment1ExchangeRate;
        }
        if (payment1Result) {
          payment1.result = payment1Result;
        }
        if (Object.keys(payment1).length > 1) {
          paymentsPayload.push(payment1);
        }

        const payment2: {
          sequence: number;
          dueDate?: string | null;
          ratio?: number | null;
          amount?: number | null;
          method?: string | null;
          exchangeRate?: number | null;
          result?: string | null;
        } = { sequence: 2 };
        const payment2Date = normalizePaymentDateValue(data.paymentDetail2Date);
        const payment2Ratio = toNullableNumber(data.paymentDetail2Ratio);
        const payment2Amount = toNullableNumber(data.paymentDetail2Amount);
        const payment2Method = toNullableString(data.paymentDetail2Method ?? null);
        const payment2ExchangeRate = toNullableNumber(data.paymentDetail2ExchangeRate);
        const payment2Result = toNullableString(data.paymentDetail2Result ?? null);
        if (payment2Date) {
          payment2.dueDate = payment2Date;
        }
        if (payment2Ratio !== null) {
          payment2.ratio = payment2Ratio;
        }
        if (payment2Amount !== null) {
          payment2.amount = payment2Amount;
        }
        if (payment2Method) {
          payment2.method = payment2Method;
        }
        if (payment2ExchangeRate !== null) {
          payment2.exchangeRate = payment2ExchangeRate;
        }
        if (payment2Result) {
          payment2.result = payment2Result;
        }
        if (Object.keys(payment2).length > 1) {
          paymentsPayload.push(payment2);
        }

        await onSubmit({
          ...submitData,
          payments: paymentsPayload,
        });
      }
      onOpenChange(false);
      reset();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string | string[] } }; message?: string })?.response
          ?.data?.message ??
        (error as { message?: string })?.message ??
        '오류가 발생했습니다.';
      toast({
        title: '스케줄 저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;

    const exporterCode = resolveExporterCode(watchedExporter);
    const shippingLineCode = resolveShippingLineCode(watchedShippingLine);
    const etaIso = normalizeDateToIso(watchedEta);

    if (!open) {
      console.debug('[ScheduleFormDrawer] FT auto-calc skipped: drawer closed');
      return undefined;
    }

    if (!exporterCode || !shippingLineCode || !etaIso) {
      if (lastFreeTimeParamsRef.current) {
        console.debug('[ScheduleFormDrawer] FT auto-calc reset: insufficient params', {
          exporterCode,
          shippingLineCode,
          etaIso,
        });
        applyAutoValue('dm', watchedDm, '', true);
        applyAutoValue('dt', watchedDt, '', true);
        applyAutoValue('cb', watchedCb, '', true);
        lastFreeTimeParamsRef.current = null;
      }
      return undefined;
    }

    const paramsChanged =
      !lastFreeTimeParamsRef.current ||
      lastFreeTimeParamsRef.current.exporterCode !== exporterCode ||
      lastFreeTimeParamsRef.current.shippingLineCode !== shippingLineCode ||
      lastFreeTimeParamsRef.current.eta !== etaIso;

    const hasEmptyField =
      !watchedDm?.trim() || !watchedDt?.trim() || !watchedCb?.trim();

    if (!paramsChanged && !hasEmptyField) {
      console.debug('[ScheduleFormDrawer] FT auto-calc skipped: params unchanged and fields filled');
      return undefined;
    }

    void (async () => {
      try {
        console.debug('[ScheduleFormDrawer] FT auto-calc request', {
          exporterCode,
          shippingLineCode,
          etaIso,
          paramsChanged,
          hasEmptyField,
        });
        const result = await calculateFreeTime({
          exporterCode,
          shippingLineCode,
          eta: etaIso,
        });
        if (!result || cancelled) {
          if (!result && paramsChanged) {
            console.debug('[ScheduleFormDrawer] FT auto-calc result empty');
            applyAutoValue('dm', watchedDm, '', true);
            applyAutoValue('dt', watchedDt, '', true);
            applyAutoValue('cb', watchedCb, '', true);
          }
          return;
        }

        lastFreeTimeParamsRef.current = {
          exporterCode,
          shippingLineCode,
          eta: etaIso,
        };

        const computedDm =
          result.dmOffsetDays !== null && result.dmOffsetDays !== undefined
            ? String(result.dmOffsetDays)
            : result.dmDate ?? '';
        const computedDt =
          result.dtOffsetDays !== null && result.dtOffsetDays !== undefined
            ? String(result.dtOffsetDays)
            : result.dtDate ?? '';
        const computedCb =
          result.cbOffsetDays !== null && result.cbOffsetDays !== undefined
            ? String(result.cbOffsetDays)
            : result.cbDate ?? '';

        console.debug('[ScheduleFormDrawer] FT auto-calc response', {
          computedDm,
          computedDt,
          computedCb,
        });

        if (!cancelled) {
          const nextDm = computedDm?.trim() ?? '';
          const nextDt = computedDt?.trim() ?? '';
          const nextCb = computedCb?.trim() ?? '';

          applyAutoValue('dm', watchedDm, nextDm || '', paramsChanged);
          applyAutoValue('dt', watchedDt, nextDt || '', paramsChanged);
          applyAutoValue('cb', watchedCb, nextCb || '', paramsChanged);
        }
      } catch (error) {
        console.error('FT 자동 계산 중 오류가 발생했습니다.', error);
        if (paramsChanged) {
          console.debug('[ScheduleFormDrawer] FT auto-calc reset due to error');
          applyAutoValue('dm', watchedDm, '', true);
          applyAutoValue('dt', watchedDt, '', true);
          applyAutoValue('cb', watchedCb, '', true);
          lastFreeTimeParamsRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    calculateFreeTime,
    normalizeDateToIso,
    resolveExporterCode,
    resolveShippingLineCode,
    watchedExporter,
    watchedShippingLine,
    watchedEta,
    watchedDm,
    watchedDt,
    watchedCb,
    applyAutoValue,
  ]);

  // exportCountry 값이 이름일 경우 코드로 자동 변환
  React.useEffect(() => {
    if (!open || !exportCountryCodes || exportCountryCodes.length === 0) {
      return;
    }
    const currentValue = watch('exportCountry');
    if (!currentValue || !currentValue.trim()) {
      return;
    }
    // 이미 코드인지 확인 (코드 목록에 있는지)
    const isCode = exportCountryCodes.some(
      (code) => code.value?.trim().toUpperCase() === currentValue.trim().toUpperCase()
    );
    if (isCode) {
      return; // 이미 코드이면 변환 불필요
    }
    // 이름인 경우 코드로 변환
    const resolvedCode = resolveExportCountryCode(currentValue);
    if (resolvedCode && resolvedCode !== currentValue) {
      setValue('exportCountry', resolvedCode, { shouldDirty: false });
    }
  }, [open, exportCountryCodes, watch, setValue, resolveExportCountryCode]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent 
        className="h-full" 
        style={{ width: '85%', maxWidth: '1200px' }}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>
                {mode === 'create' ? '스케줄 추가' : '스케줄 수정'}
              </DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 스케줄을 추가합니다.'
                  : '스케줄 정보를 수정합니다.'}
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
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-0">
            {/* 계약 정보 */}
            <div className="space-y-3 pb-6">
              <h3 className="text-sm font-semibold text-foreground">계약 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contractNo">Contract No.</Label>
                  <Input id="contractNo" size="sm" {...register('contractNo')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exporter">EXPORTER</Label>
                  <div className="relative">
                    <Select
                      value={watch('exporter') || ''}
                      onValueChange={(value) => setValue('exporter', value || undefined)}
                    >
                      <SelectTrigger id="exporter" size="sm" className="w-full">
                        <SelectValue placeholder="EXPORTER 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueExporters.map((exporter) => (
                          <SelectItem key={exporter} value={exporter}>
                            {exporter}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('exporter') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('exporter', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exportCountry">수출국</Label>
                  <div className="relative">
                    <Select
                      value={watch('exportCountry') || ''}
                      onValueChange={(value) => setValue('exportCountry', value || undefined)}
                    >
                      <SelectTrigger id="exportCountry" size="sm" className="w-full">
                        <SelectValue placeholder="수출국 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueExportCountries.map(({ code, name }) => (
                          <SelectItem key={code} value={code}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('exportCountry') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('exportCountry', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quota">쿼터 유무</Label>
                  <Switch
                    id="quota"
                    checked={watch('quota') === 'Y'}
                    onCheckedChange={(checked) => setValue('quota', checked ? 'Y' : 'N', { shouldDirty: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fumigation">훈증 유무</Label>
                  <Switch
                    id="fumigation"
                    checked={watch('fumigation') === 'Y'}
                    onCheckedChange={(checked) => setValue('fumigation', checked ? 'Y' : 'N', { shouldDirty: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spot">현물 유무</Label>
                  <Switch
                    id="spot"
                    checked={watch('spot') === 'Y'}
                    onCheckedChange={(checked) => setValue('spot', checked ? 'Y' : 'N', { shouldDirty: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customsDuty">관세 유무</Label>
                  <Switch
                    id="customsDuty"
                    checked={watch('customsDuty') === 'Y'}
                    onCheckedChange={(checked) => setValue('customsDuty', checked ? 'Y' : 'N', { shouldDirty: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product">Product</Label>
                  <div className="relative">
                    <Select
                      value={watch('product') || ''}
                      onValueChange={(value) => setValue('product', value || undefined)}
                    >
                      <SelectTrigger id="product" size="sm" className="w-full">
                        <SelectValue placeholder="제품 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {productOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('product') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('product', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orderDate">발주일</Label>
                  <DatePicker
                    value={watch('orderDate')}
                    onChange={(value) => setValue('orderDate', value || undefined)}
                    placeholder="발주일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manager">담당</Label>
                  <Input
                    id="manager"
                    value={currentUserName || ''}
                    readOnly
                    disabled
                    size="sm"
                    className="w-full bg-muted"
                    placeholder="로그인한 사용자"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newOld">구분 (신/구)</Label>
                  <div className="relative">
                    <Select
                      value={watch('newOld') || ''}
                      onValueChange={(value) => setValue('newOld', value || undefined)}
                    >
                      <SelectTrigger id="newOld" size="sm" className="w-full">
                        <SelectValue placeholder="신/구 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="신">신</SelectItem>
                        <SelectItem value="구">구</SelectItem>
                      </SelectContent>
                    </Select>
                    {watch('newOld') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('newOld', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shippingLine">선사</Label>
                  <div className="relative">
                    <Select
                      value={watch('shippingLine') || ''}
                      onValueChange={(value) => setValue('shippingLine', value || undefined)}
                    >
                      <SelectTrigger id="shippingLine" size="sm" className="w-full">
                        <SelectValue placeholder="선사 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {shippingLineOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('shippingLine') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('shippingLine', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionMonth">커미션 월</Label>
                  <DatePicker
                    value={watch('commissionMonth')}
                    onChange={(value) => setValue('commissionMonth', value || undefined)}
                    placeholder="커미션 월 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionDollar">커미션 $</Label>
                  <Input id="commissionDollar" size="sm" {...register('commissionDollar')} />
                </div>
              </div>
            </div>

            {/* 선적 기본 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">선적 기본 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shipmentSeq">선적 순번</Label>
                  <Input
                    id="shipmentSeq"
                    type="number"
                    size="sm"
                    {...register('shipmentSeq', {
                      valueAsNumber: true,
                    })}
                    placeholder="1"
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bk">BK</Label>
                  <Input id="bk" size="sm" {...register('bk')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bl">BL</Label>
                  <Input id="bl" size="sm" {...register('bl')} />
                </div>
              </div>
            </div>

            {/* 수량 및 가격 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">수량 및 가격 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="qty">Qty</Label>
                  <Input
                    id="qty"
                    type="number"
                    size="sm"
                    {...register('qty', { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade">Grade</Label>
                  <div className="relative">
                    <Select
                      value={watch('grade') || ''}
                      onValueChange={(value) => setValue('grade', value || undefined)}
                    >
                      <SelectTrigger id="grade" size="sm" className="w-full">
                        <SelectValue placeholder="Grade 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {tradeGradeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('grade') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('grade', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packingType">Packing</Label>
                  <div className="relative">
                    <Select
                      value={watch('packingType') || ''}
                      onValueChange={(value) => setValue('packingType', value || undefined)}
                    >
                      <SelectTrigger id="packingType" size="sm" className="w-full">
                        <SelectValue placeholder="Packing 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {packingOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('packingType') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('packingType', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currencyUnit">Currency unit</Label>
                  <div className="relative">
                    <Select
                      value={watch('currencyUnit') || ''}
                      onValueChange={(value) => setValue('currencyUnit', value || undefined)}
                    >
                      <SelectTrigger id="currencyUnit" size="sm" className="w-full">
                        <SelectValue placeholder="통화 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {currencyUnitOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('currencyUnit') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('currencyUnit', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitPrice">Unit price</Label>
                  <NumberInput
                    id="unitPrice"
                    size="sm"
                    value={watch('unitPrice')}
                    onChange={(value) => {
                      setValue('unitPrice', value, { shouldDirty: true });
                    }}
                    decimals={2}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalAmount">총량</Label>
                  <NumberInput
                    id="totalAmount"
                    size="sm"
                    value={watch('totalAmount')}
                    onChange={(value) => {
                      setValue('totalAmount', value, { shouldDirty: true });
                    }}
                    decimals={3}
                    placeholder="0.000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceAmount">인보이스금액</Label>
                  <NumberInput
                    id="invoiceAmount"
                    size="sm"
                    value={watch('invoiceAmount')}
                    onChange={(value) => {
                      setValue('invoiceAmount', value, { shouldDirty: true });
                    }}
                    decimals={2}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* 배송 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">배송 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="destination">도착지</Label>
                  <div className="relative">
                    <Select
                      value={watch('destination') || ''}
                      onValueChange={(value) => setValue('destination', value || undefined)}
                    >
                      <SelectTrigger id="destination" size="sm" className="w-full">
                        <SelectValue placeholder="도착지 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {destinationOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('destination') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('destination', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="etd">ETD</Label>
                  <DatePicker
                    value={watch('etd')}
                    onChange={(value) => setValue('etd', value || undefined)}
                    placeholder="ETD 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eta">ETA</Label>
                  <DatePicker
                    value={watch('eta')}
                    onChange={(value) => setValue('eta', value || undefined)}
                    placeholder="ETA 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finalDestination">최종 목적지</Label>
                  <div className="relative">
                    <Select
                      value={watch('finalDestination') || ''}
                      onValueChange={(value) => setValue('finalDestination', value || undefined)}
                    >
                      <SelectTrigger id="finalDestination" size="sm" className="w-full">
                        <SelectValue placeholder="최종 목적지 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {finalDestinationOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('finalDestination') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('finalDestination', undefined);
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finalDestinationArrivalDate">최종 목적지 도착일</Label>
                  <DatePicker
                    value={watch('finalDestinationArrivalDate')}
                    onChange={(value) => setValue('finalDestinationArrivalDate', value || undefined)}
                    placeholder="최종 목적지 도착일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="originalShipment">원본발송</Label>
                  <DatePicker
                    value={watch('originalShipment')}
                    onChange={(value) => setValue('originalShipment', value || undefined)}
                    placeholder="원본발송 날짜 선택"
                  />
                </div>
              </div>
            </div>

            {/* 통관 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">통관 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quarantineDate">검역일</Label>
                  <DatePicker
                    value={watch('quarantineDate')}
                    onChange={(value) => setValue('quarantineDate', value || undefined)}
                    placeholder="검역일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customsDate">통관일</Label>
                  <DatePicker
                    value={watch('customsDate')}
                    onChange={(value) => setValue('customsDate', value || undefined)}
                    placeholder="통관일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="certificateRequest">필증신청</Label>
                  <Input
                    id="certificateRequest"
                    size="sm"
                    {...register('certificateRequest')}
                  />
                </div>
              </div>
            </div>

            {/* 결제 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">결제 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankPickup">은행픽업</Label>
                  <DatePicker
                    value={watch('bankPickup')}
                    onChange={(value) => setValue('bankPickup', value || undefined)}
                    placeholder="은행픽업 날짜 선택"
                  />
                </div>
              </div>
                
                  <div className="space-y-4">
                <div className="rounded-md border border-border bg-muted/10 p-4 space-y-3">
                  <div className="text-sm font-semibold text-foreground">1차 결제</div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail1Date" className="text-[11px] text-muted-foreground">
                        결제 예정일
                      </Label>
                      <DatePicker
                        value={watch('paymentDetail1Date')}
                        onChange={(value) => setValue('paymentDetail1Date', value || undefined)}
                        placeholder="날짜 선택"
                        footer={({ select }) => (
                          <div className="flex justify-end pt-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => {
                                const next = computeEtdOffsetDate(90);
                                if (!next) {
                                  toast({
                                    title: 'ETD 필요',
                                    description: 'ETD를 먼저 입력해 주세요.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                                console.debug('[ScheduleFormDrawer] paymentDetail1Date ETD+90', {
                                  etd: watchedEtd,
                                  offsetDays: 90,
                                  result: next,
                                });
                                select(next);
                                setValue('paymentDetail1Date', format(next, 'yyyy-MM-dd'), {
                                  shouldDirty: true,
                                });
                              }}
                            >
                              ETD+90
                            </Button>
                          </div>
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail1Ratio" className="text-[11px] text-muted-foreground">
                        비율 (%)
                      </Label>
                              <Input
                                id="paymentDetail1Ratio"
                                type="number"
                                size="sm"
                                step="0.01"
                        {...register('paymentDetail1Ratio', { valueAsNumber: true })}
                              />
                            </div>
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail1Method" className="text-[11px] text-muted-foreground">
                        결제조건
                      </Label>
                      <div className="relative">
                        <Select
                          value={watch('paymentDetail1Method') || ''}
                          onValueChange={(value) => setValue('paymentDetail1Method', value || undefined)}
                        >
                          <SelectTrigger id="paymentDetail1Method" size="sm" className="w-full">
                            <SelectValue placeholder="결제조건" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethodOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value} className="text-xs">
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {watch('paymentDetail1Method') && (
                          <button
                            type="button"
                            onClick={() => setValue('paymentDetail1Method', undefined)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail1Amount" className="text-[11px] text-muted-foreground">
                        금액
                      </Label>
                      <NumberInput
                        id="paymentDetail1Amount"
                        size="sm"
                        value={watch('paymentDetail1Amount')}
                        onChange={(value) => {
                          setValue('paymentDetail1Amount', value, { shouldDirty: true });
                        }}
                        decimals={2}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor="paymentDetail1ExchangeRate"
                        className="text-[11px] text-muted-foreground"
                      >
                        환율
                      </Label>
                      <Input
                        id="paymentDetail1ExchangeRate"
                        type="text"
                        size="sm"
                        value={formatNumber(watch('paymentDetail1ExchangeRate'))}
                        onChange={(e) => {
                          const num = parseNumber(e.target.value);
                          setValue('paymentDetail1ExchangeRate', num, { shouldDirty: true });
                        }}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail1Result" className="text-[11px] text-muted-foreground">
                        결제 결과
                      </Label>
                      <Input
                        id="paymentDetail1Result"
                                type="text"
                                size="sm"
                        {...register('paymentDetail1Result')}
                              />
                            </div>
                          </div>
                        </div>

                <div className="rounded-md border border-border bg-muted/10 p-4 space-y-3">
                  <div className="text-sm font-semibold text-foreground">2차 결제</div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail2Date" className="text-[11px] text-muted-foreground">
                        결제 예정일
                      </Label>
                      <DatePicker
                        value={watch('paymentDetail2Date')}
                        onChange={(value) => setValue('paymentDetail2Date', value || undefined)}
                        placeholder="날짜 선택"
                        footer={({ select }) => (
                          <div className="flex justify-end pt-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => {
                                const next = computeEtdOffsetDate(90);
                                if (!next) {
                                  toast({
                                    title: 'ETD 필요',
                                    description: 'ETD를 먼저 입력해 주세요.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                                console.debug('[ScheduleFormDrawer] paymentDetail2Date ETD+90', {
                                  etd: watchedEtd,
                                  offsetDays: 90,
                                  result: next,
                                });
                                select(next);
                                setValue('paymentDetail2Date', format(next, 'yyyy-MM-dd'), {
                                  shouldDirty: true,
                                });
                              }}
                            >
                              ETD+90
                            </Button>
                          </div>
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail2Ratio" className="text-[11px] text-muted-foreground">
                        비율 (%)
                      </Label>
                              <Input
                                id="paymentDetail2Ratio"
                                type="number"
                                size="sm"
                                step="0.01"
                        {...register('paymentDetail2Ratio', { valueAsNumber: true })}
                              />
                            </div>
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail2Method" className="text-[11px] text-muted-foreground">
                        결제조건
                      </Label>
                      <div className="relative">
                        <Select
                          value={watch('paymentDetail2Method') || ''}
                          onValueChange={(value) => setValue('paymentDetail2Method', value || undefined)}
                        >
                          <SelectTrigger id="paymentDetail2Method" size="sm" className="w-full">
                            <SelectValue placeholder="결제조건" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethodOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value} className="text-xs">
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {watch('paymentDetail2Method') && (
                          <button
                            type="button"
                            onClick={() => setValue('paymentDetail2Method', undefined)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail2Amount" className="text-[11px] text-muted-foreground">
                        금액
                      </Label>
                      <NumberInput
                        id="paymentDetail2Amount"
                        size="sm"
                        value={watch('paymentDetail2Amount')}
                        onChange={(value) => {
                          setValue('paymentDetail2Amount', value, { shouldDirty: true });
                        }}
                        decimals={2}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor="paymentDetail2ExchangeRate"
                        className="text-[11px] text-muted-foreground"
                      >
                        환율
                      </Label>
                      <Input
                        id="paymentDetail2ExchangeRate"
                        type="text"
                        size="sm"
                        value={formatNumber(watch('paymentDetail2ExchangeRate'))}
                        onChange={(e) => {
                          const num = parseNumber(e.target.value);
                          setValue('paymentDetail2ExchangeRate', num, { shouldDirty: true });
                        }}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="paymentDetail2Result" className="text-[11px] text-muted-foreground">
                        결제 결과
                      </Label>
                      <Input
                        id="paymentDetail2Result"
                        type="text"
                        size="sm"
                        {...register('paymentDetail2Result')}
                      />
                        </div>
                      </div>
                </div>
              </div>
            </div>

            {/* 파일 및 이미지 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">파일 및 이미지</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>계약서 파일</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setContractFilePickerOpen(true)}
                      className="flex-1"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {contractFile ? '파일 변경' : '파일 선택'}
                    </Button>
                    {contractFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setContractFilePreviewOpen(true)}
                        title="미리보기"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {contractFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setContractFile(null)}
                        title="파일 제거"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {contractFile && (
                    <div className="text-xs text-muted-foreground truncate">
                      {contractFile.name}
                    </div>
                  )}
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>송장 파일</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInvoiceFilePickerOpen(true)}
                      className="flex-1"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {invoiceFile ? '파일 변경' : '파일 선택'}
                    </Button>
                    {invoiceFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setInvoiceFilePreviewOpen(true)}
                        title="미리보기"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {invoiceFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setInvoiceFile(null)}
                        title="파일 제거"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {invoiceFile && (
                    <div className="text-xs text-muted-foreground truncate">
                      {invoiceFile.name}
                    </div>
                  )}
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>제품 이미지 폴더</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setProductImagesFolderPickerOpen(true)}
                      className="flex-1"
                    >
                      <Folder className="h-4 w-4 mr-2" />
                      {productImagesFolder ? '폴더 변경' : '폴더 선택'}
                    </Button>
                    {productImagesFolder && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          // webViewLink가 있으면 사용, 없으면 폴더 ID로 링크 생성
                          const folderLink = productImagesFolder.webViewLink 
                            || `https://drive.google.com/drive/folders/${productImagesFolder.id}`;
                          window.open(folderLink, '_blank');
                        }}
                        title="Google Drive에서 열기"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {productImagesFolder && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setProductImagesFolder(null)}
                        title="폴더 제거"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {productImagesFolder && (
                    <div className="text-xs text-muted-foreground truncate">
                      {productImagesFolder.name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 기타 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">기타 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="claim">클레임</Label>
                  <Input
                    id="claim"
                    size="sm"
                    {...register('claim')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sto">STO</Label>
                  <Input
                    id="sto"
                    size="sm"
                    {...register('sto')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dm">DM</Label>
                  <Input
                    id="dm"
                    size="sm"
                    {...register('dm')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dt">DT</Label>
                  <Input
                    id="dt"
                    size="sm"
                    {...register('dt')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cb">CB</Label>
                  <Input
                    id="cb"
                    size="sm"
                    {...register('cb')}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="notes">비고</Label>
                  <Input
                    id="notes"
                    size="sm"
                    {...register('notes')}
                  />
                </div>
              </div>
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <div className="flex justify-end gap-2">
              <DrawerClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  <XCircle className="mr-2 h-4 w-4" />
                  취소
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {mode === 'create' ? '추가' : '수정'}
                  </>
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>

      {/* 계약서 파일 선택 다이얼로그 */}
      <GoogleDriveFilePicker
        open={contractFilePickerOpen}
        onOpenChange={setContractFilePickerOpen}
        onSelect={(file) => {
          setContractFile(file);
        }}
        acceptMimeTypes={[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.google-apps.document', // Google Docs
          'application/vnd.google-apps.spreadsheet', // Google Sheets
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Excel
          'image/*'
        ]}
        title="계약서 파일 선택"
        description="구글 드라이브에서 계약서 파일을 선택하세요"
      />

      {/* 구글 드라이브 파일 선택기 - 송장 */}
      <GoogleDriveFilePicker
        open={invoiceFilePickerOpen}
        onOpenChange={setInvoiceFilePickerOpen}
        onSelect={(file) => {
          setInvoiceFile(file);
        }}
        acceptMimeTypes={['application/pdf']}
        title="송장 파일 선택"
        description="구글 드라이브에서 송장 파일을 선택하세요"
      />

      {/* 계약서 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={contractFilePreviewOpen}
        onOpenChange={setContractFilePreviewOpen}
        file={contractFile}
      />

      {/* 송장 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={invoiceFilePreviewOpen}
        onOpenChange={setInvoiceFilePreviewOpen}
        file={invoiceFile}
      />

      {/* 제품 이미지 폴더 선택 */}
      <GoogleDriveFilePicker
        open={productImagesFolderPickerOpen}
        onOpenChange={setProductImagesFolderPickerOpen}
        onSelect={(folder) => {
          setProductImagesFolder(folder);
        }}
        acceptMimeTypes={['application/vnd.google-apps.folder']}
        title="제품 이미지 폴더 선택"
        description="구글 드라이브에서 제품 이미지 폴더를 선택하세요"
      />
    </Drawer>
  );
}

