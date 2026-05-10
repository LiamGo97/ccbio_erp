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
import { Checkbox } from '@/components/ui/checkbox';
import {
  SmsSender,
  useCreateSmsSender,
  useUpdateSmsSender,
  CreateSmsSenderDto,
  UpdateSmsSenderDto,
} from '@/lib/hooks/use-sms-senders';
import { Loader2, X, Save, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface SmsSenderFormData {
  phone: string;
  name: string;
  status: boolean;
  notes?: string;
}

interface SmsSenderFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  smsSender?: SmsSender | null;
  mode: 'create' | 'edit';
  onCancel?: () => void;
}

export function SmsSenderFormDrawer({
  open,
  onOpenChange,
  smsSender,
  mode,
  onCancel,
}: SmsSenderFormDrawerProps) {
  const createMutation = useCreateSmsSender();
  const updateMutation = useUpdateSmsSender();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SmsSenderFormData>({
    defaultValues: React.useMemo(
      () => ({
        phone: smsSender?.phone || '',
        name: smsSender?.name || '',
        status: smsSender?.status ?? true,
        notes: smsSender?.notes || '',
      }),
      [smsSender],
    ),
  });

  React.useEffect(() => {
    if (open) {
      reset({
        phone: smsSender?.phone || '',
        name: smsSender?.name || '',
        status: smsSender?.status ?? true,
        notes: smsSender?.notes || '',
      });
    }
  }, [open, smsSender, reset]);

  const onSubmit = async (data: SmsSenderFormData) => {
    try {
      if (mode === 'create') {
        const createDto: CreateSmsSenderDto = {
          phone: data.phone.trim(),
          name: data.name.trim(),
          status: data.status,
          notes: data.notes?.trim() || undefined,
        };
        await createMutation.mutateAsync(createDto);
        toast({
          title: 'SMS 발신자 추가 완료',
          description: `${data.name} 발신자를 추가했습니다.`,
        });
      } else {
        const updateDto: UpdateSmsSenderDto = {
          phone: data.phone.trim(),
          name: data.name.trim(),
          status: data.status,
          notes: data.notes?.trim() || undefined,
        };
        await updateMutation.mutateAsync({ id: smsSender!.id, data: updateDto });
        toast({
          title: 'SMS 발신자 수정 완료',
          description: `${data.name} 발신자 정보를 수정했습니다.`,
        });
      }
      onOpenChange(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'SMS 발신자 저장 중 오류가 발생했습니다.';
      toast({
        title: '저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>{mode === 'create' ? 'SMS 발신자 추가' : 'SMS 발신자 수정'}</DrawerTitle>
                <DrawerDescription>
                  {mode === 'create' ? '새로운 SMS 발신자를 추가합니다.' : 'SMS 발신자 정보를 수정합니다.'}
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
              <div className="space-y-6">
                {/* 기본 정보 */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">전화번호 *</Label>
                    <Input
                      id="phone"
                      {...register('phone', { 
                        required: '전화번호를 입력해주세요.',
                        pattern: {
                          value: /^[0-9-]+$/,
                          message: '전화번호는 숫자와 하이픈(-)만 사용할 수 있습니다.',
                        },
                      })}
                      placeholder="010-1234-5678"
                    />
                    {errors.phone && (
                      <p className="text-sm text-red-500">{errors.phone.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">담당자명 *</Label>
                    <Input
                      id="name"
                      {...register('name', { required: '담당자명을 입력해주세요.' })}
                      placeholder="담당자명을 입력하세요"
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500">{errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">메모</Label>
                    <Textarea
                      id="notes"
                      {...register('notes')}
                      placeholder="메모를 입력하세요 (선택사항)"
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="status"
                      checked={watch('status')}
                      onCheckedChange={(checked) => {
                        setValue('status', checked === true, { shouldDirty: true });
                      }}
                    />
                    <Label htmlFor="status" className="cursor-pointer">
                      활성화
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t border-border">
              <div className="flex gap-2 justify-end">
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onCancel?.();
                    }}
                    disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
                <Button
                  type="submit"
                  disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
                >
                  {(isSubmitting || createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {mode === 'create' ? '추가' : '수정'}
                </Button>
              </div>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
}
