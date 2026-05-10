'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import {
  UnloadingCompany,
  useUnloadingCompanies,
} from '@/lib/hooks/use-unloading-companies';
import { UnloadingCompanyFormDrawer } from '@/components/unloading-companies/unloading-company-form-drawer';
import { UnloadingCompanyDetailDrawer } from '@/components/unloading-companies/unloading-company-detail-drawer';
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

export default function UnloadingCompaniesPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedUnloadingCompany, setSelectedUnloadingCompany] = React.useState<UnloadingCompany | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedUnloadingCompanyId, setSelectedUnloadingCompanyId] = React.useState<number | null>(null);
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

  const { data: unloadingCompanies = [], isLoading, refetch } = useUnloadingCompanies(params);

  const handleCreate = () => {
    setSelectedUnloadingCompany(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleRowClick = (unloadingCompany: UnloadingCompany) => {
    setSelectedUnloadingCompanyId(unloadingCompany.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (unloadingCompany: UnloadingCompany) => {
    setSelectedUnloadingCompany(unloadingCompany);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const columns = React.useMemo<ColumnDef<UnloadingCompany>[]>(() => {
    return [
      {
        accessorKey: 'representativeName',
        header: '대표자명',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm font-semibold">{row.original.representativeName}</div>
        ),
        size: 200,
      },
      {
        accessorKey: 'contact',
        header: '연락처',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.contact}</div>
        ),
        size: 150,
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
          placeholder="대표자명, 연락처"
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
            <h1 className="text-2xl font-bold">하차 업체 관리</h1>
            <p className="text-sm text-muted-foreground">등록된 하차 업체 정보를 조회하고 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              하차 업체 추가
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={unloadingCompanies}
          isLoading={isLoading}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={unloadingCompanies.length}
          totalPages={Math.max(1, Math.ceil(unloadingCompanies.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
        />

        <UnloadingCompanyFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedUnloadingCompany(null);
            }
          }}
          unloadingCompany={selectedUnloadingCompany}
          mode={drawerMode}
          onCancel={
            drawerMode === 'edit' && selectedUnloadingCompany
              ? () => {
                  setDrawerOpen(false);
                  setSelectedUnloadingCompanyId(selectedUnloadingCompany.id);
                  setDetailDrawerOpen(true);
                }
              : undefined
          }
        />

        <UnloadingCompanyDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedUnloadingCompanyId(null);
            }
          }}
          unloadingCompanyId={selectedUnloadingCompanyId}
          onEdit={handleEdit}
        />
      </div>
    </AppLayout>
  );
}

