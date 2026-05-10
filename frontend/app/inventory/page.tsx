'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { format } from 'date-fns';
import api from '@/lib/api';
import { useCodesByCategory, type Code } from '@/lib/hooks/use-codes';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { Button } from '@/components/ui/button';

// 컨테이너 타입 정의
type Container = {
  id: string;
  containerNo: string;
  weight: number | null;
  availableWeight: number | null;
  bales: number | null;
  availableBales: number | null;
  orderId: string;
  contractNo: string | null;
  sequence: number;
  bk: string | null;
  bl: string | null;
  product: string | null;
  productName: string | null;
  tradeGrade: string | null;
  tradeGradeName: string | null;
  salesGrade: string | null;
  salesGradeName: string | null;
  packingType: string | null;
  packingName: string | null;
  etaDate: string | null;
  exportCountry: string | null;
  exportCountryName: string | null;
  exporter: string | null;
  exporterName: string | null;
  destination: string | null;
  destinationName: string | null;
  finalDestination: string | null;
  finalDestinationName: string | null;
  // 입고 데이터
  inboundStatus: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;
  inboundWarehouse: string | null;
  inboundWarehouseName: string | null;
  inboundIgodate: string | null;
  inboundQuarantineDate: string | null;
  inboundDtDate: string | null;
  // 원가 데이터
  pendingPurchaseCost: string | null;
  confirmedPurchaseCost: string | null;
  // 재고 상태
  inventoryStatus: 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null;
};

export default function InventoryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState<Container[]>([]);
  const [isContainersLoading, setIsContainersLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('containerNo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const { data: gradeCodes } = useCodesByCategory('TRADE_GRADE');
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    void checkAuth();
  }, []);

  const resolveWarehouseLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const w = warehouses.find((w) => w.name === code || w.id.toString() === code);
      return w?.name ?? code;
    },
    [warehouses],
  );

  const resolveDestinationLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const destination = destinationCodes?.find((c) => c.value === code || c.name === code);
      return destination?.name || destination?.value || code;
    },
    [destinationCodes],
  );

  const resolveGradeLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const grade = gradeCodes?.find((c) => c.value === code || c.name === code);
      return grade?.name || grade?.value || code;
    },
    [gradeCodes],
  );

  const resolvePackingLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const packing = packingCodes?.find((c) => c.value === code || c.name === code);
      return packing?.name || packing?.value || code;
    },
    [packingCodes],
  );

  const fetchContainers = useCallback(async () => {
    try {
      setIsContainersLoading(true);
      const response = await api.get('/trade/contracts/containers', {});
      const containerList: Container[] = Array.isArray(response.data) ? response.data : [];
      setContainers(containerList);
    } catch (error) {
      console.error('컨테이너 목록 조회 실패:', error);
      setContainers([]);
    } finally {
      setIsContainersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      void fetchContainers();
    }
  }, [loading, user, fetchContainers]);

  const handleSortChange = useCallback((column: string, order: 'asc' | 'desc') => {
    setSortBy(column);
    setSortOrder(order);
    setPage(1);
  }, []);

  const sortedContainers = useMemo(() => {
    const sorted = [...containers].sort((a, b) => {
      let aValue: any = a[sortBy as keyof Container];
      let bValue: any = b[sortBy as keyof Container];

      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      if (typeof aValue === 'string') {
        aValue = aValue.toUpperCase();
      }
      if (typeof bValue === 'string') {
        bValue = bValue.toUpperCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [containers, sortBy, sortOrder]);

  const total = sortedContainers.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedContainers = sortedContainers.slice(startIndex, endIndex);

  const columns: ColumnDef<Container>[] = useMemo(
    () => [
      {
        accessorKey: 'contractNo',
        header: '계약번호',
        cell: ({ row }) => {
          const value = row.getValue('contractNo') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'bk',
        header: 'B/K',
        cell: ({ row }) => {
          const value = row.getValue('bk') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'bl',
        header: 'B/L',
        cell: ({ row }) => {
          const value = row.getValue('bl') as string | null;
          return <div className="font-medium">{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'exportCountryName',
        header: '수출국',
        cell: ({ row }) => {
          const value = row.getValue('exportCountryName') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'exporterName',
        header: '수출자',
        cell: ({ row }) => {
          const value = row.getValue('exporterName') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'destinationName',
        header: '목적지',
        cell: ({ row }) => {
          const value = row.getValue('destinationName') as string | null;
          return <div>{resolveDestinationLabel(value)}</div>;
        },
      },
      {
        accessorKey: 'etaDate',
        header: 'ETA',
        cell: ({ row }) => {
          const value = row.getValue('etaDate') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'inboundWarehouseName',
        header: '창고',
        cell: ({ row }) => {
          const value = row.getValue('inboundWarehouseName') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'containerNo',
        header: '컨테이너 번호',
        cell: ({ row }) => {
          const value = row.getValue('containerNo') as string;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'inventoryStatus',
        header: '재고 상태',
        cell: ({ row }) => {
          const status = row.getValue('inventoryStatus') as string | null;
          if (!status) return <div>-</div>;
          const statusMap: Record<string, string> = {
            'AVAILABLE': '가용',
            'RESERVED': '예약됨',
            'PARTIALLY_RESERVED': '부분 예약',
            'PARTIALLY_SOLD': '부분 판매중',
            'PARTIALLY_SOLD_COMPLETED': '부분 판매완료',
            'SELLING': '판매중',
            'SOLD_OUT': '판매 완료',
          };
          return <div>{statusMap[status] || status}</div>;
        },
      },
      {
        accessorKey: 'productName',
        header: '제품',
        cell: ({ row }) => {
          const value = row.getValue('productName') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'tradeGradeName',
        header: '등급(무역)',
        cell: ({ row }) => {
          const value = row.getValue('tradeGradeName') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'salesGradeName',
        header: '등급(영업)',
        cell: ({ row }) => {
          const value = row.getValue('salesGradeName') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'packingName',
        header: '포장',
        cell: ({ row }) => {
          const value = row.getValue('packingName') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'bales',
        header: '베일',
        cell: ({ row }) => {
          const value = row.getValue('bales') as number | null;
          return <div>{value != null ? Math.floor(value).toLocaleString('ko-KR') : '-'}</div>;
        },
      },
      {
        accessorKey: 'availableWeight',
        header: '중량',
        cell: ({ row }) => {
          const value = row.getValue('availableWeight') as number | null;
          if (value == null) return <div>-</div>;
          const formatted = value.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
          // 소수점 이하 0 제거
          return <div>{formatted.replace(/\.?0+$/, '')}</div>;
        },
      },
      {
        accessorKey: 'pendingPurchaseCost',
        header: '예정원가',
        cell: ({ row }) => {
          const value = row.getValue('pendingPurchaseCost') as string | null;
          if (!value) return <div>-</div>;
          const numValue = Number(value);
          if (isNaN(numValue)) return <div>-</div>;
          return <div className="text-right">{numValue.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>;
        },
      },
      {
        accessorKey: 'confirmedPurchaseCost',
        header: '확정원가',
        cell: ({ row }) => {
          const value = row.getValue('confirmedPurchaseCost') as string | null;
          if (!value) return <div>-</div>;
          const numValue = Number(value);
          if (isNaN(numValue)) return <div>-</div>;
          return <div className="text-right">{numValue.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>;
        },
      },
      {
        accessorKey: 'inboundIgodate',
        header: '이고날짜',
        cell: ({ row }) => {
          const value = row.getValue('inboundIgodate') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'inboundQuarantineDate',
        header: '검역날짜',
        cell: ({ row }) => {
          const value = row.getValue('inboundQuarantineDate') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
      {
        accessorKey: 'inboundDtDate',
        header: 'DT날짜',
        cell: ({ row }) => {
          const value = row.getValue('inboundDtDate') as string | null;
          return <div>{value || '-'}</div>;
        },
      },
    ],
    [resolveGradeLabel, resolvePackingLabel, resolveDestinationLabel, resolveWarehouseLabel],
  );

  if (loading) {
    return (
      <AppLayout user={user}>
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
            <h1 className="text-2xl font-bold tracking-tight">재고 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              컨테이너별 재고를 확인하고 관리할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 테이블 카드 */}
        {isContainersLoading ? (
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            컨테이너 목록을 불러오는 중입니다...
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={paginatedContainers}
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            manualPagination={false}
            enableSorting={true}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            rowClassName="h-10"
          />
        )}
      </div>
    </AppLayout>
  );
}
