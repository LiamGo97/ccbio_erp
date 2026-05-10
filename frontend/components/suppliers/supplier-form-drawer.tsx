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
  Supplier,
  useCreateSupplier,
  useUpdateSupplier,
  CreateSupplierDto,
  UpdateSupplierDto,
} from '@/lib/hooks/use-suppliers';
import { Loader2, X, Save, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface SupplierFormData {
  businessRegistrationNumber: string;
  representativeName: string;
  companyName: string;
  address: string;
  tel: string;
  status: boolean;
}

interface SupplierFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  mode: 'create' | 'edit';
  onCancel?: () => void;
}

export function SupplierFormDrawer({
  open,
  onOpenChange,
  supplier,
  mode,
  onCancel,
}: SupplierFormDrawerProps) {
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormData>({
    defaultValues: React.useMemo(
      () => ({
        businessRegistrationNumber: supplier?.businessRegistrationNumber || '',
        representativeName: supplier?.representativeName || '',
        companyName: supplier?.companyName || '',
        address: supplier?.address || '',
        tel: supplier?.tel || '',
        status: supplier?.status ?? true,
      }),
      [supplier],
    ),
  });

  React.useEffect(() => {
    if (open) {
      reset({
        businessRegistrationNumber: supplier?.businessRegistrationNumber || '',
        representativeName: supplier?.representativeName || '',
        companyName: supplier?.companyName || '',
        address: supplier?.address || '',
        tel: supplier?.tel || '',
        status: supplier?.status ?? true,
      });
    }
  }, [open, supplier, reset]);

  const onSubmit = async (data: SupplierFormData) => {
    try {
      if (mode === 'create') {
        const createDto: CreateSupplierDto = {
          businessRegistrationNumber: data.businessRegistrationNumber.trim(),
          representativeName: data.representativeName.trim(),
          companyName: data.companyName.trim(),
          address: data.address.trim(),
          tel: data.tel.trim(),
          status: data.status,
        };
        await createMutation.mutateAsync(createDto);
      } else {
        const updateDto: UpdateSupplierDto = {
          businessRegistrationNumber: data.businessRegistrationNumber.trim(),
          representativeName: data.representativeName.trim(),
          companyName: data.companyName.trim(),
          address: data.address.trim(),
          tel: data.tel.trim(),
          status: data.status,
        };
        await updateMutation.mutateAsync({ id: supplier!.id, data: updateDto });
      }
      onOpenChange(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || '공급자 저장 중 오류가 발생했습니다.';
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
                <DrawerTitle>{mode === 'create' ? '공급자 추가' : '공급자 수정'}</DrawerTitle>
                <DrawerDescription>
                  {mode === 'create' ? '새로운 공급자를 추가합니다.' : '공급자 정보를 수정합니다.'}
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
                    <Label htmlFor="companyName">상호 (회사명) *</Label>
                    <Input
                      id="companyName"
                      {...register('companyName', { required: '회사명을 입력해주세요.' })}
                      placeholder="참참바이오 주식회사"
                    />
                    {errors.companyName && (
                      <p className="text-sm text-red-500">{errors.companyName.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="representativeName">성명 (대표) *</Label>
                    <Input
                      id="representativeName"
                      {...register('representativeName', { required: '대표자명을 입력해주세요.' })}
                      placeholder="김성오"
                    />
                    {errors.representativeName && (
                      <p className="text-sm text-red-500">{errors.representativeName.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessRegistrationNumber">사업자등록번호 *</Label>
                    <Input
                      id="businessRegistrationNumber"
                      {...register('businessRegistrationNumber', { required: '사업자등록번호를 입력해주세요.' })}
                      placeholder="521-81-03288"
                    />
                    {errors.businessRegistrationNumber && (
                      <p className="text-sm text-red-500">{errors.businessRegistrationNumber.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tel">전화번호 (TEL) *</Label>
                    <Input
                      id="tel"
                      {...register('tel', { required: '전화번호를 입력해주세요.' })}
                      placeholder="031-373-3288"
                    />
                    {errors.tel && (
                      <p className="text-sm text-red-500">{errors.tel.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">주소 *</Label>
                    <Input
                      id="address"
                      {...register('address', { required: '주소를 입력해주세요.' })}
                      placeholder="경기도 화성시 동탄광역환승로62, 438호"
                    />
                    {errors.address && (
                      <p className="text-sm text-red-500">{errors.address.message}</p>
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
