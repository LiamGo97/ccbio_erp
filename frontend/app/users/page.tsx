'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { isAxiosError } from 'axios';
import { DataTable } from '@/components/ui/data-table';
import { useUsers, useDeleteUser, GetUsersParams } from '@/lib/hooks/use-users';
import { User } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/app-layout';
import { auth } from '@/lib/auth';
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
import { UserFormDrawer } from '@/components/users/user-form-drawer';
import { UserDetailDrawer } from '@/components/users/user-detail-drawer';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { toast } from '@/components/ui/use-toast';

// 사용자 테이블 컬럼 정의
export default function UsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const deleteUser = useDeleteUser();
  
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchValue, setSearchValue] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 검색 디바운스
  const [debouncedSearch, setDebouncedSearch] = useState(searchValue);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1); // 검색 시 첫 페이지로
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // 필터 변경 시 첫 페이지로
  const handleFilterChange = (value: string) => {
    setActiveFilter(value as 'all' | 'active' | 'inactive');
    setPage(1);
  };

  // 정렬 변경 핸들러
  const handleSortChange = (newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1); // 정렬 변경 시 첫 페이지로
  };

  // API 파라미터
  const queryParams: GetUsersParams = React.useMemo(() => ({
    page,
    limit: pageSize,
    search: debouncedSearch || undefined,
    status: activeFilter,
    sortBy,
    sortOrder,
  }), [page, pageSize, debouncedSearch, activeFilter, sortBy, sortOrder]);

  const { data: usersResponse, isLoading, error } = useUsers(queryParams);
  const users = usersResponse?.data || [];
  const total = usersResponse?.total || 0;
  const totalPages = usersResponse?.totalPages || 0;

  // 필터 탭 데이터 (전체 카운트는 별도로 조회 필요하지만, 일단 현재 필터 기준으로 표시)
  const filterTabs = React.useMemo(() => {
    // TODO: 전체/활성/비활성 카운트를 별도 API로 조회하거나, 각 필터별로 조회
    // 현재는 서버에서 받은 total을 사용
    return [
      { label: '전체', value: 'all', count: total },
      { label: '활성', value: 'active' },
      { label: '비활성', value: 'inactive' },
    ];
  }, [total]);

  const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'email',
    header: '이메일',
    enableSorting: true,
    cell: ({ row }) => {
      return <div className="font-medium">{row.getValue('email')}</div>;
    },
  },
  {
    accessorKey: 'name',
    header: '이름',
    enableSorting: true,
    cell: ({ row }) => {
      return <div>{row.getValue('name') || '-'}</div>;
    },
  },
  {
    accessorKey: 'phone',
    header: '전화번호',
    enableSorting: false,
    cell: ({ row }) => {
      const user = row.original as User;
      return <div>{user.phone || '-'}</div>;
    },
  },
  {
    id: 'loginType',
    header: '로그인 방식',
    enableSorting: false,
    cell: ({ row }) => {
      const user = row.original as User;
      const isGoogleUser = !!user.googleId;
      return (
        <Badge variant={isGoogleUser ? 'default' : 'outline'}>
          {isGoogleUser ? '구글' : '이메일'}
        </Badge>
      );
    },
  },
  {
    id: 'roles',
    header: '역할',
    enableSorting: false,
    cell: ({ row }) => {
      const user = row.original as User;
      const roles = user.roles || [];
      if (roles.length === 0) {
        return <div className="text-muted-foreground">-</div>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {roles.map((role) => (
            <Badge key={role.id} variant="outline" className="text-xs">
              {role.name}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: 'isActive',
    header: '상태',
    enableSorting: true,
    cell: ({ row }) => {
      const user = row.original as User;
      const isActive = user.isActive !== false;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? '활성' : '비활성'}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: '가입일',
    enableSorting: true,
    cell: ({ row }) => {
      const user = row.original as User;
      const date = user.createdAt;
      if (!date) return '-';
      try {
        return format(new Date(date), 'yyyy-MM-dd HH:mm', { locale: ko });
      } catch {
        return '-';
      }
    },
  },
];

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchUser = async () => {
      const userData = await auth.getCurrentUser();
      if (!userData) {
        router.push('/login');
        return;
      }
      setUser(userData);
      setLoading(false);
    };

    fetchUser();
  }, [router]);

  if (loading || isLoading) {
    return (
      <AppLayout user={user}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout user={user}>
        <div className="flex items-center justify-center h-64">
          <div className="text-destructive">에러가 발생했습니다.</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        {/* 헤더 영역 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">사용자 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              시스템 사용자 목록을 확인하고 관리할 수 있습니다.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSelectedUser(null);
              setSelectedUserId(null);
              setDrawerMode('create');
              setFormDrawerOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            사용자 추가
          </Button>
        </div>

        {/* 테이블 카드 */}
        <DataTable
          columns={columns}
          data={users}
          searchKey="email"
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="이메일로 검색..."
          filterTabs={filterTabs}
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          manualPagination={true}
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          onRowClick={(user) => {
            setSelectedUserId(user.id);
            setDetailDrawerOpen(true);
          }}
        />
      </div>

      {/* 상세보기 Drawer */}
      <UserDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={(open) => {
          setDetailDrawerOpen(open);
          if (!open) {
            setSelectedUserId(null);
          }
        }}
        userId={selectedUserId}
        onEdit={(userId) => {
          const user = users.find((u) => u.id === userId);
          if (user) {
            setSelectedUser(user);
            setDrawerMode('edit');
            setFormDrawerOpen(true);
          }
        }}
        onDelete={(userId) => {
          const user = users.find((u) => u.id === userId);
          if (user) {
            setUserToDelete(user);
            setDeleteDialogOpen(true);
          }
        }}
      />

      {/* 추가/수정 Drawer */}
      <UserFormDrawer
        key={`${drawerMode}-${selectedUser?.id || 'new'}`}
        open={formDrawerOpen}
        onOpenChange={(open) => {
          setFormDrawerOpen(open);
          if (!open) {
            setSelectedUser(null);
          }
        }}
        user={selectedUser}
        mode={drawerMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>사용자 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 <strong>{userToDelete?.email}</strong> 사용자를 삭제하시겠습니까?
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (userToDelete) {
                  try {
                    await deleteUser.mutateAsync(userToDelete.id);
                    setDeleteDialogOpen(false);
                    setUserToDelete(null);
                    toast({
                      title: '사용자를 삭제했습니다.',
                      description: `${userToDelete.email} 계정이 삭제되었습니다.`,
                    });
                  } catch (error: unknown) {
                    const message = isAxiosError(error)
                      ? error.response?.data?.message ?? error.message
                      : error instanceof Error
                        ? error.message
                        : '삭제 중 오류가 발생했습니다.';
                    toast({
                      title: '사용자 삭제 실패',
                      description: Array.isArray(message) ? message.join(', ') : message,
                      variant: 'destructive',
                    });
                  }
                }
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

