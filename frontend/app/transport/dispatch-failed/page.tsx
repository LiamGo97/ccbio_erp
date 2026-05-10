'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2, XCircle, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

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
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';

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

function DispatchFailedPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedVehicleDispatch, setSelectedVehicleDispatch] = React.useState<VehicleDispatch | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedVehicleDispatchId, setSelectedVehicleDispatchId] = React.useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [vehicleDispatchToDelete, setVehicleDispatchToDelete] = React.useState<VehicleDispatch | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const searchParams = useSearchParams();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // URL 쿼리 파라미터에서 배차 ID를 읽어서 상세 drawer 자동으로 열기
  React.useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam) {
      const dispatchId = parseInt(idParam, 10);
      if (!isNaN(dispatchId)) {
        setSelectedVehicleDispatchId(dispatchId);
        setDetailDrawerOpen(true);
        // URL에서 쿼리 파라미터 제거 (브라우저 히스토리 정리)
        const url = new URL(window.location.href);
        url.searchParams.delete('id');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [searchParams]);

  const [selectedDispatchType, setSelectedDispatchType] = React.useState<string>('all');
  const isMobile = useIsMobile();

  const { 
    data: vehicleDispatches = [], 
    isLoading, 
    refetch,
  } = useVehicleDispatches();
  const deleteMutation = useDeleteVehicleDispatch();
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: statusCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_STATUS');
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

  // 배차 타입 필터링 - 배차실패(FAILED) 상태만 표시
  const filteredDispatches = React.useMemo(() => {
    let filtered = vehicleDispatches;

    // 배차실패(FAILED) 상태만 필터링
    filtered = filtered.filter((dispatch) => {
      const status = dispatch.status || 'DRAFT';
      return status === 'FAILED';
    });

    // 배차 타입 필터링 (카고/컨테이너)
    if (selectedDispatchType !== 'all') {
      filtered = filtered.filter((dispatch) => {
        const dispatchType = getDispatchType(dispatch.requestVehicle);
        return dispatchType === selectedDispatchType;
      });
    }

    return filtered;
  }, [vehicleDispatches, selectedDispatchType, getDispatchType]);

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
    setDetailDrawerOpen(false);
    setSelectedVehicleDispatch(dispatch);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const handleDelete = (dispatch: VehicleDispatch) => {
    setVehicleDispatchToDelete(dispatch);
    setDeleteDialogOpen(true);
  };

  const handleFormSubmit = async () => {
    setDrawerOpen(false);
    setSelectedVehicleDispatch(null);
    refetch();
  };

  const handleDeleteConfirm = async () => {
    if (!vehicleDispatchToDelete) return;

    try {
      await deleteMutation.mutateAsync(vehicleDispatchToDelete.id);
      toast({
        title: '삭제 완료',
        description: '배차 정보를 삭제했습니다.',
      });
      setDeleteDialogOpen(false);
      setVehicleDispatchToDelete(null);
      refetch();
    } catch (error: any) {
      console.error('배차 삭제 오류:', error);
      const message =
        error?.response?.data?.message ??
        error?.message ??
        '배차 정보를 삭제하는 중 오류가 발생했습니다.';
      toast({
        title: '삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
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
    const statusValue = status || 'DRAFT';
    return statusMap.get(statusValue) || statusValue;
  };

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

  const columns: ColumnDef<VehicleDispatch>[] = React.useMemo(() => [
    {
      accessorKey: 'orderNumber',
      header: '운송번호',
      cell: ({ row }) => <div className="text-sm font-mono">{row.original.orderNumber || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'companyName',
      header: '업체명',
      cell: ({ row }) => <div className="text-sm">{row.original.companyName || '-'}</div>,
      size: 120,
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
      header: '요청 중량',
      cell: ({ row }) => <div className="text-sm">{row.original.requestWeight || '-'}</div>,
      size: 100,
    },
      {
        accessorKey: 'loadingItems',
        header: '상차지',
        cell: ({ row }) => {
          const dispatch = row.original;
          const loadingItems = dispatch.loadingItems;
          
          // loadingItems가 있으면 각 항목을 텍스트로 표시
          if (loadingItems && loadingItems.length > 0) {
            return (
              <div className="text-sm space-y-1">
                {loadingItems.map((item, idx) => {
                  const warehouseName = item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId) || '-';
                  const bl = item.requestBL || '-';
                  const container = item.requestContainer || '-';
                  const parts = [warehouseName];
                  if (bl !== '-') parts.push(`BL: ${bl}`);
                  if (container !== '-') parts.push(`컨: ${container}`);
                  return (
                    <div key={item.id || idx} className="text-xs">
                      {parts.join(' ')}
                    </div>
                  );
                })}
              </div>
            );
          }
          
          // loadingItems가 없으면 dispatch 레벨의 데이터 표시
          const warehouseName = dispatch.loadingWarehouseId ? getWarehouseName(dispatch.loadingWarehouseId) : '-';
          const bl = dispatch.requestBL || '-';
          const container = dispatch.requestContainer || '-';
          
          if (warehouseName === '-' && bl === '-' && container === '-') {
            return <div className="text-sm">-</div>;
          }
          
          const parts = [warehouseName];
          if (bl !== '-') parts.push(`BL: ${bl}`);
          if (container !== '-') parts.push(`컨: ${container}`);
          
          return (
            <div className="text-sm">
              {parts.join(' ')}
            </div>
          );
        },
        size: 200,
      },
    {
      accessorKey: 'loadingSchedule',
      header: '상차 일정',
      cell: ({ row }) => {
        const schedule = row.original.loadingSchedule;
        const time = row.original.loadingScheduleTime;
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
      accessorKey: 'unloadingAddress',
      header: '하차지',
      cell: ({ row }) => {
        const address = row.original.unloadingAddress;
        const addressDetail = row.original.unloadingAddressDetail;
        if (!address) return <div className="text-sm">-</div>;
        return (
          <div className="text-sm">
            {address}
            {addressDetail && ` ${addressDetail}`}
          </div>
        );
      },
      size: 200,
    },
    {
      accessorKey: 'notes',
      header: '비고',
      cell: ({ row }) => <div className="text-sm">{row.original.notes || '-'}</div>,
      size: 150,
    },
    {
      accessorKey: 'createdByUser',
      header: '등록자',
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
    </div>
  );

  const paginatedDispatches = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredDispatches.slice(start, end);
  }, [filteredDispatches, page, pageSize]);

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">배차실패</h1>
            <p className="hidden text-muted-foreground md:block">
              배차 실패 상태의 배차 정보를 조회하고 관리합니다.
            </p>
          </div>
        </div>

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

        <VehicleDispatchFormDrawer
          open={drawerOpen}
          onOpenChange={(open: boolean) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedVehicleDispatch(null);
            }
          }}
          mode={drawerMode}
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
        />

        <VehicleDispatchDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open: boolean) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedVehicleDispatchId(null);
            }
          }}
          vehicleDispatchId={selectedVehicleDispatchId}
          onEdit={handleEdit}
          showWorkFields={false}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>배차 정보 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                정말로 이 배차 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <XCircle className="mr-2 h-4 w-4" />
                취소
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteConfirm} 
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

export default function DispatchFailedPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DispatchFailedPageContent />
    </Suspense>
  );
}

