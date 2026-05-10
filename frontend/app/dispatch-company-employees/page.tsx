'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
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

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  DispatchUser,
  useDispatchUsers,
  useDeleteDispatchUser,
} from '@/lib/hooks/use-dispatch-users';
import { DispatchCompanyEmployeeFormDrawer } from '@/components/dispatch-company-employees/dispatch-company-employee-form-drawer';
import { DispatchCompanyEmployeeDetailDrawer } from '@/components/dispatch-company-employees/dispatch-company-employee-detail-drawer';
import Cookies from 'js-cookie';

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


export default function DispatchCompanyEmployeesPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedDispatchUser, setSelectedDispatchUser] = React.useState<DispatchUser | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedDispatchUserId, setSelectedDispatchUserId] = React.useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [dispatchUserToDelete, setDispatchUserToDelete] = React.useState<DispatchUser | null>(null);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const params = React.useMemo(
    () => ({
      search: search.trim() || undefined,
    }),
    [search],
  );

  const { data: dispatchUsers = [], isLoading, refetch } = useDispatchUsers(params);
  const deleteMutation = useDeleteDispatchUser();

  const handleCreate = () => {
    setSelectedDispatchUser(null);
    setDrawerOpen(true);
  };

  const handleRowClick = (dispatchUser: DispatchUser) => {
    setSelectedDispatchUserId(dispatchUser.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (dispatchUser: DispatchUser) => {
    setSelectedDispatchUser(dispatchUser);
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleDelete = (dispatchUser: DispatchUser) => {
    setDispatchUserToDelete(dispatchUser);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!dispatchUserToDelete) return;

    try {
      await deleteMutation.mutateAsync(dispatchUserToDelete.id);
      toast({
        title: '삭제 완료',
        description: '배차 업체 직원을 삭제했습니다.',
      });
      setDeleteDialogOpen(false);
      setDispatchUserToDelete(null);
      refetch();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ||
        '삭제 중 오류가 발생했습니다.';
      toast({
        title: '삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
      });
    }
  };

  const handleFormSubmit = async () => {
    await refetch();
  };

  const columns = React.useMemo<ColumnDef<DispatchUser>[]>(() => {
    return [
      {
        accessorKey: 'user.email',
        header: '이메일',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm font-semibold">{row.original.user?.email || '-'}</div>
        ),
        size: 200,
      },
      {
        accessorKey: 'name',
        header: '이름',
        enableSorting: false,
        cell: ({ row }) => <div className="text-sm">{row.original.name || '-'}</div>,
        size: 120,
      },
      {
        accessorKey: 'dispatchCompany.name',
        header: '배차 업체',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.dispatchCompany?.name || '-'}</div>
        ),
        size: 200,
      },
      {
        accessorKey: 'status',
        header: '상태',
        enableSorting: false,
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Badge variant={status ? 'default' : 'secondary'}>
              {status ? '활성' : '비활성'}
            </Badge>
          );
        },
        size: 100,
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        enableSorting: false,
        cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
        size: 120,
      },
    ];
  }, []);

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          검색
        </Label>
        <Input
          id="search"
          value={search}
          placeholder="이메일, 이름, 배차 업체명"
          className="w-48 md:w-60"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">배차 업체 직원 관리</h1>
            <p className="text-sm text-muted-foreground">
              배차 업체 직원을 조회하고 관리합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              직원 추가
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={dispatchUsers}
          isLoading={isLoading}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={dispatchUsers.length}
          totalPages={Math.max(1, Math.ceil(dispatchUsers.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
        />

        <DispatchCompanyEmployeeFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedDispatchUser(null);
            }
          }}
          dispatchUser={selectedDispatchUser}
          onSubmit={handleFormSubmit}
          onCancel={
            selectedDispatchUser
              ? () => {
                  setDrawerOpen(false);
                  setSelectedDispatchUserId(selectedDispatchUser.id);
                  setDetailDrawerOpen(true);
                }
              : undefined
          }
        />

        <DispatchCompanyEmployeeDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedDispatchUserId(null);
            }
          }}
          dispatchUserId={selectedDispatchUserId}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        {/* 삭제 확인 다이얼로그 */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>삭제 확인</AlertDialogTitle>
              <AlertDialogDescription>
                정말로 이 배차 업체 직원을 삭제하시겠습니까?
                <br />
                <span className="font-medium">
                  {dispatchUserToDelete?.user?.email || dispatchUserToDelete?.name}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDispatchUserToDelete(null);
                }}
              >
                취소
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
