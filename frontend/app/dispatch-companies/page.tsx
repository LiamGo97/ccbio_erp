'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, XCircle } from 'lucide-react';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  DispatchCompany,
  useDispatchCompanies,
} from '@/lib/hooks/use-dispatch-companies';
import { DispatchCompanyFormDrawer } from '@/components/dispatch-companies/dispatch-company-form-drawer';
import { DispatchCompanyDetailDrawer } from '@/components/dispatch-companies/dispatch-company-detail-drawer';
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

export default function DispatchCompaniesPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedDispatchCompany, setSelectedDispatchCompany] = React.useState<DispatchCompany | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedDispatchCompanyId, setSelectedDispatchCompanyId] = React.useState<number | null>(null);
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

  const { data: dispatchCompanies = [], isLoading, refetch } = useDispatchCompanies(params);

  const handleCreate = () => {
    setSelectedDispatchCompany(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleRowClick = (dispatchCompany: DispatchCompany) => {
    setSelectedDispatchCompanyId(dispatchCompany.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (dispatchCompany: DispatchCompany) => {
    setSelectedDispatchCompany(dispatchCompany);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const columns = React.useMemo<ColumnDef<DispatchCompany>[]>(() => {
    return [
      {
        accessorKey: 'name',
        header: '업체명',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm font-semibold">{row.original.name}</div>
        ),
        size: 200,
      },
      {
        accessorKey: 'status',
        header: '상태',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status ? 'default' : 'secondary'}>
            {row.original.status ? '활성' : '비활성'}
          </Badge>
        ),
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
          placeholder="업체명"
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
            <h1 className="text-2xl font-bold">배차 업체 관리</h1>
            <p className="text-sm text-muted-foreground">등록된 배차 업체 정보를 조회하고 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              배차 업체 추가
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={dispatchCompanies}
          isLoading={isLoading}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={dispatchCompanies.length}
          totalPages={Math.max(1, Math.ceil(dispatchCompanies.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
        />

        <DispatchCompanyFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedDispatchCompany(null);
            }
          }}
          dispatchCompany={selectedDispatchCompany}
          mode={drawerMode}
          onCancel={
            drawerMode === 'edit' && selectedDispatchCompany
              ? () => {
                  setDrawerOpen(false);
                  setSelectedDispatchCompanyId(selectedDispatchCompany.id);
                  setDetailDrawerOpen(true);
                }
              : undefined
          }
        />

        <DispatchCompanyDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedDispatchCompanyId(null);
            }
          }}
          dispatchCompanyId={selectedDispatchCompanyId}
          onEdit={handleEdit}
        />
      </div>
    </AppLayout>
  );
}

