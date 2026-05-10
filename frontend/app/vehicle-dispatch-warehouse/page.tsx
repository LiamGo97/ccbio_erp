'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  VehicleDispatch,
  useVehicleDispatches,
} from '@/lib/hooks/use-vehicle-dispatch';
import { VehicleDispatchUserFormDrawer } from '@/components/vehicle-dispatch/vehicle-dispatch-user-form-drawer';
import { VehicleDispatchDetailDrawer } from '@/components/vehicle-dispatch/vehicle-dispatch-detail-drawer';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useMyWarehouseId } from '@/lib/hooks/use-warehouse-users';
import { AlertCircle, Loader2, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import Cookies from 'js-cookie';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

type WarehouseDetailDrawerProps = React.ComponentProps<typeof VehicleDispatchDetailDrawer> & {
  visibleWarehouseId?: number;
  showWorkFields?: boolean;
};
const WarehouseDetailDrawer = VehicleDispatchDetailDrawer as React.ComponentType<WarehouseDetailDrawerProps>;

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

export default function VehicleDispatchWarehousePage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedVehicleDispatch, setSelectedVehicleDispatch] = React.useState<VehicleDispatch | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedVehicleDispatchId, setSelectedVehicleDispatchId] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [mobileDateFilter, setMobileDateFilter] = React.useState<string>('all');
  const [loadingStartDate, setLoadingStartDate] = React.useState<Date | null>(null);
  const [loadingEndDate, setLoadingEndDate] = React.useState<Date | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
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
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // 월요일
        startDate = new Date(today.setDate(diff));
        endDate = new Date();
        break;
      }
      case 'lastWeek': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // 이번주 월요일
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(diff - 7);
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(diff - 1);
        startDate = lastWeekStart;
        endDate = lastWeekEnd;
        break;
      }
      case 'thisMonth': {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date();
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

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 창고 ID 조회
  const {
    data: warehouseData,
    isLoading: isLoadingWarehouse,
    refetch: refetchWarehouse,
  } = useMyWarehouseId();
  const warehouseId = warehouseData?.warehouseId || null;

  // 창고에 할당된 배차만 조회
  // 창고 업체 직원 화면: 30초마다 자동 갱신
  const REFETCH_INTERVAL = 30000; // 30초
  const { 
    data: vehicleDispatches = [], 
    isLoading, 
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useVehicleDispatches(
    warehouseId !== null ? { loadingWarehouseId: warehouseId } : undefined,
    { refetchInterval: REFETCH_INTERVAL }, // 30초마다 자동 갱신
  );

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

  // 다음 갱신까지 남은 시간 계산 및 프로그래스 바 값 (프로gress만 사용)
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
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: statusCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_STATUS');
  const { data: warehouses = [] } = useWarehouses({ status: true });

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

  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (statusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [statusCodes]);

  const warehouseMap = React.useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach((wh) => {
      if (wh.id) map.set(wh.id, wh.name || '');
    });
    return map;
  }, [warehouses]);

  // 창고에 할당된 배차만 필터링
  const filteredDispatches = React.useMemo(() => {
    let filtered = vehicleDispatches;
    
    // 창고 ID로 필터링 (백엔드에서 처리되지만, 추가 필터링)
    if (warehouseId) {
      filtered = filtered.filter(
        (dispatch) =>
          dispatch.loadingWarehouseId === warehouseId ||
          (dispatch.loadingItems || []).some((item) => item.loadingWarehouseId === warehouseId)
      );
    }
    
    // 검색 필터링
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((dispatch) => {
        const companyName = dispatch.companyName?.toLowerCase() || '';
        const representativeName = dispatch.representativeName?.toLowerCase() || '';
        const phone = dispatch.phone?.toLowerCase() || '';
        const requestBL = dispatch.requestBL?.toLowerCase() || '';
        const requestContainer = dispatch.requestContainer?.toLowerCase() || '';
        return (
          companyName.includes(searchLower) ||
          representativeName.includes(searchLower) ||
          phone.includes(searchLower) ||
          requestBL.includes(searchLower) ||
          requestContainer.includes(searchLower)
        );
      });
    }

    // 상차 일정 기간 필터링
    if (loadingStartDate || loadingEndDate) {
      filtered = filtered.filter((dispatch) => {
        if (!dispatch.loadingSchedule) return false;
        const scheduleDate = new Date(dispatch.loadingSchedule);
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

    // 상태 필터링
    // 창고 업체 권한: 배차 중, 배차 완료, 상차 중, 상차 완료, 하차 완료 표시
    const allowedStatuses = ['DISPATCHING', 'DISPATCH_COMPLETED', 'ASSIGNED', 'LOADING_COMPLETED', 'UNLOADING_COMPLETED'];
    filtered = filtered.filter((dispatch) => {
      const status = dispatch.status || 'DRAFT';
      // 허용된 상태만 표시
      if (!allowedStatuses.includes(status)) {
        return false;
      }
      // 특정 상태 필터가 선택된 경우 추가 필터링
      if (statusFilter !== 'all') {
        return status === statusFilter;
      }
      return true;
    });
    
    return filtered;
  }, [vehicleDispatches, search, loadingStartDate, loadingEndDate, statusFilter, warehouseId]);

  const handleRowClick = (dispatch: VehicleDispatch) => {
    setSelectedVehicleDispatchId(dispatch.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (dispatch: VehicleDispatch) => {
    setSelectedVehicleDispatch(dispatch);
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleFormSubmit = async () => {
    await refetch();
  };

  const columns = React.useMemo<ColumnDef<VehicleDispatch>[]>(() => {
    return [
      {
        accessorKey: 'status',
        header: '상태',
        enableSorting: false,
        cell: ({ row }) => {
          const status = row.original.status || 'DRAFT';
          const statusLabel = statusMap.get(status) || status;
          const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
            DRAFT: {
              variant: 'outline',
              className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
            },
            DISPATCHING: {
              variant: 'outline',
              className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
            },
            DISPATCH_COMPLETED: {
              variant: 'outline',
              className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300',
            },
            ASSIGNED: {
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
            FAILED: {
              variant: 'outline',
              className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
            },
            RESCHEDULED: {
              variant: 'outline',
              className: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
            },
          };
          const style = statusStyles[status] || { variant: 'secondary' as const };
          return (
            <Badge variant={style.variant} className={style.className}>
              {statusLabel}
            </Badge>
          );
        },
        size: 100,
      },
      {
        accessorKey: 'orderNumber',
        header: '운송번호',
        cell: ({ row }) => <div className="text-sm">{row.original.orderNumber || '-'}</div>,
        size: 120,
      },
      {
        accessorKey: 'companyName',
        header: '업체명',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.companyName || '-'}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'requestVehicle',
        header: '요청 차량',
        enableSorting: false,
        cell: ({ row }) => {
          const vehicleCode = row.original.requestVehicle;
          const vehicleName = vehicleCode ? requestVehicleMap.get(vehicleCode) || vehicleCode : '-';
          return <div className="text-sm">{vehicleName}</div>;
        },
        size: 120,
      },
      {
        accessorKey: 'loadingSchedule',
        header: '상차 일정',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{formatDate(row.original.loadingSchedule)}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'unloadingScheduleDate',
        header: '하차 일정',
        enableSorting: false,
        cell: ({ row }) => {
          const date = formatDate(row.original.unloadingScheduleDate);
          const time = row.original.unloadingScheduleTime;
          return (
            <div className="text-sm">
              {date !== '-' && <div>{date}</div>}
              {time && <div className="text-xs text-muted-foreground">{time}</div>}
            </div>
          );
        },
        size: 140,
      },
      {
        accessorKey: 'vehicleNumber',
        header: '차량번호',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.vehicleNumber || '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'driverContact',
        header: '운송차 연락처',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{formatPhone(row.original.driverContact)}</div>
        ),
        size: 130,
      },
      {
        accessorKey: 'entryTime',
        header: '입차예정시간',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.entryTime || '-'}</div>
        ),
        size: 140,
      },
      {
        accessorKey: 'createdByUser',
        header: '등록자',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.createdByUser?.name || '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        enableSorting: false,
        cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
        size: 120,
      },
    ];
  }, [requestVehicleMap, statusMap]);

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
            placeholder="업체명, 대표자명, 연락처, BL, 컨테이너"
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
        <Select value={statusFilter} onValueChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}>
          <SelectTrigger id="statusFilter" className="w-32">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {React.useMemo(() => {
              // 창고 업체 권한: DISPATCHING, DISPATCH_COMPLETED, ASSIGNED, LOADING_COMPLETED, UNLOADING_COMPLETED 표시
              // 순서: 배차 중 → 배차 완료 → 상차 중 → 상차 완료 → 하차 완료
              const allowedStatuses = ['DISPATCHING', 'DISPATCH_COMPLETED', 'ASSIGNED', 'LOADING_COMPLETED', 'UNLOADING_COMPLETED'];
              const statusOrder = ['DISPATCHING', 'DISPATCH_COMPLETED', 'ASSIGNED', 'LOADING_COMPLETED', 'UNLOADING_COMPLETED'];
              return (statusCodes ?? [])
                .filter((code) => {
                  if (!code.value) return false;
                  return allowedStatuses.includes(code.value.toUpperCase());
                })
                .sort((a, b) => {
                  const aIndex = statusOrder.indexOf(a.value?.toUpperCase() || '');
                  const bIndex = statusOrder.indexOf(b.value?.toUpperCase() || '');
                  if (aIndex === -1 && bIndex === -1) return 0;
                  if (aIndex === -1) return 1;
                  if (bIndex === -1) return -1;
                  return aIndex - bIndex;
                })
                .map((code) => (
                  <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                    {code.name || code.value}
                  </SelectItem>
                ));
            }, [statusCodes])}
          </SelectContent>
        </Select>
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
        <>
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
        </>
      )}
    </div>
  );

  // 페이지네이션된 데이터
  const paginatedDispatches = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredDispatches.slice(start, end);
  }, [filteredDispatches, page, pageSize]);

  // 모바일 카드뷰 렌더링
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

    if (paginatedDispatches.length === 0) {
      return (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            배차 정보가 없습니다.
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {paginatedDispatches.map((dispatch) => {
          const vehicleCode = dispatch.requestVehicle;
          const vehicleName = vehicleCode ? requestVehicleMap.get(vehicleCode) || vehicleCode : '-';
          const warehouseId = dispatch.loadingWarehouseId;
          const warehouseName = warehouseId ? warehouseMap.get(warehouseId) || '-' : '-';
          const status = dispatch.status || 'DRAFT';
          const statusLabel = statusMap.get(status) || status;
          
          // 창고 직원 입력 정보 (workBL, workContainer는 dispatch 레벨에서 가져오기)
          const workBL = dispatch.workBL;
          const workContainer = dispatch.workContainer;
          const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
            DRAFT: {
              variant: 'outline',
              className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
            },
            DISPATCHING: {
              variant: 'outline',
              className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
            },
            DISPATCH_COMPLETED: {
              variant: 'outline',
              className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300',
            },
            ASSIGNED: {
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
            FAILED: {
              variant: 'outline',
              className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
            },
            RESCHEDULED: {
              variant: 'outline',
              className: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
            },
          };
          const style = statusStyles[status] || { variant: 'secondary' as const };

          return (
            <Card
              key={dispatch.id}
              className="cursor-pointer transition-colors hover:bg-muted/50 py-0"
              onClick={() => handleRowClick(dispatch)}
            >
              <CardContent className="p-3">
                <div className="mb-2">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-base truncate flex-1">
                      {dispatch.companyName || '-'}
                    </h3>
                    <Badge variant={style.variant} className={`text-xs flex-shrink-0 ${style.className || ''}`}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(dispatch.createdAt)}
                  </span>
                  {(dispatch.vehicleNumber || dispatch.driverContact || dispatch.entryTime) && (
                    <div className="mt-2 space-y-1 text-sm">
                      {dispatch.vehicleNumber && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">차량번호:</span>
                          <span>{dispatch.vehicleNumber}</span>
                        </div>
                      )}
                      {dispatch.driverContact && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">운송차 연락처:</span>
                          <span>{formatPhone(dispatch.driverContact)}</span>
                        </div>
                      )}
                      {dispatch.entryTime && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground">입차예정시간:</span>
                          <span>{dispatch.entryTime}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(workBL || workContainer) && (
                    <>
                      <Separator className="my-2" />
                      <div className="mt-2 space-y-1 text-sm">
                        {workBL && (
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground">작업 BL:</span>
                            <span>{workBL}</span>
                          </div>
                        )}
                        {workContainer && (
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground">작업 컨테이너:</span>
                            <span>{workContainer}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <Separator className="my-2" />
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">요청 차량:</span>
                    <span>{vehicleName}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">상차지:</span>
                    <span>{warehouseName}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">상차 일정:</span>
                    <span>{formatDate(dispatch.loadingSchedule)}</span>
                  </div>
                  {dispatch.unloadingScheduleDate && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground">하차 일정:</span>
                      <span>
                        {formatDate(dispatch.unloadingScheduleDate)}
                        {dispatch.unloadingScheduleTime && (
                          <span className="ml-1">{dispatch.unloadingScheduleTime}</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* 페이지네이션 */}
        {filteredDispatches.length > pageSize && (
          <div className="flex items-center justify-between gap-2 pt-4">
            <div className="text-sm text-muted-foreground">
              {((page - 1) * pageSize + 1).toLocaleString()}-
              {Math.min(page * pageSize, filteredDispatches.length).toLocaleString()} /{' '}
              {filteredDispatches.length.toLocaleString()}
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
                onClick={() => setPage((p) => Math.min(Math.ceil(filteredDispatches.length / pageSize), p + 1))}
                disabled={page >= Math.ceil(filteredDispatches.length / pageSize)}
              >
                다음
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 창고 미설정 시 대기 페이지 표시
  if (!isLoadingWarehouse && warehouseId === null) {
    return (
      <AppLayout user={user}>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">배차 관리</h1>
              <p className="text-sm text-muted-foreground">할당된 배차 정보를 조회하고 입력합니다.</p>
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
                  창고가 설정되면 할당된 배차 목록을 확인하고 입력할 수 있습니다.
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
                        });
                      }
                    }}
                    variant="default"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    확인
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
      <div className="space-y-4 pb-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">상차 관리</h1>
            <p className="text-sm text-muted-foreground">할당된 상차 정보를 조회하고 입력합니다.</p>
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
            data={filteredDispatches}
            isLoading={isLoading}
            filterControls={filterControls}
            onRowClick={handleRowClick}
            page={page}
            pageSize={pageSize}
            total={filteredDispatches.length}
            totalPages={Math.max(1, Math.ceil(filteredDispatches.length / pageSize))}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            rowClassName="h-10"
          />
        )}

        <VehicleDispatchUserFormDrawer
          open={drawerOpen}
          onOpenChange={(open: boolean) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedVehicleDispatch(null);
            }
          }}
          vehicleDispatch={selectedVehicleDispatch}
          onSubmit={handleFormSubmit}
          onCancel={
            selectedVehicleDispatch
              ? () => {
                  setDrawerOpen(false);
                  setSelectedVehicleDispatchId(selectedVehicleDispatch.id);
                  setDetailDrawerOpen(true);
                }
              : undefined
          }
          warehouseId={warehouseId ?? undefined}
        />

        <WarehouseDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open: boolean) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedVehicleDispatchId(null);
            }
          }}
          vehicleDispatchId={selectedVehicleDispatchId}
          visibleWarehouseId={warehouseId ?? undefined}
          showWorkFields={true}
          onEdit={handleEdit}
        />
      </div>
    </AppLayout>
  );
}

