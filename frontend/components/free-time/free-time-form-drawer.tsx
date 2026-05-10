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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Loader2, Trash2, Plus, Edit } from 'lucide-react';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { CreateFreeTimeDto, FreeTime } from '@/lib/hooks/use-free-time';
import { toast } from '@/components/ui/use-toast';

export interface FreeTimeFormData {
  exporterCode: string;
  shippingLineCode: string;
  type: 'DM' | 'DT' | 'CB' | '';
  baseDate: string;
  value?: string | null;
}

interface FreeTimeFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  freeTime?: FreeTime | null;
  onSubmit?: (data: CreateFreeTimeDto) => Promise<void>;
  onDelete?: (freeTime: FreeTime) => void;
}

export function FreeTimeFormDrawer({
  open,
  onOpenChange,
  mode,
  freeTime,
  onSubmit,
  onDelete,
}: FreeTimeFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { data: exporterCodes } = useCodesByCategory('EXPORTER');
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    register,
    formState: { errors },
  } = useForm<FreeTimeFormData>({
    defaultValues: {
      exporterCode: '',
      shippingLineCode: '',
      type: '',
      baseDate: today,
      value: '',
    },
  });

  React.useEffect(() => {
    register('type', { required: '유형을 선택해주세요.' });
  }, [register]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'edit' && freeTime) {
      reset({
        exporterCode: freeTime.exporterCode ?? '',
        shippingLineCode: freeTime.shippingLineCode ?? '',
        type: freeTime.type ?? '',
        baseDate: freeTime.baseDate ?? today,
        value: freeTime.value ?? '',
      });
    } else {
      reset({
        exporterCode: '',
        shippingLineCode: '',
        type: '',
        baseDate: today,
        value: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, freeTime?.id]);

  const onSubmitInternal = async (data: FreeTimeFormData) => {
    if (!onSubmit) {
      return;
    }
    if (!data.type) {
      toast({
        title: '유형 선택 필요',
        description: '유형(DM/DT/CB)을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...data,
        exporterCode: data.exporterCode.trim(),
        shippingLineCode: data.shippingLineCode.trim(),
        type: data.type.trim().toUpperCase() as 'DM' | 'DT' | 'CB',
        baseDate: data.baseDate.trim(),
        value: data.value?.trim() || undefined,
      } as CreateFreeTimeDto);
      onOpenChange(false);
      reset();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'FT 정보를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: 'FT 저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const exporterValue = watch('exporterCode');
  const shippingLineValue = watch('shippingLineCode');
  const typeValue = watch('type');

  const exporterOptions =
    exporterCodes?.map((code) => ({
      value: code.value ?? code.name,
      label: code.name ?? code.value ?? '',
    })) ?? [];

  const shippingLineOptions =
    shippingLineCodes?.map((code) => ({
      value: code.value ?? code.name,
      label: code.name ?? code.value ?? '',
    })) ?? [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '520px', maxWidth: '520px' }}>
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>{mode === 'create' ? 'FT 추가' : 'FT 수정'}</DrawerTitle>
              <DrawerDescription>
                선사/수출사 조합별 FT (Free Time) 기준을 설정합니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <form onSubmit={handleSubmit(onSubmitInternal)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exporterCode">수출사</Label>
                <Select
                  value={exporterValue || ''}
                  onValueChange={(value) => setValue('exporterCode', value)}
                >
                  <SelectTrigger id="exporterCode" size="sm">
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
                {errors.exporterCode && (
                  <p className="text-xs text-destructive mt-1">{errors.exporterCode.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingLineCode">선사</Label>
                <Select
                  value={shippingLineValue || ''}
                  onValueChange={(value) => setValue('shippingLineCode', value)}
                >
                  <SelectTrigger id="shippingLineCode" size="sm">
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
                {errors.shippingLineCode && (
                  <p className="text-xs text-destructive mt-1">{errors.shippingLineCode.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">유형</Label>
                <Select
                  value={typeValue || ''}
                  onValueChange={(value) =>
                    setValue('type', value as 'DM' | 'DT' | 'CB', { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="type" size="sm">
                    <SelectValue placeholder="유형 선택 (DM/DT/CB)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DM">DM (Delivery Manifest)</SelectItem>
                    <SelectItem value="DT">DT (Delivery Order)</SelectItem>
                    <SelectItem value="CB">CB (Customs Clearance)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-xs text-destructive mt-1">{errors.type.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseDate">기준일</Label>
                <Input
                  id="baseDate"
                  type="date"
                  {...register('baseDate', { required: '기준일을 입력해주세요.' })}
                />
                {errors.baseDate && (
                  <p className="text-xs text-destructive mt-1">{errors.baseDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="value">FT 값</Label>
                <Input id="value" {...register('value')} />
              </div>
            </div>
          </div>

          <DrawerFooter className="border-t gap-2">
            {mode === 'edit' && freeTime && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDelete(freeTime)}
                disabled={isSubmitting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
              </Button>
            ) : (
              <DrawerClose asChild>
                <Button type="button" variant="outline" size="sm" disabled={isSubmitting}>
                  취소
                </Button>
              </DrawerClose>
            )}
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'create' ? (
                <Plus className="h-4 w-4" />
              ) : (
                <Edit className="h-4 w-4" />
              )}
              {mode === 'create' ? '등록하기' : '수정하기'}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}



