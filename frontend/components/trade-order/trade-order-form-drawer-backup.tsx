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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { DatePicker } from '@/components/schedules/date-picker';
import { NumberInput } from '@/components/ui/number-input';
import {
  TradeOrder,
  CreateTradeOrderDto,
  UpdateTradeOrderDto,
  useCreateTradeOrder,
  useUpdateTradeOrder,
} from '@/lib/hooks/use-trade-orders';
import api from '@/lib/api';

interface TradeOrderFormData {
  contractNo: string;
  exporter: string;
  productName: string;
  customsDuty: string;
  commissionMonth: string;
  exportCountry: string;
  orderDate: string;
  commissionDollar: string;
  quota: string;
  fumigation: string;
  newOld: string;
  spot: string;
  shippingLine: string;
  shipmentSeq: string;
  bk: string;
  bl: string;
  quantity: string;
  grade: string;
  packingType: string;
  currency: string;
  unitPrice: number | undefined;
  totalAmount: number | undefined;
  destination: string;
  etd: string;
  eta: string;
  finalDestination: string;
  finalDestinationArrivalDate: string;
  notes: string;
}

interface TradeOrderFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  tradeOrder?: TradeOrder | null;
  onSubmit?: (data: CreateTradeOrderDto | UpdateTradeOrderDto) => Promise<void>;
  onCancel?: () => void;
}

export function TradeOrderFormDrawerBackup({
  open,
  onOpenChange,
  mode,
  tradeOrder,
  onSubmit,
  onCancel,
}: TradeOrderFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // 코드 관리에서 공통 코드 조회
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');
  const { data: exportCountryCodes } = useCodesByCategory('EXPORT_COUNTRY');
  const { data: exporterCodes } = useCodesByCategory('EXPORTER');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const { data: currencyCodes } = useCodesByCategory('CURRENCY');

  const createMutation = useCreateTradeOrder();
  const updateMutation = useUpdateTradeOrder();

  // 코드 옵션 메모이제이션
  const exporterOptions = React.useMemo(() => {
    return (exporterCodes ?? [])
      .map((code) => ({ value: code.name?.trim() || code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [exporterCodes]);

  const productOptions = React.useMemo(() => {
    return (productCodes ?? [])
      .map((code) => ({ value: code.name?.trim() || code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [productCodes]);

  const exportCountryOptions = React.useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    exportCountryCodes?.forEach((code) => {
      const codeValue = code.value?.trim();
      const codeName = code.name?.trim();
      if (codeValue) {
        map.set(codeValue, { code: codeValue, name: codeName || codeValue });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [exportCountryCodes]);

  const shippingLineOptions = React.useMemo(() => {
    return (shippingLineCodes ?? [])
      .map((code) => ({ value: code.name?.trim() || code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [shippingLineCodes]);

  const packingOptions = React.useMemo(() => {
    return (packingCodes ?? [])
      .map((code) => ({ value: code.name?.trim() || code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [packingCodes]);

  const destinationOptions = React.useMemo(() => {
    return (destinationCodes ?? [])
      .map((code) => ({ value: code.name?.trim() || code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [destinationCodes]);

  const currencyOptions = React.useMemo(() => {
    return (currencyCodes ?? [])
      .map((code) => ({ value: code.name?.trim() || code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [currencyCodes]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TradeOrderFormData>({
    defaultValues: {
      contractNo: '',
      exporter: '',
      productName: '',
      customsDuty: 'N',
      commissionMonth: '',
      exportCountry: '',
      orderDate: new Date().toISOString().split('T')[0],
      commissionDollar: '',
      quota: 'N',
      fumigation: 'N',
      newOld: '',
      spot: 'N',
      shippingLine: '',
      shipmentSeq: '',
      bk: '',
      bl: '',
      quantity: '',
      grade: '',
      packingType: '',
      currency: '',
      unitPrice: undefined,
      totalAmount: undefined,
      destination: '',
      etd: '',
      eta: '',
      finalDestination: '',
      finalDestinationArrivalDate: '',
      notes: '',
    },
  });


  // 수정 모드일 때 데이터 로드
  React.useEffect(() => {
    if (open && mode === 'edit' && tradeOrder) {
      reset({
        contractNo: tradeOrder.contractNo || '',
        exporter: tradeOrder.exporterName || '',
        productName: tradeOrder.productName || '',
        customsDuty: tradeOrder.customsDuty === 'Y' ? 'Y' : 'N',
        commissionMonth: tradeOrder.commissionMonth || '',
        exportCountry: tradeOrder.exportCountryName || '',
        orderDate: tradeOrder.orderDate || new Date().toISOString().split('T')[0],
        commissionDollar: tradeOrder.commissionDollar || '',
        quota: tradeOrder.quota === 'Y' ? 'Y' : 'N',
        fumigation: tradeOrder.fumigation === 'Y' ? 'Y' : 'N',
        newOld: tradeOrder.newOld || '',
        spot: tradeOrder.spot === 'Y' ? 'Y' : 'N',
        shippingLine: tradeOrder.shippingLineName || '',
        shipmentSeq: tradeOrder.sequence?.toString() || '',
        bk: tradeOrder.bk || '',
        bl: tradeOrder.bl || '',
        quantity: tradeOrder.quantity?.toString() || '',
        grade: tradeOrder.grade || '',
        packingType: tradeOrder.packingType || '',
        currency: tradeOrder.currencyName || '',
        unitPrice: tradeOrder.unitPrice || undefined,
        totalAmount: tradeOrder.totalAmount || undefined,
        destination: tradeOrder.destinationName || '',
        etd: tradeOrder.etdDate || '',
        eta: tradeOrder.etaDate || '',
        finalDestination: tradeOrder.finalDestination || '',
        finalDestinationArrivalDate: tradeOrder.finalDestinationArrivalDate || '',
        notes: tradeOrder.notes || '',
      });
    } else if (open && mode === 'create') {
      reset({
        contractNo: '',
        exporter: '',
        productName: '',
        customsDuty: 'N',
        commissionMonth: '',
        exportCountry: '',
        orderDate: new Date().toISOString().split('T')[0],
        commissionDollar: '',
        quota: 'N',
        fumigation: 'N',
        newOld: '',
        spot: 'N',
        shippingLine: '',
        shipmentSeq: '',
        bk: '',
        bl: '',
        quantity: '',
        grade: '',
        packingType: '',
        currency: '',
        unitPrice: undefined,
        totalAmount: undefined,
        destination: '',
        etd: '',
        eta: '',
        finalDestination: '',
        finalDestinationArrivalDate: '',
        notes: '',
      });
    }
  }, [open, mode, tradeOrder, reset]);

  const onSubmitInternal = async (data: TradeOrderFormData) => {
    setIsSubmitting(true);
    try {
      const submitData: CreateTradeOrderDto | UpdateTradeOrderDto = {
        contractNo: data.contractNo?.trim() || undefined,
        exporter: data.exporter?.trim() || undefined,
        productName: data.productName?.trim() || undefined,
        customsDuty: data.customsDuty === 'Y' ? 'Y' : 'N',
        commissionMonth: data.commissionMonth?.trim() || undefined,
        exportCountry: data.exportCountry?.trim() || undefined,
        orderDate: data.orderDate || undefined,
        commissionDollar: data.commissionDollar?.trim() || undefined,
        quota: data.quota === 'Y' ? 'Y' : 'N',
        fumigation: data.fumigation === 'Y' ? 'Y' : 'N',
        newOld: data.newOld?.trim() || undefined,
        spot: data.spot === 'Y' ? 'Y' : 'N',
        shippingLine: data.shippingLine?.trim() || undefined,
        shipmentSeq: data.shipmentSeq ? parseInt(data.shipmentSeq, 10) : undefined,
        bk: data.bk?.trim() || undefined,
        bl: data.bl?.trim() || undefined,
        quantity: data.quantity ? parseFloat(data.quantity) : undefined,
        grade: data.grade?.trim() || undefined,
        packingType: data.packingType?.trim() || undefined,
        currency: data.currency?.trim() || undefined,
        unitPrice: data.unitPrice,
        totalAmount: data.totalAmount,
        destination: data.destination?.trim() || undefined,
        etd: data.etd || undefined,
        eta: data.eta || undefined,
        finalDestination: data.finalDestination?.trim() || undefined,
        finalDestinationArrivalDate: data.finalDestinationArrivalDate || undefined,
        notes: data.notes?.trim() || undefined,
      };

      if (mode === 'create') {
        await createMutation.mutateAsync(submitData as CreateTradeOrderDto);
        toast({
          title: '발주 생성 완료',
          description: '발주가 성공적으로 생성되었습니다.',
        });
      } else if (tradeOrder) {
        await updateMutation.mutateAsync({ id: tradeOrder.id, data: submitData });
        toast({
          title: '발주 수정 완료',
          description: '발주가 성공적으로 수정되었습니다.',
        });
      }

      if (onSubmit) {
        await onSubmit(submitData);
      } else {
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('발주 저장 오류:', error);
      const message =
        error?.response?.data?.message ?? error?.message ?? '발주를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: mode === 'create' ? '발주 생성 실패' : '발주 수정 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
                {mode === 'create' ? '발주 등록' : '발주 수정'}
              </DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 발주를 등록합니다.'
                  : '발주 정보를 수정합니다.'}
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
        <form onSubmit={handleSubmit(onSubmitInternal)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-0">
            {/* 발주 정보 */}
            <div className="space-y-3 pb-6">
              <h3 className="text-sm font-semibold text-foreground">발주 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orderDate">발주일</Label>
                  <DatePicker
                    value={watch('orderDate')}
                    onChange={(value) => setValue('orderDate', value || '')}
                    placeholder="발주일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contractNo">계약번호</Label>
                  <Input id="contractNo" size="sm" {...register('contractNo')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newOld">구분</Label>
                  <div className="relative">
                    <Select
                      value={watch('newOld') || ''}
                      onValueChange={(value) => setValue('newOld', value || '')}
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
                          setValue('newOld', '');
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productName">품목</Label>
                  <div className="relative">
                    <Select
                      value={watch('productName') || ''}
                      onValueChange={(value) => setValue('productName', value || '')}
                    >
                      <SelectTrigger id="productName" size="sm" className="w-full">
                        <SelectValue placeholder="품목 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {productOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('productName') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('productName', '');
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
                    onChange={(value) => setValue('commissionMonth', value || '')}
                    placeholder="커미션 월 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionDollar">커미션 금액</Label>
                  <Input id="commissionDollar" size="sm" {...register('commissionDollar')} />
                </div>
              </div>
            </div>

            {/* 거래처 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">거래처 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exporter">수출사</Label>
                  <div className="relative">
                    <Select
                      value={watch('exporter') || ''}
                      onValueChange={(value) => setValue('exporter', value || '')}
                    >
                      <SelectTrigger id="exporter" size="sm" className="w-full">
                        <SelectValue placeholder="수출사 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {exporterOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('exporter') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('exporter', '');
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
                      onValueChange={(value) => setValue('exportCountry', value || '')}
                    >
                      <SelectTrigger id="exportCountry" size="sm" className="w-full">
                        <SelectValue placeholder="수출국 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {exportCountryOptions.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('exportCountry') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('exportCountry', '');
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
                      onValueChange={(value) => setValue('shippingLine', value || '')}
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
                          setValue('shippingLine', '');
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
              </div>
            </div>

            {/* 상품 및 가격 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">상품 및 가격 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">수량</Label>
                  <Input
                    id="quantity"
                    type="number"
                    size="sm"
                    step="0.01"
                    {...register('quantity')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade">등급</Label>
                  <Input id="grade" size="sm" {...register('grade')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packingType">포장</Label>
                  <div className="relative">
                    <Select
                      value={watch('packingType') || ''}
                      onValueChange={(value) => setValue('packingType', value || '')}
                    >
                      <SelectTrigger id="packingType" size="sm" className="w-full">
                        <SelectValue placeholder="포장 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {packingOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('packingType') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('packingType', '');
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">통화</Label>
                  <div className="relative">
                    <Select
                      value={watch('currency') || ''}
                      onValueChange={(value) => setValue('currency', value || '')}
                    >
                      <SelectTrigger id="currency" size="sm" className="w-full">
                        <SelectValue placeholder="통화 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {currencyOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('currency') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue('currency', '');
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitPrice">단가</Label>
                  <NumberInput
                    id="unitPrice"
                    size="sm"
                    value={watch('unitPrice')}
                    onChange={(value) => {
                      setValue('unitPrice', value ?? undefined, { shouldDirty: true });
                    }}
                    decimals={2}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalAmount">총액</Label>
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
              </div>
            </div>

            {/* 선적 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">선적 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shipmentSeq">선적 순번</Label>
                  <Input
                    id="shipmentSeq"
                    type="number"
                    size="sm"
                    {...register('shipmentSeq')}
                    placeholder="1"
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bk">BK (부킹)</Label>
                  <Input id="bk" size="sm" {...register('bk')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bl">BL (선하증권)</Label>
                  <Input id="bl" size="sm" {...register('bl')} />
                </div>
              </div>
            </div>

            {/* 배송 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">배송 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="destination">도착항</Label>
                  <div className="relative">
                    <Select
                      value={watch('destination') || ''}
                      onValueChange={(value) => setValue('destination', value || '')}
                    >
                      <SelectTrigger id="destination" size="sm" className="w-full">
                        <SelectValue placeholder="도착항 선택" />
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
                          setValue('destination', '');
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="etd">출항일 (ETD)</Label>
                  <DatePicker
                    value={watch('etd')}
                    onChange={(value) => setValue('etd', value || '')}
                    placeholder="출항일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eta">입항일 (ETA)</Label>
                  <DatePicker
                    value={watch('eta')}
                    onChange={(value) => setValue('eta', value || '')}
                    placeholder="입항일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finalDestination">최종 목적지</Label>
                  <Input id="finalDestination" size="sm" {...register('finalDestination')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finalDestinationArrivalDate">최종 도착일</Label>
                  <DatePicker
                    value={watch('finalDestinationArrivalDate')}
                    onChange={(value) => setValue('finalDestinationArrivalDate', value || '')}
                    placeholder="도착일 선택"
                  />
                </div>
              </div>
            </div>

            {/* 비고 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">비고</h3>
              <div className="space-y-2">
                <Label htmlFor="notes">비고</Label>
                <Textarea id="notes" rows={4} {...register('notes')} />
              </div>
            </div>
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-end gap-2">
              <DrawerClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
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
                    {mode === 'create' ? '등록' : '수정'}
                  </>
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
