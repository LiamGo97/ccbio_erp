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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumberInput } from '@/components/ui/number-input';
import { DatePicker } from '@/components/schedules/date-picker';
import { Loader2, X } from 'lucide-react';
import { useTradeOrder, useUpdateTradeOrder } from '@/lib/hooks/use-trade-orders';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';

interface PaymentFormData {
  dueDate?: string | null;
  amount?: number | null;
  exchangeRate?: number | null;
  result?: string | null;
  notes?: string | null;
}

export type PaymentProcessingTarget = 'payments' | 'bookingTempPayments';

interface PaymentProcessingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  onSuccess?: () => void;
  /** 정식 결제(`payments`) vs 부킹 임시 결제(`bookingTempPayments`) — 섞어서 저장하지 않음 */
  processingTarget?: PaymentProcessingTarget;
}

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

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function PaymentProcessingDrawer({
  open,
  onOpenChange,
  orderId,
  onSuccess,
  processingTarget = 'payments',
}: PaymentProcessingDrawerProps) {
  const isMobile = useIsMobile();
  const { data: tradeOrder, isLoading, refetch } = useTradeOrder(orderId ?? undefined);
  const updateMutation = useUpdateTradeOrder();
  const isTempBookingMode = processingTarget === 'bookingTempPayments';

  const sourcePayments = React.useMemo(() => {
    if (!tradeOrder) return [];
    if (isTempBookingMode) {
      return [...(tradeOrder.bookingTempPayments ?? [])].sort((a, b) => a.sequence - b.sequence);
    }
    return tradeOrder.payments ?? [];
  }, [tradeOrder, isTempBookingMode]);
  const { data: paymentTermsCodes = [] } = useCodeMastersByGroup('PAYMENT_TERMS');
  const { data: paymentResultCodes = [] } = useCodeMastersByGroup('PAYMENT_RESULT');
  const { data: paymentTypeCodes = [] } = useCodesByCategory('PAYMENT_TYPE');

  const getCodeName = (group: string, value: string | null | undefined) => {
    if (!value) return null;
    const code = paymentTermsCodes.find((c) => c.value === value);
    return code?.name || value;
  };

  const getPaymentResultName = (value: string | null | undefined) => {
    if (!value) return null;
    const code = paymentResultCodes.find((c) => c.value === value);
    return code?.name || value;
  };

  const getPaymentTypeName = (value: string | null | undefined) => {
    if (!value || value === 'REGULAR') return null; // REGULAR는 기본값이므로 null 반환
    const code = paymentTypeCodes.find((c) => c.value === value);
    return code?.name || value;
  };

  const getPaymentTitle = (payment: { sequence: number; paymentType?: string | null }) => {
    if (isTempBookingMode) {
      return `${payment.sequence}차 결제 (임시)`;
    }
    const paymentType = payment.paymentType || 'REGULAR';
    const paymentTypeName = getPaymentTypeName(paymentType);
    if (paymentTypeName) {
      return paymentTypeName;
    }
    return `${payment.sequence}차 결제`;
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<{ payments: PaymentFormData[] }>({
    defaultValues: {
      payments: [],
    },
  });

  React.useEffect(() => {
    if (!tradeOrder) return;
    const list = isTempBookingMode
      ? [...(tradeOrder.bookingTempPayments ?? [])].sort((a, b) => a.sequence - b.sequence)
      : [...(tradeOrder.payments ?? [])];
    if (list.length === 0) {
      reset({ payments: [] });
      return;
    }
    const paymentData = list.map((payment) => ({
      dueDate: payment.dueDate ?? null,
      amount: numOrNull(payment.amount),
      exchangeRate: numOrNull(payment.exchangeRate),
      result: payment.result && payment.result.trim() !== '' ? payment.result : null,
      notes: payment.notes ?? null,
    }));
    reset({ payments: paymentData });
  }, [tradeOrder, isTempBookingMode, reset]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange]);

  const onSubmit = async (data: { payments: PaymentFormData[] }) => {
    if (!orderId || !tradeOrder) return;

    try {
      if (isTempBookingMode) {
        const sorted = [...(tradeOrder.bookingTempPayments ?? [])].sort((a, b) => a.sequence - b.sequence);
        const bookingTempPayments = sorted.map((payment, index) => {
          const resultValue = data.payments[index]?.result;
          const regularAmount = numOrNull(payment.amount);
          const regularExchangeRate =
            data.payments[index]?.exchangeRate ?? numOrNull(payment.exchangeRate);
          const krwAmount =
            regularAmount != null &&
            regularExchangeRate != null &&
            !Number.isNaN(regularAmount) &&
            !Number.isNaN(regularExchangeRate)
              ? regularAmount * regularExchangeRate
              : numOrNull(payment.krwAmount);
          return {
            dueDate: data.payments[index]?.dueDate ?? payment.dueDate ?? null,
            ratio: numOrNull(payment.ratio),
            amount: regularAmount,
            method: payment.method ?? null,
            exchangeRate: regularExchangeRate,
            krwAmount,
            result: resultValue === 'NONE' ? null : (resultValue ?? payment.result ?? null),
            notes: data.payments[index]?.notes ?? payment.notes ?? null,
          };
        });

        await updateMutation.mutateAsync({
          id: orderId,
          data: { bookingTempPayments },
        });

        toast({
          title: '저장 완료',
          description: '임시(부킹) 결제 정보가 저장되었습니다.',
        });
      } else {
        const updatedPayments = tradeOrder.payments?.map((payment, index) => {
          const resultValue = data.payments[index]?.result;
          const paymentType = payment.paymentType || 'REGULAR';

          if (paymentType === 'DO_COST' || paymentType === 'CUSTOMS_COST') {
            const costAmount = data.payments[index]?.amount ?? payment.amount;
            return {
              sequence: payment.sequence,
              dueDate: data.payments[index]?.dueDate ?? payment.dueDate,
              ratio: payment.ratio,
              amount: costAmount,
              method: payment.method,
              exchangeRate: payment.exchangeRate,
              krwAmount: costAmount,
              result: resultValue === 'NONE' ? null : (resultValue ?? payment.result),
              notes: null,
              paymentType: payment.paymentType,
            };
          }
          const regularAmount = payment.amount;
          const regularExchangeRate = data.payments[index]?.exchangeRate ?? payment.exchangeRate;
          const krwAmount =
            regularAmount !== null &&
            regularAmount !== undefined &&
            regularExchangeRate !== null &&
            regularExchangeRate !== undefined
              ? Number(regularAmount) * Number(regularExchangeRate)
              : payment.krwAmount ?? null;
          return {
            sequence: payment.sequence,
            dueDate: data.payments[index]?.dueDate ?? payment.dueDate,
            ratio: payment.ratio,
            amount: regularAmount,
            method: payment.method,
            exchangeRate: regularExchangeRate,
            krwAmount,
            result: resultValue === 'NONE' ? null : (resultValue ?? payment.result),
            notes: data.payments[index]?.notes ?? payment.notes,
            paymentType: payment.paymentType,
          };
        }) ?? [];

        await updateMutation.mutateAsync({
          id: orderId,
          data: { payments: updatedPayments },
        });

        toast({
          title: '저장 완료',
          description: '결제 정보가 저장되었습니다.',
        });
      }

      await refetch();
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('결제 정보 저장 오류:', error);
      const message =
        error?.response?.data?.message ??
        error?.message ??
        '결제 정보를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: '저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent
          className="h-full"
          style={{ width: isMobile ? '100%' : '600px', maxWidth: '90vw' }}
        >
          <DrawerHeader className="border-b">
            <DrawerTitle>{isTempBookingMode ? '임시(부킹) 결제 처리' : '결제 처리'}</DrawerTitle>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!tradeOrder || sourcePayments.length === 0) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent
          className="h-full"
          style={{ width: isMobile ? '100%' : '600px', maxWidth: '90vw' }}
        >
          <DrawerHeader className="border-b">
            <DrawerTitle>{isTempBookingMode ? '임시(부킹) 결제 처리' : '결제 처리'}</DrawerTitle>
            <DrawerDescription>
              {isTempBookingMode
                ? '부킹 단계 임시 결제만 수정합니다. 정식 결제와 별도로 저장됩니다.'
                : '정식 결제 정보를 수정합니다.'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">
              {isTempBookingMode ? '임시 결제 정보가 없습니다.' : '결제 정보가 없습니다.'}
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const paymentFields = watch('payments') || [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full"
        style={{ width: isMobile ? '100%' : '600px', maxWidth: '90vw' }}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>{isTempBookingMode ? '임시(부킹) 결제 처리' : '결제 처리'}</DrawerTitle>
              <DrawerDescription>
                {isTempBookingMode
                  ? '부킹 단계 임시 결제만 저장합니다. 정식 결제(서류) 데이터는 변경되지 않습니다.'
                  : '정식 결제 정보를 수정합니다.'}
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

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {sourcePayments.map((payment, index) => {
              const paymentType =
                !isTempBookingMode && 'paymentType' in payment
                  ? payment.paymentType || 'REGULAR'
                  : 'REGULAR';
              const isDoCost = paymentType === 'DO_COST';
              const isCustomsCost = paymentType === 'CUSTOMS_COST';
              const isCostType = !isTempBookingMode && (isDoCost || isCustomsCost);
              
              return (
                <div key={payment.id || index} className="space-y-4 p-4 border border-border rounded-lg">
                  <h3 className="text-sm font-semibold text-foreground">
                    {getPaymentTitle(payment)}
                  </h3>
                  
                  {isCostType ? (
                    /* DO 비용, 통관비용: 결제 예정일, 금액, 결과만 수정 가능 (비고 제외, 한 줄에 2개씩) */
                    <div className="grid grid-cols-1 gap-4 pt-4">
                      {/* 첫 번째 줄: 결제 예정일, 금액 */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* 결제 예정일 */}
                        <div className="space-y-2">
                          <Label htmlFor={`payments.${index}.dueDate`}>결제 예정일</Label>
                          <DatePicker
                            value={paymentFields[index]?.dueDate ?? payment.dueDate ?? undefined}
                            onChange={(value) => setValue(`payments.${index}.dueDate`, value ?? null)}
                            placeholder="날짜 선택"
                          />
                          {errors.payments?.[index]?.dueDate && (
                            <p className="text-sm text-destructive">
                              {errors.payments[index]?.dueDate?.message}
                            </p>
                          )}
                        </div>

                        {/* 금액 */}
                        <div className="space-y-2">
                          <Label htmlFor={`payments.${index}.amount`}>금액</Label>
                          <NumberInput
                            id={`payments.${index}.amount`}
                            value={paymentFields[index]?.amount ?? (payment.amount ? Number(payment.amount) : undefined)}
                            onChange={(value) => setValue(`payments.${index}.amount`, value ?? null)}
                            placeholder="0.00"
                            decimals={2}
                          />
                          {errors.payments?.[index]?.amount && (
                            <p className="text-sm text-destructive">
                              {errors.payments[index]?.amount?.message}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 두 번째 줄: 결과 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`payments.${index}.result`}>결과</Label>
                          <Select
                            value={
                              (() => {
                                const resultValue = paymentFields[index]?.result ?? payment.result;
                                // 빈 문자열이거나 null/undefined인 경우 'NONE'으로 설정
                                if (!resultValue || resultValue === '') {
                                  return 'NONE';
                                }
                                return resultValue;
                              })()
                            }
                            onValueChange={(value) => {
                              if (value === 'NONE') {
                                setValue(`payments.${index}.result`, null);
                              } else {
                                setValue(`payments.${index}.result`, value);
                              }
                            }}
                          >
                            <SelectTrigger id={`payments.${index}.result`}>
                              <SelectValue placeholder="결과 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">선택 안함</SelectItem>
                              {paymentResultCodes
                                .sort((a, b) => (a.order || 0) - (b.order || 0))
                                .map((code) => (
                                  <SelectItem key={code.value || code.id} value={code.value || ''}>
                                    {code.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          {errors.payments?.[index]?.result && (
                            <p className="text-sm text-destructive">
                              {errors.payments[index]?.result?.message}
                            </p>
                          )}
                        </div>
                        <div></div> {/* 두 번째 줄의 두 번째 칸은 빈 공간 */}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* REGULAR 결제: 기존 UI */}
                      {/* 읽기 전용 결제 정보 */}
                      <div className="grid grid-cols-2 gap-4 pb-4 border-b border-border">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">비율 (%)</Label>
                          <p className="text-sm">
                            {payment.ratio != null 
                              ? (() => {
                                  const ratio = Number(payment.ratio);
                                  // 소수점 이하가 0이면 정수로, 아니면 소수점 2자리까지 표시
                                  return ratio % 1 === 0 ? `${ratio}%` : `${ratio.toFixed(2)}%`;
                                })()
                              : '-'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">송장 금액</Label>
                          <p className="text-sm">
                            {payment.amount != null 
                              ? `${tradeOrder.invoiceCurrencyName || tradeOrder.invoiceCurrency || tradeOrder.currencyName || ''} ${formatNumber(payment.amount)}`
                              : '-'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">결제 방법</Label>
                          <p className="text-sm">
                            {payment.method ? getCodeName('PAYMENT_TERMS', payment.method) || payment.method : '-'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">결제 금액 (원화)</Label>
                          <p className="text-sm">
                            {(() => {
                              // 저장된 krwAmount 우선 사용, 없으면 계산
                              const savedKrwAmount = payment.krwAmount ? Number(payment.krwAmount) : null;
                              if (savedKrwAmount !== null) {
                                return `${formatNumber(savedKrwAmount)}원`;
                              }
                              // 계산해서 표시 (실시간 반영)
                              const amount = payment.amount ? Number(payment.amount) : null;
                              const exchangeRate = paymentFields[index]?.exchangeRate ?? payment.exchangeRate ?? null;
                              if (amount !== null && exchangeRate !== null) {
                                const krwAmount = amount * Number(exchangeRate);
                                return `${formatNumber(krwAmount)}원`;
                              }
                              return '-';
                            })()}
                          </p>
                        </div>
                      </div>

                      {/* 수정 가능한 필드 */}
                      <div className="grid grid-cols-1 gap-4 pt-4">
                        {/* 결제 예정일 / 환율 / 결과 */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          {/* 결제 예정일 */}
                          <div className="space-y-2">
                            <Label htmlFor={`payments.${index}.dueDate`}>결제 예정일</Label>
                            <DatePicker
                              value={paymentFields[index]?.dueDate ?? payment.dueDate ?? undefined}
                              onChange={(value) => setValue(`payments.${index}.dueDate`, value ?? null)}
                              placeholder="날짜 선택"
                            />
                            {errors.payments?.[index]?.dueDate && (
                              <p className="text-sm text-destructive">
                                {errors.payments[index]?.dueDate?.message}
                              </p>
                            )}
                          </div>

                          {/* 환율 */}
                          <div className="space-y-2">
                            <Label htmlFor={`payments.${index}.exchangeRate`}>환율</Label>
                            <NumberInput
                              id={`payments.${index}.exchangeRate`}
                              value={paymentFields[index]?.exchangeRate ?? payment.exchangeRate ?? undefined}
                              onChange={(value) => setValue(`payments.${index}.exchangeRate`, value ?? null)}
                              placeholder="0.000000"
                              decimals={6}
                            />
                            {errors.payments?.[index]?.exchangeRate && (
                              <p className="text-sm text-destructive">
                                {errors.payments[index]?.exchangeRate?.message}
                              </p>
                            )}
                          </div>

                          {/* 결과 */}
                          <div className="space-y-2">
                            <Label htmlFor={`payments.${index}.result`}>결과</Label>
                            <Select
                              value={
                                (() => {
                                  const resultValue = paymentFields[index]?.result ?? payment.result;
                                  // 빈 문자열이거나 null/undefined인 경우 'NONE'으로 설정
                                  if (!resultValue || resultValue === '') {
                                    return 'NONE';
                                  }
                                  return resultValue;
                                })()
                              }
                              onValueChange={(value) => {
                                if (value === 'NONE') {
                                  setValue(`payments.${index}.result`, null);
                                } else {
                                  setValue(`payments.${index}.result`, value);
                                }
                              }}
                            >
                              <SelectTrigger id={`payments.${index}.result`}>
                                <SelectValue placeholder="결과 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="NONE">선택 안함</SelectItem>
                                {paymentResultCodes
                                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                                  .map((code) => (
                                    <SelectItem key={code.value || code.id} value={code.value || ''}>
                                      {code.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {errors.payments?.[index]?.result && (
                              <p className="text-sm text-destructive">
                                {errors.payments[index]?.result?.message}
                              </p>
                            )}
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
                          {errors.payments?.[index]?.notes && (
                            <p className="text-sm text-destructive">
                              {errors.payments[index]?.notes?.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  '저장'
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
