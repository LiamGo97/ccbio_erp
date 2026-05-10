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
  CreateFreeTimeDto,
  FreeTime,
  useCreateFreeTime,
  useDeleteFreeTime,
  useFreeTimes,
  useUpdateFreeTime,
} from '@/lib/hooks/use-free-time';
import { FreeTimeFormDrawer } from '@/components/free-time/free-time-form-drawer';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { toast } from '@/components/ui/use-toast';

export default function FreeTimePage() {
  const [user, setUser] = useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [selectedFreeTime, setSelectedFreeTime] = useState<FreeTime | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [freeTimeToDelete, setFreeTimeToDelete] = useState<FreeTime | null>(null);
  const [exporterFilter, setExporterFilter] = useState<string>('ALL');
  const [shippingLineFilter, setShippingLineFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const exporterCodeParam = exporterFilter === 'ALL' ? undefined : exporterFilter;
  const shippingLineCodeParam = shippingLineFilter === 'ALL' ? undefined : shippingLineFilter;
  const typeParam = typeFilter === 'ALL' ? undefined : typeFilter;

  const { data: freeTimes = [], isLoading, refetch } = useFreeTimes({
    exporterCode: exporterCodeParam,
    shippingLineCode: shippingLineCodeParam,
    type: typeParam,
  });
  const { data: exporterCodes } = useCodesByCategory('EXPORTER');
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');
  const createMutation = useCreateFreeTime();
  const updateMutation = useUpdateFreeTime();
  const deleteMutation = useDeleteFreeTime();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const handleCreate = () => {
    setSelectedFreeTime(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleEdit = (freeTime: FreeTime) => {
    setSelectedFreeTime(freeTime);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const handleDelete = (freeTime: FreeTime) => {
    setFreeTimeToDelete(freeTime);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!freeTimeToDelete) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(freeTimeToDelete.id);
      setDeleteDialogOpen(false);
      setFreeTimeToDelete(null);
      await refetch();
      toast({
        title: 'Free Time 삭제 완료',
        description: `${freeTimeToDelete.exporterName ?? ''} ${freeTimeToDelete.type ?? ''} 정보를 삭제했습니다.`,
      });
      setSelectedFreeTime(null);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        apiError?.response?.data?.message ?? apiError?.message ?? '삭제 중 오류가 발생했습니다.';
      toast({
        title: 'Free Time 삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : String(message),
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<FreeTime>[] = useMemo(
    () => [
      {
        accessorKey: 'exporterName',
        header: '수출사',
        cell: ({ row }) => (
          <div className="text-sm font-medium text-foreground">{row.original.exporterName}</div>
        ),
        size: 160,
      },
      {
        accessorKey: 'shippingLineName',
        header: '선사',
        cell: ({ row }) => (
          <div className="text-sm font-medium text-foreground">{row.original.shippingLineName}</div>
        ),
        size: 160,
      },
      {
        accessorKey: 'type',
        header: '유형',
        cell: ({ row }) => <div className="text-sm font-medium text-foreground">{row.original.type}</div>,
        size: 100,
      },
      {
        accessorKey: 'baseDate',
        header: '기준일',
        cell: ({ row }) => <div className="text-xs">{row.original.baseDate}</div>,
        size: 120,
      },
      {
        accessorKey: 'value',
        header: 'FT 값',
        cell: ({ row }) => <div className="text-xs">{row.original.value || '-'}</div>,
        size: 120,
      },
    ],
    [],
  );
  const handleRowClick = (freeTime: FreeTime) => {
    handleEdit(freeTime);
  };


  const exporterOptions = useMemo(() => {
    if (!exporterCodes) {
      return [];
    }
    return exporterCodes
      .map((code) => ({
        value: code.value ?? code.name ?? '',
        label: code.name ?? code.value ?? '',
      }))
      .filter((option) => option.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [exporterCodes]);

  const shippingLineOptions = useMemo(() => {
    if (!shippingLineCodes) {
      return [];
    }
    return shippingLineCodes
      .map((code) => ({
        value: code.value ?? code.name ?? '',
        label: code.name ?? code.value ?? '',
      }))
      .filter((option) => option.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [shippingLineCodes]);

  const filterControls = (
    <div className="flex flex-wrap gap-3 md:gap-4">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label
          htmlFor="filter-exporter"
          className="whitespace-nowrap text-sm font-medium text-muted-foreground"
        >
          수출사
        </Label>
        <Select
          value={exporterFilter}
          onValueChange={(value) => {
            setExporterFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="filter-exporter" size="sm" className="w-48 md:w-56">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            {exporterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label} ({option.value})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label
          htmlFor="filter-shipping-line"
          className="whitespace-nowrap text-sm font-medium text-muted-foreground"
        >
          선사
        </Label>
        <Select
          value={shippingLineFilter}
          onValueChange={(value) => {
            setShippingLineFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="filter-shipping-line" size="sm" className="w-48 md:w-56">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            {shippingLineOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label} ({option.value})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label
          htmlFor="filter-type"
          className="whitespace-nowrap text-sm font-medium text-muted-foreground"
        >
          유형
        </Label>
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="filter-type" size="sm" className="w-32 md:w-36">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            <SelectItem value="DM">DM</SelectItem>
            <SelectItem value="DT">DT</SelectItem>
            <SelectItem value="CB">CB</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const total = freeTimes.length;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  const paginatedFreeTimes = useMemo(() => {
    const start = (page - 1) * pageSize;
    return freeTimes.slice(start, start + pageSize);
  }, [freeTimes, page, pageSize]);

  React.useEffect(() => {
    setPage(1);
  }, [exporterFilter, shippingLineFilter, typeFilter]);

  React.useEffect(() => {
    const maxPage = totalPages;
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [page, totalPages]);

  const handleFormSubmit = async (data: CreateFreeTimeDto) => {
    try {
      if (drawerMode === 'create') {
        await createMutation.mutateAsync(data);
        toast({
          title: 'FT가 추가되었습니다.',
          description: `${data.exporterCode}/${data.shippingLineCode} ${data.type} 정보를 등록했습니다.`,
        });
      } else if (selectedFreeTime) {
        await updateMutation.mutateAsync({ id: selectedFreeTime.id, data });
        toast({
          title: 'FT가 수정되었습니다.',
          description: `${data.exporterCode}/${data.shippingLineCode} ${data.type} 정보를 업데이트했습니다.`,
        });
      }
      await refetch();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        apiError?.response?.data?.message ??
        apiError?.message ??
        'FT 정보를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: 'FT 저장 실패',
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
            <h1 className="text-2xl font-bold">FT 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              수출사 및 선사 조합별 FT (Free Time) 기준을 설정합니다.
            </p>
          </div>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            FT 추가
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={paginatedFreeTimes}
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

        <FreeTimeFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        mode={drawerMode}
        freeTime={selectedFreeTime}
        onSubmit={handleFormSubmit}
          onDelete={(freeTime) => handleDelete(freeTime)}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>FT 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 FT 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
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


