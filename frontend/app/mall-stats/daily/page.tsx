'use client';

import * as React from 'react';
import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  useMallDailyStats,
  useCreateMallDailyStat,
  useUpdateMallDailyStat,
  useDeleteMallDailyStat,
  MallDailyStat,
} from '@/lib/hooks/use-mall-daily-stats';
import { MallDailyStatFormDrawer } from '@/components/mall-stats/mall-daily-stat-form-drawer';
import { MallDailyStatDetailDrawer } from '@/components/mall-stats/mall-daily-stat-detail-drawer';
import { Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
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
import { toast } from '@/components/ui/use-toast';
import Cookies from 'js-cookie';

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) return parsed;
  }
  return 20;
};

function formatNum(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

export default function MallStatsDailyPage() {
  type SortBy =
    | 'statDate'
    | 'totalVisitors'
    | 'visits'
    | 'newVisitors'
    | 'returningVisitors'
    | 'pageViews'
    | 'appInstalls'
    | 'memberSignups'
    | 'salesCount';

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(getInitialPageSize);
  const [sortBy, setSortBy] = useState<SortBy>('statDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedRow, setSelectedRow] = useState<MallDailyStat | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MallDailyStat | null>(null);

  const { data, isLoading } = useMallDailyStats({
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
  });
  const createMutation = useCreateMallDailyStat();
  const updateMutation = useUpdateMallDailyStat();
  const deleteMutation = useDeleteMallDailyStat();

  const handleAdd = () => {
    setSelectedRow(null);
    setFormMode('create');
    setFormDrawerOpen(true);
  };

  const handleRowClick = (row: MallDailyStat) => {
    setSelectedRowId(row.id);
    setSelectedRow(row);
    setDetailDrawerOpen(true);
  };

  const handleEditFromDetail = () => {
    if (selectedRow) {
      setFormMode('edit');
      setDetailDrawerOpen(false);
      setFormDrawerOpen(true);
    }
  };

  const handleDeleteFromDetail = () => {
    if (selectedRow) {
      setDeleteTarget(selectedRow);
      setDetailDrawerOpen(false);
    }
  };

  const handleFormSubmit = async (
    formData: Omit<MallDailyStat, 'id' | 'createdAt' | 'updatedAt'>,
  ) => {
    try {
      if (formMode === 'edit' && selectedRow) {
        await updateMutation.mutateAsync({ id: selectedRow.id, data: formData });
        toast({ title: '수정되었습니다.' });
      } else {
        await createMutation.mutateAsync(formData);
        toast({ title: '등록되었습니다.' });
      }
      setFormDrawerOpen(false);
      setSelectedRow(null);
    } catch (e: unknown) {
      const msg =
        e &&
        typeof e === 'object' &&
        'response' in e &&
        (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast({
        title: typeof msg === 'string' ? msg : '저장에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: '삭제되었습니다.' });
      setDeleteTarget(null);
      if (selectedRowId === deleteTarget.id) {
        setSelectedRowId(null);
        setSelectedRow(null);
      }
    } catch (e: unknown) {
      const msg =
        e &&
        typeof e === 'object' &&
        'response' in e &&
        (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast({
        title: typeof msg === 'string' ? msg : '삭제에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const columns = React.useMemo<ColumnDef<MallDailyStat>[]>(
    () => [
      {
        accessorKey: 'statDate',
        header: '날짜',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm">
            {format(parseISO(row.original.statDate), 'yyyy-MM-dd (EEE)', { locale: ko })}
          </span>
        ),
        size: 140,
      },
      {
        accessorKey: 'totalVisitors',
        header: '총 방문자',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-right tabular-nums">{formatNum(row.original.totalVisitors)}</span>
        ),
        size: 100,
      },
      {
        accessorKey: 'visits',
        header: '방문횟수',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-right tabular-nums">{formatNum(row.original.visits)}</span>
        ),
        size: 90,
      },
      {
        accessorKey: 'newVisitors',
        header: '신규',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-right tabular-nums">{formatNum(row.original.newVisitors)}</span>
        ),
        size: 80,
      },
      {
        accessorKey: 'returningVisitors',
        header: '재방문',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-right tabular-nums">{formatNum(row.original.returningVisitors)}</span>
        ),
        size: 80,
      },
      {
        accessorKey: 'pageViews',
        header: '페이지뷰',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-right tabular-nums">{formatNum(row.original.pageViews)}</span>
        ),
        size: 95,
      },
      {
        accessorKey: 'appInstalls',
        header: '어플설치',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-right tabular-nums">{formatNum(row.original.appInstalls)}</span>
        ),
        size: 90,
      },
      {
        accessorKey: 'memberSignups',
        header: '회원가입',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-right tabular-nums">{formatNum(row.original.memberSignups)}</span>
        ),
        size: 85,
      },
      {
        accessorKey: 'salesCount',
        header: '판매',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-right tabular-nums">{formatNum(row.original.salesCount)}</span>
        ),
        size: 75,
      },
    ],
    [],
  );

  const list = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const detailRow = selectedRowId != null ? list.find((r) => r.id === selectedRowId) ?? selectedRow : selectedRow;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* 헤더: 제목 + 추가 버튼 */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">일별 데이터 관리</h1>
            <p className="text-sm text-muted-foreground">
              쇼핑몰·앱 일별 통계를 입력·수정합니다. 행을 클릭하면 상세를 볼 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              추가
            </Button>
          </div>
        </div>

        {/* 바디: 공통 DataTable */}
        <DataTable
          columns={columns}
          data={list}
          isLoading={isLoading}
          manualPagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onRowClick={handleRowClick}
          enableSorting
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(by, order) => {
            setSortBy(by as SortBy);
            setSortOrder(order);
            setPage(1);
          }}
          showRowNumber
          rowClassName="cursor-pointer"
          bodyCellClassName="py-2.5"
          pageSizeCookieKey="data-table-page-size"
        />

        {/* 추가/수정 Drawer — 외부 클릭 시 닫지 않음 */}
        <MallDailyStatFormDrawer
          open={formDrawerOpen}
          onOpenChange={setFormDrawerOpen}
          onClose={() => setFormDrawerOpen(false)}
          initialData={formMode === 'edit' ? selectedRow ?? undefined : null}
          mode={formMode}
          onSubmit={handleFormSubmit}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />

        {/* 상세 Drawer — 외부 클릭 시 닫지 않음 */}
        <MallDailyStatDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={setDetailDrawerOpen}
          onClose={() => {
            setDetailDrawerOpen(false);
            setSelectedRowId(null);
            setSelectedRow(null);
          }}
          row={detailRow}
          onEdit={handleEditFromDetail}
          onDelete={handleDeleteFromDetail}
        />

        {/* 삭제 확인 다이얼로그 */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>삭제 확인</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && (
                  <>"{deleteTarget.statDate}" 일별 데이터를 삭제하시겠습니까?</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
