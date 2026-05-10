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
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X, Info, Loader2, Save, Search } from 'lucide-react';
import api from '@/lib/api';
import { DatePicker } from '@/components/schedules/date-picker';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { type TradeOrder, useTradeOrder } from '@/lib/hooks/use-trade-orders';
import { useCalculateWarehouseIgobi } from '@/lib/hooks/use-warehouse-igobi';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseNumber, formatNumber, formatNumberWithDecimals } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface InboundConfirmedFormData {
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
  appliedExchangeRate?: number | null;
  quotaCost?: number | null;
  warehouse?: string | null;
  igodate?: string | null;
  quarantineDate?: string | null;
  dtDate?: string | null;
}

interface InboundConfirmedEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeOrder?: TradeOrder | null;
  labelResolvers?: {
    destination?: (code?: string | null) => string;
  };
  onSubmit?: (data: InboundConfirmedFormData) => void;
}

const InfoRow = ({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1 ${className || ''}`}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

export function InboundConfirmedEditDrawer({
  open,
  onOpenChange,
  tradeOrder,
  labelResolvers,
  onSubmit,
}: InboundConfirmedEditDrawerProps) {
  const isMobile = useIsMobile();
  
  // 코드 로드
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: currencyCodes = [] } = useCodesByCategory('CURRENCY');
  
  // TradeOrder에서 베일과 중량 계산
  const totalBales = React.useMemo(() => {
    if (tradeOrder?.containers) {
      return tradeOrder.containers.reduce((sum, container) => {
        return sum + ((container.salesBales ?? container.tradeBales) != null ? Number(container.salesBales ?? container.tradeBales) : 0);
      }, 0);
    }
    return 0;
  }, [tradeOrder]);

  // 전체 중량 계산: 백엔드와 동일한 로직 사용 (totalAmount 우선, 없으면 invoiceWeight)
  const totalWeight = React.useMemo(() => {
    // 백엔드 로직: container.order.totalAmount 우선, 없으면 container.order.invoiceWeight
    if (tradeOrder?.totalAmount) {
      return Number(tradeOrder.totalAmount);
    }
    if (tradeOrder?.invoiceWeight) {
      return Number(tradeOrder.invoiceWeight);
    }
    // 둘 다 없으면 컨테이너들의 weight 합계 (fallback)
    if (tradeOrder?.containers) {
      return tradeOrder.containers.reduce((sum, container) => {
        return sum + (container.weight != null ? Number(container.weight) : 0);
      }, 0);
    }
    return 0;
  }, [tradeOrder]);

  // 컨테이너 수량 계산
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

  // 입고 확정 데이터는 TradeOrder에 포함되어 있음 (추가 조회 필요)
  const { data: tradeOrderData } = useTradeOrder(tradeOrder?.id);
  const confirmedInboundData = tradeOrderData?.confirmedInbound;

  // 창고 목록 조회
  const { data: warehouses = [] } = useWarehouses();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<InboundConfirmedFormData>({
    defaultValues: {
      warehouse: '',
      igodate: '',
      quarantineDate: '',
      dtDate: '',
      customsFee: null,
      firstTierLoadingFee: null,
      doCost: null,
      quarantineAgencyFee: null,
      customsDuty: null,
      additionalItem: null,
      bankFee: null,
      quarantineWorkCost: null,
      spot: null,
      document: null,
      igobi: null,
      extractionFee: null,
      sto: null,
      fumigationQuarantine: null,
      fee: null,
      sampleCollection: null,
      quotaCost: null,
      dayExchangeRate: null,
      appliedExchangeRate: null,
    },
  });

  // ETA 환율 입력용 로컬 문자열 (소수점 입력 중 '1400.' 유지)
  const [dayExchangeRateInput, setDayExchangeRateInput] = React.useState('');
  // 확정환율 입력용 (비워두면 ETA+10 사용, 직접 입력 가능)
  const [appliedExchangeRateInput, setAppliedExchangeRateInput] = React.useState('');

  // 기존 입고 확정 데이터 로드
  React.useEffect(() => {
    if (open && confirmedInboundData) {
      reset({
        warehouse: confirmedInboundData.warehouse || '',
        igodate: confirmedInboundData.igodate || '',
        quarantineDate: confirmedInboundData.quarantineDate || '',
        dtDate: confirmedInboundData.dtDate || '',
        customsFee: confirmedInboundData.customsFee ?? null,
        firstTierLoadingFee: confirmedInboundData.firstTierLoadingFee ?? null,
        doCost: confirmedInboundData.doCost ?? null,
        quarantineAgencyFee: confirmedInboundData.quarantineAgencyFee ?? null,
        customsDuty: confirmedInboundData.customsDuty ?? null,
        additionalItem: confirmedInboundData.additionalItem ?? null,
        bankFee: confirmedInboundData.bankFee ?? null,
        quarantineWorkCost: confirmedInboundData.quarantineWorkCost ?? null,
        spot: confirmedInboundData.spot ?? null,
        document: confirmedInboundData.document ?? null,
        igobi: confirmedInboundData.igobi ?? null,
        extractionFee: confirmedInboundData.extractionFee ?? null,
        sto: confirmedInboundData.sto ?? null,
        fumigationQuarantine: confirmedInboundData.fumigationQuarantine ?? null,
        fee: confirmedInboundData.fee ?? null,
        sampleCollection: confirmedInboundData.sampleCollection ?? null,
        quotaCost: confirmedInboundData.quotaCost ?? null,
        dayExchangeRate: confirmedInboundData.dayExchangeRate ?? null,
        appliedExchangeRate: confirmedInboundData.appliedExchangeRate ?? null,
      });
      const v = confirmedInboundData.dayExchangeRate;
      setDayExchangeRateInput(v != null ? formatNumberWithDecimals(Number(v)) : '');
      const av = confirmedInboundData.appliedExchangeRate;
      setAppliedExchangeRateInput(av != null ? formatNumberWithDecimals(Number(av)) : '');
    } else if (open && tradeOrder?.pendingInbound) {
      // 입고 예정 데이터를 기본값으로 사용
      const pending = tradeOrder.pendingInbound;
      // dayExchangeRate는 입고 예정 데이터에서 그대로 사용 (없으면 null)
      reset({
        warehouse: pending.warehouse || '',
        igodate: pending.igodate || '',
        quarantineDate: pending.quarantineDate || '',
        dtDate: pending.dtDate || '',
        customsFee: pending.customsFee ?? null,
        firstTierLoadingFee: pending.firstTierLoadingFee ?? null,
        doCost: pending.doCost ?? null,
        quarantineAgencyFee: pending.quarantineAgencyFee ?? null,
        customsDuty: pending.customsDuty ?? null,
        additionalItem: pending.additionalItem ?? null,
        bankFee: pending.bankFee ?? null,
        quarantineWorkCost: pending.quarantineWorkCost ?? null,
        spot: pending.spot ?? null,
        document: pending.document ?? null,
        igobi: pending.igobi ?? null,
        extractionFee: pending.extractionFee ?? null,
        sto: pending.sto ?? null,
        fumigationQuarantine: pending.fumigationQuarantine ?? null,
        fee: pending.fee ?? null,
        sampleCollection: pending.sampleCollection ?? null,
        quotaCost: pending.quotaCost ?? null,
        dayExchangeRate: null,
        appliedExchangeRate: null,
      });
      setDayExchangeRateInput('');
      setAppliedExchangeRateInput('');
    } else if (open) {
      reset({
        warehouse: '',
        igodate: '',
        quarantineDate: '',
        dtDate: '',
        customsFee: null,
        firstTierLoadingFee: null,
        doCost: null,
        quarantineAgencyFee: null,
        customsDuty: null,
        additionalItem: null,
        bankFee: null,
        quarantineWorkCost: null,
        spot: null,
        document: null,
        igobi: null,
        extractionFee: null,
        sto: null,
        fumigationQuarantine: null,
        fee: null,
        sampleCollection: null,
        quotaCost: null,
        dayExchangeRate: null,
        appliedExchangeRate: null,
      });
      setDayExchangeRateInput('');
      setAppliedExchangeRateInput('');
    }
  }, [open, confirmedInboundData, tradeOrder, reset]);

  // 훈증 유무가 'Y'인지 확인 (계약 레벨 데이터 사용)
  const hasFumigation = React.useMemo(() => {
    return tradeOrder?.fumigation === 'Y';
  }, [tradeOrder?.fumigation]);

  // 현물 유무가 'Y'인지 확인 (주문 레벨 데이터 사용)
  const hasSpot = React.useMemo(() => {
    return tradeOrder?.spot === 'Y';
  }, [tradeOrder?.spot]);

  // payments는 TradeOrder에서 가져오기
  const payments = tradeOrder?.payments ?? [];
  const paymentMethods = payments
    .map((payment: any) => payment.method)
    .filter((method): method is string => method !== null && method !== undefined && method.trim() !== '');

  const paymentMethodsUpper = paymentMethods.map((method) => method.toUpperCase().trim());
  const hasLC = paymentMethodsUpper.some((method) => method.includes('LC'));
  const hasTTDAAsOne = paymentMethodsUpper.some((method) => method.includes('TT/DA') || method.includes('DA/TT'));
  const hasTTOnly = paymentMethodsUpper.some((method) => method === 'TT' || (method.includes('TT') && !method.includes('DA')));
  const hasDAOnly = paymentMethodsUpper.some((method) => method === 'DA' || (method.includes('DA') && !method.includes('TT')));
  const hasTTAndDASeparate = hasTTOnly && hasDAOnly && !hasTTDAAsOne;
  const hasTTDA = hasTTDAAsOne || hasTTAndDASeparate;
  const shouldAutoCalculateBankFee = hasLC || hasTTDA || hasDAOnly || hasTTOnly;

  // 편집 모드: confirmedInboundData 또는 pendingInbound가 있으면 자동 계산 스킵
  // (reset이 저장값을 세팅한 뒤, watch()가 아직 반영 전이라 타이밍 이슈 발생 → 소스 데이터로 판단)
  const hasSavedData = Boolean(confirmedInboundData || tradeOrder?.pendingInbound);

  // 소독비(훈증검역) 자동 계산 (훈증 유무가 'Y'이고 컨테이너 수량이 있으면 130000 * 컨테이너 수량)
  React.useEffect(() => {
    if (hasSavedData) return;
    if (hasFumigation && containerCount > 0) {
      const calculatedValue = 130000 * containerCount;
      setValue('fumigationQuarantine', calculatedValue, { shouldDirty: true });
    } else if (!hasFumigation) {
      setValue('fumigationQuarantine', 0, { shouldDirty: true });
    }
  }, [hasSavedData, hasFumigation, containerCount, setValue]);

  // 현물 자동 계산 (현물 유무가 'Y'이면 240000)
  React.useEffect(() => {
    if (hasSavedData) return;
    if (hasSpot) {
      setValue('spot', 240000, { shouldDirty: true });
    } else if (!hasSpot) {
      setValue('spot', 0, { shouldDirty: true });
    }
  }, [hasSavedData, hasSpot, setValue]);

  // 관세 자동 계산 (관세 유무가 'Y'이고 컨테이너 수량이 있으면 300000 * 컨테이너 수량)
  React.useEffect(() => {
    if (hasSavedData) return;
    if (tradeOrder?.customsDuty === 'Y' && containerCount > 0) {
      const calculatedValue = 300000 * containerCount;
      setValue('customsDuty', calculatedValue);
    } else if (tradeOrder?.customsDuty === 'N') {
      setValue('customsDuty', 0);
    }
  }, [hasSavedData, tradeOrder?.customsDuty, containerCount, setValue]);

  // 쿼터 비용 기본값 설정 (쿼터 유무가 'Y'이면 5원)
  React.useEffect(() => {
    if (hasSavedData) return;
    if (tradeOrder?.quota === 'Y') {
      setValue('quotaCost', 5, { shouldDirty: true });
    } else {
      setValue('quotaCost', undefined, { shouldDirty: true });
    }
  }, [hasSavedData, tradeOrder?.quota, setValue]);

  // 은행수수료 자동 계산
  React.useEffect(() => {
    if (!tradeOrder) return;
    if (hasSavedData) return;

    let calculatedBankFee = 0;

    // 결제조건이 있는지 확인
    if (hasLC) {
      if (containerCount > 0) {
        calculatedBankFee = 300000 * containerCount;
      }
    }
    // 2. TT/DA가 하나의 결제조건으로 있거나, TT와 DA가 각각 별도로 있으면 TT/DA로 처리 (30,000)
    else if (hasTTDA) {
      calculatedBankFee = 30000;
    }
    // 3. DA만 있는 경우 (30,000)
    else if (hasDAOnly) {
      calculatedBankFee = 30000;
    }
    // 4. TT만 있는 경우 (20,000)
    else if (hasTTOnly) {
      calculatedBankFee = 20000;
    }

    setValue('bankFee', calculatedBankFee);
  }, [hasSavedData, tradeOrder, hasLC, hasTTDA, hasDAOnly, hasTTOnly, containerCount, setValue]);

  // watch values
  const warehouseValue = watch('warehouse');
  const igodateValue = watch('igodate');
  const quarantineDateValue = watch('quarantineDate');
  const dtDateValue = watch('dtDate');
  const customsFeeValue = watch('customsFee');
  const firstTierLoadingFeeValue = watch('firstTierLoadingFee');
  const doCostValue = watch('doCost');
  const quarantineAgencyFeeValue = watch('quarantineAgencyFee');
  const customsDutyValue = watch('customsDuty');
  const additionalItemValue = watch('additionalItem');
  const bankFeeValue = watch('bankFee');
  const quarantineWorkCostValue = watch('quarantineWorkCost');
  const spotValue = watch('spot');
  const documentValue = watch('document') ?? undefined;
  const igobiValue = watch('igobi');
  const extractionFeeValue = watch('extractionFee');
  const stoValue = watch('sto');
  const fumigationQuarantineValue = watch('fumigationQuarantine');
  const feeValue = watch('fee');
  const sampleCollectionValue = watch('sampleCollection');
  const quotaCostValue = watch('quotaCost');
  const dayExchangeRateValue = watch('dayExchangeRate');

  // ETA 날짜 계산 (이고비 자동 계산용)
  const etaDateString = React.useMemo(() => {
    if (tradeOrder?.etaDate) {
      return tradeOrder.etaDate;
    }
    return null;
  }, [tradeOrder]);

  // 이고비 자동 계산
  const { mutate: calculateWarehouseIgobiMutation, isPending: isCalculatingIgobi } = useCalculateWarehouseIgobi();

  React.useEffect(() => {
    if (warehouseValue && etaDateString && open) {
      calculateWarehouseIgobiMutation(
        {
          warehouseCode: warehouseValue,
          targetDate: etaDateString,
        },
        {
          onSuccess: (data) => {
            if (data?.igobi != null) {
              setValue('igobi', data.igobi, { shouldDirty: true });
            }
          },
        }
      );
    }
  }, [warehouseValue, etaDateString, open, calculateWarehouseIgobiMutation, setValue]);

  // 단가 계산
  const unitPriceValue = React.useMemo(() => {
    return tradeOrder?.containers?.[0]?.unitPrice ?? tradeOrder?.unitPrice ?? 0;
  }, [tradeOrder]);

  // 통화 코드
  const currencyCode = tradeOrder?.currencyCode || 'USD';
  const normalizedCurrencyCode = currencyCode
    ? currencyCode.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3) || 'USD'
    : 'USD';

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

  // 결제 정보에서 가중 평균 환율 계산
  const weightedAverageExchangeRate = React.useMemo(() => {
    const payments = tradeOrder?.payments ?? [];
    
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
  }, [tradeOrder?.payments]);

  // 확정환율: 직접 입력값 우선, 없으면 ETA 환율+10 (백엔드와 동일)
  const appliedExchangeRateFormValue = watch('appliedExchangeRate');
  const appliedExchangeRateValue = React.useMemo(() => {
    if (appliedExchangeRateFormValue !== undefined && appliedExchangeRateFormValue !== null && Number(appliedExchangeRateFormValue) > 0) {
      return Number(appliedExchangeRateFormValue);
    }
    if (dayExchangeRateValue !== undefined && dayExchangeRateValue !== null && dayExchangeRateValue > 0) {
      return dayExchangeRateValue + 10;
    }
    return 0;
  }, [appliedExchangeRateFormValue, dayExchangeRateValue]);

  // 구매원가 계산: (적용환율 × 단가 / 1000) + (모든 비용 합계 / 총량 / 1000) + 쿼터비용
  const purchaseCost = React.useMemo(() => {
    const appliedRate = appliedExchangeRateValue ?? 0;
    const unitPrice = unitPriceValue ?? 0;
    const qty = containerCount;
    
    // 첫 번째 부분: 적용환율 × 단가 / 1000 (적용환율 = ETA 환율 + 10)
    const firstPart = (appliedRate * unitPrice) / 1000;
    
    // 총량
    const totalAmount = totalWeight;
    
    // 두 번째 부분: 모든 비용 합계 / 총량 / 1000
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
    // 이고비는 컨테이너 수량만 곱함
    const igobi = (igobiValue ?? 0) * qty;
    const extractionFee = extractionFeeValue ?? 0;
    const sto = stoValue ?? 0;
    const fumigationQuarantine = fumigationQuarantineValue ?? 0;
    const fee = feeValue ?? 0;
    const sampleCollection = sampleCollectionValue ?? 0;
    
    // 모든 항목 합계 (쿼터 비용 제외)
    const sum = customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + igobi + extractionFee + sto + fumigationQuarantine + fee + sampleCollection;
    
    // 합계 / 총량 / 1000
    let secondPart = 0;
    if (totalAmount > 0) {
      secondPart = sum / totalAmount / 1000;
    }
    
    // 쿼터 비용
    const quotaCost = quotaCostValue ?? 0;
    
    return firstPart + secondPart + quotaCost;
  }, [
    appliedExchangeRateValue,
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

  // 환율 조회 버튼 클릭 시 ETA 환율·확정환율 입력 필드에 자동 입력 (확정환율 = ETA+10)
  React.useEffect(() => {
    if (exchangeRate !== null && exchangeRate !== undefined && !dayExchangeRateValue) {
      setValue('dayExchangeRate', exchangeRate, { shouldDirty: true });
      setDayExchangeRateInput(formatNumberWithDecimals(exchangeRate));
    }
  }, [exchangeRate, dayExchangeRateValue, setValue]);
  React.useEffect(() => {
    if (exchangeRate !== null && exchangeRate !== undefined && appliedExchangeRateInput === '') {
      const ratePlus10 = exchangeRate + 10;
      setValue('appliedExchangeRate', ratePlus10, { shouldDirty: true });
      setAppliedExchangeRateInput(formatNumberWithDecimals(ratePlus10));
    }
  }, [exchangeRate, setValue]);

  // 컨테이너별 확정원가 상태 관리
  const [containerConfirmedPurchaseCosts, setContainerConfirmedPurchaseCosts] = React.useState<Record<string, number | null>>({});
  
  // 컨테이너별 STO, DT, 작업비 비용 상태 관리
  const [containerStoCosts, setContainerStoCosts] = React.useState<Record<string, number | null>>({});
  const [containerDtCosts, setContainerDtCosts] = React.useState<Record<string, number | null>>({});
  const [containerWorkFees, setContainerWorkFees] = React.useState<Record<string, number | null>>({});
  const [containerOnsiteWorkFees, setContainerOnsiteWorkFees] = React.useState<Record<string, number | null>>({});
  // 컨테이너 STO/DT/작업비 변경 시 저장 버튼 활성화용 (폼 isDirty와 별도)
  const [hasContainerCostChanges, setHasContainerCostChanges] = React.useState(false);

  // 컨테이너별 확정원가 자동 계산 (ETA 환율 + 10원 적용환율 사용)
  const calculatedContainerConfirmedCosts = React.useMemo(() => {
    if (!tradeOrder?.containers || tradeOrder.containers.length === 0) {
      return {};
    }

    // 확정원가 계산용 환율: 백엔드와 동일한 로직 사용
    // appliedExchangeRate 우선 사용, 없으면 dayExchangeRate + 10, 둘 다 없으면 0
    const appliedRate = appliedExchangeRateValue !== undefined && appliedExchangeRateValue !== null
      ? appliedExchangeRateValue
      : (dayExchangeRateValue !== undefined && dayExchangeRateValue !== null && dayExchangeRateValue > 0)
        ? dayExchangeRateValue + 10
        : 0;
    
    // 전체 비용 합계 계산
    // 백엔드와 동일: DB 필드(quantity) 사용하지 않고 실제 컨테이너 개수 계산
    const qty = containerCount ?? 0;
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
    const fumigationQuarantine = fumigationQuarantineValue ?? 0;
    const fee = feeValue ?? 0;
    const sampleCollection = sampleCollectionValue ?? 0;
    // STO는 컨테이너별로 관리되므로 전체 비용에서 제외
    const totalCosts = customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + igobi + extractionFee + fumigationQuarantine + fee + sampleCollection;
    
    // 쿼터 비용 (kg당)
    const quotaCostPerKg = quotaCostValue ?? 0;

    // 각 컨테이너별 확정원가 계산
    const costs: Record<string, number> = {};
    tradeOrder.containers.forEach((container) => {
      if (!container.id) return; // id가 없으면 스킵
      const containerId = String(container.id); // 문자열로 변환
      const containerUnitPrice = container.unitPrice ? Number(container.unitPrice) : (unitPriceValue ?? 0);
      const containerWeight = container.weight != null ? Number(container.weight) : 0;
      
      // 컨테이너별 STO, DT, 작업비 비용 (입력된 값이 있으면 우선 사용, 없으면 저장된 값 사용)
      const containerStoCost = containerStoCosts[containerId] !== undefined 
        ? (containerStoCosts[containerId] ?? 0)
        : (container.stoCost != null && container.stoCost !== '' ? Number(container.stoCost) : 0);
      const containerDtCost = containerDtCosts[containerId] !== undefined 
        ? (containerDtCosts[containerId] ?? 0)
        : (container.dtCost != null && container.dtCost !== '' ? Number(container.dtCost) : 0);
      const containerWorkFeeVal = (container as { workFee?: number | string | null }).workFee;
      const containerWorkFee = containerWorkFees[containerId] !== undefined 
        ? (containerWorkFees[containerId] ?? 0)
        : (containerWorkFeeVal != null && containerWorkFeeVal !== '' ? Number(containerWorkFeeVal) : 0);
      const containerOnsiteVal = (container as { onsiteWorkFee?: number | string | null }).onsiteWorkFee;
      const containerOnsiteWorkFee =
        containerOnsiteWorkFees[containerId] !== undefined
          ? (containerOnsiteWorkFees[containerId] ?? 0)
          : containerOnsiteVal != null && containerOnsiteVal !== ''
            ? Number(containerOnsiteVal)
            : 0;
      
      // 첫 번째 부분: 적용환율 × 컨테이너 단가(톤당) / 1000
      const firstPartPerKg = (appliedRate * containerUnitPrice) / 1000;
      
      // 두 번째 부분: 전체 비용 합계 / 전체 중량 / 1000
      const secondPartPerKg = totalWeight > 0 ? totalCosts / totalWeight / 1000 : 0;
      
      // 컨테이너별 STO, DT, 창고·현장 작업비 (kg당)
      const stoDtWorkCostPerKg = containerWeight > 0
        ? (containerStoCost + containerDtCost + containerWorkFee + containerOnsiteWorkFee) / containerWeight / 1000
        : 0;
      
      // 최종 원가 (kg당)
      const purchaseCostPerKg = firstPartPerKg + secondPartPerKg + quotaCostPerKg + stoDtWorkCostPerKg;
      
      costs[containerId] = purchaseCostPerKg;
    });

    return costs;
  }, [
    tradeOrder?.containers,
    appliedExchangeRateValue,
    dayExchangeRateValue,
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
    fumigationQuarantineValue,
    feeValue,
    sampleCollectionValue,
    quotaCostValue,
    containerStoCosts,
    containerDtCosts,
    containerWorkFees,
    containerOnsiteWorkFees,
  ]);

  // 수동 입력 여부 추적
  const [manuallyEditedConfirmedContainers, setManuallyEditedConfirmedContainers] = React.useState<Set<string>>(new Set());

  // 컨테이너 확정원가 및 STO, DT 초기화 (저장된 값이 있을 때) - drawer가 열릴 때 한 번만 실행
  const hasInitialized = React.useRef(false);
  React.useEffect(() => {
    if (tradeOrder?.containers && open && !hasInitialized.current) {
      // 초기화 시점에 calculatedContainerConfirmedCosts가 준비될 때까지 대기
      const timer = setTimeout(() => {
        setContainerConfirmedPurchaseCosts((prev) => {
          const updated: Record<string, number | null> = {};
          // 저장된 값이 있어도 자동 업데이트가 되도록 수동 입력으로 간주하지 않음
          if (!tradeOrder?.containers) return prev;
          tradeOrder.containers.forEach((container) => {
            if (!container.id) return; // id가 없으면 스킵
            const containerId = String(container.id); // 문자열로 변환
            // 저장된 값이 있으면 우선 사용, 없으면 계산된 값 사용
            if (container.confirmedPurchaseCost) {
              updated[containerId] = Number(container.confirmedPurchaseCost);
            } else {
              // 저장된 값이 없으면 계산된 값 사용 (아직 계산되지 않았을 수 있음)
              updated[containerId] = calculatedContainerConfirmedCosts[containerId] ?? null;
            }
          });
          hasInitialized.current = true;
          return updated;
        });
      }, 0);
      
      return () => clearTimeout(timer);
      
      // 컨테이너별 STO, DT 초기화
      setContainerStoCosts((prev) => {
        const updated: Record<string, number | null> = {};
        if (!tradeOrder?.containers) return prev;
        tradeOrder.containers.forEach((container) => {
          if (!container.id) return;
          const containerId = String(container.id);
          updated[containerId] = container.stoCost != null && container.stoCost !== '' ? Number(container.stoCost) : null;
        });
        return updated;
      });
      
      setContainerDtCosts((prev) => {
        const updated: Record<string, number | null> = {};
        if (!tradeOrder?.containers) return prev;
        tradeOrder.containers.forEach((container) => {
          if (!container.id) return;
          const containerId = String(container.id);
          updated[containerId] = container.dtCost != null && container.dtCost !== '' ? Number(container.dtCost) : null;
        });
        return updated;
      });
      // 컨테이너별 작업비 초기화 (저장된 값이 있으면 사용, 없으면 null)
      setContainerWorkFees((prev) => {
        const updated = { ...prev };
        if (!tradeOrder?.containers) return prev;
        tradeOrder.containers.forEach((container) => {
          if (!container.id) return;
          const containerId = String(container.id);
          const workFee = (container as { workFee?: number | string | null }).workFee;
          updated[containerId] = workFee != null && workFee !== '' ? Number(workFee) : null;
        });
        return updated;
      });
      setContainerOnsiteWorkFees((prev) => {
        const updated = { ...prev };
        if (!tradeOrder?.containers) return prev;
        tradeOrder.containers.forEach((container) => {
          if (!container.id) return;
          const containerId = String(container.id);
          const v = (container as { onsiteWorkFee?: number | string | null }).onsiteWorkFee;
          updated[containerId] = v != null && v !== '' ? Number(v) : null;
        });
        return updated;
      });
    } else if (!open) {
      // drawer가 닫히면 초기화 플래그 리셋
      hasInitialized.current = false;
      setContainerConfirmedPurchaseCosts({});
      setContainerStoCosts({});
      setContainerDtCosts({});
      setContainerWorkFees({});
      setContainerOnsiteWorkFees({});
      setManuallyEditedConfirmedContainers(new Set());
      setHasContainerCostChanges(false);
    }
  }, [tradeOrder?.containers, open]);

  // 입력 필드 변경 시 계산된 값으로 자동 업데이트 (수동 입력이 아닌 경우만)
  // calculatedContainerConfirmedCosts의 변경을 추적하기 위해 useRef 사용
  const prevCalculatedCostsRef = React.useRef<Record<string, number>>({});
  
  React.useEffect(() => {
    if (tradeOrder?.containers && open) {
      // 실제로 변경된 값이 있는지 확인
      let hasActualChanges = false;
      const currentCosts = calculatedContainerConfirmedCosts;
      const prevCosts = prevCalculatedCostsRef.current;
      
      // 변경사항 확인
      for (const containerId in currentCosts) {
        if (currentCosts[containerId] !== prevCosts[containerId]) {
          hasActualChanges = true;
          break;
        }
      }
      
      // 이전 값 업데이트
      prevCalculatedCostsRef.current = { ...currentCosts };
      
      if (hasActualChanges) {
        setContainerConfirmedPurchaseCosts((prev) => {
          const updated: Record<string, number | null> = {};
          let hasChanges = false;
          if (!tradeOrder?.containers) return prev;
          tradeOrder.containers.forEach((container) => {
            if (!container.id) return; // id가 없으면 스킵
            const containerId = String(container.id); // 문자열로 변환
            const calculatedValue = calculatedContainerConfirmedCosts[containerId];
            
            // 수동으로 입력한 컨테이너는 유지
            if (manuallyEditedConfirmedContainers.has(containerId)) {
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
    }
  }, [
    calculatedContainerConfirmedCosts,
    tradeOrder?.containers,
    open,
    manuallyEditedConfirmedContainers,
  ]);

  const internalSubmit = async (data: InboundConfirmedFormData) => {
    if (onSubmit) {
      // 적용환율과 구매원가를 추가하여 저장
      // 관세/소독비 등은 반드시 명시적으로 포함 (undefined면 백엔드에서 미갱신되므로)
      const submitData = {
        ...data,
        customsFee: data.customsFee ?? null,
        customsDuty: data.customsDuty ?? null,
        fumigationQuarantine: data.fumigationQuarantine ?? null,
        appliedExchangeRate: appliedExchangeRateValue !== undefined && appliedExchangeRateValue !== null ? appliedExchangeRateValue : null,
        purchaseCost: purchaseCost > 0 ? purchaseCost : null,
        containerConfirmedPurchaseCosts: tradeOrder?.containers && tradeOrder.containers.length > 0
          ? (() => {
              const costs = tradeOrder.containers
                .filter((container) => container.id) // id가 있는 컨테이너만 필터링
                .map((container) => {
                  const containerId = String(container.id!); // 문자열로 변환
                  return {
                    containerId: containerId,
                    confirmedPurchaseCost: containerConfirmedPurchaseCosts[containerId] !== undefined 
                      ? containerConfirmedPurchaseCosts[containerId] 
                      : null,
                    stoCost: containerStoCosts[containerId] !== undefined 
                      ? containerStoCosts[containerId] 
                      : null,
                    dtCost: containerDtCosts[containerId] !== undefined 
                      ? containerDtCosts[containerId] 
                      : null,
                    workFee: containerWorkFees[containerId] !== undefined 
                      ? containerWorkFees[containerId] 
                      : null,
                    onsiteWorkFee:
                      containerOnsiteWorkFees[containerId] !== undefined
                        ? containerOnsiteWorkFees[containerId]
                        : null,
                  };
                });
              return costs.length > 0 ? costs : undefined;
            })()
          : undefined,
      };
      await onSubmit(submitData);
    }
  };

  if (!tradeOrder) {
    return null;
  }

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
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>입고 확정 데이터 입력</DrawerTitle>
              <DrawerDescription>
                입고 확정 정보를 입력합니다.
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
                    value={tradeOrder.exporterName || '-'} 
                  />
                  <InfoRow 
                    label="수출국" 
                    value={tradeOrder.exportCountryName || '-'} 
                  />
                  <InfoRow 
                    label="쿼터 유무" 
                    value={tradeOrder.quota === 'Y' ? '있음' : (tradeOrder.quota === 'N' ? '없음' : '-')} 
                  />
                  <InfoRow 
                    label="훈증 유무" 
                    value={tradeOrder.fumigation === 'Y' ? '있음' : (tradeOrder.fumigation === 'N' ? '없음' : '-')} 
                  />
                  <InfoRow 
                    label="현물 유무" 
                    value={tradeOrder.spot === 'Y' ? '있음' : (tradeOrder.spot === 'N' ? '없음' : '-')} 
                  />
                  <InfoRow 
                    label="관세 유무" 
                    value={tradeOrder.customsDuty === 'Y' ? '있음' : (tradeOrder.customsDuty === 'N' ? '없음' : '-')} 
                  />
                  <InfoRow 
                    label="상품" 
                    value={tradeOrder.containers?.[0]?.product 
                      ? getProductName(tradeOrder.containers[0].product)
                      : tradeOrder.productName 
                        ? getProductName(tradeOrder.productName)
                        : '-'} 
                  />
                  <InfoRow label="BK" value={tradeOrder.bk || '-'} />
                  <InfoRow label="BL" value={tradeOrder.bl || '-'} />
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
                    value={tradeOrder.containers?.[0]?.currency
                      ? getCurrencyName(tradeOrder.containers[0].currency)
                      : tradeOrder.currencyName
                        ? getCurrencyName(tradeOrder.currencyName)
                        : '-'}
                  />
                  <InfoRow
                    label="Unit Price"
                    value={tradeOrder.containers?.[0]?.unitPrice
                      ? tradeOrder.containers[0].unitPrice.toLocaleString('ko-KR')
                      : tradeOrder.unitPrice
                        ? tradeOrder.unitPrice.toLocaleString('ko-KR')
                        : '-'}
                  />
                  <InfoRow 
                    label="도착지" 
                    value={tradeOrder.destinationName || '-'} 
                  />
                  <InfoRow 
                    label="ETA" 
                    value={tradeOrder.etaDate ? format(parseISO(tradeOrder.etaDate), 'yyyy-MM-dd') : '-'} 
                  />
                  {tradeOrder.payments && tradeOrder.payments.length > 0 && (
                    <InfoRow 
                      label="결제조건" 
                      value={tradeOrder.payments
                        .map((p) => p.method)
                        .filter((m): m is string => m !== null && m !== undefined && m.trim() !== '')
                        .join(', ')} 
                      className="col-span-4" 
                    />
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* 입고 확정 데이터 */}
            <form onSubmit={handleSubmit(internalSubmit)}>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                  입고 확정 데이터
                </h3>
              
              {/* 비용 입력 필드: 한 줄에 5개씩 (입고 확정 전용 배치, 환율만 ETA/적용환율) */}
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
                    {tradeOrder?.customsDuty === 'Y' && containerCount > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div>
                            관세 유무가 &apos;있음&apos;이므로 자동 계산됩니다.
                            <br />
                            300,000 × {containerCount.toLocaleString()} = {(300000 * containerCount).toLocaleString()}원
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <Input
                    id="customsDuty"
                    type="text"
                    value={formatNumber(customsDutyValue)}
                    onChange={(e) => {
                      const num = parseNumber(e.target.value);
                      setValue('customsDuty', num, { shouldDirty: true });
                    }}
                    placeholder={tradeOrder?.customsDuty === 'Y' && containerCount > 0 ? '자동 계산' : '0'}
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
                        {hasFumigation && containerCount > 0 ? (
                          <div>
                            훈증 유무가 &apos;있음&apos;이므로 자동 계산됩니다.
                            <br />
                            130,000 × {containerCount.toLocaleString()} ={' '}
                            {fumigationQuarantineValue?.toLocaleString() || (130000 * containerCount).toLocaleString()}
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
                    value={igodateValue || undefined}
                    onChange={(value) => {
                      setValue('igodate', value || undefined, { shouldDirty: true });
                    }}
                    placeholder="날짜 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quarantineDate">검역</Label>
                  <DatePicker
                    value={quarantineDateValue || undefined}
                    onChange={(value) => {
                      setValue('quarantineDate', value || undefined, { shouldDirty: true });
                    }}
                    placeholder="날짜 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dtDate">DT</Label>
                  <DatePicker
                    value={dtDateValue || undefined}
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
                    disabled={isCalculatingIgobi}
                  />
                  {isCalculatingIgobi && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      계산 중...
                    </div>
                  )}
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
                          {hasLC && containerCount > 0 && (
                            <div>LC: 300,000 × {containerCount.toLocaleString()} = {(300000 * containerCount).toLocaleString()}원</div>
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

              {/* 네 번째 줄: 수수료, 쿼터 비용, ETA 환율, 적용환율, 구매원가 */}
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
                    {tradeOrder?.quota === 'Y' && (
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
                    placeholder={tradeOrder?.quota === 'Y' ? '5' : '0'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dayExchangeRate">ETA 환율</Label>
                  <div className="relative">
                    <Input
                      id="dayExchangeRate"
                      type="text"
                      inputMode="decimal"
                      value={dayExchangeRateInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setDayExchangeRateInput(raw);
                        const num = parseNumber(raw);
                        setValue('dayExchangeRate', num !== undefined ? num : null, { shouldDirty: true });
                      }}
                      onBlur={() => {
                        const num = dayExchangeRateValue;
                        setDayExchangeRateInput(num != null ? formatNumberWithDecimals(num) : '');
                      }}
                      placeholder="1400"
                      className={etaDateString ? "pr-9" : ""}
                    />
                    {etaDateString && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const result = await refetchExchangeRate();
                            if (result.data?.rate === null || result.data?.rate === undefined) {
                              toast({
                                title: '환율 조회 실패',
                                description: '해당 날짜의 환율 정보를 가져올 수 없습니다.',
                                variant: 'destructive',
                              });
                            }
                          } catch (error) {
                            toast({
                              title: '환율 조회 실패',
                              description: '환율 조회 중 오류가 발생했습니다.',
                              variant: 'destructive',
                            });
                          }
                        }}
                        disabled={isExchangeRateLoading || !etaDateString}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isExchangeRateLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {exchangeRate !== null && (
                    <p className="text-xs text-muted-foreground">
                      조회된 환율: {formatNumberWithDecimals(exchangeRate)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="appliedExchangeRate">확정환율</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div>
                          비워두면 ETA 환율+10으로 계산됩니다. 직접 입력도 가능합니다.
                          <br />
                          {dayExchangeRateValue != null && dayExchangeRateValue > 0 && (
                            <>ETA 환율+10 = {formatNumberWithDecimals(dayExchangeRateValue)} + 10 = {formatNumberWithDecimals(dayExchangeRateValue + 10)}</>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="appliedExchangeRate"
                    type="text"
                    inputMode="decimal"
                    value={appliedExchangeRateInput !== '' ? appliedExchangeRateInput : (appliedExchangeRateValue > 0 ? formatNumberWithDecimals(appliedExchangeRateValue) : '')}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setAppliedExchangeRateInput(raw);
                      const num = parseNumber(raw);
                      setValue('appliedExchangeRate', num !== undefined ? num : null, { shouldDirty: true });
                    }}
                    onBlur={() => {
                      const num = watch('appliedExchangeRate');
                      if (num != null) {
                        setAppliedExchangeRateInput(formatNumberWithDecimals(num));
                      } else {
                        setAppliedExchangeRateInput('');
                      }
                    }}
                    placeholder={dayExchangeRateValue != null && dayExchangeRateValue > 0 ? `비워두면 ${formatNumberWithDecimals(dayExchangeRateValue + 10)} (ETA+10)` : 'ETA+10 또는 직접 입력'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>확정원가</Label>
                  <Input
                    type="text"
                    value={purchaseCost > 0 ? formatNumberWithDecimals(purchaseCost) : '-'}
                    readOnly
                    className="bg-muted"
                  />
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
                    <h4 className="text-sm font-semibold mb-3 text-muted-foreground">구매원가 계산 방법 (확인용)</h4>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium">1. 첫 번째 부분:</span> 적용환율 × 단가 / 1000
                        <div className="ml-4 mt-1 text-xs">
                          = {appliedExchangeRateValue?.toLocaleString('ko-KR') || '0'} × {unitPriceValue?.toLocaleString('ko-KR') || '0'} / 1000
                          = {((appliedExchangeRateValue ?? 0) * (unitPriceValue ?? 0) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">2. 두 번째 부분:</span> 모든 비용 합계 / 총량 / 1000
                        <div className="ml-4 mt-1 text-xs space-y-1">
                          <div>통관수수료 = {customsFee.toLocaleString('ko-KR')}원</div>
                          <div>1단적재료(검역이적료) = {firstTierLoadingFee.toLocaleString('ko-KR')}원</div>
                          <div>D/O 비용 = {doCost.toLocaleString('ko-KR')}원</div>
                          <div>검역대행 수수료 = {quarantineAgencyFee.toLocaleString('ko-KR')}원</div>
                          <div>관세 = {customsDuty.toLocaleString('ko-KR')}원</div>
                          <div>추가항목 = {additionalItem.toLocaleString('ko-KR')}원</div>
                          <div>은행 수수료 = {bankFee.toLocaleString('ko-KR')}원</div>
                          <div>검역 작업비 = {quarantineWorkCost.toLocaleString('ko-KR')}원</div>
                          <div>현물 = {spot.toLocaleString('ko-KR')}원</div>
                          <div>단미사료 = {document.toLocaleString('ko-KR')}원</div>
                          <div>이고비 = {igobiValue?.toLocaleString('ko-KR') || '0'} × {containerCount.toLocaleString('ko-KR')} (컨테이너 수량) = {igobi.toLocaleString('ko-KR')}원</div>
                          <div>적출비 = {extractionFee.toLocaleString('ko-KR')}원</div>
                          <div>STO = {sto.toLocaleString('ko-KR')}원</div>
                          <div>소독비(훈증검역) = {fumigationQuarantine.toLocaleString('ko-KR')}원</div>
                          <div>수수료 = {fee.toLocaleString('ko-KR')}원</div>
                          <div>샘플채취 = {sampleCollection.toLocaleString('ko-KR')}원</div>
                          <div className="font-medium pt-1">비용 합계 = {sum.toLocaleString('ko-KR')}원</div>
                          <div>총량 = {totalWeight.toLocaleString('ko-KR')}kg</div>
                          <div>
                            = {sum.toLocaleString('ko-KR')} / {totalWeight.toLocaleString('ko-KR')} / 1000
                            = {secondPart.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}원
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">3. 쿼터 비용:</span> {quotaCostValue?.toLocaleString('ko-KR') || '0'}원
                      </div>
                      <div className="pt-2 border-t">
                        <span className="font-semibold">최종 구매원가:</span> 첫 번째 부분 + 두 번째 부분 + 쿼터 비용
                        <div className="ml-4 mt-1 text-sm font-semibold text-foreground">
                          = {((appliedExchangeRateValue ?? 0) * (unitPriceValue ?? 0) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} + {' '}
                          {secondPart.toLocaleString('ko-KR', { maximumFractionDigits: 4 })} + {' '}
                          {quotaCostValue?.toLocaleString('ko-KR') || '0'} = {' '}
                          {formatNumberWithDecimals(purchaseCost)}
                        </div>
                      </div>
                      </div>
                      
                      {/* 실제 결제 금액과 원가 계산 금액 비교 */}
                      {(() => {
                        const payments = tradeOrder?.payments ?? [];
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
                        const appliedRate = appliedExchangeRateValue ?? 0;
                        const firstPartCostPerKg = (appliedRate * (unitPriceValue ?? 0)) / 1000;
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
                        const costCalculatedAmount = (purchaseCost ?? 0) * (totalWeight ?? 0) * 1000;
                        
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
                                    const paymentKRW = invoiceAmount !== null
                                      ? (ratio / 100) * invoiceAmount * exchangeRate
                                      : (ratio / 100) * (unitPriceValue ?? 0) * (totalWeight ?? 0) * exchangeRate / 1000;
                                    return (
                                      <div key={idx} className="ml-4">
                                        결제 {payment.sequence || idx + 1}: 
                                        {invoiceAmount !== null 
                                          ? ` (${ratio}% / 100) × ${invoiceAmount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} × ${exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} = ${paymentKRW.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`
                                          : ` (${ratio}% / 100) × ${unitPriceValue?.toLocaleString('ko-KR') || '0'} × ${totalWeight?.toLocaleString('ko-KR') || '0'} × ${exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} / 1000 = ${paymentKRW.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`}
                                      </div>
                                    );
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
                                  <div className="text-xs text-muted-foreground mb-1">
                                    ※ 적용 환율 사용: {appliedRate.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} (ETA 환율 + 10)
                                  </div>
                                  <div>원가(kg당, 원화) = {purchaseCost.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원</div>
                                  <div className="text-xs text-muted-foreground ml-2">
                                    = (적용 환율 {appliedRate.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} × 단가 {unitPriceValue?.toLocaleString('ko-KR') || '0'} / 1000) + (부대비용 합계 {sum.toLocaleString('ko-KR')}원 / 중량 / 1000) + 쿼터비용 {quotaCostValue?.toLocaleString('ko-KR') || '0'}원/kg
                                  </div>
                                  <div className="text-xs text-muted-foreground ml-2 mt-1">
                                    ※ 위 계산에서 이미 환율이 곱해져 원화 단위로 변환되었습니다.
                                  </div>
                                  <div className="mt-2">중량 = {totalWeight?.toLocaleString('ko-KR') || '0'} MT</div>
                                  <div className="font-semibold mt-2">
                                    원가를 이용한 결제 금액 = 원가(kg당, 원화) × 중량(MT) × 1000
                                  </div>
                                  <div className="ml-4">
                                    = {purchaseCost.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg × {totalWeight?.toLocaleString('ko-KR') || '0'} MT × 1000
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
                  const validPaymentsForComparison = (tradeOrder?.payments ?? []).filter(
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
                  
                  // 전체 비용 계산 (STO는 컨테이너별로 관리되므로 제외)
                  const totalCommonCosts = customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + extractionFee + fumigationQuarantine + fee + sampleCollection;
                  const totalIgobi = igobiPerContainer * qty;
                  const totalCosts = totalCommonCosts + totalIgobi;
                  
                  return (
                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <h4 className="text-sm font-semibold mb-3 text-blue-900 dark:text-blue-100">컨테이너 단위 원가 계산 (확인용)</h4>
                      <div className="space-y-4 text-xs text-blue-800 dark:text-blue-200">
                        <div>
                          <span className="font-medium">전체 공통 비용 (각 컨테이너 계산 시 전체 중량으로 나눔):</span>
                          <div className="ml-4 mt-1 space-y-1">
                            <div>통관수수료 = {customsFee.toLocaleString('ko-KR')}원</div>
                            <div>1단적재료(검역이적료) = {firstTierLoadingFee.toLocaleString('ko-KR')}원</div>
                            <div>D/O 비용 = {doCost.toLocaleString('ko-KR')}원</div>
                            <div>검역대행 수수료 = {quarantineAgencyFee.toLocaleString('ko-KR')}원</div>
                            <div>관세 = {customsDuty.toLocaleString('ko-KR')}원</div>
                            <div>추가항목 = {additionalItem.toLocaleString('ko-KR')}원</div>
                            <div>은행 수수료 = {bankFee.toLocaleString('ko-KR')}원</div>
                            <div>검역 작업비 = {quarantineWorkCost.toLocaleString('ko-KR')}원</div>
                            <div>현물 = {spot.toLocaleString('ko-KR')}원</div>
                            <div>단미사료 = {document.toLocaleString('ko-KR')}원</div>
                            <div>이고비 = {igobiPerContainer.toLocaleString('ko-KR')} × {qty.toLocaleString('ko-KR')} (컨테이너 수량) = {totalIgobi.toLocaleString('ko-KR')}원</div>
                            <div>적출비 = {extractionFee.toLocaleString('ko-KR')}원</div>
                            <div className="text-xs text-muted-foreground">※ STO, DT는 컨테이너별로 관리되므로 각 컨테이너별 원가 계산에 반영됩니다.</div>
                            <div>소독비(훈증검역) = {fumigationQuarantine.toLocaleString('ko-KR')}원</div>
                            <div>수수료 = {fee.toLocaleString('ko-KR')}원</div>
                            <div>샘플채취 = {sampleCollection.toLocaleString('ko-KR')}원</div>
                            <div className="font-medium pt-1">전체 공통 비용 합계 = {totalCosts.toLocaleString('ko-KR')}원</div>
                            <div className="text-xs text-blue-600 dark:text-blue-400 pt-1">
                              (각 컨테이너 계산 시: 전체 비용 합계 ÷ 전체 중량 ÷ 1000, 주문 단위 계산과 동일)
                            </div>
                          </div>
                        </div>
                        
                        {(() => {
                          // 적용환율 변수 정의
                          const appliedRateForContainer = appliedExchangeRateValue ?? 0;
                          
                          // 각 컨테이너의 원가(kg당)를 계산하여 배열로 저장
                          const containerCosts = tradeOrder?.containers?.map((container, index) => {
                            const containerUnitPrice = container.unitPrice ?? unitPriceValue ?? 0;
                            const containerWeight = container.weight != null ? Number(container.weight) : 0;
                            
                            // 컨테이너별 STO, DT 비용
                            const containerStoCost = container.stoCost != null && container.stoCost !== '' ? Number(container.stoCost) : 0;
                            const containerDtCost = container.dtCost != null && container.dtCost !== '' ? Number(container.dtCost) : 0;
                            
                            // 컨테이너별 첫 번째 부분 (kg당 원가): 적용환율 × 컨테이너 단가(톤당) / 1000
                            const containerFirstPartPerKg = (appliedRateForContainer * containerUnitPrice) / 1000;
                            
                            // 컨테이너별 두 번째 부분 (kg당 원가): 전체 비용 합계 / 전체 중량 / 1000
                            // 주문 단위 계산과 동일하게 전체 비용을 전체 중량으로 나눔 (kg당 비용은 모든 컨테이너에 동일)
                            const containerSecondPartPerKg = totalWeight > 0 
                              ? totalCosts / totalWeight / 1000
                              : 0;
                            
                            // 컨테이너별 쿼터 비용 (kg당 원가)
                            // 쿼터 비용은 이미 kg당 단가로 저장되어 있음
                            const containerQuotaCostPerKg = quotaCostValue ?? 0;
                            
                            // 컨테이너별 STO, DT 비용 (kg당 원가): (STO + DT) / 컨테이너 중량 / 1000
                            const containerStoDtCostPerKg = containerWeight > 0
                              ? (containerStoCost + containerDtCost) / containerWeight / 1000
                              : 0;
                            
                            // 컨테이너별 최종 원가 (kg당)
                            const containerPurchaseCostPerKg = containerFirstPartPerKg + containerSecondPartPerKg + containerQuotaCostPerKg + containerStoDtCostPerKg;
                            
                            // 컨테이너별 결제 금액: 원가(kg당) × 중량(MT) × 1000
                            const containerPaymentAmount = containerPurchaseCostPerKg * containerWeight * 1000;
                            
                            return {
                              index,
                              container,
                              containerUnitPrice,
                              containerWeight,
                              containerBales: (container.salesBales ?? container.tradeBales) != null ? Number(container.salesBales ?? container.tradeBales) : 0,
                              containerStoCost,
                              containerDtCost,
                              containerFirstPartPerKg,
                              containerSecondPartPerKg,
                              containerQuotaCostPerKg,
                              containerStoDtCostPerKg,
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
                                    컨테이너 {item.index + 1} (베일: {item.containerBales.toLocaleString('ko-KR')}, 중량: {item.containerWeight.toLocaleString('ko-KR')} MT, 단가: {item.containerUnitPrice.toLocaleString('ko-KR')})
                                  </div>
                                  <div className="ml-4 space-y-1">
                                    <div>
                                      <span className="font-medium">1. 첫 번째 부분 (kg당 원가):</span> 적용환율 × 컨테이너 단가(톤당) / 1000
                                      <div className="ml-4 mt-1">
                                        = {appliedRateForContainer.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} × {item.containerUnitPrice.toLocaleString('ko-KR')} (톤당) / 1000
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
                                    <div>
                                      <span className="font-medium">4. STO, DT 비용 (kg당 원가):</span> (STO + DT) / 컨테이너 중량 / 1000
                                      <div className="ml-4 mt-1">
                                        STO = {item.containerStoCost.toLocaleString('ko-KR')}원, DT = {item.containerDtCost.toLocaleString('ko-KR')}원
                                        <br />
                                        = ({item.containerStoCost.toLocaleString('ko-KR')} + {item.containerDtCost.toLocaleString('ko-KR')}) / {item.containerWeight.toLocaleString('ko-KR')} / 1000
                                        = {item.containerStoDtCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg
                                      </div>
                                    </div>
                                    <div className="pt-2 border-t border-blue-300 dark:border-blue-700 font-semibold">
                                      컨테이너 {item.index + 1} 원가(kg당) = {item.containerFirstPartPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} + {item.containerSecondPartPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} + {item.containerQuotaCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} + {item.containerStoDtCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })} = {item.containerPurchaseCostPerKg.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원/kg
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

                {/* 컨테이너 정보 및 확정원가 */}
                {tradeOrder?.containers && tradeOrder.containers.length > 0 && (
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="text-sm font-semibold mb-3 text-blue-900 dark:text-blue-100">컨테이너 정보 및 확정원가</h4>
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-blue-300 dark:border-blue-700">
                              <th className="text-left p-2 font-semibold text-blue-900 dark:text-blue-100">컨테이너 번호</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">중량 (MT)</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">베일</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">단가</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">STO 비용</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">DT 비용</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">창고 작업비</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">현장 작업비</th>
                              <th className="text-right p-2 font-semibold text-blue-900 dark:text-blue-100">확정원가</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tradeOrder.containers.map((container, index) => {
                              if (!container.id) return null; // id가 없으면 스킵
                              const containerId = String(container.id); // 문자열로 변환
                              const calculatedCost = calculatedContainerConfirmedCosts[containerId];
                              const currentCost = containerConfirmedPurchaseCosts[containerId];
                              const displayCost = currentCost !== null && currentCost !== undefined ? currentCost : calculatedCost;
                              const currentStoCost = containerStoCosts[containerId] ?? (container.stoCost != null && container.stoCost !== '' ? Number(container.stoCost) : null);
                              const currentDtCost = containerDtCosts[containerId] ?? (container.dtCost != null && container.dtCost !== '' ? Number(container.dtCost) : null);
                              const workFee = (container as { workFee?: number | string | null }).workFee;
                              const currentWorkFee = containerWorkFees[containerId] ?? (workFee != null && workFee !== '' ? Number(workFee) : null);
                              const onsiteVal = (container as { onsiteWorkFee?: number | string | null }).onsiteWorkFee;
                              const currentOnsiteWorkFee =
                                containerOnsiteWorkFees[containerId] ??
                                (onsiteVal != null && onsiteVal !== '' ? Number(onsiteVal) : null);
                              
                              return (
                                <tr key={containerId} className="border-b border-blue-200 dark:border-blue-800">
                                  <td className="p-2 text-left">{container.containerNo}</td>
                                  <td className="p-2 text-right">{container.weight ? Number(container.weight).toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '-'}</td>
                                  <td className="p-2 text-right">{(container.salesBales ?? container.tradeBales) != null ? Number(container.salesBales ?? container.tradeBales).toLocaleString('ko-KR') : '-'}</td>
                                  <td className="p-2 text-right">{container.unitPrice ? Number(container.unitPrice).toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '-'}</td>
                                  <td className="p-2 text-right">
                                    <div className="flex justify-end">
                                      <Input
                                        type="text"
                                        value={currentStoCost !== null && currentStoCost !== undefined
                                          ? formatNumber(currentStoCost)
                                          : ''}
                                        onChange={(e) => {
                                          const num = parseNumber(e.target.value);
                                          setContainerStoCosts((prev) => ({
                                            ...prev,
                                            [containerId]: num ?? null,
                                          }));
                                          setHasContainerCostChanges(true);
                                        }}
                                        placeholder="0"
                                        className="w-24 text-right text-xs"
                                      />
                                    </div>
                                  </td>
                                  <td className="p-2 text-right">
                                    <div className="flex justify-end">
                                      <Input
                                        type="text"
                                        value={currentDtCost !== null && currentDtCost !== undefined
                                          ? formatNumber(currentDtCost)
                                          : ''}
                                        onChange={(e) => {
                                          const num = parseNumber(e.target.value);
                                          setContainerDtCosts((prev) => ({
                                            ...prev,
                                            [containerId]: num ?? null,
                                          }));
                                          setHasContainerCostChanges(true);
                                        }}
                                        placeholder="0"
                                        className="w-24 text-right text-xs"
                                      />
                                    </div>
                                  </td>
                                  <td className="p-2 text-right">
                                    <div className="flex justify-end">
                                      <Input
                                        type="text"
                                        value={currentWorkFee !== null && currentWorkFee !== undefined
                                          ? formatNumber(currentWorkFee)
                                          : ''}
                                        onChange={(e) => {
                                          const num = parseNumber(e.target.value);
                                          setContainerWorkFees((prev) => ({
                                            ...prev,
                                            [containerId]: num ?? null,
                                          }));
                                          setHasContainerCostChanges(true);
                                        }}
                                        placeholder="0"
                                        className="w-24 text-right text-xs"
                                      />
                                    </div>
                                  </td>
                                  <td className="p-2 text-right">
                                    <div className="flex justify-end">
                                      <Input
                                        type="text"
                                        value={currentOnsiteWorkFee !== null && currentOnsiteWorkFee !== undefined
                                          ? formatNumber(currentOnsiteWorkFee)
                                          : ''}
                                        onChange={(e) => {
                                          const num = parseNumber(e.target.value);
                                          setContainerOnsiteWorkFees((prev) => ({
                                            ...prev,
                                            [containerId]: num ?? null,
                                          }));
                                          setHasContainerCostChanges(true);
                                        }}
                                        placeholder="0"
                                        className="w-24 text-right text-xs"
                                      />
                                    </div>
                                  </td>
                                  <td className="p-2 text-right">
                                    <div className="flex justify-end">
                                      <Input
                                        type="text"
                                        value={displayCost !== null && displayCost !== undefined
                                          ? formatNumberWithDecimals(displayCost)
                                          : ''}
                                        readOnly
                                        placeholder={calculatedCost !== undefined ? formatNumberWithDecimals(calculatedCost) : "계산 중..."}
                                        className="w-28 text-right bg-muted/50 text-muted-foreground font-medium"
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
              disabled={isSubmitting || (!isDirty && !hasContainerCostChanges)}
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

