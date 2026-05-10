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
import { Loader2, X, Save } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { DatePicker } from '@/components/schedules/date-picker';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { Checkbox } from '@/components/ui/checkbox';
import {
  OrganicCertification,
  useCreateOrganicCertification,
  useUpdateOrganicCertification,
} from '@/lib/hooks/use-organic-certifications';

interface OrganicCertificationFormData {
  mainProduct?: string;
  certificationType?: string;
  companyName?: string;
  producer?: string;
  phone?: string;
  address?: string;
  certificationStartDate?: string;
  certificationEndDate?: string;
  cultivationAreaM2?: number;
  annualProductionTarget?: number;
  livestockCount?: number;
  deliveryDestination?: string;
  detailProducts?: string[];
}

interface OrganicCertificationFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certification?: OrganicCertification | null;
  mode: 'create' | 'edit';
  onSuccess?: () => void;
}

export function OrganicCertificationFormDrawer({
  open,
  onOpenChange,
  certification,
  mode,
  onSuccess,
}: OrganicCertificationFormDrawerProps) {
  const createMutation = useCreateOrganicCertification();
  const updateMutation = useUpdateOrganicCertification();
  const { data: detailProductCodes } = useCodeMastersByGroup('ORGANIC_DETAIL_PRODUCT');
  
  // 세부품목 코드 맵 생성
  const detailProductMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (detailProductCodes ?? []).forEach((code) => {
      if (code.value) {
        map.set(code.value, code.name);
      }
    });
    return map;
  }, [detailProductCodes]);

  const today = React.useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // 전화번호 포맷터 (한국형)
  const formatPhone = React.useCallback((input: string): string => {
    if (!input) return '';
    const digits = input.replace(/[^0-9]/g, '');
    // 서울(02) 국번 처리
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
    // 휴대폰/일반지역번호
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrganicCertificationFormData>({
    defaultValues: React.useMemo(() => {
      if (certification && mode === 'edit') {
        return {
          mainProduct: certification.mainProduct || '',
          certificationType: certification.certificationType || '',
          companyName: certification.companyName || '',
          producer: certification.producer || '',
          phone: formatPhone(certification.phone || ''),
          address: certification.address || '',
          certificationStartDate: certification.certificationStartDate
            ? new Date(certification.certificationStartDate).toISOString().split('T')[0]
            : today,
          certificationEndDate: certification.certificationEndDate
            ? new Date(certification.certificationEndDate).toISOString().split('T')[0]
            : '',
          cultivationAreaM2: certification.cultivationAreaM2 || undefined,
          annualProductionTarget: certification.annualProductionTarget || undefined,
          livestockCount: certification.livestockCount || undefined,
          deliveryDestination: certification.deliveryDestination || '',
          detailProducts: certification.detailProducts || [],
        };
      }
      return {
        mainProduct: '',
        certificationType: '',
        companyName: '',
        producer: '',
        phone: '',
        address: '',
        certificationStartDate: today,
        certificationEndDate: today,
        cultivationAreaM2: undefined,
        annualProductionTarget: undefined,
        livestockCount: undefined,
        deliveryDestination: '',
        detailProducts: [],
      };
    }, [certification, mode, today, formatPhone]),
  });

  React.useEffect(() => {
    if (open) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (certification && mode === 'edit') {
        reset({
          mainProduct: certification.mainProduct || '',
          certificationType: certification.certificationType || '',
          companyName: certification.companyName || '',
          producer: certification.producer || '',
          phone: formatPhone(certification.phone || ''),
          address: certification.address || '',
          certificationStartDate: certification.certificationStartDate
            ? new Date(certification.certificationStartDate).toISOString().split('T')[0]
            : todayStr,
          certificationEndDate: certification.certificationEndDate
            ? new Date(certification.certificationEndDate).toISOString().split('T')[0]
            : '',
          cultivationAreaM2: certification.cultivationAreaM2 || undefined,
          annualProductionTarget: certification.annualProductionTarget || undefined,
          livestockCount: certification.livestockCount || undefined,
          deliveryDestination: certification.deliveryDestination || '',
          detailProducts: certification.detailProducts || [],
        });
      } else {
        reset({
          mainProduct: '',
          certificationType: '',
          companyName: '',
          producer: '',
          phone: '',
          address: '',
          certificationStartDate: todayStr,
          certificationEndDate: todayStr,
          cultivationAreaM2: undefined,
          annualProductionTarget: undefined,
          livestockCount: undefined,
          deliveryDestination: '',
          detailProducts: [],
        });
      }
    }
  }, [open, certification, mode, reset, formatPhone]);

  const onSubmit = async (data: OrganicCertificationFormData) => {
    try {
      if (mode === 'create') {
        await createMutation.mutateAsync(data);
        toast({
          title: '생성 완료',
          description: '유기축산 인증 정보를 생성했습니다.',
        });
      } else if (certification) {
        await updateMutation.mutateAsync({ id: certification.id, data });
        toast({
          title: '수정 완료',
          description: '유기축산 인증 정보를 수정했습니다.',
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: mode === 'create' ? '생성 실패' : '수정 실패',
        description: error?.response?.data?.message || '처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const isLoading = isSubmitting || createMutation.isPending || updateMutation.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle>{mode === 'create' ? '유기축산 인증 추가' : '유기축산 인증 수정'}</DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 유기축산 인증 정보를 입력하세요.'
                  : '유기축산 인증 정보를 수정하세요.'}
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

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">업체명</Label>
                <Input
                  id="companyName"
                  {...register('companyName')}
                  placeholder="업체명"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="producer">
                  대표자 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="producer"
                  {...register('producer', { required: '대표자를 입력하세요.' })}
                  placeholder="대표자"
                />
                {errors.producer && (
                  <p className="text-sm text-destructive">{errors.producer.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">전화번호</Label>
                <Input
                  id="phone"
                  placeholder="010-1234-5678"
                  value={watch('phone') || ''}
                  onChange={(e) => {
                    const formatted = formatPhone(e.target.value);
                    setValue('phone', formatted, { shouldDirty: true, shouldValidate: true });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mainProduct">대표품목</Label>
                <Input id="mainProduct" {...register('mainProduct')} placeholder="대표품목" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificationType">인증분류</Label>
                <Input id="certificationType" {...register('certificationType')} placeholder="인증분류" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">주소</Label>
                <Input id="address" {...register('address')} placeholder="주소" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificationStartDate">인증 시작일</Label>
                <DatePicker
                  value={watch('certificationStartDate')}
                  onChange={(value) => setValue('certificationStartDate', value || today)}
                  placeholder="인증 시작일 선택"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificationEndDate">인증 종료일</Label>
                <DatePicker
                  value={watch('certificationEndDate')}
                  onChange={(value) => setValue('certificationEndDate', value || today)}
                  placeholder="인증 종료일 선택"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cultivationAreaM2">재배면적(㎡)</Label>
                <Input
                  id="cultivationAreaM2"
                  type="number"
                  step="0.01"
                  {...register('cultivationAreaM2', { valueAsNumber: true })}
                  placeholder="재배면적"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="annualProductionTarget">연간 생산 목표</Label>
                <Input
                  id="annualProductionTarget"
                  type="number"
                  step="0.01"
                  {...register('annualProductionTarget', { valueAsNumber: true })}
                  placeholder="연간 생산 목표"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="livestockCount">사육두수</Label>
                <Input
                  id="livestockCount"
                  type="number"
                  {...register('livestockCount', { valueAsNumber: true })}
                  placeholder="사육두수"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="deliveryDestination">납품처</Label>
                <Input
                  id="deliveryDestination"
                  {...register('deliveryDestination')}
                  placeholder="납품처를 입력하세요"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="detailProducts">세부품목</Label>
                <div className="space-y-2">
                  {detailProductCodes && detailProductCodes.length > 0 ? (
                    <div className="flex flex-wrap gap-4">
                      {detailProductCodes.map((code) => {
                        const isChecked = watch('detailProducts')?.includes(code.value || '') || false;
                        return (
                          <div key={code.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`detail-product-${code.id}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const currentProducts = watch('detailProducts') || [];
                                if (checked) {
                                  if (code.value && !currentProducts.includes(code.value)) {
                                    setValue('detailProducts', [...currentProducts, code.value]);
                                  }
                                } else {
                                  setValue(
                                    'detailProducts',
                                    currentProducts.filter((v) => v !== code.value)
                                  );
                                }
                              }}
                            />
                            <Label
                              htmlFor={`detail-product-${code.id}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {code.name}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">세부품목 코드를 불러올 수 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-end gap-2">
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                >
                  취소
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {mode === 'create' ? '추가' : '수정'}
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

