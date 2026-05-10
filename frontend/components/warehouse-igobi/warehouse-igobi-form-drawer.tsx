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
import { X, Loader2, Trash2, Plus, Edit } from 'lucide-react';
import { CreateWarehouseIgobiDto, WarehouseIgobi } from '@/lib/hooks/use-warehouse-igobi';
import { toast } from '@/components/ui/use-toast';
import { DatePicker } from '@/components/schedules/date-picker';
import { formatNumber, parseNumber } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWarehouses } from '@/lib/hooks/use-warehouses';

export interface WarehouseIgobiFormData {
  warehouseId: number;
  baseDate: string;
  igobi: number;
}

interface WarehouseIgobiFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  warehouseIgobi?: WarehouseIgobi | null;
  warehouseId?: number | null; // 창고가 고정된 경우
  warehouseName?: string | null; // 창고 이름 (warehouseId가 있을 때 사용)
  onSubmit?: (data: CreateWarehouseIgobiDto) => Promise<void>;
  onDelete?: (warehouseIgobi: WarehouseIgobi) => void;
}

export function WarehouseIgobiFormDrawer({
  open,
  onOpenChange,
  mode,
  warehouseIgobi,
  warehouseId,
  warehouseName,
  onSubmit,
  onDelete,
}: WarehouseIgobiFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isWarehouseFixed = !!warehouseId && !!warehouseName;
  const { data: warehouses = [] } = useWarehouses({ status: true });

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    register,
    formState: { errors },
  } = useForm<WarehouseIgobiFormData>({
    defaultValues: {
      warehouseId: warehouseId ?? 0,
      baseDate: today,
      igobi: 0,
    },
  });

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'edit' && warehouseIgobi) {
      reset({
        warehouseId: warehouseIgobi.warehouseId ?? warehouseId ?? 0,
        baseDate: warehouseIgobi.baseDate ?? today,
        igobi: warehouseIgobi.igobi ?? 0,
      });
    } else {
      reset({
        warehouseId: warehouseId ?? 0,
        baseDate: today,
        igobi: 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, warehouseIgobi?.id, warehouseId]);

  const onSubmitInternal = async (data: WarehouseIgobiFormData) => {
    if (!onSubmit) {
      return;
    }
    setIsSubmitting(true);
    try {
      // 이고비 값에서 콤마 제거 후 숫자로 변환
      const igobiValue = typeof data.igobi === 'string' 
        ? parseNumber(data.igobi) ?? 0 
        : data.igobi ?? 0;
      
      if (!data.warehouseId || data.warehouseId === 0) {
        throw new Error('창고를 선택해주세요.');
      }
      
      await onSubmit({
        warehouseId: data.warehouseId,
        baseDate: data.baseDate.trim(),
        igobi: igobiValue,
      });
      onOpenChange(false);
      reset();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        '이고비 저장 중 오류가 발생했습니다.';
      toast({
        title: '저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const warehouseIdValue = watch('warehouseId');
  const igobiValue = watch('igobi');
  
  const warehouseOptions = React.useMemo(() => {
    return warehouses
      .map((warehouse) => ({
        value: warehouse.id.toString(),
        label: warehouse.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [warehouses]);


  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '520px', maxWidth: '520px' }}>
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>{mode === 'create' ? '창고 이고비 추가' : '창고 이고비 수정'}</DrawerTitle>
              <DrawerDescription>
                창고별 이고비를 기준일별로 설정합니다.
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
            <div className="grid grid-cols-1 gap-4">
              {isWarehouseFixed ? (
                <div className="space-y-2">
                  <Label htmlFor="warehouseName">창고</Label>
                  <Input
                    id="warehouseName"
                    value={warehouseName ?? ''}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="warehouseId">창고</Label>
                  <Select
                    value={warehouseIdValue ? warehouseIdValue.toString() : ''}
                    onValueChange={(value) => setValue('warehouseId', parseInt(value, 10), { shouldValidate: true })}
                  >
                    <SelectTrigger id="warehouseId" size="sm">
                      <SelectValue placeholder="창고 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.warehouseId && (
                    <p className="text-xs text-destructive mt-1">{errors.warehouseId.message}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="baseDate">기준일</Label>
                <DatePicker
                  value={watch('baseDate')}
                  onChange={(value) => {
                    setValue('baseDate', value || today, { shouldValidate: true });
                  }}
                  placeholder="기준일 선택"
                />
                {errors.baseDate && (
                  <p className="text-xs text-destructive mt-1">{errors.baseDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="igobi">이고비 (컨당)</Label>
                <Input
                  id="igobi"
                  type="text"
                  value={formatNumber(igobiValue)}
                  onChange={(e) => {
                    const num = parseNumber(e.target.value);
                    setValue('igobi', num ?? 0, { shouldValidate: true });
                  }}
                  placeholder="0"
                />
                {errors.igobi && (
                  <p className="text-xs text-destructive mt-1">{errors.igobi.message}</p>
                )}
              </div>
            </div>
          </div>

          <DrawerFooter className="border-t gap-2">
            {mode === 'edit' && warehouseIgobi && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDelete(warehouseIgobi)}
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

