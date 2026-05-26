'use client';

import * as React from 'react';
import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useCodes, useDeleteCode, Code } from '@/lib/hooks/use-codes';
import { CodeFormDrawer } from '@/components/codes/code-form-drawer';
import { toast } from '@/components/ui/use-toast';

// 카테고리 정의
const CATEGORIES = [
  { code: 'SHIPPING_LINE', label: '선사' },
  { code: 'EXPORT_COUNTRY', label: '수출국' },
  { code: 'PACKING_TYPE', label: '포장 유형' },
  { code: 'CURRENCY', label: '통화' },
  { code: 'PAYMENT_TERMS', label: '결제조건' },
  { code: 'PAYMENT_RESULT', label: '결제 처리 결과' },
  { code: 'FINANCE_STATUS', label: '재무 상태' },
  { code: 'DESTINATION_PORT', label: '도착항' },
  { code: 'PRODUCT_CATEGORY', label: '제품 카테고리' },
  { code: 'PRODUCT', label: '제품' },
  { code: 'EXPORTER', label: 'Exporter' },
  { code: 'SALES_GRADE', label: '등급(세일즈)' },
  { code: 'TRADE_GRADE', label: '등급(무역)' },
  { code: 'CUSTOMER_GRADE', label: '회원등급' },
  { code: 'CUSTOMER_TYPE', label: '고객 구분' },
  { code: 'MEMBER_TYPE', label: '회원 구분' },
  { code: 'WAREHOUSE', label: '창고' },
  { code: 'VEHICLE_DISPATCH_STATUS', label: '배차 상태' },
  { code: 'VEHICLE_DISPATCH_TYPE', label: '배차 타입' },
] as const;

export default function CodesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0].code);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<Code | null>(null);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<Code | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('order');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data, isLoading, error } = useCodes({
    group: activeCategory,
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
  });

  const deleteCodeMutation = useDeleteCode();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 카테고리 변경 시 페이지를 1로 리셋
  React.useEffect(() => {
    setPage(1);
  }, [activeCategory]);

  const handleAdd = () => {
    setSelectedCode(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleEdit = (code: Code) => {
    setSelectedCode(code);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const handleDelete = (code: Code) => {
    setCodeToDelete(code);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!codeToDelete) {
      return;
    }
    try {
      await deleteCodeMutation.mutateAsync(codeToDelete.id);
      toast({
        title: '코드를 삭제했습니다.',
        description: `${codeToDelete.name} (${codeToDelete.value ?? '-'}) 항목이 삭제되었습니다.`,
      });
      setDeleteDialogOpen(false);
      setCodeToDelete(null);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        apiError?.response?.data?.message ??
        apiError?.message ??
        '코드를 삭제하는 중 오류가 발생했습니다.';
      const normalizedMessage = Array.isArray(message)
        ? message.join(', ')
        : String(message);
      toast({
        title: '코드 삭제 실패',
        description: normalizedMessage,
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<Code>[] = [
    {
      accessorKey: 'name',
      header: '이름',
    },
    {
      accessorKey: 'value',
      header: '값',
      cell: ({ row }) => row.original.value || '-',
    },
    {
      accessorKey: 'aliases',
      header: '별칭',
      cell: ({ row }) => row.original.aliases || '-',
    },
    {
      accessorKey: 'order',
      header: '정렬 순서',
    },
  ];

  const filterControls = (
    <div className="flex flex-wrap gap-3 md:gap-4">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label
          htmlFor="code-group-select"
          className="whitespace-nowrap text-sm font-medium text-muted-foreground"
        >
          코드 그룹
        </Label>
        <Select
          value={activeCategory}
          onValueChange={(value) => {
            setActiveCategory(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="code-group-select" size="sm" className="w-48 md:w-60">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectGroup>
              {CATEGORIES.map((category) => (
                <SelectItem key={category.code} value={category.code}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const handleRowClick = (code: Code) => {
    handleEdit(code);
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">코드 관리</h1>
            <p className="text-sm text-muted-foreground">
              코드 그룹별로 공통 값을 관리합니다.
            </p>
          </div>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            추가
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">
              데이터를 불러오는 중 오류가 발생했습니다:{' '}
              {error instanceof Error ? error.message : '알 수 없는 오류'}
            </p>
          </div>
        )}

        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          filterControls={filterControls}
          page={page}
          pageSize={pageSize}
          total={data?.total || 0}
          totalPages={data?.totalPages || 0}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          manualPagination
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(newSortBy, newSortOrder) => {
            setSortBy(newSortBy);
            setSortOrder(newSortOrder);
          }}
          onRowClick={handleRowClick}
          rowClassName="h-10"
        />

        <CodeFormDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          code={selectedCode}
          mode={drawerMode}
          categoryCode={activeCategory}
          onDelete={(code) => handleDelete(code)}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>코드 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                정말로 이 코드를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
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
                disabled={deleteCodeMutation.isPending}
              >
                {deleteCodeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </AppLayout>
  );
}

