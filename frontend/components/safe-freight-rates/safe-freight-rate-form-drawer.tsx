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
  SafeFreightRate,
  useCreateSafeFreightRate,
  useUpdateSafeFreightRate,
  useSafeFreightRegionNames,
  useSafeFreightCityNames,
  useTownNames,
} from '@/lib/hooks/use-safe-freight-rates';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SafeFreightRateFormData {
  regionName: string;
  cityName: string;
  townName: string;
  portCodeId: number;
  safeTransportRate: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

interface SafeFreightRateFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate?: SafeFreightRate | null;
  mode: 'create' | 'edit';
}

export function SafeFreightRateFormDrawer({
  open,
  onOpenChange,
  rate,
  mode,
}: SafeFreightRateFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { data: regionNames = [] } = useSafeFreightRegionNames();
  const { data: portCodes } = useCodesByCategory('DESTINATION_PORT');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SafeFreightRateFormData>({
    defaultValues: {
      regionName: '',
      cityName: '',
      townName: '',
      portCodeId: 0,
      safeTransportRate: 0,
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveTo: null,
    },
  });

  const regionName = watch('regionName');
  const cityName = watch('cityName');

  const { data: cityNames = [] } = useSafeFreightCityNames(regionName || undefined);
  const { data: townNames = [] } = useTownNames(regionName || undefined, cityName || undefined);

  const createRateMutation = useCreateSafeFreightRate();
  const updateRateMutation = useUpdateSafeFreightRate();

  React.useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === 'edit' && rate) {
      reset({
        regionName: rate.regionName ?? '',
        cityName: rate.cityName ?? '',
        townName: rate.townName ?? '',
        portCodeId: rate.portCodeId ?? 0,
        safeTransportRate: rate.safeTransportRate,
        effectiveFrom: rate.effectiveFrom.split('T')[0],
        effectiveTo: rate.effectiveTo ? rate.effectiveTo.split('T')[0] : null,
      });
    } else {
      reset({
        regionName: '',
        cityName: '',
        townName: '',
        portCodeId: 0,
        safeTransportRate: 0,
        effectiveFrom: new Date().toISOString().split('T')[0],
        effectiveTo: null,
      });
    }
  }, [open, mode, rate, reset]);

  // 지역 선택 시 시군구 리셋
  React.useEffect(() => {
    if (!regionName) {
      setValue('cityName', '');
      setValue('townName', '');
    }
  }, [regionName, setValue]);

  // 시군구 선택 시 동명 리셋
  React.useEffect(() => {
    if (!cityName) {
      setValue('townName', '');
    }
  }, [cityName, setValue]);

  const onSubmit = async (data: SafeFreightRateFormData) => {
    if (!data.regionName || !data.cityName || !data.townName) {
      toast({
        title: '입력 오류',
        description: '지역, 시군구, 동명을 모두 선택하세요.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Partial<SafeFreightRate> = {
        regionName: data.regionName,
        cityName: data.cityName,
        townName: data.townName,
        portCodeId: data.portCodeId || null,
        safeTransportRate: data.safeTransportRate,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo || null,
        containerSize: '40FT',
      };

      if (mode === 'create') {
        await createRateMutation.mutateAsync(payload);
        toast({
          title: '안전운임 요금표를 추가했습니다.',
        });
      } else if (rate) {
        await updateRateMutation.mutateAsync({ id: rate.id, data: payload });
        toast({
          title: '안전운임 요금표를 수정했습니다.',
        });
      }

      onOpenChange(false);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        apiError?.response?.data?.message ??
        apiError?.message ??
        `안전운임 요금표를 ${mode === 'create' ? '추가' : '수정'}하는 중 오류가 발생했습니다.`;
      const normalizedMessage = Array.isArray(message)
        ? message.join(', ')
        : String(message);
      toast({
        title: `안전운임 요금표 ${mode === 'create' ? '추가' : '수정'} 실패`,
        description: normalizedMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>
            {mode === 'create' ? '안전운임 요금표 추가' : '안전운임 요금표 수정'}
          </DrawerTitle>
          <DrawerDescription>
            안전운임 요금표 정보를 입력하세요. (40FT 안전운송운임만 저장)
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="regionName">
                  지역 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={regionName || '__none__'}
                  onValueChange={(value) => setValue('regionName', value === '__none__' ? '' : value)}
                >
                  <SelectTrigger id="regionName">
                    <SelectValue placeholder="지역 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {regionNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.regionName && (
                  <p className="text-sm text-destructive">{errors.regionName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cityName">
                  시군구 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={cityName || '__none__'}
                  onValueChange={(value) => setValue('cityName', value === '__none__' ? '' : value)}
                  disabled={!regionName}
                >
                  <SelectTrigger id="cityName">
                    <SelectValue placeholder="시군구 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {cityNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.cityName && (
                  <p className="text-sm text-destructive">{errors.cityName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="townName">
                  동명 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={watch('townName') || '__none__'}
                  onValueChange={(value) => setValue('townName', value === '__none__' ? '' : value)}
                  disabled={!cityName}
                >
                  <SelectTrigger id="townName">
                    <SelectValue placeholder="동명 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {townNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.townName && (
                  <p className="text-sm text-destructive">{errors.townName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="portCodeId">
                  항구 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={watch('portCodeId')?.toString() || ''}
                  onValueChange={(value) =>
                    setValue('portCodeId', value ? parseInt(value, 10) : 0)
                  }
                >
                  <SelectTrigger id="portCodeId">
                    <SelectValue placeholder="항구 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {portCodes?.map((code) => (
                      <SelectItem key={code.id} value={code.id.toString()}>
                        {code.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.portCodeId && (
                  <p className="text-sm text-destructive">{errors.portCodeId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="safeTransportRate">
                  안전운송운임 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="safeTransportRate"
                  type="number"
                  step="0.01"
                  {...register('safeTransportRate', {
                    valueAsNumber: true,
                    required: '안전운송운임을 입력하세요.',
                  })}
                />
                {errors.safeTransportRate && (
                  <p className="text-sm text-destructive">{errors.safeTransportRate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="effectiveFrom">
                  적용 시작일 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="effectiveFrom"
                  type="date"
                  {...register('effectiveFrom', {
                    required: '적용 시작일을 입력하세요.',
                  })}
                />
                {errors.effectiveFrom && (
                  <p className="text-sm text-destructive">{errors.effectiveFrom.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="effectiveTo">적용 종료일</Label>
                <Input
                  id="effectiveTo"
                  type="date"
                  {...register('effectiveTo')}
                />
              </div>
            </div>
          </div>

          <DrawerFooter>
            <div className="flex gap-2 justify-end">
              <DrawerClose asChild>
                <Button type="button" variant="outline">
                  취소
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'create' ? '추가' : '수정'}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
