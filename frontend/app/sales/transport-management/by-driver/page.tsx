'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DriverDeliverySummary,
  useSalesDeliveriesByDriver,
} from '@/lib/hooks/use-sales-delivery';
import { SalesDeliveryDetailDrawer } from '@/components/sales-delivery/sales-delivery-detail-drawer';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { cn, formatNumber } from '@/lib/utils';
import {
  filterDriverGroupsByContainerTypes,
  formatLoadingContainerTypes,
  getGroupContainerTypes,
  getUnloadingAddressLine,
  type LoadingContainerTypeFilter,
} from '@/lib/sales/driver-delivery-group';

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

function SalesTransportByDriverPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [search, setSearch] = React.useState('');
  const [searchInput, setSearchInput] = React.useState('');
  const [selectedGroupKey, setSelectedGroupKey] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<'ALL' | LoadingContainerTypeFilter>('ALL');

  const typeFilters = React.useMemo((): ReadonlySet<LoadingContainerTypeFilter> => {
    if (typeFilter === 'ALL') return new Set();
    return new Set([typeFilter]);
  }, [typeFilter]);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = React.useState<string | null>(null);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');
  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (statusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [statusCodes]);

  const { data: byDriverData, isLoading, isFetching } = useSalesDeliveriesByDriver(
    search || undefined,
  );

  const driverGroups = byDriverData?.groups ?? [];
  const totalDeliveries = byDriverData?.totalDeliveries ?? 0;
  const totalDrivers = byDriverData?.totalDrivers ?? 0;

  const filteredDriverGroups = React.useMemo(
    () => filterDriverGroupsByContainerTypes(driverGroups, typeFilters),
    [driverGroups, typeFilters],
  );

  const filteredDeliveryCount = React.useMemo(
    () => filteredDriverGroups.reduce((sum, g) => sum + g.deliveryCount, 0),
    [filteredDriverGroups],
  );

  const selectedGroup = React.useMemo(
    () => filteredDriverGroups.find((g) => g.key === selectedGroupKey) ?? null,
    [filteredDriverGroups, selectedGroupKey],
  );

  React.useEffect(() => {
    if (filteredDriverGroups.length === 0) {
      setSelectedGroupKey(null);
      return;
    }
    if (!selectedGroupKey || !filteredDriverGroups.some((g) => g.key === selectedGroupKey)) {
      setSelectedGroupKey(filteredDriverGroups[0].key);
    }
  }, [filteredDriverGroups, selectedGroupKey]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const getGroupTypesLabel = React.useCallback((deliveries: DriverDeliverySummary[]) => {
    const types = getGroupContainerTypes(deliveries);
    if (types.length === 0) return null;
    return formatLoadingContainerTypes(types.join(','));
  }, []);

  const getStatusLabel = React.useCallback(
    (status?: string | null) => {
      const v = status || 'PENDING_DISPATCH';
      return statusMap.get(v) || v;
    },
    [statusMap],
  );

  const detailColumns: ColumnDef<DriverDeliverySummary>[] = React.useMemo(
    () => [
      {
        id: 'orderNumber',
        accessorKey: 'orderNumber',
        header: '운송번호',
        cell: ({ row }) => (
          <span className="text-sm font-mono">{row.original.orderNumber || '-'}</span>
        ),
        size: 110,
      },
      {
        id: 'vehicleNumber',
        accessorKey: 'vehicleNumber',
        header: '차량번호',
        cell: ({ row }) => <span className="text-sm">{row.original.vehicleNumber || '-'}</span>,
        size: 100,
      },
      {
        id: 'driverContact',
        accessorKey: 'driverContact',
        header: '운송차 연락처',
        cell: ({ row }) => (
          <span className="text-sm">{formatPhone(row.original.driverContact)}</span>
        ),
        size: 120,
      },
      {
        id: 'driverName',
        accessorKey: 'driverName',
        header: '기사명',
        cell: ({ row }) => <span className="text-sm">{row.original.driverName || '-'}</span>,
        size: 90,
      },
      {
        id: 'loadingContainerTypes',
        accessorKey: 'loadingContainerTypes',
        header: '타입',
        cell: ({ row }) => (
          <span className="text-sm">
            {formatLoadingContainerTypes(row.original.loadingContainerTypes)}
          </span>
        ),
        size: 88,
      },
      {
        id: 'transportFee',
        accessorKey: 'transportFee',
        header: '운송비',
        cell: ({ row }) => {
          const fee = row.original.transportFee;
          if (fee == null) return <span className="text-sm">-</span>;
          return <span className="text-sm">{formatNumber(fee)}원</span>;
        },
        size: 100,
      },
      {
        id: 'unloadingAddress',
        header: '하차지',
        cell: ({ row }) => (
          <span className="text-sm line-clamp-2" title={getUnloadingAddressLine(row.original)}>
            {getUnloadingAddressLine(row.original) || '-'}
          </span>
        ),
        size: 220,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: '상태',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs font-normal">
            {getStatusLabel(row.original.status)}
          </Badge>
        ),
        size: 100,
      },
    ],
    [getStatusLabel],
  );

  if (!user) {
    return (
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          로딩 중...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 h-[calc(100svh-9rem)] max-h-[calc(100svh-9rem)]">
        <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">기사별 운송</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
              운송관리 배차 내역(차량·기사·연락처) 기준으로 기사별로 묶어 표시합니다.
              {!isLoading && !isFetching && (
                <span>
                  {' '}
                  (운송{' '}
                  {(typeFilter !== 'ALL'
                    ? filteredDeliveryCount
                    : totalDeliveries
                  ).toLocaleString('ko-KR')}
                  건 · 기사{' '}
                  {(typeFilter !== 'ALL'
                    ? filteredDriverGroups.length
                    : totalDrivers
                  ).toLocaleString('ko-KR')}
                  명
                  {typeFilter !== 'ALL' && (
                    <span className="text-foreground/70">
                      {' '}
                      / 전체 {totalDeliveries.toLocaleString('ko-KR')}건 ·{' '}
                      {totalDrivers.toLocaleString('ko-KR')}명
                    </span>
                  )}
                  )
                </span>
              )}
            </p>
          </div>
          <form onSubmit={handleSearchSubmit} className="flex w-full sm:w-auto gap-2 items-end">
            <div className="flex-1 sm:w-64 space-y-1">
              <Label htmlFor="driver-search" className="text-xs text-muted-foreground">
                검색
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="driver-search"
                  placeholder="기사명, 차량, 연락처, 운송번호…"
                  className="pl-8"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit">조회</Button>
          </form>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 max-lg:grid-rows-[minmax(0,38vh)_minmax(0,1fr)] lg:grid-cols-[minmax(240px,320px)_1fr] lg:grid-rows-1">
          <Card className="flex min-h-0 flex-col gap-0 overflow-hidden py-0 max-lg:max-h-[38vh] lg:h-full">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-semibold shrink-0">
                  기사 ({filteredDriverGroups.length})
                </span>
                {isLoading && (
                  <span className="text-xs text-muted-foreground">불러오는 중…</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Label htmlFor="driver-type-filter" className="text-xs text-muted-foreground">
                  타입
                </Label>
                <Select
                  value={typeFilter}
                  onValueChange={(v) =>
                    setTypeFilter(v as 'ALL' | LoadingContainerTypeFilter)
                  }
                >
                  <SelectTrigger id="driver-type-filter" className="h-8 w-[100px] text-xs">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">전체</SelectItem>
                    <SelectItem value="CARGO">카고</SelectItem>
                    <SelectItem value="CONTAINER">컨테이너</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                {filteredDriverGroups.length === 0 && !isLoading ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    {typeFilter !== 'ALL'
                      ? '선택한 타입에 해당하는 기사가 없습니다.'
                      : '표시할 운송이 없습니다.'}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {filteredDriverGroups.map((group) => (
                      <li key={group.key}>
                        <button
                          type="button"
                          className={cn(
                            'w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors',
                            selectedGroupKey === group.key && 'bg-muted',
                          )}
                          onClick={() => setSelectedGroupKey(group.key)}
                        >
                          <div className="text-sm font-medium leading-snug">{group.label}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{group.deliveryCount}건</span>
                            {(() => {
                              const typesLabel = getGroupTypesLabel(group.deliveries);
                              return typesLabel ? <span>{typesLabel}</span> : null;
                            })()}
                            {group.transportFeeSum > 0 && (
                              <span>운송비 합 {formatNumber(group.transportFeeSum)}원</span>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
            {selectedGroup ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{selectedGroup.label}</span>
                  <Badge variant="secondary">{selectedGroup.deliveryCount}건</Badge>
                  {(() => {
                    const typesLabel = getGroupTypesLabel(selectedGroup.deliveries);
                    return typesLabel ? (
                      <Badge variant="outline" className="font-normal">
                        {typesLabel}
                      </Badge>
                    ) : null;
                  })()}
                  {selectedGroup.transportFeeSum > 0 && (
                    <span className="text-muted-foreground">
                      운송비 합계 {formatNumber(selectedGroup.transportFeeSum)}원
                    </span>
                  )}
                </div>
                <DataTable
                  columns={detailColumns}
                  data={selectedGroup.deliveries}
                  isLoading={isLoading}
                  pageSize={20}
                  pageSizeCookieKey="transport-by-driver-page-size"
                  onRowClick={(row) => {
                    setSelectedDeliveryId(row.id);
                    setDetailDrawerOpen(true);
                  }}
                />
              </>
            ) : (
              <Card className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-muted-foreground">왼쪽에서 기사를 선택하세요.</p>
              </Card>
            )}
          </div>
        </div>
      </div>

      <SalesDeliveryDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={(open) => {
          setDetailDrawerOpen(open);
          if (!open) setSelectedDeliveryId(null);
        }}
        deliveryId={selectedDeliveryId}
        title="운송관리 상세정보"
        description="판매 연동 배송 정보를 확인합니다."
        showTransportStatusAudit={false}
      />
    </AppLayout>
  );
}

export default function SalesTransportByDriverPage() {
  return (
    <Suspense fallback={null}>
      <SalesTransportByDriverPageContent />
    </Suspense>
  );
}
