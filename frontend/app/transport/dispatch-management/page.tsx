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
  VehicleDispatch,
  useVehicleDispatches,
} from '@/lib/hooks/use-vehicle-dispatch';
import { VehicleDispatchDetailDrawer } from '@/components/vehicle-dispatch/vehicle-dispatch-detail-drawer';
import { VehicleDispatchFormDrawer } from '@/components/vehicle-dispatch/vehicle-dispatch-form-drawer';
import Cookies from 'js-cookie';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toastSuccess, toastError } from '@/lib/utils/toast-helpers';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { useUsers } from '@/lib/hooks/use-users';
import { formatNumber } from '@/lib/utils';

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

// CSV 다운로드 함수
const downloadCSV = (
  dispatches: VehicleDispatch[],
  requestVehicleMap: Map<string, string>,
  warehouseMap: Map<number, string>,
  dispatchCompanyMap: Map<number, string>,
  statusMap: Map<string, string>,
  getRequestVehicleName: (code?: string | null) => string,
  getWarehouseName: (id?: number | null) => string,
  getDispatchCompanyName: (id?: number | null) => string,
  getStatusLabel: (status?: string | null) => string,
) => {
  // CSV 헤더 정의 (배차관리 페이지 컬럼 기준)
  const headers = [
    '운송번호',
    '상태',
    '업체명',
    '배차업체',
    '요청 차량',
    '요청 중량',
    '차량번호',
    '운송차 연락처',
    '기사명',
    '상차지',
    '상차 일정',
    '상차 시간',
    '하차 일정',
    '하차 시간',
    '하차지',
    '하차지 상세주소',
    '지역',
    '시군구',
    '운송비',
    '계근비',
    '담당자',
    '비고',
    '등록일시',
  ];

  // CSV 데이터 생성 - DataTable과 동일하게 1개의 배차당 1행만 생성
  const rows = dispatches.map((dispatch) => {
    const loadingItems = dispatch.loadingItems || [];
    
    // 상차지 정보를 테이블 형식과 유사하게 표시 (상차지 / BL / 컨테이너)
    let loadingInfo = '-';
    if (loadingItems.length > 0) {
      const items = loadingItems.map((item) => {
        const warehouseName = item.loadingWarehouseId ? getWarehouseName(item.loadingWarehouseId) : '-';
        const bl = item.requestBL || '-';
        const container = item.requestContainer || '-';
        return `${warehouseName} / ${bl} / ${container}`;
      });
      loadingInfo = items.join(' | ');
    } else {
      const warehouseName = dispatch.loadingWarehouseId ? getWarehouseName(dispatch.loadingWarehouseId) : '-';
      const bl = dispatch.requestBL || '-';
      const container = dispatch.requestContainer || '-';
      if (warehouseName !== '-' || bl !== '-' || container !== '-') {
        loadingInfo = `${warehouseName} / ${bl} / ${container}`;
      }
    }

    return {
      '운송번호': dispatch.orderNumber || '-',
      '상태': getStatusLabel(dispatch.status),
      '업체명': dispatch.companyName || '-',
      '배차업체': getDispatchCompanyName(dispatch.dispatchCompanyId),
      '요청 차량': getRequestVehicleName(dispatch.requestVehicle),
      '요청 중량': dispatch.requestWeight || '-',
      '차량번호': dispatch.vehicleNumber || '-',
      '운송차 연락처': formatPhone(dispatch.driverContact),
      '기사명': dispatch.driverName || '-',
      '상차지': loadingInfo,
      '상차 일정': formatDate(dispatch.loadingSchedule),
      '상차 시간': dispatch.loadingScheduleTime || '-',
      '하차 일정': formatDate(dispatch.unloadingScheduleDate),
      '하차 시간': dispatch.unloadingScheduleTime || '-',
      '하차지': dispatch.unloadingAddress || '-',
      '하차지 상세주소': dispatch.unloadingAddressDetail || '-',
      '지역': dispatch.unloadingRegion?.name || '-',
      '시군구': dispatch.unloadingCity?.name || '-',
      '운송비': dispatch.transportFee != null ? `${formatNumber(dispatch.transportFee)}원` : '-',
      '계근비': dispatch.weighingFee != null ? `${formatNumber(dispatch.weighingFee)}원` : '-',
      '담당자': dispatch.createdByUser?.name || '-',
      '비고': dispatch.notes || '-',
      '등록일시': formatDate(dispatch.createdAt),
    };
  });

  // CSV 문자열 생성 (BOM 추가로 한글 깨짐 방지)
  const BOM = '\uFEFF';
  const csvContent = [
    headers.join(','),
    ...rows.map((row: Record<string, string>) => 
      headers.map(header => {
        const value = row[header] || '';
        // 쉼표나 따옴표가 있으면 따옴표로 감싸고 내부 따옴표는 두 번
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${String(value).replace(/"/g, '""')}"`;
        }
        return String(value);
      }).join(',')
    ),
  ].join('\n');

  // Blob 생성 및 다운로드
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const filename = `배차관리_${new Date().toISOString().split('T')[0]}.csv`;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

function DispatchManagementPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedVehicleDispatchId, setSelectedVehicleDispatchId] = React.useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedVehicleDispatch, setSelectedVehicleDispatch] = React.useState<VehicleDispatch | null>(null);
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
  const [selectedDispatchCompany, setSelectedDispatchCompany] = React.useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = React.useState<string>('all');
  const [selectedManager, setSelectedManager] = React.useState<string>('all');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('all');
  const [loadingScheduleStartDate, setLoadingScheduleStartDate] = React.useState<Date | undefined>(undefined);
  const [loadingScheduleEndDate, setLoadingScheduleEndDate] = React.useState<Date | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const isMobile = useIsMobile();

  const { 
    data: vehicleDispatches = [], 
    isLoading, 
    refetch,
  } = useVehicleDispatches();
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: statusCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_STATUS');
  const { data: dispatchTypeCodes } = useCodeMastersByGroup('VEHICLE_DISPATCH_TYPE');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  const { data: usersResponse } = useUsers({ status: 'active', limit: 1000, roleCode: 'ROLE_SALES' }); // 영업관리 권한 사용자만 가져오기
  const users = usersResponse?.data || [];

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

  // 상태 코드를 명시적 순서로 정렬
  const sortedStatusCodes = React.useMemo(() => {
    if (!statusCodes) return [];
    // 명시적 순서로 정렬: 배차 요청 → 배차 중 → 배차 완료 → 상차 중 → 상차 완료 → 배차 실패 → 일정 조정 → 하차 완료
    const statusOrder = ['DRAFT', 'DISPATCHING', 'DISPATCH_COMPLETED', 'ASSIGNED', 'LOADING_COMPLETED', 'FAILED', 'RESCHEDULED', 'UNLOADING_COMPLETED'];
    return (statusCodes ?? []).sort((a, b) => {
      const aIndex = statusOrder.indexOf(a.value?.toUpperCase() || '');
      const bIndex = statusOrder.indexOf(b.value?.toUpperCase() || '');
      if (aIndex === -1 && bIndex === -1) {
        // 둘 다 순서에 없으면 order 필드로 정렬
        return (a.order ?? 0) - (b.order ?? 0);
      }
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
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

  // 필터링 - 모든 상태의 배차 표시
  const filteredDispatches = React.useMemo(() => {
    let filtered = vehicleDispatches;

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

    // 상태 필터링
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((dispatch) => {
        const status = dispatch.status || 'DRAFT';
        return status === selectedStatus;
      });
    }

    // 배차 타입 필터링 (카고/컨테이너)
    if (selectedDispatchType !== 'all') {
      filtered = filtered.filter((dispatch) => {
        const dispatchType = getDispatchType(dispatch.requestVehicle);
        return dispatchType === selectedDispatchType;
      });
    }

    // 배차업체 필터링
    if (selectedDispatchCompany !== 'all') {
      filtered = filtered.filter((dispatch) => {
        const dispatchCompanyId = dispatch.dispatchCompanyId;
        return dispatchCompanyId !== null && dispatchCompanyId !== undefined && String(dispatchCompanyId) === selectedDispatchCompany;
      });
    }

    // 상차업체 필터링
    if (selectedWarehouse !== 'all') {
      filtered = filtered.filter((dispatch) => {
        const loadingItems = dispatch.loadingItems || [];
        const warehouseId = parseInt(selectedWarehouse, 10);
        return loadingItems.some(item => item.loadingWarehouseId === warehouseId);
      });
    }

    // 담당자 필터링
    if (selectedManager !== 'all') {
      filtered = filtered.filter((dispatch) => {
        const createdBy = dispatch.createdBy;
        return createdBy !== null && createdBy !== undefined && String(createdBy) === selectedManager;
      });
    }

    // 상차일정 기간 필터링
    if (loadingScheduleStartDate || loadingScheduleEndDate) {
      filtered = filtered.filter((dispatch) => {
        const schedule = dispatch.loadingSchedule;
        if (!schedule) return false;
        
        const scheduleDate = new Date(schedule);
        if (Number.isNaN(scheduleDate.getTime())) return false;
        
        // 날짜 비교를 위해 시간 부분을 제거 (00:00:00으로 설정)
        scheduleDate.setHours(0, 0, 0, 0);
        
        if (loadingScheduleStartDate) {
          const startDate = new Date(loadingScheduleStartDate);
          startDate.setHours(0, 0, 0, 0);
          if (scheduleDate < startDate) return false;
        }
        
        if (loadingScheduleEndDate) {
          const endDate = new Date(loadingScheduleEndDate);
          endDate.setHours(23, 59, 59, 999); // 종료일은 그 날 23:59:59까지 포함
          if (scheduleDate > endDate) return false;
        }
        
        return true;
      });
    }

    return filtered;
  }, [vehicleDispatches, search, selectedStatus, selectedDispatchType, selectedDispatchCompany, selectedWarehouse, selectedManager, loadingScheduleStartDate, loadingScheduleEndDate, getDispatchType]);

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

  const handleFormSubmit = async () => {
    setDrawerOpen(false);
    setSelectedVehicleDispatch(null);
    // mutation의 onSuccess에서 이미 invalidateQueries와 refetchQueries를 처리하므로
    // 추가 refetch는 불필요하지만, 안전을 위해 약간의 지연 후 refetch
    // mutation이 완료되고 onSuccess가 실행된 후 데이터 갱신 보장
    setTimeout(() => {
      refetch();
    }, 200);
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

  const columns: ColumnDef<VehicleDispatch>[] = React.useMemo(() => [
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
        const status = row.original.status || 'DRAFT';
        const statusLabel = getStatusLabel(status);
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
          UNLOADING_COMPLETED: {
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
          <div className={`text-xs px-2 py-1 rounded border ${style.className || ''}`}>
            {statusLabel}
          </div>
        );
      },
      size: 100,
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
      accessorKey: 'unloadingRegion',
      header: '지역',
      cell: ({ row }) => {
        const regionName = row.original.unloadingRegion?.name;
        return <div className="text-sm">{regionName || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'unloadingCity',
      header: '시군구',
      cell: ({ row }) => {
        const cityName = row.original.unloadingCity?.name;
        return <div className="text-sm">{cityName || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'createdByUser',
      header: '담당자',
      cell: ({ row }) => <div className="text-sm">{row.original.createdByUser?.name || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'notes',
      header: '비고',
      cell: ({ row }) => <div className="text-sm">{row.original.notes || '-'}</div>,
      size: 150,
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
      <div className="flex items-center gap-2">
        <Label htmlFor="statusFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          상태
        </Label>
        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="statusFilter" className="w-32">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {sortedStatusCodes.map((code) => (
              <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                {code.name || code.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Label htmlFor="dispatchCompanyFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          배차업체
        </Label>
        <Select
          value={selectedDispatchCompany}
          onValueChange={(value) => {
            setSelectedDispatchCompany(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="dispatchCompanyFilter" className="w-40">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {dispatchCompanies.map((company) => (
              <SelectItem key={company.id} value={String(company.id)}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          상차일정
        </Label>
        <DateRangePicker
          startDate={loadingScheduleStartDate}
          endDate={loadingScheduleEndDate}
          onChange={(startDate, endDate) => {
            setLoadingScheduleStartDate(startDate);
            setLoadingScheduleEndDate(endDate);
            setPage(1);
          }}
          className="w-64"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="warehouseFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          상차업체
        </Label>
        <Select
          value={selectedWarehouse}
          onValueChange={(value) => {
            setSelectedWarehouse(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="warehouseFilter" className="w-40">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {warehouses.map((warehouse) => (
              <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                {warehouse.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="managerFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          담당자
        </Label>
        <Select
          value={selectedManager}
          onValueChange={(value) => {
            setSelectedManager(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="managerFilter" className="w-40">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={String(user.id)}>
                {user.name || user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">배차관리</h1>
            <p className="hidden text-muted-foreground md:block">
              모든 배차 정보를 조회하고 관리합니다.
            </p>
          </div>
          <Button
            onClick={() => {
              try {
                // 필터가 적용된 전체 목록을 CSV로 다운로드 (페이징 없이 모든 데이터)
                downloadCSV(
                  filteredDispatches, // 모든 필터가 적용된 데이터 전체
                  requestVehicleMap,
                  warehouseMap,
                  dispatchCompanyMap,
                  statusMap,
                  getRequestVehicleName,
                  getWarehouseName,
                  getDispatchCompanyName,
                  getStatusLabel,
                );
                toastSuccess('다운로드 완료', `CSV 파일이 다운로드되었습니다. (${filteredDispatches.length}건)`);
              } catch (error) {
                console.error('CSV 다운로드 오류:', error);
                toastError('다운로드 실패', 'CSV 파일 다운로드에 실패했습니다.');
              }
            }}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">CSV 다운로드</span>
          </Button>
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

        <VehicleDispatchDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open: boolean) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedVehicleDispatchId(null);
            }
          }}
          vehicleDispatchId={selectedVehicleDispatchId}
          showWorkFields={true}
          showCompanyEditButtons={true}
          title="배차관리 상세정보"
          description="배차 정보를 확인하고 관리합니다."
          onEdit={handleEdit}
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
      </div>
    </AppLayout>
  );
}

export default function DispatchManagementPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DispatchManagementPageContent />
    </Suspense>
  );
}

