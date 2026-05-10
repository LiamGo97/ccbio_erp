'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Loader2 } from 'lucide-react';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  TradeOrder,
  useTradeOrders,
} from '@/lib/hooks/use-trade-orders';
import { TradeOrderFormDrawer } from '@/components/trade-order/trade-order-form-drawer';
import { TradeOrderDetailDrawer } from '@/components/trade-order/trade-order-detail-drawer';
import { useDeleteTradeOrder } from '@/lib/hooks/use-trade-orders';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
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

function TradeOrderPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedTradeOrder, setSelectedTradeOrder] = React.useState<TradeOrder | null>(null);
  const [selectedTradeOrderId, setSelectedTradeOrderId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [tradeOrderToDelete, setTradeOrderToDelete] = React.useState<TradeOrder | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [selectedProduct, setSelectedProduct] = React.useState<string>('__all__');
  const isMobile = useIsMobile();

  const deleteMutation = useDeleteTradeOrder();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const { data: tradeOrders = [], isLoading, refetch } = useTradeOrders({
    contractStatus: 'ORDER',
  });

  // 발주 목록에서 실제로 사용되는 제품 목록 추출
  const availableProducts = React.useMemo(() => {
    const productSet = new Set<string>();
    tradeOrders.forEach((order) => {
      if (order.productName) {
        productSet.add(order.productName);
      }
    });
    return Array.from(productSet).sort();
  }, [tradeOrders]);

  // 제품 필터만 적용 (계약 상태는 백엔드에서 이미 필터링됨)
  const filteredOrders = React.useMemo(() => {
    let filtered = tradeOrders;
    
    // 제품 필터 적용
    if (selectedProduct && selectedProduct !== '__all__') {
      filtered = filtered.filter((order) => order.productName === selectedProduct);
    }
    
    return filtered;
  }, [tradeOrders, selectedProduct]);

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString('ko-KR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const columns: ColumnDef<TradeOrder>[] = React.useMemo(() => [
    {
      accessorKey: 'orderDate',
      header: '발주일',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.orderDate)}</div>,
      size: 100,
    },
    {
      accessorKey: 'exportCountryName',
      header: '수출국',
      cell: ({ row }) => <div className="text-sm">{row.original.exportCountryName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'exporterName',
      header: '수출사',
      cell: ({ row }) => <div className="text-sm">{row.original.exporterName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'shippingLineName',
      header: '선사',
      cell: ({ row }) => <div className="text-sm">{row.original.shippingLineName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'productName',
      header: '상품',
      cell: ({ row }) => <div className="text-sm">{row.original.productName || '-'}</div>,
      size: 150,
    },
    {
      accessorKey: 'grade',
      header: '등급',
      cell: ({ row }) => <div className="text-sm">{row.original.grade || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'packingType',
      header: '패킹',
      cell: ({ row }) => <div className="text-sm">{row.original.packingType || row.original.packingCode || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'unitPrice',
      header: '단가',
      cell: ({ row }) => (
        <div className="text-sm text-right">
          {row.original.unitPrice != null ? formatNumber(row.original.unitPrice) : '-'}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: 'currencyName',
      header: '통화단위',
      cell: ({ row }) => <div className="text-sm">{row.original.currencyName || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'commissionDollar',
      header: '커미션 $',
      cell: ({ row }) => <div className="text-sm">{row.original.commissionDollar || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'quota',
      header: '쿼터',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.quota === 'Y' ? '예' : row.original.quota === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'fumigation',
      header: '훈증',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.fumigation === 'Y' ? '예' : row.original.fumigation === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'customsDuty',
      header: '관세',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.customsDuty === 'Y' ? '예' : row.original.customsDuty === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'destinationName',
      header: '도착항',
      cell: ({ row }) => <div className="text-sm">{row.original.destinationName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'managerUser',
      header: '등록자',
      cell: ({ row }) => <div className="text-sm">{row.original.managerUser?.name || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'createdAt',
      header: '등록일',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
      size: 100,
    },
  ], []);

  const handleRowClick = (order: TradeOrder) => {
    setSelectedTradeOrderId(order.id);
    setDetailDrawerOpen(true);
  };

  const handleCreate = () => {
    setSelectedTradeOrder(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleEdit = (order: TradeOrder) => {
    setSelectedTradeOrder(order);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleCancelEdit = () => {
    setDrawerOpen(false);
    // 상세보기 다시 열기
    if (selectedTradeOrder?.id) {
      setSelectedTradeOrderId(selectedTradeOrder.id);
      setDetailDrawerOpen(true);
    }
    setSelectedTradeOrder(null);
  };

  const handleDelete = (order: TradeOrder) => {
    setTradeOrderToDelete(order);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!tradeOrderToDelete) return;
    
    try {
      await deleteMutation.mutateAsync(tradeOrderToDelete.id);
      toastSuccess('삭제 완료', '발주가 삭제되었습니다.');
      setDeleteDialogOpen(false);
      setTradeOrderToDelete(null);
      setDetailDrawerOpen(false);
      await refetch();
    } catch (error: unknown) {
      toastApiError(error as Parameters<typeof toastApiError>[0], '삭제 실패');
    }
  };

  const handleFormSubmit = async () => {
    setDrawerOpen(false);
    
    // 수정 모드인 경우 상세보기 다시 열기
    if (drawerMode === 'edit' && selectedTradeOrder?.id) {
      setSelectedTradeOrderId(selectedTradeOrder.id);
      setDetailDrawerOpen(true);
    }
    
    setSelectedTradeOrder(null);
    await refetch();
  };

  const paginatedOrders = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, page, pageSize]);

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">발주</h1>
            <p className="hidden text-muted-foreground md:block">
              발주 정보를 조회하고 관리합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {!isMobile && '발주 등록'}
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={paginatedOrders}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={filteredOrders.length}
          totalPages={Math.max(1, Math.ceil(filteredOrders.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
          filterControls={
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
              <Select
                value={selectedProduct}
                onValueChange={(value) => {
                  setSelectedProduct(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40" size="sm">
                  <SelectValue placeholder="상품 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {availableProducts.map((product) => (
                    <SelectItem key={product} value={product}>
                      {product}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        <TradeOrderFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              // 상단 X 버튼으로 닫힌 경우 (onCancel이 호출되지 않음)
              // 편집 모드에서도 상세보기를 열지 않고 그냥 닫기만 함
              setSelectedTradeOrder(null);
            }
          }}
          mode={drawerMode}
          tradeOrder={selectedTradeOrder}
          onSubmit={handleFormSubmit}
          onCancel={handleCancelEdit}
        />

        <TradeOrderDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedTradeOrderId(null);
            }
          }}
          tradeOrderId={selectedTradeOrderId}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="발주 삭제"
          description={
            <>
              이 발주를 삭제하시겠습니까?
              <br />
              <span className="font-medium text-destructive">삭제된 데이터는 복구할 수 없습니다.</span>
            </>
          }
          onConfirm={confirmDelete}
          isDeleting={deleteMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}

export default function TradeOrderPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <TradeOrderPageContent />
    </Suspense>
  );
}

