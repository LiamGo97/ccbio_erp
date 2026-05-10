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
import { DispatchCompanyDeliveryDetailDrawer } from '@/components/sales-delivery/dispatch-company-delivery-detail-drawer';
import { salesUnloadingMainLine } from '@/lib/sales-unloading-display';
import Cookies from 'js-cookie';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { useMyDispatchCompanyId } from '@/lib/hooks/use-dispatch-users';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { AlertCircle, Clock, Filter, RefreshCw, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { ko } from 'date-fns/locale';

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

function SalesDispatchManagementPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const searchParams = useSearchParams();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
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

  // 배차 업체 ID 조회
  const {
    data: dispatchCompanyData,
    isLoading: isLoadingCompany,
    refetch: refetchCompany,
  } = useMyDispatchCompanyId();
  const dispatchCompanyId = dispatchCompanyData?.dispatchCompanyId || null;

  // 배차 업체가 볼 수 있는 상태만 필터링: 배차 요청, 배차 중, 배차 완료, 배차 실패, 일정 조정
  const allowedStatuses = React.useMemo(() => {
    return ['DISPATCH_REQUESTED', 'DISPATCHING', 'DISPATCH_COMPLETED', 'FAILED', 'RESCHEDULED'];
  }, []);

  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');

  const statusFilterOptions = React.useMemo(
    () =>
      (statusCodes ?? [])
        .filter((code): code is typeof code & { value: string } => {
          if (!code.value) return false;
          return allowedStatuses.includes(code.value);
        })
        .map((c) => ({ value: c.value, label: c.name || c.value })),
    [statusCodes, allowedStatuses],
  );

  const statusOptionsKey = React.useMemo(
    () => statusFilterOptions.map((o) => o.value).sort().join('|'),
    [statusFilterOptions],
  );

  const [selectedStatuses, setSelectedStatuses] = React.useState<Set<string>>(
    () =>
      new Set([
        'DISPATCH_REQUESTED',
        'DISPATCHING',
        'DISPATCH_COMPLETED',
        'FAILED',
        'RESCHEDULED',
      ]),
  );

  React.useEffect(() => {
    if (statusFilterOptions.length === 0) return;
    setSelectedStatuses(new Set(statusFilterOptions.map((o) => o.value)));
  }, [statusOptionsKey]);

  const deliveryStatusesParam = React.useMemo((): string[] | undefined => {
    if (statusFilterOptions.length === 0) {
      return [...allowedStatuses];
    }
    if (selectedStatuses.size === 0) {
      return ['__none__'];
    }
    if (selectedStatuses.size === statusFilterOptions.length) {
      return statusFilterOptions.map((o) => o.value);
    }
    return Array.from(selectedStatuses);
  }, [statusFilterOptions, selectedStatuses, allowedStatuses]);

  // 배차 업체에 할당된 배송만 조회
  // 배차 업체 직원 화면: 30초마다 자동 갱신
  const REFETCH_INTERVAL = 30000; // 30초
  // dispatchCompanyId가 로드되고 실제 값이 있을 때만 호출 (불필요한 첫 번째 호출 방지)
  const { 
    data: deliveriesResponse, 
    isLoading, 
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useSalesDeliveries({
    page,
    limit: pageSize,
    statuses: deliveryStatusesParam,
    dispatchCompanyIds: dispatchCompanyId !== null ? [dispatchCompanyId] : undefined, // 배차 업체에 할당된 배송만
    search: search || undefined,
    sortBy: 'createdAt',
    sortOrder: 'DESC',
    enabled: !isLoadingCompany && dispatchCompanyId !== null, // 배차 업체 ID 로딩 완료되고 실제 값이 있을 때만 호출
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

  // "전체"를 선택했을 때도 필터에 있는 상태들만 표시하고, 상차일정 필터링도 적용
  const deliveries = React.useMemo(() => {
    let filtered = deliveriesResponse?.data || [];
    
    // 상태 필터링 (API와 동기; 상차일정만 추가로 클라이언트 필터)
    if (selectedStatuses.size === 0) {
      filtered = [];
    } else if (selectedStatuses.size === statusFilterOptions.length && statusFilterOptions.length > 0) {
      filtered = filtered.filter((delivery) => allowedStatuses.includes(delivery.status || ''));
    } else {
      filtered = filtered.filter((delivery) => delivery.status != null && selectedStatuses.has(delivery.status));
    }

    // 상차 일정 기간 필터링
    if (loadingStartDate || loadingEndDate) {
      filtered = filtered.filter((delivery) => {
        const loadingItems = delivery.loadingItems;
        if (!loadingItems || loadingItems.length === 0) return false;
        const firstItem = loadingItems[0];
        if (!firstItem.loadingSchedule) return false;
        
        const scheduleDate = new Date(firstItem.loadingSchedule);
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
  }, [
    deliveriesResponse?.data,
    selectedStatuses,
    statusFilterOptions.length,
    allowedStatuses,
    loadingStartDate,
    loadingEndDate,
  ]);
  
  // total 계산: 상태 필터나 상차일정 필터가 적용되면 필터링된 결과의 개수 사용
  const total = React.useMemo(() => {
    const allStatusesSelected =
      statusFilterOptions.length > 0 && selectedStatuses.size === statusFilterOptions.length;
    if (allStatusesSelected && !loadingStartDate && !loadingEndDate) {
      return deliveriesResponse?.total || 0;
    }
    return deliveries.length;
  }, [
    statusFilterOptions.length,
    selectedStatuses.size,
    loadingStartDate,
    loadingEndDate,
    deliveries.length,
    deliveriesResponse?.total,
  ]);

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));

  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });

  // 코드 맵 생성
  const requestVehicleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (requestVehicleCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [requestVehicleCodes]);

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
    setSelectedDeliveryId(delivery.id);
    setDetailDrawerOpen(true);
  };

  const getRequestVehicleName = (code?: string | null) => {
    if (!code) return '-';
    return requestVehicleMap.get(code) || code;
  };

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
          PENDING_DISPATCH: {
            variant: 'outline',
            className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
          },
          DISPATCH_REQUESTED: {
            variant: 'outline',
            className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
          },
          DISPATCH_ASSIGNED: {
            variant: 'outline',
            className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300',
          },
          LOADING_COMPLETED: {
            variant: 'outline',
            className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
          },
          UNLOADING_COMPLETED: {
            variant: 'outline',
            className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
          },
          CANCELLED: {
            variant: 'outline',
            className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
          },
          FAILED: {
            variant: 'outline',
            className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
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
      size: 100,
    },
    {
      accessorKey: 'dispatchCompany',
      header: '배차 업체',
      cell: ({ row }) => <div className="text-sm">{getDispatchCompanyName(row.original.dispatchCompanyId)}</div>,
      size: 120,
    },
    {
      accessorKey: 'requestVehicle',
      header: '요청 차량',
      cell: ({ row }) => <div className="text-sm">{getRequestVehicleName(row.original.requestVehicle)}</div>,
      size: 100,
    },
    {
      accessorKey: 'requestWeight',
      header: '요청 중량 (KG)',
      cell: ({ row }) => {
        const raw = row.original.requestWeight;
        if (raw == null || raw === '') return <div className="text-sm">-</div>;
        const mt = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
        if (Number.isNaN(mt)) return <div className="text-sm">-</div>;
        return <div className="text-sm">{formatNumber(Math.round(mt * 1000), 0)}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'loadingItems',
      header: '상차지',
      cell: ({ row }) => {
        const loadingItems = row.original.loadingItems;
        if (!loadingItems || loadingItems.length === 0) {
          return <div className="text-sm">-</div>;
        }
        const warehouseNames = loadingItems
          .map(item => item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId))
          .filter(name => name !== '-')
          .join(', ');
        return <div className="text-sm">{warehouseNames || '-'}</div>;
      },
      size: 150,
    },
    {
      accessorKey: 'loadingSchedule',
      header: '상차 일정',
      cell: ({ row }) => {
        const loadingItems = row.original.loadingItems;
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
      size: 180,
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
      size: 120,
    },
    {
      accessorKey: 'transportFee',
      header: '운송비',
      cell: ({ row }) => {
        const transportFee = row.original.transportFee;
        return (
          <div className="text-sm text-right">
            {transportFee != null ? `${formatNumber(transportFee)}원` : '-'}
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'weighingFee',
      header: '계근비',
      cell: ({ row }) => {
        const weighingFee = row.original.weighingFee;
        return (
          <div className="text-sm text-right">
            {weighingFee != null ? `${formatNumber(weighingFee)}원` : '-'}
          </div>
        );
      },
      size: 120,
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
  ], [requestVehicleMap, warehouseMap, statusMap, dispatchCompanyMap, getWarehouseName, getRequestVehicleName, getDispatchCompanyName, getStatusLabel]);

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
        <Label htmlFor="statusFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          상태
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" id="statusFilter" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">
                {statusFilterOptions.length === 0
                  ? '전체'
                  : selectedStatuses.size === statusFilterOptions.length
                    ? '전체'
                    : selectedStatuses.size === 0
                      ? '선택 안됨'
                      : `${selectedStatuses.size}개 선택됨`}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                <Checkbox
                  id="dispatch-company-status-all"
                  checked={
                    statusFilterOptions.length === 0 ||
                    selectedStatuses.size === statusFilterOptions.length
                  }
                  onCheckedChange={(checked: boolean) => {
                    if (checked) {
                      setSelectedStatuses(new Set(statusFilterOptions.map((o) => o.value)));
                    } else {
                      setSelectedStatuses(new Set());
                    }
                    setPage(1);
                  }}
                />
                <Label htmlFor="dispatch-company-status-all" className="text-sm font-medium cursor-pointer flex-1">
                  전체
                </Label>
              </div>
              {statusFilterOptions.map((opt) => (
                <div
                  key={opt.value}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                >
                  <Checkbox
                    id={`dispatch-company-status-${opt.value.replace(/[^a-zA-Z0-9_-]/g, '_')}`}
                    checked={selectedStatuses.has(opt.value)}
                    onCheckedChange={(checked: boolean) => {
                      const next = new Set(selectedStatuses);
                      if (checked) next.add(opt.value);
                      else next.delete(opt.value);
                      setSelectedStatuses(next);
                      setPage(1);
                    }}
                  />
                  <Label
                    htmlFor={`dispatch-company-status-${opt.value.replace(/[^a-zA-Z0-9_-]/g, '_')}`}
                    className="text-sm font-medium cursor-pointer flex-1"
                  >
                    {opt.label}
                  </Label>
                </div>
              ))}
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

  const selectedDelivery = React.useMemo(() => {
    if (!selectedDeliveryId) return null;
    return deliveries.find(d => d.id === selectedDeliveryId) || null;
  }, [selectedDeliveryId, deliveries]);

  // 모바일 카드뷰 렌더링 (데이터는 서버 page/limit으로 이미 분할됨)
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
            PENDING_DISPATCH: {
              variant: 'outline',
              className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
            },
            DISPATCH_REQUESTED: {
              variant: 'outline',
              className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
            },
            DISPATCH_ASSIGNED: {
              variant: 'outline',
              className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300',
            },
            LOADING_COMPLETED: {
              variant: 'outline',
              className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
            },
            UNLOADING_COMPLETED: {
              variant: 'outline',
              className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
            },
            CANCELLED: {
              variant: 'outline',
              className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
            },
            FAILED: {
              variant: 'outline',
              className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
            },
          };
          const style = statusStyles[status] || { variant: 'outline' as const, className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300' };

          const customer = delivery.sales?.customer;
          const companyName = customer?.companyName || '-';
          const ceo = customer?.ceo || '';
          const customerDisplay = ceo ? `${companyName} (${ceo})` : companyName;

          const loadingItems = delivery.loadingItems || [];
          const warehouseNames = loadingItems
            .map(item => item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId))
            .filter(name => name !== '-')
            .join(', ') || '-';

          const firstLoadingItem = loadingItems[0];
          const loadingSchedule = firstLoadingItem?.loadingSchedule;
          const loadingScheduleTime = firstLoadingItem?.loadingScheduleTime;
          const loadingScheduleDisplay = loadingSchedule 
            ? `${formatDate(loadingSchedule)}${loadingScheduleTime ? ` ${loadingScheduleTime}` : ''}`
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
                  {(delivery.vehicleNumber || delivery.driverContact || delivery.driverName || delivery.entryTime || delivery.transportFee != null || delivery.weighingFee != null) && (
                    <div className="mt-2 space-y-1 text-sm">
                      {delivery.vehicleNumber && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">차량번호:</span>
                          <span>{delivery.vehicleNumber}</span>
                        </div>
                      )}
                      {delivery.driverContact && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">운송차 연락처:</span>
                          <span>{formatPhone(delivery.driverContact)}</span>
                        </div>
                      )}
                      {delivery.driverName && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">기사명:</span>
                          <span>{delivery.driverName}</span>
                        </div>
                      )}
                      {delivery.entryTime && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">입차예정시간:</span>
                          <span>{delivery.entryTime}</span>
                        </div>
                      )}
                      {delivery.transportFee != null && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">운송비:</span>
                          <span>{typeof delivery.transportFee === 'number' 
                            ? `${(delivery.transportFee / 10000).toLocaleString('ko-KR')}만원`
                            : `${(Number(delivery.transportFee) / 10000).toLocaleString('ko-KR')}만원`}</span>
                        </div>
                      )}
                      {delivery.weighingFee != null && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">계근비:</span>
                          <span>{typeof delivery.weighingFee === 'number' 
                            ? `${(delivery.weighingFee / 10000).toLocaleString('ko-KR')}만원`
                            : `${(Number(delivery.weighingFee) / 10000).toLocaleString('ko-KR')}만원`}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {(delivery.loadingDateTime || delivery.unloadingDateTime) && (
                  <div className="mt-2 space-y-1 text-sm">
                    {delivery.loadingDateTime && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground">상차일시:</span>
                        <span>{delivery.loadingDateTime}</span>
                      </div>
                    )}
                    {delivery.unloadingDateTime && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground">하차일시:</span>
                        <span>{delivery.unloadingDateTime}</span>
                      </div>
                    )}
                  </div>
                )}

                <Separator className="my-2" />
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">운송번호:</span>
                    <span className="font-mono">{delivery.orderNumber || '-'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">요청 차량:</span>
                    <span>{getRequestVehicleName(delivery.requestVehicle)}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">상차지:</span>
                    <span>{warehouseNames}</span>
                  </div>
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
                </div>
              </CardContent>
            </Card>
          );
        })}

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

  // 배차 업체 미설정 시 대기 페이지 표시
  if (!isLoadingCompany && dispatchCompanyId === null) {
    return (
      <AppLayout user={user}>
        <div className="space-y-3 min-w-0 max-w-full">
          <div className="flex items-center justify-between flex-shrink-0 min-w-0">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">배차관리</h1>
              <p className="text-sm text-muted-foreground mt-1">
                배차 요청 상태의 배송을 관리합니다
              </p>
            </div>
          </div>
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                <CardTitle className="text-yellow-900 dark:text-yellow-100">
                  배차 업체 설정 대기 중
                </CardTitle>
              </div>
              <CardDescription className="text-yellow-800 dark:text-yellow-200">
                현재 배차 업체가 할당되지 않았습니다. 관리자에게 문의하여 배차 업체를 설정해주세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-white dark:bg-gray-900 p-4 border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                  배차 업체가 설정되면 할당된 배차 목록을 확인하고 입력할 수 있습니다.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      const result = await refetchCompany();
                      const newCompanyId = result.data?.dispatchCompanyId || null;
                      if (newCompanyId) {
                        toast({
                          title: '배차 업체 설정 확인',
                          description: '배차 업체가 설정되었습니다. 페이지를 새로고침합니다.',
                        });
                        setTimeout(() => {
                          window.location.reload();
                        }, 1000);
                      } else {
                        toast({
                          title: '확인 완료',
                          description: '아직 배차 업체가 설정되지 않았습니다. 관리자에게 문의해주세요.',
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

  if (!user) {
    return (
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
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
            <h1 className="text-2xl font-bold tracking-tight">배차관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              배차 요청 상태의 배송을 관리합니다.
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
          <DispatchCompanyDeliveryDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                setSelectedDeliveryId(null);
              }
            }}
            deliveryId={selectedDeliveryId}
            title="배차관리 상세정보"
            description="배차 요청 배송 정보를 확인하고 관리합니다."
            onSuccess={() => {
              // TODO: 목록 새로고침
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function SalesDispatchManagementPage() {
  return (
    <Suspense fallback={
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    }>
      <SalesDispatchManagementPageContent />
    </Suspense>
  );
}
