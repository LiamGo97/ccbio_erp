import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useCustomer, Customer } from '@/lib/hooks/use-customers';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { Loader2, Edit, X, Trash2, Copy, MoreVertical, Star, PanelRightOpen, Eye } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomerStatementNamesSection } from './customer-statement-names-section';
import { CustomerDeliveryAddressesSection } from './customer-delivery-addresses-section';
import { resolveDefaultAddressKind } from '../../lib/customer-default-address-kind';
import { formatSalesManagerDisplay } from '@/lib/format-sales-manager';
import { isBusinessMemberType, isNonBusinessMemberType } from '@/lib/is-business-member-type';
import { CustomerActivityPanel } from './customer-activity-panel';
import { CustomerContactsSection } from './customer-contacts-section';
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

const LIVESTOCK_TYPE_LABELS: Record<string, string> = {
  HANWOO: '한우',
  NAKWOO: '낙우',
  YUKWOO: '육우',
  ETC: '기타',
};

const OPERATION_METHOD_LABELS: Record<string, string> = {
  BREEDING: '번식',
  FATTENING: '비육',
  RAISING: '육성',
  BATCH: '일괄',
  MILKING: '착유',
};

const FEEDING_METHOD_LABELS: Record<string, string> = {
  SELF_MIX: '자가배합(배합기)',
  DIRECT: '직접급여',
  TMF: 'TMF',
};

function formatAddressLinesForCopy(data: Customer): string {
  const zip = data.postalCode?.trim();
  const road = data.addressRoad?.trim();
  const jibun = data.addressJibun?.trim();
  const detail = data.addressDetail?.trim();
  const lines: string[] = [];
  if (zip) lines.push(`우편번호: ${zip}`);
  if (road) lines.push(`도로명: ${road}`);
  if (jibun) lines.push(`지번: ${jibun}`);
  if (detail) lines.push(`상세: ${detail}`);
  if (lines.length === 0) return zip ? `[${zip}]` : '-';
  return lines.join('\n');
}

interface CustomerDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string | null;
  onEdit?: (customer: Customer) => void;
  onDelete?: (customer: Customer) => void;
}

const InfoRow = ({ label, value }: { label: React.ReactNode; value?: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <div className="text-xs text-muted-foreground">{label}</div>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

export function CustomerDetailDrawer({
  open,
  onOpenChange,
  customerId,
  onEdit,
  onDelete,
}: CustomerDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, error } = useCustomer(customerId ?? undefined);
  const [activityPanelOpen, setActivityPanelOpen] = React.useState(false);

  const [expandedAddressSection, setExpandedAddressSection] = React.useState<
    'statement' | 'delivery' | 'contact' | null
  >(null);

  React.useEffect(() => {
    if (!open) setExpandedAddressSection(null);
  }, [open]);

  React.useEffect(() => {
    setExpandedAddressSection(null);
  }, [customerId]);

  React.useEffect(() => {
    if (!open) setActivityPanelOpen(false);
  }, [open]);

  // 텍스트 선택을 위한 핸들러 (입고 대기 상세 drawer와 동일)
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

  const { data: customerTypeCodes } = useCodesByCategory('CUSTOMER_TYPE');
  const { data: memberTypeCodes } = useCodesByCategory('MEMBER_TYPE');
  const { data: customerGradeCodes } = useCodesByCategory('CUSTOMER_GRADE');
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

  const customerTypeMap = React.useMemo(() => toCodeMap(customerTypeCodes), [toCodeMap, customerTypeCodes]);
  const memberTypeMap = React.useMemo(() => toCodeMap(memberTypeCodes), [toCodeMap, memberTypeCodes]);
  const customerGradeMap = React.useMemo(() => toCodeMap(customerGradeCodes), [toCodeMap, customerGradeCodes]);

  const showBusinessRegistration = React.useMemo(
    () => (data ? isBusinessMemberType(data.memberType) : false),
    [data],
  );
  const showNonBusinessIdentity = React.useMemo(
    () => (data ? isNonBusinessMemberType(data.memberType) : false),
    [data],
  );

  const openGoogleDriveFile = React.useCallback((fileId?: string | null) => {
    const id = (fileId ?? '').trim();
    if (!id) return;
    window.open(`https://drive.google.com/file/d/${id}/view`, '_blank', 'noopener,noreferrer');
  }, []);

  const labelOr = React.useCallback(
    (map: Map<string, string>, value?: string | null) => {
      const key = (value ?? '').trim();
      if (!key) return '';
      return map.get(key) ?? key;
    },
    [],
  );

  const handleCopyCustomerInfo = React.useCallback(() => {
    if (!data) {
      toast({
        title: '복사 실패',
        description: '고객 정보를 불러온 후 다시 시도해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const addressBlock = formatAddressLinesForCopy(data);

    const lines = [
      `업체명 : ${data.companyName || '-'}`,
      `담당자 : ${data.ceo || '-'}`,
      `연락처 : ${formatPhone(data.phone)}`,
      `회원구분 : ${labelOr(memberTypeMap, data.memberType) || '-'}`,
    ];
    {
      const sm = formatSalesManagerDisplay(data.salesManagerName, data.salesManagerEmail);
      if (sm !== '—') {
        lines.push(`영업 담당 : ${sm}`);
      }
    }
    if (isBusinessMemberType(data.memberType)) {
      lines.push(`사업자등록번호 : ${data.businessRegistrationNumber?.trim() || '-'}`);
      if (data.businessCertGoogleDriveFileId?.trim()) {
        lines.push(`사업자등록증 : ${data.businessCertFileName?.trim() || 'Google Drive 파일'}`);
      }
    }
    lines.push(`주소 :\n${addressBlock}`);
    const remarksTrim = data.remarks?.trim();
    if (remarksTrim) {
      lines.push(`비고 :\n${remarksTrim}`);
    }
    const copyText = lines.join('\n');

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
  }, [data, labelOr, memberTypeMap]);

  const handleCopyPhoneAndAddress = React.useCallback(() => {
    if (!data) {
      toast({
        title: '복사 실패',
        description: '고객 정보를 불러온 후 다시 시도해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const addressBlock = formatAddressLinesForCopy(data);

    const copyText = [
      `연락처 : ${formatPhone(data.phone)}`,
      `주소 :\n${addressBlock}`,
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
  }, [data]);

  const customerIdForActivity = data?.id?.trim() ?? '';
  const customerPhoneForActivity = data?.phone?.trim() ?? '';

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{
          width: isMobile ? '100%' : activityPanelOpen ? '1680px' : '800px',
          maxWidth: '98vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>고객 상세정보</DrawerTitle>
              <DrawerDescription>
                고객의 기본 정보, 주소, 비고 등을 확인할 수 있습니다.
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setActivityPanelOpen((prev) => !prev)}
              >
                <PanelRightOpen className="mr-1.5 h-4 w-4" />
                {activityPanelOpen ? '활동 이력 닫기' : '활동 이력'}
              </Button>
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>

        <div
          className="flex-1 min-h-0 flex"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          onDoubleClick={handleDoubleClick}
        >
          {activityPanelOpen && !isMobile ? (
            <CustomerActivityPanel
              customerId={customerIdForActivity}
              customerPhone={customerPhoneForActivity}
              enabled={open && activityPanelOpen}
            />
          ) : null}

          {activityPanelOpen && isMobile ? (
            <div className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background">
              <CustomerActivityPanel
                customerId={customerIdForActivity}
                customerPhone={customerPhoneForActivity}
                enabled={open && activityPanelOpen}
                onClose={() => setActivityPanelOpen(false)}
              />
            </div>
          ) : null}

          <div
            className={`min-h-0 flex-1 w-full ${isMobile && activityPanelOpen ? 'hidden' : ''}`}
          >
            <ScrollArea className="h-full">
            {isLoading && (
              <div className="flex h-40 items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                데이터를 불러오는 중입니다...
              </div>
            )}

            {error && (
              <div className="p-4 text-sm text-destructive">
                고객 정보를 불러오는 중 오류가 발생했습니다.
              </div>
            )}

            {!isLoading && !error && data && (
              <div className="space-y-6 p-6 pt-4">
                <section className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">기본 정보</h3>
                      <p className="text-xs text-muted-foreground">
                        업체 및 연락처 관련 기본 정보를 확인합니다.
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={!data}>
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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                    <InfoRow
                      label="고객 구분"
                      value={labelOr(customerTypeMap, data.customerType) || '-'}
                    />
                    <InfoRow label="업체명(상호)" value={data.companyName} />
                    <InfoRow label="대표자" value={data.ceo} />
                    <InfoRow label="연락처" value={formatPhone(data.phone)} />
                    <InfoRow label="구 참참회원 여부" value={data.chamchamStatus || '-'} />
                    <InfoRow label="신규 참참회원 여부" value={data.chamcharmMemberStatus || '-'} />
                    <InfoRow label="회원 구분" value={labelOr(memberTypeMap, data.memberType) || '-'} />
                    <InfoRow label="회원등급" value={labelOr(customerGradeMap, data.customerGrade) || '-'} />
                    <InfoRow
                      label="영업 담당자"
                      value={formatSalesManagerDisplay(data.salesManagerName, data.salesManagerEmail)}
                    />
                  </div>
                </section>

                <Separator />

                {showNonBusinessIdentity ? (
                  <>
                    <section className="space-y-2.5">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">비사업자 본인 확인</h3>
                        <p className="text-xs text-muted-foreground">비사업자인 경우 주민등록번호를 등록합니다.</p>
                      </div>
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                        <div className="md:col-span-2">
                          <InfoRow
                            label="주민등록번호"
                            value={
                              data.residentRegistrationNumber?.trim() ? (
                                <span className="font-mono tracking-tight">{data.residentRegistrationNumber.trim()}</span>
                              ) : (
                                '-'
                              )
                            }
                          />
                        </div>
                      </div>
                    </section>
                    <Separator />
                  </>
                ) : null}

                {showBusinessRegistration ? (
                  <>
                    <section className="space-y-2.5">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">사업자 정보</h3>
                        <p className="text-xs text-muted-foreground">
                          사업자등록번호와 사업자등록증 파일을 확인합니다.
                        </p>
                      </div>
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                        <InfoRow
                          label="사업자등록번호"
                          value={
                            data.businessRegistrationNumber?.trim() ? (
                              <span className="font-mono tracking-tight">{data.businessRegistrationNumber.trim()}</span>
                            ) : (
                              '-'
                            )
                          }
                        />
                        <div className="sm:col-span-2 md:col-span-3">
                          <InfoRow
                            label="사업자등록증 파일 (Google Drive)"
                            value={
                              data.businessCertGoogleDriveFileId?.trim() ? (
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 min-w-0 justify-start"
                                    onClick={() => openGoogleDriveFile(data.businessCertGoogleDriveFileId)}
                                  >
                                    <Eye className="mr-2 h-4 w-4 shrink-0" />
                                    <span className="truncate">
                                      {data.businessCertFileName?.trim() || 'Google Drive 파일 열기'}
                                    </span>
                                  </Button>
                                </div>
                              ) : (
                                '-'
                              )
                            }
                          />
                        </div>
                      </div>
                    </section>

                    <Separator />
                  </>
                ) : null}

                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">농장/축산 정보</h3>
                    <p className="text-xs text-muted-foreground">
                      축종/운영방식/급여방식/두수 정보를 확인합니다.
                    </p>
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                    <InfoRow
                      label="축종"
                      value={
                        data.livestockTypes?.trim()
                          ? data.livestockTypes
                              .split(',')
                              .map((v) => v.trim())
                              .filter((v) => v.length > 0)
                              .map((v) => LIVESTOCK_TYPE_LABELS[v] || v)
                              .join(', ')
                          : '-'
                      }
                    />
                    <InfoRow
                      label="운영방식"
                      value={
                        data.operationMethod?.trim()
                          ? data.operationMethod
                              .split(',')
                              .map((v) => v.trim())
                              .filter((v) => v.length > 0)
                              .map((v) => OPERATION_METHOD_LABELS[v] || v)
                              .join(', ')
                          : '-'
                      }
                    />
                    <InfoRow
                      label="급여방식"
                      value={
                        data.feedingMethod?.trim()
                          ? FEEDING_METHOD_LABELS[data.feedingMethod.trim()] || data.feedingMethod.trim()
                          : '-'
                      }
                    />
                    <InfoRow
                      label="두수"
                      value={
                        typeof data.livestockCount === 'number'
                          ? `${new Intl.NumberFormat('ko-KR').format(data.livestockCount)}두`
                          : '-'
                      }
                    />
                  </div>
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">주소 정보</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      우편번호·법정동코드·도로명·지번·상세주소를 확인합니다. 이커머스에서 선택한{' '}
                      <span className="text-foreground/90">기본</span>으로 선택된 주소에는 별 아이콘이 표시됩니다.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                      <InfoRow label="우편번호" value={data.postalCode} />
                      <InfoRow
                        label="법정동코드"
                        value={
                          data.legalBCode?.trim() ? (
                            <span className="font-mono tracking-tight">{data.legalBCode.trim()}</span>
                          ) : (
                            '-'
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                      <div className="sm:col-span-1 md:col-span-2 min-w-0">
                        <InfoRow
                          label={
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              도로명주소
                              {resolveDefaultAddressKind(data) === 'ROAD' ? (
                                <span className="inline-flex" title="기본(도로명)">
                                  <Star
                                    className="h-3.5 w-3.5 shrink-0 text-amber-600"
                                    aria-label="기본: 도로명"
                                  />
                                </span>
                              ) : null}
                            </span>
                          }
                          value={
                            data.addressRoad?.trim() ? (
                              <span className="whitespace-pre-wrap break-words">{data.addressRoad.trim()}</span>
                            ) : (
                              '-'
                            )
                          }
                        />
                      </div>
                      <div className="sm:col-span-1 md:col-span-2 min-w-0">
                        <InfoRow
                          label={
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              지번주소
                              {resolveDefaultAddressKind(data) === 'JIBUN' ? (
                                <span className="inline-flex" title="기본(지번)">
                                  <Star
                                    className="h-3.5 w-3.5 shrink-0 text-amber-600"
                                    aria-label="기본: 지번"
                                  />
                                </span>
                              ) : null}
                            </span>
                          }
                          value={
                            data.addressJibun?.trim() ? (
                              <span className="whitespace-pre-wrap break-words">{data.addressJibun.trim()}</span>
                            ) : (
                              '-'
                            )
                          }
                        />
                      </div>
                      <div className="sm:col-span-2 md:col-span-4">
                        <InfoRow label="상세주소" value={data.addressDetail} />
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <CustomerContactsSection
                    customerId={data.id}
                    contacts={data.contacts ?? []}
                    accordionOpen={expandedAddressSection === 'contact'}
                    onAccordionOpenChange={(nextOpen) => {
                      setExpandedAddressSection((prev) => {
                        if (nextOpen) return 'contact';
                        return prev === 'contact' ? null : prev;
                      });
                    }}
                  />
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <CustomerDeliveryAddressesSection
                    customerId={data.id}
                    addresses={data.deliveryAddresses ?? []}
                    accordionOpen={expandedAddressSection === 'delivery'}
                    onAccordionOpenChange={(nextOpen) => {
                      setExpandedAddressSection((prev) => {
                        if (nextOpen) return 'delivery';
                        return prev === 'delivery' ? null : prev;
                      });
                    }}
                  />
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">농업경영체등록증</h3>
                    <p className="text-xs text-muted-foreground">
                      사업자·비사업자 구분과 관계없이 구글 드라이브에서 등록증 파일을 연결합니다.
                    </p>
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                    <div className="md:col-span-2 sm:col-span-2">
                      <InfoRow
                        label="파일 (Google Drive)"
                        value={
                          data.farmManagementCertGoogleDriveFileId?.trim() ? (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 min-w-0 justify-start"
                                onClick={() => openGoogleDriveFile(data.farmManagementCertGoogleDriveFileId)}
                              >
                                <Eye className="mr-2 h-4 w-4 shrink-0" />
                                <span className="truncate">
                                  {data.farmManagementCertFileName?.trim() || 'Google Drive 파일 열기'}
                                </span>
                              </Button>
                            </div>
                          ) : (
                            '-'
                          )
                        }
                      />
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">환불 계좌</h3>
                    <p className="text-xs text-muted-foreground">환불 시 입금받을 계좌를 등록합니다.</p>
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                    <InfoRow label="은행" value={data.refundBankName?.trim() || '-'} />
                    <div className="md:col-span-2">
                      <InfoRow
                        label="계좌번호"
                        value={
                          data.refundAccountNumber?.trim() ? (
                            <span className="font-mono tracking-tight">{data.refundAccountNumber.trim()}</span>
                          ) : (
                            '-'
                          )
                        }
                      />
                    </div>
                    <InfoRow label="예금주" value={data.refundDepositor?.trim() || '-'} />
                  </div>
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <CustomerStatementNamesSection
                    customerId={data.id}
                    statementNames={data.statementNames ?? []}
                    accordionOpen={expandedAddressSection === 'statement'}
                    onAccordionOpenChange={(nextOpen) => {
                      setExpandedAddressSection((prev) => {
                        if (nextOpen) return 'statement';
                        return prev === 'statement' ? null : prev;
                      });
                    }}
                  />
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">비고</h3>
                    <p className="text-xs text-muted-foreground">
                      담당자·내부 공유용 메모입니다. 목록 검색에도 포함됩니다.
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words min-h-[1.25rem]">
                      {data.remarks?.trim() ? data.remarks.trim() : '-'}
                    </p>
                  </div>
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">기록</h3>
                    <p className="text-xs text-muted-foreground">
                      생성·수정일은 시스템 관리에 참고하세요.
                    </p>
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                    <InfoRow
                      label="생성일"
                      value={data.createdAt ? new Date(data.createdAt).toLocaleString() : '-'}
                    />
                    <InfoRow
                      label="최종 수정일"
                      value={data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '-'}
                    />
                  </div>
                </section>
              </div>
            )}
          </ScrollArea>
          </div>
        </div>
        <DrawerFooter className="border-t border-border">
          <div className="flex justify-end gap-2 w-full">
            <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
            <Button
              variant="destructive"
              disabled={!data}
              onClick={() => {
                if (data && onDelete) {
                  onDelete(data);
                }
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              삭제
            </Button>
            <Button
              variant="default"
              disabled={!data}
              onClick={() => {
                if (data && onEdit) {
                  onEdit(data);
                }
              }}
            >
              <Edit className="mr-1.5 h-4 w-4" />
              수정
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
    </>
  );
}

