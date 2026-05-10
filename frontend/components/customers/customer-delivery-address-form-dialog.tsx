'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CustomerDeliveryAddress,
  useAddCustomerDeliveryAddress,
  useUpdateCustomerDeliveryAddress,
} from '@/lib/hooks/use-customers';
import { toast } from '@/components/ui/use-toast';
import { Loader2, MapPin, Save, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatKoreanPhoneInput } from '@/lib/format-korean-phone-input';
import type { DaumPostcodeData } from '@/types/daum-postcode';

function DialogFormField({
  label,
  className,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="text-xs font-normal text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

const emptyForm = () => ({
  label: '',
  recipientName: '',
  recipientPhone: '',
  postalCode: '',
  addressRoad: '',
  addressJibun: '',
  addressDetail: '',
  legalBCode: '',
  addressDefaultType: 'ROAD' as 'ROAD' | 'JIBUN',
});

export interface CustomerDeliveryAddressFormDialogProps {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAddresses: CustomerDeliveryAddress[];
  /** 없으면 추가 모드 */
  editingAddress?: CustomerDeliveryAddress | null;
  /** 추가 저장 직후 (판매 등록 등) */
  onAdded?: (address: CustomerDeliveryAddress) => void;
  /** 헤더 아래 보조 설명 */
  description?: React.ReactNode;
}

export function CustomerDeliveryAddressFormDialog({
  customerId,
  open,
  onOpenChange,
  existingAddresses,
  editingAddress = null,
  onAdded,
  description,
}: CustomerDeliveryAddressFormDialogProps) {
  const formId = React.useId();
  const [form, setForm] = React.useState(emptyForm);
  const [isClient, setIsClient] = React.useState(false);
  const [addressModalOpen, setAddressModalOpen] = React.useState(false);
  const addressContentRef = React.useRef<HTMLDivElement | null>(null);

  const addMutation = useAddCustomerDeliveryAddress(customerId);
  const updateMutation = useUpdateCustomerDeliveryAddress(customerId);

  const errToast = (title: string, error: unknown) => {
    const msg = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    toast({
      title,
      description: Array.isArray(msg) ? msg.join(', ') : (msg as string) ?? '다시 시도해주세요.',
      variant: 'destructive',
    });
  };

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript || window.daum?.Postcode) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    document.head.appendChild(script);
  }, [open]);

  const closeAddressSearch = React.useCallback(() => {
    setAddressModalOpen(false);
    if (addressContentRef.current) {
      addressContentRef.current.innerHTML = '';
    }
  }, []);

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
        let roadLine = (data.roadAddress || '').trim();
        let extraAddress = '';
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
        if (roadLine) {
          roadLine = roadLine + extraAddress;
        }
        const jibunLine = (data.jibunAddress || '').trim();
        const bcode = (data.bcode ?? '').replace(/\D/g, '').slice(0, 10);
        setForm((p) => ({
          ...p,
          postalCode: data.zonecode || '',
          addressRoad: roadLine,
          addressJibun: jibunLine,
          legalBCode: bcode,
          addressDefaultType: data.userSelectedType === 'R' ? 'ROAD' : 'JIBUN',
        }));
        closeAddressSearch();
      },
      width: '100%',
      height: '100%',
      submitMode: false,
    }).embed(contentElement);
    setAddressModalOpen(true);
  }, [closeAddressSearch]);

  const resetForm = React.useCallback(() => {
    setForm(emptyForm());
  }, []);

  const applyDialogOpenChange = (next: boolean) => {
    if (!next && addressModalOpen) return;
    onOpenChange(next);
    if (!next) {
      resetForm();
      closeAddressSearch();
    }
  };

  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      if (editingAddress) {
        setForm({
          label: editingAddress.label ?? '',
          recipientName: editingAddress.recipientName ?? '',
          recipientPhone: formatKoreanPhoneInput(editingAddress.recipientPhone ?? ''),
          postalCode: editingAddress.postalCode ?? '',
          addressRoad: editingAddress.addressRoad ?? '',
          addressJibun: editingAddress.addressJibun ?? '',
          addressDetail: editingAddress.addressDetail ?? '',
          legalBCode: editingAddress.legalBCode?.trim().replace(/\D/g, '').slice(0, 10) ?? '',
          addressDefaultType: editingAddress.addressDefaultType === 'JIBUN' ? 'JIBUN' : 'ROAD',
        });
      } else {
        setForm(emptyForm());
      }
    }
    wasOpenRef.current = open;
  }, [open, editingAddress, existingAddresses]);

  const handleSave = async () => {
    if (!form.postalCode.trim() || (!form.addressRoad.trim() && !form.addressJibun.trim())) {
      toast({
        title: '주소를 검색해주세요',
        description: '우편번호 찾기로 주소를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }
    const payload = {
      label: form.label.trim() || undefined,
      recipientName: form.recipientName.trim() || undefined,
      recipientPhone: form.recipientPhone.trim() || undefined,
      postalCode: form.postalCode.trim() || undefined,
      addressRoad: form.addressRoad.trim() || undefined,
      addressJibun: form.addressJibun.trim() || undefined,
      addressDetail: form.addressDetail.trim() || undefined,
      legalBCode: form.legalBCode.trim() || undefined,
      addressDefaultType: form.addressDefaultType,
    };
    try {
      if (editingAddress) {
        await updateMutation.mutateAsync({ addressId: editingAddress.id, data: payload });
        toast({ title: '수정되었습니다.' });
      } else {
        const created = await addMutation.mutateAsync({
          ...payload,
          isDefault: false,
        });
        toast({ title: '배송지가 추가되었습니다.' });
        onAdded?.(created);
      }
      applyDialogOpenChange(false);
    } catch (e) {
      errToast(editingAddress ? '수정 실패' : '추가 실패', e);
    }
  };

  const saving = addMutation.isPending || updateMutation.isPending;
  const roadTrim = form.addressRoad.trim();
  const jibunTrim = form.addressJibun.trim();

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && addressModalOpen) return;
          applyDialogOpenChange(o);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAddress ? '배송 주소 수정' : '배송 주소 추가'}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DialogFormField label="배송지명" className="min-w-0">
                <Input
                  value={form.label}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="집, 회사 등"
                  className="h-9 w-full min-w-0 text-sm"
                />
              </DialogFormField>
              <DialogFormField label="수령인" className="min-w-0">
                <Input
                  value={form.recipientName}
                  onChange={(e) => setForm((p) => ({ ...p, recipientName: e.target.value }))}
                  className="h-9 w-full min-w-0 text-sm"
                />
              </DialogFormField>
              <DialogFormField label="연락처" className="min-w-0">
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={form.recipientPhone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, recipientPhone: formatKoreanPhoneInput(e.target.value) }))
                  }
                  placeholder="010-1234-5678"
                  className="h-9 w-full min-w-0 text-sm"
                />
              </DialogFormField>
            </div>

            <section className="space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">주소 정보</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  우편번호·도로명·지번·상세주소는 주소검색으로 채웁니다. 도로명·지번 중{' '}
                  <span className="text-foreground/90">기본</span>으로 쓸 주소를 선택할 수 있습니다.
                </p>
              </div>
              <div className="space-y-3">
                <DialogFormField label="우편번호" className="min-w-0 w-full">
                  <div className="flex w-full min-w-0 items-center">
                    <div className="flex w-1/3 min-w-0 shrink-0 items-center gap-2">
                      <Input
                        id={`${formId}-postalCode`}
                        className="h-9 min-w-0 flex-1 cursor-pointer bg-muted text-sm tabular-nums"
                        placeholder="우편번호"
                        readOnly
                        value={form.postalCode}
                        onClick={handleAddressSearch}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        title="주소검색"
                        onClick={handleAddressSearch}
                      >
                        <MapPin className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </DialogFormField>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <DialogFormField label="도로명 주소" className="min-w-0">
                    <div
                      className={cn(
                        'flex min-h-9 w-full min-w-0 overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow]',
                        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                      )}
                    >
                      <Input
                        id={`${formId}-addressRoad`}
                        className={cn(
                          'h-9 min-w-0 flex-1 cursor-pointer rounded-none border-0 bg-muted text-sm shadow-none',
                          'focus-visible:ring-0',
                        )}
                        placeholder="주소검색 시 입력됩니다"
                        readOnly
                        value={form.addressRoad}
                        onClick={handleAddressSearch}
                      />
                      <label
                        className={cn(
                          'flex h-9 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-l border-border bg-muted/60 px-2.5 text-xs text-foreground sm:px-3 sm:text-sm',
                          !roadTrim && 'pointer-events-none cursor-not-allowed opacity-50',
                        )}
                      >
                        <input
                          type="radio"
                          name={`${formId}-delivery-default-kind`}
                          className="h-3.5 w-3.5 shrink-0 accent-primary sm:h-4 sm:w-4"
                          checked={form.addressDefaultType === 'ROAD'}
                          disabled={!roadTrim}
                          onChange={() => setForm((p) => ({ ...p, addressDefaultType: 'ROAD' }))}
                        />
                        기본
                      </label>
                    </div>
                  </DialogFormField>
                  <DialogFormField label="지번 주소" className="min-w-0">
                    <div
                      className={cn(
                        'flex min-h-9 w-full min-w-0 overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow]',
                        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                      )}
                    >
                      <Input
                        id={`${formId}-addressJibun`}
                        className={cn(
                          'h-9 min-w-0 flex-1 cursor-pointer rounded-none border-0 bg-muted text-sm shadow-none',
                          'focus-visible:ring-0',
                        )}
                        placeholder="주소검색 시 입력됩니다"
                        readOnly
                        value={form.addressJibun}
                        onClick={handleAddressSearch}
                      />
                      <label
                        className={cn(
                          'flex h-9 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-l border-border bg-muted/60 px-2.5 text-xs text-foreground sm:px-3 sm:text-sm',
                          !jibunTrim && 'pointer-events-none cursor-not-allowed opacity-50',
                        )}
                      >
                        <input
                          type="radio"
                          name={`${formId}-delivery-default-kind`}
                          className="h-3.5 w-3.5 shrink-0 accent-primary sm:h-4 sm:w-4"
                          checked={form.addressDefaultType === 'JIBUN'}
                          disabled={!jibunTrim}
                          onChange={() => setForm((p) => ({ ...p, addressDefaultType: 'JIBUN' }))}
                        />
                        기본
                      </label>
                    </div>
                  </DialogFormField>
                  <div className="md:col-span-2">
                    <DialogFormField label="상세주소">
                      <Input
                        id={`${formId}-addressDetail`}
                        className="h-9 text-sm"
                        placeholder="상세주소"
                        value={form.addressDetail}
                        onChange={(e) => setForm((p) => ({ ...p, addressDetail: e.target.value }))}
                      />
                    </DialogFormField>
                  </div>
                </div>
              </div>
            </section>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => applyDialogOpenChange(false)}>
              <X className="mr-1.5 h-4 w-4" />
              취소
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-4 w-4" />
                  {editingAddress ? '수정' : '추가'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                width: 'min(500px, 100vw - 32px)',
                height: 'min(600px, 100vh - 48px)',
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">주소 검색</h3>
                <Button type="button" variant="ghost" size="icon" onClick={closeAddressSearch} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div ref={addressContentRef} className="w-full" style={{ height: 'calc(100% - 60px)' }} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
