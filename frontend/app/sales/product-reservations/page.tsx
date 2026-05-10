'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import {
  useSalesReservationsList,
  reservationProductLabel,
  type SalesReservation,
} from '@/lib/hooks/use-sales-reservations';
import { SalesReservationDrawer } from '@/components/sales/sales-reservation-drawer';
import { InboundStatusBadge } from '@/components/sales/inbound-status-badge';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { formatDecimalTrimTrailingZeros } from '@/lib/utils';

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 50;
  const saved = Cookies.get('sales-reservation-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) {
      return parsed;
    }
  }
  return 50;
};

export default function ProductSalesReservationsPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: requestVehicleCodes = [] } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: salesPriceStageCodes = [] } = useCodeMastersByGroup('SALES_PRICE_STAGE');

  const requestVehicleLabel = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of requestVehicleCodes) {
      const v = (c.value || c.name || '').trim();
      if (v) m.set(v, (c.name || c.value || v).trim());
    }
    return (raw: string | null | undefined) => {
      const t = (raw ?? '').trim();
      if (!t) return '-';
      return m.get(t) ?? t;
    };
  }, [requestVehicleCodes]);

  const unitPriceStageLabel = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of salesPriceStageCodes) {
      const v = (c.value || c.name || '').trim();
      if (v) m.set(v, (c.name || c.value || v).trim());
    }
    return (raw: string | null | undefined) => {
      const t = (raw ?? '').trim();
      if (!t) return '-';
      return m.get(t) ?? t;
    };
  }, [salesPriceStageCodes]);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, pageSize]);

  const { data, isLoading } = useSalesReservationsList({
    page,
    limit: pageSize,
    search: debouncedSearch.trim() || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const columns = React.useMemo<ColumnDef<SalesReservation>[]>(
    () => [
      {
        id: 'product',
        header: '상품',
        cell: ({ row }) => (
          <span className="text-sm">{reservationProductLabel(row.original, productCodes)}</span>
        ),
        size: 140,
      },
      {
        id: 'customerName',
        accessorKey: 'customerName',
        header: '업체',
        cell: ({ row }) => <span className="text-sm">{row.original.customerName || '-'}</span>,
        size: 120,
      },
      {
        id: 'bl',
        accessorKey: 'bl',
        header: 'BL',
        cell: ({ row }) => (
          <span className="text-sm font-mono">{row.original.bl || '-'}</span>
        ),
        size: 130,
      },
      {
        id: 'tradeOrderInboundStatus',
        header: '입고 상태',
        cell: ({ row }) => <InboundStatusBadge status={row.original.tradeOrderInboundStatus} />,
        size: 100,
      },
      {
        id: 'contactPhone',
        accessorKey: 'contactPhone',
        header: '담당연락처',
        cell: ({ row }) => <span className="text-sm">{row.original.contactPhone || '-'}</span>,
        size: 110,
      },
      {
        id: 'requestedQty',
        header: '요청수량',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.requestedQty != null && row.original.requestedQty !== ''
              ? formatDecimalTrimTrailingZeros(row.original.requestedQty)
              : '-'}
          </span>
        ),
        size: 90,
      },
      {
        id: 'vehicleType',
        accessorKey: 'vehicleType',
        header: '차량 분류',
        cell: ({ row }) => (
          <span className="text-sm">{requestVehicleLabel(row.original.vehicleType)}</span>
        ),
        size: 100,
      },
      {
        id: 'warehouse',
        header: '상차창고',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.loadingWarehouseName || row.original.loadingWarehouseText || '-'}
          </span>
        ),
        size: 100,
      },
      {
        id: 'loadingScheduleNote',
        header: '상차일정',
        cell: ({ row }) => (
          <span
            className="text-sm line-clamp-2 max-w-[180px]"
            title={row.original.loadingScheduleNote ?? ''}
          >
            {row.original.loadingScheduleNote || '-'}
          </span>
        ),
        size: 140,
      },
      {
        id: 'unitPriceStage',
        header: '구분',
        cell: ({ row }) => (
          <span className="text-sm">{unitPriceStageLabel(row.original.unitPriceStage)}</span>
        ),
        size: 88,
      },
      {
        id: 'unitPrice',
        header: '단가',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.unitPrice != null && row.original.unitPrice !== ''
              ? formatDecimalTrimTrailingZeros(row.original.unitPrice)
              : '-'}
          </span>
        ),
        size: 80,
      },
      {
        id: 'reference',
        header: '참고',
        cell: ({ row }) => (
          <span
            className="text-sm line-clamp-2 max-w-[160px]"
            title={row.original.reference ?? ''}
          >
            {row.original.reference?.trim() ? row.original.reference : '-'}
          </span>
        ),
        size: 140,
      },
      {
        id: 'remarks',
        header: '비고',
        cell: ({ row }) => (
          <span className="text-sm line-clamp-2 max-w-[160px]" title={row.original.remarks ?? ''}>
            {row.original.remarks || '-'}
          </span>
        ),
        size: 160,
      },
    ],
    [requestVehicleLabel, unitPriceStageLabel, productCodes]
  );

  const openCreate = () => {
    setSelectedId(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: SalesReservation) => {
    setSelectedId(row.id);
    setDrawerOpen(true);
  };

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Label
          htmlFor="product-reservations-search"
          className="whitespace-nowrap text-sm font-medium text-muted-foreground"
        >
          검색
        </Label>
        <Input
          id="product-reservations-search"
          value={search}
          placeholder="BL·비고·참고·고객명 검색"
          className="w-56 md:w-64"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상태</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="ACTIVE">ACTIVE</SelectItem>
            <SelectItem value="CANCELLED">CANCELLED</SelectItem>
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
            <h1 className="text-2xl font-bold tracking-tight">판매예약</h1>
            <p className="hidden text-muted-foreground md:block">
              예약 건을 표 형태로 관리합니다. 상품명은 BL·발주 연결로 조회되며, 업체는 고객 마스터를 사용합니다.
            </p>
          </div>
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            추가
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          manualPagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          pageSizeCookieKey="sales-reservation-page-size"
          filterControls={filterControls}
          onRowClick={(row) => openEdit(row)}
          columnSettingsIconOnly
          rowClassName="h-10"
        />

        <SalesReservationDrawer
          open={drawerOpen}
          onOpenChange={(o) => {
            setDrawerOpen(o);
            if (!o) setSelectedId(null);
          }}
          reservationId={selectedId}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['sales-reservations'] });
          }}
        />
      </div>
    </AppLayout>
  );
}
