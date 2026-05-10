'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CollectionListItem,
  useCollections,
  GetCollectionsParams,
  CollectionListSortField,
  CollectionPrepaymentFilter,
} from '@/lib/hooks/use-collections';
import { CollectionFormDrawer } from '@/components/finance/collection-form-drawer';
import { Plus, Loader2 } from 'lucide-react';
import Cookies from 'js-cookie';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { useColumnSettings } from '@/hooks/use-column-settings';

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) return parsed;
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

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (num % 1 === 0) return num.toLocaleString('ko-KR');
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function CollectionsPageContent() {
  const columnSettings = useColumnSettings('finance-receivables-collect');
  const [user, setUser] = React.useState<User | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [search, setSearch] = React.useState('');
  const [dateRange, setDateRange] = React.useState<{ start?: Date; end?: Date }>({});
  const [formDrawerOpen, setFormDrawerOpen] = React.useState(false);
  const [selectedCollection, setSelectedCollection] = React.useState<CollectionListItem | null>(null);
  const [sortBy, setSortBy] = React.useState<CollectionListSortField>('collectionDate');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [prepaymentFilter, setPrepaymentFilter] = React.useState<CollectionPrepaymentFilter>('all');

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const params: GetCollectionsParams = React.useMemo(
    () => ({
      page,
      limit: pageSize,
      search: search.trim() || undefined,
      startDate: dateRange.start?.toISOString().slice(0, 10),
      endDate: dateRange.end?.toISOString().slice(0, 10),
      prepaymentFilter: prepaymentFilter === 'all' ? undefined : prepaymentFilter,
      sortBy,
      sortOrder,
    }),
    [page, pageSize, search, dateRange, prepaymentFilter, sortBy, sortOrder],
  );

  const { data, isLoading } = useCollections(params);
  const totalCollectionAmount = data?.totalCollectionAmount ?? 0;

  const columns: ColumnDef<CollectionListItem>[] = React.useMemo(
    () => [
      {
        accessorKey: 'collectionDate',
        header: '수금일',
        cell: ({ row }) => formatDate(row.original.collectionDate),
        size: 120,
      },
      {
        accessorKey: 'collectionNumber',
        header: '수금 번호',
        cell: ({ row }) => row.original.collectionNumber ?? '-',
        size: 150,
      },
      {
        accessorKey: 'companyName',
        header: '업체명',
        cell: ({ row }) => row.original.companyName ?? '-',
        size: 200,
      },
      {
        accessorKey: 'ceo',
        header: '고객명',
        cell: ({ row }) => row.original.ceo ?? '-',
        size: 150,
      },
      {
        accessorKey: 'collectionAmount',
        header: '수금 금액',
        cell: ({ row }) => (
          <span className="text-green-600 dark:text-green-400">
            {formatNumber(row.original.collectionAmount)}
          </span>
        ),
        size: 150,
      },
      {
        accessorKey: 'collectionMethod',
        header: '수금 방법',
        cell: ({ row }) => row.original.collectionMethod ?? '-',
        size: 120,
      },
      {
        accessorKey: 'isPrepayment',
        header: '선수금',
        cell: ({ row }) =>
          row.original.isPrepayment === true ? (
            <Badge
              variant="outline"
              className="border-amber-500 bg-amber-50 font-normal text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300"
            >
              선수금
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-gray-500 bg-gray-50 font-normal text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300"
            >
              일반
            </Badge>
          ),
        size: 100,
      },
      {
        accessorKey: 'notes',
        header: '비고',
        cell: ({ row }) => row.original.notes ?? '-',
        size: 200,
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        cell: ({ row }) => formatDate(row.original.createdAt),
        size: 120,
      },
    ],
    [],
  );

  const filterControls = (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          업체명·고객명 검색
        </Label>
        <input
          type="text"
          placeholder="업체명 또는 고객명으로 검색..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-8 w-[220px] rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">기간</Label>
        <DateRangePicker
          startDate={dateRange.start}
          endDate={dateRange.end}
          onChange={(start, end) => {
            setDateRange({ start, end });
            setPage(1);
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">선수금</Label>
        <Select
          value={prepaymentFilter === 'all' ? 'all' : prepaymentFilter}
          onValueChange={(v) => {
            setPrepaymentFilter(v as CollectionPrepaymentFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="normal">일반</SelectItem>
            <SelectItem value="prepayment">선수금</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">수금 관리</h1>
            <p className="text-muted-foreground text-sm">
              수금 목록을 조회하고 입력/수정할 수 있습니다.
            </p>
          </div>
          <Button
            onClick={() => {
              setSelectedCollection(null);
              setFormDrawerOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            수금 입력
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          filterControls={filterControls}
          headerRightContent={
            <div className="text-right">
              <div className="mb-1 text-xs text-muted-foreground">총 수금 금액</div>
              <div className="text-sm font-semibold">
                <span className="text-green-600 dark:text-green-400">
                  {totalCollectionAmount.toLocaleString('ko-KR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="ml-1 text-xs font-normal text-muted-foreground">원</span>
              </div>
            </div>
          }
          manualPagination
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(field, order) => {
            setSortBy(field as CollectionListSortField);
            setSortOrder(order);
            setPage(1);
          }}
          page={data?.page ?? 1}
          total={data?.total ?? 0}
          totalPages={data?.lastPage ?? 1}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(v) => {
            setPageSize(v);
            setPage(1);
          }}
          isLoading={isLoading}
          showRowNumber
          rowClassName="h-10"
          onRowClick={(row) => {
            setSelectedCollection(row);
            setFormDrawerOpen(true);
          }}
        />

        <CollectionFormDrawer
          open={formDrawerOpen}
          onOpenChange={(open) => {
            setFormDrawerOpen(open);
            if (!open) {
              setSelectedCollection(null);
            }
          }}
          collection={selectedCollection}
          onSuccess={() => {
            setFormDrawerOpen(false);
            setSelectedCollection(null);
          }}
        />
      </div>
    </AppLayout>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense
      fallback={
        <AppLayout user={null}>
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </AppLayout>
      }
    >
      <CollectionsPageContent />
    </Suspense>
  );
}
