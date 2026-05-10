'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
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
  Warehouse,
  useCreateWarehouse,
  useUpdateWarehouse,
  CreateWarehouseDto,
  UpdateWarehouseDto,
} from '@/lib/hooks/use-warehouses';
import { Loader2, X, MapPin, Save, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import type { DaumPostcodeData } from '@/types/daum-postcode';

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

interface WarehouseFormData {
  name: string;
  postalCode?: string;
  address?: string;
  addressDetail?: string;
  useInternalGyegeundae: boolean;
  gyegeundaePostalCode?: string;
  gyegeundaeAddress?: string;
  gyegeundaeAddressDetail?: string;
  phone?: string;
  notes?: string;
  status: boolean;
}

interface WarehouseFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse?: Warehouse | null;
  mode: 'create' | 'edit';
  onCancel?: () => void;
}

export function WarehouseFormDrawer({
  open,
  onOpenChange,
  warehouse,
  mode,
  onCancel,
}: WarehouseFormDrawerProps) {
  const createMutation = useCreateWarehouse();
  const updateMutation = useUpdateWarehouse();

  const [isClient, setIsClient] = React.useState(false);
  const [addressModalOpen, setAddressModalOpen] = React.useState(false);
  const [gyegeundaeAddressModalOpen, setGyegeundaeAddressModalOpen] = React.useState(false);
  const addressContentRef = React.useRef<HTMLDivElement | null>(null);
  const gyegeundaeAddressContentRef = React.useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseFormData>({
    defaultValues: React.useMemo(
      () => ({
        name: warehouse?.name || '',
        postalCode: warehouse?.postalCode || '',
        address: warehouse?.address || '',
        addressDetail: warehouse?.addressDetail || '',
        useInternalGyegeundae: warehouse?.useInternalGyegeundae ?? false,
        gyegeundaePostalCode: warehouse?.gyegeundaePostalCode || '',
        gyegeundaeAddress: warehouse?.gyegeundaeAddress || '',
        gyegeundaeAddressDetail: warehouse?.gyegeundaeAddressDetail || '',
        phone: warehouse?.phone ? formatPhone(warehouse.phone) : '',
        notes: warehouse?.notes || '',
        status: warehouse?.status ?? true,
      }),
      [warehouse],
    ),
  });

  // 클라이언트 사이드 확인
  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // 카카오 주소검색 스크립트 로드
  React.useEffect(() => {
    if (!open) return;

    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // 컴포넌트 언마운트 시 스크립트 제거
      const existingScript = document.querySelector('script[src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      reset({
        name: warehouse?.name || '',
        postalCode: warehouse?.postalCode || '',
        address: warehouse?.address || '',
        addressDetail: warehouse?.addressDetail || '',
        useInternalGyegeundae: warehouse?.useInternalGyegeundae ?? false,
        gyegeundaePostalCode: warehouse?.gyegeundaePostalCode || '',
        gyegeundaeAddress: warehouse?.gyegeundaeAddress || '',
        gyegeundaeAddressDetail: warehouse?.gyegeundaeAddressDetail || '',
        phone: warehouse?.phone ? formatPhone(warehouse.phone) : '',
        notes: warehouse?.notes || '',
        status: warehouse?.status ?? true,
      });
    }
  }, [open, warehouse, reset]);

  const useInternalGyegeundae = watch('useInternalGyegeundae');

  const onSubmit = async (data: WarehouseFormData) => {
    try {
      if (mode === 'create') {
        const createDto: CreateWarehouseDto = {
          name: data.name.trim(),
          postalCode: data.postalCode?.trim() || undefined,
          address: data.address?.trim() || undefined,
          addressDetail: data.addressDetail?.trim() || undefined,
          useInternalGyegeundae: data.useInternalGyegeundae,
          gyegeundaePostalCode: data.useInternalGyegeundae ? undefined : data.gyegeundaePostalCode?.trim() || undefined,
          gyegeundaeAddress: data.useInternalGyegeundae ? undefined : data.gyegeundaeAddress?.trim() || undefined,
          gyegeundaeAddressDetail: data.useInternalGyegeundae ? undefined : data.gyegeundaeAddressDetail?.trim() || undefined,
          phone: data.phone?.trim() || undefined,
          notes: data.notes?.trim() || undefined,
          status: data.status,
        };
        await createMutation.mutateAsync(createDto);
        toast({
          title: '창고 추가 완료',
          description: `${data.name} 창고를 추가했습니다.`,
        });
      } else {
        const updateDto: UpdateWarehouseDto = {
          name: data.name.trim(),
          postalCode: data.postalCode?.trim() || undefined,
          address: data.address?.trim() || undefined,
          addressDetail: data.addressDetail?.trim() || undefined,
          useInternalGyegeundae: data.useInternalGyegeundae,
          gyegeundaePostalCode: data.useInternalGyegeundae ? undefined : data.gyegeundaePostalCode?.trim() || undefined,
          gyegeundaeAddress: data.useInternalGyegeundae ? undefined : data.gyegeundaeAddress?.trim() || undefined,
          gyegeundaeAddressDetail: data.useInternalGyegeundae ? undefined : data.gyegeundaeAddressDetail?.trim() || undefined,
          phone: data.phone?.trim() || undefined,
          notes: data.notes?.trim() || undefined,
          status: data.status,
        };
        await updateMutation.mutateAsync({ id: warehouse!.id, data: updateDto });
        toast({
          title: '창고 수정 완료',
          description: `${data.name} 창고 정보를 수정했습니다.`,
        });
      }
      onOpenChange(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || '창고 저장 중 오류가 발생했습니다.';
      toast({
        title: '저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
  };

  const closeAddressSearch = React.useCallback(() => {
    setAddressModalOpen(false);
  }, []);

  const closeGyegeundaeAddressSearch = React.useCallback(() => {
    setGyegeundaeAddressModalOpen(false);
  }, []);

  // 실제 창고 주소 검색 팝업 열기
  const handleAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    const contentElement = addressContentRef.current;
    if (!contentElement) {
      toast({
        title: '오류',
        description: '주소 검색 UI를 불러올 수 없습니다.',
        className: 'border border-red-300 text-red-600',
      });
      return;
    }

    contentElement.innerHTML = '';

    const Postcode = window.daum.Postcode;

    new Postcode({
      oncomplete: (data: DaumPostcodeData) => {
        let fullAddress = data.address;
        let extraAddress = '';

        if (data.userSelectedType === 'R') {
          fullAddress = data.roadAddress;
        } else {
          fullAddress = data.jibunAddress;
        }

        if (data.userSelectedType === 'R') {
          if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) {
            extraAddress += data.bname;
          }
          if (data.buildingName !== '' && data.apartment === 'Y') {
            extraAddress += extraAddress !== '' ? ', ' + data.buildingName : data.buildingName;
          }
          if (extraAddress !== '') {
            extraAddress = ' (' + extraAddress + ')';
          }
        }

        setValue('postalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
        setValue('address', fullAddress + extraAddress, { shouldDirty: true, shouldValidate: true });
        closeAddressSearch();
      },
      width: '100%',
      height: '100%',
    }).embed(contentElement);

    setAddressModalOpen(true);
  }, [setValue, toast, closeAddressSearch]);

  // 계근대 주소 검색 팝업 열기
  const handleGyegeundaeAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    const contentElement = gyegeundaeAddressContentRef.current;
    if (!contentElement) {
      toast({
        title: '오류',
        description: '주소 검색 UI를 불러올 수 없습니다.',
        className: 'border border-red-300 text-red-600',
      });
      return;
    }

    contentElement.innerHTML = '';

    const Postcode = window.daum.Postcode;

    new Postcode({
      oncomplete: (data: DaumPostcodeData) => {
        let fullAddress = data.address;
        let extraAddress = '';

        if (data.userSelectedType === 'R') {
          fullAddress = data.roadAddress;
        } else {
          fullAddress = data.jibunAddress;
        }

        if (data.userSelectedType === 'R') {
          if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) {
            extraAddress += data.bname;
          }
          if (data.buildingName !== '' && data.apartment === 'Y') {
            extraAddress += extraAddress !== '' ? ', ' + data.buildingName : data.buildingName;
          }
          if (extraAddress !== '') {
            extraAddress = ' (' + extraAddress + ')';
          }
        }

        setValue('gyegeundaePostalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
        setValue('gyegeundaeAddress', fullAddress + extraAddress, { shouldDirty: true, shouldValidate: true });
        closeGyegeundaeAddressSearch();
      },
      width: '100%',
      height: '100%',
    }).embed(contentElement);

    setGyegeundaeAddressModalOpen(true);
  }, [setValue, toast, closeGyegeundaeAddressSearch]);

  const handleDrawerOpenChange = React.useCallback((isOpen: boolean) => {
    // 주소 검색 모달이 열려있으면 drawer를 닫지 않음
    if (!isOpen && (addressModalOpen || gyegeundaeAddressModalOpen)) {
      return;
    }
    onOpenChange(isOpen);
  }, [addressModalOpen, gyegeundaeAddressModalOpen, onOpenChange]);

  return (
    <>
      <Drawer open={open} onOpenChange={handleDrawerOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>{mode === 'create' ? '창고 업체 추가' : '창고 업체 수정'}</DrawerTitle>
                <DrawerDescription>
                  {mode === 'create' ? '새로운 창고 업체를 추가합니다.' : '창고 업체 정보를 수정합니다.'}
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
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">업체명 *</Label>
                      <Input
                        id="name"
                        {...register('name', { required: '업체명을 입력해주세요.' })}
                      />
                      {errors.name && (
                        <p className="text-sm text-red-500">{errors.name.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">연락처</Label>
                      <Input
                        id="phone"
                        placeholder="010-1234-5678"
                        {...register('phone', {
                          onChange: (e) => {
                            const formatted = formatPhone(e.target.value);
                            setValue('phone', formatted, { shouldDirty: true, shouldValidate: true });
                          },
                        })}
                      />
                    </div>
                  </div>
                </div>

                {/* 실제 주소 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">실제 주소</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">우편번호</Label>
                      <div className="flex gap-2">
                        <Input
                          id="postalCode"
                          placeholder="우편번호"
                          {...register('postalCode')}
                          readOnly
                          className="cursor-pointer bg-muted"
                          onClick={handleAddressSearch}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddressSearch}
                          className="flex-shrink-0"
                          size="icon"
                          title="주소검색"
                        >
                          <MapPin className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">주소</Label>
                    <Input
                      id="address"
                      placeholder="주소"
                      {...register('address')}
                      readOnly
                      className="cursor-pointer bg-muted"
                      onClick={handleAddressSearch}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressDetail">상세주소</Label>
                    <Input
                      id="addressDetail"
                      placeholder="상세주소"
                      {...register('addressDetail')}
                    />
                  </div>
                </div>

                {/* 계근대 주소 */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="useInternalGyegeundae"
                      checked={useInternalGyegeundae}
                      onCheckedChange={(checked) => {
                        setValue('useInternalGyegeundae', checked === true, { shouldDirty: true });
                      }}
                    />
                    <Label htmlFor="useInternalGyegeundae" className="cursor-pointer">
                      내부 계근대 사용
                    </Label>
                  </div>

                  {!useInternalGyegeundae && (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="gyegeundaePostalCode">계근대 우편번호</Label>
                          <div className="flex gap-2">
                            <Input
                              id="gyegeundaePostalCode"
                              placeholder="우편번호"
                              {...register('gyegeundaePostalCode')}
                              readOnly
                              className="cursor-pointer bg-muted"
                              onClick={handleGyegeundaeAddressSearch}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleGyegeundaeAddressSearch}
                              className="flex-shrink-0"
                              size="icon"
                              title="주소검색"
                            >
                              <MapPin className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gyegeundaeAddress">계근대 주소</Label>
                        <Input
                          id="gyegeundaeAddress"
                          placeholder="주소"
                          {...register('gyegeundaeAddress')}
                          readOnly
                          className="cursor-pointer bg-muted"
                          onClick={handleGyegeundaeAddressSearch}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gyegeundaeAddressDetail">계근대 상세주소</Label>
                        <Input
                          id="gyegeundaeAddressDetail"
                          placeholder="상세주소"
                          {...register('gyegeundaeAddressDetail')}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* 기타 */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="notes">비고</Label>
                    <Textarea
                      id="notes"
                      placeholder="비고"
                      {...register('notes')}
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

      {/* 실제 창고 주소 검색 모달 */}
      {isClient &&
        createPortal(
          <div
            style={{
              pointerEvents: addressModalOpen ? 'auto' : 'none',
              opacity: addressModalOpen ? 1 : 0,
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 11000,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              transition: 'opacity 0.15s ease-in-out',
            }}
            onClick={closeAddressSearch}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '500px',
                height: '600px',
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">주소 검색</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeAddressSearch}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div ref={addressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
            </div>
          </div>,
          document.body,
        )}

      {/* 계근대 주소 검색 모달 */}
      {isClient &&
        createPortal(
          <div
            style={{
              pointerEvents: gyegeundaeAddressModalOpen ? 'auto' : 'none',
              opacity: gyegeundaeAddressModalOpen ? 1 : 0,
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 11000,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              transition: 'opacity 0.15s ease-in-out',
            }}
            onClick={closeGyegeundaeAddressSearch}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '500px',
                height: '600px',
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">계근대 주소 검색</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeGyegeundaeAddressSearch}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div ref={gyegeundaeAddressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

