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
import { Badge } from '@/components/ui/badge';
import {
  Supplier,
  useSuppliers,
} from '@/lib/hooks/use-suppliers';
import { SupplierFormDrawer } from '@/components/suppliers/supplier-form-drawer';
import { SupplierDetailDrawer } from '@/components/suppliers/supplier-detail-drawer';
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

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return phone;
};

export default function SuppliersPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedSupplier, setSelectedSupplier] = React.useState<Supplier | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<boolean | undefined>(undefined);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const params = React.useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter,
    }),
    [search, statusFilter],
  );

  const { data: suppliers = [], isLoading, refetch } = useSuppliers(params);

  const handleCreate = () => {
    setSelectedSupplier(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleRowClick = (supplier: Supplier) => {
    setSelectedSupplierId(supplier.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const columns = React.useMemo<ColumnDef<Supplier>[]>(() => {
    return [
      {
        accessorKey: 'companyName',
        header: '회사명',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm font-semibold">{row.original.companyName}</div>
        ),
        size: 200,
      },
      {
        accessorKey: 'representativeName',
        header: '대표자',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.representativeName}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'businessRegistrationNumber',
        header: '사업자등록번호',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm font-mono">{row.original.businessRegistrationNumber}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'tel',
        header: '전화번호',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{formatPhone(row.original.tel)}</div>
        ),
        size: 130,
      },
      {
        accessorKey: 'address',
        header: '주소',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground max-w-xs truncate">
            {row.original.address}
          </div>
        ),
        size: 250,
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
          placeholder="회사명, 대표자명, 사업자등록번호"
          className="w-48 md:w-60"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label htmlFor="status" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          상태
        </Label>
        <select
          id="status"
          value={statusFilter === undefined ? 'all' : statusFilter ? 'active' : 'inactive'}
          className="flex h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(e) => {
            const value = e.target.value;
            setStatusFilter(value === 'all' ? undefined : value === 'active');
            setPage(1);
          }}
        >
          <option value="all">전체</option>
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">공급자 관리</h1>
            <p className="text-sm text-muted-foreground">등록된 공급자 정보를 조회하고 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              공급자 추가
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={suppliers.length}
          totalPages={Math.max(1, Math.ceil(suppliers.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
        />

        <SupplierFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedSupplier(null);
            }
          }}
          supplier={selectedSupplier}
          mode={drawerMode}
          onCancel={
            drawerMode === 'edit' && selectedSupplier
              ? () => {
                  setDrawerOpen(false);
                  setSelectedSupplierId(selectedSupplier.id);
                  setDetailDrawerOpen(true);
                }
              : undefined
          }
        />

        <SupplierDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedSupplierId(null);
            }
          }}
          supplierId={selectedSupplierId}
          onEdit={handleEdit}
        />
      </div>
    </AppLayout>
  );
}
