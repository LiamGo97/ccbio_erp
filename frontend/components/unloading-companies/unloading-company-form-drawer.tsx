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
import {
  UnloadingCompany,
  useCreateUnloadingCompany,
  useUpdateUnloadingCompany,
  CreateUnloadingCompanyDto,
  UpdateUnloadingCompanyDto,
} from '@/lib/hooks/use-unloading-companies';
import { Loader2, X, Save } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits;
};

interface UnloadingCompanyFormData {
  representativeName: string;
  contact: string;
  notes: string;
}

interface UnloadingCompanyFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unloadingCompany?: UnloadingCompany | null;
  mode: 'create' | 'edit';
  onCancel?: () => void;
}

export function UnloadingCompanyFormDrawer({
  open,
  onOpenChange,
  unloadingCompany,
  mode,
  onCancel,
}: UnloadingCompanyFormDrawerProps) {
  const createMutation = useCreateUnloadingCompany();
  const updateMutation = useUpdateUnloadingCompany();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UnloadingCompanyFormData>({
    defaultValues: React.useMemo(
      () => ({
        representativeName: unloadingCompany?.representativeName || '',
        contact: unloadingCompany?.contact ? formatPhone(unloadingCompany.contact) : '',
        notes: unloadingCompany?.notes || '',
      }),
      [unloadingCompany],
    ),
  });

  React.useEffect(() => {
    if (open) {
      reset({
        representativeName: unloadingCompany?.representativeName || '',
        contact: unloadingCompany?.contact ? formatPhone(unloadingCompany.contact) : '',
        notes: unloadingCompany?.notes || '',
      });
    }
  }, [open, unloadingCompany, reset]);

  const onSubmit = async (data: UnloadingCompanyFormData) => {
    try {
      if (mode === 'create') {
        const createDto: CreateUnloadingCompanyDto = {
          representativeName: data.representativeName.trim(),
          contact: data.contact.trim(),
          notes: data.notes?.trim() || undefined,
        };
        await createMutation.mutateAsync(createDto);
        toast({
          title: '하차 업체 추가 완료',
          description: `${data.representativeName} 하차 업체를 추가했습니다.`,
        });
      } else {
        const updateDto: UpdateUnloadingCompanyDto = {
          representativeName: data.representativeName.trim(),
          contact: data.contact.trim(),
          notes: data.notes?.trim() || undefined,
        };
        await updateMutation.mutateAsync({ id: unloadingCompany!.id, data: updateDto });
        toast({
          title: '하차 업체 수정 완료',
          description: `${data.representativeName} 하차 업체 정보를 수정했습니다.`,
        });
      }
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        (error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string | string[] } } })?.response?.data
              ?.message
          : null) || '처리 중 오류가 발생했습니다.';
      toast({
        title: mode === 'create' ? '하차 업체 추가 실패' : '하차 업체 수정 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>{mode === 'create' ? '하차 업체 추가' : '하차 업체 수정'}</DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 하차 업체 정보를 입력하세요.'
                  : '하차 업체 정보를 수정하세요.'}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="representativeName">
                  대표자명 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="representativeName"
                  {...register('representativeName', {
                    required: '대표자명을 입력하세요.',
                    maxLength: {
                      value: 100,
                      message: '대표자명은 100자 이하여야 합니다.',
                    },
                  })}
                  placeholder="대표자명을 입력하세요"
                />
                {errors.representativeName && (
                  <p className="text-sm text-destructive">{errors.representativeName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact">
                  연락처 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contact"
                  placeholder="010-1234-5678"
                  {...register('contact', {
                    required: '연락처를 입력하세요.',
                    maxLength: {
                      value: 50,
                      message: '연락처는 50자 이하여야 합니다.',
                    },
                    onChange: (e) => {
                      const formatted = formatPhone(e.target.value);
                      setValue('contact', formatted, { shouldDirty: true, shouldValidate: true });
                    },
                  })}
                />
                {errors.contact && (
                  <p className="text-sm text-destructive">{errors.contact.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">비고</Label>
                <Textarea
                  id="notes"
                  {...register('notes')}
                  placeholder="비고를 입력하세요"
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-end gap-2">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  취소
                </Button>
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
                    저장
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

