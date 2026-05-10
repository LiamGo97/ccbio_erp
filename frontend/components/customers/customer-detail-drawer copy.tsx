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
import { Consultation, ConsultationListResponse } from '@/lib/hooks/use-consultations';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import api from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Edit, X, Trash2, Copy, MoreVertical, FileText } from 'lucide-react';
import dynamic from 'next/dynamic';
const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { toast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomerStatementNamesSection } from './customer-statement-names-section';
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


interface CustomerDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string | null;
  onEdit?: (customer: Customer) => void;
  onDelete?: (customer: Customer) => void;
}

const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
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
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data, isLoading, error } = useCustomer(customerId ?? undefined);

  const [expandedAddressSection, setExpandedAddressSection] = React.useState<
    'statement' | 'delivery' | null
  >(null);

  React.useEffect(() => {
    if (!open) setExpandedAddressSection(null);
  }, [open]);

  React.useEffect(() => {
    setExpandedAddressSection(null);
  }, [customerId]);

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

  const customerPhone = data?.phone ?? undefined;

  const { data: consultationTypeCodes } = useCodeMastersByGroup('CONSULTATION_TYPE');
  const { data: consultationSourceCodes } = useCodeMastersByGroup('CONSULTATION_SOURCE');
  const { data: consultationInOutCodes } = useCodeMastersByGroup('CONSULTATION_INOUT');
  const { data: requestWeightCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: salesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: packingTypeCodes } = useCodeMastersByGroup('PACKING_TYPE');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: customerTypeCodes } = useCodesByCategory('CUSTOMER_TYPE');

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
  const requestWeightMap = React.useMemo(
    () => toCodeMap(requestWeightCodes),
    [toCodeMap, requestWeightCodes],
  );
  const salesGradeMap = React.useMemo(() => toCodeMap(salesGradeCodes), [toCodeMap, salesGradeCodes]);
  const packingTypeMap = React.useMemo(() => toCodeMap(packingTypeCodes), [toCodeMap, packingTypeCodes]);
  const productMap = React.useMemo(() => toCodeMap(productCodes), [toCodeMap, productCodes]);
  const customerTypeMap = React.useMemo(() => toCodeMap(customerTypeCodes), [toCodeMap, customerTypeCodes]);

  const labelOr = React.useCallback(
    (map: Map<string, string>, value?: string | null) => {
      const key = (value ?? '').trim();
      if (!key) return '';
      return map.get(key) ?? key;
    },
    [],
  );

  const {
    data: historyData,
    isLoading: isHistoryLoading,
    error: historyError,
  } = useQuery<ConsultationListResponse>({
    queryKey: ['customer-consultations', customerPhone],
    queryFn: async () => {
      const response = await api.get<ConsultationListResponse>('/consultations', {
        params: { phone: customerPhone, limit: 20 },
      });
      return response.data;
    },
    enabled: !!customerPhone && open,
  });

  const consultations = React.useMemo(() => historyData?.data ?? [], [historyData]);
  const [historySearch, setHistorySearch] = React.useState('');
  const [historyRange, setHistoryRange] = React.useState<{
    start?: Date;
    end?: Date;
  }>({});
  const startOfDay = React.useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const endOfDay = React.useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const filteredConsultations = React.useMemo(() => {
    const text = historySearch.trim().toLowerCase();
    const start = historyRange.start ? new Date(historyRange.start) : null;
    const end = historyRange.end ? new Date(historyRange.end) : null;

    return consultations.filter((item) => {
      let matchesText = true;
      if (text) {
        // 검색 대상 텍스트 수집
        const searchTexts: string[] = [];
        
        // 기존 필드들
        if (item.productName) searchTexts.push(item.productName);
        if (item.inquiryProduct) searchTexts.push(item.inquiryProduct);
        if (item.notes) searchTexts.push(item.notes);
        
        // products 배열의 모든 제품 정보
        if (item.products && item.products.length > 0) {
          item.products.forEach((product) => {
            if (product.productName) {
              // 제품명 (코드값과 이름 모두 검색)
              searchTexts.push(product.productName);
              const productName = labelOr(productMap, product.productName);
              if (productName && productName !== product.productName) {
                searchTexts.push(productName);
              }
            }
            if (product.grade) {
              // 등급 (코드값과 이름 모두 검색)
              searchTexts.push(product.grade);
              const gradeName = labelOr(salesGradeMap, product.grade);
              if (gradeName && gradeName !== product.grade) {
                searchTexts.push(gradeName);
              }
            }
            if (product.packingType) {
              // 포장유형 (코드값과 이름 모두 검색)
              searchTexts.push(product.packingType);
              const packingTypeName = labelOr(packingTypeMap, product.packingType);
              if (packingTypeName && packingTypeName !== product.packingType) {
                searchTexts.push(packingTypeName);
              }
            }
            if (product.requestedWeight) {
              searchTexts.push(product.requestedWeight);
            }
            if (product.requestedVehicle) {
              searchTexts.push(product.requestedVehicle);
              const vehicleName = labelOr(requestWeightMap, product.requestedVehicle);
              if (vehicleName && vehicleName !== product.requestedVehicle) {
                searchTexts.push(vehicleName);
              }
            }
          });
        }
        
        const combined = searchTexts.join(' ').toLowerCase();
        matchesText = combined.includes(text);
      }

      let matchesDate = true;
      if (item.consultationDate && (start || end)) {
        const itemDate = new Date(item.consultationDate);
        if (start && itemDate < startOfDay(start)) {
          matchesDate = false;
        }
        if (end && itemDate > endOfDay(end)) {
          matchesDate = false;
        }
      }
      return matchesText && matchesDate;
    });
  }, [
    consultations,
    historySearch,
    historyRange,
    startOfDay,
    endOfDay,
    productMap,
    salesGradeMap,
    packingTypeMap,
    requestWeightMap,
    labelOr,
  ]);

  const productStats = React.useMemo(() => {
    const counts = new Map<string, number>();
    consultations.forEach((item) => {
      // products 배열이 있으면 모든 제품 카운트
      if (item.products && item.products.length > 0) {
        item.products.forEach((product) => {
          const productKey = labelOr(productMap, product.productName) || '기타';
          counts.set(productKey, (counts.get(productKey) ?? 0) + 1);
        });
      } else if (item.productName) {
        // 기존 호환성: productName 사용
        const productKey = labelOr(productMap, item.productName) || item.productName;
        counts.set(productKey, (counts.get(productKey) ?? 0) + 1);
      } else if (item.inquiryProduct) {
        // 기존 호환성: inquiryProduct 사용
        counts.set(item.inquiryProduct, (counts.get(item.inquiryProduct) ?? 0) + 1);
      } else {
        // 제품 정보가 없으면 기타로 카운트
        counts.set('기타', (counts.get('기타') ?? 0) + 1);
      }
    });
    const entries = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const total = entries.reduce((sum, item) => sum + item.count, 0);
    const labels = entries.map((item) => item.name);
    const data = entries.map((item) => item.count);
    return { entries, total, labels, data };
  }, [consultations, productMap, labelOr]);

  const handleCopyCustomerInfo = React.useCallback(() => {
    if (!data) {
      toast({
        title: '복사 실패',
        description: '고객 정보를 불러온 후 다시 시도해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const primaryAddressParts = [
      data.address?.trim(),
      data.addressDetail?.trim(),
    ].filter((part) => !!part && part.length > 0);

    const fallbackAddressParts =
      primaryAddressParts.length === 0
        ? [
            data.region?.trim(),
            data.city?.trim(),
          ].filter((part) => !!part && part.length > 0)
        : [];

    const addressStringParts =
      primaryAddressParts.length > 0 ? primaryAddressParts : fallbackAddressParts;

    const addressText = addressStringParts.length > 0
      ? `${data.postalCode ? `[${data.postalCode}] ` : ''}${addressStringParts.join(' ')}`
      : data.postalCode
        ? `[${data.postalCode}]`
        : '-';

    const copyText = [
      `업체명 : ${data.companyName || '-'}`,
      `담당자 : ${data.ceo || '-'}`,
      `연락처 : ${formatPhone(data.phone)}`,
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
  }, [data]);

  const handleCopyPhoneAndAddress = React.useCallback(() => {
    if (!data) {
      toast({
        title: '복사 실패',
        description: '고객 정보를 불러온 후 다시 시도해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const primaryAddressParts = [
      data.address?.trim(),
      data.addressDetail?.trim(),
    ].filter((part) => !!part && part.length > 0);

    const fallbackAddressParts =
      primaryAddressParts.length === 0
        ? [
            data.region?.trim(),
            data.city?.trim(),
          ].filter((part) => !!part && part.length > 0)
        : [];

    const addressStringParts =
      primaryAddressParts.length > 0 ? primaryAddressParts : fallbackAddressParts;

    const addressText = addressStringParts.length > 0
      ? `${data.postalCode ? `[${data.postalCode}] ` : ''}${addressStringParts.join(' ')}`
      : data.postalCode
        ? `[${data.postalCode}]`
        : '-';

    const copyText = [
      `연락처 : ${formatPhone(data.phone)}`,
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
  }, [data]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{
          width: isMobile ? '100%' : '1100px',
          maxWidth: '92vw',
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
                고객의 기본 정보, 주소, 추가 정보를 확인할 수 있습니다.
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-2">
              {customerId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    router.push(`/finance/receivables/ledger?customerId=${customerId}`);
                    onOpenChange(false);
                  }}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  거래처관리대장
                </Button>
              )}
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
          <div className="flex-[3] border-r border-border bg-muted/20 hidden lg:flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">상담 이력</Label>
                <p className="text-xs text-muted-foreground">최근 상담순</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {filteredConsultations.length > 0 ? `${filteredConsultations.length}건` : '0건'}
              </span>
            </div>
            <div className="flex-1 grid grid-cols-1 xl:grid-cols-7 gap-3 px-3 py-4 overflow-hidden">
              <div className="rounded-lg border bg-card p-3 flex flex-col min-h-[240px] xl:col-span-3 h-[400px]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label className="text-sm font-semibold">제품별 상담 비중</Label>
                    <p className="text-xs text-muted-foreground">전체 상담 대비</p>
                  </div>
                  {productStats.total > 0 && (
                    <span className="text-xs text-muted-foreground">{productStats.total}건</span>
                  )}
                </div>
                {productStats.total === 0 ? (
                  <p className="text-xs text-muted-foreground">집계할 상담 이력이 없습니다.</p>
                ) : (
                  <div className="flex-1 flex items-center justify-center overflow-visible p-4">
                    <div className="w-[90%] h-[90%] max-w-full max-h-full flex items-center justify-center">
                      <Chart
                        type="pie"
                        series={productStats.data}
                        options={{
                          labels: productStats.labels,
                          legend: {
                            position: 'bottom',
                            fontSize: '11px',
                            itemMargin: {
                              horizontal: 8,
                              vertical: 4,
                            },
                          },
                          chart: {
                            toolbar: {
                              show: false,
                            },
                          },
                          plotOptions: {
                            pie: {
                              donut: {
                                size: '0%',
                              },
                              dataLabels: {
                                offset: -15
                              }
                            },
                          },
                          dataLabels: {
                            enabled: true,
                            formatter: (_val: number, opts: { seriesIndex: number }) => {
                              const label = productStats.labels[opts.seriesIndex] || '';
                              const count = productStats.data[opts.seriesIndex] || 0;
                              return `${label}\n${count}건`;
                            },
                            style: {
                              fontSize: '14px',
                              fontWeight: 500,
                            },
                          },
                          tooltip: {
                            y: {
                              formatter: (val: number) => `${val}건`,
                            },
                          },
                        }}
                        width="100%"
                        height="100%"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-lg border bg-card flex flex-col overflow-hidden xl:col-span-4">
                <div className="px-3 py-2 border-b space-y-2">
                  <p className="text-xs font-semibold text-foreground">상담 이력 목록</p>
                  <div className="space-y-2">
                    <Input
                      placeholder="제품명 / 메모 검색"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <DateRangePicker
                      startDate={historyRange.start}
                      endDate={historyRange.end}
                      onChange={(startDate, endDate) => {
                        setHistoryRange({ start: startDate ?? undefined, end: endDate ?? undefined });
                      }}
                      className="h-8 text-xs w-full"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {!customerPhone && (
                    <p className="text-xs text-muted-foreground">
                      고객 연락처가 없어 상담 이력을 조회할 수 없습니다.
                    </p>
                  )}
                  {customerPhone && isHistoryLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      상담 이력을 불러오는 중입니다.
                    </div>
                  )}
                  {customerPhone && historyError && (
                    <p className="text-xs text-destructive">
                      상담 이력을 불러오지 못했습니다.
                    </p>
                  )}
                  {customerPhone &&
                    !isHistoryLoading &&
                    !historyError &&
                    filteredConsultations.length === 0 && (
                      <p className="text-xs text-muted-foreground">등록된 상담 이력이 없습니다.</p>
                    )}
                  {filteredConsultations.map((item: Consultation) => (
                    <div
                      key={item.id}
                      className="rounded-md border bg-background p-3 space-y-2.5 text-sm hover:bg-accent/40 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {item.consultationDate
                            ? new Date(item.consultationDate).toLocaleDateString('ko-KR', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                              })
                            : '날짜 미정'}
                        </span>
                        <span>{item.managerName || '담당자 없음'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.type && (
                          <Badge variant="default" className="text-xs px-1.5 py-0">
                            {labelOr(typeMap, item.type)}
                          </Badge>
                        )}
                        {item.inOut && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {labelOr(inOutMap, item.inOut)}
                          </Badge>
                        )}
                      </div>
                      <div className="font-semibold text-foreground space-y-1.5">
                        {(() => {
                          // products 배열이 있으면 모든 제품 표시
                          if (item.products && item.products.length > 0) {
                            return item.products.map((product, idx) => {
                              const productName = labelOr(productMap, product.productName) || '-';
                              const gradeName = product.grade ? labelOr(salesGradeMap, product.grade) : '';
                              const packingTypeName = product.packingType ? labelOr(packingTypeMap, product.packingType) : '';
                            const weightText = product.requestedWeight || '';
                            const vehicleName = product.requestedVehicle ? labelOr(requestWeightMap, product.requestedVehicle) : '';
                              
                              return (
                                <div key={idx} className="text-sm space-y-0.5">
                                  <div>{productName}</div>
                                  {(gradeName || packingTypeName) && (
                                    <div className="text-xs text-muted-foreground font-normal">
                                      {gradeName && <span>등급: {gradeName}</span>}
                                      {gradeName && packingTypeName && <span className="mx-1.5">·</span>}
                                      {packingTypeName && <span>포장: {packingTypeName}</span>}
                                    </div>
                                  )}
                                {(weightText || vehicleName) && (
                                  <div className="text-xs text-muted-foreground font-normal">
                                    {weightText && <span>요청 중량: {weightText}</span>}
                                    {weightText && vehicleName && <span className="mx-1.5">·</span>}
                                    {vehicleName && <span>요청 차량: {vehicleName}</span>}
                                  </div>
                                )}
                                </div>
                              );
                            });
                          }
                          // 기존 호환성: productName 또는 inquiryProduct 사용
                          const productName = item.productName 
                            ? labelOr(productMap, item.productName)
                            : (item.inquiryProduct || '문의 제품 미정');
                          const gradeName = item.grade ? labelOr(salesGradeMap, item.grade) : '';
                        const vehicleName = item.requestedWeight ? labelOr(requestWeightMap, item.requestedWeight) : '';
                          return (
                            <div className="text-sm">
                              {gradeName 
                                ? `${productName}(${gradeName})`
                                : productName}
                            {vehicleName && (
                              <div className="text-xs text-muted-foreground font-normal mt-0.5">
                                요청 차량: {vehicleName}
                              </div>
                            )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {item.source && (
                          <div>
                            <span className="text-muted-foreground/70">유입: </span>
                            <span>{labelOr(sourceMap, item.source)}</span>
                          </div>
                        )}
                        {item.requestedWeight && (
                          <div>
                            <span className="text-muted-foreground/70">요청 차량: </span>
                            <span>{labelOr(requestWeightMap, item.requestedWeight)}</span>
                          </div>
                        )}
                        {(item.deliveryAddress || item.deliveryAddressDetail) && (
                          <div>
                            <span className="text-muted-foreground/70">배송지: </span>
                            <span>
                              {item.deliveryPostalCode && `[${item.deliveryPostalCode}] `}
                              {item.deliveryAddress || ''}
                              {item.deliveryAddressDetail && ` ${item.deliveryAddressDetail}`}
                            </span>
                          </div>
                        )}
                        {item.proposedPrice && (
                          <div>
                            <span className="text-muted-foreground/70">제안가: </span>
                            <span>{item.proposedPrice}</span>
                          </div>
                        )}
                        {(item.hasUnloading || item.hasHandling) && (
                          <div className="flex items-center gap-1.5">
                            {item.hasUnloading && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0">
                                적출
                              </Badge>
                            )}
                            {item.hasHandling && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0">
                                하역
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      {item.notes && (
                        <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                          {item.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-[2] min-h-0 w-full">
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
                  <div className="grid gap-4 md:grid-cols-2">
                    <InfoRow label="구분" value={labelOr(customerTypeMap, data.customerType) || '-'} />
                    <InfoRow label="업체명" value={data.companyName} />
                    <InfoRow label="대표자" value={data.ceo} />
                    <InfoRow label="연락처" value={formatPhone(data.phone)} />
                    <InfoRow label="구 참참회원 여부" value={data.chamchamStatus || '-'} />
                    <InfoRow label="신규 참참회원 여부" value={data.chamcharmMemberStatus || '-'} />
                    <InfoRow
                      label="이벤트 SMS 응답"
                      value={data.eventSmsResponded ? '예' : '아니오'}
                    />
                    <InfoRow label="축종" value={data.species || '-'} />
                    <InfoRow label="사료형태" value={data.feeding || '-'} />
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
                    <h3 className="text-sm font-semibold text-foreground">주소 정보</h3>
                    <p className="text-xs text-muted-foreground">
                      법정동코드가 있으면 국토부 법정동 마스터 기준으로 시·도·읍면동을 표시합니다. 도로명·지번은 카카오
                      검색 결과를 저장한 값이며, 비어 있으면 상세 조회 시 자동 보강될 수 있습니다.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-4">
                      <InfoRow
                        label="시·도"
                        value={data.legalSidoName?.trim() || data.region || '-'}
                      />
                      <InfoRow
                        label="시·군·구"
                        value={data.legalSigunguName?.trim() || data.city || '-'}
                      />
                      <InfoRow
                        label="읍·면·동"
                        value={data.legalEupmyeondongName?.trim() || '-'}
                      />
                      <InfoRow label="리" value={data.legalRiName?.trim() || '-'} />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
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
                    <div className="grid gap-4 md:grid-cols-1">
                      <InfoRow
                        label="도로명주소"
                        value={
                          data.addressRoad?.trim() ? (
                            <span className="whitespace-pre-wrap break-words">{data.addressRoad.trim()}</span>
                          ) : (
                            '-'
                          )
                        }
                      />
                      <InfoRow
                        label="지번주소"
                        value={
                          data.addressJibun?.trim() ? (
                            <span className="whitespace-pre-wrap break-words">{data.addressJibun.trim()}</span>
                          ) : (
                            '-'
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <InfoRow
                          label="기본주소 (입력·검색 기준)"
                          value={data.address}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <InfoRow label="상세주소" value={data.addressDetail} />
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">운영형태</h3>
                    <p className="text-xs text-muted-foreground">
                      주요 운영방식과 세부 유형, 사육두수 정보를 확인합니다.
                    </p>
                  </div>
                  {data.operations && data.operations.length > 0 ? (
                    <div className="space-y-3">
                      {data.operations.map((op, index) => {
                        const herdSizeText =
                          typeof op.herdSize === 'number'
                            ? `${new Intl.NumberFormat('ko-KR').format(op.herdSize)}두`
                            : '-';

                        return (
                          <div
                            key={`${op.operation}-${op.operationSub}-${index}`}
                            className="rounded-lg border bg-card/40 p-3 space-y-3"
                          >
                            <div className="grid gap-4 md:grid-cols-3">
                              <InfoRow label="운영방식" value={op.operation || '-'} />
                              <InfoRow label="세부 유형" value={op.operationSub || '-'} />
                              <InfoRow label="사육두수" value={herdSizeText} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">등록된 운영형태가 없습니다.</p>
                  )}
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">기록</h3>
                    <p className="text-xs text-muted-foreground">
                      생성·수정일은 시스템 관리에 참고하세요.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
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
  );
}

