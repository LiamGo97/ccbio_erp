'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/schedules/date-picker';
import { Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { ReceivableCollectionItem, useUpdateCollection } from '@/lib/hooks/use-receivables';

interface ReceivableCollectionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivableId: string;
  collection: ReceivableCollectionItem | null;
  maxAmount: number;
  onSuccess?: () => void;
}

interface CollectionFormData {
  collectionAmount: number;
  collectionDate: string;
  collectionMethod: string;
  isPrepayment: boolean;
  notes: string;
}

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (num % 1 === 0) return num.toLocaleString('ko-KR');
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function ReceivableCollectionEditDialog({
  open,
  onOpenChange,
  receivableId,
  collection,
  maxAmount,
  onSuccess,
}: ReceivableCollectionEditDialogProps) {
  const updateMutation = useUpdateCollection();
  const [amountDisplayValue, setAmountDisplayValue] = React.useState<string>('');

  // 수금/환불 금액 입력값 포맷팅 (콤마 포함, 음수 허용)
  const formatAmountInput = (value: string): string => {
    // 음수 기호 확인
    const isNegative = value.startsWith('-');
    // 숫자, 소수점, 마이너스만 허용
    let cleaned = value.replace(/[^0-9.-]/g, '');
    
    // 마이너스 기호는 맨 앞에만 허용
    if (cleaned.includes('-')) {
      cleaned = cleaned.replace(/-/g, '');
      if (isNegative) {
        cleaned = '-' + cleaned;
      }
    } else if (isNegative) {
      cleaned = '-' + cleaned;
    }
    
    // 소수점이 여러 개인 경우 첫 번째만 유지
    const parts = cleaned.split('.');
    const integerPart = parts[0] || '';
    const decimalPart = parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, 2) : '';
    
    // 정수 부분에 콤마 추가 (음수 기호 제외)
    const integerWithoutSign = integerPart.replace(/^-/, '');
    const formattedInteger = integerWithoutSign.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const finalInteger = integerPart.startsWith('-') ? '-' + formattedInteger : formattedInteger;
    
    return finalInteger + decimalPart;
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CollectionFormData>({
    defaultValues: {
      collectionAmount: 0,
      collectionDate: '',
      collectionMethod: '',
      isPrepayment: false,
      notes: '',
    },
  });

  const collectionDate = watch('collectionDate');

  // 다이얼로그가 열릴 때마다 폼 초기화
  React.useEffect(() => {
    if (open && collection) {
      reset({
        collectionAmount: collection.collectionAmount || 0,
        collectionDate: collection.collectionDate || new Date().toISOString().slice(0, 10),
        collectionMethod: collection.collectionMethod || '',
        isPrepayment: collection.isPrepayment ?? false,
        notes: collection.notes || '',
      });
      setAmountDisplayValue(formatAmountInput(String(collection.collectionAmount || 0)));
    }
  }, [open, collection, reset]);

  const onSubmit = async (data: CollectionFormData) => {
    if (!collection) return;

    // 유효성 검사
    if (!data.collectionAmount || data.collectionAmount === 0) {
      toast({
        title: '오류',
        description: '수금/환불 금액은 0이 될 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!data.collectionDate || !data.collectionDate.trim()) {
      toast({
        title: '오류',
        description: '수금일을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        receivableId,
        collectionId: collection.id,
        collectionAmount: data.collectionAmount,
        collectionDate: data.collectionDate,
        collectionMethod: data.collectionMethod || null,
        notes: data.notes || null,
        isPrepayment: data.isPrepayment,
      });

      toast({
        title: '수금 이력 수정 완료',
        description: '수금 이력이 성공적으로 수정되었습니다.',
      });

      onOpenChange(false);
      reset();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('수금 이력 수정 실패:', error);
      toast({
        title: '수금 이력 수정 실패',
        description: error?.response?.data?.message || '수금 이력 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formatted = formatAmountInput(rawValue);
    setAmountDisplayValue(formatted);
    const numValue = formatted.replace(/,/g, '') ? parseFloat(formatted.replace(/,/g, '')) : 0;
    setValue('collectionAmount', numValue, { shouldValidate: true });
  };

  const isSubmitting = updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>수금 이력 수정</DialogTitle>
          <DialogDescription>
            수금 이력 정보를 수정합니다.
          </DialogDescription>
        </DialogHeader>

        {collection && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* 수금 금액 */}
            <div className="space-y-2">
              <Label htmlFor="collectionAmount">
                수금 금액 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="collectionAmount"
                  type="text"
                  inputMode="decimal"
                  value={amountDisplayValue}
                  onChange={handleAmountChange}
                  placeholder="0"
                  className="pr-12"
                  disabled={isSubmitting}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  원
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                최대 수정 가능 금액: {formatNumber(maxAmount + collection.collectionAmount)}원
              </div>
              {errors.collectionAmount && (
                <p className="text-xs text-destructive">{errors.collectionAmount.message}</p>
              )}
            </div>

            {/* 수금일 */}
            <div className="space-y-2">
              <Label>
                수금일 <span className="text-destructive">*</span>
              </Label>
              <DatePicker
                value={collectionDate}
                onChange={(value) => setValue('collectionDate', value || '', { shouldValidate: true })}
                disabled={isSubmitting}
              />
              {errors.collectionDate && (
                <p className="text-xs text-destructive">{errors.collectionDate.message}</p>
              )}
            </div>

            {/* 수금 방법 */}
            <div className="space-y-2">
              <Label htmlFor="collectionMethod">수금 방법</Label>
              <Select
                value={watch('collectionMethod') || undefined}
                onValueChange={(value) => setValue('collectionMethod', value === '__none__' ? '' : value)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="collectionMethod">
                  <SelectValue placeholder="수금 방법을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">선택 안 함</SelectItem>
                  <SelectItem value="현금">현금</SelectItem>
                  <SelectItem value="계좌이체">계좌이체</SelectItem>
                  <SelectItem value="어음">어음</SelectItem>
                  <SelectItem value="수표">수표</SelectItem>
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-isPrepayment">선수금</Label>
              <div className="flex h-10 items-center">
                <Switch
                  id="edit-isPrepayment"
                  checked={watch('isPrepayment')}
                  onCheckedChange={(checked) =>
                    setValue('isPrepayment', checked, { shouldDirty: true, shouldValidate: true })
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* 비고 */}
            <div className="space-y-2">
              <Label htmlFor="notes">비고</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="비고를 입력하세요"
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
                disabled={isSubmitting}
              >
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                수정
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
