'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Trash2, XCircle } from 'lucide-react';
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
import {
  CreateWarehouseIgobiDto,
  WarehouseIgobi,
  useCreateWarehouseIgobi,
  useDeleteWarehouseIgobi,
  useWarehouseIgobis,
  useUpdateWarehouseIgobi,
} from '@/lib/hooks/use-warehouse-igobi';
import { WarehouseIgobiFormDrawer } from '@/components/warehouse-igobi/warehouse-igobi-form-drawer';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { toast } from '@/components/ui/use-toast';

export default function WarehouseIgobiPage() {
  const [user, setUser] = useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [selectedWarehouseIgobi, setSelectedWarehouseIgobi] = useState<WarehouseIgobi | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [warehouseIgobiToDelete, setWarehouseIgobiToDelete] = useState<WarehouseIgobi | null>(null);
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const warehouseIdParam = warehouseFilter === 'ALL' ? undefined : parseInt(warehouseFilter, 10);
  
  const { data: warehouseIgobis = [], isLoading, refetch } = useWarehouseIgobis({
    warehouseId: warehouseIdParam,
  });
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const createMutation = useCreateWarehouseIgobi();
  const updateMutation = useUpdateWarehouseIgobi();
  const deleteMutation = useDeleteWarehouseIgobi();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const handleCreate = () => {
    setSelectedWarehouseIgobi(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleEdit = (warehouseIgobi: WarehouseIgobi) => {
    setSelectedWarehouseIgobi(warehouseIgobi);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const handleDelete = (warehouseIgobi: WarehouseIgobi) => {
    setWarehouseIgobiToDelete(warehouseIgobi);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!warehouseIgobiToDelete) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(warehouseIgobiToDelete.id);
      setDeleteDialogOpen(false);
      const deletedName = warehouseIgobiToDelete.warehouseName || `창고 ID: ${warehouseIgobiToDelete.warehouseId}`;
      setWarehouseIgobiToDelete(null);
      await refetch();
      toast({
        title: '창고 이고비 삭제 완료',
        description: `${deletedName} 정보를 삭제했습니다.`,
      });
      setSelectedWarehouseIgobi(null);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        apiError?.response?.data?.message ?? apiError?.message ?? '삭제 중 오류가 발생했습니다.';
      toast({
        title: '창고 이고비 삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : String(message),
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<WarehouseIgobi>[] = useMemo(
    () => [
      {
        accessorKey: 'warehouseName',
        header: '창고',
        cell: ({ row }) => {
          const warehouseName = row.original.warehouseName || `창고 ID: ${row.original.warehouseId}`;
          return (
            <div className="text-sm font-medium text-foreground">{warehouseName}</div>
          );
        },
        size: 200,
      },
      {
        accessorKey: 'baseDate',
        header: '기준일',
        cell: ({ row }) => <div className="text-sm">{row.original.baseDate}</div>,
        size: 120,
      },
      {
        accessorKey: 'igobi',
        header: '이고비 (컨당)',
        cell: ({ row }) => (
          <div className="text-sm font-medium text-foreground">
            {typeof row.original.igobi === 'number' 
              ? row.original.igobi.toLocaleString('ko-KR')
              : Number(row.original.igobi || 0).toLocaleString('ko-KR')}
          </div>
        ),
        size: 150,
      },
    ],
    [],
  );
  const handleRowClick = (warehouseIgobi: WarehouseIgobi) => {
    handleEdit(warehouseIgobi);
  };

  const warehouseOptions = useMemo(() => {
    return warehouses
      .map((warehouse) => ({
        value: warehouse.id.toString(),
        label: warehouse.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [warehouses]);

  const filterControls = (
    <div className="flex flex-wrap gap-3 md:gap-4">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label
          htmlFor="filter-warehouse"
          className="whitespace-nowrap text-sm font-medium text-muted-foreground"
        >
          창고
        </Label>
        <Select
          value={warehouseFilter}
          onValueChange={(value) => {
            setWarehouseFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="filter-warehouse" size="sm" className="w-48 md:w-56">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            {warehouseOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const total = warehouseIgobis.length;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  const paginatedWarehouseIgobis = useMemo(() => {
    const start = (page - 1) * pageSize;
    return warehouseIgobis.slice(start, start + pageSize);
  }, [warehouseIgobis, page, pageSize]);

  React.useEffect(() => {
    setPage(1);
  }, [warehouseFilter]);

  React.useEffect(() => {
    const maxPage = totalPages;
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [page, totalPages]);

  const handleFormSubmit = async (data: CreateWarehouseIgobiDto) => {
    try {
      const warehouse = warehouses.find(w => w.id === data.warehouseId);
      const warehouseName = warehouse?.name || `창고 ID: ${data.warehouseId}`;
      if (drawerMode === 'create') {
        await createMutation.mutateAsync(data);
        toast({
          title: '창고 이고비가 추가되었습니다.',
          description: `${warehouseName} 정보를 등록했습니다.`,
        });
      } else if (selectedWarehouseIgobi) {
        await updateMutation.mutateAsync({ id: selectedWarehouseIgobi.id, data });
        toast({
          title: '창고 이고비가 수정되었습니다.',
          description: `${warehouseName} 정보를 업데이트했습니다.`,
        });
      }
      await refetch();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        apiError?.response?.data?.message ??
        apiError?.message ??
        '창고 이고비 정보를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: '창고 이고비 저장 실패',
        description: Array.isArray(message) ? message.join(', ') : String(message),
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">창고 이고비 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              창고별 이고비를 기준일별로 설정합니다.
            </p>
          </div>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            추가
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={paginatedWarehouseIgobis}
          filterControls={filterControls}
          isLoading={isLoading}
          manualPagination={true}
          enableSorting={false}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          onRowClick={handleRowClick}
          rowClassName="h-10"
        />
      </div>

      <WarehouseIgobiFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        mode={drawerMode}
        warehouseIgobi={selectedWarehouseIgobi}
        onSubmit={handleFormSubmit}
        onDelete={(warehouseIgobi) => handleDelete(warehouseIgobi)}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>창고 이고비 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 창고 이고비 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <XCircle className="mr-2 h-4 w-4" />
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

