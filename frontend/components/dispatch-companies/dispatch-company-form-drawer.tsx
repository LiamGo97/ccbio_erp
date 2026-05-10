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
import { Checkbox } from '@/components/ui/checkbox';
import {
  DispatchCompany,
  useCreateDispatchCompany,
  useUpdateDispatchCompany,
  CreateDispatchCompanyDto,
  UpdateDispatchCompanyDto,
} from '@/lib/hooks/use-dispatch-companies';
import { Loader2, X, Save, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface DispatchCompanyFormData {
  name: string;
  status: boolean;
}

interface DispatchCompanyFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchCompany?: DispatchCompany | null;
  mode: 'create' | 'edit';
  onCancel?: () => void;
}

export function DispatchCompanyFormDrawer({
  open,
  onOpenChange,
  dispatchCompany,
  mode,
  onCancel,
}: DispatchCompanyFormDrawerProps) {
  const createMutation = useCreateDispatchCompany();
  const updateMutation = useUpdateDispatchCompany();


  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DispatchCompanyFormData>({
    defaultValues: React.useMemo(
      () => ({
        name: dispatchCompany?.name || '',
        status: dispatchCompany?.status ?? true,
      }),
      [dispatchCompany],
    ),
  });


  React.useEffect(() => {
    if (open) {
      reset({
        name: dispatchCompany?.name || '',
        status: dispatchCompany?.status ?? true,
      });
    }
  }, [open, dispatchCompany, reset]);

  const onSubmit = async (data: DispatchCompanyFormData) => {
    try {
      if (mode === 'create') {
        const createDto: CreateDispatchCompanyDto = {
          name: data.name.trim(),
          status: data.status,
        };
        await createMutation.mutateAsync(createDto);
        toast({
          title: '배차 업체 추가 완료',
          description: `${data.name} 배차 업체를 추가했습니다.`,
        });
      } else {
        const updateDto: UpdateDispatchCompanyDto = {
          name: data.name.trim(),
          status: data.status,
        };
        await updateMutation.mutateAsync({ id: dispatchCompany!.id, data: updateDto });
        toast({
          title: '배차 업체 수정 완료',
          description: `${data.name} 배차 업체 정보를 수정했습니다.`,
        });
      }
      onOpenChange(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || '배차 업체 저장 중 오류가 발생했습니다.';
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
                <DrawerTitle>{mode === 'create' ? '배차 업체 추가' : '배차 업체 수정'}</DrawerTitle>
                <DrawerDescription>
                  {mode === 'create' ? '새로운 배차 업체를 추가합니다.' : '배차 업체 정보를 수정합니다.'}
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
                    <Label htmlFor="name">업체명 *</Label>
                    <Input
                      id="name"
                      {...register('name', { required: '업체명을 입력해주세요.' })}
                      placeholder="배차 업체명을 입력하세요"
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500">{errors.name.message}</p>
                    )}
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

