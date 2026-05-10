'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCustomersWithReceivables,
  CustomerWithReceivable,
  useUpdateSmsExcluded,
  serializeReceivablesParams,
} from '@/lib/hooks/use-receivables';
import { useSmsSenders } from '@/lib/hooks/use-sms-senders';
import { useSmsTemplatesByType } from '@/lib/hooks/use-sms-templates';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { CustomerLedgerDrawer } from '@/components/finance/customer-ledger-drawer';
import { Loader2, MessageSquareOff, MessageSquare, Filter, Download, Send, X, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import Cookies from 'js-cookie';
import { api } from '@/lib/api';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { formatSalesManagerDisplay } from '@/lib/format-sales-manager';
import { getSmsAddresseeTokens, normalizeSmsGreetingLineBreaks } from '@/lib/sms-addressee-tokens';

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) return parsed;
  }
  return 20;
};

const WARNING_STATUS_TO_TEMPLATE_TYPE: Record<string, string> = {
  WARNING_1ST: 'RECEIVABLE_WARNING_1ST',
  WARNING_2ND: 'RECEIVABLE_WARNING_2ND',
  WARNING_3RD: 'RECEIVABLE_WARNING_3RD',
  MALICIOUS: 'RECEIVABLE_MALICIOUS',
};

const warningStatusToLabel: Record<string, string> = {
  __null__: '정상',
  '': '정상',
  EXCLUDED: '제외',
  WARNING_1ST: '1차 경고',
  WARNING_2ND: '2차 경고',
  WARNING_3RD: '3차 경고',
  MALICIOUS: '악성 채권',
};

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatPaymentTerms(type: string | undefined, value: number | null | undefined): string {
  if (!type) return '';
  const typeLabels: Record<string, string> = {
    DAYS: '일수',
    THIS_MONTH_DAY: '이번달 N일',
    NEXT_MONTH_DAY: '다음달 N일',
    THIS_MONTH_END: '이번달 마지막일',
    NEXT_MONTH_END: '다음달 마지막일',
  };
  const label = typeLabels[type] || type;
  if (type === 'THIS_MONTH_END' || type === 'NEXT_MONTH_END') return label;
  if (value !== null && value !== undefined) return `${label} (${value})`;
  return label;
}

function formatDateForCsv(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return String(dateStr);
  }
}

function customersToCsv(rows: CustomerWithReceivable[], customerTypeMap: Map<string, string>): string {
  const headers = [
    '구분',
    '회사명',
    '대표자',
    '공급자',
    '전화번호',
    '명세서 발행일',
    '결제조건',
    '결제조건일',
    '경과일',
    '채권 상태',
    '현재 잔액',
    '영업 담당자',
    'SMS 발송',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    const statusLabel = warningStatusToLabel[row.warningStatus ?? ''] ?? row.warningStatus ?? '정상';
    const dDayStr =
      row.dDay === null ? '' : row.dDay < 0 ? `D${Math.abs(row.dDay)}` : `+${row.dDay}일`;
    const customerTypeLabel = row.customerType ? (customerTypeMap.get(row.customerType) ?? row.customerType) : '';
    lines.push(
      [
        customerTypeLabel,
        row.companyName ?? row.ceo ?? '',
        row.ceo ?? '',
        row.supplierCompanyName ?? '',
        row.phone ?? '',
        formatDateForCsv(row.occurredDate),
        formatPaymentTerms(row.paymentTermsType, row.paymentTermsValue),
        formatDateForCsv(row.lastPaymentDueDate),
        dDayStr,
        statusLabel,
        row.balance,
        formatSalesManagerDisplay(row.salesManagerName, row.salesManagerEmail),
        row.smsExcluded ? '제외' : '활성',
      ].map(escapeCsvCell).join(',')
    );
  }
  return lines.join('\r\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 채권 상태 옵션
const warningStatusOptions = [
  { value: '__null__', label: '정상' },
  { value: 'EXCLUDED', label: '제외' },
  { value: 'WARNING_1ST', label: '1차 경고' },
  { value: 'WARNING_2ND', label: '2차 경고' },
  { value: 'WARNING_3RD', label: '3차 경고' },
  { value: 'MALICIOUS', label: '악성 채권' },
];

/** 계산 잔액(거래처관리대장 기준) — API: RECEIVABLE / ZERO / PREPAYMENT */
const balanceCategoryOptions = [
  { value: 'RECEIVABLE', label: '채권 (잔액 > 0)' },
  { value: 'ZERO', label: '0원' },
  { value: 'PREPAYMENT', label: '선수금 (잔액 < 0)' },
];

function ReceivablesPageContent() {
  const columnSettings = useColumnSettings('finance-receivables-v2');
  const [user, setUser] = React.useState<User | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState<string>('companyName');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [selectedWarningStatuses, setSelectedWarningStatuses] = React.useState<Set<string>>(
    new Set(warningStatusOptions.map((s) => s.value))
  ); // 기본값: 전체 선택
  const [selectedBalanceCategories, setSelectedBalanceCategories] = React.useState<Set<string>>(
    () => new Set(balanceCategoryOptions.map((o) => o.value))
  );
  const [ledgerDrawerOpen, setLedgerDrawerOpen] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
  const [selectedReceivableId, setSelectedReceivableId] = React.useState<string | null>(null);
  const [csvExporting, setCsvExporting] = React.useState(false);
  const [smsSendDrawerOpen, setSmsSendDrawerOpen] = React.useState(false);
  const [smsTargetAllCustomers, setSmsTargetAllCustomers] = React.useState<CustomerWithReceivable[]>([]);
  const [smsTargetLoading, setSmsTargetLoading] = React.useState(false);
  // 공급자 단일 선택: ''=전체, '0'=공급자 없음, 그 외=공급자 ID
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<string>('');
  // 고객 구분: __all__=전체, FARM=농가, DISTRIBUTION=유통
  const [selectedCustomerType, setSelectedCustomerType] = React.useState<string>('__all__');
  const [selectedSmsSenderId, setSelectedSmsSenderId] = React.useState<number | undefined>(undefined);
  const [smsSending, setSmsSending] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: suppliers } = useSuppliers({ status: true });
  const { data: customerTypeCodes } = useCodesByCategory('CUSTOMER_TYPE');
  const customerTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (customerTypeCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [customerTypeCodes]);
  const { data: smsSenders = [] } = useSmsSenders({ status: true });
  const { data: templates1st = [] } = useSmsTemplatesByType('RECEIVABLE_WARNING_1ST', undefined);
  const { data: templates2nd = [] } = useSmsTemplatesByType('RECEIVABLE_WARNING_2ND', undefined);
  const { data: templates3rd = [] } = useSmsTemplatesByType('RECEIVABLE_WARNING_3RD', undefined);
  const { data: templatesMalicious = [] } = useSmsTemplatesByType('RECEIVABLE_MALICIOUS', undefined);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const handleSortChange = (newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1); // 정렬 변경 시 첫 페이지로
  };

  // 선택된 채권 상태를 배열로 변환
  const selectedWarningStatusArray = React.useMemo(() => {
    // 전체 선택: 필터링하지 않음
    if (selectedWarningStatuses.size === warningStatusOptions.length) {
      return undefined;
    }
    // 전체 해제: 특별한 값으로 빈 배열을 표시 (axios가 빈 배열을 제대로 전달하지 않을 수 있음)
    if (selectedWarningStatuses.size === 0) {
      return ['__EMPTY__']; // 빈 배열을 나타내는 특별한 값
    }
    // 일부 선택: 선택된 상태만 반환
    return Array.from(selectedWarningStatuses).map((status) => {
      // __null__을 null로 변환
      return status === '__null__' ? null : status;
    });
  }, [selectedWarningStatuses]);

  const selectedBalanceCategoryArray = React.useMemo(() => {
    if (selectedBalanceCategories.size === balanceCategoryOptions.length) return undefined;
    if (selectedBalanceCategories.size === 0) return ['__EMPTY__'];
    return Array.from(selectedBalanceCategories);
  }, [selectedBalanceCategories]);

  const supplierIdsArray = React.useMemo(() => {
    if (!selectedSupplierId || selectedSupplierId === '') return undefined;
    if (selectedSupplierId === '0') return [0];
    const n = parseInt(selectedSupplierId, 10);
    return !Number.isNaN(n) && n > 0 ? [n] : undefined;
  }, [selectedSupplierId]);

  const queryParams = React.useMemo(() => ({
    search: search.trim() || undefined,
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
    warningStatus: selectedWarningStatusArray,
    balanceCategories: selectedBalanceCategoryArray,
    customerType: selectedCustomerType !== '__all__' ? selectedCustomerType : undefined,
    supplierIds: supplierIdsArray,
  }), [search, page, pageSize, sortBy, sortOrder, selectedWarningStatusArray, selectedBalanceCategoryArray, selectedCustomerType, supplierIdsArray]);

  const { data, isLoading } = useCustomersWithReceivables(queryParams);

  const updateSmsExcludedMutation = useUpdateSmsExcluded();

  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.lastPage ?? 1;

  // 필터 적용된 전체 채권 금액 합계 (페이지 구분 없음, API에서 반환)
  const totalBalance = data?.totalBalance ?? 0;

  // data 변경 감지 로그
  React.useEffect(() => {
    console.log('[SMS 체크박스] data 변경 감지:', {
      data: data ? {
        total: data.total,
        dataLength: data.data.length,
        customers: data.data.map(c => ({
          id: c.customerId,
          name: c.companyName,
          smsExcluded: c.smsExcluded,
        })),
      } : null,
      customers: customers.map(c => ({
        id: c.customerId,
        name: c.companyName,
        smsExcluded: c.smsExcluded,
      })),
      timestamp: new Date().toISOString(),
    });
  }, [data, customers]);

  const handleToggleSmsExcluded = async (customer: CustomerWithReceivable, e: React.MouseEvent) => {
    e.stopPropagation(); // 행 클릭 이벤트 방지
    try {
      await updateSmsExcludedMutation.mutateAsync({
        customerId: customer.customerId,
        smsExcluded: !customer.smsExcluded,
      });
      toast({
        title: '설정 변경 완료',
        description: customer.smsExcluded
          ? 'SMS 발송이 활성화되었습니다.'
          : 'SMS 발송이 제외되었습니다.',
      });
    } catch (error) {
      toast({
        title: '오류',
        description: 'SMS 발송 제외 설정 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const getWarningStatusBadge = (warningStatus: string | null) => {
    if (!warningStatus) {
      return <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-300">정상</Badge>;
    }
    const normalized = warningStatus.trim().toUpperCase();
    if (normalized === 'EXCLUDED') {
      return (
        <Badge variant="outline" className="border-gray-400 bg-gray-100 text-gray-600 dark:border-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
          제외
        </Badge>
      );
    }
    if (normalized === 'WARNING_1ST') {
      return (
        <Badge variant="outline" className="border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300">
          1차 경고
        </Badge>
      );
    }
    if (normalized === 'WARNING_2ND') {
      return (
        <Badge variant="outline" className="border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300">
          2차 경고
        </Badge>
      );
    }
    if (normalized === 'WARNING_3RD') {
      return (
        <Badge variant="outline" className="border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300">
          3차 경고
        </Badge>
      );
    }
    if (normalized === 'MALICIOUS') {
      return (
        <Badge variant="outline" className="border-red-600 bg-red-100 text-red-800 dark:border-red-500 dark:bg-red-950/50 dark:text-red-200">
          악성 채권
        </Badge>
      );
    }
    return <Badge variant="outline">{warningStatus}</Badge>;
  };

  const columns: ColumnDef<CustomerWithReceivable>[] = React.useMemo(
    () => [
      {
        accessorKey: 'customerType',
        header: '구분',
        enableSorting: false,
        cell: ({ row }) => customerTypeMap.get(row.original.customerType ?? '') ?? row.original.customerType ?? '-',
        size: 90,
      },
      {
        accessorKey: 'companyName',
        header: '회사명',
        enableSorting: true,
        cell: ({ row }) => row.original.companyName || row.original.ceo || '-',
        size: 200,
      },
      {
        accessorKey: 'ceo',
        header: '대표자',
        enableSorting: true,
        cell: ({ row }) => row.original.ceo || '-',
        size: 150,
      },
      {
        accessorKey: 'supplierCompanyName',
        header: '공급자',
        enableSorting: false,
        cell: ({ row }) => row.original.supplierCompanyName || '-',
        size: 140,
      },
      {
        accessorKey: 'phone',
        header: '전화번호',
        enableSorting: true,
        cell: ({ row }) => {
          const phone = row.original.phone;
          if (!phone) return '-';
          const digits = phone.replace(/[^0-9]/g, '');
          if (digits.startsWith('02')) {
            return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
          } else if (digits.length > 10) {
            return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
          } else if (digits.length > 7) {
            return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
          }
          return phone;
        },
        size: 150,
      },
      {
        accessorKey: 'occurredDate',
        header: '명세서 발행일',
        enableSorting: true,
        cell: ({ row }) => {
          const date = row.original.occurredDate;
          if (!date) return '-';
          try {
            const d = new Date(date);
            return d.toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            });
          } catch {
            return date;
          }
        },
        size: 120,
      },
      {
        accessorKey: 'paymentTerms',
        header: '결제조건',
        enableSorting: false,
        cell: ({ row }) => {
          const type = row.original.paymentTermsType;
          const value = row.original.paymentTermsValue;
          
          if (!type) return '-';
          
          const typeLabels: Record<string, string> = {
            DAYS: '일수',
            THIS_MONTH_DAY: '이번달 N일',
            NEXT_MONTH_DAY: '다음달 N일',
            THIS_MONTH_END: '이번달 마지막일',
            NEXT_MONTH_END: '다음달 마지막일',
          };
          
          const label = typeLabels[type] || type;
          
          if (type === 'THIS_MONTH_END' || type === 'NEXT_MONTH_END') {
            return label;
          }
          
          if (value !== null && value !== undefined) {
            return `${label} (${value})`;
          }
          
          return label;
        },
        size: 150,
      },
      {
        accessorKey: 'lastPaymentDueDate',
        header: '결제조건일',
        enableSorting: false,
        cell: ({ row }) => {
          const date = row.original.lastPaymentDueDate;
          if (!date) return '-';
          try {
            const d = new Date(date);
            return d.toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            });
          } catch {
            return date;
          }
        },
        size: 120,
      },
      {
        accessorKey: 'daysElapsed',
        header: '경과일',
        enableSorting: false,
        cell: ({ row }) => {
          const dDay = row.original.dDay;
          if (dDay === null) return '-';
          
          if (dDay < 0) {
            // 아직 안 지남 (D-DAY)
            return (
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                D{Math.abs(dDay)}
              </span>
            );
          } else {
            // 지난 일수
            return (
              <span className="text-red-600 dark:text-red-400 font-medium">
                +{dDay}일
              </span>
            );
          }
        },
        size: 100,
      },
      {
        accessorKey: 'warningStatus',
        header: '채권 상태',
        enableSorting: true,
        cell: ({ row }) => getWarningStatusBadge(row.original.warningStatus),
        size: 130,
      },
      {
        accessorKey: 'balance',
        header: '현재 잔액',
        enableSorting: true,
        cell: ({ row }) => {
          const balance = row.original.balance ?? 0;
          const isPositive = balance > 0; // 양수는 미수금 (나쁜 것)
          const isNegative = balance < 0; // 음수는 선수금/과납 (좋은 것)
          return (
            <span
              className={
                isPositive
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : isNegative
                    ? 'text-green-600 dark:text-green-400'
                    : ''
              }
            >
              {Number(balance).toLocaleString('ko-KR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'salesManagerName',
        header: '영업 담당자',
        enableSorting: true,
        cell: ({ row }) => {
          const o = row.original;
          const text = formatSalesManagerDisplay(o.salesManagerName, o.salesManagerEmail);
          return (
            <span className="text-foreground/90 break-words" title={text !== '—' ? text : undefined}>
              {text}
            </span>
          );
        },
        size: 200,
      },
      {
        accessorKey: 'smsExcluded',
        header: 'SMS 발송',
        enableSorting: false,
        cell: ({ row }) => {
          const customer = row.original;
          const isExcluded = customer.smsExcluded;
          return (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => handleToggleSmsExcluded(customer, e)}
              disabled={updateSmsExcludedMutation.isPending}
              title={isExcluded ? 'SMS 발송 제외됨 (클릭하여 활성화)' : 'SMS 발송 활성화됨 (클릭하여 제외)'}
            >
              {isExcluded ? (
                <MessageSquareOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <MessageSquare className="h-4 w-4 text-green-600 dark:text-green-400" />
              )}
            </Button>
          );
        },
        size: 100,
      },
    ],
    [customerTypeMap, updateSmsExcludedMutation],
  );

  const handleRowClick = (customer: CustomerWithReceivable) => {
    setSelectedCustomerId(customer.customerId);
    setSelectedReceivableId(customer.receivableId);
    setLedgerDrawerOpen(true);
  };

  const handleCsvDownload = async () => {
    if (total === 0) {
      toast({ title: '다운로드', description: '내보낼 데이터가 없습니다.', variant: 'destructive' });
      return;
    }
    setCsvExporting(true);
    try {
      const baseParams = {
        search: queryParams.search,
        sortBy: queryParams.sortBy,
        sortOrder: queryParams.sortOrder,
        warningStatus: queryParams.warningStatus,
        balanceCategories: queryParams.balanceCategories,
        supplierIds: queryParams.supplierIds,
      };
      const pageSize = 100;
      const maxExport = Math.min(total, 10000);
      let allData: CustomerWithReceivable[] = [];
      let page = 1;

      while (allData.length < maxExport) {
        const { data: res } = await api.get<{
          data: CustomerWithReceivable[];
          total: number;
        }>('/receivables/customers/with-receivables', {
          params: { ...baseParams, page, limit: pageSize },
          paramsSerializer: serializeReceivablesParams,
        });
        const list = res?.data ?? [];
        allData = allData.concat(list);
        if (list.length < pageSize) break;
        page += 1;
      }

      const list = allData.slice(0, maxExport);
      const csv = customersToCsv(list, customerTypeMap);
      const filename = `채권현황_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCsv(csv, filename);
      toast({ title: '다운로드 완료', description: `${list.length}건 CSV로 저장되었습니다.` });
    } catch (e) {
      toast({
        title: '다운로드 실패',
        description: e instanceof Error ? e.message : 'CSV 다운로드 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setCsvExporting(false);
    }
  };

  // Drawer 열릴 때 필터 기준 전체 대상 로드 (페이지 구분 없음) + 발송 API와 동일 조건 유지
  const baseFilterParams = React.useMemo(
    () => ({
      search: queryParams.search,
      sortBy: queryParams.sortBy,
      sortOrder: queryParams.sortOrder,
      warningStatus: queryParams.warningStatus,
      balanceCategories: queryParams.balanceCategories,
      supplierIds: queryParams.supplierIds,
      customerType: queryParams.customerType,
    }),
    [
      queryParams.search,
      queryParams.sortBy,
      queryParams.sortOrder,
      queryParams.warningStatus,
      queryParams.balanceCategories,
      queryParams.supplierIds,
      queryParams.customerType,
    ]
  );

  React.useEffect(() => {
    if (!smsSendDrawerOpen) {
      setSmsTargetAllCustomers([]);
      return;
    }
    let cancelled = false;
    setSmsTargetLoading(true);
    const loadAll = async () => {
      const pageSize = 100;
      const maxFetch = 10000;
      let allData: CustomerWithReceivable[] = [];
      let page = 1;
      try {
        while (allData.length < maxFetch) {
          const { data: res } = await api.get<{
            data: CustomerWithReceivable[];
            total: number;
          }>('/receivables/customers/with-receivables', {
            params: { ...baseFilterParams, page, limit: pageSize },
            paramsSerializer: serializeReceivablesParams,
          });
          const list = res?.data ?? [];
          if (cancelled) return;
          allData = allData.concat(list);
          if (list.length < pageSize) break;
          page += 1;
        }
        if (!cancelled) setSmsTargetAllCustomers(allData);
      } finally {
        if (!cancelled) setSmsTargetLoading(false);
      }
    };
    loadAll();
    return () => {
      cancelled = true;
    };
  }, [smsSendDrawerOpen, baseFilterParams]);

  React.useEffect(() => {
    if (!smsSendDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setSmsSendDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [smsSendDrawerOpen]);

  // 전체 필터 결과 기준 발송 대상: SMS 제외 아님 + 경고 상태(1차/2차/3차/악성)만 (정상·제외는 발송 안 함)
  const WARNING_STATUSES = ['WARNING_1ST', 'WARNING_2ND', 'WARNING_3RD', 'MALICIOUS'];
  const smsTargetSummary = React.useMemo(() => {
    const eligible = smsTargetAllCustomers.filter(
      (c) => !c.smsExcluded && c.warningStatus && WARNING_STATUSES.includes(c.warningStatus)
    );
    const byStatus: Record<string, number> = {
      '1차 경고': 0,
      '2차 경고': 0,
      '3차 경고': 0,
      '악성 채권': 0,
    };
    for (const c of eligible) {
      const label = warningStatusToLabel[c.warningStatus ?? ''] ?? '';
      if (label && byStatus[label] !== undefined) byStatus[label]++;
    }
    return { total: eligible.length, byStatus };
  }, [smsTargetAllCustomers]);

  const smsTargetEligibleList = React.useMemo(() => {
    return smsTargetAllCustomers.filter(
      (c) => !c.smsExcluded && c.warningStatus && WARNING_STATUSES.includes(c.warningStatus)
    );
  }, [smsTargetAllCustomers]);

  const formatPhone = (phone?: string | null): string => {
    if (!phone) return '-';
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('02')) {
      if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return phone;
  };

  // 채권 경고 SMS 템플릿 맵 (경고 상태 → 템플릿 content)
  const receivableTemplatesByStatus = React.useMemo(() => {
    const getFirst = (arr: { content?: string }[]) => (arr?.length ? arr[0]?.content : null);
    return {
      WARNING_1ST: getFirst(templates1st),
      WARNING_2ND: getFirst(templates2nd),
      WARNING_3RD: getFirst(templates3rd),
      MALICIOUS: getFirst(templatesMalicious),
    };
  }, [templates1st, templates2nd, templates3rd, templatesMalicious]);

  const replaceReceivableTokens = React.useCallback((template: string, c: CustomerWithReceivable): string => {
    const { customerCompanyName, customerName } = getSmsAddresseeTokens({
      companyName: c.companyName,
      ceo: c.ceo,
    });
    const issuedDate = c.occurredDate
      ? format(new Date(c.occurredDate), 'yyyy-MM-dd', { locale: ko })
      : c.lastPaymentDueDate
        ? format(new Date(c.lastPaymentDueDate), 'yyyy-MM-dd', { locale: ko })
        : format(new Date(), 'yyyy-MM-dd', { locale: ko });
    const formattedBalance = new Intl.NumberFormat('ko-KR').format(c.balance ?? 0);
    const warningLevel = warningStatusToLabel[c.warningStatus ?? ''] ?? '';
    return normalizeSmsGreetingLineBreaks(
      template
        .replace(/{customerName}/g, customerName)
        .replace(/{customerCompanyName}/g, customerCompanyName)
        .replace(/{invoiceNumber}/g, '')
        .replace(/{issuedDate}/g, issuedDate)
        .replace(/{receivableAmount}/g, formattedBalance)
        .replace(/{outstandingAmount}/g, formattedBalance)
        .replace(/{balance}/g, formattedBalance)
        .replace(/{warningLevel}/g, warningLevel),
    );
  }, []);

  // 더블클릭·드래그로 텍스트 선택 가능하도록 (inbound drawer와 동일)
  const handleSmsDrawerPointerDown = React.useCallback((e: React.PointerEvent) => {
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

  const handleSmsDrawerDoubleClick = React.useCallback((e: React.MouseEvent) => {
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

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">채권관리</h1>
            <p className="text-muted-foreground">
              미수금이 있는 거래처(고객)별 채권 현황을 조회할 수 있습니다.
            </p>
          </div>
          <Button
            onClick={() => setSmsSendDrawerOpen(true)}
            disabled={total === 0}
          >
            <Send className="mr-2 h-4 w-4" />
            채권 경고 문자 발송
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={customers}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          manualPagination
          page={data?.page ?? 1}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(v) => {
            setPageSize(v);
            setPage(1);
          }}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          showRowNumber
          rowClassName="h-10"
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          filterControls={
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  고객 검색
                </Label>
                <Input
                  type="text"
                  placeholder="회사명 또는 대표자명으로 검색..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-40 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  구분
                </Label>
                <Select
                  value={selectedCustomerType}
                  onValueChange={(v) => {
                    setSelectedCustomerType(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {(customerTypeCodes ?? []).map((code) => {
                      const key = (code.value ?? code.name ?? '').trim();
                      if (!key) return null;
                      return (
                        <SelectItem key={key} value={key}>
                          {code.name ?? code.value ?? key}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  공급자
                </Label>
                <Select
                  value={selectedSupplierId || 'all'}
                  onValueChange={(v) => {
                    setSelectedSupplierId(v === 'all' ? '' : v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="0">공급자 없음</SelectItem>
                    {suppliers?.map((supplier) => (
                      <SelectItem key={supplier.id} value={String(supplier.id)}>
                        {supplier.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  잔액 구간
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-44 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {selectedBalanceCategories.size === balanceCategoryOptions.length
                        ? '전체'
                        : selectedBalanceCategories.size === 0
                          ? '선택 안됨'
                          : `${selectedBalanceCategories.size}개 선택`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <Checkbox
                            id="balance-category-filter-all"
                            checked={selectedBalanceCategories.size === balanceCategoryOptions.length}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedBalanceCategories(new Set(balanceCategoryOptions.map((o) => o.value)));
                              } else {
                                setSelectedBalanceCategories(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label
                            htmlFor="balance-category-filter-all"
                            className="text-sm font-medium cursor-pointer flex-1"
                          >
                            전체
                          </Label>
                        </div>
                        {balanceCategoryOptions.map((opt) => (
                          <div
                            key={opt.value}
                            className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                          >
                            <Checkbox
                              id={`balance-category-filter-${opt.value}`}
                              checked={selectedBalanceCategories.has(opt.value)}
                              onCheckedChange={(checked: boolean) => {
                                const next = new Set(selectedBalanceCategories);
                                if (checked) next.add(opt.value);
                                else next.delete(opt.value);
                                setSelectedBalanceCategories(next);
                                setPage(1);
                              }}
                            />
                            <Label
                              htmlFor={`balance-category-filter-${opt.value}`}
                              className="text-sm font-medium cursor-pointer flex-1"
                            >
                              {opt.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  채권 상태
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {selectedWarningStatuses.size === warningStatusOptions.length
                        ? '전체'
                        : selectedWarningStatuses.size === 0
                        ? '선택 안됨'
                        : `${selectedWarningStatuses.size}개 선택됨`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="start">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <Checkbox
                            id="warning-status-filter-all"
                            checked={selectedWarningStatuses.size === warningStatusOptions.length}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedWarningStatuses(new Set(warningStatusOptions.map((s) => s.value)));
                              } else {
                                setSelectedWarningStatuses(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label
                            htmlFor="warning-status-filter-all"
                            className="text-sm font-medium cursor-pointer flex-1"
                          >
                            전체
                          </Label>
                        </div>
                        {warningStatusOptions.map((status) => (
                          <div
                            key={status.value}
                            className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                          >
                            <Checkbox
                              id={`warning-status-filter-${status.value}`}
                              checked={selectedWarningStatuses.has(status.value)}
                              onCheckedChange={(checked: boolean) => {
                                const newStatuses = new Set(selectedWarningStatuses);
                                if (checked) {
                                  newStatuses.add(status.value);
                                } else {
                                  newStatuses.delete(status.value);
                                }
                                setSelectedWarningStatuses(newStatuses);
                                setPage(1);
                              }}
                            />
                            <Label
                              htmlFor={`warning-status-filter-${status.value}`}
                              className="text-sm font-medium cursor-pointer flex-1"
                            >
                              {status.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleCsvDownload}
                disabled={csvExporting || total === 0}
              >
                {csvExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5" />
                )}
                CSV 다운로드
              </Button>
            </div>
          }
          headerRightContent={
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">총 채권 금액</div>
              <div className="text-sm font-semibold">
                {totalBalance >= 0 ? (
                  <span className="text-red-600 dark:text-red-400">
                    {totalBalance.toLocaleString('ko-KR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                ) : (
                  <span className="text-green-600 dark:text-green-400">
                    {totalBalance.toLocaleString('ko-KR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                )}
                <span className="text-xs font-normal text-muted-foreground ml-1">원</span>
              </div>
            </div>
          }
        />

        <Drawer
          open={smsSendDrawerOpen}
          onOpenChange={setSmsSendDrawerOpen}
          direction="right"
          dismissible={false}
        >
          <DrawerContent
            className="h-full flex flex-col"
            style={{
              width: '520px',
              maxWidth: '92vw',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
            onPointerDown={handleSmsDrawerPointerDown}
            onDoubleClick={handleSmsDrawerDoubleClick}
          >
            <DrawerHeader className="border-b">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <DrawerTitle>채권 경고 문자 발송</DrawerTitle>
                  <DrawerDescription>
                    1차/2차/3차/악성 채권 상태인 대상만 발송합니다. SMS 제외가 아니며 채권 경고 상태인 고객에게만 전송됩니다.
                  </DrawerDescription>
                </div>
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setSmsSendDrawerOpen(false)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">닫기</span>
                  </Button>
                </DrawerClose>
              </div>
            </DrawerHeader>
            <div
              className="flex-1 flex flex-col min-h-0 px-4 overflow-hidden"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              onDoubleClick={handleSmsDrawerDoubleClick}
            >
              <div className="flex flex-col flex-1 min-h-0 pt-6 pb-6 space-y-4">
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3 shrink-0">
                  <div className="text-sm font-medium">발송 대상 요약 (필터 전체 기준)</div>
                  {smsTargetLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>로딩 중...</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl font-semibold">
                        총 <span className="text-primary">{smsTargetSummary.total}</span>명
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        {Object.entries(smsTargetSummary.byStatus)
                          .filter(([, n]) => n > 0)
                          .map(([label, n]) => (
                            <span key={label}>
                              {label}: {n}명
                            </span>
                          ))}
                        {smsTargetSummary.total === 0 && <span>발송 대상 없음 (1차/2차/3차/악성 채권만)</span>}
                      </div>
                    </>
                  )}
                </div>

                {/* 발신자 선택 */}
                <div className="space-y-2 shrink-0">
                  <Label className="text-sm font-medium">발신자</Label>
                  <Select
                    value={selectedSmsSenderId ? String(selectedSmsSenderId) : ''}
                    onValueChange={(v) => {
                      if (v && v !== 'null') setSelectedSmsSenderId(Number(v));
                      else setSelectedSmsSenderId(undefined);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="SMS 발신자를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {smsSenders.length === 0 ? (
                        <SelectItem value="null" disabled>
                          SMS 발신자가 없습니다 (SMS 발신자 관리에서 등록)
                        </SelectItem>
                      ) : (
                        smsSenders.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name} ({formatPhone(s.phone)})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* 발송 대상 목록 (아코디언) - 세로 전체 영역 사용 */}
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                  <div className="text-sm font-medium shrink-0">발송 대상 목록</div>
                  {smsTargetLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2 shrink-0">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>로딩 중...</span>
                    </div>
                  ) : smsTargetEligibleList.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2 shrink-0">발송 대상이 없습니다.</p>
                  ) : (
                    <ScrollArea className="flex-1 min-h-0 pr-3">
                      <div className="space-y-2">
                        {smsTargetEligibleList.slice(0, 50).map((c) => {
                          const templateContent = c.warningStatus
                            ? receivableTemplatesByStatus[c.warningStatus as keyof typeof receivableTemplatesByStatus]
                            : null;
                          const messagePreview = templateContent
                            ? replaceReceivableTokens(templateContent, c)
                            : '(템플릿 미등록)';
                          return (
                            <Collapsible key={`${c.customerId}-${c.receivableId}`} defaultOpen={false} className="group">
                              <div className="rounded border overflow-hidden bg-background">
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-2 py-2 px-3 text-left hover:bg-muted/50 transition-colors text-sm"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                                      <span className="truncate" title={c.companyName || c.ceo || ''}>
                                        {c.companyName || c.ceo || '-'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-muted-foreground text-xs">
                                        {formatPhone(c.phone)}
                                      </span>
                                      {getWarningStatusBadge(c.warningStatus)}
                                    </div>
                                  </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="border-t px-3 py-2 bg-muted/20">
                                    <div className="text-xs text-muted-foreground mb-1">발송될 문자 내용</div>
                                    <div className="text-sm whitespace-pre-wrap rounded border bg-background p-2">
                                      {messagePreview}
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })}
                        {smsTargetEligibleList.length > 50 && (
                          <p className="text-xs text-muted-foreground py-2">
                            외 {smsTargetEligibleList.length - 50}명
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </div>
            <DrawerFooter className="border-t border-border">
              <div className="flex justify-end gap-2">
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSmsSendDrawerOpen(false)}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
                <Button
                  type="button"
                  disabled={!selectedSmsSenderId || smsTargetSummary.total === 0 || smsSending}
                  onClick={async () => {
                    if (!selectedSmsSenderId || smsSending) return;
                    setSmsSending(true);
                    try {
                      const res = await api.post<{
                        success: boolean;
                        sentCount: number;
                        failCount: number;
                        results: Array<{ customerId: string; companyName: string | null; success: boolean; error?: string }>;
                      }>('/receivables/send-warning-sms', {
                        senderId: selectedSmsSenderId,
                        search: baseFilterParams.search || undefined,
                        sortBy: baseFilterParams.sortBy || undefined,
                        sortOrder: baseFilterParams.sortOrder || undefined,
                        balanceCategories: baseFilterParams.balanceCategories,
                        supplierIds: baseFilterParams.supplierIds,
                        warningStatus: baseFilterParams.warningStatus,
                        customerType: baseFilterParams.customerType || undefined,
                      });
                      const data = res.data;
                      if (data.sentCount > 0) {
                        queryClient.invalidateQueries({ queryKey: ['receivables'] });
                        queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
                        queryClient.invalidateQueries({ queryKey: ['aligo', 'balance'] });
                        queryClient.invalidateQueries({ queryKey: ['aligo', 'sms-list'] });
                        setSmsSendDrawerOpen(false);
                        toast({
                          title: '발송 완료',
                          description: `${data.sentCount}건 발송 성공${data.failCount > 0 ? `, ${data.failCount}건 실패` : ''}`,
                        });
                      }
                      if (data.failCount > 0 && data.sentCount === 0) {
                        toast({
                          title: '발송 실패',
                          description: data.results?.[0]?.error || '모든 발송이 실패했습니다.',
                          variant: 'destructive',
                        });
                      }
                    } catch (e: any) {
                      toast({
                        title: '발송 실패',
                        description: e?.response?.data?.message || e?.message || '채권 경고 문자 발송 중 오류가 발생했습니다.',
                        variant: 'destructive',
                      });
                    } finally {
                      setSmsSending(false);
                    }
                  }}
                >
                  {smsSending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      발송 중...
                    </>
                  ) : (
                    <>
                      <Send className="mr-1.5 h-4 w-4" />
                      발송 ({smsTargetSummary.total}명)
                    </>
                  )}
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <CustomerLedgerDrawer
          open={ledgerDrawerOpen}
          onOpenChange={(open) => {
            setLedgerDrawerOpen(open);
            if (!open) {
              setSelectedCustomerId(null);
              setSelectedReceivableId(null);
            }
          }}
          customerId={selectedCustomerId}
          receivableId={selectedReceivableId}
        />
      </div>
    </AppLayout>
  );
}

export default function ReceivablesPage() {
  return (
    <Suspense
      fallback={
        <AppLayout user={null}>
          <div className="flex items-center justify-center p-12">
            <div className="text-muted-foreground">로딩 중…</div>
          </div>
        </AppLayout>
      }
    >
      <ReceivablesPageContent />
    </Suspense>
  );
}
