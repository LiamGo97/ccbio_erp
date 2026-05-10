'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { Loader2, FileText, Plus, Filter, RefreshCw, XCircle, EyeOff, Eye, FileDown, ClipboardList } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { LogisticsManagementDataTable } from '@/components/logistics/logistics-management-data-table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import {
  TradeOrder,
  useTradeOrders,
  useDeleteTradeOrder,
  formatOrderSequence,
} from '@/lib/hooks/use-trade-orders';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { BookingDetailDrawer } from '@/components/logistics/booking-detail-drawer';
import { DocumentsProcessingDetailDrawer } from '@/components/logistics/documents-processing-detail-drawer';
import { DoProcessingDetailDrawer } from '@/components/logistics/do-processing-detail-drawer';
import { CustomsProcessingDetailDrawer } from '@/components/logistics/customs-processing-detail-drawer';
import { BookingFormDrawer } from '@/components/booking/booking-form-drawer';
import { DocumentsProcessingFormDrawer } from '@/components/trade-order/documents-processing-form-drawer';
import { DoProcessingFormDrawer } from '@/components/logistics/do-processing-form-drawer';
import { CustomsProcessingFormDrawer } from '@/components/logistics/customs-processing-form-drawer';
import { useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';
import { useToast } from '@/components/ui/use-toast';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useUsers } from '@/lib/hooks/use-users';

// 쿠키에서 페이지당 행수 읽기
const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) {
      return parsed;
    }
  }
  return 20;
};

// 쿠키에서 무역 권한 등록자 ID 읽기
const getInitialTradeManagerUserId = () => {
  if (typeof window === 'undefined') return '__all__';
  const saved = Cookies.get('trade-manager-user-id');
  return saved || '__all__';
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

/** 날짜만 표시, 연도 2자리 (예: 26. 03. 04) */
const formatDateShortYear = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
};

/** ISO 문자열이 타임존 없이 오면 UTC로 간주 (백엔드가 Z 미포함 시 06:09 UTC가 로컬 06:09로 해석되는 문제 방지) */
const parseAsUtcIfNeeded = (value: string): string => {
  const s = String(value).trim();
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (isIsoLike && !hasTimezone) {
    return s.replace(/\.\d{3}$/, '') + 'Z';
  }
  return s;
};

/** BK/BL 중복 검사 API 응답 */
type BkBlDupOrderRow = {
  id: string;
  contractNo: string | null;
  sequence: number;
  sequenceSub: number;
  bk: string | null;
  bl: string | null;
  tradeStatus: string | null;
};

type BkBlDupReport = {
  duplicateBkGroups: Array<{ normalizedValue: string; orders: BkBlDupOrderRow[] }>;
  duplicateBlGroups: Array<{ normalizedValue: string; orders: BkBlDupOrderRow[] }>;
  crossFieldGroups: Array<{
    normalizedValue: string;
    asBkOrders: BkBlDupOrderRow[];
    asBlOrders: BkBlDupOrderRow[];
  }>;
  scannedOrderCount: number;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(parseAsUtcIfNeeded(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** ETA가 오늘부터 7일 이내인지 여부 */
const isEtaWithinOneWeek = (etaDate?: string | null): boolean => {
  if (!etaDate) return false;
  const eta = new Date(etaDate);
  if (Number.isNaN(eta.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const etaMidnight = new Date(eta);
  etaMidnight.setHours(0, 0, 0, 0);
  const oneWeekFromNow = new Date(today);
  oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
  return etaMidnight >= today && etaMidnight <= oneWeekFromNow;
};

/** 수정일시가 현재시간 5분 이내인지 여부 */
const isUpdatedWithin5Minutes = (updatedAt?: string | null): boolean => {
  if (!updatedAt) return false;
  const updated = new Date(parseAsUtcIfNeeded(updatedAt));
  if (Number.isNaN(updated.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  return diffMs >= 0 && diffMs <= 5 * 60 * 1000; // 5분 = 5 * 60 * 1000 ms
};

/** 물류 목록 「상품 비용」 미니 테이블 — 정식 payments / 임시 bookingTempPayments 공통 */
type LogisticsPaymentLine = {
  dueDate?: string | null;
  ratio?: number | null;
  amount?: number | null;
  result?: string | null;
};

function LogisticsPaymentMiniTable({
  sortedPayments,
  shipBack,
}: {
  sortedPayments: LogisticsPaymentLine[];
  shipBack: boolean;
}) {
  const getPaymentResultBadge = (result?: string | null) => {
    const shipBackClass = shipBack ? 'line-through' : '';
    if (!result) {
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
            shipBackClass,
          )}
        >
          미결제
        </Badge>
      );
    }
    const normalizedResult = result.trim().toUpperCase();
    if (normalizedResult === 'COMPLETED') {
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
            shipBackClass,
          )}
        >
          완료
        </Badge>
      );
    }
    if (normalizedResult === 'PENDING' || normalizedResult === 'PROCESSING') {
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300',
            shipBackClass,
          )}
        >
          진행중
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className={cn(
          'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
          shipBackClass,
        )}
      >
        {result}
      </Badge>
    );
  };

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader
          className={cn(shipBack && '[text-decoration:none] [&_*]:[text-decoration:none]')}
        >
          <TableRow
            className={cn(
              'bg-muted/50 hover:bg-muted/50 border-b border-border',
              shipBack && '[text-decoration:none] [&_*]:[text-decoration:none]',
            )}
          >
            <TableHead className="min-w-[90px] font-semibold text-foreground">
              {shipBack ? <span style={{ textDecoration: 'none' }}>결제 예정일</span> : '결제 예정일'}
            </TableHead>
            <TableHead className="min-w-[60px] font-semibold text-foreground text-right">
              {shipBack ? <span style={{ textDecoration: 'none' }}>비율</span> : '비율'}
            </TableHead>
            <TableHead className="min-w-[90px] font-semibold text-foreground text-right">
              {shipBack ? <span style={{ textDecoration: 'none' }}>송장금액</span> : '송장금액'}
            </TableHead>
            <TableHead className="min-w-[60px] font-semibold text-foreground text-right">
              {shipBack ? <span style={{ textDecoration: 'none' }}>TT 결과</span> : 'TT 결과'}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPayments.map((payment, idx) => (
            <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
              <TableCell>{formatDateShortYear(payment.dueDate)}</TableCell>
              <TableCell className="text-right">
                {payment.ratio !== null && payment.ratio !== undefined
                  ? `${Number(payment.ratio).toFixed(1)}%`
                  : '-'}
              </TableCell>
              <TableCell className="text-right">
                {payment.amount !== null && payment.amount !== undefined
                  ? Number(payment.amount).toLocaleString('ko-KR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : '-'}
              </TableCell>
              <TableCell className="text-right">{getPaymentResultBadge(payment.result)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LogisticsManagementPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [bookingFormDrawerOpen, setBookingFormDrawerOpen] = React.useState(false);
  const [bookingEditId, setBookingEditId] = React.useState<string | null>(null);
  const [selectedTradeOrderId, setSelectedTradeOrderId] = React.useState<string | null>(null);
  const [selectedTradeOrder, setSelectedTradeOrder] = React.useState<TradeOrder | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [selectedProducts, setSelectedProducts] = React.useState<Set<string>>(new Set());
  const productDefaultAppliedRef = React.useRef(false);
  const [selectedStatuses, setSelectedStatuses] = React.useState<Set<string>>(new Set(['BOOKING', 'DOCUMENTS', 'DO'])); // 기본값: 통관 제외 (CUSTOMS 미선택)
  const [selectedManagerUserId, setSelectedManagerUserId] = React.useState<string>(getInitialTradeManagerUserId);
  const [contractNo, setContractNo] = React.useState<string>('');
  const [selectedExporters, setSelectedExporters] = React.useState<Set<string>>(new Set());
  const exporterDefaultAppliedRef = React.useRef(false);
  const [etaUpdateConfirmOpen, setEtaUpdateConfirmOpen] = React.useState(false);
  const [etaUpdateLoading, setEtaUpdateLoading] = React.useState(false);
  const [excelExportLoading, setExcelExportLoading] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<string>('orderDate');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  // 날짜 기간 검색 (UI만, 필터 로직은 추후 연동)
  const [dateFilterType, setDateFilterType] = React.useState<'etd' | 'eta' | 'quarantine' | 'customs' | ''>('');
  const [dateRangeStart, setDateRangeStart] = React.useState<Date | undefined>(undefined);
  const [dateRangeEnd, setDateRangeEnd] = React.useState<Date | undefined>(undefined);
  /** 제외된 주문 포함 여부 (켜면 includeExcluded=true로 API 호출 → 제외된 항목도 표시, 제외 해제 가능) */
  const [includeExcluded, setIncludeExcluded] = React.useState(false);
  const [excludeActionLoading, setExcludeActionLoading] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [tradeOrderToDelete, setTradeOrderToDelete] = React.useState<TradeOrder | null>(null);
  const [bkBlDupDialogOpen, setBkBlDupDialogOpen] = React.useState(false);
  const [bkBlDupLoading, setBkBlDupLoading] = React.useState(false);
  const [bkBlDupReport, setBkBlDupReport] = React.useState<BkBlDupReport | null>(null);
  const queryClient = useQueryClient();
  const deleteOrderMutation = useDeleteTradeOrder();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  // 재무 상태 코드 마스터 조회
  const { data: financeStatusCodes = [] } = useCodeMastersByGroup('FINANCE_STATUS');
  
  // 결제 결과 코드 마스터 조회
  const { data: paymentResultCodes = [] } = useCodeMastersByGroup('PAYMENT_RESULT');

  // 무역 상태 코드 마스터 조회
  const { data: tradeStatusCodes = [] } = useCodeMastersByGroup('TRADE_ORDER_STATUS');
  const { data: exporterCodes = [] } = useCodeMastersByGroup('EXPORTER');

  // 등록자 목록 조회 (무역팀 권한이 있는 활성 사용자만)
  const { data: usersResponse } = useUsers({ status: 'active', limit: 1000 });
  const availableUsers = React.useMemo(() => {
    if (!usersResponse?.data) return [];
    // 무역팀 권한(ROLE_TRADE)이 있는 사용자만 필터링
    return usersResponse.data.filter((user) => {
      if (!user.roles || user.roles.length === 0) return false;
      return user.roles.some((role) => role.code === 'ROLE_TRADE');
    });
  }, [usersResponse]);

  // 쿠키에서 읽어온 등록자 ID가 유효한지 확인하고 초기화
  React.useEffect(() => {
    if (availableUsers.length > 0 && selectedManagerUserId !== '__all__') {
      const savedUserId = parseInt(selectedManagerUserId, 10);
      const isValidUser = availableUsers.some((user) => user.id === savedUserId);
      if (!isValidUser) {
        // 저장된 사용자가 더 이상 유효하지 않으면 전체로 초기화
        setSelectedManagerUserId('__all__');
        Cookies.set('trade-manager-user-id', '__all__', { expires: 365 });
      }
    }
  }, [availableUsers, selectedManagerUserId]);

  // 코드 이름 가져오기 헬퍼 함수
  const getFinanceStatusName = (value?: string | null) => {
    if (!value) return null;
    const code = financeStatusCodes.find(
      (c) => c.value && c.value.trim().toUpperCase() === value.trim().toUpperCase()
    );
    return code?.name || value;
  };
  
  // 결제 결과 이름 가져오기 헬퍼 함수
  const getPaymentResultName = (value?: string | null) => {
    if (!value) return null;
    const code = paymentResultCodes.find(
      (c) => c.value && c.value.trim().toUpperCase() === value.trim().toUpperCase()
    );
    return code?.name || value;
  };

  // 코드명(영문)이 아닌 표시 이름용 fallback (코드 마스터에 없을 때) - 이미지 기준 DO 등 짧게 표시
  const TRADE_STATUS_NAME_FALLBACK: Record<string, string> = {
    BOOKING: '부킹',
    DOCUMENTS: '서류처리',
    DO: 'DO',
    ARRIVED: '입고',
    QUARANTINE: '격리완료',
    CUSTOMS: '통관',
    COMPLETED: '완료',
  };

  const getTradeStatusName = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    const code = tradeStatusCodes.find(
      (c) => c.value && c.value.trim().toUpperCase() === normalized
    );
    return code?.name || TRADE_STATUS_NAME_FALLBACK[normalized] || value;
  };

  // 상태 옵션 (부킹, 서류처리, DO처리, 통관처리) - ARRIVED, QUARANTINE, COMPLETED 제외
  const statusOptions = React.useMemo(() => {
    const statusOrder = ['BOOKING', 'DOCUMENTS', 'DO', 'CUSTOMS'];
    return statusOrder.map((status) => {
      const code = tradeStatusCodes.find(
        (c) => c.value && c.value.trim().toUpperCase() === status.toUpperCase()
      );
      return {
        value: status,
        label: code?.name || TRADE_STATUS_NAME_FALLBACK[status] || status,
      };
    });
  }, [tradeStatusCodes]);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // URL 쿼리 파라미터에서 계약번호, 날짜 필터 읽기
  React.useEffect(() => {
    const contractNoParam = searchParams.get('contractNo');
    if (contractNoParam) {
      setContractNo(contractNoParam);
    }
    const dateTypeParam = searchParams.get('dateType') as 'etd' | 'eta' | 'quarantine' | 'customs' | null;
    const dateFromParam = searchParams.get('dateFrom');
    const dateToParam = searchParams.get('dateTo');
    if (dateTypeParam && ['etd', 'eta', 'quarantine', 'customs'].includes(dateTypeParam)) {
      setDateFilterType(dateTypeParam);
      if (dateFromParam) {
        const d = new Date(dateFromParam);
        if (!Number.isNaN(d.getTime())) setDateRangeStart(d);
      }
      if (dateToParam) {
        const d = new Date(dateToParam);
        if (!Number.isNaN(d.getTime())) setDateRangeEnd(d);
      }
    }
    if (contractNoParam || dateTypeParam) setPage(1);
  }, [searchParams]);

  // 필터 옵션용 제품/수출사 목록 (전체 주문 조회로 추출)
  const { data: allTradeOrdersForProducts = [] } = useTradeOrders({
    bookingOnly: true,
  });

  const availableProducts = React.useMemo(() => {
    const byCode = new Map<string, string>();
    allTradeOrdersForProducts.forEach((order) => {
      const code = order.productCode ?? order.productName;
      if (code) {
        const name = order.productName || code;
        if (!byCode.has(code)) byCode.set(code, name);
      }
    });
    return Array.from(byCode.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
  }, [allTradeOrdersForProducts]);

  const availableExporters = React.useMemo(() => {
    const set = new Set<string>();
    allTradeOrdersForProducts.forEach((order) => {
      const code = order.exporterCode?.trim();
      if (code) set.add(code);
    });
    return Array.from(set).sort();
  }, [allTradeOrdersForProducts]);

  React.useEffect(() => {
    if (availableExporters.length > 0 && !exporterDefaultAppliedRef.current) {
      exporterDefaultAppliedRef.current = true;
      setSelectedExporters(new Set(availableExporters));
    }
  }, [availableExporters]);

  React.useEffect(() => {
    if (availableProducts.length > 0 && !productDefaultAppliedRef.current) {
      productDefaultAppliedRef.current = true;
      setSelectedProducts(new Set(availableProducts.map((p) => p.code)));
    }
  }, [availableProducts]);

  // 모든 부킹 주문 조회 (bk 또는 bl이 있는 주문)
  // 상태 필터는 프론트엔드에서 처리 (다중 선택 지원)
  // 선택된 상태를 배열로 변환
  const selectedStatusArray = React.useMemo(() => {
    // 전체 선택: 필터링하지 않음
    if (selectedStatuses.size === statusOptions.length) {
      return undefined;
    }
    // 전체 해제: 특별한 값으로 빈 배열을 표시 (axios가 빈 배열을 제대로 전달하지 않을 수 있음)
    if (selectedStatuses.size === 0) {
      return ['__EMPTY__']; // 빈 배열을 나타내는 특별한 값
    }
    // 일부 선택: 선택된 상태만 반환
    return Array.from(selectedStatuses);
  }, [selectedStatuses, statusOptions.length]);

  // 수출사 필터: 전체 선택이면 미전달(백엔드 필터 없음 → contract exporter null인 주문(예: 임시 계약) 포함). 초기/0개 선택 처리 동일
  const exportersParam = React.useMemo(() => {
    if (availableExporters.length === 0 || selectedExporters.size === availableExporters.length) return undefined;
    if (selectedExporters.size === 0) return exporterDefaultAppliedRef.current ? [] : undefined;
    return Array.from(selectedExporters);
  }, [availableExporters.length, selectedExporters, availableExporters]);

  // 상품 필터: 전체 선택이면 미전달, 0개 선택이면 빈 배열(결과 없음), 일부 선택이면 배열
  const productNamesParam = React.useMemo(() => {
    if (availableProducts.length === 0 || selectedProducts.size === availableProducts.length) return undefined;
    if (selectedProducts.size === 0) return productDefaultAppliedRef.current ? [] : undefined;
    return Array.from(selectedProducts);
  }, [availableProducts.length, selectedProducts, availableProducts]);

  const { data: tradeOrders = [], isLoading } = useTradeOrders({
    bookingOnly: true,
    productNames: productNamesParam,
    tradeStatus: selectedStatusArray, // 백엔드에서 다중 필터링
    contractNo: contractNo && contractNo.trim() !== '' ? contractNo.trim() : undefined,
    userId: selectedManagerUserId !== '__all__' ? parseInt(selectedManagerUserId, 10) : undefined,
    exporters: exportersParam,
    includeExcluded,
    // 날짜 기간 필터 (백엔드 처리)
    ...(dateFilterType && (dateRangeStart || dateRangeEnd)
      ? {
          dateType: dateFilterType,
          dateFrom: dateRangeStart ? dateRangeStart.toISOString().slice(0, 10) : undefined,
          dateTo: dateRangeEnd ? dateRangeEnd.toISOString().slice(0, 10) : undefined,
        }
      : {}),
  });

  /** 물류관리 목록 제외 / 제외 해제 */
  const handleExcludeFromLogistics = React.useCallback(
    async (orderId: string, exclude: boolean) => {
      try {
        setExcludeActionLoading(orderId);
        await api.put(`/trade/contracts/orders/${orderId}`, { excludeFromLogistics: exclude });
        toast({
          title: exclude ? '물류관리 목록에서 제외되었습니다.' : '물류관리 목록에 다시 표시됩니다.',
          description: exclude ? '복구는 "제외된 주문 포함"을 켠 뒤 제외 해제를 누르세요.' : undefined,
        });
        await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      } catch (err: unknown) {
        const message = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
        toast({
          title: '처리 실패',
          description: message || (exclude ? '물류관리 목록 제외에 실패했습니다.' : '제외 해제에 실패했습니다.'),
          variant: 'destructive',
        });
      } finally {
        setExcludeActionLoading(null);
      }
    },
    [toast, queryClient],
  );

  /** 부킹/주문 삭제 (상세 드로어에서 삭제 버튼 클릭 시) */
  const handleDelete = React.useCallback((order: TradeOrder) => {
    setTradeOrderToDelete(order);
    setDeleteDialogOpen(true);
  }, []);

  /** 엑셀 다운로드 - 필터 적용, 전체 페이지 데이터 */
  const handleExportExcel = React.useCallback(async () => {
    setExcelExportLoading(true);
    try {
      const params: Record<string, unknown> = { bookingOnly: true };
      if (productNamesParam !== undefined) {
        params.productName = productNamesParam.length === 0 ? '' : productNamesParam;
      }
      if (selectedStatusArray && selectedStatusArray.length > 0 && !selectedStatusArray.includes('__EMPTY__')) {
        params.tradeStatus = selectedStatusArray;
      }
      if (contractNo.trim()) params.contractNo = contractNo.trim();
      if (selectedManagerUserId !== '__all__') params.userId = parseInt(selectedManagerUserId, 10);
      if (exportersParam !== undefined) {
        params.exporters = Array.isArray(exportersParam) && exportersParam.length === 0 ? '' : exportersParam;
      }
      if (includeExcluded) params.includeExcluded = true;
      if (dateFilterType && (dateRangeStart || dateRangeEnd)) {
        params.dateType = dateFilterType;
        if (dateRangeStart) params.dateFrom = dateRangeStart.toISOString().slice(0, 10);
        if (dateRangeEnd) params.dateTo = dateRangeEnd.toISOString().slice(0, 10);
      }

      const response = await api.get('/trade/contracts/orders/export/excel', {
        params,
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `물류관리_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({ title: '다운로드 완료', description: '엑셀 파일이 다운로드되었습니다.' });
    } catch (err) {
      console.error('엑셀 다운로드 오류:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast({
        title: '다운로드 실패',
        description: error.response?.data?.message || '엑셀 파일 다운로드에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setExcelExportLoading(false);
    }
  }, [
    productNamesParam,
    selectedStatusArray,
    contractNo,
    selectedManagerUserId,
    exportersParam,
    includeExcluded,
    dateFilterType,
    dateRangeStart,
    dateRangeEnd,
    toast,
  ]);

  const confirmDelete = React.useCallback(async () => {
    if (!tradeOrderToDelete) return;
    try {
      await deleteOrderMutation.mutateAsync(tradeOrderToDelete.id);
      toast({ title: '삭제 완료', description: '해당 항목이 삭제되었습니다.' });
      setDeleteDialogOpen(false);
      setTradeOrderToDelete(null);
      setDetailDrawerOpen(false);
      setSelectedTradeOrderId(null);
      setSelectedTradeOrder(null);
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
    } catch (err) {
      toastApiError(err as Parameters<typeof toastApiError>[0], '삭제 실패');
    }
  }, [tradeOrderToDelete, deleteOrderMutation, toast, queryClient]);

  // 정렬을 프론트엔드에서 처리
  const filteredOrders = React.useMemo(() => {
    let filtered = [...tradeOrders]; // 배열 복사

    // sortBy와 sortOrder에 따라 동적 정렬
    if (sortBy) {
      filtered.sort((a, b) => {
        let valueA: any;
        let valueB: any;

        // 컬럼에 따라 값 추출
        switch (sortBy) {
          case 'orderDate':
            valueA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
            valueB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
            // 날짜가 없는 경우 맨 뒤로
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            break;
          case 'etdDate':
            valueA = a.etdDate ? new Date(a.etdDate).getTime() : 0;
            valueB = b.etdDate ? new Date(b.etdDate).getTime() : 0;
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            break;
          case 'etaDate':
            valueA = a.etaDate ? new Date(a.etaDate).getTime() : 0;
            valueB = b.etaDate ? new Date(b.etaDate).getTime() : 0;
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            break;
          case 'quarantineDate':
            valueA = a.quarantineDate ? new Date(a.quarantineDate).getTime() : 0;
            valueB = b.quarantineDate ? new Date(b.quarantineDate).getTime() : 0;
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            break;
          case 'customsScheduledDate':
            valueA = a.customsScheduledDate ? new Date(a.customsScheduledDate).getTime() : 0;
            valueB = b.customsScheduledDate ? new Date(b.customsScheduledDate).getTime() : 0;
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            break;
          case 'customsDate':
            valueA = a.customsDate ? new Date(a.customsDate).getTime() : 0;
            valueB = b.customsDate ? new Date(b.customsDate).getTime() : 0;
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            break;
          case 'contractNo':
            valueA = (a.contractNo || '').toLowerCase();
            valueB = (b.contractNo || '').toLowerCase();
            break;
          case 'sequence':
            valueA = (a.sequence ?? 0) * 1000 + (a.sequenceSub ?? 0);
            valueB = (b.sequence ?? 0) * 1000 + (b.sequenceSub ?? 0);
            break;
          case 'bk':
            valueA = (a.bk || '').toLowerCase();
            valueB = (b.bk || '').toLowerCase();
            break;
          case 'bl':
            valueA = (a.bl || '').toLowerCase();
            valueB = (b.bl || '').toLowerCase();
            break;
          case 'exportCountryName':
            valueA = (a.exportCountryName || '').toLowerCase();
            valueB = (b.exportCountryName || '').toLowerCase();
            break;
          case 'exporterName':
            valueA = (a.exporterName || '').toLowerCase();
            valueB = (b.exporterName || '').toLowerCase();
            break;
          case 'shippingLineName':
            valueA = (a.shippingLineName || '').toLowerCase();
            valueB = (b.shippingLineName || '').toLowerCase();
            break;
          case 'productName':
            valueA = (a.productName || '').toLowerCase();
            valueB = (b.productName || '').toLowerCase();
            break;
          case 'grade':
            valueA = (a.grade || '').toLowerCase();
            valueB = (b.grade || '').toLowerCase();
            break;
          case 'destinationName':
            valueA = (a.destinationName || '').toLowerCase();
            valueB = (b.destinationName || '').toLowerCase();
            break;
          case 'containerCount':
            valueA = a.containers?.length ?? 0;
            valueB = b.containers?.length ?? 0;
            break;
          case 'totalBales':
            valueA = (a.containers || []).reduce((sum, c) => sum + (c.salesBales ?? c.tradeBales ?? 0), 0);
            valueB = (b.containers || []).reduce((sum, c) => sum + (c.salesBales ?? c.tradeBales ?? 0), 0);
            break;
          case 'totalWeight':
            valueA = (a.containers || []).reduce((sum, c) => sum + (c.weight || 0), 0);
            valueB = (b.containers || []).reduce((sum, c) => sum + (c.weight || 0), 0);
            break;
          case 'createdAt':
            valueA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            valueB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            break;
          case 'updatedAt':
            valueA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            valueB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            break;
          case 'tradeStatus': {
            // 업무 흐름 순서로 정렬 (같은 값이면 0)
            const statusOrder = ['BOOKING', 'DOCUMENTS', 'DO', 'CUSTOMS', 'ARRIVED', 'QUARANTINE', 'COMPLETED'];
            const idx = (s: string) => {
              const n = statusOrder.indexOf((s || '').trim().toUpperCase());
              return n >= 0 ? n : statusOrder.length;
            };
            valueA = idx(a.tradeStatus || a.status || '');
            valueB = idx(b.tradeStatus || b.status || '');
            break;
          }
          default:
            return 0;
        }

        // 정렬 방향에 따라 비교
        if (sortOrder === 'asc') {
          if (valueA < valueB) return -1;
          if (valueA > valueB) return 1;
          return 0;
        } else {
          if (valueA > valueB) return -1;
          if (valueA < valueB) return 1;
          return 0;
        }
      });
    }

    return filtered;
  }, [tradeOrders, selectedStatuses, sortBy, sortOrder, statusOptions.length]);

  const paginatedOrders = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, page, pageSize]);

  const getStatusBadgeStyle = (status?: string | null) => {
    if (!status) return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
    
    const normalizedStatus = status.trim().toUpperCase();
    if (normalizedStatus === 'BOOKING') {
      return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
    }
    if (normalizedStatus === 'DOCUMENTS') {
      return 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300';
    }
    if (normalizedStatus === 'DO') {
      return 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300';
    }
    if (normalizedStatus === 'CUSTOMS') {
      return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
    }
    if (normalizedStatus === 'ARRIVED') {
      return 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300';
    }
    if (normalizedStatus === 'QUARANTINE') {
      return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
    }
    if (normalizedStatus === 'COMPLETED') {
      return 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300';
    }
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  };

  const columns: ColumnDef<TradeOrder>[] = React.useMemo(() => [
    {
      accessorKey: 'tradeStatus',
      header: '상태',
      enableSorting: true,
      cell: ({ row }) => {
        const tradeStatus = row.original.tradeStatus || row.original.status || 'BOOKING';
        // 한글 이름 표시 우선 (코드명이 아닌 이름으로 표시)
        const statusName = getTradeStatusName(tradeStatus) || row.original.tradeStatusName || tradeStatus;
        return (
          <Badge
            variant="outline"
            className={cn('text-xs', getStatusBadgeStyle(tradeStatus), row.original.shipBack && 'line-through')}
          >
            {statusName}
          </Badge>
        );
      },
      size: 100,
    },
    {
      accessorKey: 'orderDate',
      header: '발주일',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.orderDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'contractNo',
      header: '계약번호',
      enableSorting: true,
      cell: ({ row }) => {
        const isExcluded = row.original.excludeFromLogistics === true;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm">{row.original.contractNo || '-'}</span>
            {row.original.contractGoogleDriveFileId && (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
            {isExcluded && (
              <Badge variant="secondary" className={cn('text-xs font-normal bg-muted text-muted-foreground', row.original.shipBack && 'line-through')}>
                목록 제외
              </Badge>
            )}
          </div>
        );
      },
      size: 140,
    },
    {
      accessorKey: 'sequence',
      header: '순번',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm font-mono">{formatOrderSequence(row.original.sequence, row.original.sequenceSub)}</div>,
      size: 80,
    },
    {
      accessorKey: 'productName',
      header: '상품',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{row.original.productName || '-'}</div>,
      size: 150,
    },
    {
      accessorKey: 'grade',
      header: '등급',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{row.original.grade || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'containerCount',
      header: '컨테이너 수',
      enableSorting: true,
      cell: ({ row }) => {
        const containerCount = row.original.containers?.length ?? 0;
        return <div className="text-sm text-center">{containerCount > 0 ? containerCount : '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'bk',
      header: 'BK',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{row.original.bk || '-'}</div>,
      size: 150,
    },
    {
      accessorKey: 'bl',
      header: 'BL',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{row.original.bl || '-'}</div>,
      size: 150,
    },
    {
      accessorKey: 'etdDate',
      header: 'ETD',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.etdDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'etaDate',
      header: 'ETA',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.etaDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'quarantineDate',
      header: '검역일',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.quarantineDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'customsScheduledDate',
      header: '통관예정일',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.customsScheduledDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'customsDate',
      header: '통관일',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm">{formatDate(row.original.customsDate)}</div>
      ),
      size: 120,
    },
    {
      id: 'documents',
      header: () => (
        <span className="whitespace-nowrap" title="송장 · DO · 면장">
          문서
        </span>
      ),
      enableSorting: false,
      cell: ({ row }) => {
        const o = row.original;
        const hasInvoice = !!(o.invoiceGoogleDriveFileId || o.invoiceFilePath);
        const hasDo = !!o.doGoogleDriveFileId;
        const hasCustoms =
          !!o.customsCertificateGoogleDriveFileId || !!o.customsCertificateGoogleDriveFileId2;
        const invoiceLabel = hasInvoice ? (o.invoiceFileName?.trim() || '있음') : '없음';
        const doLabel = hasDo ? (o.doFileName?.trim() || '있음') : '없음';
        const customsLabel = !hasCustoms
          ? '없음'
          : o.customsCertificateGoogleDriveFileId && o.customsCertificateGoogleDriveFileId2
            ? `2건 (${[o.customsCertificateFileName, o.customsCertificateFileName2].filter(Boolean).join(', ') || '있음'})`
            : o.customsCertificateFileName?.trim() ||
              o.customsCertificateFileName2?.trim() ||
              '있음';
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 w-fit cursor-default">
                <FileText
                  className={`h-4 w-4 shrink-0 ${hasInvoice ? 'text-foreground' : 'text-muted-foreground/40'}`}
                  aria-label="송장"
                />
                <FileText
                  className={`h-4 w-4 shrink-0 ${hasDo ? 'text-foreground' : 'text-muted-foreground/40'}`}
                  aria-label="DO"
                />
                <FileText
                  className={`h-4 w-4 shrink-0 ${hasCustoms ? 'text-foreground' : 'text-muted-foreground/40'}`}
                  aria-label="면장"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="font-normal max-w-[560px] min-w-[280px] px-4 py-2.5 text-sm">
              <div className="space-y-1.5 text-left">
                <div className="font-medium text-background/90">문서</div>
                <div>송장: {invoiceLabel}</div>
                <div>DO: {doLabel}</div>
                <div>면장: {customsLabel}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
      size: 100,
    },
    {
      accessorKey: 'exportCountryName',
      header: '수출국',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{row.original.exportCountryName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'exporterName',
      header: '수출사',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{row.original.exporterName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'shippingLineName',
      header: '선사',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{row.original.shippingLineName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'totalBales',
      header: '베일',
      enableSorting: true,
      cell: ({ row }) => {
        const containers = row.original.containers || [];
        const totalBales = containers.reduce((sum, container) => {
          return sum + (container.salesBales ?? container.tradeBales ?? 0);
        }, 0);
        return <div className="text-sm text-center">{totalBales > 0 ? totalBales.toLocaleString('ko-KR') : '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'totalWeight',
      header: '중량',
      enableSorting: true,
      cell: ({ row }) => {
        const order = row.original;
        const containers = order.containers || [];
        const containerSum = containers.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
        const invoiceW = order.invoiceWeight != null ? Number(order.invoiceWeight) : null;
        const hasInvoice = invoiceW != null && !Number.isNaN(invoiceW);
        const hasContainer = containerSum > 0;
        const mismatch = hasInvoice && hasContainer && Math.abs(invoiceW - containerSum) > 0.001;
        const fmt = (v: number) =>
          v.toLocaleString('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        const invoiceStr = hasInvoice ? fmt(invoiceW) : '-';
        const containerStr = hasContainer ? fmt(containerSum) : '-';
        return (
          <div
            className={`text-sm text-center ${mismatch ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}
            title={mismatch ? '송장 중량과 컨테이너 중량 합계가 일치하지 않습니다.' : undefined}
          >
            {invoiceStr} ({containerStr})
          </div>
        );
      },
      size: 140,
    },
    {
      accessorKey: 'certificateNumber',
      header: '필증신청',
      cell: ({ row }) => {
        const certificateNumber = row.original.certificateNumber;
        const hasCertificate = certificateNumber && certificateNumber.trim() !== '';
        
        return (
          <div className="flex items-center justify-center">
            {hasCertificate ? (
              <Badge 
                variant="outline"
                className={cn('border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300', row.original.shipBack && 'line-through')}
              >
                {certificateNumber}
              </Badge>
            ) : (
              <Badge 
                variant="outline"
                className={cn('border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300', row.original.shipBack && 'line-through')}
              >
                미완료
              </Badge>
            )}
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'originalShipment',
      header: '원본발송',
      cell: ({ row }) => {
        const hasOriginalShipment = row.original.hasOriginalShipment === 'Y';
        const originalShipmentDate = row.original.originalShipment;
        
        // 3가지 상태 구분
        // 1. 체크 안함: hasOriginalShipment가 'Y'가 아님
        const shipBackClass = row.original.shipBack ? 'line-through' : '';
        if (!hasOriginalShipment) {
          return (
            <div className="flex items-center justify-center">
              <Badge 
                variant="outline"
                className={cn('border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300', shipBackClass)}
              >
                해당없음
              </Badge>
            </div>
          );
        }
        
        // 2. 체크함 + 날짜 미입력: hasOriginalShipment가 'Y'이고 originalShipment가 없음
        if (hasOriginalShipment && !originalShipmentDate) {
          return (
            <div className="flex items-center justify-center">
              <Badge 
                variant="outline"
                className={cn('border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300', shipBackClass)}
              >
                발송 예정
              </Badge>
            </div>
          );
        }
        
        // 3. 체크함 + 날짜/텍스트 입력: hasOriginalShipment가 'Y'이고 originalShipment가 있음
        // 원본발송일은 텍스트로 저장되므로 그대로 표시 (날짜 변환하지 않음)
        const displayValue = originalShipmentDate;
        
        return (
          <div className="flex items-center justify-center">
            <Badge 
              variant="outline"
              className={cn('border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300', shipBackClass)}
            >
              {displayValue}
            </Badge>
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'regularPaymentStatus',
      header: '상품 비용',
      cell: ({ row }) => {
        const order = row.original;
        const shipBack = !!order.shipBack;
        const tradeStatus = order.tradeStatus || order.status || '';
        const payments = order.payments || [];
        const regularPayments = payments.filter((p) => p.paymentType === 'REGULAR' || !p.paymentType);
        const sortedRegular = [...regularPayments].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

        const tempRaw = order.bookingTempPayments;
        const sortedTemp =
          tradeStatus === 'BOOKING' && tempRaw && tempRaw.length > 0
            ? [...tempRaw].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
            : [];

        if (sortedRegular.length === 0 && sortedTemp.length === 0) {
          return (
            <div className="flex items-center justify-center">
              <span className="text-sm text-muted-foreground">-</span>
            </div>
          );
        }

        const showBoth = sortedRegular.length > 0 && sortedTemp.length > 0;

        return (
          <div className="space-y-3 py-2">
            {sortedRegular.length > 0 && (
              <div className="space-y-1">
                {showBoth && (
                  <p className="text-xs font-medium text-muted-foreground">정식</p>
                )}
                <LogisticsPaymentMiniTable sortedPayments={sortedRegular} shipBack={shipBack} />
              </div>
            )}
            {sortedTemp.length > 0 && (
              <div
                className={cn(
                  'space-y-1',
                  showBoth && 'rounded-md p-1 ring-1 ring-amber-300/70 dark:ring-amber-700/50',
                )}
              >
                {showBoth ? (
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200">임시(부킹)</p>
                ) : (
                  <Badge
                    variant="outline"
                    className="mb-1 w-fit border-amber-500/80 bg-amber-50 text-amber-900 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    임시(부킹)
                  </Badge>
                )}
                <LogisticsPaymentMiniTable sortedPayments={sortedTemp} shipBack={shipBack} />
              </div>
            )}
          </div>
        );
      },
      size: 360,
    },
    {
      accessorKey: 'quota',
      header: '쿼터',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.quota === 'Y' ? '예' : row.original.quota === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 70,
    },
    {
      accessorKey: 'fumigation',
      header: '훈증',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.fumigation === 'Y' ? '예' : row.original.fumigation === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 70,
    },
    {
      accessorKey: 'customsDuty',
      header: '관세',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.customsDuty === 'Y' ? '예' : row.original.customsDuty === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 70,
    },
    {
      accessorKey: 'spot',
      header: '현물',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.spot === 'Y' ? '예' : row.original.spot === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 70,
    },
    {
      accessorKey: 'notes',
      header: '비고',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm max-w-[200px] truncate" title={row.original.notes ?? undefined}>
          {row.original.notes?.trim() || '-'}
        </div>
      ),
      size: 200,
    },
    {
      accessorKey: 'destinationName',
      header: '도착항',
      cell: ({ row }) => <div className="text-sm">{row.original.destinationName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'managerUser',
      header: '등록자',
      cell: ({ row }) => (
        <div className="text-sm">{row.original.managerUser?.name || '-'}</div>
      ),
      size: 120,
    },
    {
      accessorKey: 'createdAt',
      header: '등록일시',
      cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.createdAt)}</div>,
      size: 165,
    },
    {
      accessorKey: 'updatedAt',
      header: '수정일시',
      cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.updatedAt)}</div>,
      size: 165,
    },
    {
      id: 'excludeAction',
      header: '액션',
      enableSorting: false,
      cell: ({ row }) => {
        const order = row.original;
        const isExcluded = order.excludeFromLogistics === true;
        const loading = excludeActionLoading === order.id;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {isExcluded ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={loading}
                onClick={() => handleExcludeFromLogistics(order.id, false)}
              >
                {loading ? '처리 중...' : (
                  <>
                    <Eye className="mr-1 h-3 w-3" />
                    제외 해제
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                disabled={loading}
                onClick={() => handleExcludeFromLogistics(order.id, true)}
              >
                {loading ? '처리 중...' : (
                  <>
                    <EyeOff className="mr-1 h-3 w-3" />
                    제외
                  </>
                )}
              </Button>
            )}
          </div>
        );
      },
      size: 100,
    },
  ], [financeStatusCodes, paymentResultCodes, tradeStatusCodes, getTradeStatusName, excludeActionLoading, handleExcludeFromLogistics]);

  const handleRowClick = (order: TradeOrder) => {
    setSelectedTradeOrder(order);
    setSelectedTradeOrderId(order.id);
    setDetailDrawerOpen(true);
  };

  const openBkBlDuplicateCheck = () => {
    setBkBlDupDialogOpen(true);
    setBkBlDupLoading(true);
    setBkBlDupReport(null);
    void api
      .get<BkBlDupReport>('/trade/contracts/orders/duplicate-bk-bl-report')
      .then((res) => setBkBlDupReport(res.data))
      .catch((e) => toastApiError(e, 'BK/BL 중복 검사 실패'))
      .finally(() => setBkBlDupLoading(false));
  };

  const openOrderFromBkBlDupReport = async (orderId: string) => {
    try {
      const { data } = await api.get<TradeOrder>(`/trade/contracts/orders/${orderId}`);
      setSelectedTradeOrder(data);
      setSelectedTradeOrderId(data.id);
      setBkBlDupDialogOpen(false);
      setBkBlDupReport(null);
      setDetailDrawerOpen(true);
    } catch (e) {
      toastApiError(e, '주문을 불러오지 못했습니다.');
    }
  };

  const handleEdit = (order: TradeOrder) => {
    // 중첩 drawer 방식으로 변경: 상세 drawer는 유지하고 수정 drawer는 상세 drawer 내부에서 열림
    // 따라서 여기서는 아무것도 하지 않음 (상세 drawer 내부에서 처리)
  };

  const handleBookingFormSubmit = async (orderId?: string) => {
    // 데이터 갱신
    await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
    if (orderId) {
      await queryClient.invalidateQueries({ queryKey: ['trade-order', orderId] });
    }
    
    // 등록 모드일 때는 drawer만 닫고 목록만 표시
    // 수정 모드일 때만 상세정보 열기
    if (bookingEditId && orderId) {
      // 수정 모드: 상세정보 열기
      setSelectedTradeOrderId(orderId);
      setDetailDrawerOpen(true);
    }
    
    // 등록 모드: drawer만 닫기
    setBookingFormDrawerOpen(false);
    setBookingEditId(null);
  };

  // 상태에 따라 적절한 drawer 렌더링 (항상 렌더링하여 애니메이션 보장)
  const renderDetailDrawer = () => {
    // selectedTradeOrder가 없어도 drawer는 항상 렌더링 (애니메이션 보장)
    const tradeStatus = selectedTradeOrder?.tradeStatus || selectedTradeOrder?.status || 'BOOKING';

    switch (tradeStatus) {
      case 'BOOKING':
        return (
          <BookingDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                // 애니메이션 완료 후 상태 초기화 (약 300ms 후)
                setTimeout(() => {
                  setSelectedTradeOrderId(null);
                  setSelectedTradeOrder(null);
                }, 300);
              }
            }}
            bookingId={selectedTradeOrderId}
            onEdit={handleEdit}
            onDocumentsProcessingSuccess={(order) => {
              setSelectedTradeOrder(order);
              setSelectedTradeOrderId(order.id);
            }}
          />
        );
      case 'DOCUMENTS':
        return (
          <DocumentsProcessingDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                // 애니메이션 완료 후 상태 초기화 (약 300ms 후)
                setTimeout(() => {
                  setSelectedTradeOrderId(null);
                  setSelectedTradeOrder(null);
                }, 300);
              }
            }}
            tradeOrderId={selectedTradeOrderId}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDoProcessingSuccess={(order) => {
              setSelectedTradeOrder(order);
              setSelectedTradeOrderId(order.id);
            }}
          />
        );
      case 'DO':
        return (
          <DoProcessingDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                // 애니메이션 완료 후 상태 초기화 (약 300ms 후)
                setTimeout(() => {
                  setSelectedTradeOrderId(null);
                  setSelectedTradeOrder(null);
                }, 300);
              }
            }}
            tradeOrderId={selectedTradeOrderId}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCustomsProcessingSuccess={(order) => {
              setSelectedTradeOrder(order);
              setSelectedTradeOrderId(order.id);
            }}
          />
        );
      case 'CUSTOMS':
        return (
          <CustomsProcessingDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                // 애니메이션 완료 후 상태 초기화 (약 300ms 후)
                setTimeout(() => {
                  setSelectedTradeOrderId(null);
                  setSelectedTradeOrder(null);
                }, 300);
              }
            }}
            tradeOrderId={selectedTradeOrderId}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        );
      default:
        // ARRIVED, QUARANTINE, COMPLETED 등은 부킹 drawer 사용
        return (
          <BookingDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                // 애니메이션 완료 후 상태 초기화 (약 300ms 후)
                setTimeout(() => {
                  setSelectedTradeOrderId(null);
                  setSelectedTradeOrder(null);
                }, 300);
              }
            }}
            bookingId={selectedTradeOrderId}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        );
    }
  };

  // 수정 drawer는 상세 drawer 내부에서 처리하므로 제거

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">물류관리</h1>
            <p className="hidden text-muted-foreground md:block">
              모든 물류 상태의 주문을 조회하고 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={openBkBlDuplicateCheck}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  {!isMobile && 'BK/BL 중복 검사'}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px]">
                <p>전체 발주 기준으로 BK·BL 중복 및 필드 교차 사용 여부를 검사합니다.</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={excelExportLoading || filteredOrders.length === 0}
                >
                  {excelExportLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="mr-2 h-4 w-4" />
                  )}
                  {!isMobile && '엑셀 다운로드'}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px]">
                <p>현재 필터가 적용된 전체 데이터를 엑셀 파일로 다운로드합니다.</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEtaUpdateConfirmOpen(true)}
                  disabled={filteredOrders.length === 0}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {!isMobile && 'ETA 정보 갱신'}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px]">
                <p>필터된 항목에 대해 선적 조회를 실행하여 ETA·선사 정보를 업데이트합니다.</p>
              </TooltipContent>
            </Tooltip>
            <AlertDialog open={etaUpdateConfirmOpen} onOpenChange={setEtaUpdateConfirmOpen}>
              <AlertDialogContent className="sm:max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>ETA 정보 갱신 확인</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      <p>
                        총 <strong className="text-foreground">{filteredOrders.length}건</strong>에 대해 선적 조회를 실행하여 ETA·선사 정보를 업데이트합니다.
                      </p>
                      <p className="text-amber-600 dark:text-amber-500">
                        선적 조회 API는 유료이며 월 사용 횟수 제한이 있습니다. 잘못된 실행을 방지하기 위해 확인 후 진행해 주세요.
                      </p>
                      <p className="font-medium">계속하시겠습니까?</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-2">
                  <AlertDialogCancel className="m-0" disabled={etaUpdateLoading}>
                    <XCircle className="mr-2 h-4 w-4" />
                    취소
                  </AlertDialogCancel>
                  <Button
                    size="sm"
                    disabled={etaUpdateLoading}
                    onClick={async () => {
                        const orderIds = filteredOrders.map((o) => o.id);
                      if (orderIds.length === 0) return;
                      setEtaUpdateLoading(true);
                      const filterParams: Record<string, unknown> = {};
                      if (contractNo.trim()) filterParams.contractNo = contractNo.trim();
                      if (productNamesParam !== undefined) {
                        filterParams.productName = productNamesParam.length === 0 ? '' : productNamesParam;
                      }
                      if (selectedStatuses.size > 0 && selectedStatuses.size < statusOptions.length)
                        filterParams.tradeStatus = Array.from(selectedStatuses);
                      if (selectedManagerUserId !== '__all__') filterParams.userId = selectedManagerUserId;
                      if (selectedExporters.size > 0) filterParams.exporters = Array.from(selectedExporters);
                      if (dateFilterType && (dateRangeStart || dateRangeEnd)) {
                        filterParams.dateType = dateFilterType;
                        if (dateRangeStart) filterParams.dateFrom = dateRangeStart.toISOString().slice(0, 10);
                        if (dateRangeEnd) filterParams.dateTo = dateRangeEnd.toISOString().slice(0, 10);
                      }
                      if (includeExcluded) filterParams.includeExcluded = true;
                      filterParams.sortBy = sortBy;
                      filterParams.sortOrder = sortOrder;
                      try {
                        const { data } = await api.post<{ total: number; success: number; failed: number; results: Array<{ orderId: string; success: boolean; error?: string }> }>(
                          '/trade/contracts/orders/eta-update',
                          { orderIds, filterParams: Object.keys(filterParams).length > 0 ? filterParams : undefined },
                        );
                        setEtaUpdateConfirmOpen(false);
                        if (data.failed === 0) {
                          toastSuccess('ETA 갱신 완료', `${data.success}건의 ETA·선사 정보가 업데이트되었습니다.`);
                        } else {
                          toastSuccess(
                            'ETA 갱신 완료',
                            `${data.success}건 성공, ${data.failed}건 실패. 실패 건은 BK/BL이 없거나 API 제한에 도달했을 수 있습니다.`,
                          );
                        }
                        await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
                      } catch (err) {
                        toastApiError(err, 'ETA 갱신 실패');
                      } finally {
                        setEtaUpdateLoading(false);
                      }
                    }}
                  >
                    {etaUpdateLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        실행 중...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        실행
                      </>
                    )}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" onClick={() => setBookingFormDrawerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {!isMobile && '부킹 등록'}
            </Button>
          </div>
        </div>

        {contractNo.trim() !== '' && filteredOrders.length === 0 && !isLoading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <strong>계약번호 &quot;{contractNo.trim()}&quot;</strong>에 해당하는 결과가 없습니다.
            <span className="block mt-1 text-muted-foreground">
              물류관리에서는 <strong>부킹(주문)</strong>만 표시됩니다. 구매관리에서 보이는 &quot;계약&quot; 행은 계약 정보이며, 이 계약으로 <strong>부킹을 등록</strong>해야 물류관리 목록에 나타납니다. 구매관리에서 해당 계약을 연 후 부킹을 등록해 주세요.
            </span>
          </div>
        )}

        <LogisticsManagementDataTable
          columns={columns}
          data={paginatedOrders}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={filteredOrders.length}
          totalPages={Math.max(1, Math.ceil(filteredOrders.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(columnId, order) => {
            setSortBy(columnId);
            setSortOrder(order);
            setPage(1);
          }}
          manualPagination={true}
          rowClassName="h-10"
          getRowClassName={(row) => {
            const classes: string[] = [];
            if (row.shipBack === true) {
              classes.push('line-through text-muted-foreground');
            }
            if (isUpdatedWithin5Minutes(row.updatedAt)) {
              classes.push('bg-yellow-100 dark:bg-yellow-950/50 hover:!bg-yellow-200 dark:hover:!bg-yellow-900/60');
            } else if (isEtaWithinOneWeek(row.etaDate)) {
              classes.push('bg-red-100 dark:bg-red-950/50 hover:!bg-red-200 dark:hover:!bg-red-900/60');
            }
            return classes.length ? classes.join(' ') : undefined;
          }}
          excludeRowDecorationColumnIds={['excludeAction']}
          filterControls={
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">검색</Label>
                <Input
                  type="text"
                  placeholder="계약번호, BK, BL, 중량 검색"
                  value={contractNo}
                  onChange={(e) => {
                    setContractNo(e.target.value);
                    setPage(1);
                  }}
                  className="w-40 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">수출사</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {availableExporters.length === 0
                        ? '전체'
                        : selectedExporters.size === availableExporters.length
                          ? '전체'
                          : selectedExporters.size === 0
                            ? '선택 안됨'
                            : `${selectedExporters.size}개 선택됨`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <Checkbox
                            id="logistics-exporter-filter-all"
                            checked={availableExporters.length === 0 || selectedExporters.size === availableExporters.length}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedExporters(new Set(availableExporters));
                              } else {
                                setSelectedExporters(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label htmlFor="logistics-exporter-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                            전체
                          </Label>
                        </div>
                        {availableExporters.map((code) => {
                          const codeInfo = exporterCodes.find((c) => (c.value ?? '').trim() === code);
                          const label = codeInfo ? codeInfo.name : code;
                          return (
                            <div key={code} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                              <Checkbox
                                id={`logistics-exporter-filter-${code}`}
                                checked={selectedExporters.has(code)}
                                onCheckedChange={(checked: boolean) => {
                                  const next = new Set(selectedExporters);
                                  if (checked) next.add(code);
                                  else next.delete(code);
                                  setSelectedExporters(next);
                                  setPage(1);
                                }}
                              />
                              <Label htmlFor={`logistics-exporter-filter-${code}`} className="text-sm font-medium cursor-pointer flex-1">
                                {label}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상태</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {selectedStatuses.size === statusOptions.length 
                        ? '전체' 
                        : selectedStatuses.size === 0
                        ? '선택 안됨'
                        : `${selectedStatuses.size}개 선택됨`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="start">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <Checkbox
                            id="status-filter-all"
                            checked={selectedStatuses.size === statusOptions.length}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedStatuses(new Set(statusOptions.map(s => s.value)));
                              } else {
                                setSelectedStatuses(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label
                            htmlFor="status-filter-all"
                            className="text-sm font-medium cursor-pointer flex-1"
                          >
                            전체
                          </Label>
                        </div>
                        {statusOptions.map((status) => (
                          <div key={status.value} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id={`status-filter-${status.value}`}
                              checked={selectedStatuses.has(status.value)}
                              onCheckedChange={(checked: boolean) => {
                                const newStatuses = new Set(selectedStatuses);
                                if (checked) {
                                  newStatuses.add(status.value);
                                } else {
                                  newStatuses.delete(status.value);
                                }
                                setSelectedStatuses(newStatuses);
                                setPage(1);
                              }}
                            />
                            <Label
                              htmlFor={`status-filter-${status.value}`}
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
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {availableProducts.length === 0
                        ? '전체'
                        : selectedProducts.size === availableProducts.length
                          ? '전체'
                          : selectedProducts.size === 0
                            ? '선택 안됨'
                            : `${selectedProducts.size}개 선택됨`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <Checkbox
                            id="logistics-product-filter-all"
                            checked={availableProducts.length === 0 || selectedProducts.size === availableProducts.length}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedProducts(new Set(availableProducts.map((p) => p.code)));
                              } else {
                                setSelectedProducts(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label htmlFor="logistics-product-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                            전체
                          </Label>
                        </div>
                        {availableProducts.map(({ code, name }) => (
                          <div key={code} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id={`logistics-product-filter-${code}`}
                              checked={selectedProducts.has(code)}
                              onCheckedChange={(checked: boolean) => {
                                const next = new Set(selectedProducts);
                                if (checked) next.add(code);
                                else next.delete(code);
                                setSelectedProducts(next);
                                setPage(1);
                              }}
                            />
                            <Label htmlFor={`logistics-product-filter-${code}`} className="text-sm font-medium cursor-pointer flex-1">
                              {name || code}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">등록자</Label>
                <Select
                  value={selectedManagerUserId}
                  onValueChange={(value) => {
                    setSelectedManagerUserId(value);
                    // 쿠키에 무역 권한 등록자 ID 저장
                    Cookies.set('trade-manager-user-id', value, { expires: 365 }); // 1년간 유지
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40" size="sm">
                    <SelectValue placeholder="등록자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">날짜 기준</Label>
                <Select
                  value={dateFilterType || '__none__'}
                  onValueChange={(value) => {
                    setDateFilterType(value === '__none__' ? '' : (value as 'etd' | 'eta' | 'quarantine' | 'customs'));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-28" size="sm">
                    <SelectValue placeholder="날짜 기준" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">선택 안함</SelectItem>
                    <SelectItem value="etd">ETD</SelectItem>
                    <SelectItem value="eta">ETA</SelectItem>
                    <SelectItem value="quarantine">검역일</SelectItem>
                    <SelectItem value="customs">통관일</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 min-w-[240px]">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">기간</Label>
                <DateRangePicker
                  startDate={dateRangeStart}
                  endDate={dateRangeEnd}
                  onChange={(start, end) => {
                    setDateRangeStart(start);
                    setDateRangeEnd(end);
                    setPage(1);
                  }}
                  className="h-8"
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Checkbox
                  id="includeExcluded"
                  checked={includeExcluded}
                  onCheckedChange={(checked) => {
                    setIncludeExcluded(checked === true);
                    setPage(1);
                  }}
                />
                <Label htmlFor="includeExcluded" className="text-sm font-medium cursor-pointer whitespace-nowrap">
                  제외된 주문 포함
                </Label>
              </div>
            </div>
          }
        />

        {renderDetailDrawer()}

        <Dialog
          open={bkBlDupDialogOpen}
          onOpenChange={(open) => {
            setBkBlDupDialogOpen(open);
            if (!open) {
              setBkBlDupReport(null);
              setBkBlDupLoading(false);
            }
          }}
        >
          <DialogContent className="flex max-h-[min(90vh,900px)] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
            <DialogHeader className="shrink-0 border-b px-6 pb-3 pt-6">
              <DialogTitle>BK / BL 중복 검사</DialogTitle>
              <DialogDescription>
                공백 제거·대문자 기준으로 비교합니다. 같은 값이 여러 발주의 BK에 있거나, 한 건은 BK·다른 건은 BL에만 들어가 있는 경우를 찾습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain px-6 py-4">
              <div className="space-y-6">
                {bkBlDupLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>전체 발주를 검사하는 중…</span>
                  </div>
                ) : bkBlDupReport ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      스캔한 발주 수: <span className="font-medium text-foreground">{bkBlDupReport.scannedOrderCount}</span>
                    </p>
                    {!bkBlDupReport.duplicateBkGroups.length &&
                    !bkBlDupReport.duplicateBlGroups.length &&
                    !bkBlDupReport.crossFieldGroups.length ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        중복·교차 의심 건이 없습니다.
                      </p>
                    ) : null}

                    {bkBlDupReport.duplicateBkGroups.length > 0 ? (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">동일 BK가 2건 이상인 그룹</h3>
                        {bkBlDupReport.duplicateBkGroups.map((g) => (
                          <div key={`bk-${g.normalizedValue}`} className="rounded-md border">
                            <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                              정규화 값: <span className="font-mono">{g.normalizedValue}</span>
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                  <TableHead className="w-[120px]">계약번호</TableHead>
                                  <TableHead className="w-[72px]">순번</TableHead>
                                  <TableHead>BK</TableHead>
                                  <TableHead>BL</TableHead>
                                  <TableHead className="w-[100px]">상태</TableHead>
                                  <TableHead className="w-[72px] text-right">열기</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.orders.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="font-mono text-xs">{r.contractNo ?? '-'}</TableCell>
                                    <TableCell>{formatOrderSequence(r.sequence, r.sequenceSub)}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.bk ?? '-'}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.bl ?? '-'}</TableCell>
                                    <TableCell className="text-xs">
                                      {getTradeStatusName(r.tradeStatus) || r.tradeStatus || '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7"
                                        onClick={() => void openOrderFromBkBlDupReport(r.id)}
                                      >
                                        상세
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {bkBlDupReport.duplicateBlGroups.length > 0 ? (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">동일 BL이 2건 이상인 그룹</h3>
                        {bkBlDupReport.duplicateBlGroups.map((g) => (
                          <div key={`bl-${g.normalizedValue}`} className="rounded-md border">
                            <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                              정규화 값: <span className="font-mono">{g.normalizedValue}</span>
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                  <TableHead className="w-[120px]">계약번호</TableHead>
                                  <TableHead className="w-[72px]">순번</TableHead>
                                  <TableHead>BK</TableHead>
                                  <TableHead>BL</TableHead>
                                  <TableHead className="w-[100px]">상태</TableHead>
                                  <TableHead className="w-[72px] text-right">열기</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.orders.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="font-mono text-xs">{r.contractNo ?? '-'}</TableCell>
                                    <TableCell>{formatOrderSequence(r.sequence, r.sequenceSub)}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.bk ?? '-'}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.bl ?? '-'}</TableCell>
                                    <TableCell className="text-xs">
                                      {getTradeStatusName(r.tradeStatus) || r.tradeStatus || '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7"
                                        onClick={() => void openOrderFromBkBlDupReport(r.id)}
                                      >
                                        상세
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {bkBlDupReport.crossFieldGroups.length > 0 ? (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">BK 칸과 BL 칸에 동시에 등장하는 값 (필드 혼동·재사용 의심)</h3>
                        <p className="text-xs text-muted-foreground">
                          아래 문자열이 어떤 발주의 BK로도 쓰이고, 다른 발주의 BL로도 쓰입니다. (한 발주에 BK·BL 모두 같은 값이면 양쪽 목록에 같이 나올 수 있습니다.)
                        </p>
                        {bkBlDupReport.crossFieldGroups.map((g) => (
                          <div key={`xf-${g.normalizedValue}`} className="space-y-2 rounded-md border p-3">
                            <div className="text-xs font-medium">
                              값: <span className="font-mono">{g.normalizedValue}</span>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">BK로 저장된 발주</p>
                                <Table>
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="h-8 text-xs">계약·순번</TableHead>
                                      <TableHead className="h-8 w-14 text-right text-xs">열기</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {g.asBkOrders.map((r) => (
                                      <TableRow key={`${r.id}-bk`}>
                                        <TableCell className="text-xs">
                                          {r.contractNo ?? '-'} / {formatOrderSequence(r.sequence, r.sequenceSub)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7"
                                            onClick={() => void openOrderFromBkBlDupReport(r.id)}
                                          >
                                            상세
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">BL로 저장된 발주</p>
                                <Table>
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="h-8 text-xs">계약·순번</TableHead>
                                      <TableHead className="h-8 w-14 text-right text-xs">열기</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {g.asBlOrders.map((r) => (
                                      <TableRow key={`${r.id}-bl`}>
                                        <TableCell className="text-xs">
                                          {r.contractNo ?? '-'} / {formatOrderSequence(r.sequence, r.sequenceSub)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7"
                                            onClick={() => void openOrderFromBkBlDupReport(r.id)}
                                          >
                                            상세
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="항목 삭제"
          description={
            <>
              이 항목을 삭제하시겠습니까?
              <br />
              <span className="font-medium text-destructive">삭제된 데이터는 복구할 수 없습니다.</span>
            </>
          }
          onConfirm={confirmDelete}
          isDeleting={deleteOrderMutation.isPending}
        />

        <BookingFormDrawer
          open={bookingFormDrawerOpen}
          onOpenChange={(open) => {
            setBookingFormDrawerOpen(open);
            if (!open) {
              // 폼이 닫힐 때 상태 초기화
              setBookingEditId(null);
              setDetailDrawerOpen(false);
              setSelectedTradeOrderId(null);
            }
          }}
          bookingId={bookingEditId}
          mode={bookingEditId ? 'edit' : 'create'}
          onSubmit={handleBookingFormSubmit}
        />
      </div>
    </AppLayout>
  );
}

export default function LogisticsManagementPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <LogisticsManagementPageContent />
    </Suspense>
  );
}
