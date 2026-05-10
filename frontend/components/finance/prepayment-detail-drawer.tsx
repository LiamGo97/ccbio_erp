'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import { DatePicker } from '@/components/schedules/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, CheckCircle2, XCircle, ExternalLink, Pencil } from 'lucide-react';
import { usePrepayment, useConfirmPrepayment, useCancelPrepayment, useUpdatePrepayment } from '@/lib/hooks/use-prepayments';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { useForm } from 'react-hook-form';
import { DollarSign } from 'lucide-react';

interface PrepaymentDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prepaymentId?: string | null;
  onSuccess?: () => void;
}

interface ConfirmFormData {
  actualAmount: number;
  confirmedDate: string;
  paymentMethod: string;
  notes: string;
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
  const num = Number(value);
  if (num % 1 === 0) return num.toLocaleString('ko-KR');
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function PrepaymentDetailDrawer({
  open,
  onOpenChange,
  prepaymentId,
  onSuccess,
}: PrepaymentDetailDrawerProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { data, isLoading, refetch } = usePrepayment(prepaymentId ?? undefined);
  const { data: paymentStatusCodes } = useCodesByCategory('PREPAYMENT_PAYMENT_STATUS');
  const { data: deductionStatusCodes } = useCodesByCategory('PREPAYMENT_DEDUCTION_STATUS');
  const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false);
  const [confirmFormDialogOpen, setConfirmFormDialogOpen] = React.useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = React.useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const confirmMutation = useConfirmPrepayment();
  const updateMutation = useUpdatePrepayment();
  const cancelMutation = useCancelPrepayment();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<ConfirmFormData>({
    defaultValues: {
      actualAmount: data?.prepaymentAmount ?? 0,
      confirmedDate: new Date().toISOString().split('T')[0],
      paymentMethod: '',
      notes: '',
    },
    mode: 'onChange',
  });

  const updateForm = useForm<ConfirmFormData>({
    defaultValues: {
      actualAmount: data?.actualAmount ?? data?.prepaymentAmount ?? 0,
      confirmedDate: data?.confirmedDate
        ? new Date(data.confirmedDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      paymentMethod: data?.paymentMethod ?? '',
      notes: data?.notes ?? '',
    },
    mode: 'onChange',
  });

  // drawer가 열릴 때마다 데이터 갱신 및 폼 초기화
  React.useEffect(() => {
    if (open && prepaymentId) {
      refetch();
    }
  }, [open, prepaymentId, refetch]);

  React.useEffect(() => {
    if (data) {
      reset({
        actualAmount: data.actualAmount ?? data.prepaymentAmount,
        confirmedDate: data.confirmedDate
          ? new Date(data.confirmedDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        paymentMethod: data.paymentMethod ?? '',
        notes: data.notes ?? '',
      });
    }
  }, [data, reset]);

  // 다이얼로그가 열릴 때마다 폼 초기화
  React.useEffect(() => {
    if (confirmFormDialogOpen && data) {
      reset({
        actualAmount: data.prepaymentAmount,
        confirmedDate: new Date().toISOString().split('T')[0],
        paymentMethod: '',
        notes: '',
      });
    }
  }, [confirmFormDialogOpen, data, reset]);

  // 수정 다이얼로그가 열릴 때마다 폼 초기화
  React.useEffect(() => {
    if (updateDialogOpen && data) {
      updateForm.reset({
        actualAmount: data.actualAmount ?? data.prepaymentAmount,
        confirmedDate: data.confirmedDate
          ? new Date(data.confirmedDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        paymentMethod: data.paymentMethod ?? '',
        notes: data.notes ?? '',
      });
    }
  }, [updateDialogOpen, data, updateForm]);

  const getStatusBadge = (paymentStatus?: string | null, deductionStatus?: string | null) => {
    const paymentCode = paymentStatusCodes?.find((c) => c.value === paymentStatus);
    const deductionCode = deductionStatusCodes?.find((c) => c.value === deductionStatus);
    
    const paymentStatusName = paymentCode?.name ?? paymentStatus ?? '-';
    const deductionStatusName = deductionCode?.name ?? deductionStatus ?? '-';
    
    const normalizedPaymentStatus = paymentStatus?.trim().toUpperCase() ?? '';
    const normalizedDeductionStatus = deductionStatus?.trim().toUpperCase() ?? '';

    // 차감 상태가 DEDUCTED면 차감 상태를 우선 표시
    if (normalizedDeductionStatus === 'DEDUCTED') {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300">
            {deductionStatusName}
          </Badge>
          <span className="text-xs text-muted-foreground">
            ({paymentStatusName})
          </span>
        </div>
      );
    }

    // 입금 상태별 뱃지 스타일
    if (normalizedPaymentStatus === 'REQUESTED') {
      return (
        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300">
          {paymentStatusName}
        </Badge>
      );
    }
    if (normalizedPaymentStatus === 'CONFIRMED') {
      return (
        <Badge variant="outline" className="border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300">
          {paymentStatusName}
        </Badge>
      );
    }
    if (normalizedPaymentStatus === 'AVAILABLE') {
      return (
        <Badge variant="outline" className="border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300">
          {paymentStatusName}
        </Badge>
      );
    }
    if (normalizedPaymentStatus === 'REFUNDED') {
      return (
        <Badge variant="outline" className="border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300">
          {paymentStatusName}
        </Badge>
      );
    }
    if (normalizedPaymentStatus === 'CANCELLED') {
      return (
        <Badge variant="outline" className="border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300">
          {paymentStatusName}
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
        {paymentStatusName}
      </Badge>
    );
  };

  const handleSalesClick = () => {
    if (data?.salesId) {
      router.push(`/sales?salesId=${data.salesId}`);
      onOpenChange(false);
    }
  };

  const onSubmitConfirm = async (formData: ConfirmFormData) => {
    if (!prepaymentId) return;

    // 유효성 검사
    if (!formData.actualAmount || formData.actualAmount <= 0) {
      toast({
        title: '오류',
        description: '실제 입금액은 0보다 커야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await confirmMutation.mutateAsync({
        prepaymentId,
        actualAmount: formData.actualAmount,
        confirmedDate: formData.confirmedDate,
        paymentMethod: formData.paymentMethod || null,
        notes: formData.notes || null,
      });

      toast({
        title: '입금 확인 완료',
        description: '선입금 입금 확인이 완료되었습니다.',
      });

      setConfirmDialogOpen(false);
      setConfirmFormDialogOpen(false);
      await refetch();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('입금 확인 실패:', error);
      toast({
        title: '입금 확인 실패',
        description: error?.response?.data?.message || '입금 확인 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    if (!prepaymentId) return;

    try {
      await cancelMutation.mutateAsync(prepaymentId);

      toast({
        title: '선입금 취소 완료',
        description: '선입금이 취소되었습니다.',
      });

      setCancelDialogOpen(false);
      await refetch();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('선입금 취소 실패:', error);
      toast({
        title: '선입금 취소 실패',
        description: error?.response?.data?.message || '선입금 취소 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const onSubmitUpdate = async (formData: ConfirmFormData) => {
    if (!prepaymentId) return;

    // 유효성 검사
    if (!formData.actualAmount || formData.actualAmount <= 0) {
      toast({
        title: '오류',
        description: '실제 입금액은 0보다 커야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        prepaymentId,
        actualAmount: formData.actualAmount,
        confirmedDate: formData.confirmedDate,
        paymentMethod: formData.paymentMethod || null,
        notes: formData.notes || null,
      });

      toast({
        title: '선입금 수정 완료',
        description: '선입금 정보가 성공적으로 수정되었습니다.',
      });

      setUpdateDialogOpen(false);
      await refetch();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('선입금 수정 실패:', error);
      toast({
        title: '선입금 수정 실패',
        description: error?.response?.data?.message || '선입금 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const actualAmount = watch('actualAmount');
  const prepaymentAmount = data?.prepaymentAmount ?? 0;
  const differenceAmount = actualAmount ? actualAmount - prepaymentAmount : null;

  const updateActualAmount = updateForm.watch('actualAmount');
  const updateDifferenceAmount = updateActualAmount ? updateActualAmount - prepaymentAmount : null;

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (cancelDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setCancelDialogOpen(false);
        return;
      }
      if (confirmDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setConfirmDialogOpen(false);
        return;
      }
      if (updateDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setUpdateDialogOpen(false);
        return;
      }
      if (confirmFormDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setConfirmFormDialogOpen(false);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    open,
    onOpenChange,
    cancelDialogOpen,
    confirmDialogOpen,
    updateDialogOpen,
    confirmFormDialogOpen,
  ]);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="h-full"
          style={{ width: isMobile ? '100%' : '85%', maxWidth: '1200px' }}
        >
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DrawerTitle>선입금 상세정보</DrawerTitle>
                <DrawerDescription>
                  선입금 정보를 확인하고 입금 확인 및 수정 처리를 할 수 있습니다.
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

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !data ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  데이터를 불러올 수 없습니다.
                </div>
              ) : (
                <>
                  {/* 선입금 정보 섹션 */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">선입금 정보</h3>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">고객명</span>
                        <span className="text-sm font-medium">{data.customerName || '-'}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">판매 ID</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{data.salesId || '-'}</span>
                          {data.salesId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={handleSalesClick}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">예약일</span>
                        <span className="text-sm font-medium">{formatDate(data.reservationDate)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">상태</span>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(data.paymentStatus, data.deductionStatus)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">청구일</span>
                        <span className="text-sm font-medium">{formatDate(data.requestedDate)}</span>
                      </div>
                      {data.confirmedDate && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">입금확인일</span>
                          <span className="text-sm font-medium">{formatDate(data.confirmedDate)}</span>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* 금액 정보 섹션 */}
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">금액 정보</h3>
                      {/* 수정 버튼: CONFIRMED 상태일 때만 표시 */}
                      {data.paymentStatus === 'CONFIRMED' && data.deductionStatus !== 'DEDUCTED' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setUpdateDialogOpen(true)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          수정
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">청구 금액</span>
                        <span className="text-sm font-medium">{formatNumber(data.prepaymentAmount)}원</span>
                      </div>
                      {data.actualAmount !== null && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">실제 입금액</span>
                          <span className="text-sm font-medium">{formatNumber(data.actualAmount)}원</span>
                        </div>
                      )}
                      {data.differenceAmount !== null && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">차액</span>
                          <span
                            className={`text-sm font-medium ${
                              data.differenceAmount > 0
                                ? 'text-green-600 dark:text-green-400'
                                : data.differenceAmount < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : ''
                            }`}
                          >
                            {data.differenceAmount > 0 ? '+' : ''}
                            {formatNumber(data.differenceAmount)}원
                          </span>
                        </div>
                      )}
                      {data.paymentMethod && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">입금 방법</span>
                          <span className="text-sm font-medium">{data.paymentMethod}</span>
                        </div>
                      )}
                    </div>
                  </section>


                  {/* 비고 섹션 */}
                  {data.notes && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">비고</h3>
                      <p className="text-sm text-muted-foreground">{data.notes}</p>
                    </section>
                  )}
                </>
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-border p-4">
            <div className="flex justify-end gap-2">
              {/* 취소 버튼: REQUESTED 또는 CONFIRMED 상태일 때만 표시 (차감되지 않은 경우만) */}
              {data && (data.paymentStatus === 'REQUESTED' || data.paymentStatus === 'CONFIRMED') && data.deductionStatus !== 'DEDUCTED' && (
                <Button
                  variant="destructive"
                  disabled={!data || cancelMutation.isPending}
                  onClick={() => setCancelDialogOpen(true)}
                  className="bg-destructive hover:bg-destructive/90 text-white"
                >
                  {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <XCircle className="mr-1.5 h-4 w-4" />
                  선입금 취소
                </Button>
              )}
              {/* 수정 버튼: CONFIRMED 상태일 때만 표시 (차감되지 않은 경우만) */}
              {data && data.paymentStatus === 'CONFIRMED' && data.deductionStatus !== 'DEDUCTED' && (
                <Button
                  variant="default"
                  disabled={!data || updateMutation.isPending}
                  onClick={() => setUpdateDialogOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Pencil className="mr-1.5 h-4 w-4" />
                  수정
                </Button>
              )}
              {/* 입금 확인 버튼: REQUESTED 상태일 때만 표시 */}
              {data && data.paymentStatus === 'REQUESTED' && data.deductionStatus !== 'DEDUCTED' && (
                <Button
                  variant="default"
                  disabled={!data || confirmMutation.isPending}
                  onClick={() => setConfirmFormDialogOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <DollarSign className="mr-1.5 h-4 w-4" />
                  입금 확인
                </Button>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* 입금 확인 폼 다이얼로그 */}
      {data && (
        <Dialog open={confirmFormDialogOpen} onOpenChange={setConfirmFormDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>입금 확인</DialogTitle>
              <DialogDescription>
                선입금에 대한 입금 확인을 처리합니다.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(() => {
              const actualAmount = watch('actualAmount');
              if (!actualAmount || actualAmount <= 0) {
                toast({
                  title: '오류',
                  description: '실제 입금액은 0보다 커야 합니다.',
                  variant: 'destructive',
                });
                return;
              }
              setConfirmDialogOpen(true);
            })} className="space-y-4">
              {/* 선입금 정보 */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="text-sm font-medium text-muted-foreground">선입금 정보</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">고객명:</span>
                    <span className="ml-2 font-medium">{data.customerName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">청구 금액:</span>
                    <span className="ml-2 font-semibold text-primary">
                      {formatNumber(data.prepaymentAmount)}원
                    </span>
                  </div>
                </div>
              </div>

              {/* 실제 입금액 */}
              <div className="space-y-2">
                <Label htmlFor="actualAmount">
                  실제 입금액 <span className="text-destructive">*</span>
                </Label>
                <NumberInput
                  id="actualAmount"
                  value={watch('actualAmount') ?? data.prepaymentAmount}
                  onChange={(value) => {
                    const numValue = value ?? 0;
                    setValue('actualAmount', numValue, { 
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  decimals={0}
                  className={errors.actualAmount ? 'border-destructive' : ''}
                />
                {errors.actualAmount && (
                  <p className="text-xs text-destructive">
                    {errors.actualAmount.type === 'required' 
                      ? '실제 입금액을 입력해주세요.'
                      : errors.actualAmount.type === 'min'
                        ? '0보다 큰 값을 입력해주세요.'
                        : errors.actualAmount.message}
                  </p>
                )}
                {differenceAmount !== null && differenceAmount !== 0 && (
                  <p className={`text-xs ${differenceAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    차액: {differenceAmount > 0 ? '+' : ''}
                    {formatNumber(differenceAmount)}원
                  </p>
                )}
              </div>

              {/* 입금확인일 */}
              <div className="space-y-2">
                <Label htmlFor="confirmedDate">입금확인일</Label>
                <DatePicker
                  value={watch('confirmedDate') || new Date().toISOString().split('T')[0]}
                  onChange={(value) => {
                    setValue('confirmedDate', value || new Date().toISOString().split('T')[0]);
                  }}
                />
              </div>

              {/* 입금 방법 */}
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">입금 방법</Label>
                <Select
                  value={watch('paymentMethod') || undefined}
                  onValueChange={(value) => setValue('paymentMethod', value === '__none__' ? '' : value)}
                >
                  <SelectTrigger id="paymentMethod">
                    <SelectValue placeholder="입금 방법을 선택하세요" />
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

              {/* 비고 */}
              <div className="space-y-2">
                <Label htmlFor="notes">비고</Label>
                <Textarea
                  id="notes"
                  placeholder="비고를 입력하세요"
                  rows={3}
                  {...register('notes')}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConfirmFormDialogOpen(false);
                    reset();
                  }}
                  disabled={confirmMutation.isPending}
                >
                  취소
                </Button>
                <Button type="submit" disabled={confirmMutation.isPending}>
                  {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  확인
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* 입금 확인 확인 다이얼로그 */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>입금 확인</AlertDialogTitle>
            <AlertDialogDescription>
              실제 입금액: {formatNumber(actualAmount)}원
              <br />
              청구 금액: {formatNumber(prepaymentAmount)}원
              {differenceAmount !== null && (
                <>
                  <br />
                  차액: {differenceAmount > 0 ? '+' : ''}
                  {formatNumber(differenceAmount)}원
                </>
              )}
              <br />
              <br />
              입금 확인을 진행하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmit(onSubmitConfirm)}
              disabled={confirmMutation.isPending}
            >
              {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 선입금 수정 다이얼로그 */}
      {data && data.paymentStatus === 'CONFIRMED' && data.deductionStatus !== 'DEDUCTED' && (
        <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>선입금 수정</DialogTitle>
              <DialogDescription>
                입금 확인된 선입금의 실제 입금액 및 정보를 수정합니다.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={updateForm.handleSubmit(onSubmitUpdate)} className="space-y-4">
              {/* 선입금 정보 */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="text-sm font-medium text-muted-foreground">선입금 정보</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">고객명:</span>
                    <span className="ml-2 font-medium">{data.customerName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">청구 금액:</span>
                    <span className="ml-2 font-semibold text-primary">
                      {formatNumber(data.prepaymentAmount)}원
                    </span>
                  </div>
                </div>
              </div>

              {/* 실제 입금액 */}
              <div className="space-y-2">
                <Label htmlFor="updateActualAmount">
                  실제 입금액 <span className="text-destructive">*</span>
                </Label>
                <NumberInput
                  id="updateActualAmount"
                  value={updateForm.watch('actualAmount') ?? data.actualAmount ?? data.prepaymentAmount}
                  onChange={(value) => {
                    const numValue = value ?? 0;
                    updateForm.setValue('actualAmount', numValue, { 
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  decimals={0}
                  className={updateForm.formState.errors.actualAmount ? 'border-destructive' : ''}
                />
                {updateForm.formState.errors.actualAmount && (
                  <p className="text-xs text-destructive">
                    {updateForm.formState.errors.actualAmount.type === 'required' 
                      ? '실제 입금액을 입력해주세요.'
                      : updateForm.formState.errors.actualAmount.type === 'min'
                        ? '0보다 큰 값을 입력해주세요.'
                        : updateForm.formState.errors.actualAmount.message}
                  </p>
                )}
                {updateDifferenceAmount !== null && updateDifferenceAmount !== 0 && (
                  <p className={`text-xs ${updateDifferenceAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    차액: {updateDifferenceAmount > 0 ? '+' : ''}
                    {formatNumber(updateDifferenceAmount)}원
                  </p>
                )}
              </div>

              {/* 입금확인일 */}
              <div className="space-y-2">
                <Label htmlFor="updateConfirmedDate">입금확인일</Label>
                <DatePicker
                  value={updateForm.watch('confirmedDate') || (data.confirmedDate ? new Date(data.confirmedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])}
                  onChange={(value) => {
                    updateForm.setValue('confirmedDate', value || new Date().toISOString().split('T')[0]);
                  }}
                />
              </div>

              {/* 입금 방법 */}
              <div className="space-y-2">
                <Label htmlFor="updatePaymentMethod">입금 방법</Label>
                <Select
                  value={updateForm.watch('paymentMethod') || undefined}
                  onValueChange={(value) => updateForm.setValue('paymentMethod', value === '__none__' ? '' : value)}
                >
                  <SelectTrigger id="updatePaymentMethod">
                    <SelectValue placeholder="입금 방법을 선택하세요" />
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

              {/* 비고 */}
              <div className="space-y-2">
                <Label htmlFor="updateNotes">비고</Label>
                <Textarea
                  id="updateNotes"
                  placeholder="비고를 입력하세요"
                  rows={3}
                  {...updateForm.register('notes')}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setUpdateDialogOpen(false);
                    updateForm.reset();
                  }}
                  disabled={updateMutation.isPending}
                >
                  취소
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Pencil className="mr-2 h-4 w-4" />
                  수정
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* 선입금 취소 확인 다이얼로그 */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선입금 취소</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 선입금을 취소하시겠습니까?
              <br />
              <br />
              <strong>취소 시 처리:</strong>
              <br />
              • REQUESTED 상태: 선입금이 취소되어 고객에게 반환하거나 다음 거래에 사용할 수 있습니다.
              <br />
              • CONFIRMED 상태: 이미 입금 확인된 선입금이므로 환불 처리 또는 다음 거래에 사용할 수 있습니다.
              <br />
              <br />
              <span className="text-destructive font-medium">이 작업은 되돌릴 수 없습니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
