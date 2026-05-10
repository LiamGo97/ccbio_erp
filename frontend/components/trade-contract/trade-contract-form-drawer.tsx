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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Save, Folder, Eye, Plus, Trash2 } from 'lucide-react';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { DatePicker } from '@/components/schedules/date-picker';
import { MonthPicker } from '@/components/schedules/month-picker';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import {
  TradeContract,
  CreateTradeContractDto,
  UpdateTradeContractDto,
  useCreateTradeContract,
  useUpdateTradeContract,
} from '@/lib/hooks/use-trade-contracts';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';

interface TradeContractFormData {
  contractNo: string;
  exporter: string;
  exportCountry: string;
  productName: string;
  quota: string;
  fumigation: string;
  spot: string;
  customsDuty: string;
  // 발주 기본 정보
  orderDate: string;
  // 상품 정보
  grade: string;
  packingType: string;
  quantity: number | undefined;
  // 가격 정보
  unitPrice: number | undefined;
  currency: string;
  commissionDollar: string;
  commissionMonth: string;
  // 기타 정보
  destination: string;
  notes: string;
  newOld: string;
  totalOrderCount?: number; // 전체 주문 개수
  monthlyOrderPlan?: Array<{ yearMonth: string; count: number }>; // 월별 계획 (yearMonth: "YYYY-MM")
}

interface TradeContractFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  contract?: TradeContract | null;
  onSubmit?: (data: CreateTradeContractDto | UpdateTradeContractDto) => Promise<void>;
  onCancel?: () => void;
}

export function TradeContractFormDrawer({
  open,
  onOpenChange,
  mode,
  contract,
  onSubmit,
  onCancel,
}: TradeContractFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [contractFile, setContractFile] = React.useState<GoogleDriveFile | null>(null);
  const [contractFilePickerOpen, setContractFilePickerOpen] = React.useState(false);
  const [contractFilePreviewOpen, setContractFilePreviewOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (contractFilePreviewOpen) {
        e.preventDefault();
        setContractFilePreviewOpen(false);
        return;
      }
      if (contractFilePickerOpen) {
        e.preventDefault();
        setContractFilePickerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, contractFilePickerOpen, contractFilePreviewOpen, onOpenChange]);

  // 기존 계약서 파일 메타데이터 조회 (수정 모드일 때만)
  const contractFileId = mode === 'edit' && contract?.contractGoogleDriveFileId ? contract.contractGoogleDriveFileId : null;
  const shouldFetchMetadata = open && mode === 'edit' && !!contract?.contractGoogleDriveFileId;
  
  const { data: existingContractFileMetadata } = useGoogleDriveFileMetadata(
    contractFileId,
    shouldFetchMetadata,
  );

  // 코드 관리에서 공통 코드 조회
  const { data: exportCountryCodes } = useCodesByCategory('EXPORT_COUNTRY');
  const { data: exporterCodes } = useCodesByCategory('EXPORTER');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: currencyCodes } = useCodesByCategory('CURRENCY');
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');

  const createMutation = useCreateTradeContract();
  const updateMutation = useUpdateTradeContract();

  // 코드 옵션 메모이제이션
  const exporterOptions = React.useMemo(() => {
    return (exporterCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [exporterCodes]);

  const productOptions = React.useMemo(() => {
    return (productCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
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

  const packingOptions = React.useMemo(() => {
    return (packingCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [packingCodes]);

  const currencyOptions = React.useMemo(() => {
    return (currencyCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [currencyCodes]);

  const destinationOptions = React.useMemo(() => {
    return (destinationCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [destinationCodes]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<TradeContractFormData>({
    defaultValues: {
      contractNo: '',
      exporter: '',
      exportCountry: '',
      productName: '',
      quota: 'N',
      fumigation: 'N',
      spot: 'N',
      customsDuty: 'N',
      orderDate: new Date().toISOString().split('T')[0],
      grade: '',
      packingType: '',
      quantity: undefined,
      unitPrice: undefined,
      currency: '',
      commissionDollar: '',
      commissionMonth: '',
      destination: '',
      notes: '',
      newOld: '',
      totalOrderCount: 1, // 기본값 1
      monthlyOrderPlan: [], // 월별 계획
    },
  });

  const { fields: monthlyPlanFields, append: appendMonthlyPlan, remove: removeMonthlyPlan } = useFieldArray({
    control,
    name: 'monthlyOrderPlan',
  });

  const totalOrderCount = watch('totalOrderCount') ?? 1;

  // 수정 모드일 때 데이터 로드
  React.useEffect(() => {
    if (open && mode === 'edit' && contract) {
      // 패킹 타입 이름 또는 코드를 코드로 변환하는 헬퍼 함수
      const getPackingTypeCode = (packingNameOrCode: string | null | undefined, packingName?: string | null): string => {
        // packingName이 있으면 이름으로 코드 찾기
        if (packingName) {
          const foundByName = packingCodes?.find((code) => code.name === packingName);
          if (foundByName?.value) return foundByName.value;
        }
        // packingName이 없거나 못 찾았으면 packingType으로 찾기
        if (!packingNameOrCode) return '';
        // packingCodes에서 이름으로 찾기
        const foundByName = packingCodes?.find((code) => code.name === packingNameOrCode);
        if (foundByName?.value) return foundByName.value;
        // packingCodes에서 코드로 찾기 (이미 코드인 경우)
        const foundByValue = packingCodes?.find((code) => code.value === packingNameOrCode);
        if (foundByValue?.value) return foundByValue.value;
        // 못 찾으면 그대로 반환 (빈 문자열이면 빈 문자열)
        return packingNameOrCode;
      };

      reset({
        contractNo: contract.contractNo || '',
        exporter: contract.exporter || '',
        exportCountry: contract.exportCountry || '',
        productName: contract.productName || '',
        quota: contract.quota === 'Y' ? 'Y' : 'N',
        fumigation: contract.fumigation === 'Y' ? 'Y' : 'N',
        spot: 'N', // spot은 계약 레벨 필드가 아니므로 기본값 사용
        customsDuty: contract.customsDuty === 'Y' ? 'Y' : 'N',
        orderDate: contract.orderDate || new Date().toISOString().split('T')[0],
        grade: contract.grade || '',
        packingType: getPackingTypeCode(contract.packingType, contract.packingName),
        quantity: contract.quantity || undefined,
        unitPrice: contract.unitPrice || undefined,
        currency: contract.currency || '',
        commissionDollar: contract.commissionDollar || '',
        commissionMonth: contract.commissionMonth || '',
        destination: contract.destination || '',
        notes: contract.notes || '',
        newOld: contract.newOld || '',
        totalOrderCount: contract.totalOrderCount ?? 1, // 기본값 1
        monthlyOrderPlan: contract.monthlyOrderPlan 
          ? Object.entries(contract.monthlyOrderPlan).map(([monthKey, count]) => ({
              yearMonth: monthKey, // "YYYY-MM" 형식 그대로 사용
              count: count as number,
            }))
          : [],
      });
      
      if (existingContractFileMetadata) {
        setContractFile(existingContractFileMetadata);
      } else {
        setContractFile(null);
      }
    } else if (open && mode === 'create') {
      reset({
        contractNo: '',
        exporter: '',
        exportCountry: '',
        productName: '',
        quota: 'N',
        fumigation: 'N',
        spot: 'N',
        customsDuty: 'N',
        orderDate: new Date().toISOString().split('T')[0],
        grade: '',
        packingType: '',
        quantity: undefined,
        unitPrice: undefined,
        currency: '',
        commissionDollar: '',
        commissionMonth: '',
        destination: '',
        notes: '',
        newOld: '',
        totalOrderCount: 1, // 기본값 1
        monthlyOrderPlan: [],
      });
      setContractFile(null);
    }
  }, [open, mode, contract, reset, existingContractFileMetadata, packingCodes]);

  const onSubmitInternal = async (data: TradeContractFormData) => {
    setIsSubmitting(true);
    try {
      // 빈 문자열을 null로 변환하는 헬퍼 함수
      const emptyToNull = (value: string | undefined): string | null | undefined => {
        if (value === undefined) return undefined;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
      };

      const submitData: CreateTradeContractDto | UpdateTradeContractDto = {
        contractNo: emptyToNull(data.contractNo),
        exporter: emptyToNull(data.exporter),
        exportCountry: emptyToNull(data.exportCountry),
        productName: emptyToNull(data.productName),
        quota: data.quota === 'Y' ? 'Y' : 'N',
        fumigation: data.fumigation === 'Y' ? 'Y' : 'N',
        // spot은 계약 레벨 필드가 아니므로 제거
        customsDuty: data.customsDuty === 'Y' ? 'Y' : 'N',
        status: mode === 'create' ? 'ORDER' : contract?.status || null,
        orderDate: data.orderDate || null,
        grade: emptyToNull(data.grade),
        packingType: emptyToNull(data.packingType),
        quantity: data.quantity || null,
        unitPrice: data.unitPrice || null,
        currency: emptyToNull(data.currency),
        commissionDollar: emptyToNull(data.commissionDollar),
        commissionMonth: emptyToNull(data.commissionMonth),
        destination: emptyToNull(data.destination),
        notes: emptyToNull(data.notes),
        newOld: emptyToNull(data.newOld),
        totalOrderCount: data.totalOrderCount ?? 1, // 기본값 1
        monthlyOrderPlan: data.totalOrderCount && data.totalOrderCount >= 2 && data.monthlyOrderPlan && data.monthlyOrderPlan.length > 0
          ? data.monthlyOrderPlan.reduce((acc, plan) => {
              if (plan.yearMonth && plan.count) {
                acc[plan.yearMonth] = plan.count;
              }
              return acc;
            }, {} as Record<string, number>)
          : null,
      } as any;

      console.log('[계약 폼] 제출 데이터 - packingType:', {
        formData: data.packingType,
        submitData: submitData.packingType,
        mode,
        contractId: contract?.id,
      });

      // 계약서 파일 정보 추가
      if (contractFile) {
        submitData.contractGoogleDriveFileId = contractFile.id;
        submitData.contractFileName = contractFile.name || '계약서.pdf';
      } else if (mode === 'edit') {
        // 수정 모드에서 파일을 제거한 경우
        submitData.contractGoogleDriveFileId = null;
        submitData.contractFileName = null;
      }

      if (mode === 'create') {
        await createMutation.mutateAsync(submitData as CreateTradeContractDto);
        toastSuccess('발주 생성 완료', '발주가 성공적으로 생성되었습니다.');
        if (onSubmit) {
          await onSubmit(submitData);
        } else {
          onOpenChange(false);
        }
      } else if (contract) {
        await updateMutation.mutateAsync({ id: contract.id, data: submitData });
        const title = contract.status === 'CONTRACT' ? '계약 수정 완료' : '발주 수정 완료';
        const message = contract.status === 'CONTRACT' 
          ? '계약이 성공적으로 수정되었습니다.'
          : '발주가 성공적으로 수정되었습니다.';
        toastSuccess(title, message);
        if (onSubmit) {
          await onSubmit(submitData);
        } else {
          onOpenChange(false);
        }
      }
    } catch (error: any) {
      console.error('계약 저장 오류:', error);
      toastApiError(error, mode === 'create' ? '발주 생성 실패' : '발주 수정 실패');
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
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>
                {mode === 'create' 
                  ? '발주 등록' 
                  : contract?.status === 'CONTRACT' 
                    ? '계약 수정' 
                    : '발주 수정'}
              </DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 발주를 등록합니다.'
                  : contract?.status === 'CONTRACT'
                    ? '계약 정보를 수정합니다.'
                    : '발주 정보를 수정합니다.'}
              </DrawerDescription>
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
        <form onSubmit={handleSubmit(onSubmitInternal)} className="flex flex-col flex-1 min-h-0">
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-0"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            onDoubleClick={handleDoubleClick}
          >
            {/* 발주 기본 정보 */}
            <div className="space-y-3 pb-6">
              <h3 className="text-sm font-semibold text-foreground">발주 기본 정보</h3>
              <div className="grid grid-cols-6 gap-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="orderDate">발주일</Label>
                  <DatePicker
                    value={watch('orderDate')}
                    onChange={(value) => setValue('orderDate', value || '', { shouldDirty: true })}
                    placeholder="발주일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exportCountry">수출국</Label>
                  <Select
                    value={watch('exportCountry') || '__none__'}
                    onValueChange={(value) => setValue('exportCountry', value === '__none__' ? '' : value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="exportCountry" size="sm" className="w-full h-9">
                      <SelectValue placeholder="수출국 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안함</SelectItem>
                      {exportCountryOptions.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exporter">수출사</Label>
                  <Select
                    value={watch('exporter') || '__none__'}
                    onValueChange={(value) => setValue('exporter', value === '__none__' ? '' : value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="exporter" size="sm" className="w-full h-9">
                      <SelectValue placeholder="수출사 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안함</SelectItem>
                      {exporterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination">도착항</Label>
                  <Select
                    value={watch('destination') || '__none__'}
                    onValueChange={(value) => setValue('destination', value === '__none__' ? '' : value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="destination" size="sm" className="w-full h-9">
                      <SelectValue placeholder="도착항 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안함</SelectItem>
                      {destinationOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionDollar">커미션 $</Label>
                  <Input
                    id="commissionDollar"
                    {...register('commissionDollar')}
                    placeholder="커미션 $"
                    size="sm"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionMonth">커미션 월</Label>
                  <MonthPicker
                    value={watch('commissionMonth') || undefined}
                    onChange={(v) => setValue('commissionMonth', v ?? '', { shouldDirty: true })}
                    placeholder="년/월 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalOrderCount">전체 주문 개수</Label>
                  <Input
                    id="totalOrderCount"
                    type="number"
                    min="1"
                    step="1"
                    {...register('totalOrderCount', { valueAsNumber: true })}
                    placeholder="전체 주문 개수"
                    size="sm"
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* 월별 주문 계획 (전체 주문 개수가 2개 이상일 때만 표시) */}
            {totalOrderCount >= 2 && (
              <div className="space-y-3 pt-6 pb-6 border-t border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">월별 주문 계획</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // 이전 데이터가 있는지 확인
                      const lastIndex = monthlyPlanFields.length - 1;
                      let yearMonth: string;
                      let count: number;

                      if (lastIndex >= 0) {
                        // 이전 데이터가 있으면 마지막 항목의 년월에서 +1개월
                        const lastYearMonth = watch(`monthlyOrderPlan.${lastIndex}.yearMonth`);
                        const lastCount = watch(`monthlyOrderPlan.${lastIndex}.count`) ?? 1;

                        if (lastYearMonth) {
                          // "YYYY-MM" 형식을 파싱하여 +1개월 계산
                          const [year, month] = lastYearMonth.split('-').map(Number);
                          const date = new Date(year, month - 1, 1); // 월은 0부터 시작하므로 -1
                          date.setMonth(date.getMonth() + 1); // +1개월
                          const newYear = date.getFullYear();
                          const newMonth = date.getMonth() + 1; // 다시 1부터 시작하도록 +1
                          yearMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`;
                          count = lastCount; // 이전 개수 그대로 사용
                        } else {
                          // 년월이 없으면 현재 년월 사용
                          const currentYear = new Date().getFullYear();
                          const currentMonth = new Date().getMonth() + 1;
                          yearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
                          count = lastCount;
                        }
                      } else {
                        // 이전 데이터가 없으면 현재 년월, count는 1
                        const currentYear = new Date().getFullYear();
                        const currentMonth = new Date().getMonth() + 1;
                        yearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
                        count = 1;
                      }

                      appendMonthlyPlan({
                        yearMonth,
                        count,
                      });
                    }}
                    className="h-8"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    월 추가
                  </Button>
                </div>
                <div className="space-y-3 pt-3">
                  {monthlyPlanFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      월별 계획이 없습니다. "월 추가" 버튼을 클릭하여 추가하세요.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {monthlyPlanFields.map((field, index) => {
                        const yearMonthValue = watch(`monthlyOrderPlan.${index}.yearMonth`);
                        const countValue = watch(`monthlyOrderPlan.${index}.count`);

                        // 년월 옵션 생성 (현재 년도 기준 ±2년, 각 년도마다 12개월)
                        const currentYear = new Date().getFullYear();
                        const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
                        const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
                        
                        const yearMonthOptions = yearOptions.flatMap((year) =>
                          monthOptions.map((month) => {
                            const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
                            return {
                              value: yearMonth,
                              label: `${year}년 ${month}월`,
                            };
                          })
                        );

                        return (
                          <div key={field.id} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-muted/30">
                            <div className="flex-1 grid grid-cols-3 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs">년월</Label>
                                <Select
                                  value={yearMonthValue || ''}
                                  onValueChange={(value) => {
                                    setValue(`monthlyOrderPlan.${index}.yearMonth`, value, { shouldDirty: true });
                                  }}
                                >
                                  <SelectTrigger size="sm" className="h-9">
                                    <SelectValue placeholder="년월 선택" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {yearMonthOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs">계획 개수</Label>
                                <NumberInput
                                  value={countValue ?? 1}
                                  onChange={(value) => {
                                    setValue(`monthlyOrderPlan.${index}.count`, value ?? 1, { shouldDirty: true });
                                  }}
                                  min={1}
                                  step={1}
                                  className="h-9"
                                  placeholder="개수"
                                />
                              </div>
                              <div className="flex items-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeMonthlyPlan(index)}
                                  className="h-9 w-9 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {monthlyPlanFields.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground">
                      총 계획: {monthlyPlanFields.reduce((sum, _, index) => {
                        const count = watch(`monthlyOrderPlan.${index}.count`) ?? 0;
                        return sum + count;
                      }, 0)}개 / 전체 주문 개수: {totalOrderCount}개
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 상품 및 가격 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">상품 및 가격 정보</h3>
              <div className="grid grid-cols-6 gap-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="productName">상품</Label>
                  <Select
                    value={watch('productName') || '__none__'}
                    onValueChange={(value) => setValue('productName', value === '__none__' ? '' : value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="productName" size="sm" className="w-full h-9">
                      <SelectValue placeholder="상품 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안함</SelectItem>
                      {productOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade">등급</Label>
                  <Input
                    id="grade"
                    {...register('grade')}
                    placeholder="등급 입력"
                    size="sm"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packingType">패킹 타입</Label>
                  <Select
                    value={watch('packingType') || '__none__'}
                    onValueChange={(value) => setValue('packingType', value === '__none__' ? '' : value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="packingType" size="sm" className="w-full h-9">
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
                <div className="space-y-2">
                  <Label htmlFor="unitPrice">단가</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    step="0.01"
                    {...register('unitPrice', { valueAsNumber: true })}
                    placeholder="단가"
                    size="sm"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">통화단위</Label>
                  <Select
                    value={watch('currency') || '__none__'}
                    onValueChange={(value) => setValue('currency', value === '__none__' ? '' : value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="currency" size="sm" className="w-full h-9">
                      <SelectValue placeholder="통화 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안함</SelectItem>
                      {currencyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 선적 조건 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">선적 조건</h3>
              <div className="grid grid-cols-6 gap-4 pt-3">
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
                  <Label htmlFor="customsDuty">관세 유무</Label>
                  <Switch
                    id="customsDuty"
                    checked={watch('customsDuty') === 'Y'}
                    onCheckedChange={(checked) => setValue('customsDuty', checked ? 'Y' : 'N', { shouldDirty: true })}
                  />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <Label htmlFor="notes">비고</Label>
                <Textarea
                  id="notes"
                  {...register('notes')}
                  placeholder="비고"
                  className="mt-2 min-h-[80px]"
                />
              </div>
            </div>

            {/* 계약 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">계약 정보</h3>
              <div className="grid grid-cols-6 gap-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="contractNo">계약번호</Label>
                  <Input
                    id="contractNo"
                    {...register('contractNo')}
                    placeholder="계약번호"
                    size="sm"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>
                    계약서 파일 (Google Drive)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setContractFilePickerOpen(true)}
                      disabled={isSubmitting}
                      className="flex-1 h-9"
                      size="sm"
                    >
                      <Folder className="mr-2 h-4 w-4" />
                      {contractFile ? contractFile.name : '파일 선택'}
                    </Button>
                    {contractFile && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setContractFilePreviewOpen(true)}
                          disabled={isSubmitting}
                          className="h-9 w-9 p-0"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setContractFile(null)}
                          disabled={isSubmitting}
                          className="h-9 w-9 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {contractFile && (
                <div className="grid grid-cols-6 gap-4">
                  <div className="col-span-1"></div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">
                      선택된 파일: {contractFile.name}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-between gap-2">
              {mode === 'edit' && onCancel ? (
                <Button 
                  type="button" 
                  variant="outline" 
                  disabled={isSubmitting}
                  onClick={onCancel}
                >
                  <X className="mr-2 h-4 w-4" />
                  취소
                </Button>
              ) : (
                <DrawerClose asChild>
                  <Button 
                    type="button" 
                    variant="outline" 
                    disabled={isSubmitting}
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
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
                    {mode === 'create' ? '등록' : '수정'}
                  </>
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>

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
            'application/vnd.google-apps.document',
            'application/vnd.google-apps.spreadsheet',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/*'
          ]}
          title="계약서 파일 선택"
          description="구글 드라이브에서 계약서 파일을 선택하세요"
        />

        {/* 계약서 파일 미리보기 */}
        <GoogleDriveFilePreview
          open={contractFilePreviewOpen}
          onOpenChange={setContractFilePreviewOpen}
          file={contractFile}
        />
      </DrawerContent>
    </Drawer>
  );
}
