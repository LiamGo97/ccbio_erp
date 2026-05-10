'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2, XCircle, RefreshCw, Loader2, Clock } from 'lucide-react';

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
  useDeleteVehicleDispatch,
} from '@/lib/hooks/use-vehicle-dispatch';
import { VehicleDispatchFormDrawer } from '@/components/vehicle-dispatch/vehicle-dispatch-form-drawer';
import { VehicleDispatchDetailDrawer } from '@/components/vehicle-dispatch/vehicle-dispatch-detail-drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AxiosError } from 'axios';
import Cookies from 'js-cookie';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { DateRangePicker } from '@/components/schedules/date-range-picker';

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

export default function VehicleDispatchPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedVehicleDispatch, setSelectedVehicleDispatch] = React.useState<VehicleDispatch | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedVehicleDispatchId, setSelectedVehicleDispatchId] = React.useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [vehicleDispatchToDelete, setVehicleDispatchToDelete] = React.useState<VehicleDispatch | null>(null);
  const [search, setSearch] = React.useState('');
  const [loadingStartDate, setLoadingStartDate] = React.useState<Date | null>(null);
  const [loadingEndDate, setLoadingEndDate] = React.useState<Date | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const [selectedDispatchType, setSelectedDispatchType] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const isMobile = useIsMobile();

  // 관리자 배차 관리 화면: 30초마다 자동 갱신
  const REFETCH_INTERVAL = 30000; // 30초
  const { 
    data: vehicleDispatches = [], 
    isLoading, 
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useVehicleDispatches(
    undefined,
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
  const deleteMutation = useDeleteVehicleDispatch();
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: statusCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_STATUS');
  const { data: editableStatusByRoleCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_EDITABLE_STATUS_BY_ROLE');
  const { data: dispatchTypeCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_TYPE');
  const { data: warehouses = [], refetch: refetchWarehouses } = useWarehouses({ status: true });
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

  // 요청 차량에서 배차 타입 판단 함수
  const getDispatchType = React.useCallback((requestVehicle?: string | null): 'CARGO' | 'CONTAINER' => {
    return requestVehicle === 'CONTAINER' ? 'CONTAINER' : 'CARGO';
  }, []);

  // 검색 및 배차 타입 필터링
  const filteredDispatches = React.useMemo(() => {
    let filtered = vehicleDispatches;

    // 배차 타입 필터링 (카고/컨테이너)
    if (selectedDispatchType !== 'all') {
      filtered = filtered.filter((dispatch) => {
        const dispatchType = getDispatchType(dispatch.requestVehicle);
        return dispatchType === selectedDispatchType;
      });
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
    // 관리자: 모든 상태 표시
    filtered = filtered.filter((dispatch) => {
      const status = dispatch.status || 'DRAFT';
      // 특정 상태 필터가 선택된 경우 추가 필터링
      if (statusFilter !== 'all') {
        return status === statusFilter;
      }
      return true;
    });

    return filtered;
  }, [vehicleDispatches, search, selectedDispatchType, loadingStartDate, loadingEndDate, statusFilter, getDispatchType]);

  const handleCreate = () => {
    setSelectedVehicleDispatch(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleRowClick = (dispatch: VehicleDispatch) => {
    setSelectedVehicleDispatchId(dispatch.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (dispatch: VehicleDispatch) => {
    setSelectedVehicleDispatch(dispatch);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleDelete = (dispatch: VehicleDispatch) => {
    setVehicleDispatchToDelete(dispatch);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!vehicleDispatchToDelete) return;
    try {
      await deleteMutation.mutateAsync(vehicleDispatchToDelete.id);
      toast({
        title: '배차 삭제 완료',
        description: '배차 정보를 삭제했습니다.',
      });
      setDeleteDialogOpen(false);
      setVehicleDispatchToDelete(null);
      if (selectedVehicleDispatchId === vehicleDispatchToDelete.id) {
        setDetailDrawerOpen(false);
        setSelectedVehicleDispatchId(null);
      }
      await refetch();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const message =
        axiosError?.response?.data?.message ??
        (error as Error)?.message ??
        '배차 삭제 중 오류가 발생했습니다.';
      toast({
        title: '삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
  };

  const handleFormSubmit = async () => {
    // form-drawer에서 직접 처리하므로 여기서는 refetch만 수행
    // 약간의 지연을 두어 서버에서 데이터가 완전히 업데이트되도록 함
    await new Promise(resolve => setTimeout(resolve, 300));
    // 배차 목록 갱신 (useUpdateVehicleDispatch의 onSuccess에서도 refetchQueries가 호출되지만, 확실하게 하기 위해)
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
          // 배차 업체 직원 화면과 동일한 배지 색상 적용
          const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
            DRAFT: {
              variant: 'outline',
              className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
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
        accessorKey: 'companyName',
        header: '업체명',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm font-semibold">{row.original.companyName || '-'}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'dispatchCompanyId',
        header: '배차 업체',
        enableSorting: false,
        cell: ({ row }) => {
          const dispatchCompanyId = row.original.dispatchCompanyId;
          const dispatchCompanyName = dispatchCompanyId
            ? dispatchCompanyMap.get(dispatchCompanyId) || row.original.dispatchCompany?.name || '-'
            : '-';
          return <div className="text-sm">{dispatchCompanyName}</div>;
        },
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
        accessorKey: 'loadingWarehouseId',
        header: '상차지',
        enableSorting: false,
        cell: ({ row }) => {
          const warehouseId = row.original.loadingWarehouseId;
          const warehouseName = warehouseId ? warehouseMap.get(warehouseId) || '-' : '-';
          return <div className="text-sm">{warehouseName}</div>;
        },
        size: 150,
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
        accessorKey: 'unloadingAddress',
        header: '하차지',
        enableSorting: false,
        cell: ({ row }) => {
          const address = row.original.unloadingAddress;
          const addressDetail = row.original.unloadingAddressDetail;
          if (!address && !addressDetail) return <div className="text-sm text-muted-foreground">-</div>;
          return (
            <div className="text-sm">
              {address && <div className="line-clamp-1">{address}</div>}
              {addressDetail && <div className="text-xs text-muted-foreground line-clamp-1">{addressDetail}</div>}
            </div>
          );
        },
        size: 200,
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
        accessorKey: 'driverName',
        header: '기사명',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.driverName || '-'}</div>
        ),
        size: 100,
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
        accessorKey: 'transportFee',
        header: '운송비',
        enableSorting: false,
        cell: ({ row }) => {
          const fee = row.original.transportFee;
          return (
            <div className="text-sm">
              {fee !== null && fee !== undefined
                ? `${(fee / 10000).toLocaleString('ko-KR')}만원`
                : '-'}
            </div>
          );
        },
        size: 120,
      },
      {
        accessorKey: 'weighingFee',
        header: '계근비',
        enableSorting: false,
        cell: ({ row }) => {
          const fee = row.original.weighingFee;
          return (
            <div className="text-sm">
              {fee !== null && fee !== undefined
                ? `${(fee / 10000).toLocaleString('ko-KR')}만원`
                : '-'}
            </div>
          );
        },
        size: 120,
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
  }, [requestVehicleMap, warehouseMap, dispatchCompanyMap, statusMap]);

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
          const dispatchCompanyId = dispatch.dispatchCompanyId;
          const dispatchCompanyName = dispatchCompanyId ? dispatchCompanyMap.get(dispatchCompanyId) || '-' : '-';
          const status = dispatch.status || 'DRAFT';
          const statusLabel = statusMap.get(status) || status;
          const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
            DRAFT: {
              variant: 'outline',
              className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
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
                  {(dispatch.vehicleNumber || dispatch.driverContact || dispatch.entryTime || dispatch.transportFee || dispatch.weighingFee) && (
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {dispatch.vehicleNumber && (
                        <div>차량번호: {dispatch.vehicleNumber}</div>
                      )}
                      {dispatch.driverContact && (
                        <div>운송차 연락처: {formatPhone(dispatch.driverContact)}</div>
                      )}
                      {dispatch.entryTime && (
                        <div>입차예정시간: {dispatch.entryTime}</div>
                      )}
                      {dispatch.transportFee !== null && dispatch.transportFee !== undefined && (
                        <div>운송비: {typeof dispatch.transportFee === 'number' 
                          ? `${(dispatch.transportFee / 10000).toLocaleString('ko-KR')}만원`
                          : `${(Number(dispatch.transportFee) / 10000).toLocaleString('ko-KR')}만원`}</div>
                      )}
                      {dispatch.weighingFee !== null && dispatch.weighingFee !== undefined && (
                        <div>계근비: {typeof dispatch.weighingFee === 'number' 
                          ? `${(dispatch.weighingFee / 10000).toLocaleString('ko-KR')}만원`
                          : `${(Number(dispatch.weighingFee) / 10000).toLocaleString('ko-KR')}만원`}</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[80px]">배차 업체:</span>
                    <span className="flex-1">{dispatchCompanyName}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[80px]">요청 차량:</span>
                    <span className="flex-1">{vehicleName}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[80px]">상차지:</span>
                    <span className="flex-1">{warehouseName}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[80px]">상차 일정:</span>
                    <span className="flex-1">{formatDate(dispatch.loadingSchedule)}</span>
                  </div>
                  {dispatch.unloadingScheduleDate && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[80px]">하차 일정:</span>
                      <span className="flex-1">
                        {formatDate(dispatch.unloadingScheduleDate)}
                        {dispatch.unloadingScheduleTime && (
                          <span className="text-muted-foreground ml-1">
                            {dispatch.unloadingScheduleTime}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {(dispatch.unloadingAddress || dispatch.unloadingAddressDetail) && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[80px]">하차지:</span>
                      <span className="flex-1">
                        {dispatch.unloadingAddress && (
                          <div className="line-clamp-1">{dispatch.unloadingAddress}</div>
                        )}
                        {dispatch.unloadingAddressDetail && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {dispatch.unloadingAddressDetail}
                          </div>
                        )}
                      </span>
                    </div>
                  )}
                  {dispatch.vehicleNumber && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[80px]">차량번호:</span>
                      <span className="flex-1">{dispatch.vehicleNumber}</span>
                    </div>
                  )}
                  {dispatch.driverName && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[80px]">기사명:</span>
                      <span className="flex-1">{dispatch.driverName}</span>
                    </div>
                  )}
                  {dispatch.driverContact && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[80px]">운송차 연락처:</span>
                      <span className="flex-1">{formatPhone(dispatch.driverContact)}</span>
                    </div>
                  )}
                  {dispatch.entryTime && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[80px]">입차예정시간:</span>
                      <span className="flex-1">{dispatch.entryTime}</span>
                    </div>
                  )}
                  {dispatch.transportFee !== null && dispatch.transportFee !== undefined && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[80px]">운송비:</span>
                      <span className="flex-1">{typeof dispatch.transportFee === 'number' 
                        ? `${(dispatch.transportFee / 10000).toLocaleString('ko-KR')}만원`
                        : `${(Number(dispatch.transportFee) / 10000).toLocaleString('ko-KR')}만원`}</span>
                    </div>
                  )}
                  {dispatch.weighingFee !== null && dispatch.weighingFee !== undefined && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[80px]">계근비:</span>
                      <span className="flex-1">{typeof dispatch.weighingFee === 'number' 
                        ? `${(dispatch.weighingFee / 10000).toLocaleString('ko-KR')}만원`
                        : `${(Number(dispatch.weighingFee) / 10000).toLocaleString('ko-KR')}만원`}</span>
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

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
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
          <div className="flex items-center gap-2">
            <Label htmlFor="dispatchTypeFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
              배차 타입
            </Label>
            <Select
              value={selectedDispatchType}
              onValueChange={(value) => {
                setSelectedDispatchType(value);
                setPage(1);
              }}
            >
              <SelectTrigger id="dispatchTypeFilter" className="w-32">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {(dispatchTypeCodes ?? []).map((code) => (
                  <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                    {code.name || code.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                  // 내부직원 권한: 모든 상태 표시 (DRAFT, DISPATCH_COMPLETED, FAILED, RESCHEDULED, ASSIGNED, LOADING_COMPLETED)
                  // "작업 완료"(COMPLETED)는 제외
                  return (statusCodes ?? []).filter((code) => {
                    if (!code.value) return false;
                    // COMPLETED 상태는 제외
                    return code.value.toUpperCase() !== 'COMPLETED';
                  }).map((code) => (
                    <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                      {code.name || code.value}
                    </SelectItem>
                  ));
                }, [statusCodes])}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          {/* 왼쪽: 제목과 설명 */}
          <div>
            <h1 className="text-2xl font-bold">배차 관리</h1>
            <p className="text-sm text-muted-foreground">배차 정보를 조회하고 관리합니다.</p>
          </div>
          {/* 가운데: 갱신 정보 */}
          <div className={`flex flex-col gap-2 ${isMobile ? 'mt-2' : 'md:items-center md:flex-1 md:px-4'}`}>
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
            <div className="w-full">
              <Progress 
                value={progressValue} 
                className="h-1.5 w-full min-h-[6px]"
                max={100}
              />
            </div>
          </div>
          {/* 오른쪽: 배차 추가 버튼 */}
          <div className={`flex gap-2 ${isMobile ? '' : 'md:justify-end'}`}>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              배차 추가
            </Button>
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

        <VehicleDispatchFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedVehicleDispatch(null);
            }
          }}
          vehicleDispatch={selectedVehicleDispatch}
          mode={drawerMode}
          onSubmit={handleFormSubmit}
          onCancel={
            drawerMode === 'edit' && selectedVehicleDispatch
              ? () => {
                  setDrawerOpen(false);
                  setSelectedVehicleDispatchId(selectedVehicleDispatch.id);
                  setDetailDrawerOpen(true);
                }
              : undefined
          }
        />

        <VehicleDispatchDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedVehicleDispatchId(null);
            }
          }}
          vehicleDispatchId={selectedVehicleDispatchId}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>배차를 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                삭제된 배차 정보는 복구할 수 없습니다. 계속 진행하시겠습니까?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <XCircle className="mr-2 h-4 w-4" />
                취소
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
