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
import { Loader2, X, Save, Folder, Eye } from 'lucide-react';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { DatePicker } from '@/components/schedules/date-picker';
import { MonthPicker } from '@/components/schedules/month-picker';
import { NumberInput } from '@/components/ui/number-input';
import {
  TradeOrder,
  CreateTradeOrderDto,
  UpdateTradeOrderDto,
  useCreateTradeOrder,
  useUpdateTradeOrder,
} from '@/lib/hooks/use-trade-orders';
import api from '@/lib/api';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';

interface TradeOrderFormData {
  exporter: string;
  productName: string;
  exportCountry: string;
  orderDate: string;
  commissionDollar: string;
  commissionMonth: string;
  totalOrderCount: number;
  grade: string;
  packingType: string;
  currency: string;
  unitPrice: number | undefined;
  destination: string;
  quota?: string; // 쿼터 유무 (계약 레벨)
  fumigation?: string; // 훈증 유무 (계약 레벨)
  customsDuty?: string; // 관세 유무 (계약 레벨)
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

export function TradeOrderFormDrawer({
  open,
  onOpenChange,
  mode,
  tradeOrder,
  onSubmit,
  onCancel,
}: TradeOrderFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [contractNo, setContractNo] = React.useState('');
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

  // 기존 계약서 파일 메타데이터 조회 (수정 모드이고 계약 확정 상태일 때만)
  const contractFileId = mode === 'edit' && tradeOrder?.contractGoogleDriveFileId ? tradeOrder.contractGoogleDriveFileId : null;
  const shouldFetchMetadata = open && mode === 'edit' && !!tradeOrder?.contractGoogleDriveFileId;
  
  const { data: existingContractFileMetadata } = useGoogleDriveFileMetadata(
    contractFileId,
    shouldFetchMetadata,
  );

  // 코드 관리에서 공통 코드 조회
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

  const destinationOptions = React.useMemo(() => {
    return (destinationCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [destinationCodes]);

  const currencyOptions = React.useMemo(() => {
    return (currencyCodes ?? [])
      .map((code) => ({ value: code.value?.trim() || '', label: code.name || code.value || '' }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [currencyCodes]);

  // 발주 등록/수정 공통 기본값 (등록 화면과 수정 화면 동일 구조 유지)
  const getDefaultFormValues = (): TradeOrderFormData => ({
    exporter: '',
    productName: '',
    exportCountry: '',
    orderDate: new Date().toISOString().split('T')[0],
    commissionDollar: '',
    commissionMonth: '',
    totalOrderCount: 1,
    grade: '',
    packingType: '',
    currency: '',
    unitPrice: undefined,
    destination: '',
    quota: 'N',
    fumigation: 'N',
    customsDuty: 'N',
    notes: '',
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TradeOrderFormData>({
    defaultValues: getDefaultFormValues(),
  });

  // 등록/수정 모드에 따라 폼 초기화 (발주 등록 화면과 동일한 필드로 수정 화면 구성)
  React.useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && tradeOrder) {
      reset({
        ...getDefaultFormValues(),
        exporter: tradeOrder.exporterCode || '',
        productName: tradeOrder.productCode || '',
        exportCountry: tradeOrder.exportCountryCode || '',
        orderDate: tradeOrder.orderDate || new Date().toISOString().split('T')[0],
        commissionDollar: tradeOrder.commissionDollar || '',
        commissionMonth: tradeOrder.commissionMonth || '',
        totalOrderCount: tradeOrder.totalOrderCount ?? 1,
        grade: tradeOrder.gradeCode || '',
        packingType: tradeOrder.packingType || '',
        currency: tradeOrder.currencyCode || '',
        unitPrice: tradeOrder.unitPrice || undefined,
        destination: tradeOrder.destinationCode || '',
        quota: tradeOrder.quota || 'N',
        fumigation: tradeOrder.fumigation || 'N',
        customsDuty: tradeOrder.customsDuty || 'N',
        notes: tradeOrder.notes || '',
      });

      if (tradeOrder.contractStatus === 'CONTRACT') {
        setContractNo(tradeOrder.contractNo || '');
        setContractFile(existingContractFileMetadata ?? null);
      } else {
        setContractNo('');
        setContractFile(null);
      }
    } else if (mode === 'create') {
      reset(getDefaultFormValues());
      setContractNo('');
      setContractFile(null);
    }
  }, [open, mode, tradeOrder, reset, existingContractFileMetadata]);

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

  const onSubmitInternal = async (data: TradeOrderFormData) => {
    setIsSubmitting(true);
    try {
      // 빈 문자열을 null로 변환하는 헬퍼 함수
      const emptyToNull = (value: string | undefined): string | null | undefined => {
        if (value === undefined) return undefined;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
      };

      const submitData: CreateTradeOrderDto | UpdateTradeOrderDto = {
        exporter: emptyToNull(data.exporter),
        productName: emptyToNull(data.productName),
        exportCountry: emptyToNull(data.exportCountry),
        orderDate: data.orderDate || undefined,
        commissionDollar: emptyToNull(data.commissionDollar),
        commissionMonth: emptyToNull(data.commissionMonth),
        totalOrderCount: data.totalOrderCount != null && Number.isFinite(data.totalOrderCount) ? data.totalOrderCount : null,
        grade: emptyToNull(data.grade),
        packingType: emptyToNull(data.packingType),
        currency: emptyToNull(data.currency),
        unitPrice: data.unitPrice,
        destination: emptyToNull(data.destination),
        quota: data.quota && data.quota.trim() !== '' ? data.quota.trim() : null,
        fumigation: data.fumigation && data.fumigation.trim() !== '' ? data.fumigation.trim() : null,
        customsDuty: data.customsDuty && data.customsDuty.trim() !== '' ? data.customsDuty.trim() : null,
        notes: emptyToNull(data.notes),
      };

      // 계약 확정 상태일 때 계약번호와 계약서 파일 정보 추가
      if (mode === 'edit' && tradeOrder?.contractStatus === 'CONTRACT') {
        (submitData as UpdateTradeOrderDto).contractNo = contractNo.trim() || null;
        if (contractFile) {
          (submitData as UpdateTradeOrderDto).contractGoogleDriveFileId = contractFile.id;
          (submitData as UpdateTradeOrderDto).contractFileName = contractFile.name || '계약서.pdf';
        } else {
          // 파일이 선택되지 않은 경우 null로 설정 (기존 파일 제거)
          (submitData as UpdateTradeOrderDto).contractGoogleDriveFileId = null;
          (submitData as UpdateTradeOrderDto).contractFileName = null;
        }
      }

      if (mode === 'create') {
        await createMutation.mutateAsync(submitData as CreateTradeOrderDto);
        toastSuccess('발주 생성 완료', '발주가 성공적으로 생성되었습니다.');
        if (onSubmit) {
          await onSubmit(submitData);
        } else {
          onOpenChange(false);
        }
      } else if (tradeOrder) {
        await updateMutation.mutateAsync({ id: tradeOrder.id, data: submitData });
        const title = tradeOrder.contractStatus === 'CONTRACT' ? '계약 수정 완료' : '발주 수정 완료';
        const message = tradeOrder.contractStatus === 'CONTRACT' 
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
      console.error('발주 저장 오류:', error);
      toastApiError(error, mode === 'create' ? '발주 생성 실패' : '발주 수정 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

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
                  : tradeOrder?.contractStatus === 'CONTRACT' 
                    ? '계약 수정' 
                    : '발주 수정'}
              </DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 발주를 등록합니다.'
                  : tradeOrder?.contractStatus === 'CONTRACT'
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
                  <Label htmlFor="exportCountry">수출국</Label>
                  <Select
                    value={watch('exportCountry') || '__none__'}
                    onValueChange={(value) => setValue('exportCountry', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id="exportCountry" size="sm" className="w-full">
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
                    onValueChange={(value) => setValue('exporter', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id="exporter" size="sm" className="w-full">
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
                    onValueChange={(value) => setValue('destination', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id="destination" size="sm" className="w-full">
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
                  <Input id="commissionDollar" size="sm" {...register('commissionDollar')} />
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
                    min={1}
                    step={1}
                    size="sm"
                    placeholder="전체 주문 개수"
                    {...register('totalOrderCount', { valueAsNumber: true })}
                  />
                </div>
              </div>
            </div>

            {/* 상품 및 가격 정보 */}
            <div className="space-y-3 pt-6 pb-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">상품 및 가격 정보</h3>
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productName">상품</Label>
                  <Select
                    value={watch('productName') || '__none__'}
                    onValueChange={(value) => setValue('productName', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id="productName" size="sm" className="w-full">
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
                  <Input id="grade" size="sm" {...register('grade')} placeholder="등급 입력" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packingType">패킹 타입</Label>
                  <Select
                    value={watch('packingType') || '__none__'}
                    onValueChange={(value) => setValue('packingType', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id="packingType" size="sm" className="w-full">
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
                  <Label htmlFor="currency">통화단위</Label>
                  <Select
                    value={watch('currency') || '__none__'}
                    onValueChange={(value) => setValue('currency', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id="currency" size="sm" className="w-full">
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
              <div className="grid grid-cols-6 gap-4">
                {/* 쿼터 유무 (계약 레벨) */}
                <div className="space-y-2">
                  <Label htmlFor="quota">쿼터 유무</Label>
                  <Switch
                    id="quota"
                    checked={watch('quota') === 'Y'}
                    onCheckedChange={(checked) => setValue('quota', checked ? 'Y' : 'N', { shouldDirty: true })}
                    disabled={isSubmitting}
                  />
                </div>
                {/* 훈증 유무 (계약 레벨) */}
                <div className="space-y-2">
                  <Label htmlFor="fumigation">훈증 유무</Label>
                  <Switch
                    id="fumigation"
                    checked={watch('fumigation') === 'Y'}
                    onCheckedChange={(checked) => setValue('fumigation', checked ? 'Y' : 'N', { shouldDirty: true })}
                    disabled={isSubmitting}
                  />
                </div>
                {/* 관세 유무 (계약 레벨) */}
                <div className="space-y-2">
                  <Label htmlFor="customsDuty">관세 유무</Label>
                  <Switch
                    id="customsDuty"
                    checked={watch('customsDuty') === 'Y'}
                    onCheckedChange={(checked) => setValue('customsDuty', checked ? 'Y' : 'N', { shouldDirty: true })}
                    disabled={isSubmitting}
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

            {/* 계약 정보 (계약 확정 상태일 때만 표시) */}
            {mode === 'edit' && tradeOrder?.contractStatus === 'CONTRACT' && (
              <div className="space-y-3 pt-6 pb-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">계약 정보</h3>
                <div className="grid grid-cols-6 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contractNo" className="text-sm font-medium text-foreground">
                      계약번호
                    </Label>
                    <Input
                      id="contractNo"
                      value={contractNo}
                      onChange={(e) => setContractNo(e.target.value)}
                      placeholder="계약번호를 입력하세요"
                      disabled={isSubmitting}
                      size="sm"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-sm font-medium text-foreground">
                      계약서 파일 (Google Drive)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setContractFilePickerOpen(true)}
                        disabled={isSubmitting}
                        className="flex-1"
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
                            size="icon"
                            onClick={() => setContractFilePreviewOpen(true)}
                            disabled={isSubmitting}
                            className="h-9 w-9"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setContractFile(null)}
                            disabled={isSubmitting}
                            className="h-9 w-9"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    {contractFile && (
                      <p className="text-xs text-muted-foreground mt-1">
                        선택된 파일: {contractFile.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
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
        {mode === 'edit' && tradeOrder?.contractStatus === 'CONTRACT' && (
          <>
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
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
