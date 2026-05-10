'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  SalesDelivery,
  useSalesDeliveries,
} from '@/lib/hooks/use-sales-delivery';
import { SalesDeliveryDetailDrawer } from '@/components/sales-delivery/sales-delivery-detail-drawer';
import Cookies from 'js-cookie';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Filter, CheckCircle2 } from 'lucide-react';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils';
import { salesUnloadingMainLine } from '@/lib/sales-unloading-display';

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

/** ISO 문자열이 타임존 없이 오면 UTC로 간주 (백엔드가 Z 미포함 시 06:09 UTC가 로컬 06:09로 해석되는 문제 방지) - 물류관리와 동일 */
const parseAsUtcIfNeeded = (value: string): string => {
  const s = String(value).trim();
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (isIsoLike && !hasTimezone) {
    return s.replace(/\.\d{3}$/, '') + 'Z';
  }
  return s;
};

/** 등록일시/수정일시용 - 날짜+시간 표시 (물류관리 참조, 한국시간) */
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

/** 수정일시가 현재시간 5분 이내인지 여부 (노란색 배경 강조용) */
const isUpdatedWithin5Minutes = (updatedAt?: string | null): boolean => {
  if (!updatedAt) return false;
  const updated = new Date(parseAsUtcIfNeeded(updatedAt));
  if (Number.isNaN(updated.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  return diffMs >= 0 && diffMs <= 5 * 60 * 1000; // 5분 = 5 * 60 * 1000 ms
};

function SalesTransportManagementDispatchPageContent() {
  const queryClient = useQueryClient();
  const columnSettings = useColumnSettings('sales-transport-management');
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
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

  // URL 쿼리 파라미터에서 판매 ID (해당 판매의 운송 목록만 표시)
  const salesIdFromUrl = searchParams.get('salesId');

  const [selectedStatuses, setSelectedStatuses] = React.useState<Set<string>>(new Set());
  const [selectedDispatchCompanyIds, setSelectedDispatchCompanyIds] = React.useState<Set<string>>(new Set());
  const [selectedLoadingWarehouseIds, setSelectedLoadingWarehouseIds] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState<string>('createdAt');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const isMobile = useIsMobile();

  // 컬럼 ID → API 정렬 필드 매핑 (delivery 테이블 컬럼만 서버 정렬 지원)
  const sortByApiField = React.useCallback((columnId: string): string => {
    const allowed: Record<string, string> = {
      orderNumber: 'orderNumber',
      status: 'status',
      'sales.salesDate': 'createdAt',
      dispatchCompany: 'createdAt',
      requestVehicle: 'requestVehicle',
      requestWeight: 'requestWeight',
      loadingItems: 'createdAt',
      loadingSchedule: 'loadingDateTime',
      'sales.customer': 'createdAt',
      unloadingScheduleDate: 'unloadingScheduleDate',
      transportFee: 'transportFee',
      weighingFee: 'weighingFee',
      createdByUser: 'createdAt',
      createdAt: 'createdAt',
    };
    return allowed[columnId] ?? 'createdAt';
  }, []);

  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');
  const hasInitializedStatusFilter = React.useRef(false);
  const hasInitializedDispatchFilter = React.useRef(false);
  const hasInitializedLoadingFilter = React.useRef(false);

  const statusOptions = React.useMemo(() => {
    return (statusCodes ?? []).map((c) => ({
      value: (c.value ?? c.name ?? '').trim(),
      label: (c.name ?? c.value ?? '').trim() || (c.value ?? ''),
    })).filter((o) => o.value);
  }, [statusCodes]);

  // 최초 로딩 시 상태 옵션이 있으면 전체 선택(전체 데이터 표시)
  React.useEffect(() => {
    if (statusOptions.length > 0 && !hasInitializedStatusFilter.current) {
      hasInitializedStatusFilter.current = true;
      setSelectedStatuses(new Set(statusOptions.map((s) => s.value)));
    }
  }, [statusOptions]);

  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  const { data: warehouses = [] } = useWarehouses({ status: true });

  // 최초 로딩 시 배차업체/상차업체 옵션이 있으면 전체 선택
  React.useEffect(() => {
    if (dispatchCompanies.length > 0 && !hasInitializedDispatchFilter.current) {
      hasInitializedDispatchFilter.current = true;
      setSelectedDispatchCompanyIds(new Set(dispatchCompanies.map((c) => c.id.toString())));
    }
  }, [dispatchCompanies]);
  React.useEffect(() => {
    if (warehouses.length > 0 && !hasInitializedLoadingFilter.current) {
      hasInitializedLoadingFilter.current = true;
      setSelectedLoadingWarehouseIds(new Set(warehouses.filter((w) => w.id).map((w) => w.id!.toString())));
    }
  }, [warehouses]);

  const statusesParam = React.useMemo(() => {
    // 상태 코드가 아직 로드 전이면 필터 없이 요청 (빈 화면 → 데이터 플래시 방지)
    if (statusOptions.length === 0) return undefined;
    if (selectedStatuses.size === 0) return ['__none__']; // 선택 안 함 → 결과 없음
    if (selectedStatuses.size === statusOptions.length) return undefined; // 전체 선택 → 필터 없음
    return Array.from(selectedStatuses);
  }, [selectedStatuses, statusOptions.length]);

  const dispatchCompanyIdsParam = React.useMemo((): number[] | '__none__' | undefined => {
    if (dispatchCompanies.length === 0) return undefined;
    if (selectedDispatchCompanyIds.size === 0) return '__none__'; // 선택 안 함 → 결과 없음
    if (selectedDispatchCompanyIds.size === dispatchCompanies.length) return undefined; // 전체 선택 → 필터 없음
    return Array.from(selectedDispatchCompanyIds).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  }, [selectedDispatchCompanyIds, dispatchCompanies.length]);

  const loadingWarehouseIdsParam = React.useMemo((): number[] | '__none__' | undefined => {
    const validWarehouses = warehouses.filter((w) => w.id);
    if (validWarehouses.length === 0) return undefined;
    if (selectedLoadingWarehouseIds.size === 0) return '__none__'; // 선택 안 함 → 결과 없음
    if (selectedLoadingWarehouseIds.size === validWarehouses.length) return undefined; // 전체 선택 → 필터 없음
    return Array.from(selectedLoadingWarehouseIds).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  }, [selectedLoadingWarehouseIds, warehouses]);

  const { 
    data: deliveriesResponse, 
    isLoading, 
  } = useSalesDeliveries({
    salesId: salesIdFromUrl || undefined,
    page,
    limit: pageSize,
    statuses: statusesParam,
    search: search || undefined,
    dispatchCompanyIds: dispatchCompanyIdsParam,
    loadingWarehouseIds: loadingWarehouseIdsParam,
    sortBy: sortByApiField(sortBy),
    sortOrder: sortOrder === 'desc' ? 'DESC' : 'ASC',
  });
  const deliveries = deliveriesResponse?.data || [];
  const total = deliveriesResponse?.total || 0;

  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');

  // 코드 맵 생성
  const productMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (productCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [productCodes]);

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

  const getProductName = React.useCallback((productCode?: string | null) => {
    if (!productCode) return null;
    return productMap.get(productCode.trim()) || productCode;
  }, [productMap]);

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
      id: 'orderNumber',
      accessorKey: 'orderNumber',
      header: '운송번호',
      cell: ({ row }) => <div className="text-sm font-mono">{row.original.orderNumber || '-'}</div>,
      size: 120,
      enableSorting: true,
    },
    {
      id: 'status',
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
            className: 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300',
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
      enableSorting: true,
    },
    {
      id: 'sales.salesDate',
      accessorKey: 'sales.salesDate',
      header: '판매일자',
      cell: ({ row }) => {
        const salesDate = row.original.sales?.salesDate;
        return <div className="text-sm">{salesDate ? formatDate(salesDate) : '-'}</div>;
      },
      size: 100,
      enableSorting: true,
    },
    {
      id: 'sales.customer',
      accessorKey: 'sales.customer',
      header: '업체명(대표자)',
      cell: ({ row }) => {
        const customer = row.original.sales?.customer;
        const companyName = customer?.companyName || '';
        const ceo = customer?.ceo || '';
        
        if (!companyName) return <div className="text-sm">-</div>;
        
        const text = ceo ? `${companyName} (${ceo})` : companyName;
        return (
          <div className="text-sm truncate max-w-[180px]" title={text}>
            {text}
          </div>
        );
      },
      size: 180,
      enableSorting: true,
    },
    {
      id: 'dispatchCompany',
      accessorKey: 'dispatchCompany',
      header: '배차 업체',
      cell: ({ row }) => <div className="text-sm">{getDispatchCompanyName(row.original.dispatchCompanyId)}</div>,
      size: 120,
      enableSorting: true,
    },
    {
      id: 'driverInfo',
      accessorKey: 'driverName',
      header: '기사정보',
      cell: ({ row }) => {
        const d = row.original;
        const name = d.driverName?.trim() || '';
        const vehicle = d.vehicleNumber?.trim() || '';
        if (!name && !vehicle) return <div className="text-sm text-muted-foreground">-</div>;
        return (
          <div className="text-sm">
            {name && <span>{name}</span>}
            {name && vehicle && <span className="text-muted-foreground"> · </span>}
            {vehicle && <span className="font-mono">{vehicle}</span>}
          </div>
        );
      },
      size: 200,
      enableSorting: false,
    },
    {
      id: 'requestVehicle',
      accessorKey: 'requestVehicle',
      header: '요청 차량',
      cell: ({ row }) => <div className="text-sm">{getRequestVehicleName(row.original.requestVehicle)}</div>,
      size: 100,
      enableSorting: true,
    },
    {
      id: 'requestWeight',
      accessorKey: 'requestWeight',
      header: '요청 중량 (KG)',
      cell: ({ row }) => {
        const raw = row.original.requestWeight;
        if (raw == null || raw === '') return <div className="text-sm">-</div>;
        const num = parseFloat(String(raw).trim().replace(/,/g, ''));
        if (Number.isNaN(num)) return <div className="text-sm">{String(raw).trim()}</div>;
        return <div className="text-sm">{Math.round(num * 1000).toLocaleString('ko-KR')}</div>;
      },
      size: 100,
      enableSorting: true,
    },
    {
      id: 'loadingItems',
      accessorKey: 'loadingItems',
      header: '상차지',
      cell: ({ row }) => {
        const delivery = row.original;
        const rawItems = delivery.loadingItems;
        // 하차완료 시 행 삭제(하차 제외)된 항목은 목록에서 제외 (상세보기와 동일 기준)
        const loadingItems =
          delivery.status === 'UNLOADING_COMPLETED' && rawItems?.length
            ? rawItems.filter(
                (item) =>
                  item.actualBL != null ||
                  item.actualContainer != null ||
                  item.actualBales != null ||
                  item.actualWeight != null,
              )
            : rawItems ?? [];
        
        if (loadingItems.length > 0) {
          return (
            <div className="min-w-0 overflow-auto">
              <table className="w-full text-xs border-collapse border border-border rounded">
                <colgroup>
                  <col style={{ minWidth: '60px' }} />
                  <col style={{ minWidth: '60px' }} />
                  <col style={{ minWidth: '130px' }} />
                  <col style={{ minWidth: '120px' }} />
                  <col style={{ minWidth: '70px' }} />
                  <col style={{ minWidth: '28px' }} />
                </colgroup>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-1 px-2 font-medium border-r border-border last:border-r-0">창고</th>
                    <th className="text-left py-1 px-2 font-medium border-r border-border last:border-r-0">입고상태</th>
                    <th className="text-left py-1 px-2 font-medium border-r border-border last:border-r-0">BL</th>
                    <th className="text-left py-1 px-2 font-medium border-r border-border last:border-r-0">컨테이너</th>
                    <th className="text-left py-1 px-2 font-medium border-r border-border last:border-r-0">상품명</th>
                    <th className="text-center py-1 px-2 font-medium border-r border-border last:border-r-0 w-7">발행</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingItems.map((item, idx) => {
                    const warehouseName = item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId) || '-';
                    const container = item.salesItem?.container;
                    const order = container?.order;
                    const inboundStatus = order?.inboundStatus;
                    const inboundLabel =
                      inboundStatus === 'INBOUND_PENDING'
                        ? '입고대기'
                        : inboundStatus === 'INBOUND_SCHEDULED'
                          ? '입고예정'
                          : inboundStatus === 'INBOUND_CONFIRMED'
                            ? '입고확정'
                            : '-';
                    const inboundBadgeClass =
                      inboundStatus === 'INBOUND_PENDING'
                        ? 'text-[10px] border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300'
                        : inboundStatus === 'INBOUND_SCHEDULED'
                          ? 'text-[10px] border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                          : inboundStatus === 'INBOUND_CONFIRMED'
                            ? 'text-[10px] border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300'
                            : '';
                    const productName = getProductName(container?.product) || '-';
                    const bl = item.requestBL ?? order?.bl ?? '-';
                    const containerNoRaw =
                      (item.actualContainer?.trim()) ||
                      (item.workContainer?.trim()) ||
                      (item.requestContainer?.trim()) ||
                      (container?.containerNo != null && container?.containerNo !== '' ? String(container.containerNo).trim() : '') ||
                      '';
                    const displayNo = containerNoRaw || '-';
                    const containerSequence =
                      (item as { displayContainerSequence?: number | null }).displayContainerSequence != null
                        ? (item as { displayContainerSequence: number }).displayContainerSequence
                        : displayNo !== '-' &&
                            container?.containerNo != null &&
                            String(container.containerNo).trim() === String(displayNo).trim()
                          ? container.sequence
                          : undefined;
                    const containerText =
                      displayNo === '-'
                        ? '-'
                        : containerSequence != null
                          ? `${displayNo} [${containerSequence}]`
                          : displayNo;
                    const invoiceIssued = (item as { invoiceIssued?: boolean }).invoiceIssued;
                    return (
                      <tr key={item.id || idx} className="border-b last:border-b-0">
                        <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0 max-w-[80px]" title={warehouseName}>
                          {warehouseName}
                        </td>
                        <td className="py-1 px-2 border-r border-border last:border-r-0">
                          {inboundLabel !== '-' ? (
                            <Badge variant="outline" className={`shrink-0 ${inboundBadgeClass}`}>
                              {inboundLabel}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0 max-w-[70px]" title={bl}>
                          {bl}
                        </td>
                        <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0 max-w-[80px]" title={containerText}>
                          {containerText}
                        </td>
                        <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0 max-w-[100px]" title={productName}>
                          {productName}
                        </td>
                        <td className="py-1 px-2 text-center border-r border-border last:border-r-0">
                          {invoiceIssued ? (
                            <span title="거래명세서 발행">
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 inline-block" aria-label="거래명세서 발행" />
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }
        
        // loadingItems가 없으면 표시할 데이터 없음
        return <div className="text-sm">-</div>;
      },
      size: 550,
      enableSorting: false,
    },
    {
      id: 'loadingSchedule',
      accessorKey: 'loadingSchedule',
      header: '상차 일정',
      cell: ({ row }) => {
        const delivery = row.original;
        // 배차 업체 담당자가 입력한 상차일시가 있으면 우선 표시
        if (delivery.loadingDateTime) {
          return <div className="text-sm">{delivery.loadingDateTime}</div>;
        }
        // 없으면 기존 상차일정 표시 (하차완료 시 행 삭제된 항목 제외한 목록 사용)
        const rawItems = delivery.loadingItems;
        const loadingItemsForSchedule =
          delivery.status === 'UNLOADING_COMPLETED' && rawItems?.length
            ? rawItems.filter(
                (item) =>
                  item.actualBL != null ||
                  item.actualContainer != null ||
                  item.actualBales != null ||
                  item.actualWeight != null,
              )
            : rawItems ?? [];
        if (!loadingItemsForSchedule.length) return <div className="text-sm">-</div>;
        const firstItem = loadingItemsForSchedule[0];
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
      size: 160,
      enableSorting: true,
    },
    {
      id: 'unloadingScheduleDate',
      accessorKey: 'unloadingScheduleDate',
      header: '하차 일정',
      cell: ({ row }) => {
        const delivery = row.original;
        // 배차 업체 담당자가 입력한 하차일시가 있으면 우선 표시
        if (delivery.unloadingDateTime) {
          return <div className="text-sm">{delivery.unloadingDateTime}</div>;
        }
        // 없으면 기존 하차일정 표시
        const date = delivery.unloadingScheduleDate;
        const time = delivery.unloadingScheduleTime;
        if (!date) return <div className="text-sm">-</div>;
        return (
          <div className="text-sm">
            {formatDate(date)}
            {time && ` ${time}`}
          </div>
        );
      },
      size: 160,
      enableSorting: true,
    },
    {
      id: 'unloadingAddress',
      accessorKey: 'unloadingAddress',
      header: '하차지 주소',
      cell: ({ row }) => {
        const delivery = row.original;
        const sales = delivery.sales;
        const road = sales?.unloadingAddressRoad?.trim() || '';
        const jibun = sales?.unloadingAddressJibun?.trim() || '';
        const detail =
          sales?.unloadingAddressDetail?.trim() || delivery.unloadingAddressDetail?.trim() || '';
        const legacyLine =
          !road && !jibun
            ? salesUnloadingMainLine(sales ?? undefined) || delivery.unloadingAddress?.trim() || ''
            : '';
        const title = [road && `도로명 ${road}`, jibun && `지번 ${jibun}`, detail || null, legacyLine || null]
          .filter(Boolean)
          .join('\n');

        if (!road && !jibun && !legacyLine && !detail) {
          return <div className="text-sm text-muted-foreground">-</div>;
        }

        if (road || jibun) {
          return (
            <div className="text-sm min-w-0 w-full space-y-0.5" title={title}>
              {road ? <div className="truncate leading-tight">{road}</div> : null}
              {jibun ? (
                <div className="truncate leading-tight text-muted-foreground">{jibun}</div>
              ) : null}
              {detail ? (
                <div className="truncate text-xs text-muted-foreground leading-tight">{detail}</div>
              ) : null}
            </div>
          );
        }

        const fullAddress = [legacyLine, detail].filter(Boolean).join(' ');
        return (
          <div className="text-sm truncate min-w-0 w-full" title={fullAddress}>
            {fullAddress}
          </div>
        );
      },
      size: 280,
      enableSorting: false,
    },
    {
      id: 'transportFee',
      accessorKey: 'transportFee',
      header: '운송비',
      cell: ({ row }) => {
        const transportFee = row.original.transportFee;
        const paid = row.original.transportFeePaymentStatus === 'PAID';
        return (
          <div className="flex items-center justify-end gap-1.5 text-sm">
            <span>{transportFee != null ? `${formatNumber(transportFee)}원` : '-'}</span>
            {paid && (
              <span title="운송비 지급완료">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-label="운송비 지급완료" />
              </span>
            )}
          </div>
        );
      },
      size: 140,
      enableSorting: true,
    },
    {
      id: 'weighingFee',
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
      enableSorting: true,
    },
    {
      id: 'createdByUser',
      accessorKey: 'createdByUser',
      header: '담당자',
      cell: ({ row }) => <div className="text-sm">{row.original.createdByUser?.name || '-'}</div>,
      size: 100,
      enableSorting: true,
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: '등록일시',
      cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.createdAt)}</div>,
      size: 165,
      enableSorting: true,
    },
    {
      id: 'updatedAt',
      accessorKey: 'updatedAt',
      header: '수정일시',
      cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.updatedAt)}</div>,
      size: 165,
      enableSorting: false,
    },
  ], [requestVehicleMap, warehouseMap, statusMap, dispatchCompanyMap, productMap, getWarehouseName, getRequestVehicleName, getDispatchCompanyName, getStatusLabel, getProductName]);

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          검색
        </Label>
        <Input
          id="search"
          value={search}
          placeholder="운송번호, 업체명, 대표자명, 연락처, 기사명, 차량번호"
          className="w-48 md:w-60"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상태</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {selectedStatuses.size === 0
                ? '선택 안됨'
                : selectedStatuses.size === statusOptions.length
                  ? '전체'
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
                        setSelectedStatuses(new Set(statusOptions.map((s) => s.value)));
                      } else {
                        setSelectedStatuses(new Set());
                      }
                      setPage(1);
                    }}
                  />
                  <Label htmlFor="status-filter-all" className="text-sm font-medium cursor-pointer flex-1">
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
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">배차업체</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {selectedDispatchCompanyIds.size === 0
                ? '선택 안됨'
                : selectedDispatchCompanyIds.size === dispatchCompanies.length
                  ? '전체'
                  : `${selectedDispatchCompanyIds.size}개 선택됨`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                  <Checkbox
                    id="dispatch-filter-all"
                    checked={selectedDispatchCompanyIds.size === dispatchCompanies.length}
                    onCheckedChange={(checked: boolean) => {
                      if (checked) {
                        setSelectedDispatchCompanyIds(new Set(dispatchCompanies.map((c) => c.id.toString())));
                      } else {
                        setSelectedDispatchCompanyIds(new Set());
                      }
                      setPage(1);
                    }}
                  />
                  <Label htmlFor="dispatch-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                    전체
                  </Label>
                </div>
                {dispatchCompanies.map((company) => (
                  <div key={company.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                    <Checkbox
                      id={`dispatch-filter-${company.id}`}
                      checked={selectedDispatchCompanyIds.has(company.id.toString())}
                      onCheckedChange={(checked: boolean) => {
                        const newIds = new Set(selectedDispatchCompanyIds);
                        if (checked) {
                          newIds.add(company.id.toString());
                        } else {
                          newIds.delete(company.id.toString());
                        }
                        setSelectedDispatchCompanyIds(newIds);
                        setPage(1);
                      }}
                    />
                    <Label
                      htmlFor={`dispatch-filter-${company.id}`}
                      className="text-sm font-medium cursor-pointer flex-1"
                    >
                      {company.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상차업체</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {selectedLoadingWarehouseIds.size === 0
                ? '선택 안됨'
                : selectedLoadingWarehouseIds.size === warehouses.filter((w) => w.id).length
                  ? '전체'
                  : `${selectedLoadingWarehouseIds.size}개 선택됨`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                  <Checkbox
                    id="loading-filter-all"
                    checked={selectedLoadingWarehouseIds.size === warehouses.filter((w) => w.id).length}
                    onCheckedChange={(checked: boolean) => {
                      const validIds = warehouses.filter((w) => w.id).map((w) => w.id!.toString());
                      if (checked) {
                        setSelectedLoadingWarehouseIds(new Set(validIds));
                      } else {
                        setSelectedLoadingWarehouseIds(new Set());
                      }
                      setPage(1);
                    }}
                  />
                  <Label htmlFor="loading-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                    전체
                  </Label>
                </div>
                {warehouses.filter((w) => w.id).map((warehouse) => (
                  <div key={warehouse.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                    <Checkbox
                      id={`loading-filter-${warehouse.id}`}
                      checked={selectedLoadingWarehouseIds.has(warehouse.id!.toString())}
                      onCheckedChange={(checked: boolean) => {
                        const newIds = new Set(selectedLoadingWarehouseIds);
                        if (checked) {
                          newIds.add(warehouse.id!.toString());
                        } else {
                          newIds.delete(warehouse.id!.toString());
                        }
                        setSelectedLoadingWarehouseIds(newIds);
                        setPage(1);
                      }}
                    />
                    <Label
                      htmlFor={`loading-filter-${warehouse.id}`}
                      className="text-sm font-medium cursor-pointer flex-1"
                    >
                      {warehouse.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );


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
        <div className="flex items-center justify-between flex-shrink-0 min-w-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">운송관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {salesIdFromUrl
                ? `판매 #${salesIdFromUrl}의 운송 목록`
                : '판매와 연동된 배차 정보를 확인하고 관리할 수 있습니다.'}
            </p>
          </div>
        </div>

        {/* 필터 및 테이블 카드 */}
        <DataTable
          columns={columns}
          data={deliveries}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={Math.ceil(total / pageSize) || 1}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
            Cookies.set('data-table-page-size', newSize.toString());
          }}
          manualPagination={true}
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(newSortBy, newSortOrder) => {
            setSortBy(newSortBy);
            setSortOrder(newSortOrder);
            setPage(1);
          }}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          rowClassName="h-10"
          getRowClassName={(row) =>
            isUpdatedWithin5Minutes(row.updatedAt)
              ? 'bg-yellow-100 dark:bg-yellow-950/50 hover:!bg-yellow-200 dark:hover:!bg-yellow-900/60'
              : undefined
          }
        />

        {/* 상세 정보 Drawer */}
        <SalesDeliveryDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedDeliveryId(null);
            }
          }}
          deliveryId={selectedDeliveryId}
          title="운송관리 상세정보"
          description="판매 연동 배송 정보를 확인하고 관리합니다."
          showTransportStatusAudit={false}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['sales-deliveries'] });
          }}
        />
      </div>
    </AppLayout>
  );
}

export default function SalesTransportManagementDispatchPage() {
  return (
    <Suspense fallback={
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    }>
      <SalesTransportManagementDispatchPageContent />
    </Suspense>
  );
}

