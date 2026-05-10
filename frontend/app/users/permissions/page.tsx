'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { useRoles, useDeleteRole, GetRolesParams } from '@/lib/hooks/use-roles';
import { Role } from '@/lib/hooks/use-roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { MoreHorizontal, Edit, Trash2, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { RoleFormDrawer } from '@/components/roles/role-form-drawer';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { toast } from '@/components/ui/use-toast';

export default function PermissionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const deleteRole = useDeleteRole();
  
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
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
  const queryParams: GetRolesParams = React.useMemo(() => ({
    page,
    limit: pageSize,
    search: debouncedSearch || undefined,
    status: activeFilter,
    sortBy,
    sortOrder,
  }), [page, pageSize, debouncedSearch, activeFilter, sortBy, sortOrder]);

  const { data: rolesResponse, isLoading, error } = useRoles(queryParams);
  const roles = Array.isArray(rolesResponse) ? rolesResponse : rolesResponse?.data || [];
  const total = Array.isArray(rolesResponse) ? roles.length : rolesResponse?.total || 0;
  const totalPages = Array.isArray(rolesResponse) ? 1 : rolesResponse?.totalPages || 0;

  // 필터 탭 데이터
  const filterTabs = React.useMemo(() => {
    return [
      { label: '전체', value: 'all', count: total },
      { label: '활성', value: 'active' },
      { label: '비활성', value: 'inactive' },
    ];
  }, [total]);

  const columns: ColumnDef<Role>[] = [
    {
      accessorKey: 'code',
      header: '역할 코드',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="font-medium font-mono">{row.getValue('code')}</div>;
      },
    },
    {
      accessorKey: 'name',
      header: '역할 이름',
      enableSorting: true,
      cell: ({ row }) => {
        return <div>{row.getValue('name')}</div>;
      },
    },
    {
      accessorKey: 'description',
      header: '설명',
      enableSorting: false,
      cell: ({ row }) => {
        return <div className="text-muted-foreground">{row.getValue('description') || '-'}</div>;
      },
    },
    {
      accessorKey: 'isActive',
      header: '상태',
      enableSorting: true,
      cell: ({ row }) => {
      const role = row.original as Role;
      const isActive = role.isActive !== false;
        return (
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? '활성' : '비활성'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: '생성일',
      enableSorting: true,
      cell: ({ row }) => {
      const role = row.original as Role;
      const date = role.createdAt;
        if (!date) return '-';
        try {
          return format(new Date(date), 'yyyy-MM-dd HH:mm', { locale: ko });
        } catch {
          return '-';
        }
      },
    },
    {
      id: 'actions',
      header: '작업',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const role = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <span className="sr-only">메뉴 열기</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setSelectedRole(role);
                  setDrawerMode('edit');
                  setDrawerOpen(true);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                수정
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  setRoleToDelete(role);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        );
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
            <h1 className="text-2xl font-bold tracking-tight">권한 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              시스템 역할(ROLE) 목록을 확인하고 관리할 수 있습니다.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSelectedRole(null);
              setDrawerMode('create');
              setDrawerOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            역할 추가
          </Button>
        </div>

        {/* 테이블 카드 */}
        <DataTable
          columns={columns}
          data={roles}
          searchKey="code"
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="역할 코드 또는 이름으로 검색..."
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
        />
      </div>

      <RoleFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        role={selectedRole}
        mode={drawerMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>역할 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 <strong>{roleToDelete?.name}</strong> 역할을 삭제하시겠습니까?
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (roleToDelete) {
                  try {
                    await deleteRole.mutateAsync(roleToDelete.id);
                    setDeleteDialogOpen(false);
                    setRoleToDelete(null);
                    toast({
                      title: '역할이 삭제되었습니다.',
                      description: `${roleToDelete.name ?? '역할'}을 삭제했습니다.`,
                    });
                  } catch (error: any) {
                    const message = error.response?.data?.message || error.message || '삭제 중 오류가 발생했습니다.';
                    toast({
                      title: '역할 삭제 실패',
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

