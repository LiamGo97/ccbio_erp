'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, FileText } from 'lucide-react';
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
import { useDeleteTradeOrder } from '@/lib/hooks/use-trade-orders';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { BookingFormDrawer } from '@/components/booking/booking-form-drawer';
import { BookingDetailDrawer } from '@/components/logistics/booking-detail-drawer';
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

function BookingPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [bookingFormDrawerOpen, setBookingFormDrawerOpen] = React.useState(false);
  const [bookingEditId, setBookingEditId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [drawerMode] = React.useState<'create' | 'edit'>('edit');
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

  // 부킹 목록만 가져오기 (서버에서 필터링)
  // BOOKING 상태인 주문만 가져오기
  // 제품 필터도 서버에서 처리
  const { data: tradeOrders = [], isLoading, refetch } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'BOOKING',
    productName: selectedProduct !== '__all__' ? selectedProduct : undefined,
  });

  // 서버에서 이미 필터링되어 반환되므로 추가 필터링 불필요
  const filteredOrders = tradeOrders;

  // 부킹 목록에서 실제로 사용되는 제품 목록 추출 (필터 전 전체 목록에서 추출)
  // 제품 목록은 별도로 전체 목록을 한 번 가져와서 추출하거나, 
  // 제품 필터 없이 한 번 가져와서 추출해야 함
  const { data: allTradeOrdersForProducts = [] } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'BOOKING',
  });

  const availableProducts = React.useMemo(() => {
    const productSet = new Set<string>();
    allTradeOrdersForProducts.forEach((order) => {
      if (order.productName) {
        productSet.add(order.productName);
      }
    });
    return Array.from(productSet).sort();
  }, [allTradeOrdersForProducts]);

  const columns: ColumnDef<TradeOrder>[] = React.useMemo(() => [
    {
      accessorKey: 'contractNo',
      header: '계약번호',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-sm">{row.original.contractNo || '-'}</span>
          {row.original.contractGoogleDriveFileId && (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      ),
      size: 140,
    },
    {
      accessorKey: 'sequence',
      header: '순번',
      cell: ({ row }) => <div className="text-sm font-mono">{row.original.sequence || '-'}</div>,
      size: 80,
    },
    {
      accessorKey: 'bk',
      header: 'BK',
      cell: ({ row }) => <div className="text-sm">{row.original.bk || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'bl',
      header: 'BL',
      cell: ({ row }) => <div className="text-sm">{row.original.bl || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'etdDate',
      header: 'ETD',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.etdDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'etaDate',
      header: 'ETA',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.etaDate)}</div>,
      size: 120,
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
      header: '제품',
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
      accessorKey: 'containerCount',
      header: '컨테이너 수',
      cell: ({ row }) => {
        const containerCount = row.original.containers?.length ?? 0;
        return <div className="text-sm text-center">{containerCount > 0 ? containerCount : '-'}</div>;
      },
      size: 100,
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
      cell: ({ row }) => (
        <div className="text-sm">{row.original.managerUser?.name || '-'}</div>
      ),
      size: 120,
    },
    {
      accessorKey: 'createdAt',
      header: '등록일',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
      size: 120,
    },
  ], []);

  const handleRowClick = (order: TradeOrder) => {
    setSelectedTradeOrderId(order.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (order: TradeOrder) => {
    setBookingEditId(order.id);
    setBookingFormDrawerOpen(true);
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
      toastSuccess('삭제 완료', '부킹 항목이 삭제되었습니다.');
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
            <h1 className="text-2xl font-bold tracking-tight">부킹</h1>
            <p className="hidden text-muted-foreground md:block">
              부킹 가능한 주문(BL) 정보를 조회하고 관리합니다.
            </p>
          </div>
          <Button size="sm" onClick={() => setBookingFormDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {!isMobile && '부킹 등록'}
          </Button>
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
              <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">제품</Label>
              <Select
                value={selectedProduct}
                onValueChange={(value) => {
                  setSelectedProduct(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40" size="sm">
                  <SelectValue placeholder="제품 선택" />
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
              setSelectedTradeOrder(null);
            }
          }}
          mode={drawerMode}
          tradeOrder={selectedTradeOrder}
          onSubmit={handleFormSubmit}
          onCancel={handleCancelEdit}
        />

        <BookingDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedTradeOrderId(null);
            }
          }}
          bookingId={selectedTradeOrderId}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="부킹 삭제"
          description={
            <>
              이 부킹 항목을 삭제하시겠습니까?
              <br />
              <span className="font-medium text-destructive">삭제된 데이터는 복구할 수 없습니다.</span>
            </>
          }
          onConfirm={confirmDelete}
          isDeleting={deleteMutation.isPending}
        />

                <BookingFormDrawer
                  open={bookingFormDrawerOpen}
                  onOpenChange={(open) => {
                    setBookingFormDrawerOpen(open);
                    if (!open) {
                      // 폼이 닫힐 때 상태 초기화
                      setBookingEditId(null);
                      setDetailDrawerOpen(false);
                      setSelectedTradeOrderId(null);
                    }
                  }}
                  bookingId={bookingEditId}
                  mode={bookingEditId ? 'edit' : 'create'}
                  onSubmit={async (orderId) => {
                    await refetch();
                    // 등록 모드일 때는 drawer만 닫고 목록만 표시
                    // 수정 모드일 때만 상세정보 열기
                    if (bookingEditId && orderId) {
                      // 수정 모드: 상세정보 열기
                      setSelectedTradeOrderId(orderId);
                      setDetailDrawerOpen(true);
                    }
                    // 등록 모드: drawer만 닫기
                    setBookingFormDrawerOpen(false);
                    setBookingEditId(null);
                  }}
                />
      </div>
    </AppLayout>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BookingPageContent />
    </Suspense>
  );
}



