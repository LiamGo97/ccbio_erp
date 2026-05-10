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
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { ReceivableDetail } from '@/lib/hooks/use-receivables';

interface ReceivableCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivable: ReceivableDetail | null;
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

export function ReceivableCollectionDialog({
  open,
  onOpenChange,
  receivable,
  onSuccess,
}: ReceivableCollectionDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

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
      collectionDate: new Date().toISOString().slice(0, 10),
      collectionMethod: '',
      isPrepayment: false,
      notes: '',
    },
  });

  const collectionAmount = watch('collectionAmount');
  const collectionDate = watch('collectionDate');

  // 다이얼로그가 열릴 때마다 폼 초기화
  React.useEffect(() => {
    if (open && receivable) {
      // 잔액이 음수면 환불이므로 음수로 초기화, 양수면 수금이므로 양수로 초기화
      const initialAmount = receivable.balance < 0 ? receivable.balance : receivable.balance || 0;
      reset({
        collectionAmount: initialAmount,
        collectionDate: new Date().toISOString().slice(0, 10),
        collectionMethod: '',
        isPrepayment: false,
        notes: '',
      });
    }
  }, [open, receivable, reset]);

  const onSubmit = async (data: CollectionFormData) => {
    if (!receivable) return;

    // 유효성 검사
    if (!data.collectionAmount || data.collectionAmount === 0) {
      toast({
        title: '오류',
        description: '수금/환불 금액은 0이 될 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const isRefund = data.collectionAmount < 0;
    const isCollection = data.collectionAmount > 0;

    // 수금인 경우 (양수)
    if (isCollection && data.collectionAmount > receivable.balance) {
      toast({
        title: '오류',
        description: `수금 금액이 잔액(${formatNumber(receivable.balance)}원)을 초과할 수 없습니다.`,
        variant: 'destructive',
      });
      return;
    }

    // 환불인 경우 (음수) - 잔액이 음수일 때만 환불 가능
    if (isRefund && receivable.balance >= 0) {
      toast({
        title: '오류',
        description: '환불은 잔액이 음수(초과 입금)인 경우에만 가능합니다.',
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

    setIsSubmitting(true);

    try {
      await api.post(`/receivables/${receivable.id}/collect`, {
        collectionAmount: data.collectionAmount,
        collectionDate: data.collectionDate,
        collectionMethod: data.collectionMethod || null,
        notes: data.notes || null,
        isPrepayment: receivable.balance < 0 ? false : data.isPrepayment,
      });

      // 성공 메시지
      const isRefund = data.collectionAmount < 0;
      toast({
        title: isRefund ? '환불 처리 완료' : '수금 처리 완료',
        description: `${formatNumber(Math.abs(data.collectionAmount))}원이 ${isRefund ? '환불' : '수금'} 처리되었습니다.`,
      });

      // 데이터 갱신
      await queryClient.invalidateQueries({ queryKey: ['receivable', receivable.id] });
      await queryClient.invalidateQueries({ queryKey: ['receivable-collections', receivable.id] });
      await queryClient.invalidateQueries({ queryKey: ['receivables'] });
      await queryClient.invalidateQueries({ queryKey: ['collections'] });
      await queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });

      // 다이얼로그 닫기
      onOpenChange(false);
      reset();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('수금 처리 실패:', error);
      toast({
        title: '수금 처리 실패',
        description: error?.response?.data?.message || '수금 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formatted = formatAmountInput(rawValue);
    setAmountDisplayValue(formatted);
    
    // 숫자 값 추출 (콤마 제거)
    const numValue = formatted.replace(/,/g, '') ? parseFloat(formatted.replace(/,/g, '')) : 0;
    setValue('collectionAmount', numValue, { shouldValidate: true });
  };

  // 다이얼로그가 열릴 때마다 표시값 초기화
  React.useEffect(() => {
    if (open && receivable) {
      // 잔액이 음수면 환불이므로 음수로 초기화
      const initialAmount = receivable.balance < 0 ? receivable.balance : receivable.balance || 0;
      setAmountDisplayValue(formatAmountInput(String(initialAmount)));
    }
  }, [open, receivable]);

  const maxAmount = receivable?.balance || 0;

  if (!receivable) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {receivable.balance < 0 ? '환불 처리' : '수금 처리'}
          </DialogTitle>
          <DialogDescription>
            {receivable.balance < 0 
              ? '초과 입금액에 대한 환불을 처리합니다. (음수 금액 입력)'
              : '채권에 대한 수금을 처리합니다.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* 채권 정보 */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="text-sm font-medium text-muted-foreground">채권 정보</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">고객명:</span>
                  <span className="ml-2 font-medium">{receivable.customerName || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">거래명세서 번호:</span>
                  <span className="ml-2 font-medium">{receivable.invoiceNumber || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">현재 잔액:</span>
                  <span className="ml-2 font-semibold text-primary">
                    {formatNumber(receivable.balance)}원
                  </span>
                </div>
              </div>
            </div>

            {/* 수금/환불 금액 */}
            <div className="space-y-2">
              <Label htmlFor="collectionAmount">
                {receivable.balance < 0 ? '환불 금액' : '수금 금액'} <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="collectionAmount"
                  type="text"
                  inputMode="decimal"
                  value={amountDisplayValue}
                  onChange={handleAmountChange}
                  placeholder={receivable.balance < 0 ? "-0" : "0"}
                  className="pr-12"
                  disabled={isSubmitting}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  원
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {receivable.balance < 0 
                  ? `현재 초과 입금액: ${formatNumber(Math.abs(receivable.balance))}원 (환불은 음수로 입력)`
                  : `최대 수금 가능 금액: ${formatNumber(maxAmount)}원`}
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

            {/* 선수금 */}
            <div className="space-y-2">
              <Label htmlFor="isPrepayment">선수금</Label>
              <div className="flex h-10 items-center">
                <Switch
                  id="isPrepayment"
                  checked={watch('isPrepayment')}
                  onCheckedChange={(checked) =>
                    setValue('isPrepayment', checked, { shouldDirty: true, shouldValidate: true })
                  }
                  disabled={isSubmitting || receivable.balance < 0}
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
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className={receivable.balance < 0 
                  ? "bg-orange-600 hover:bg-orange-700 text-white"
                  : ""}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {receivable.balance < 0 ? '환불 처리' : '수금 처리'}
              </Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  );
}
