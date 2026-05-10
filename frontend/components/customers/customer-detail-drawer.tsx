import * as React from 'react';
import dynamic from 'next/dynamic';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomer, Customer } from '@/lib/hooks/use-customers';
import { Consultation, ConsultationListResponse } from '@/lib/hooks/use-consultations';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { Loader2, Edit, X, Trash2, Copy, MoreVertical, Star, MessageSquare, Eye, ArrowLeft } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
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
const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });
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

const HistoryDetailRow = ({
  label,
  value,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  className?: string;
}) => (
  <div className={`space-y-1 text-sm ${className ?? ''}`}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-medium text-foreground break-words">{value ?? '-'}</p>
  </div>
);

const formatKoreanDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export function CustomerDetailDrawer({
  open,
  onOpenChange,
  customerId,
  onEdit,
  onDelete,
}: CustomerDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, error } = useCustomer(customerId ?? undefined);
  const [consultPanelOpen, setConsultPanelOpen] = React.useState(false);
  const [selectedHistory, setSelectedHistory] = React.useState<Consultation | null>(null);
  const [historySearch, setHistorySearch] = React.useState('');
  const [historyRange, setHistoryRange] = React.useState<{ start?: Date; end?: Date }>({});

  const [expandedAddressSection, setExpandedAddressSection] = React.useState<
    'statement' | 'delivery' | null
  >(null);

  React.useEffect(() => {
    if (!open) setExpandedAddressSection(null);
  }, [open]);

  React.useEffect(() => {
    setExpandedAddressSection(null);
  }, [customerId]);

  React.useEffect(() => {
    if (!open) {
      setConsultPanelOpen(false);
      setSelectedHistory(null);
      setHistorySearch('');
      setHistoryRange({});
    }
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
  const { data: consultationTypeCodes } = useCodeMastersByGroup('CONSULTATION_TYPE');
  const { data: consultationInOutCodes } = useCodeMastersByGroup('CONSULTATION_INOUT');
  const { data: consultationSourceCodes } = useCodeMastersByGroup('CONSULTATION_SOURCE');
  const { data: consultationRequestWeightCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: consultationSalesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: consultationPackingTypeCodes } = useCodeMastersByGroup('PACKING_TYPE');
  const { data: consultationProductCategories } = useCodeMastersByGroup('PRODUCT_CATEGORY');
  const { data: consultationProductCodes } = useCodeMastersByGroup('PRODUCT');

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
  const consultationTypeMap = React.useMemo(
    () => toCodeMap(consultationTypeCodes),
    [toCodeMap, consultationTypeCodes],
  );
  const consultationInOutMap = React.useMemo(
    () => toCodeMap(consultationInOutCodes),
    [toCodeMap, consultationInOutCodes],
  );
  const consultationSourceMap = React.useMemo(
    () => toCodeMap(consultationSourceCodes),
    [toCodeMap, consultationSourceCodes],
  );
  const consultationRequestWeightMap = React.useMemo(
    () => toCodeMap(consultationRequestWeightCodes),
    [toCodeMap, consultationRequestWeightCodes],
  );
  const consultationSalesGradeMap = React.useMemo(
    () => toCodeMap(consultationSalesGradeCodes),
    [toCodeMap, consultationSalesGradeCodes],
  );
  const consultationPackingTypeMap = React.useMemo(
    () => toCodeMap(consultationPackingTypeCodes),
    [toCodeMap, consultationPackingTypeCodes],
  );
  const consultationProductMap = React.useMemo(
    () => toCodeMap(consultationProductCodes),
    [toCodeMap, consultationProductCodes],
  );
  const consultationProductCategoryMap = React.useMemo(() => {
    const map = new Map<number, string>();
    (consultationProductCategories ?? []).forEach((c) => {
      const id = Number(c.id);
      if (!Number.isFinite(id)) return;
      const label = (c.name ?? c.value ?? '').trim();
      if (label) map.set(id, label);
    });
    return map;
  }, [consultationProductCategories]);

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

  const customerIdForConsultations = data?.id?.trim() ?? '';
  const customerPhone = data?.phone?.trim() ?? '';
  const {
    data: consultationsData,
    isLoading: isConsultationsLoading,
    error: consultationsError,
  } = useQuery<ConsultationListResponse>({
    queryKey: ['customer-consultations-panel', customerIdForConsultations, customerPhone],
    queryFn: async () => {
      const response = await api.get<ConsultationListResponse>('/consultations', {
        params: {
          customerId: customerIdForConsultations || undefined,
          phone: customerIdForConsultations ? undefined : customerPhone,
          limit: 30,
          sortBy: 'consultationDate',
          sortOrder: 'desc',
        },
      });
      return response.data;
    },
    enabled: open && !isMobile && consultPanelOpen && (!!customerIdForConsultations || !!customerPhone),
  });
  const consultations = React.useMemo(() => consultationsData?.data ?? [], [consultationsData]);
  const filteredConsultations = React.useMemo(() => {
    const text = historySearch.trim().toLowerCase();
    const start = historyRange.start ? new Date(historyRange.start) : null;
    const end = historyRange.end ? new Date(historyRange.end) : null;
    const startAt = start ? new Date(start.setHours(0, 0, 0, 0)) : null;
    const endAt = end ? new Date(end.setHours(23, 59, 59, 999)) : null;

    return consultations.filter((item) => {
      if (text) {
        const haystack = [
          item.productName ?? '',
          item.inquiryProduct ?? '',
          item.notes ?? '',
          item.managerName ?? '',
          item.type ?? '',
          item.inOut ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(text)) return false;
      }

      if (item.consultationDate && (startAt || endAt)) {
        const date = new Date(item.consultationDate);
        if (startAt && date < startAt) return false;
        if (endAt && date > endAt) return false;
      }
      return true;
    });
  }, [consultations, historySearch, historyRange]);

  const historyProductStats = React.useMemo(() => {
    const counts = new Map<string, number>();
    consultations.forEach((item) => {
      if (item.products && item.products.length > 0) {
        item.products.forEach((product) => {
          const productName =
            (product.productName
              ? consultationProductMap.get(product.productName) ??
                product.productName
              : '') || '기타';
          counts.set(productName, (counts.get(productName) ?? 0) + 1);
        });
        return;
      }
      const fallback =
        (item.productName
          ? consultationProductMap.get(item.productName) ?? item.productName
          : item.inquiryProduct) || '기타';
      counts.set(fallback, (counts.get(fallback) ?? 0) + 1);
    });
    const entries = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const total = entries.reduce((sum, item) => sum + item.count, 0);
    return { total, entries };
  }, [consultations, consultationProductMap]);

  React.useEffect(() => {
    if (!selectedHistory) return;
    const exists = consultations.some((item) => item.id === selectedHistory.id);
    if (!exists) setSelectedHistory(null);
  }, [consultations, selectedHistory]);

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{
          width: isMobile ? '100%' : consultPanelOpen ? '1500px' : '800px',
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
                고객의 기본 정보, 주소, 추가 정보를 확인할 수 있습니다.
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-2">
              {!isMobile && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setConsultPanelOpen((prev) => !prev)}
                >
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  {consultPanelOpen ? '상담 이력 닫기' : '상담 이력 보기'}
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
          {!isMobile && consultPanelOpen ? (
            <aside className="flex w-[700px] shrink-0 border-r border-border bg-muted/20 flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">기존 상담 이력</h3>
                  <p className="text-xs text-muted-foreground">상담 등록 화면과 동일한 형태</p>
                </div>
                <Badge variant="secondary" className="font-normal">
                  {filteredConsultations.length}건
                </Badge>
              </div>
              <div className="relative min-h-0 flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-7 gap-3 h-full">
                  <div className="rounded-lg border bg-card p-3 flex flex-col min-h-[240px] col-span-3 h-[400px]">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <Label className="text-sm font-semibold">제품별 상담 비중</Label>
                        <p className="text-xs text-muted-foreground">전체 상담 대비</p>
                      </div>
                      {historyProductStats.total > 0 && (
                        <span className="text-xs text-muted-foreground">{historyProductStats.total}건</span>
                      )}
                    </div>
                    {historyProductStats.total === 0 ? (
                      <p className="text-xs text-muted-foreground">집계할 상담 이력이 없습니다.</p>
                    ) : (
                      <div className="flex-1 flex items-center justify-center overflow-visible p-4">
                        <div className="w-[90%] h-[90%] max-w-full max-h-full flex items-center justify-center">
                          <Chart
                            type="pie"
                            series={historyProductStats.entries.map((e) => e.count)}
                            options={{
                              labels: historyProductStats.entries.map((e) => e.name),
                              legend: {
                                position: 'bottom',
                                fontSize: '11px',
                                itemMargin: { horizontal: 8, vertical: 4 },
                              },
                              chart: { toolbar: { show: false } },
                              plotOptions: {
                                pie: {
                                  donut: { size: '0%' },
                                  dataLabels: { offset: -15 },
                                },
                              },
                              dataLabels: {
                                enabled: true,
                                formatter: (_val: number, opts: { seriesIndex: number }) => {
                                  const label =
                                    historyProductStats.entries[opts.seriesIndex]?.name ?? '';
                                  const count =
                                    historyProductStats.entries[opts.seriesIndex]?.count ?? 0;
                                  return `${label}\n${count}건`;
                                },
                                style: { fontSize: '14px', fontWeight: 500 },
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
                  <div className="rounded-lg border bg-card flex flex-col overflow-hidden col-span-4">
                    <div className="px-3 py-3 border-b space-y-2">
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
                      <p className="text-xs font-semibold text-foreground pt-1">상담 이력 목록</p>
                    </div>
                    <ScrollArea className="flex-1 p-3">
                      <div className="space-y-3">
                {!customerIdForConsultations && !customerPhone ? (
                  <p className="text-xs text-muted-foreground">
                    고객 연락처가 없어 상담 내역을 조회할 수 없습니다.
                  </p>
                ) : null}
                {(customerIdForConsultations || customerPhone) && isConsultationsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    상담 내역을 불러오는 중입니다...
                  </div>
                ) : null}
                {(customerIdForConsultations || customerPhone) && consultationsError ? (
                  <p className="text-xs text-destructive">상담 내역을 불러오지 못했습니다.</p>
                ) : null}
                {(customerIdForConsultations || customerPhone) &&
                !isConsultationsLoading &&
                !consultationsError &&
                filteredConsultations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">등록된 상담 내역이 없습니다.</p>
                ) : null}
                {filteredConsultations.map((item: Consultation) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full rounded-md border bg-background p-3 space-y-1.5 text-left hover:bg-accent/40"
                    onClick={() => {
                      setSelectedHistory(item);
                    }}
                  >
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {item.consultationDate
                          ? new Date(item.consultationDate).toLocaleDateString('ko-KR')
                          : '날짜 미정'}
                      </span>
                      <span>{item.managerName || '-'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.type ? (
                        <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                          {labelOr(consultationTypeMap, item.type) || item.type}
                        </Badge>
                      ) : null}
                      {item.inOut ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          {labelOr(consultationInOutMap, item.inOut) || item.inOut}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-foreground break-words">
                      {(() => {
                        const productCode = (item.productName ?? '').trim();
                        if (productCode) {
                          return (
                            consultationProductMap.get(productCode) ?? productCode
                          );
                        }
                        return item.inquiryProduct?.trim() || '문의 제품 미정';
                      })()}
                    </p>
                    {item.notes?.trim() ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                        {item.notes.trim()}
                      </p>
                    ) : null}
                  </button>
                ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
                {selectedHistory && (
                  <div className="absolute inset-0 z-20 bg-background/98 backdrop-blur-sm border-r border-border shadow-lg flex flex-col">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">상담 상세 보기</p>
                        <p className="text-xs text-muted-foreground">
                          {formatKoreanDate(selectedHistory.consultationDate)} ·{' '}
                          {selectedHistory.managerName || '담당자 없음'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedHistory(null)}
                        className="gap-1.5"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        목록으로
                      </Button>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-4 space-y-6">
                        <section className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold">상담 기본 정보</h4>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {selectedHistory.type && (
                                <Badge variant="secondary">
                                  {labelOr(consultationTypeMap, selectedHistory.type)}
                                </Badge>
                              )}
                              {selectedHistory.inOut && (
                                <Badge variant="outline">
                                  {labelOr(consultationInOutMap, selectedHistory.inOut)}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-4 md:grid-cols-4">
                            <HistoryDetailRow
                              label="상담일"
                              value={formatKoreanDate(selectedHistory.consultationDate)}
                            />
                            <HistoryDetailRow
                              label="담당자"
                              value={selectedHistory.managerName || '-'}
                            />
                            <HistoryDetailRow
                              label="상담 유형"
                              value={
                                selectedHistory.type
                                  ? labelOr(consultationTypeMap, selectedHistory.type)
                                  : '-'
                              }
                            />
                            <HistoryDetailRow
                              label="유입 경로"
                              value={
                                selectedHistory.source
                                  ? labelOr(consultationSourceMap, selectedHistory.source)
                                  : '-'
                              }
                            />
                            <HistoryDetailRow
                              label="IN/OUT"
                              value={
                                selectedHistory.inOut
                                  ? labelOr(consultationInOutMap, selectedHistory.inOut)
                                  : '-'
                              }
                            />
                            <HistoryDetailRow
                              label="제안가"
                              value={selectedHistory.proposedPrice || '-'}
                            />
                            <HistoryDetailRow
                              label="적출 여부"
                              value={selectedHistory.hasUnloading ? '예' : '아니오'}
                            />
                            <HistoryDetailRow
                              label="하역 여부"
                              value={selectedHistory.hasHandling ? '예' : '아니오'}
                            />
                          </div>
                        </section>

                        <section className="space-y-3">
                          <h4 className="text-sm font-semibold">제품 정보</h4>
                          {selectedHistory.products && selectedHistory.products.length > 0 ? (
                            <div className="space-y-3">
                              {selectedHistory.products.map((product, idx) => {
                                const categoryName =
                                  product.productCategoryId != null
                                    ? consultationProductCategoryMap.get(
                                        product.productCategoryId,
                                      ) || '-'
                                    : '-';
                                const productName = product.productName
                                  ? labelOr(consultationProductMap, product.productName)
                                  : '-';
                                const gradeName = product.grade
                                  ? labelOr(consultationSalesGradeMap, product.grade)
                                  : '-';
                                const packingName = product.packingType
                                  ? labelOr(consultationPackingTypeMap, product.packingType)
                                  : '-';
                                const vehicleName = product.requestedVehicle
                                  ? labelOr(
                                      consultationRequestWeightMap,
                                      product.requestedVehicle,
                                    )
                                  : '-';
                                return (
                                  <div
                                    key={`${product.id}_${product.productName ?? ''}_${idx}`}
                                    className="rounded-lg border bg-card p-4 space-y-4"
                                  >
                                    <div className="grid gap-4 md:grid-cols-4">
                                      <HistoryDetailRow label="제품 분류" value={categoryName || '-'} />
                                      <HistoryDetailRow label="문의 제품" value={productName || '-'} />
                                      <HistoryDetailRow label="등급(세일즈)" value={gradeName || '-'} />
                                      <HistoryDetailRow label="포장 유형" value={packingName || '-'} />
                                      <HistoryDetailRow label="요청 중량" value={product.requestedWeight || '-'} />
                                      <HistoryDetailRow label="요청 차량" value={vehicleName || '-'} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : selectedHistory.productName || selectedHistory.inquiryProduct ? (
                            <div className="rounded-lg border bg-card p-4 space-y-2">
                              <HistoryDetailRow
                                label="문의 제품"
                                value={
                                  selectedHistory.productName
                                    ? labelOr(consultationProductMap, selectedHistory.productName)
                                    : selectedHistory.inquiryProduct || '-'
                                }
                              />
                              <HistoryDetailRow
                                label="등급(세일즈)"
                                value={
                                  selectedHistory.grade
                                    ? labelOr(consultationSalesGradeMap, selectedHistory.grade)
                                    : '-'
                                }
                              />
                              <HistoryDetailRow
                                label="요청 차량"
                                value={
                                  selectedHistory.requestedWeight
                                    ? labelOr(
                                        consultationRequestWeightMap,
                                        selectedHistory.requestedWeight,
                                      )
                                    : '-'
                                }
                              />
                            </div>
                          ) : (
                            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                              제품 정보가 없습니다.
                            </div>
                          )}
                        </section>

                        <section className="space-y-3">
                          <h4 className="text-sm font-semibold">배송 정보</h4>
                          <div className="grid gap-4 md:grid-cols-4">
                            <HistoryDetailRow label="우편번호" value={selectedHistory.deliveryPostalCode || '-'} />
                            <HistoryDetailRow label="지역" value={selectedHistory.deliveryRegion || '-'} />
                            <HistoryDetailRow label="시/군/구" value={selectedHistory.deliveryCity || '-'} />
                            <div className="hidden md:block" />
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <HistoryDetailRow label="주소" value={selectedHistory.deliveryAddress || '-'} />
                            <HistoryDetailRow label="상세주소" value={selectedHistory.deliveryAddressDetail || '-'} />
                          </div>
                        </section>

                        <section className="space-y-2">
                          <h4 className="text-sm font-semibold">상담 메모</h4>
                          <div className="min-h-[80px] rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                            {selectedHistory.notes ? (
                              selectedHistory.notes
                            ) : (
                              <span className="text-muted-foreground">메모가 없습니다.</span>
                            )}
                          </div>
                        </section>
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </aside>
          ) : null}

          <div className="min-h-0 flex-1 w-full">
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
                    <h3 className="text-sm font-semibold text-foreground">추가 정보</h3>
                    <p className="text-xs text-muted-foreground">
                      이벤트 응답 및 축종/사료형태 정보를 확인합니다.
                    </p>
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                    <InfoRow label="이벤트 SMS 응답" value={data.eventSmsResponded ? '예' : '아니오'} />
                    <InfoRow label="축종" value={data.species || '-'} />
                    <InfoRow label="사료형태" value={data.feeding || '-'} />
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
                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
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
                    <h3 className="text-sm font-semibold text-foreground">기존 주소</h3>
                    <p className="text-xs text-muted-foreground">
                      신규 주소 체계 전환 중 참고용으로 기존 지역·시군구·주소를 함께 표시합니다.
                    </p>
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                    <InfoRow label="지역" value={data.region || '-'} />
                    <InfoRow label="시군구" value={data.city || '-'} />
                    <div className="sm:col-span-2 md:col-span-4">
                      <InfoRow label="기존 주소" value={data.address} />
                    </div>
                    <div className="sm:col-span-2 md:col-span-4">
                      <InfoRow label="기존 상세주소" value={data.addressDetail} />
                    </div>
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

