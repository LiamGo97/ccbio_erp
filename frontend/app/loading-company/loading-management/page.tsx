'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useSearchParams } from 'next/navigation';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  SalesDelivery,
  useSalesDeliveries,
} from '@/lib/hooks/use-sales-delivery';
import { LoadingCompanyDeliveryDetailDrawer } from '@/components/sales-delivery/loading-company-delivery-detail-drawer';
import { salesUnloadingMainLine } from '@/lib/sales-unloading-display';
import Cookies from 'js-cookie';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { useMyWarehouseId } from '@/lib/hooks/use-warehouse-users';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { AlertCircle, RefreshCw, Clock, Loader2, Filter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { Separator } from '@/components/ui/separator';
import { startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { ko } from 'date-fns/locale';

/** 상차관리 목록에 노출·필터 가능한 배송 상태 */
const DEFAULT_LOADING_STATUS_FILTER = [
  'DISPATCHING',
  'DISPATCH_COMPLETED',
  'LOADING',
  'LOADING_COMPLETED',
  'UNLOADING_COMPLETED',
] as const;

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

const formatDate = (value?: string | Date | null) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
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

/** 상세 drawer「하역 정보」와 동일: 직접 하차 연락처 또는 하역 업체 대표명·연락처 */
function formatUnloadingInfoDisplay(d: SalesDelivery): { line1: string; line2: string | null } {
  const direct = d.directUnloadingContact?.trim();
  if (direct) {
    return { line1: '직접 하차', line2: formatPhone(direct) };
  }
  const uc = d.unloadingCompany;
  const name = uc?.representativeName?.trim();
  if (name) {
    const p = uc?.contact?.trim();
    return { line1: name, line2: p ? formatPhone(p) : null };
  }
  if (d.unloadingCompanyId) {
    const p = uc?.contact?.trim();
    return { line1: '-', line2: p ? formatPhone(p) : null };
  }
  return { line1: '-', line2: null };
}

function LoadingManagementPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [authResolved, setAuthResolved] = React.useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const searchParams = useSearchParams();

  React.useEffect(() => {
    auth.getCurrentUser().then((u) => {
      setUser(u);
      setAuthResolved(true);
    });
  }, []);

  // URL 쿼리 파라미터에서 배송 ID를 읽어서 상세 drawer 자동으로 열기
  React.useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam) {
      setSelectedDeliveryId(idParam);
      setDetailDrawerOpen(true);
      // URL에서 쿼리 파라미터 제거 (브라우저 히스토리 정리)
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  const [selectedStatuses, setSelectedStatuses] = React.useState<Set<string>>(
    () => new Set(DEFAULT_LOADING_STATUS_FILTER),
  );
  const [search, setSearch] = React.useState('');
  const [mobileDateFilter, setMobileDateFilter] = React.useState<string>('all');
  const [loadingStartDate, setLoadingStartDate] = React.useState<Date | null>(null);
  const [loadingEndDate, setLoadingEndDate] = React.useState<Date | null>(null);
  const isMobile = useIsMobile();

  // 모바일 날짜 필터 변경 핸들러
  const handleMobileDateFilterChange = (value: string) => {
    setMobileDateFilter(value);
    setPage(1);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    
    switch (value) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date(today);
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = yesterday;
        endDate = yesterday;
        break;
      case 'thisWeek': {
        // PC 모드와 동일하게 date-fns의 startOfWeek, endOfWeek 사용
        startDate = startOfWeek(new Date(), { locale: ko });
        endDate = endOfWeek(new Date(), { locale: ko });
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'lastWeek': {
        // PC 모드와 동일하게 date-fns의 startOfWeek, endOfWeek 사용
        const lastWeek = subWeeks(new Date(), 1);
        startDate = startOfWeek(lastWeek, { locale: ko });
        endDate = endOfWeek(lastWeek, { locale: ko });
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'thisMonth': {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        // 해당 월의 마지막일까지 선택 (다음 달의 0일 = 이번 달의 마지막일)
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'lastMonth': {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        startDate = lastMonth;
        endDate = lastMonthEnd;
        break;
      }
      default:
        startDate = null;
        endDate = null;
    }
    
    setLoadingStartDate(startDate);
    setLoadingEndDate(endDate);
  };

  // 창고 ID 조회
  const {
    data: warehouseData,
    isLoading: isLoadingWarehouse,
    refetch: refetchWarehouse,
  } = useMyWarehouseId();
  const warehouseId = warehouseData?.warehouseId ?? null;

  // 이 화면은 역할과 무관하게, 사용자에게 할당된 창고(회사) 기준만 조회 (창고 업체와 동일 UX로 테스트 가능)
  // 창고에 할당된 배송만 조회
  // 창고 업체 직원 화면: 30초마다 자동 갱신 (갱신 시 테이블이 다시 그려져서 PC에서 행 클릭이 간헐적으로 무시될 수 있음 → 콘솔 로그로 확인)
  const REFETCH_INTERVAL = 30000; // 30초
  // warehouseId가 로드된 후에만 호출 (불필요한 첫 번째 호출 방지)
  const { 
    data: deliveriesResponse, 
    isLoading, 
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useSalesDeliveries({
    page,
    limit: pageSize,
    status: selectedStatuses.size === 0 ? '__none__' : undefined,
    statuses: selectedStatuses.size > 0 ? Array.from(selectedStatuses) : undefined,
    search: search || undefined,
    loadingWarehouseIds: warehouseId != null ? [warehouseId] : undefined,
    sortBy: 'createdAt',
    sortOrder: 'DESC',
    enabled: authResolved && !!user && !isLoadingWarehouse && warehouseId !== null,
  }, { refetchInterval: REFETCH_INTERVAL }); // 30초마다 자동 갱신

  // 마지막 갱신 시간 포맷팅
  const formatLastUpdate = React.useCallback(() => {
    if (!dataUpdatedAt) return '갱신 중...';
    const now = Date.now();
    const diff = now - dataUpdatedAt;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 5) return '방금 전';
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}분 전`;
  }, [dataUpdatedAt]);

  // 프로그래스 바 값 계산
  const [progressValue, setProgressValue] = React.useState<number>(0);
  
  React.useEffect(() => {
    if (!dataUpdatedAt) {
      setProgressValue(0);
      return;
    }
    
    const updateTimer = () => {
      const now = Date.now();
      const elapsed = now - dataUpdatedAt;
      const remaining = Math.max(0, REFETCH_INTERVAL - elapsed);
      const progress = (remaining / REFETCH_INTERVAL) * 100;
      
      setProgressValue(progress);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100); // 100ms마다 업데이트하여 부드러운 애니메이션
    return () => clearInterval(interval);
  }, [dataUpdatedAt, REFETCH_INTERVAL]);

  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });

  const allowedLoadingStatusValues = React.useMemo(
    () => new Set<string>(DEFAULT_LOADING_STATUS_FILTER),
    [],
  );

  const filterableStatusCodes = React.useMemo(
    () =>
      (statusCodes ?? []).filter((code) => {
        const v = (code.value || code.name || '').trim().toUpperCase();
        return v && allowedLoadingStatusValues.has(v);
      }),
    [statusCodes, allowedLoadingStatusValues],
  );

  /** 팝오버 옵션: 코드 마스터에 있으면 라벨 사용, 없으면 기본 5개 값 */
  const statusOptionsForFilter = React.useMemo(() => {
    if (filterableStatusCodes.length > 0) return filterableStatusCodes;
    return [...DEFAULT_LOADING_STATUS_FILTER].map((value) => ({ value, name: value }));
  }, [filterableStatusCodes]);

  // 상차 일정 필터는 클라이언트에서만 적용(기존과 동일). 상태는 API statuses와 맞춤
  const deliveries = React.useMemo(() => {
    let filtered = deliveriesResponse?.data || [];

    // 상차 일정 기간 필터링 (표시와 동일: 배차내역 loadingDateTime 우선, 없으면 loadingItems[0].loadingSchedule)
    if (loadingStartDate || loadingEndDate) {
      filtered = filtered.filter((delivery) => {
        const scheduleSource = delivery.loadingDateTime
          ? delivery.loadingDateTime
          : delivery.loadingItems?.[0]?.loadingSchedule;
        if (!scheduleSource) return false;
        
        const scheduleDate = new Date(scheduleSource);
        if (Number.isNaN(scheduleDate.getTime())) return false;
        scheduleDate.setHours(0, 0, 0, 0);
        
        if (loadingStartDate && loadingEndDate) {
          const startDate = new Date(loadingStartDate);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(loadingEndDate);
          endDate.setHours(23, 59, 59, 999);
          return scheduleDate >= startDate && scheduleDate <= endDate;
        } else if (loadingStartDate) {
          const startDate = new Date(loadingStartDate);
          startDate.setHours(0, 0, 0, 0);
          return scheduleDate >= startDate;
        } else if (loadingEndDate) {
          const endDate = new Date(loadingEndDate);
          endDate.setHours(23, 59, 59, 999);
          return scheduleDate <= endDate;
        }
        return true;
      });
    }
    
    return filtered;
  }, [deliveriesResponse?.data, loadingStartDate, loadingEndDate]);

  const allFilterableStatusesSelected =
    statusOptionsForFilter.length > 0 &&
    selectedStatuses.size === statusOptionsForFilter.length &&
    statusOptionsForFilter.every((c) =>
      selectedStatuses.has(String(c.value || c.name || '').trim()),
    );

  // total: 상태는 서버 필터 → API total. 상차일정은 클라이언트만 적용 → 현재 페이지에서 걸러진 행 수(기존과 동일)
  const total = React.useMemo(() => {
    if (selectedStatuses.size === 0) return 0;
    if (loadingStartDate || loadingEndDate) {
      return deliveries.length;
    }
    return deliveriesResponse?.total ?? 0;
  }, [
    selectedStatuses.size,
    loadingStartDate,
    loadingEndDate,
    deliveries.length,
    deliveriesResponse?.total,
  ]);

  /** 서버 페이징: API total 기준 (deliveries는 현재 페이지 행만 있어 length로 나누면 항상 1페이지가 됨) */
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));

  // 코드 맵 생성
  const warehouseMap = React.useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach((wh) => {
      if (wh.id) map.set(wh.id, wh.name || '');
    });
    return map;
  }, [warehouses]);

  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (statusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [statusCodes]);

  const dispatchCompanyMap = React.useMemo(() => {
    const map = new Map<number, string>();
    dispatchCompanies.forEach((dc) => {
      if (dc.id) map.set(dc.id, dc.name || '');
    });
    return map;
  }, [dispatchCompanies]);

  const handleRowClick = (delivery: SalesDelivery) => {
    console.log('[상차관리] 행 클릭', {
      deliveryId: delivery.id,
      orderNumber: delivery.orderNumber,
      at: new Date().toISOString(),
    });
    setSelectedDeliveryId(delivery.id);
    setDetailDrawerOpen(true);
  };

  // PC 테이블 보기일 때: 클릭이 테이블까지 안 갔을 때 실제 클릭된 요소 확인용 (document 캡처)
  React.useEffect(() => {
    if (isMobile || !user || warehouseId === null) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const inTable = !!t.closest?.('table');
      const inTbodyRow = !!t.closest?.('tbody tr');
      const inTableCell = !!t.closest?.('td');
      console.log('[상차관리] 문서 클릭(캡처)', {
        tag: t.tagName,
        id: t.id || undefined,
        className: (t.className && String(t.className).slice(0, 60)) || undefined,
        inTable,
        inTbodyRow,
        inTableCell,
        at: new Date().toISOString(),
      });
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [isMobile, user, warehouseId]);

  // refetch 시점 로그 (PC에서 클릭이 안 될 때 배경 갱신과 겹치는지 확인용)
  React.useEffect(() => {
    if (!deliveriesResponse?.data) return;
    console.log('[상차관리] 목록 데이터 갱신', {
      count: deliveriesResponse.data.length,
      dataUpdatedAt: dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null,
      at: new Date().toISOString(),
    });
  }, [deliveriesResponse?.data, dataUpdatedAt]);

  const getWarehouseName = (id?: number | null) => {
    if (!id) return '-';
    return warehouseMap.get(id) || '-';
  };

  const getDispatchCompanyName = (id?: number | null) => {
    if (!id) return '-';
    return dispatchCompanyMap.get(id) || '-';
  };

  const getStatusLabel = (status?: string | null) => {
    const statusValue = status || 'PENDING_DISPATCH';
    return statusMap.get(statusValue) || statusValue;
  };

  const columns: ColumnDef<SalesDelivery>[] = React.useMemo(() => [
    {
      accessorKey: 'orderNumber',
      header: '운송번호',
      cell: ({ row }) => <div className="text-sm font-mono">{row.original.orderNumber || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ row }) => {
        const status = row.original.status || 'PENDING_DISPATCH';
        const statusLabel = getStatusLabel(status);
        const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
          DISPATCH_COMPLETED: {
            variant: 'outline',
            className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300',
          },
          LOADING: {
            variant: 'outline',
            className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
          },
          LOADING_COMPLETED: {
            variant: 'outline',
            className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
          },
          UNLOADING_COMPLETED: {
            variant: 'outline',
            className: 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300',
          },
        };
        if (!status || !statusStyles[status]) {
          return (
            <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
              {statusLabel}
            </Badge>
          );
        }

        const style = statusStyles[status];
        return (
          <Badge variant={style.variant} className={style.className}>
            {statusLabel}
          </Badge>
        );
      },
      size: 80,
    },
    {
      accessorKey: 'dispatchCompany',
      header: '배차 업체',
      cell: ({ row }) => <div className="text-sm">{getDispatchCompanyName(row.original.dispatchCompanyId)}</div>,
      size: 100,
    },
    {
      accessorKey: 'vehicleNumber',
      header: '차량번호',
      cell: ({ row }) => <div className="text-sm">{row.original.vehicleNumber || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'loadingSchedule',
      header: '상차 일정',
      cell: ({ row }) => {
        const delivery = row.original;
        // 배차내역에 있으면 배차내역 상차일정(loadingDateTime), 없으면 배차정보(loadingItems) 상차일정
        if (delivery.loadingDateTime) {
          return <div className="text-sm">{formatDate(delivery.loadingDateTime)}</div>;
        }
        const loadingItems = delivery.loadingItems;
        if (!loadingItems || loadingItems.length === 0) return <div className="text-sm">-</div>;
        const firstItem = loadingItems[0];
        const schedule = firstItem.loadingSchedule;
        const time = firstItem.loadingScheduleTime;
        if (!schedule) return <div className="text-sm">-</div>;
        return (
          <div className="text-sm">
            {formatDate(schedule)}
            {time && ` ${time}`}
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'sales.customer',
      header: '업체명(대표자)',
      cell: ({ row }) => {
        const customer = row.original.sales?.customer;
        const companyName = customer?.companyName || '';
        const ceo = customer?.ceo || '';
        
        if (!companyName) return <div className="text-sm">-</div>;
        
        if (ceo) {
          return <div className="text-sm">{companyName} ({ceo})</div>;
        }
        return <div className="text-sm">{companyName}</div>;
      },
      size: 220,
    },
    {
      accessorKey: 'unloadingScheduleDate',
      header: '하차 일정',
      cell: ({ row }) => {
        const date = row.original.unloadingScheduleDate;
        const time = row.original.unloadingScheduleTime;
        if (!date) return <div className="text-sm">-</div>;
        return (
          <div className="text-sm">
            {formatDate(date)}
            {time && ` ${time}`}
          </div>
        );
      },
      size: 150,
    },
    {
      id: 'unloadingInfo',
      header: '하역 정보',
      cell: ({ row }) => {
        const { line1, line2 } = formatUnloadingInfoDisplay(row.original);
        if (line1 === '-' && !line2) {
          return <div className="text-sm text-muted-foreground">-</div>;
        }
        return (
          <div className="min-w-0 space-y-0.5 text-sm">
            <div className="truncate" title={line1}>
              {line1}
            </div>
            {line2 && (
              <div className="truncate text-xs text-muted-foreground" title={line2}>
                {line2}
              </div>
            )}
          </div>
        );
      },
      size: 118,
    },
    {
      accessorKey: 'createdByUser',
      header: '담당자',
      cell: ({ row }) => <div className="text-sm">{row.original.createdByUser?.name || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'createdAt',
      header: '등록일시',
      enableSorting: false,
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
      size: 120,
    },
  ], [warehouseMap, statusMap, dispatchCompanyMap, getWarehouseName, getDispatchCompanyName, getStatusLabel]);

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      {!isMobile && (
        <div className="flex w-full items-center gap-2 md:w-auto">
          <Label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
            검색
          </Label>
          <Input
            id="search"
            value={search}
            placeholder="업체명, 대표자명, 연락처, BL, 컨테이너, 고객명"
            className="w-48 md:w-60"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상태</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {selectedStatuses.size === 0
                ? '선택 안됨'
                : allFilterableStatusesSelected
                  ? '전체'
                  : `${selectedStatuses.size}개 선택됨`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 cursor-pointer rounded p-2 hover:bg-muted/50">
                <Checkbox
                  id="loading-status-filter-all"
                  checked={
                    statusOptionsForFilter.length > 0 &&
                    selectedStatuses.size === statusOptionsForFilter.length
                  }
                  onCheckedChange={(checked: boolean) => {
                    const validValues = statusOptionsForFilter.map((c) =>
                      String(c.value || c.name || '').trim(),
                    ).filter(Boolean);
                    if (checked) {
                      setSelectedStatuses(new Set(validValues));
                    } else {
                      setSelectedStatuses(new Set());
                    }
                    setPage(1);
                  }}
                />
                <Label
                  htmlFor="loading-status-filter-all"
                  className="flex-1 cursor-pointer text-sm font-medium"
                >
                  전체
                </Label>
              </div>
              {statusOptionsForFilter.map((code) => {
                const value = String(code.value || code.name || '').trim();
                if (!value) return null;
                return (
                  <div
                    key={value}
                    className="flex items-center space-x-2 cursor-pointer rounded p-2 hover:bg-muted/50"
                  >
                    <Checkbox
                      id={`loading-status-filter-${value}`}
                      checked={selectedStatuses.has(value)}
                      onCheckedChange={(checked: boolean) => {
                        const next = new Set(selectedStatuses);
                        if (checked) next.add(value);
                        else next.delete(value);
                        setSelectedStatuses(next);
                        setPage(1);
                      }}
                    />
                    <Label
                      htmlFor={`loading-status-filter-${value}`}
                      className="flex-1 cursor-pointer text-sm font-medium"
                    >
                      {code.name || code.value}
                    </Label>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {isMobile && (
        <div className="flex items-center gap-2">
          <Label htmlFor="mobileDateFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
            상차 일정
          </Label>
          <Select value={mobileDateFilter} onValueChange={handleMobileDateFilterChange}>
            <SelectTrigger id="mobileDateFilter" className="w-32">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="today">오늘</SelectItem>
              <SelectItem value="yesterday">어제</SelectItem>
              <SelectItem value="thisWeek">이번주</SelectItem>
              <SelectItem value="lastWeek">지난주</SelectItem>
              <SelectItem value="thisMonth">이번달</SelectItem>
              <SelectItem value="lastMonth">지난달</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {!isMobile && (
        <div className="flex items-center gap-2">
          <Label htmlFor="loadingDateRange" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
            상차 일정
          </Label>
          <DateRangePicker
            startDate={loadingStartDate || undefined}
            endDate={loadingEndDate || undefined}
            onChange={(start, end) => {
              setLoadingStartDate(start || null);
              setLoadingEndDate(end || null);
              setPage(1);
            }}
            className="w-48 md:w-60"
          />
        </div>
      )}
    </div>
  );

  // 모바일 카드뷰 렌더링 (데이터는 서버가 page/limit으로 이미 잘라 줌 — 클라이언트에서 또 slice 하지 않음)
  const renderMobileCardView = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (deliveries.length === 0) {
      return (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            배송 정보가 없습니다.
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {deliveries.map((delivery) => {
          const status = delivery.status || 'PENDING_DISPATCH';
          const statusLabel = getStatusLabel(status);
          const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
            DISPATCH_COMPLETED: {
              variant: 'outline',
              className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300',
            },
            LOADING: {
              variant: 'outline',
              className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
            },
            LOADING_COMPLETED: {
              variant: 'outline',
              className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
            },
            UNLOADING_COMPLETED: {
              variant: 'outline',
              className: 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300',
            },
          };
          const style = statusStyles[status] || { variant: 'outline' as const, className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300' };

          const customer = delivery.sales?.customer;
          const companyName = customer?.companyName || '-';
          const ceo = customer?.ceo || '';
          const customerDisplay = ceo ? `${companyName} (${ceo})` : companyName;

          const loadingItems = delivery.loadingItems || [];
          const firstLoadingItem = loadingItems[0];
          // 배차내역에 있으면 배차내역 상차일정(loadingDateTime), 없으면 배차정보(loadingItems) 상차일정
          const loadingScheduleDisplay = delivery.loadingDateTime
            ? formatDate(delivery.loadingDateTime)
            : firstLoadingItem?.loadingSchedule
              ? `${formatDate(firstLoadingItem.loadingSchedule)}${firstLoadingItem.loadingScheduleTime ? ` ${firstLoadingItem.loadingScheduleTime}` : ''}`
              : '-';

          return (
            <Card
              key={delivery.id}
              className="cursor-pointer transition-colors hover:bg-muted/50 py-0"
              onClick={() => handleRowClick(delivery)}
            >
              <CardContent className="p-3">
                <div className="mb-2">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-base truncate flex-1">
                      {customerDisplay}
                    </h3>
                    <Badge variant={style.variant} className={`text-xs flex-shrink-0 ${style.className || ''}`}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(delivery.createdAt)}
                  </span>
                </div>

                <Separator className="my-2" />
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">운송번호:</span>
                    <span className="font-mono">{delivery.orderNumber || '-'}</span>
                  </div>
                  {delivery.vehicleNumber && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground">차량번호:</span>
                      <span>{delivery.vehicleNumber}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">상차 일정:</span>
                    <span>{loadingScheduleDisplay}</span>
                  </div>
                  {delivery.unloadingScheduleDate && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground">하차 일정:</span>
                      <span>
                        {formatDate(delivery.unloadingScheduleDate)}
                        {delivery.unloadingScheduleTime && (
                          <span className="ml-1">{delivery.unloadingScheduleTime}</span>
                        )}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const sales = delivery.sales;
                    const main = salesUnloadingMainLine(sales ?? undefined);
                    const detail =
                      sales?.unloadingAddressDetail?.trim() || delivery.unloadingAddressDetail?.trim() || '';
                    const fullAddress = [main, detail].filter(Boolean).join(' ');
                    if (!fullAddress) return null;
                    return (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground">하차지:</span>
                        <span>{fullAddress}</span>
                      </div>
                    );
                  })()}
                  {(() => {
                    const { line1, line2 } = formatUnloadingInfoDisplay(delivery);
                    if (line1 === '-' && !line2) return null;
                    return (
                      <div className="flex items-start gap-2 w-full">
                        <span className="text-muted-foreground shrink-0">하역 정보:</span>
                        <span className="min-w-0 break-words text-sm">
                          {line1}
                          {line2 && (
                            <>
                              <span className="text-muted-foreground mx-1.5">·</span>
                              <span className="tabular-nums text-foreground">{line2}</span>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* 서버 페이지 이동 (totalPages는 API total 기준) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-4">
            <div className="text-sm text-muted-foreground">
              {total === 0
                ? '0'
                : `${((page - 1) * pageSize + 1).toLocaleString()}-${Math.min(page * pageSize, total).toLocaleString()}`}{' '}
              / {total.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                다음
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!authResolved) {
    return (
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    );
  }

  // 창고 미할당 시 대기 (다른 권한이 있어도 이 URL에서는 할당 창고가 없으면 목록 없음)
  if (!isLoadingWarehouse && warehouseId === null) {
    return (
      <AppLayout user={user}>
        <div className="space-y-3 min-w-0 max-w-full">
          <div className="flex items-center justify-between flex-shrink-0 min-w-0">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">상차관리</h1>
              <p className="text-sm text-muted-foreground mt-1">
                상차 작업을 관리합니다
              </p>
            </div>
          </div>
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                <CardTitle className="text-yellow-900 dark:text-yellow-100">
                  창고 설정 대기 중
                </CardTitle>
              </div>
              <CardDescription className="text-yellow-800 dark:text-yellow-200">
                현재 창고가 할당되지 않았습니다. 관리자에게 문의하여 창고를 설정해주세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-white dark:bg-gray-900 p-4 border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                  창고가 설정되면 할당된 상차 목록을 확인하고 입력할 수 있습니다.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      const result = await refetchWarehouse();
                      const newWarehouseId = result.data?.warehouseId || null;
                      if (newWarehouseId) {
                        toast({
                          title: '창고 설정 확인',
                          description: '창고가 설정되었습니다. 페이지를 새로고침합니다.',
                        });
                        setTimeout(() => {
                          window.location.reload();
                        }, 1000);
                      } else {
                        toast({
                          title: '확인 완료',
                          description: '아직 창고가 설정되지 않았습니다. 관리자에게 문의해주세요.',
                          variant: 'destructive',
                        });
                      }
                    }}
                    variant="outline"
                  >
                    새로고침
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-3 min-w-0 max-w-full">
        {/* 헤더 영역 */}
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between flex-shrink-0 min-w-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">상차관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              상차 작업을 관리합니다.
            </p>
          </div>
          {/* 데스크탑: 오른쪽 끝, 모바일: 제목 아래 */}
          <div className={`flex flex-col gap-2 ${isMobile ? 'mt-2' : 'md:items-end md:min-w-[200px]'}`}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isFetching ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>갱신 중...</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3" />
                    <span>마지막 갱신: {formatLastUpdate()}</span>
                  </>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refetch()}
                disabled={isFetching}
                className={`h-7 px-2 ${isMobile ? 'ml-auto' : ''}`}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
            </div>
            {/* 프로그래스 바: 다음 갱신까지 진행률 표시 */}
            <Progress 
              value={progressValue} 
              className="h-1.5 w-full"
            />
          </div>
        </div>

        {/* 모바일: 카드뷰, 데스크탑: 테이블 */}
        {isMobile ? (
          <>
            {/* 모바일 필터 컨트롤 */}
            {filterControls}
            <div className="min-h-0">
              {renderMobileCardView()}
            </div>
          </>
        ) : (
          <DataTable
            columns={columns}
            data={deliveries}
            isLoading={isLoading}
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
              Cookies.set('data-table-page-size', newSize.toString());
            }}
            manualPagination={true}
            enableSorting={true}
            filterControls={filterControls}
            onRowClick={handleRowClick}
            rowClassName="h-10"
          />
        )}

        {/* 상세 정보 Drawer */}
        {selectedDeliveryId && (
          <LoadingCompanyDeliveryDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              console.log('[상차관리] Drawer onOpenChange', { open, selectedDeliveryId, at: new Date().toISOString() });
              setDetailDrawerOpen(open);
              if (!open) {
                setSelectedDeliveryId(null);
              }
            }}
            deliveryId={selectedDeliveryId}
            title="상차관리 상세정보"
            description="상차 작업 정보를 확인하고 관리합니다."
            warehouseId={warehouseId}
            onSuccess={() => {
              // TODO: 목록 새로고침
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function LoadingManagementPage() {
  return (
    <Suspense fallback={
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    }>
      <LoadingManagementPageContent />
    </Suspense>
  );
}

