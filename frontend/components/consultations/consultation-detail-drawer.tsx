import * as React from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Consultation, useConsultation } from '@/lib/hooks/use-consultations';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit, X, Trash2, Copy, MoreVertical } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ConsultationDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultationId?: string | null;
  onEdit?: (consultation: Consultation) => void;
  onDelete?: (consultation: Consultation) => void;
}

const InfoRow = ({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1 ${className || ''}`}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) {
      return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    }
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  } else if (digits.length > 10) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  } else if (digits.length > 7) {
    return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  } else if (digits.length > 3) {
    return digits.replace(/(\d{3})(\d+)/, '$1-$2');
  }
  return digits;
};

export function ConsultationDetailDrawer({
  open,
  onOpenChange,
  consultationId,
  onEdit,
  onDelete,
}: ConsultationDetailDrawerProps) {
  const { data, isLoading, error } = useConsultation(consultationId ?? undefined);

  // 텍스트 선택을 위한 핸들러 (운송관리·고객관리 drawer와 동일)
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    e.stopPropagation();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const { data: consultationTypeCodes } = useCodeMastersByGroup('CONSULTATION_TYPE');
  const { data: consultationSourceCodes } = useCodeMastersByGroup('CONSULTATION_SOURCE');
  const { data: consultationInOutCodes } = useCodeMastersByGroup('CONSULTATION_INOUT');
  const { data: requestWeightCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: salesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: packingTypeCodes } = useCodeMastersByGroup('PACKING_TYPE');
  const { data: productCategories } = useCodeMastersByGroup('PRODUCT_CATEGORY');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT'); // 제품 코드
  
  // 고객 정보 코드
  const { data: speciesCodes } = useCodesByCategory('SPECIES');
  const { data: operationCodes } = useCodesByCategory('OPERATION_TYPE');
  const { data: operationSubCodes } = useCodesByCategory('OPERATION_SUBTYPE');
  const { data: feedingCodes } = useCodesByCategory('FEEDING_METHOD');
  const { data: chamchamCodes } = useCodesByCategory('CHAMCHAM_STATUS');
  const { data: replyStatusCodes } = useCodesByCategory('CONSULTATION_REPLY_STATUS');

  const toCodeMap = React.useCallback(
    (codes?: Array<{ value?: string | null; name?: string | null }>) => {
      const map = new Map<string, string>();
      (codes ?? []).forEach((c) => {
        const key = (c.value ?? c.name ?? '').trim();
        const label = (c.name ?? c.value ?? '').trim();
        if (key) map.set(key, label || key);
      });
      return map;
    },
    [],
  );

  const typeMap = React.useMemo(() => toCodeMap(consultationTypeCodes), [toCodeMap, consultationTypeCodes]);
  const sourceMap = React.useMemo(() => toCodeMap(consultationSourceCodes), [toCodeMap, consultationSourceCodes]);
  const inOutMap = React.useMemo(() => toCodeMap(consultationInOutCodes), [toCodeMap, consultationInOutCodes]);
  const requestWeightMap = React.useMemo(() => toCodeMap(requestWeightCodes), [toCodeMap, requestWeightCodes]);
  const salesGradeMap = React.useMemo(() => toCodeMap(salesGradeCodes), [toCodeMap, salesGradeCodes]);
  const packingTypeMap = React.useMemo(() => toCodeMap(packingTypeCodes), [toCodeMap, packingTypeCodes]);
  const productCategoryMap = React.useMemo(() => toCodeMap(productCategories), [toCodeMap, productCategories]);
  const productMap = React.useMemo(() => toCodeMap(productCodes), [toCodeMap, productCodes]);
  
  // 고객 정보 코드 맵
  const speciesMap = React.useMemo(() => toCodeMap(speciesCodes), [toCodeMap, speciesCodes]);
  const operationMap = React.useMemo(() => toCodeMap(operationCodes), [toCodeMap, operationCodes]);
  const operationSubMap = React.useMemo(() => toCodeMap(operationSubCodes), [toCodeMap, operationSubCodes]);
  const feedingMap = React.useMemo(() => toCodeMap(feedingCodes), [toCodeMap, feedingCodes]);
  const chamchamMap = React.useMemo(() => toCodeMap(chamchamCodes), [toCodeMap, chamchamCodes]);
  const replyStatusMap = React.useMemo(() => toCodeMap(replyStatusCodes), [toCodeMap, replyStatusCodes]);

  const labelOr = React.useCallback(
    (map: Map<string, string>, value?: string | null) => {
      const key = (value ?? '').trim();
      if (!key) return '';
      return map.get(key) ?? key;
    },
    [],
  );

  const getProductCategoryName = React.useCallback(
    (categoryId?: number | null) => {
      if (!categoryId) return '-';
      const category = productCategories?.find((c) => c.id === categoryId);
      return category ? labelOr(productCategoryMap, category.value ?? category.name) : '-';
    },
    [productCategories, productCategoryMap, labelOr],
  );

  const consultation = data;

  const handleCopyCustomerInfo = React.useCallback(() => {
    if (!consultation) {
      toast({
        title: '복사 실패',
        description: '상담 정보를 불러온 후 다시 시도해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const primaryAddressParts = [
      consultation.customerAddress?.trim(),
      consultation.addressDetail?.trim(),
    ].filter((part) => !!part && part.length > 0);

    const fallbackAddressParts =
      primaryAddressParts.length === 0
        ? [
            consultation.region?.trim(),
            consultation.customerCity?.trim(),
          ].filter((part) => !!part && part.length > 0)
        : [];

    const addressStringParts =
      primaryAddressParts.length > 0 ? primaryAddressParts : fallbackAddressParts;

    const addressText = addressStringParts.length > 0
      ? `${consultation.customerPostalCode ? `[${consultation.customerPostalCode}] ` : ''}${addressStringParts.join(' ')}`
      : consultation.customerPostalCode
        ? `[${consultation.customerPostalCode}]`
        : '-';

    const copyText = [
      `업체명 : ${consultation.companyName || '-'}`,
      `담당자 : ${consultation.ceo || '-'}`,
      `연락처 : ${formatPhone(consultation.phone)}`,
      `주소 : ${addressText}`,
    ].join('\n');

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = copyText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    };

    const copyPromise =
      typeof navigator !== 'undefined' && navigator.clipboard
        ? navigator.clipboard.writeText(copyText)
        : Promise.resolve(fallbackCopy());

    copyPromise
      .then(() => {
        toast({
          title: '정보를 복사했어요',
          description: '카카오톡 등 원하는 곳에 붙여넣기 할 수 있습니다.',
        });
      })
      .catch(() => {
        fallbackCopy();
        toast({
          title: '정보를 복사했어요',
          description: '카카오톡 등 원하는 곳에 붙여넣기 할 수 있습니다.',
        });
      });
  }, [consultation]);

  const handleCopyPhoneAndAddress = React.useCallback(() => {
    if (!consultation) {
      toast({
        title: '복사 실패',
        description: '상담 정보를 불러온 후 다시 시도해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const primaryAddressParts = [
      consultation.customerAddress?.trim(),
      consultation.addressDetail?.trim(),
    ].filter((part) => !!part && part.length > 0);

    const fallbackAddressParts =
      primaryAddressParts.length === 0
        ? [
            consultation.region?.trim(),
            consultation.customerCity?.trim(),
          ].filter((part) => !!part && part.length > 0)
        : [];

    const addressStringParts =
      primaryAddressParts.length > 0 ? primaryAddressParts : fallbackAddressParts;

    const addressText = addressStringParts.length > 0
      ? `${consultation.customerPostalCode ? `[${consultation.customerPostalCode}] ` : ''}${addressStringParts.join(' ')}`
      : consultation.customerPostalCode
        ? `[${consultation.customerPostalCode}]`
        : '-';

    const copyText = [
      `연락처 : ${formatPhone(consultation.phone)}`,
      `주소 : ${addressText}`,
    ].join('\n');

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = copyText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    };

    const copyPromise =
      typeof navigator !== 'undefined' && navigator.clipboard
        ? navigator.clipboard.writeText(copyText)
        : Promise.resolve(fallbackCopy());

    copyPromise
      .then(() => {
        toast({
          title: '전화번호와 주소를 복사했어요',
          description: '카카오톡 등 원하는 곳에 붙여넣기 할 수 있습니다.',
        });
      })
      .catch(() => {
        fallbackCopy();
        toast({
          title: '전화번호와 주소를 복사했어요',
          description: '카카오톡 등 원하는 곳에 붙여넣기 할 수 있습니다.',
        });
      });
  }, [consultation]);

  if (isLoading) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="h-full"
          style={{
            width: '800px',
            maxWidth: '90vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>상담 상세정보</DrawerTitle>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (error || !consultation) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="h-full"
          style={{
            width: '800px',
            maxWidth: '90vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>상담 상세정보</DrawerTitle>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">상담 정보를 불러올 수 없습니다.</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full flex flex-col"
        style={{
          width: '800px',
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>상담 상세정보</DrawerTitle>
              <DrawerDescription>상담의 모든 정보를 확인할 수 있습니다.</DrawerDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">닫기</span>
            </Button>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-6">
            {/* 고객 정보 */}
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold">고객 정보</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">복사 메뉴</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleCopyCustomerInfo}>
                      <Copy className="mr-2 h-4 w-4" />
                      정보 복사
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyPhoneAndAddress}>
                      <Copy className="mr-2 h-4 w-4" />
                      전화번호·주소 복사
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <InfoRow label="전화번호" value={formatPhone(consultation.phone)} />
                <InfoRow label="회사명" value={consultation.companyName || '-'} />
                <InfoRow label="대표자" value={consultation.ceo || '-'} />
                <InfoRow
                  label="참참회원 여부"
                  value={consultation.chamchamStatus ? labelOr(chamchamMap, consultation.chamchamStatus) : '-'}
                />
                <InfoRow
                  label="우편번호"
                  value={consultation.customerPostalCode || '-'}
                />
                <InfoRow label="지역" value={consultation.region || '-'} />
                <InfoRow
                  label="시/군/구"
                  value={consultation.customerCity || '-'}
                />
                <InfoRow
                  label="주소"
                  value={consultation.customerAddress || '-'}
                  className="col-span-2"
                />
                <InfoRow
                  label="상세주소"
                  value={consultation.addressDetail || '-'}
                  className="col-span-2"
                />
                <InfoRow 
                  label="축종" 
                  value={consultation.species ? labelOr(speciesMap, consultation.species) : '-'} 
                />
                <InfoRow 
                  label="사료 형태" 
                  value={consultation.feeding ? labelOr(feedingMap, consultation.feeding) : '-'} 
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="text-md font-semibold">운영형태</h4>
              {consultation.operations && consultation.operations.length > 0 ? (
                <div className="space-y-2">
                  {consultation.operations.map((op, index) => (
                    <div key={`${op.operation}-${op.operationSub}-${index}`} className="rounded-md border p-3">
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <InfoRow
                          label="운영방식"
                          value={op.operation ? labelOr(operationMap, op.operation) : '-'}
                        />
                        <InfoRow
                          label="세부 유형"
                          value={op.operationSub ? labelOr(operationSubMap, op.operationSub) : '-'}
                        />
                        <InfoRow
                          label="사육두수"
                          value={
                            typeof op.herdSize === 'number'
                              ? `${new Intl.NumberFormat('ko-KR').format(op.herdSize)}두`
                              : '-'
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">등록된 운영형태가 없습니다.</p>
              )}
            </div>
            <Separator />

            {/* 상담 기본 정보 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">상담 기본 정보</h3>
              <div className="grid grid-cols-4 gap-4">
                <InfoRow label="상담일" value={consultation.consultationDate || '-'} />
                <InfoRow
                  label="담당자"
                  value={consultation.managerName || consultation.managerId || '-'}
                />
                <InfoRow
                  label="상담 유형"
                  value={consultation.type ? labelOr(typeMap, consultation.type) : '-'}
                />
                <InfoRow
                  label="유입 경로"
                  value={consultation.source ? labelOr(sourceMap, consultation.source) : '-'}
                />
                <InfoRow
                  label="IN/OUT"
                  value={
                    consultation.inOut ? (
                      <Badge variant="outline">{labelOr(inOutMap, consultation.inOut)}</Badge>
                    ) : (
                      '-'
                    )
                  }
                />
                <InfoRow
                  label="요청 차량"
                  value={consultation.requestedWeight ? labelOr(requestWeightMap, consultation.requestedWeight) : '-'}
                />
                <InfoRow label="제안가" value={consultation.proposedPrice || '-'} />
                <InfoRow
                  label="적출 여부"
                  value={consultation.hasUnloading ? '예' : '아니오'}
                />
                <InfoRow
                  label="하역 여부"
                  value={consultation.hasHandling ? '예' : '아니오'}
                />
                <InfoRow
                  label="주 사용제품"
                  value={consultation.mainProduct ? labelOr(productMap, consultation.mainProduct) : '-'}
                />
                <InfoRow
                  label="도착가"
                  value={
                    consultation.arrivalPrice
                      ? (() => {
                          const numPrice = Number(consultation.arrivalPrice.replace(/,/g, ''));
                          return isNaN(numPrice)
                            ? consultation.arrivalPrice
                            : numPrice.toLocaleString('ko-KR');
                        })()
                      : '-'
                  }
                />
              </div>
            </div>

            <Separator />

            {/* 제품 정보 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">제품 정보</h3>
              {consultation.products && consultation.products.length > 0 ? (
                <div className="space-y-3">
                  {consultation.products.map((product, index) => (
                    <div key={product.id || index} className="border rounded-lg p-4 space-y-2">
                      <div className="grid grid-cols-4 gap-4">
                        <InfoRow
                          label="제품 분류"
                          value={getProductCategoryName(product.productCategoryId)}
                        />
                        <InfoRow 
                          label="문의 제품" 
                          value={product.productName ? labelOr(productMap, product.productName) : '-'} 
                        />
                        <InfoRow
                          label="등급(세일즈)"
                          value={product.grade ? labelOr(salesGradeMap, product.grade) : '-'}
                        />
                        <InfoRow
                          label="포장 유형"
                          value={product.packingType ? labelOr(packingTypeMap, product.packingType) : '-'}
                        />
                        <InfoRow
                          label="요청 중량"
                          value={product.requestedWeight || '-'}
                        />
                        <InfoRow
                          label="요청 차량"
                          value={product.requestedVehicle ? labelOr(requestWeightMap, product.requestedVehicle) : '-'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {consultation.productName ? (
                    <div className="space-y-2">
                      <InfoRow 
                        label="문의 제품" 
                        value={labelOr(productMap, consultation.productName)} 
                      />
                      {consultation.grade && (
                        <InfoRow
                          label="등급(세일즈)"
                          value={labelOr(salesGradeMap, consultation.grade)}
                        />
                      )}
                    </div>
                  ) : (
                    '제품 정보가 없습니다.'
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* 메모 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">상담 메모</h3>
              <div className="rounded-lg border p-4">
                <p className="text-sm whitespace-pre-wrap">{consultation.notes || '-'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <InfoRow
                  label="답변 진행상태"
                  value={
                    consultation.replyStatus
                      ? labelOr(replyStatusMap, consultation.replyStatus) || consultation.replyStatus
                      : '-'
                  }
                />
                <InfoRow
                  label="답변 담당자"
                  value={consultation.replyAssigneeName ?? consultation.replyAssigneeId ?? '-'}
                />
              </div>
            </div>

            <Separator />

            {/* 배송지 정보 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">배송지 정보</h3>
              <div className="grid grid-cols-4 gap-4">
                <InfoRow
                  label="우편번호"
                  value={consultation.deliveryPostalCode || '-'}
                />
                <InfoRow label="지역" value={consultation.deliveryRegion || '-'} />
                <InfoRow label="시/군/구" value={consultation.deliveryCity || '-'} />
                <div></div>
                <InfoRow
                  label="주소"
                  value={consultation.deliveryAddress || '-'}
                  className="col-span-2"
                />
                <InfoRow
                  label="상세주소"
                  value={consultation.deliveryAddressDetail || '-'}
                  className="col-span-2"
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        <DrawerFooter className="border-t border-border">
          <div className="flex justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              <X className="mr-1.5 h-4 w-4" />
              취소
            </Button>
            {onDelete && (
              <Button
                variant="destructive"
                disabled={!consultation}
                onClick={() => {
                  if (consultation && onDelete) {
                    onDelete(consultation);
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                삭제
              </Button>
            )}
            {onEdit && (
              <Button
                variant="default"
                disabled={!consultation}
                onClick={() => {
                  if (consultation && onEdit) {
                    onEdit(consultation);
                  }
                }}
              >
                <Edit className="mr-1.5 h-4 w-4" />
                수정
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

