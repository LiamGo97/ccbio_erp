'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { MismatchDetailDrawer } from '@/components/sales/mismatch-detail-drawer';

export interface MismatchRow {
  orderNumber: string;
  salesId: string;
  salesItemId: string;
  type: 'CONTAINER' | 'CARGO';
  deliveryId: string;
  loadingItemId: string;
  contractNo: string | null;
  farmName: string | null;
  companyName: string | null;
  ceo: string | null;
  warehouseName: string | null;
  salesBl: string | null;
  transportBl: string | null;
  salesContainer: string | null;
  transportContainer: string | null;
  salesBales: number | null;
  transportBales: number | null;
  salesWeight: number | null;
  transportWeight: number | null;
  blMismatch: 'Y' | '-';
  containerMismatch: 'Y' | '-';
  balesMismatch: 'Y' | '-';
  weightMismatch: 'Y' | '-';
}

function SalesTransportMismatchPageContent() {
  const columnSettings = useColumnSettings('sales-transport-mismatch');
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedSalesId, setSelectedSalesId] = React.useState<string | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const { data: rows = [], isLoading } = useQuery<MismatchRow[]>({
    queryKey: ['deliveries', 'mismatch'],
    queryFn: async () => {
      const { data } = await api.get<MismatchRow[]>('/deliveries/mismatch');
      return data;
    },
  });

  const columns: ColumnDef<MismatchRow>[] = React.useMemo(
    () => [
      {
        id: 'orderNumber',
        accessorKey: 'orderNumber',
        header: '운송번호',
        cell: ({ row }) => (
          <Link
            href={`/sales/transport-management/transport?id=${row.original.deliveryId}`}
            className="text-sm font-mono text-primary hover:underline"
          >
            {row.original.orderNumber || '-'}
          </Link>
        ),
        size: 120,
      },
      {
        id: 'contractNo',
        accessorKey: 'contractNo',
        header: '계약번호',
        cell: ({ row }) => (
          <Link
            href={`/sales/${row.original.salesId}`}
            className="text-sm text-primary hover:underline"
          >
            {row.original.contractNo || '-'}
          </Link>
        ),
        size: 100,
      },
      {
        id: 'farmName',
        accessorKey: 'farmName',
        header: '농장명',
        cell: ({ row }) => <span className="text-sm">{row.original.farmName || '-'}</span>,
        size: 120,
      },
      {
        id: 'companyName',
        accessorKey: 'companyName',
        header: '업체명',
        cell: ({ row }) => <span className="text-sm">{row.original.companyName || '-'}</span>,
        size: 120,
      },
      {
        id: 'ceo',
        accessorKey: 'ceo',
        header: '대표자',
        cell: ({ row }) => <span className="text-sm">{row.original.ceo || '-'}</span>,
        size: 100,
      },
      {
        id: 'warehouseName',
        accessorKey: 'warehouseName',
        header: '상차지',
        cell: ({ row }) => <span className="text-sm">{row.original.warehouseName || '-'}</span>,
        size: 100,
      },
      {
        id: 'type',
        accessorKey: 'type',
        header: '타입',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.original.type}
          </Badge>
        ),
        size: 90,
      },
      {
        id: 'blMismatch',
        header: 'BL',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">판매: {row.original.salesBl || '-'}</div>
            <div className="text-xs text-muted-foreground">운송: {row.original.transportBl || '-'}</div>
            {row.original.blMismatch === 'Y' && (
              <Badge variant="destructive" className="text-xs">불일치</Badge>
            )}
          </div>
        ),
        size: 140,
      },
      {
        id: 'containerMismatch',
        header: '컨테이너',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">판매: {row.original.salesContainer || '-'}</div>
            <div className="text-xs text-muted-foreground">운송: {row.original.transportContainer || '-'}</div>
            {row.original.containerMismatch === 'Y' && (
              <Badge variant="destructive" className="text-xs">불일치</Badge>
            )}
          </div>
        ),
        size: 140,
      },
      {
        id: 'balesMismatch',
        header: '베일',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">판매: {row.original.salesBales ?? '-'}</div>
            <div className="text-xs text-muted-foreground">운송: {row.original.transportBales ?? '-'}</div>
            {row.original.balesMismatch === 'Y' && (
              <Badge variant="destructive" className="text-xs">불일치</Badge>
            )}
          </div>
        ),
        size: 100,
      },
      {
        id: 'weightMismatch',
        header: '중량',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">판매: {row.original.salesWeight ?? '-'}</div>
            <div className="text-xs text-muted-foreground">운송: {row.original.transportWeight ?? '-'}</div>
            {row.original.weightMismatch === 'Y' && (
              <Badge variant="destructive" className="text-xs">불일치</Badge>
            )}
          </div>
        ),
        size: 100,
      },
    ],
    []
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              판매·운송 불일치
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              하차완료된 운송만 대상으로, 판매 항목과 운송관리(BL, 컨테이너, 베일, 중량) 불일치 건을 조회합니다. CONTAINER는 BL·컨번호만, CARGO는 모두 검사합니다.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={rows}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          pageSize={50}
          pageSizeCookieKey="mismatch-page-size"
          onRowClick={(row) => {
            setSelectedSalesId(row.salesId);
            setSelectedDeliveryId(row.deliveryId);
            setDrawerOpen(true);
          }}
          noRowClickColumnIds={['orderNumber', 'contractNo']}
        />

        {/* 판매·운송 통합 상세 Drawer */}
        <MismatchDetailDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedSalesId(null);
              setSelectedDeliveryId(null);
              void queryClient.invalidateQueries({ queryKey: ['deliveries', 'mismatch'] });
            }
          }}
          salesId={selectedSalesId}
          deliveryId={selectedDeliveryId}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['deliveries', 'mismatch'] });
          }}
        />
      </div>
    </AppLayout>
  );
}

export default function SalesTransportMismatchPage() {
  return (
    <React.Suspense fallback={null}>
      <SalesTransportMismatchPageContent />
    </React.Suspense>
  );
}
