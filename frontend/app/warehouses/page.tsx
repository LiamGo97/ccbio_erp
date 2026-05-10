'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2, XCircle } from 'lucide-react';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  Warehouse,
  useWarehouses,
  useDeleteWarehouse,
} from '@/lib/hooks/use-warehouses';
import { WarehouseFormDrawer } from '@/components/warehouses/warehouse-form-drawer';
import { WarehouseDetailDrawer } from '@/components/warehouses/warehouse-detail-drawer';
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
import type { AxiosError } from 'axios';
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

export default function WarehousesPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedWarehouse, setSelectedWarehouse] = React.useState<Warehouse | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [warehouseToDelete, setWarehouseToDelete] = React.useState<Warehouse | null>(null);
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

  const { data: warehouses = [], isLoading, refetch } = useWarehouses(params);
  const deleteMutation = useDeleteWarehouse();

  const handleCreate = () => {
    setSelectedWarehouse(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleRowClick = (warehouse: Warehouse) => {
    setSelectedWarehouseId(warehouse.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (warehouse: Warehouse) => {
    setSelectedWarehouse(warehouse);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleDelete = (warehouse: Warehouse) => {
    setWarehouseToDelete(warehouse);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!warehouseToDelete) return;
    try {
      await deleteMutation.mutateAsync(warehouseToDelete.id);
      toast({
        title: '창고 삭제 완료',
        description: `${warehouseToDelete.name} 창고 정보를 삭제했습니다.`,
      });
      setDeleteDialogOpen(false);
      setWarehouseToDelete(null);
      if (selectedWarehouseId === warehouseToDelete.id) {
        setDetailDrawerOpen(false);
        setSelectedWarehouseId(null);
      }
      await refetch();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const message =
        axiosError?.response?.data?.message ??
        (error as Error)?.message ??
        '창고 삭제 중 오류가 발생했습니다.';
      toast({
        title: '삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
  };

  const columns = React.useMemo<ColumnDef<Warehouse>[]>(() => {
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
        accessorKey: 'phone',
        header: '연락처',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{formatPhone(row.original.phone)}</div>
        ),
        size: 140,
      },
      {
        accessorKey: 'address',
        header: '주소',
        enableSorting: false,
        cell: ({ row }) => {
          const address = row.original.address;
          const addressDetail = row.original.addressDetail;
          if (!address && !addressDetail) return <div className="text-sm text-muted-foreground">-</div>;
          return (
            <div className="text-sm">
              {address && <div>{address}</div>}
              {addressDetail && <div className="text-xs text-muted-foreground">{addressDetail}</div>}
            </div>
          );
        },
        size: 250,
      },
      {
        accessorKey: 'latestIgobi',
        header: '이고비 (컨당)',
        enableSorting: false,
        cell: ({ row }) => {
          const latestIgobi = row.original.latestIgobi;
          if (!latestIgobi) {
            return <div className="text-sm text-muted-foreground">-</div>;
          }
          return (
            <div className="text-sm">
              <div className="font-semibold">
                {typeof latestIgobi.igobi === 'number' 
                  ? latestIgobi.igobi.toLocaleString('ko-KR')
                  : Number(latestIgobi.igobi || 0).toLocaleString('ko-KR')}
              </div>
              <div className="text-xs text-muted-foreground">
                기준일: {formatDate(latestIgobi.baseDate)}
              </div>
            </div>
          );
        },
        size: 150,
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
            <h1 className="text-2xl font-bold">창고 관리</h1>
            <p className="text-sm text-muted-foreground">등록된 창고 정보를 조회하고 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              창고 추가
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={warehouses}
          isLoading={isLoading}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={warehouses.length}
          totalPages={Math.max(1, Math.ceil(warehouses.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
        />

        <WarehouseFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedWarehouse(null);
            }
          }}
          warehouse={selectedWarehouse}
          mode={drawerMode}
          onCancel={
            drawerMode === 'edit' && selectedWarehouse
              ? () => {
                  setDrawerOpen(false);
                  setSelectedWarehouseId(selectedWarehouse.id);
                  setDetailDrawerOpen(true);
                }
              : undefined
          }
        />

        <WarehouseDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedWarehouseId(null);
            }
          }}
          warehouseId={selectedWarehouseId}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>창고를 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                삭제된 창고 정보는 복구할 수 없습니다. 계속 진행하시겠습니까?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <XCircle className="mr-2 h-4 w-4" />
                취소
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
