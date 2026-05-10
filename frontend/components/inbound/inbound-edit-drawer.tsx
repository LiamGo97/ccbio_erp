'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X, Info, Loader2, BadgeDollarSign, Save } from 'lucide-react';
import type { Schedule, SchedulePayment } from '@/app/inbound/page';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { DatePicker } from '@/components/schedules/date-picker';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { type TradeOrder } from '@/lib/hooks/use-trade-orders';
import { useCalculateWarehouseIgobi } from '@/lib/hooks/use-warehouse-igobi';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useInboundDefaults } from '@/lib/hooks/use-inbound-defaults';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumberWithDecimals, parseNumber, formatNumber } from '@/lib/utils';

interface ContainerPendingPurchaseCost {
  containerId: string;
  pendingPurchaseCost?: number | null;
}

interface InboundFormData {
  doCost?: number | null;
  customsFee?: number | null;
  quarantineAgencyFee?: number | null;
  customsDuty?: number | null;
  additionalItem?: number | null;
  fumigationQuarantine?: number | null;
  spot?: number | null;
  document?: number | null;
  igobi?: number | null;
  extractionFee?: number | null;
  sto?: number | null;
  firstTierLoadingFee?: number | null;
  fee?: number | null;
  sampleCollection?: number | null;
  bankFee?: number | null;
  quarantineWorkCost?: number | null;
  dayExchangeRate?: number | null;
  quotaCost?: number | null;
  warehouse?: string | null;
  igodate?: string | null;
  quarantineDate?: string | null;
  dtDate?: string | null;
  comparisonExchangeRate?: number | null;
  status?: 'PENDING' | 'CONFIRMED';
  containerPendingPurchaseCosts?: ContainerPendingPurchaseCost[];
}

interface InboundEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
  tradeOrder?: TradeOrder | null; // TradeOrder 직접 전달 (입고대기 페이지에서 사용)
  labelResolvers?: {
    destination?: (code?: string | null) => string;
  };
  onSubmit?: (data: InboundFormData) => void;
}

const InfoRow = ({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1 ${className || ''}`}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

export function InboundEditDrawer({
  open,
  onOpenChange,
  schedule,
  tradeOrder,
  labelResolvers,
  onSubmit,
}: InboundEditDrawerProps) {
  // 입고 데이터는 항상 입고 예정만 사용
  const mode: 'PENDING' = 'PENDING';
  const isMobile = useIsMobile();
  
  // 코드 로드
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: currencyCodes = [] } = useCodesByCategory('CURRENCY');
  
  // TradeOrder가 있으면 TradeOrder를 우선 사용, 없으면 schedule 사용
  const dataSource = tradeOrder || schedule;
  
  // TradeOrder에서 베일과 중량 계산
  const totalBales = React.useMemo(() => {
    if (tradeOrder?.containers) {
      return tradeOrder.containers.reduce((sum, container) => {
        return sum + ((container.salesBales ?? container.tradeBales) != null ? Number(container.salesBales ?? container.tradeBales) : 0);
      }, 0);
    }
    return schedule?.qty ?? 0;
  }, [tradeOrder, schedule]);
  
  const totalWeight = React.useMemo(() => {
    if (tradeOrder?.containers) {
      return tradeOrder.containers.reduce((sum, container) => {
        return sum + (container.weight != null ? Number(container.weight) : 0);
      }, 0);
    }
    return tradeOrder?.totalAmount ?? 0;
  }, [tradeOrder]);

  // 컨테이너 수량 계산 (qty는 컨테이너 수량)
  const containerCount = React.useMemo(() => {
    if (tradeOrder?.containers) {
      return tradeOrder.containers.length;
    }
    return 0;
  }, [tradeOrder]);
  
  // 상품 코드를 이름으로 변환
  const getProductName = (code?: string | null) => {
    if (!code) return '-';
    const product = productCodes.find((c) => c.value === code || c.name === code);
    return product?.name || code;
  };
  
  // 통화 코드를 이름으로 변환
  const getCurrencyName = (code?: string | null) => {
    if (!code) return '-';
    const currency = currencyCodes.find((c) => c.value === code || c.name === code);
    return currency?.name || code;
  };

  // 입고 기본 설정 (예정 환율 기본값) - 통화별 USD/EUR
  const { data: inboundDefaults } = useInboundDefaults();
  const currencyForDefaults =
    tradeOrder?.currencyCode ||
    schedule?.currencyUnit ||
    schedule?.currencyName ||
    'USD';
  const normalizedCurrencyForDefaults = (currencyForDefaults || 'USD')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .substring(0, 3) || 'USD';
  const defaultExchangeRate =
    normalizedCurrencyForDefaults === 'EUR'
      ? (inboundDefaults?.defaultExchangeRateEur ?? 1550)
      : (inboundDefaults?.defaultExchangeRateUsd ?? 1400);

  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<InboundFormData>({
    defaultValues: {
      doCost: undefined, // D/O비용 (자동 계산: 반올림(총중량/22)*290000)
      customsFee: 55000, // 통관 수수료 기본값
      quarantineAgencyFee: 55000, // 검역대행료 기본값
      customsDuty: undefined,
      additionalItem: undefined,
      fumigationQuarantine: 0,
      spot: undefined,
      document: undefined,
      igobi: undefined,
      extractionFee: undefined,
      sto: undefined,
      firstTierLoadingFee: undefined,
      fee: undefined,
      sampleCollection: undefined,
      bankFee: undefined,
      quarantineWorkCost: undefined,
      dayExchangeRate: undefined,
      quotaCost: undefined,
      warehouse: undefined,
      igodate: undefined,
      quarantineDate: undefined,
      dtDate: undefined,
      comparisonExchangeRate: defaultExchangeRate,
      status: mode,
    },
  });

  // 훈증 유무가 'Y'인지 확인 (계약 레벨 데이터 사용)
  const hasFumigation = React.useMemo(() => {
    // tradeOrder가 있으면 tradeOrder의 fumigation 사용, 없으면 schedule의 fumigation 사용
    return (tradeOrder?.fumigation === 'Y') || (schedule?.fumigation === 'Y');
  }, [tradeOrder?.fumigation, schedule?.fumigation]);

  // 훈증검역 자동 계산 (훈증 유무가 'Y'이고 Qty가 있으면 130000 * Qty)
  // 기존 값이 없을 때만 자동 계산
  const currentFumigationQuarantine = watch('fumigationQuarantine');
  React.useEffect(() => {
    // 기존 값이 이미 있으면 자동 계산하지 않음
    if (currentFumigationQuarantine !== undefined && currentFumigationQuarantine !== null && currentFumigationQuarantine !== 0) {
      return;
    }
    
    // qty는 컨테이너 수량 또는 베일 수량
    const qty = containerCount || schedule?.qty || 0;
    if (hasFumigation && qty) {
      const calculatedValue = 130000 * qty;
      setValue('fumigationQuarantine', calculatedValue);
    } else {
      setValue('fumigationQuarantine', 0);
    }
  }, [hasFumigation, containerCount, schedule?.qty, setValue, currentFumigationQuarantine]);

  // 쿼터 유무가 'Y'인지 확인 (계약 레벨 데이터 사용)
  const hasQuota = React.useMemo(() => {
    return (tradeOrder?.quota === 'Y') || (schedule?.quota === 'Y');
  }, [tradeOrder?.quota, schedule?.quota]);

  // 쿼터 비용 기본값 설정 (쿼터 유무가 'Y'이면 5원)
  // 기존 값이 없을 때만 자동 계산
  const currentQuotaCost = watch('quotaCost');
  React.useEffect(() => {
    // 기존 값이 이미 있으면 자동 계산하지 않음
    if (currentQuotaCost !== undefined && currentQuotaCost !== null) {
      return;
    }
    
    if (hasQuota) {
      setValue('quotaCost', 5, { shouldDirty: true });
    } else {
      setValue('quotaCost', undefined, { shouldDirty: true });
    }
  }, [hasQuota, setValue, currentQuotaCost]);

  // 관세 유무가 'Y'인지 확인 (계약 레벨 데이터 사용)
  const hasCustomsDuty = React.useMemo(() => {
    return (tradeOrder?.customsDuty === 'Y') || (schedule?.customsDuty === 'Y');
  }, [tradeOrder?.customsDuty, schedule?.customsDuty]);

  // 관세 자동 계산 (관세 유무가 'Y'이고 컨테이너 수량이 있으면 300000 * 컨테이너 수량)
  // 기존 값이 없을 때만 자동 계산
  const currentCustomsDuty = watch('customsDuty');
  React.useEffect(() => {
    // 기존 값이 이미 있으면 자동 계산하지 않음
    if (currentCustomsDuty !== undefined && currentCustomsDuty !== null) {
      return;
    }
    
    // qty는 컨테이너 수량 또는 베일 수량
    const qty = containerCount || schedule?.qty || 0;
    if (hasCustomsDuty && qty) {
      const calculatedValue = 300000 * qty;
      setValue('customsDuty', calculatedValue, { shouldDirty: true });
    } else {
      setValue('customsDuty', undefined, { shouldDirty: true });
    }
  }, [hasCustomsDuty, containerCount, schedule?.qty, setValue, currentCustomsDuty]);

  // 현물 유무가 'Y'인지 확인 (주문 레벨 데이터 사용)
  const hasSpot = React.useMemo(() => {
    // tradeOrder가 있으면 tradeOrder의 spot 사용, 없으면 schedule의 spot 사용
    return (tradeOrder?.spot === 'Y') || (schedule?.spot === 'Y');
  }, [tradeOrder?.spot, schedule?.spot]);

  // 현물 자동 계산 (현물 유무가 'Y'이면 240000)
  // 기존 값이 없을 때만 자동 계산
  const currentSpot = watch('spot');
  React.useEffect(() => {
    // 기존 값이 이미 있으면 자동 계산하지 않음
    if (currentSpot !== undefined && currentSpot !== null) {
      return;
    }
    
    if (hasSpot) {
      setValue('spot', 240000, { shouldDirty: true });
    } else {
      setValue('spot', undefined, { shouldDirty: true });
    }
  }, [hasSpot, setValue, currentSpot]);

  // DO 비용 자동 계산 (반올림(총중량/22)*290000)
  // 기존 값이 없을 때만 자동 계산
  const currentDoCost = watch('doCost');
  React.useEffect(() => {
    // 기존 값이 이미 있으면 자동 계산하지 않음
    if (currentDoCost !== undefined && currentDoCost !== null) {
      return;
    }
    
    // 총중량이 있으면 자동 계산
    if (totalWeight > 0) {
      const calculatedValue = Math.round(totalWeight / 22) * 290000;
      setValue('doCost', calculatedValue, { shouldDirty: true });
    }
  }, [totalWeight, setValue, currentDoCost]);

  // 은행수수료 자동 계산
  // 기존 값이 없을 때만 자동 계산
  const currentBankFee = watch('bankFee');
  React.useEffect(() => {
    // 기존 값이 이미 있으면 자동 계산하지 않음
    if (currentBankFee !== undefined && currentBankFee !== null) {
      return;
    }
    
    // tradeOrder가 있으면 tradeOrder의 payments 사용, 없으면 schedule의 payments 사용
    const payments = tradeOrder?.payments ?? schedule?.payments ?? [];
    const paymentMethods = payments
      .map((payment: any) => payment.method)
      .filter((method): method is string => method !== null && method !== undefined && method.trim() !== '')
      .map((method) => method.toUpperCase().trim());

    let calculatedBankFee = 0;

    // 결제조건이 있는지 확인
    const hasLC = paymentMethods.some((method) => method.includes('LC'));
    const hasTTDAAsOne = paymentMethods.some((method) => method.includes('TT/DA') || method.includes('DA/TT'));
    const hasTT = paymentMethods.some((method) => method === 'TT' || (method.includes('TT') && !method.includes('DA')));
    const hasDA = paymentMethods.some((method) => method === 'DA' || (method.includes('DA') && !method.includes('TT')));
    const hasTTAndDASeparate = hasTT && hasDA && !hasTTDAAsOne;

    // qty는 컨테이너 수량 또는 베일 수량
    const qty = containerCount || schedule?.qty || 0;

    // 1. LC가 있으면 우선 적용
    if (hasLC) {
      if (qty) {
        calculatedBankFee = 300000 * qty;
      }
    }
    // 2. TT/DA가 하나의 결제조건으로 있거나, TT와 DA가 각각 별도로 있으면 TT/DA로 처리 (30,000)
    else if (hasTTDAAsOne || hasTTAndDASeparate) {
      calculatedBankFee = 30000;
    }
    // 3. DA만 있는 경우 (30,000)
    else if (hasDA) {
      calculatedBankFee = 30000;
    }
    // 4. TT만 있는 경우 (20,000)
    else if (hasTT) {
      calculatedBankFee = 20000;
    }

    setValue('bankFee', calculatedBankFee);
  }, [tradeOrder?.payments, schedule?.payments, containerCount, schedule?.qty, setValue, currentBankFee]);

  // drawer가 열릴 때 폼 리셋
  React.useEffect(() => {
    if (open && tradeOrder?.pendingInbound) {
      // TradeOrder의 pendingInbound 데이터 사용
      const pending = tradeOrder.pendingInbound;
      
      // 자동 계산을 위한 값들
      const qty = containerCount || 0;
      const hasFumigationCalc = (tradeOrder?.fumigation === 'Y');
      const hasSpotCalc = (tradeOrder?.spot === 'Y');
      const hasCustomsDutyCalc = (tradeOrder?.customsDuty === 'Y');
      const hasQuotaCalc = (tradeOrder?.quota === 'Y');
      
      // 은행 수수료 계산
      const payments = tradeOrder?.payments ?? [];
      const paymentMethods = payments
        .map((payment: any) => payment.method)
        .filter((method): method is string => method !== null && method !== undefined && method.trim() !== '')
        .map((method) => method.toUpperCase().trim());
      
      const hasLC = paymentMethods.some((method) => method.includes('LC'));
      const hasTTDAAsOne = paymentMethods.some((method) => method.includes('TT/DA') || method.includes('DA/TT'));
      const hasTT = paymentMethods.some((method) => method === 'TT' || (method.includes('TT') && !method.includes('DA')));
      const hasDA = paymentMethods.some((method) => method === 'DA' || (method.includes('DA') && !method.includes('TT')));
      const hasTTAndDASeparate = hasTT && hasDA && !hasTTDAAsOne;
      
      let calculatedBankFee = 0;
      if (hasLC && qty) {
        calculatedBankFee = 300000 * qty;
      } else if (hasTTDAAsOne || hasTTAndDASeparate) {
        calculatedBankFee = 30000;
      } else if (hasDA) {
        calculatedBankFee = 30000;
      } else if (hasTT) {
        calculatedBankFee = 20000;
      }
      
      // DO 비용 자동 계산
      const calculatedDoCost = totalWeight > 0 ? Math.round(totalWeight / 22) * 290000 : undefined;
      
      reset({
        warehouse: pending.warehouse || undefined,
        igodate: pending.igodate || undefined,
        quarantineDate: pending.quarantineDate || undefined,
        dtDate: pending.dtDate || undefined,
        customsFee: pending.customsFee ?? undefined,
        firstTierLoadingFee: pending.firstTierLoadingFee ?? undefined,
        // 기존 값이 있으면 사용, 없으면 자동 계산
        doCost: pending.doCost ?? calculatedDoCost,
        quarantineAgencyFee: pending.quarantineAgencyFee ?? undefined,
        // 기존 값이 있으면 사용, 없으면 자동 계산
        customsDuty: pending.customsDuty ?? (hasCustomsDutyCalc && qty ? 300000 * qty : undefined),
        additionalItem: pending.additionalItem ?? undefined,
        bankFee: pending.bankFee ?? (calculatedBankFee || undefined),
        quarantineWorkCost: pending.quarantineWorkCost ?? undefined,
        // 기존 값이 있으면 사용, 없으면 자동 계산
        spot: pending.spot ?? (hasSpotCalc ? 240000 : undefined),
        document: pending.document ?? undefined,
        igobi: pending.igobi ?? undefined,
        extractionFee: pending.extractionFee ?? undefined,
        sto: pending.sto ?? undefined,
        // 기존 값이 있으면 사용, 없으면 자동 계산
        fumigationQuarantine: pending.fumigationQuarantine ?? (hasFumigationCalc && qty ? 130000 * qty : 0),
        fee: pending.fee ?? undefined,
        sampleCollection: pending.sampleCollection ?? undefined,
        // 기존 값이 있으면 사용, 없으면 자동 계산
        quotaCost: pending.quotaCost ?? (hasQuotaCalc ? 5 : undefined),
        comparisonExchangeRate:
          pending.comparisonExchangeRate ?? defaultExchangeRate,
        status: 'PENDING',
      });
      const cr = pending.comparisonExchangeRate ?? defaultExchangeRate;
      setComparisonExchangeRateInput(cr != null ? formatNumberWithOptionalDecimals(cr) : '');
    } else if (open && schedule) {
      const payments = schedule.payments ?? [];
      const paymentMethods = payments
        .map((payment: SchedulePayment) => payment.method)
        .filter((method): method is string => method !== null && method !== undefined && method.trim() !== '')
        .map((method) => method.toUpperCase().trim());

      let calculatedBankFee = 0;

      // 결제조건이 있는지 확인
      const hasLC = paymentMethods.some((method) => method.includes('LC'));
      const hasTTDAAsOne = paymentMethods.some((method) => method.includes('TT/DA') || method.includes('DA/TT'));
      const hasTT = paymentMethods.some((method) => method === 'TT' || (method.includes('TT') && !method.includes('DA')));
      const hasDA = paymentMethods.some((method) => method === 'DA' || (method.includes('DA') && !method.includes('TT')));
      const hasTTAndDASeparate = hasTT && hasDA && !hasTTDAAsOne;

      // 1. LC가 있으면 우선 적용
      if (hasLC) {
        if (schedule.qty) {
          calculatedBankFee = 300000 * schedule.qty;
        }
      }
      // 2. TT/DA가 하나의 결제조건으로 있거나, TT와 DA가 각각 별도로 있으면 TT/DA로 처리 (30,000)
      else if (hasTTDAAsOne || hasTTAndDASeparate) {
        calculatedBankFee = 30000;
      }
      // 3. DA만 있는 경우 (30,000)
      else if (hasDA) {
        calculatedBankFee = 30000;
      }
      // 4. TT만 있는 경우 (20,000)
      else if (hasTT) {
        calculatedBankFee = 20000;
      }

      // DO 비용 자동 계산
      const calculatedDoCost = totalWeight > 0 ? Math.round(totalWeight / 22) * 290000 : undefined;

      reset({
        // 기존 입고 데이터가 있으면 사용, 없으면 자동 계산
        doCost: schedule.inboundDoCost ?? calculatedDoCost, // D/O비용 (자동 계산: 반올림(총중량/22)*290000)
        customsFee: schedule.inboundCustomsFee ?? 50000, // 통관 수수료
        quarantineAgencyFee: schedule.inboundQuarantineAgencyFee ?? 50000, // 검역대행료
        // 기존 입고 데이터가 있으면 사용, 없으면 자동 계산 또는 기본값
        customsDuty: schedule.inboundCustomsDuty ?? (schedule.customsDuty === 'Y' && schedule.qty ? 300000 * schedule.qty : null),
        additionalItem: schedule.inboundAdditionalItem ?? null,
        fumigationQuarantine: schedule.inboundFumigationQuarantine ?? (schedule.fumigation === 'Y' && schedule.qty ? 130000 * schedule.qty : 0),
        spot: schedule.inboundSpot ?? (schedule.spot === 'Y' ? 240000 : null),
        document: schedule.inboundDocument ?? undefined,
        igobi: schedule.inboundIgobi ?? undefined,
        extractionFee: schedule.inboundExtractionFee ?? undefined,
        sto: schedule.inboundSto ?? undefined,
        firstTierLoadingFee: schedule.inboundFirstTierLoadingFee ?? undefined,
        fee: schedule.inboundFee ?? undefined,
        sampleCollection: schedule.inboundSampleCollection ?? undefined,
        bankFee: schedule.inboundBankFee ?? calculatedBankFee, // 은행수수료는 자동 계산 우선
        quarantineWorkCost: schedule.inboundQuarantineWorkCost ?? undefined,
        dayExchangeRate: schedule.inboundDayExchangeRate ?? undefined,
        quotaCost: schedule.inboundQuotaCost ?? (schedule.quota === 'Y' ? 5 : undefined),
        warehouse: schedule.inboundWarehouse ?? undefined,
        igodate: schedule.inboundIgodate ?? undefined,
        quarantineDate: schedule.inboundQuarantineDate ?? undefined,
        dtDate: schedule.inboundDtDate ?? undefined,
        comparisonExchangeRate:
          schedule.inboundComparisonExchangeRate ?? defaultExchangeRate,
        status: (schedule.status as 'PENDING' | 'CONFIRMED') || 'PENDING',
      });
      const cr =
        schedule.inboundComparisonExchangeRate ?? defaultExchangeRate;
      setComparisonExchangeRateInput(cr != null ? formatNumberWithOptionalDecimals(cr) : '');
    } else if (open && tradeOrder && !tradeOrder.pendingInbound) {
      // TradeOrder는 있으나 pendingInbound가 없는 경우 (새로 추가) - 기본값으로 리셋
      const qty = containerCount || 0;
      const hasFumigationCalc = (tradeOrder?.fumigation === 'Y');
      const hasSpotCalc = (tradeOrder?.spot === 'Y');
      const hasCustomsDutyCalc = (tradeOrder?.customsDuty === 'Y');
      const hasQuotaCalc = (tradeOrder?.quota === 'Y');

      const payments = tradeOrder?.payments ?? [];
      const paymentMethods = payments
        .map((payment) => payment.method)
        .filter((method): method is string => method != null && String(method).trim() !== '')
        .map((method) => String(method).toUpperCase().trim());

      const hasLC = paymentMethods.some((method) => method.includes('LC'));
      const hasTTDAAsOne = paymentMethods.some((method) => method.includes('TT/DA') || method.includes('DA/TT'));
      const hasTT = paymentMethods.some((method) => method === 'TT' || (method.includes('TT') && !method.includes('DA')));
      const hasDA = paymentMethods.some((method) => method === 'DA' || (method.includes('DA') && !method.includes('TT')));
      const hasTTAndDASeparate = hasTT && hasDA && !hasTTDAAsOne;

      let calculatedBankFee = 0;
      if (hasLC && qty) {
        calculatedBankFee = 300000 * qty;
      } else if (hasTTDAAsOne || hasTTAndDASeparate) {
        calculatedBankFee = 30000;
      } else if (hasDA) {
        calculatedBankFee = 30000;
      } else if (hasTT) {
        calculatedBankFee = 20000;
      }

      const calculatedDoCost = totalWeight > 0 ? Math.round(totalWeight / 22) * 290000 : undefined;

      reset({
        warehouse: undefined,
        igodate: undefined,
        quarantineDate: undefined,
        dtDate: undefined,
        customsFee: 55000,
        firstTierLoadingFee: undefined,
        doCost: calculatedDoCost,
        quarantineAgencyFee: 55000,
        customsDuty: hasCustomsDutyCalc && qty ? 300000 * qty : undefined,
        additionalItem: undefined,
        bankFee: calculatedBankFee || undefined,
        quarantineWorkCost: undefined,
        spot: hasSpotCalc ? 240000 : undefined,
        document: undefined,
        igobi: undefined,
        extractionFee: undefined,
        sto: undefined,
        fumigationQuarantine: hasFumigationCalc && qty ? 130000 * qty : 0,
        fee: undefined,
        sampleCollection: undefined,
        quotaCost: hasQuotaCalc ? 5 : undefined,
        comparisonExchangeRate: defaultExchangeRate,
        status: 'PENDING',
      });
      setComparisonExchangeRateInput(
        formatNumberWithOptionalDecimals(defaultExchangeRate),
      );
    } else if (!open) {
      // drawer 닫힐 때 폼 초기화 (다음 열 때 이전 데이터 잔존 방지)
      reset({
        doCost: undefined,
        customsFee: 55000,
        quarantineAgencyFee: 55000,
        customsDuty: undefined,
        additionalItem: undefined,
        fumigationQuarantine: 0,
        spot: undefined,
        document: undefined,
        igobi: undefined,
        extractionFee: undefined,
        sto: undefined,
        firstTierLoadingFee: undefined,
        fee: undefined,
        sampleCollection: undefined,
        bankFee: undefined,
        quarantineWorkCost: undefined,
        dayExchangeRate: undefined,
        quotaCost: undefined,
        warehouse: undefined,
        igodate: undefined,
        quarantineDate: undefined,
        dtDate: undefined,
        comparisonExchangeRate: defaultExchangeRate,
        status: 'PENDING',
        containerPendingPurchaseCosts: [],
      });
    }
  }, [
    open,
    tradeOrder,
    schedule,
    reset,
    containerCount,
    totalWeight,
    defaultExchangeRate,
  ]);

  // drawer가 닫힐 때 입력 상태 초기화
  React.useEffect(() => {
    if (!open) {
      setComparisonExchangeRateInput('');
      setDayExchangeRateInput('');
    }
  }, [open]);

  // 소수점을 허용하는 숫자 포맷팅 함수 (환율용)
  const formatNumberWithOptionalDecimals = (value: string | number | undefined, rawInput?: string): string => {
    // 입력 중일 때는 원본 값을 유지
    if (rawInput !== undefined && rawInput !== '') {
      return rawInput;
    }
    if (value === undefined || value === null || value === '') return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return '';
    // 소수점이 있으면 최대 4자리까지, 없으면 정수로 표시
    const hasDecimal = num % 1 !== 0;
    if (hasDecimal) {
      return num.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
    }
    return num.toLocaleString('ko-KR');
  };

  // 판매환율 입력 상태 관리
  const [comparisonExchangeRateInput, setComparisonExchangeRateInput] = React.useState<string>('');

  // ETA 환율 입력 상태 관리
  const [dayExchangeRateInput, setDayExchangeRateInput] = React.useState<string>('');

  // 모든 필드 값 실시간 감시
  const doCostValue = watch('doCost') ?? undefined;
  const customsFeeValue = watch('customsFee') ?? undefined;
  const quarantineAgencyFeeValue = watch('quarantineAgencyFee') ?? undefined;
  const customsDutyValue = watch('customsDuty') ?? undefined;
  const additionalItemValue = watch('additionalItem') ?? undefined;
  const fumigationQuarantineValue = watch('fumigationQuarantine') ?? undefined;
  const spotValue = watch('spot') ?? undefined;
  const documentValue = watch('document') ?? undefined;
  const igobiValue = watch('igobi') ?? undefined;
  const extractionFeeValue = watch('extractionFee') ?? undefined;
  const stoValue = watch('sto') ?? undefined;
  const firstTierLoadingFeeValue = watch('firstTierLoadingFee') ?? undefined;
  const feeValue = watch('fee') ?? undefined;
  const sampleCollectionValue = watch('sampleCollection') ?? undefined;
  const bankFeeValue = watch('bankFee') ?? undefined;
  const quarantineWorkCostValue = watch('quarantineWorkCost') ?? undefined;
  const dayExchangeRateValue = watch('dayExchangeRate') ?? undefined;
  const quotaCostValue = watch('quotaCost') ?? undefined;
  const warehouseValue = watch('warehouse') ?? undefined;
  const igodateValue = watch('igodate') ?? undefined;
  const quarantineDateValue = watch('quarantineDate') ?? undefined;
  const dtDateValue = watch('dtDate') ?? undefined;
  const comparisonExchangeRateValue = watch('comparisonExchangeRate') ?? undefined;
  // 단가: TradeOrder가 있으면 첫 번째 컨테이너의 unitPrice 사용, 없으면 tradeOrder의 unitPrice 사용
  const unitPriceValue = React.useMemo(() => {
    if (tradeOrder?.containers && tradeOrder.containers.length > 0) {
      // 첫 번째 컨테이너의 unitPrice 사용
      return tradeOrder.containers[0]?.unitPrice ?? tradeOrder?.unitPrice ?? 0;
    }
    return tradeOrder?.unitPrice ?? 0;
  }, [tradeOrder]);

  // 창고 목록 로드 (창고 관리 테이블에서 가져오기)
  const { data: warehouses = [] } = useWarehouses({ status: true });

  // ETA 날짜를 기준으로 환율 조회 (모든 hooks는 early return 전에 호출되어야 함)
  // TradeOrder가 있으면 tradeOrder.etaDate 사용, 없으면 schedule.eta 사용
  const etaDateSource = tradeOrder?.etaDate || schedule?.eta;
  const etaDate = etaDateSource 
    ? (typeof etaDateSource === 'string' && etaDateSource.includes('T') 
        ? parseISO(etaDateSource) 
        : new Date(etaDateSource))
    : null;
  const etaDateString = etaDate ? format(etaDate, 'yyyy-MM-dd') : null;
  
  // 통화 코드 (schedule에서 가져오거나 기본값 USD)
  const currencyCode = schedule?.currencyUnit || schedule?.currencyName || 'USD';
  const normalizedCurrencyCode = currencyCode
    ? currencyCode.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3) || 'USD'
    : 'USD';

  // 결제 정보에서 가중 평균 환율 계산
  const weightedAverageExchangeRate = React.useMemo(() => {
    const payments = tradeOrder?.payments ?? schedule?.payments ?? [];
    
    if (!payments || payments.length === 0) {
      return null;
    }
    
    // ratio와 exchangeRate가 모두 있는 결제만 사용
    const validPayments = payments.filter(
      (payment: any) => 
        payment.ratio != null && 
        payment.ratio !== undefined && 
        payment.exchangeRate != null && 
        payment.exchangeRate !== undefined &&
        payment.ratio > 0 &&
        payment.exchangeRate > 0
    );
    
    if (validPayments.length === 0) {
      return null;
    }
    
    // 가중 평균 환율 계산: Σ(ratio × exchangeRate) / Σ(ratio)
    const totalWeightedRate = validPayments.reduce((sum, payment: any) => {
      return sum + (Number(payment.ratio) * Number(payment.exchangeRate));
    }, 0);
    
    const totalRatio = validPayments.reduce((sum, payment: any) => {
      return sum + Number(payment.ratio);
    }, 0);
    
    if (totalRatio === 0) {
      return null;
    }
    
    return totalWeightedRate / totalRatio;
  }, [tradeOrder?.payments, schedule?.payments]);

  // 환율 조회 (버튼 클릭 시에만 조회)
  const {
    data: exchangeRateData,
    isLoading: isExchangeRateLoading,
    refetch: refetchExchangeRate,
  } = useQuery({
    queryKey: ['exchange-rate', etaDateString, normalizedCurrencyCode],
    queryFn: async () => {
      if (!etaDateString || !normalizedCurrencyCode) return null;
      try {
        const response = await api.get<{ date: string; currency: string; rate: number | null }>('/cost/exchange-rate', {
          params: {
            date: etaDateString,
            currency: normalizedCurrencyCode,
          },
        });
        return response.data;
      } catch (error) {
        console.error('환율 조회 오류:', error);
        return null;
      }
    },
    enabled: false, // 자동 조회 비활성화, 버튼 클릭 시에만 조회
  });

  const exchangeRate = exchangeRateData?.rate ?? null;
  // 적용환율 계산: 결제 정보의 가중 평균 환율 우선 사용, 없으면 기존 로직 사용
  const appliedExchangeRateValue = React.useMemo(() => {
    // 결제 정보의 가중 평균 환율이 있으면 우선 사용
    if (weightedAverageExchangeRate !== null && weightedAverageExchangeRate !== undefined) {
      return weightedAverageExchangeRate;
    }
    // 가중 평균 환율이 없으면 기존 로직 사용 (ETA 환율 + 10)
    if (dayExchangeRateValue !== undefined && dayExchangeRateValue !== null) {
      return dayExchangeRateValue + 10;
    }
    // dayExchangeRate가 없으면 comparisonExchangeRate를 직접 사용
    if (comparisonExchangeRateValue !== undefined && comparisonExchangeRateValue !== null) {
      return comparisonExchangeRateValue;
    }
    return null;
  }, [weightedAverageExchangeRate, dayExchangeRateValue, comparisonExchangeRateValue]);

  // 창고 선택 시 이고비 자동 계산
  const calculateWarehouseIgobiMutation = useCalculateWarehouseIgobi();
  const currentIgobiValue = watch('igobi');
  
  // 창고와 ETA 날짜가 모두 있을 때 이고비 조회
  React.useEffect(() => {
    // 창고가 선택되지 않았거나 ETA 날짜가 없으면 이고비 초기화
    if (!warehouseValue || warehouseValue === '__none__' || !etaDateString) {
      // 현재 값이 이미 undefined가 아니면 초기화
      if (currentIgobiValue !== undefined && currentIgobiValue !== null) {
        setValue('igobi', undefined, { shouldDirty: true });
      }
      return;
    }

    // 창고 이름으로 찾기 (기존 데이터 호환성을 위해 이름 저장)
    const warehouseName = warehouses.find(
      (wh) => wh.name === warehouseValue || wh.id.toString() === warehouseValue
    )?.name || warehouseValue;

    // 이미 조회 중이면 중복 호출 방지
    if (calculateWarehouseIgobiMutation.isPending) {
      return;
    }

    calculateWarehouseIgobiMutation.mutate(
      {
        warehouseCode: warehouseName, // 창고 이름을 그대로 전달 (백엔드에서 이름으로 조회)
        targetDate: etaDateString,
      },
      {
        onSuccess: (data) => {
          if (data.igobi !== null && data.igobi !== undefined) {
            // 값이 실제로 변경되었을 때만 setValue 호출
            if (currentIgobiValue !== data.igobi) {
              setValue('igobi', data.igobi, { shouldDirty: true });
            }
          } else {
            // 값이 이미 undefined가 아니면 초기화
            if (currentIgobiValue !== undefined && currentIgobiValue !== null) {
              setValue('igobi', undefined, { shouldDirty: true });
            }
          }
        },
        onError: (error) => {
          console.error('이고비 조회 오류:', error);
          // 에러 발생 시에만 초기화 (값이 있을 때만)
          if (currentIgobiValue !== undefined && currentIgobiValue !== null) {
            setValue('igobi', undefined, { shouldDirty: true });
          }
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseValue, etaDateString]);

  // 구매원가 계산: 나중에 구현 예정 (현재는 계산하지 않음)
  // 최종원가는 입고 확정 시점에 계산됩니다.

  // 컨테이너별 예정원가 상태 관리
  const [containerPendingPurchaseCosts, setContainerPendingPurchaseCosts] = React.useState<Record<string, number | null>>({});

  // 컨테이너별 예정원가 자동 계산
  const calculatedContainerCosts = React.useMemo(() => {
    if (!tradeOrder?.containers || tradeOrder.containers.length === 0) {
      return {};
    }

    // 예정원가 계산용 환율: 판매환율 사용
    const comparisonRate = comparisonExchangeRateValue ?? 0;
    
    // 전체 비용 합계 계산
    const qty = containerCount;
    const customsFee = customsFeeValue ?? 0;
    const firstTierLoadingFee = firstTierLoadingFeeValue ?? 0;
    const doCost = doCostValue ?? 0;
    const quarantineAgencyFee = quarantineAgencyFeeValue ?? 0;
    const customsDuty = customsDutyValue ?? 0;
    const additionalItem = additionalItemValue ?? 0;
    const bankFee = bankFeeValue ?? 0;
    const quarantineWorkCost = quarantineWorkCostValue ?? 0;
    const spot = spotValue ?? 0;
    const document = documentValue ?? 0;
    const igobi = (igobiValue ?? 0) * qty;
    const extractionFee = extractionFeeValue ?? 0;
    const sto = stoValue ?? 0;
    const fumigationQuarantine = fumigationQuarantineValue ?? 0;
    const fee = feeValue ?? 0;
    const sampleCollection = sampleCollectionValue ?? 0;
    const totalCosts = customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + igobi + extractionFee + sto + fumigationQuarantine + fee + sampleCollection;
    
    // 쿼터 비용 (kg당)
    const quotaCostPerKg = quotaCostValue ?? 0;

    // 각 컨테이너별 예정원가 계산
    const costs: Record<string, number> = {};
    tradeOrder.containers.forEach((container) => {
      const containerUnitPrice = container.unitPrice ? Number(container.unitPrice) : (unitPriceValue ?? 0);
      
      // 첫 번째 부분: 비교용환율 × 컨테이너 단가(톤당) / 1000
      const firstPartPerKg = (comparisonRate * containerUnitPrice) / 1000;
      
      // 두 번째 부분: 전체 비용 합계 / 전체 중량 / 1000
      const secondPartPerKg = totalWeight > 0 ? totalCosts / totalWeight / 1000 : 0;
      
      // 최종 원가 (kg당)
      const purchaseCostPerKg = firstPartPerKg + secondPartPerKg + quotaCostPerKg;
      
      if (container.id) {
        costs[String(container.id)] = purchaseCostPerKg;
      }
    });

    return costs;
  }, [
    tradeOrder?.containers,
    comparisonExchangeRateValue,
    unitPriceValue,
    containerCount,
    totalWeight,
    customsFeeValue,
    firstTierLoadingFeeValue,
    doCostValue,
    quarantineAgencyFeeValue,
    customsDutyValue,
    additionalItemValue,
    bankFeeValue,
    quarantineWorkCostValue,
    spotValue,
    documentValue,
    igobiValue,
    extractionFeeValue,
    stoValue,
    fumigationQuarantineValue,
    feeValue,
    sampleCollectionValue,
    quotaCostValue,
  ]);

  // 주문 단위 예정 원가(kg당) - 예정 환율 옆 표시용
  const displayExpectedPurchaseCost = React.useMemo(() => {
    const comparisonRate = comparisonExchangeRateValue ?? 0;
    const unitPriceVal = tradeOrder?.containers?.[0]?.unitPrice ?? tradeOrder?.unitPrice ?? 0;
    const firstPart = totalWeight > 0 ? (comparisonRate * Number(unitPriceVal)) / 1000 : 0;
    const qty = containerCount || 1;
    const costSum =
      (customsFeeValue ?? 0) +
      (firstTierLoadingFeeValue ?? 0) +
      (doCostValue ?? 0) +
      (quarantineAgencyFeeValue ?? 0) +
      (customsDutyValue ?? 0) +
      (additionalItemValue ?? 0) +
      (bankFeeValue ?? 0) +
      (quarantineWorkCostValue ?? 0) +
      (spotValue ?? 0) +
      (documentValue ?? 0) +
      (igobiValue ?? 0) * qty +
      (extractionFeeValue ?? 0) +
      (stoValue ?? 0) +
      (fumigationQuarantineValue ?? 0) +
      (feeValue ?? 0) +
      (sampleCollectionValue ?? 0);
    const secondPart = totalWeight > 0 ? costSum / totalWeight / 1000 : 0;
    const quotaCostPerKg = quotaCostValue ?? 0;
    const targetMargin = 0;
    const value = firstPart + secondPart + quotaCostPerKg + targetMargin;
    return Number.isFinite(value) ? value : null;
  }, [
    comparisonExchangeRateValue,
    tradeOrder?.containers,
    tradeOrder?.unitPrice,
    totalWeight,
    containerCount,
    customsFeeValue,
    firstTierLoadingFeeValue,
    doCostValue,
    quarantineAgencyFeeValue,
    customsDutyValue,
    additionalItemValue,
    bankFeeValue,
    quarantineWorkCostValue,
    spotValue,
    documentValue,
    igobiValue,
    extractionFeeValue,
    stoValue,
    fumigationQuarantineValue,
    feeValue,
    sampleCollectionValue,
    quotaCostValue,
  ]);

  // 수동 입력 여부 추적
  const [manuallyEditedContainers, setManuallyEditedContainers] = React.useState<Set<string>>(new Set());

  // 컨테이너 예정원가 초기화 (저장된 값이 있을 때) - drawer가 열릴 때 한 번만 실행
  const hasInitialized = React.useRef(false);
  React.useEffect(() => {
    if (tradeOrder?.containers && open && !hasInitialized.current) {
      setContainerPendingPurchaseCosts((prev) => {
        const updated: Record<string, number | null> = {};
        // 저장된 값이 있어도 자동 업데이트가 되도록 수동 입력으로 간주하지 않음
        if (!tradeOrder?.containers) return prev;
        tradeOrder.containers.forEach((container) => {
          if (!container.id) return; // id가 없으면 스킵
          const containerId = String(container.id);
          // 저장된 값이 있으면 우선 사용, 없으면 계산된 값 사용
          if (container.pendingPurchaseCost) {
            updated[containerId] = Number(container.pendingPurchaseCost);
          } else {
            // 저장된 값이 없으면 계산된 값 사용 (아직 계산되지 않았을 수 있음)
            updated[containerId] = calculatedContainerCosts[containerId] ?? null;
          }
        });
        hasInitialized.current = true;
        return updated;
      });
    } else if (!open) {
      // drawer가 닫히면 초기화 플래그 리셋
      hasInitialized.current = false;
      setContainerPendingPurchaseCosts({});
      setManuallyEditedContainers(new Set());
    }
  }, [tradeOrder?.containers, open, calculatedContainerCosts]);

  // 입력 필드 변경 시 계산된 값으로 자동 업데이트 (수동 입력이 아닌 경우만)
  React.useEffect(() => {
    if (tradeOrder?.containers && open) {
      setContainerPendingPurchaseCosts((prev) => {
        const updated: Record<string, number | null> = {};
        let hasChanges = false;
        if (!tradeOrder?.containers) return prev;
        tradeOrder.containers.forEach((container) => {
          if (!container.id) return; // id가 없으면 스킵
          const containerId = String(container.id);
          const calculatedValue = calculatedContainerCosts[containerId];
          
          // 수동으로 입력한 컨테이너는 유지
          if (manuallyEditedContainers.has(containerId)) {
            updated[containerId] = prev[containerId] ?? calculatedValue ?? null;
          }
          // 계산된 값이 있으면 사용
          else if (calculatedValue !== undefined && calculatedValue !== null) {
            updated[containerId] = calculatedValue;
            if (prev[containerId] !== calculatedValue) {
              hasChanges = true;
            }
          } else {
            updated[containerId] = prev[containerId] ?? null;
          }
        });
        // 변경사항이 있을 때만 업데이트
        if (hasChanges) {
          return updated;
        }
        return prev;
      });
    }
  }, [calculatedContainerCosts, tradeOrder?.containers, open, manuallyEditedContainers]);

  const internalSubmit = async (data: InboundFormData) => {
    if (onSubmit) {
      // 예정 원가(kg당) 계산: 입고 예정 목록/상세 표시용
      const comparisonRate = data.comparisonExchangeRate ?? 0;
      const unitPriceVal = tradeOrder?.containers?.[0]?.unitPrice ?? tradeOrder?.unitPrice ?? 0;
      const firstPart = totalWeight > 0 ? (comparisonRate * Number(unitPriceVal)) / 1000 : 0;
      const qty = containerCount || 1;
      const costSum =
        (data.customsFee ?? 0) +
        (data.firstTierLoadingFee ?? 0) +
        (data.doCost ?? 0) +
        (data.quarantineAgencyFee ?? 0) +
        (data.customsDuty ?? 0) +
        (data.additionalItem ?? 0) +
        (data.bankFee ?? 0) +
        (data.quarantineWorkCost ?? 0) +
        (data.spot ?? 0) +
        (data.document ?? 0) +
        (data.igobi ?? 0) * qty +
        (data.extractionFee ?? 0) +
        (data.sto ?? 0) +
        (data.fumigationQuarantine ?? 0) +
        (data.fee ?? 0) +
        (data.sampleCollection ?? 0);
      const secondPart = totalWeight > 0 ? costSum / totalWeight / 1000 : 0;
      const quotaCostPerKg = data.quotaCost ?? 0;
      const targetMargin = 0;
      const comparisonPurchaseCost = firstPart + secondPart + quotaCostPerKg + targetMargin;

      // 모든 필드를 명시적으로 포함 (undefined를 null로 변환하여 백엔드에서 업데이트되도록 함)
      // 백엔드는 undefined를 받으면 업데이트하지 않으므로, null로 변환하여 명시적으로 전송
      const submitData: Record<string, unknown> = {
        doCost: data.doCost !== undefined ? (data.doCost ?? null) : null,
        customsFee: data.customsFee !== undefined ? (data.customsFee ?? null) : null,
        quarantineAgencyFee: data.quarantineAgencyFee !== undefined ? (data.quarantineAgencyFee ?? null) : null,
        fumigationQuarantine: data.fumigationQuarantine !== undefined ? (data.fumigationQuarantine ?? null) : null,
        additionalItem: data.additionalItem !== undefined ? (data.additionalItem ?? null) : null,
        document: data.document !== undefined ? (data.document ?? null) : null,
        igobi: data.igobi !== undefined ? (data.igobi ?? null) : null,
        extractionFee: data.extractionFee !== undefined ? (data.extractionFee ?? null) : null,
        sto: data.sto !== undefined ? (data.sto ?? null) : null,
        firstTierLoadingFee: data.firstTierLoadingFee !== undefined ? (data.firstTierLoadingFee ?? null) : null,
        fee: data.fee !== undefined ? (data.fee ?? null) : null,
        sampleCollection: data.sampleCollection !== undefined ? (data.sampleCollection ?? null) : null,
        bankFee: data.bankFee !== undefined ? (data.bankFee ?? null) : null,
        quarantineWorkCost: data.quarantineWorkCost !== undefined ? (data.quarantineWorkCost ?? null) : null,
        quotaCost: data.quotaCost !== undefined ? (data.quotaCost ?? null) : null,
        warehouse: data.warehouse !== undefined ? (data.warehouse ?? null) : null,
        igodate: data.igodate !== undefined ? (data.igodate ?? null) : null,
        quarantineDate: data.quarantineDate !== undefined ? (data.quarantineDate ?? null) : null,
        dtDate: data.dtDate !== undefined ? (data.dtDate ?? null) : null,
        dayExchangeRate: data.dayExchangeRate !== undefined ? (data.dayExchangeRate ?? null) : null,
        comparisonExchangeRate: data.comparisonExchangeRate !== undefined ? (data.comparisonExchangeRate ?? null) : null,
        comparisonPurchaseCost: Number.isFinite(comparisonPurchaseCost) ? comparisonPurchaseCost : null,
        appliedExchangeRate: appliedExchangeRateValue !== undefined && appliedExchangeRateValue !== null ? appliedExchangeRateValue : null,
        containerPendingPurchaseCosts: tradeOrder?.containers && tradeOrder.containers.length > 0
          ? (() => {
              const costs = tradeOrder.containers
                .filter((container) => container.id) // id가 있는 컨테이너만 필터링
                .map((container) => ({
                  containerId: String(container.id!), // 문자열로 변환
                  pendingPurchaseCost: containerPendingPurchaseCosts[container.id!] !== undefined 
                    ? containerPendingPurchaseCosts[container.id!] 
                    : null,
                }));
              return costs.length > 0 ? costs : undefined;
            })()
          : undefined,
        customsDuty: data.customsDuty !== undefined ? (data.customsDuty ?? null) : null,
        spot: data.spot !== undefined ? (data.spot ?? null) : null,
        status: mode,
      };
      await onSubmit(submitData as InboundFormData);
    }
  };

  // 텍스트 선택을 위한 핸들러 (early return 전에 정의해야 함)
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

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!tradeOrder && !schedule) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: isMobile ? '100%' : '900px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
              <DrawerTitle>입고 예정 데이터 편집</DrawerTitle>
        </DrawerHeader>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-muted-foreground">데이터를 선택하면 편집할 수 있습니다.</p>
        </div>
      </DrawerContent>
    </Drawer>
    );
  }

  const resolveCodeValue = (resolver?: (code?: string | null) => string, code?: string | null) => {
    if (resolver) {
      const label = resolver(code);
      if (label && label.trim()) {
        return label;
      }
    } else if (code && code.trim()) {
      return code;
    }
    return '-';
  };

  // payments는 TradeOrder 또는 schedule에서 가져오기
  const payments = tradeOrder?.payments ?? schedule?.payments ?? [];
  const paymentMethods = payments
    .map((payment: SchedulePayment | { method?: string | null }) => payment.method)
    .filter((method): method is string => method !== null && method !== undefined && method.trim() !== '');

  const paymentMethodsUpper = paymentMethods.map((method) => method.toUpperCase().trim());
  const hasLC = paymentMethodsUpper.some((method) => method.includes('LC'));
  const hasTTDAAsOne = paymentMethodsUpper.some((method) => method.includes('TT/DA') || method.includes('DA/TT'));
  const hasTTOnly = paymentMethodsUpper.some((method) => method === 'TT' || (method.includes('TT') && !method.includes('DA')));
  const hasDAOnly = paymentMethodsUpper.some((method) => method === 'DA' || (method.includes('DA') && !method.includes('TT')));
  const hasTTAndDASeparate = hasTTOnly && hasDAOnly && !hasTTDAAsOne;
  const hasTTDA = hasTTDAAsOne || hasTTAndDASeparate;
  const shouldAutoCalculateBankFee = hasLC || hasTTDA || hasDAOnly || hasTTOnly;

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
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>
                {(tradeOrder?.pendingInbound || schedule?.pendingInbound)
                  ? '입고 예정 데이터 수정'
                  : '입고 예정 데이터 추가'}
              </DrawerTitle>
              <DrawerDescription>
                {(tradeOrder?.pendingInbound || schedule?.pendingInbound)
                  ? '입고 예정 정보를 수정할 수 있습니다.'
                  : '입고 예정 정보를 입력할 수 있습니다.'}
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

        <ScrollArea 
          className="flex-1" 
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          onDoubleClick={handleDoubleClick}
        >
          <div className="p-6 space-y-6">
            {/* 현재 데이터 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">현재 데이터</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <InfoRow 
                    label="수출사" 
                    value={tradeOrder?.exporterName || schedule?.exporter || '-'} 
                  />
                  <InfoRow 
                    label="수출국" 
                    value={tradeOrder?.exportCountryName || schedule?.exportCountry || '-'} 
                  />
                  <InfoRow 
                    label="쿼터 유무" 
                    value={tradeOrder?.quota === 'Y' || schedule?.quota === 'Y' ? '있음' : (tradeOrder?.quota === 'N' || schedule?.quota === 'N' ? '없음' : '-')} 
                  />
                  <InfoRow 
                    label="훈증 유무" 
                    value={tradeOrder?.fumigation === 'Y' || schedule?.fumigation === 'Y' ? '있음' : (tradeOrder?.fumigation === 'N' || schedule?.fumigation === 'N' ? '없음' : '-')} 
                  />
                  <InfoRow 
                    label="현물 유무" 
                    value={tradeOrder?.spot === 'Y' || schedule?.spot === 'Y' ? '있음' : (tradeOrder?.spot === 'N' || schedule?.spot === 'N' ? '없음' : '-')} 
                  />
                  <InfoRow 
                    label="관세 유무" 
                    value={tradeOrder?.customsDuty === 'Y' || schedule?.customsDuty === 'Y' ? '있음' : (tradeOrder?.customsDuty === 'N' || schedule?.customsDuty === 'N' ? '없음' : '-')} 
                  />
                  <InfoRow 
                    label="상품" 
                    value={tradeOrder?.containers?.[0]?.product 
                      ? getProductName(tradeOrder.containers[0].product)
                      : tradeOrder?.productName 
                        ? getProductName(tradeOrder.productName)
                        : schedule?.product 
                          ? getProductName(schedule.product)
                          : '-'} 
                  />
                  <InfoRow label="BK" value={tradeOrder?.bk || schedule?.bk || '-'} />
                  <InfoRow label="BL" value={tradeOrder?.bl || schedule?.bl || '-'} />
                  <InfoRow 
                    label="베일" 
                    value={totalBales > 0 ? totalBales.toLocaleString('ko-KR') : '-'} 
                  />
                  <InfoRow 
                    label="중량" 
                    value={totalWeight > 0 ? totalWeight.toLocaleString('ko-KR') + ' MT' : '-'} 
                  />
                  <InfoRow
                    label="Currency"
                    value={tradeOrder?.containers?.[0]?.currency
                      ? getCurrencyName(tradeOrder.containers[0].currency)
                      : tradeOrder?.currencyName || schedule?.currencyName || schedule?.currencyUnit
                        ? getCurrencyName(tradeOrder?.currencyName || schedule?.currencyName || schedule?.currencyUnit)
                        : '-'}
                  />
                  <InfoRow
                    label="Unit Price"
                    value={tradeOrder?.containers?.[0]?.unitPrice 
                      ? tradeOrder.containers[0].unitPrice.toLocaleString('ko-KR')
                      : schedule?.unitPrice 
                        ? schedule.unitPrice.toLocaleString('ko-KR')
                        : '-'}
                  />
                  <InfoRow
                    label="도착지"
                    value={tradeOrder?.destinationName || schedule?.destination
                      ? resolveCodeValue(labelResolvers?.destination, tradeOrder?.destinationName || schedule?.destination)
                      : '-'}
                  />
                  <InfoRow label="ETA" value={tradeOrder?.etaDate || schedule?.eta || '-'} />
                  {paymentMethods.length > 0 && (
                    <InfoRow label="결제조건" value={paymentMethods.join(', ')} className="col-span-4" />
                  )}
                  {(tradeOrder?.notes || schedule?.notes) && (
                    <InfoRow label="비고" value={tradeOrder?.notes || schedule?.notes || '-'} className="col-span-4" />
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* 원가 관리 필드 */}
            <form onSubmit={handleSubmit(internalSubmit)}>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                  입고 예정 데이터
                </h3>
                
                {/* 비용 입력 필드: 입고 확정 수정 화면과 동일한 배치 (환율만 예정 환율) */}
                {/* 첫 번째 줄: D/O비용, 통관수수료, 검역대행 수수료, 관세, 소독비(훈증검역) */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="doCost">D/O비용</Label>
                    <Input
                      id="doCost"
                      type="text"
                      value={formatNumber(doCostValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('doCost', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customsFee">통관수수료</Label>
                    <Input
                      id="customsFee"
                      type="text"
                      value={formatNumber(customsFeeValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('customsFee', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quarantineAgencyFee">검역대행 수수료</Label>
                    <Input
                      id="quarantineAgencyFee"
                      type="text"
                      value={formatNumber(quarantineAgencyFeeValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('quarantineAgencyFee', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="customsDuty">관세</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {hasCustomsDuty && (containerCount || schedule?.qty) ? (
                            <div>
                              관세 유무가 &apos;있음&apos;이므로 자동 계산됩니다.
                              <br />
                              300,000 × {(containerCount || schedule?.qty || 0).toLocaleString()} = {(300000 * (containerCount || schedule?.qty || 0)).toLocaleString()}원
                            </div>
                          ) : (
                            <div>관세 유무가 &apos;없음&apos;이므로 0으로 설정됩니다.</div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="customsDuty"
                      type="text"
                      value={formatNumber(customsDutyValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('customsDuty', num, { shouldDirty: true });
                      }}
                      placeholder={hasCustomsDuty && (containerCount || schedule?.qty) ? '자동 계산' : '0'}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="fumigationQuarantine">소독비(훈증검역)</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {hasFumigation && (containerCount || schedule?.qty) ? (
                            <div>
                              훈증 유무가 &apos;있음&apos;이므로 자동 계산됩니다.
                              <br />
                              130,000 × {(containerCount || schedule?.qty || 0).toLocaleString()} ={' '}
                              {fumigationQuarantineValue?.toLocaleString() || (130000 * (containerCount || schedule?.qty || 0)).toLocaleString()}
                            </div>
                          ) : (
                            <div>훈증 유무가 &apos;없음&apos;이므로 0으로 설정됩니다.</div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="fumigationQuarantine"
                      type="text"
                      value={formatNumber(fumigationQuarantineValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('fumigationQuarantine', num, { shouldDirty: true });
                      }}
                      placeholder={hasFumigation ? '자동 계산' : '0'}
                    />
                  </div>
                </div>

                {/* 두 번째 줄: 1단적재료(검역이적료), 현물, 샘플채취, 추가항목, 단미사료 */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstTierLoadingFee">1단적재료(검역이적료)</Label>
                    <Input
                      id="firstTierLoadingFee"
                      type="text"
                      value={formatNumber(firstTierLoadingFeeValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('firstTierLoadingFee', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="spot">현물</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {hasSpot ? (
                            <div>
                              현물 유무가 &apos;있음&apos;이므로 자동 계산됩니다.
                              <br />
                              240,000원
                            </div>
                          ) : (
                            <div>현물 유무가 &apos;없음&apos;이므로 0으로 설정됩니다.</div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="spot"
                      type="text"
                      value={formatNumber(spotValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('spot', num, { shouldDirty: true });
                      }}
                      placeholder={hasSpot ? '자동 계산' : '0'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sampleCollection">샘플채취</Label>
                    <Input
                      id="sampleCollection"
                      type="text"
                      value={formatNumber(sampleCollectionValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('sampleCollection', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="additionalItem">추가항목</Label>
                    <Input
                      id="additionalItem"
                      type="text"
                      value={formatNumber(additionalItemValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('additionalItem', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="document">단미사료</Label>
                    <Input
                      id="document"
                      type="text"
                      value={formatNumber(documentValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('document', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* 이고, 검역, DT */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="igodate">이고</Label>
                    <DatePicker
                      value={igodateValue}
                      onChange={(value) => {
                        setValue('igodate', value || undefined, { shouldDirty: true });
                      }}
                      placeholder="날짜 선택"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quarantineDate">검역</Label>
                    <DatePicker
                      value={quarantineDateValue}
                      onChange={(value) => {
                        setValue('quarantineDate', value || undefined, { shouldDirty: true });
                      }}
                      placeholder="날짜 선택"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dtDate">DT</Label>
                    <DatePicker
                      value={dtDateValue}
                      onChange={(value) => {
                        setValue('dtDate', value || undefined, { shouldDirty: true });
                      }}
                      placeholder="날짜 선택"
                    />
                  </div>
                </div>

                {/* 창고, 이고비, 적출비, 은행 수수료, 검역 작업비 */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="warehouse">창고</Label>
                    <Select
                      value={warehouseValue ? warehouseValue : '__none__'}
                      onValueChange={(value) => {
                        setValue('warehouse', value === '__none__' ? undefined : value, { shouldDirty: true });
                      }}
                    >
                      <SelectTrigger id="warehouse">
                        <SelectValue placeholder="선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안함</SelectItem>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.name}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="igobi">이고비 (컨당)</Label>
                    <Input
                      id="igobi"
                      type="text"
                      value={formatNumber(igobiValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('igobi', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extractionFee">적출비</Label>
                    <Input
                      id="extractionFee"
                      type="text"
                      value={formatNumber(extractionFeeValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('extractionFee', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="bankFee">은행 수수료</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            {hasLC && (containerCount || schedule?.qty) && (
                              <div>LC: 300,000 × {(containerCount || schedule?.qty || 0).toLocaleString()} = {(300000 * (containerCount || schedule?.qty || 0)).toLocaleString()}원</div>
                            )}
                            {hasTTDA && (
                              <div>TT/DA: 30,000원</div>
                            )}
                            {hasDAOnly && !hasTTDA && (
                              <div>DA: 30,000원</div>
                            )}
                            {hasTTOnly && !hasTTDA && (
                              <div>TT: 20,000원</div>
                            )}
                            {!hasLC && !hasTTDA && !hasDAOnly && !hasTTOnly && (
                              <div>결제 조건이 없습니다.</div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="bankFee"
                      type="text"
                      value={formatNumber(bankFeeValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('bankFee', num, { shouldDirty: true });
                      }}
                      placeholder={shouldAutoCalculateBankFee ? '자동 계산' : '0'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quarantineWorkCost">검역 작업비</Label>
                    <Input
                      id="quarantineWorkCost"
                      type="text"
                      value={formatNumber(quarantineWorkCostValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('quarantineWorkCost', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* 네 번째 줄: 수수료, 쿼터 비용, 예정 환율 (입고 확정과 동일 배치, 환율만 예정 환율) */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fee">수수료</Label>
                    <Input
                      id="fee"
                      type="text"
                      value={formatNumber(feeValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('fee', num, { shouldDirty: true });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="quotaCost">쿼터 비용</Label>
                      {hasQuota && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div>
                              쿼터 유무가 &apos;있음&apos;이므로 기본값 5원이 설정됩니다.
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <Input
                      id="quotaCost"
                      type="text"
                      value={formatNumber(quotaCostValue)}
                      onChange={(e) => {
                        const num = parseNumber(e.target.value);
                        setValue('quotaCost', num, { shouldDirty: true });
                      }}
                      placeholder={hasQuota ? '5' : '0'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="comparisonExchangeRate">예정 환율</Label>
                    <Input
                      id="comparisonExchangeRate"
                      type="text"
                      inputMode="decimal"
                      value={
                        comparisonExchangeRateInput !== ''
                          ? (() => {
                              // 입력 중: 정수 부분에 콤마 추가, 소수점 이하 유지
                              const parts = comparisonExchangeRateInput.split('.');
                              const integerPart = parts[0] || '';
                              const decimalPart = parts.length > 1 ? '.' + (parts.slice(1).join('').slice(0, 4)) : '';
                              const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                              return formattedInteger + decimalPart;
                            })()
                          : comparisonExchangeRateValue !== null && comparisonExchangeRateValue !== undefined
                            ? formatNumberWithOptionalDecimals(comparisonExchangeRateValue)
                            : ''
                      }
                      onChange={(e) => {
                        const rawValue = e.target.value;
                        // 숫자와 소수점만 허용, 소수점 이하 최대 4자리
                        const cleaned = rawValue.replace(/[^0-9.]/g, '');
                        const parts = cleaned.split('.');
                        const integerPart = parts[0] || '';
                        const decimalPart = parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, 4) : '';
                        const newValue = integerPart + decimalPart;
                        setComparisonExchangeRateInput(newValue);
                        const num = parseNumber(newValue);
                        setValue('comparisonExchangeRate', num !== undefined ? num : null, { shouldDirty: true });
                      }}
                      onFocus={() => {
                        if (comparisonExchangeRateInput === '') {
                          const v = comparisonExchangeRateValue;
                          if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
                            setComparisonExchangeRateInput(String(Number(v)));
                          } else {
                            setComparisonExchangeRateInput('');
                          }
                        }
                      }}
                      onBlur={() => {
                        const raw = comparisonExchangeRateInput.replace(/,/g, '');
                        const num = raw === '' || raw === '.' ? undefined : parseNumber(raw);
                        setValue('comparisonExchangeRate', num !== undefined ? num : null, { shouldDirty: true });
                        setComparisonExchangeRateInput('');
                      }}
                      placeholder="1400 또는 1400.50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">예정 원가</Label>
                    <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
                      {displayExpectedPurchaseCost != null
                        ? displayExpectedPurchaseCost.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' 원/kg'
                        : '-'}
                    </div>
                  </div>
                </div>

                {/* 계산 방법 표시 (확인용) - 제거됨 */}
                {false && (() => {
                  // 실제 계산식과 동일한 변수 사용
                  const qty = containerCount;
                  const customsFee = customsFeeValue ?? 0;
                  const firstTierLoadingFee = firstTierLoadingFeeValue ?? 0;
                  const doCost = doCostValue ?? 0;
                  const quarantineAgencyFee = quarantineAgencyFeeValue ?? 0;
                  const customsDuty = customsDutyValue ?? 0;
                  const additionalItem = additionalItemValue ?? 0;
                  const bankFee = bankFeeValue ?? 0;
                  const quarantineWorkCost = quarantineWorkCostValue ?? 0;
                  const spot = spotValue ?? 0;
                  const document = documentValue ?? 0;
                  const igobi = (igobiValue ?? 0) * qty;
                  const extractionFee = extractionFeeValue ?? 0;
                  const sto = stoValue ?? 0;
                  const fumigationQuarantine = fumigationQuarantineValue ?? 0;
                  const fee = feeValue ?? 0;
                  const sampleCollection = sampleCollectionValue ?? 0;
                  const sum = customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + igobi + extractionFee + sto + fumigationQuarantine + fee + sampleCollection;
                  const secondPart = totalWeight > 0 ? sum / totalWeight / 1000 : 0;
                  
                  return (
                    <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-dashed">
                      <h4 className="text-sm font-semibold mb-3 text-muted-foreground">원가 계산 방법 (확인용)</h4>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium">1. 첫 번째 부분:</span> 비교용환율 × 단가 / 1000
                          <div className="ml-4 mt-1 text-xs">
                            {weightedAverageExchangeRate !== null && weightedAverageExchangeRate !== undefined ? (
                              <>
                                <div className="text-blue-600 dark:text-blue-400 mb-1">
                                  (결제 정보의 가중 평균 환율 사용: {weightedAverageExchangeRate !== null && weightedAverageExchangeRate !== undefined ? Number(weightedAverageExchangeRate).toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '-'})
                                </div>
                                = {weightedAverageExchangeRate !== null && weightedAverageExchangeRate !== undefined ? Number(weightedAverageExchangeRate).toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '0'} × {unitPriceValue?.toLocaleString('ko-KR') || '0'} / 1000
                                = {((weightedAverageExchangeRate ?? 0) * (unitPriceValue ?? 0) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 6 })}
                              </>
                            ) : (
                              <>
                                = {comparisonExchangeRateValue?.toLocaleString('ko-KR') || '0'} × {unitPriceValue?.toLocaleString('ko-KR') || '0'} / 1000
                                = {((comparisonExchangeRateValue ?? 0) * (unitPriceValue ?? 0) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 6 })}
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">2. 두 번째 부분:</span> 모든 비용 합계 / 총량 / 1000
                          <div className="ml-4 mt-1 text-xs space-y-1">
                            <div>통관 수수료 = {customsFee.toLocaleString('ko-KR')}원</div>
                            <div>1단 적재료 = {firstTierLoadingFee.toLocaleString('ko-KR')}원</div>
                            <div>D/O 비용 = {doCost.toLocaleString('ko-KR')}원</div>
                            <div>검역 대행료 = {quarantineAgencyFee.toLocaleString('ko-KR')}원</div>
                            <div>관세 = {customsDuty.toLocaleString('ko-KR')}원</div>
                            <div>항목 추가란 = {additionalItem.toLocaleString('ko-KR')}원</div>
                            <div>은행 수수료 = {bankFee.toLocaleString('ko-KR')}원</div>
                            <div>검역 작업비 = {quarantineWorkCost.toLocaleString('ko-KR')}원</div>
                            <div>현물 = {spot.toLocaleString('ko-KR')}원</div>
                            <div>서류 = {document.toLocaleString('ko-KR')}원</div>
                            <div>이고비 = {igobiValue?.toLocaleString('ko-KR') || '0'} × {containerCount.toLocaleString('ko-KR')} (컨테이너 수량) = {igobi.toLocaleString('ko-KR')}원</div>
                            <div>적출비 = {extractionFee.toLocaleString('ko-KR')}원</div>
                            <div>STO = {sto.toLocaleString('ko-KR')}원</div>
                            <div>훈증검역 = {fumigationQuarantine.toLocaleString('ko-KR')}원</div>
                            <div>수수료 = {fee.toLocaleString('ko-KR')}원</div>
                            <div>샘플채취 = {sampleCollection.toLocaleString('ko-KR')}원</div>
                            <div className="font-medium pt-1">비용 합계 = {sum.toLocaleString('ko-KR')}원</div>
                            <div>총량 = {totalWeight.toLocaleString('ko-KR')}kg</div>
                            <div>
                              = {sum.toLocaleString('ko-KR')} / {totalWeight.toLocaleString('ko-KR')} / 1000
                              = {secondPart.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원
                            </div>
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">3. 쿼터 비용:</span> {(quotaCostValue ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원
                        </div>
                        <div className="pt-2 border-t">
                          <span className="font-semibold">최종 원가:</span> 첫 번째 부분 + 두 번째 부분 + 쿼터 비용
                          {(() => {
                            const firstPart = ((comparisonExchangeRateValue ?? 0) * (unitPriceValue ?? 0) / 1000);
                            const calculatedPurchaseCost = firstPart + secondPart + (quotaCostValue ?? 0);
                            return (
                              <>
                                <div className="ml-4 mt-1 text-sm font-semibold text-foreground">
                                  = {firstPart.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} + {' '}
                                  {secondPart.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} + {' '}
                                  {(quotaCostValue ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 6 })} = {' '}
                                  {formatNumberWithDecimals(calculatedPurchaseCost)}
                                </div>
                                <div className="ml-4 mt-1 text-xs text-muted-foreground">
                                  (반올림 전 정확한 값: {calculatedPurchaseCost.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원)
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      
                      {/* 실제 결제 금액과 원가 계산 금액 비교 */}
                      {(() => {
                        const payments = tradeOrder?.payments ?? schedule?.payments ?? [];
                        const validPayments = payments.filter(
                          (payment: any) => 
                            payment.ratio != null && 
                            payment.ratio !== undefined && 
                            payment.exchangeRate != null && 
                            payment.exchangeRate !== undefined &&
                            payment.ratio > 0 &&
                            payment.exchangeRate > 0
                        );
                        
                        if (validPayments.length === 0) {
                          return null;
                        }
                        
                        // 송장 금액 사용
                        const invoiceAmount = tradeOrder?.invoiceAmount ?? null;
                        // 외화 총액: 송장 금액이 있으면 사용, 없으면 단가 × 중량 / 1000 (톤 단위로 변환)
                        const foreignCurrencyTotal = invoiceAmount ?? ((unitPriceValue ?? 0) * (totalWeight ?? 0) / 1000);
                        
                        // 실제 결제된 원화 금액 계산
                        // 각 결제별: (송장 금액 또는 단가 × 중량 / 1000) × (ratio / 100) × exchangeRate
                        // 원가 계산과 비교하기 위해: (ratio / 100) × exchangeRate × unitPrice × totalWeight / 1000
                        // = exchangeRate × unitPrice × totalWeight × (ratio / 100) / 1000
                        const actualPaidKRW = validPayments.reduce((sum, payment: any) => {
                          const ratio = Number(payment.ratio);
                          const exchangeRate = Number(payment.exchangeRate);
                          if (invoiceAmount !== null) {
                            // 송장 금액이 있으면: 송장 금액 × 비율 × 환율
                            return sum + ((ratio / 100) * invoiceAmount * exchangeRate);
                          } else {
                            // 송장 금액이 없으면: 단가 × 중량 × 환율 × 비율 / 1000
                            // 이렇게 하면 원가 계산 (환율 × 단가 / 1000) × 중량과 일치
                            return sum + ((ratio / 100) * (unitPriceValue ?? 0) * (totalWeight ?? 0) * exchangeRate / 1000);
                          }
                        }, 0);
                        
                        // 원가 계산의 각 부분 분리
                        const comparisonRate = weightedAverageExchangeRate ?? comparisonExchangeRateValue ?? 0;
                        const firstPartCostPerKg = (comparisonRate * (unitPriceValue ?? 0)) / 1000;
                        // totalWeight는 MT(톤) 단위이므로 kg로 변환: × 1000
                        const firstPartTotalAmount = firstPartCostPerKg * (totalWeight ?? 0) * 1000;
                        
                        // 두 번째 부분 (부대비용) 계산
                        const qty = containerCount;
                        const customsFee = customsFeeValue ?? 0;
                        const firstTierLoadingFee = firstTierLoadingFeeValue ?? 0;
                        const doCost = doCostValue ?? 0;
                        const quarantineAgencyFee = quarantineAgencyFeeValue ?? 0;
                        const customsDuty = customsDutyValue ?? 0;
                        const additionalItem = additionalItemValue ?? 0;
                        const bankFee = bankFeeValue ?? 0;
                        const quarantineWorkCost = quarantineWorkCostValue ?? 0;
                        const spot = spotValue ?? 0;
                        const document = documentValue ?? 0;
                        const igobi = (igobiValue ?? 0) * qty;
                        const extractionFee = extractionFeeValue ?? 0;
                        const sto = stoValue ?? 0;
                        const fumigationQuarantine = fumigationQuarantineValue ?? 0;
                        const fee = feeValue ?? 0;
                        const sampleCollection = sampleCollectionValue ?? 0;
                        const sum = customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + igobi + extractionFee + sto + fumigationQuarantine + fee + sampleCollection;
                        const secondPartTotalAmount = sum;
                        
                        // 쿼터 비용: totalWeight는 MT(톤) 단위이므로 kg로 변환: × 1000
                        const quotaCostTotalAmount = ((quotaCostValue ?? 0) * (totalWeight ?? 0) * 1000);
                        
                        // 원가를 이용한 결제 금액 계산: 원가(kg당, 원화) × 중량(MT) × 1000
                        // totalWeight는 MT(톤) 단위이므로 kg로 변환하기 위해 × 1000
                        const secondPartPerKg = totalWeight > 0 ? secondPartTotalAmount / totalWeight / 1000 : 0;
                        const calculatedPurchaseCost = firstPartCostPerKg + secondPartPerKg + (quotaCostValue ?? 0);
                        const costCalculatedAmount = calculatedPurchaseCost * (totalWeight ?? 0) * 1000;
                        
                        // 실제 결제 금액 + 두 번째 부분(국내 처리 비용) + 쿼터 비용
                        const totalActualCost = actualPaidKRW + secondPartTotalAmount + quotaCostTotalAmount;
                        
                        return (
                          <div className="mt-4 pt-4 border-t border-dashed">
                            <h5 className="text-sm font-semibold mb-2 text-muted-foreground">실제 결제 금액 vs 원가 계산 금액 비교</h5>
                            <div className="space-y-2 text-xs">
                              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                                <div className="font-medium text-blue-900 dark:text-blue-100 mb-2">1. 실제 결제된 원화 금액</div>
                                <div className="space-y-1 text-blue-800 dark:text-blue-200">
                                  <div>
                                    송장 금액 = {invoiceAmount !== null && invoiceAmount !== undefined
                                      ? `${Number(invoiceAmount).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} (송장 금액 사용)`
                                      : `${unitPriceValue?.toLocaleString('ko-KR') || '0'} × ${totalWeight?.toLocaleString('ko-KR') || '0'} / 1000 = ${foreignCurrencyTotal.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} (단가 × 중량으로 계산)`}
                                  </div>
                                  <div className="mt-2">각 결제별 원화 금액:</div>
                                  {validPayments.map((payment: any, idx: number) => {
                                    const ratio = Number(payment.ratio);
                                    const exchangeRate = Number(payment.exchangeRate);
                                    if (invoiceAmount !== null) {
                                      const paymentKRW = (ratio / 100) * invoiceAmount * exchangeRate;
                                      return (
                                        <div key={idx} className="ml-4">
                                          결제 {payment.sequence || idx + 1}: 
                                          ({ratio}% / 100) × {invoiceAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} × {exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} = {paymentKRW.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                        </div>
                                      );
                                    } else {
                                      const paymentKRW = (ratio / 100) * (unitPriceValue ?? 0) * (totalWeight ?? 0) * exchangeRate / 1000;
                                      return (
                                        <div key={idx} className="ml-4">
                                          결제 {payment.sequence || idx + 1}: 
                                          ({ratio}% / 100) × {unitPriceValue?.toLocaleString('ko-KR') || '0'} × {totalWeight?.toLocaleString('ko-KR') || '0'} × {exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} / 1000 = {paymentKRW.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                        </div>
                                      );
                                    }
                                  })}
                                  <div className="mt-2 font-semibold">
                                    합계 = {actualPaidKRW.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                  </div>
                                </div>
                              </div>
                              
                              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-800">
                                <div className="font-medium text-purple-900 dark:text-purple-100 mb-2">2. 두 번째 부분 (국내 처리 비용)</div>
                                <div className="space-y-1 text-purple-800 dark:text-purple-200">
                                  <div>국내 처리 비용 총합 = {secondPartTotalAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</div>
                                </div>
                              </div>
                              
                              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-800">
                                <div className="font-medium text-purple-900 dark:text-purple-100 mb-2">3. 쿼터 비용</div>
                                <div className="space-y-1 text-purple-800 dark:text-purple-200">
                                  <div>쿼터 비용 = {quotaCostTotalAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</div>
                                </div>
                              </div>
                              
                              <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                                <div className="font-medium text-green-900 dark:text-green-100 mb-2">4. 원가를 이용한 결제 금액 계산</div>
                                <div className="space-y-1 text-green-800 dark:text-green-200">
                                  <div className="text-xs text-muted-foreground mb-2">
                                    ※ 원가(kg당)는 이미 환율이 적용되어 원화 단위입니다.
                                    <br />따라서 환율을 다시 곱할 필요가 없습니다.
                                  </div>
                                  {weightedAverageExchangeRate !== null && weightedAverageExchangeRate !== undefined ? (
                                    <div className="text-xs text-muted-foreground mb-1">
                                      ※ 가중치 평균 환율 사용: {weightedAverageExchangeRate !== null && weightedAverageExchangeRate !== undefined ? Number(weightedAverageExchangeRate).toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '-'}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground mb-1">
                                      ※ 비교용 환율 사용: {comparisonExchangeRateValue?.toLocaleString('ko-KR', { maximumFractionDigits: 6 }) || '0'}
                                    </div>
                                  )}
                                  <div>원가(kg당, 원화) = {(() => {
                                    const calculatedPurchaseCost = firstPartCostPerKg + secondPartPerKg + (quotaCostValue ?? 0);
                                    return calculatedPurchaseCost.toLocaleString('ko-KR', { maximumFractionDigits: 6 });
                                  })()}원</div>
                                  <div className="text-xs text-muted-foreground ml-2">
                                    = (가중치 평균 환율 {comparisonRate.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} × 단가 {unitPriceValue?.toLocaleString('ko-KR') || '0'} / 1000) + (부대비용 합계 {sum.toLocaleString('ko-KR')}원 / 중량 / 1000) + 쿼터비용 {quotaCostValue?.toLocaleString('ko-KR') || '0'}원/kg
                                  </div>
                                  <div className="text-xs text-muted-foreground ml-2 mt-1">
                                    ※ 위 계산에서 이미 환율이 곱해져 원화 단위로 변환되었습니다.
                                  </div>
                                  <div className="mt-2">중량 = {totalWeight?.toLocaleString('ko-KR') || '0'} MT</div>
                                  <div className="font-semibold mt-2">
                                    원가를 이용한 결제 금액 = 원가(kg당, 원화) × 중량(MT) × 1000
                                  </div>
                                  <div className="ml-4">
                                    = {(() => {
                                      const comparisonRate = weightedAverageExchangeRate ?? comparisonExchangeRateValue ?? 0;
                                      const firstPartCostPerKg = (comparisonRate * (unitPriceValue ?? 0)) / 1000;
                                      const secondPartPerKg = totalWeight > 0 ? sum / totalWeight / 1000 : 0;
                                      const calculatedPurchaseCost = firstPartCostPerKg + secondPartPerKg + (quotaCostValue ?? 0);
                                      return calculatedPurchaseCost.toLocaleString('ko-KR', { maximumFractionDigits: 6 });
                                    })()}원/kg × {totalWeight?.toLocaleString('ko-KR') || '0'} MT × 1000
                                    = {costCalculatedAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    ※ 중량이 MT(톤) 단위이므로 kg로 변환하기 위해 × 1000을 합니다.
                                  </div>
                                </div>
                              </div>
                              
                              <div className={`p-3 rounded border ${Math.abs(totalActualCost - costCalculatedAmount) < 0.01 ? 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800' : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'}`}>
                                <div className="font-semibold mb-2">비교: (실제 결제 금액 + 국내 처리 비용 + 쿼터 비용) vs 원가를 이용한 결제 금액</div>
                                <div className="space-y-1 text-xs">
                                  <div>실제 결제 금액: {actualPaidKRW.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</div>
                                  <div>+ 국내 처리 비용: {secondPartTotalAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</div>
                                  <div>+ 쿼터 비용: {quotaCostTotalAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</div>
                                  <div className="font-semibold mt-2">
                                    = 총 실제 원가: {totalActualCost.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                  </div>
                                  <div className="mt-2">
                                    원가를 이용한 결제 금액: {costCalculatedAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                  </div>
                                  <div className="font-semibold mt-2">
                                    차이 = {totalActualCost.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} - {costCalculatedAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} = {(totalActualCost - costCalculatedAmount).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                  </div>
                                  {Math.abs(totalActualCost - costCalculatedAmount) < 0.01 ? (
                                    <div className="text-sm text-green-600 dark:text-green-400 mt-2">✓ (실제 결제 금액 + 국내 처리 비용 + 쿼터 비용)과 원가를 이용한 결제 금액이 일치합니다.</div>
                                  ) : (
                                    <div className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">⚠ (실제 결제 금액 + 국내 처리 비용 + 쿼터 비용)과 원가를 이용한 결제 금액이 일치하지 않습니다. 계산을 확인해주세요.</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* 컨테이너 단위 계산 방법 표시 - 제거됨 */}
                {false && tradeOrder?.containers && (tradeOrder?.containers?.length ?? 0) > 0 && (() => {
                  // 실제 결제 금액 계산 (컨테이너 계산 섹션용)
                  const validPaymentsForComparison = (tradeOrder?.payments ?? schedule?.payments ?? []).filter(
                    (p: any) => p.ratio != null && p.exchangeRate != null && Number(p.ratio) > 0 && Number(p.exchangeRate) > 0
                  );
                  const invoiceAmountForComparison = tradeOrder?.invoiceAmount ?? null;
                  const actualPaidKRWForComparison = validPaymentsForComparison.reduce((sum: number, payment: any) => {
                    const ratio = Number(payment.ratio);
                    const exchangeRate = Number(payment.exchangeRate);
                    if (invoiceAmountForComparison !== null) {
                      return sum + ((ratio / 100) * invoiceAmountForComparison * exchangeRate);
                    } else {
                      return sum + ((ratio / 100) * (unitPriceValue ?? 0) * (totalWeight ?? 0) * exchangeRate / 1000);
                    }
                  }, 0);
                  
                  // 국내 처리 비용 및 쿼터 비용 (컨테이너 계산 섹션용)
                  const secondPartTotalAmountForComparison = (() => {
                    const qty = containerCount;
                    const customsFee = customsFeeValue ?? 0;
                    const firstTierLoadingFee = firstTierLoadingFeeValue ?? 0;
                    const doCost = doCostValue ?? 0;
                    const quarantineAgencyFee = quarantineAgencyFeeValue ?? 0;
                    const customsDuty = customsDutyValue ?? 0;
                    const additionalItem = additionalItemValue ?? 0;
                    const bankFee = bankFeeValue ?? 0;
                    const quarantineWorkCost = quarantineWorkCostValue ?? 0;
                    const spot = spotValue ?? 0;
                    const document = documentValue ?? 0;
                    const igobi = (igobiValue ?? 0) * qty;
                    const extractionFee = extractionFeeValue ?? 0;
                    const sto = stoValue ?? 0;
                    const fumigationQuarantine = fumigationQuarantineValue ?? 0;
                    const fee = feeValue ?? 0;
                    const sampleCollection = sampleCollectionValue ?? 0;
                    return customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + igobi + extractionFee + sto + fumigationQuarantine + fee + sampleCollection;
                  })();
                  const quotaCostTotalAmountForComparison = ((quotaCostValue ?? 0) * (totalWeight ?? 0) * 1000);
                  const totalActualCostForComparison = actualPaidKRWForComparison + secondPartTotalAmountForComparison + quotaCostTotalAmountForComparison;
                  
                  // 공통 비용 (컨테이너 수로 배분)
                  const qty = containerCount;
                  const customsFee = customsFeeValue ?? 0;
                  const firstTierLoadingFee = firstTierLoadingFeeValue ?? 0;
                  const doCost = doCostValue ?? 0;
                  const quarantineAgencyFee = quarantineAgencyFeeValue ?? 0;
                  const customsDuty = customsDutyValue ?? 0;
                  const additionalItem = additionalItemValue ?? 0;
                  const bankFee = bankFeeValue ?? 0;
                  const quarantineWorkCost = quarantineWorkCostValue ?? 0;
                  const spot = spotValue ?? 0;
                  const document = documentValue ?? 0;
                  const extractionFee = extractionFeeValue ?? 0;
                  const sto = stoValue ?? 0;
                  const fumigationQuarantine = fumigationQuarantineValue ?? 0;
                  const fee = feeValue ?? 0;
                  const sampleCollection = sampleCollectionValue ?? 0;
                  
                  // 이고비는 컨테이너당 고정 비용
                  const igobiPerContainer = igobiValue ?? 0;
                  
                  // 전체 비용 계산 (수학적으로 주문 단위 계산과 같아지도록)
                  const totalCommonCosts = customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + extractionFee + sto + fumigationQuarantine + fee + sampleCollection;
                  const totalIgobi = igobiPerContainer * qty;
                  const totalCosts = totalCommonCosts + totalIgobi;
                  
                  
                  return (
                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <h4 className="text-sm font-semibold mb-3 text-blue-900 dark:text-blue-100">컨테이너 단위 원가 계산 (확인용)</h4>
                      <div className="space-y-4 text-xs text-blue-800 dark:text-blue-200">
                        <div>
                          <span className="font-medium">전체 공통 비용 (각 컨테이너 계산 시 중량으로 나눔):</span>
                          <div className="ml-4 mt-1 space-y-1">
                            <div>통관 수수료 = {customsFee.toLocaleString('ko-KR')}원</div>
                            <div>1단 적재료 = {firstTierLoadingFee.toLocaleString('ko-KR')}원</div>
                            <div>D/O 비용 = {doCost.toLocaleString('ko-KR')}원</div>
                            <div>검역 대행료 = {quarantineAgencyFee.toLocaleString('ko-KR')}원</div>
                            <div>관세 = {customsDuty.toLocaleString('ko-KR')}원</div>
                            <div>항목 추가란 = {additionalItem.toLocaleString('ko-KR')}원</div>
                            <div>은행 수수료 = {bankFee.toLocaleString('ko-KR')}원</div>
                            <div>검역 작업비 = {quarantineWorkCost.toLocaleString('ko-KR')}원</div>
                            <div>현물 = {spot.toLocaleString('ko-KR')}원</div>
                            <div>서류 = {document.toLocaleString('ko-KR')}원</div>
                            <div>이고비 = {igobiPerContainer.toLocaleString('ko-KR')} × {qty.toLocaleString('ko-KR')} (컨테이너 수량) = {totalIgobi.toLocaleString('ko-KR')}원</div>
                            <div>적출비 = {extractionFee.toLocaleString('ko-KR')}원</div>
                            <div>STO = {sto.toLocaleString('ko-KR')}원</div>
                            <div>훈증검역 = {fumigationQuarantine.toLocaleString('ko-KR')}원</div>
                            <div>수수료 = {fee.toLocaleString('ko-KR')}원</div>
                            <div>샘플채취 = {sampleCollection.toLocaleString('ko-KR')}원</div>
                            <div className="font-medium pt-1">전체 공통 비용 합계 = {totalCosts.toLocaleString('ko-KR')}원</div>
                            <div className="text-xs text-blue-600 dark:text-blue-400 pt-1">
                              (각 컨테이너 계산 시: 전체 비용 합계 ÷ 컨테이너 중량 ÷ 1000)
                            </div>
                          </div>
                        </div>
                        
                        {(() => {
                          
                          // 각 컨테이너의 원가(kg당)를 계산하여 배열로 저장
                          const containerCosts = tradeOrder?.containers?.map((container, index) => {
                            const containerUnitPrice = container.unitPrice ?? unitPriceValue ?? 0;
                            const containerWeight = container.weight != null ? Number(container.weight) : 0;
                            
                            // 비교용환율: 결제 정보의 가중 평균 환율 우선 사용
                            const comparisonRateForContainer = weightedAverageExchangeRate ?? comparisonExchangeRateValue ?? 0;
                            
                            // 컨테이너별 첫 번째 부분 (kg당 원가): 비교용환율 × 컨테이너 단가(톤당) / 1000
                            const containerFirstPartPerKg = (comparisonRateForContainer * containerUnitPrice) / 1000;
                            
                            // 컨테이너별 두 번째 부분 (kg당 원가): 전체 비용 합계 / 전체 중량 / 1000
                            // 주문 단위 계산과 동일하게 전체 비용을 전체 중량으로 나눔 (kg당 비용은 모든 컨테이너에 동일)
                            const containerSecondPartPerKg = totalWeight > 0 
                              ? totalCosts / totalWeight / 1000
                              : 0;
                            
                            // 컨테이너별 쿼터 비용 (kg당 원가)
                            // 쿼터 비용은 이미 kg당 단가로 저장되어 있음
                            const containerQuotaCostPerKg = quotaCostValue ?? 0;
                            
                            // 컨테이너별 최종 원가 (kg당)
                            const containerPurchaseCostPerKg = containerFirstPartPerKg + containerSecondPartPerKg + containerQuotaCostPerKg;
                            
                            // 컨테이너별 결제 금액: 원가(kg당) × 중량(MT) × 1000
                            const containerPaymentAmount = containerPurchaseCostPerKg * containerWeight * 1000;
                            
                            return {
                              index,
                              container,
                              containerUnitPrice,
                              containerWeight,
                              containerBales: (container.salesBales ?? container.tradeBales) != null ? Number(container.salesBales ?? container.tradeBales) : 0,
                              containerFirstPartPerKg,
                              containerSecondPartPerKg,
                              containerQuotaCostPerKg,
                              containerPurchaseCostPerKg,
                              containerPaymentAmount,
                            };
                          }) ?? [];
                          
                          if (!containerCosts || containerCosts.length === 0) {
                            return null;
                          }
                          
                          // 컨테이너 원가 평균 계산 (kg당)
                          const averageContainerCost = containerCosts.length > 0
                            ? containerCosts.reduce((sum, item) => sum + item.containerPurchaseCostPerKg, 0) / containerCosts.length
                            : 0;
                          
                          return (
                            <>
                              {containerCosts.map((item) => (
                                <div key={`container-${item.index}`} className="pt-3 border-t border-blue-300 dark:border-blue-700">
                                  <div className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                    컨테이너 {item.index + 1} (베일: {item.containerBales.toLocaleString('ko-KR')}, 중량: {item.containerWeight.toLocaleString('ko-KR')} MT, 단가: {item.containerUnitPrice.toLocaleString('ko-KR')} USD/MT)
                                  </div>
                                  <div className="ml-4 space-y-1">
                                    <div>
                                      <span className="font-medium">1. 첫 번째 부분 (kg당 원가):</span> 비교용환율 × 컨테이너 단가(톤당) / 1000
                                      <div className="ml-4 mt-1">
                                        = {(weightedAverageExchangeRate ?? comparisonExchangeRateValue ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 6 })} × {item.containerUnitPrice.toLocaleString('ko-KR')} (톤당) / 1000
                                        = {item.containerFirstPartPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg
                                      </div>
                                    </div>
                                    <div>
                                      <span className="font-medium">2. 두 번째 부분 (kg당 원가):</span> 전체 비용 합계 / 전체 중량 / 1000
                                      <div className="ml-4 mt-1">
                                        = {totalCosts.toLocaleString('ko-KR')} / {totalWeight.toLocaleString('ko-KR')} / 1000
                                        = {item.containerSecondPartPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg
                                      </div>
                                      <div className="ml-4 mt-1 text-xs text-muted-foreground">
                                        ※ 주문 단위 계산과 동일 (전체 비용을 전체 중량으로 나눔)
                                      </div>
                                    </div>
                                    <div>
                                      <span className="font-medium">3. 쿼터 비용 (kg당 원가):</span> {item.containerQuotaCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg
                                    </div>
                                    <div className="pt-2 border-t border-blue-300 dark:border-blue-700 font-semibold">
                                      컨테이너 {item.index + 1} 원가(kg당) = {item.containerFirstPartPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} + {item.containerSecondPartPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} + {item.containerQuotaCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} = {item.containerPurchaseCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg
                                    </div>
                                    <div className="pt-2 font-semibold text-blue-900 dark:text-blue-100">
                                      컨테이너 {item.index + 1} 결제 금액 = 원가(kg당) × 중량(MT) × 1000
                                      <div className="ml-4 mt-1 text-xs font-normal">
                                        = {item.containerPurchaseCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg × {item.containerWeight.toLocaleString('ko-KR')} MT × 1000
                                        = {item.containerPaymentAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              
                              {/* 컨테이너 금액 합계 */}
                              {(() => {
                                const totalContainerPaymentAmount = containerCosts.reduce((sum, item) => sum + item.containerPaymentAmount, 0);
                                return (
                                  <div className={`pt-4 mt-4 border-t-2 ${Math.abs(totalActualCostForComparison - totalContainerPaymentAmount) < 0.01 ? 'border-green-400 dark:border-green-600' : 'border-blue-400 dark:border-blue-600'}`}>
                                    <div className="font-bold text-blue-900 dark:text-blue-100 text-sm mb-2">
                                      컨테이너별 결제 금액 합계
                                    </div>
                                    <div className="ml-4 space-y-1 text-xs">
                                      <div className="space-y-1">
                                        {containerCosts.map((item, idx) => (
                                          <div key={idx}>
                                            컨테이너 {item.index + 1}: 원가({item.containerPurchaseCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg) × {item.containerWeight.toLocaleString('ko-KR')} MT × 1000 = {item.containerPaymentAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                          </div>
                                        ))}
                                      </div>
                                      <div className="pt-2 border-t border-blue-300 dark:border-blue-700 font-semibold text-blue-900 dark:text-blue-100">
                                        컨테이너별 결제 금액 총합 = {totalContainerPaymentAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                      </div>
                                      <div className="pt-2 border-t border-blue-300 dark:border-blue-700">
                                        <div className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                                          비교: (실제 결제 금액 + 국내 처리 비용 + 쿼터 비용) vs 컨테이너별 결제 금액 총합
                                        </div>
                                        <div className="space-y-1">
                                          <div>(실제 결제 금액 + 국내 처리 비용 + 쿼터 비용) = {totalActualCostForComparison.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</div>
                                          <div>컨테이너별 결제 금액 총합 = {totalContainerPaymentAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</div>
                                          <div className="font-semibold mt-1">
                                            차이 = {totalActualCostForComparison.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} - {totalContainerPaymentAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} = {(totalActualCostForComparison - totalContainerPaymentAmount).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원
                                          </div>
                                          {(() => {
                                            // 송장 금액과 컨테이너별 단가×중량 합계 비교
                                            const invoiceAmountValue = tradeOrder?.invoiceAmount ? Number(tradeOrder?.invoiceAmount) : null;
                                            const containerInvoiceAmountSum = tradeOrder?.containers?.reduce((sum, container) => {
                                              const containerUnitPrice = container.unitPrice ? Number(container.unitPrice) : (unitPriceValue ?? 0);
                                              const containerWeight = container.weight ? Number(container.weight) : 0;
                                              return sum + (containerUnitPrice * containerWeight);
                                            }, 0) ?? 0;
                                            
                                            return (
                                              <>
                                                {invoiceAmountValue !== null && (
                                                  <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-700 text-xs">
                                                    <div className="font-semibold mb-1">송장 금액 검증:</div>
                                                    <div>송장 금액 (USD) = {invoiceAmountValue !== null && invoiceAmountValue !== undefined ? Number(invoiceAmountValue).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '-'}</div>
                                                    <div>컨테이너별 단가×중량 합계 (USD) = {containerInvoiceAmountSum.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>
                                                    {invoiceAmountValue !== null && invoiceAmountValue !== undefined && (() => {
                                                      const invoiceAmount = Number(invoiceAmountValue);
                                                      const diff = Math.abs(invoiceAmount - containerInvoiceAmountSum);
                                                      return (
                                                        <div className={diff < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                                                          송장 금액 차이 = {diff.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} USD
                                                          {diff >= 0.01 && (
                                                            <span className="ml-1">⚠ 송장 금액과 컨테이너별 계산 합계가 일치하지 않습니다.</span>
                                                          )}
                                                        </div>
                                                      );
                                                    })()}
                                                  </div>
                                                )}
                                                {Math.abs(totalActualCostForComparison - totalContainerPaymentAmount) < 0.01 ? (
                                                  <div className="text-sm text-green-600 dark:text-green-400 mt-2">✓ 일치합니다!</div>
                                                ) : (
                                                  <div className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
                                                    ⚠ 일치하지 않습니다. 계산을 확인해주세요.
                                                    <div className="mt-1 text-xs">
                                                      오차 원인 확인 필요: 송장 금액 계산 방식과 컨테이너별 계산 방식이 일치하는지 확인이 필요합니다.
                                                    </div>
                                                  </div>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {/* 컨테이너 원가 평균 */}
                              <div className="pt-4 mt-4 border-t border-blue-300 dark:border-blue-700">
                                <div className="font-semibold text-blue-900 dark:text-blue-100 text-sm mb-2">
                                  컨테이너 원가 평균 (참고용)
                                </div>
                                <div className="ml-4 space-y-1 text-xs">
                                  <div>
                                    각 컨테이너 원가(kg당)의 합 = {containerCosts.map((item) => item.containerPurchaseCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })).join(' + ')}원/kg
                                  </div>
                                  <div>
                                    컨테이너 수 = {containerCosts.length}개
                                  </div>
                                  <div className="pt-2 border-t border-blue-300 dark:border-blue-700 font-semibold text-blue-900 dark:text-blue-100">
                                    평균 원가 = ({containerCosts.map((item) => item.containerPurchaseCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })).join(' + ')}) ÷ {containerCosts.length} = {averageContainerCost.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg
                                  </div>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}

                {/* 컨테이너 정보 및 예정원가 */}
                {tradeOrder?.containers && tradeOrder.containers.length > 0 && (
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="text-sm font-semibold mb-3 text-blue-900 dark:text-blue-100">컨테이너 정보 및 예정원가</h4>
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-blue-300 dark:border-blue-700">
                              <th className="text-left p-2 font-semibold text-blue-900 dark:text-blue-100">컨테이너 번호</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">중량 (MT)</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">베일</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">단가</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">예정원가</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tradeOrder?.containers?.map((container, index) => {
                              if (!container.id) return null; // id가 없으면 스킵
                              const containerId = String(container.id);
                              const calculatedCost = calculatedContainerCosts[containerId];
                              const currentCost = containerPendingPurchaseCosts[containerId];
                              const displayCost = currentCost !== null && currentCost !== undefined ? currentCost : calculatedCost;
                              
                              return (
                                <tr key={containerId} className="border-b border-blue-200 dark:border-blue-800">
                                  <td className="p-2">{container.containerNo}</td>
                                  <td className="p-2 text-right">{container.weight ? Number(container.weight).toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '-'}</td>
                                  <td className="p-2 text-right">{(container.salesBales ?? container.tradeBales) != null ? Number(container.salesBales ?? container.tradeBales).toLocaleString('ko-KR') : '-'}</td>
                                  <td className="p-2 text-right">{container.unitPrice ? Number(container.unitPrice).toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '-'}</td>
                                  <td className="p-2">
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="text"
                                        value={displayCost !== null && displayCost !== undefined
                                          ? formatNumberWithDecimals(displayCost)
                                          : ''}
                                        onChange={(e) => {
                                          const num = parseNumber(e.target.value);
                                          setContainerPendingPurchaseCosts((prev) => ({
                                            ...prev,
                                            [containerId]: num ?? null,
                                          }));
                                          // 수동 입력으로 표시
                                          setManuallyEditedContainers((prev) => {
                                            const next = new Set(prev);
                                            if (num !== null && num !== undefined) {
                                              next.add(containerId);
                                            } else {
                                              next.delete(containerId);
                                            }
                                            return next;
                                          });
                                        }}
                                        onBlur={(e) => {
                                          const num = parseNumber(e.target.value);
                                          setContainerPendingPurchaseCosts((prev) => ({
                                            ...prev,
                                            [containerId]: num ?? null,
                                          }));
                                          // 수동 입력으로 표시
                                          setManuallyEditedContainers((prev) => {
                                            const next = new Set(prev);
                                            if (num !== null && num !== undefined) {
                                              next.add(containerId);
                                            }
                                            return next;
                                          });
                                        }}
                                        placeholder={calculatedCost !== undefined ? formatNumberWithDecimals(calculatedCost) : "예정원가 입력"}
                                        className="w-full text-right"
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </ScrollArea>
        <DrawerFooter className="border-t border-border">
          <div className="flex justify-end gap-2">
            <DrawerClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
            <Button
              type="button"
              onClick={handleSubmit(internalSubmit)}
              disabled={isSubmitting || !isDirty}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-4 w-4" />
                  저장
                </>
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

