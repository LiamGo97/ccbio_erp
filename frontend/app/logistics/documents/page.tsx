'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Loader2, FileText } from 'lucide-react';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import {
  TradeOrder,
  useTradeOrders,
} from '@/lib/hooks/use-trade-orders';
import { BookingDetailDrawer } from '@/components/booking/booking-detail-drawer';
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

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

function DocumentsPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedTradeOrderId, setSelectedTradeOrderId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [selectedProduct, setSelectedProduct] = React.useState<string>('__all__');
  const isMobile = useIsMobile();

  const { data: contractStatusCodes = [] } = useCodeMastersByGroup('TRADE_CONTRACT_STATUS');
  const { data: orderStatusCodes = [] } = useCodeMastersByGroup('TRADE_ORDER_STATUS');

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // DOCUMENTS 상태인 부킹 목록만 가져오기
  const { data: tradeOrders = [], isLoading, refetch } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DOCUMENTS',
    productName: selectedProduct !== '__all__' ? selectedProduct : undefined,
  });

  const filteredOrders = tradeOrders;

  // 제품 목록 추출
  const { data: allTradeOrdersForProducts = [] } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DOCUMENTS',
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

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString('ko-KR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

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
      accessorKey: 'invoiceNumber',
      header: '송장번호',
      cell: ({ row }) => <div className="text-sm">{row.original.invoiceNumber || '-'}</div>,
      size: 140,
    },
    {
      accessorKey: 'invoiceDate',
      header: '송장 날짜',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.invoiceDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'invoiceAmount',
      header: '송장 금액',
      cell: ({ row }) => {
        const amount = row.original.invoiceAmount;
        const currency = row.original.invoiceCurrency;
        if (amount == null) return <div className="text-sm">-</div>;
        return (
          <div className="text-sm">
            {formatNumber(amount)} {currency || ''}
          </div>
        );
      },
      size: 150,
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
      accessorKey: 'productName',
      header: '제품',
      cell: ({ row }) => <div className="text-sm">{row.original.productName || '-'}</div>,
      size: 150,
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
  ], []);

  const handleRowClick = (order: TradeOrder) => {
    setSelectedTradeOrderId(order.id);
    setDetailDrawerOpen(true);
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
            <h1 className="text-2xl font-bold tracking-tight">서류 처리</h1>
            <p className="hidden text-muted-foreground md:block">
              서류 처리 완료된 부킹 목록을 조회합니다.
            </p>
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
            availableProducts.length > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-foreground whitespace-nowrap">
                    제품:
                  </label>
                  <select
                    value={selectedProduct}
                    onChange={(e) => {
                      setSelectedProduct(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="__all__">전체</option>
                    {availableProducts.map((product) => (
                      <option key={product} value={product}>
                        {product}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )
          }
        />

        {/* 상세 정보 Drawer */}
        {selectedTradeOrderId && (
          <BookingDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                setSelectedTradeOrderId(null);
              }
            }}
            bookingId={selectedTradeOrderId}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DocumentsPageContent />
    </Suspense>
  );
}
