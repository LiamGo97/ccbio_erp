'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import {
  TradeOrder,
  useTradeOrders,
  formatOrderSequence,
} from '@/lib/hooks/use-trade-orders';
import { PaymentPendingDetailDrawer } from '@/components/finance/payment-pending-detail-drawer';
import { useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { useCodesByCategory } from '@/lib/hooks/use-codes';

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

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  // 소수점 이하가 0이면 정수로 표시
  if (num % 1 === 0) {
    return num.toLocaleString('ko-KR');
  }
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// 결제 건별 행 타입
interface PaymentRow extends TradeOrder {
  payment: {
    id?: string;
    sequence: number;
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    krwAmount?: number | null;
    result?: string | null;
    notes?: string | null;
    paymentType?: string | null;
  };
}

function PaymentPendingPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedTradeOrderId, setSelectedTradeOrderId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [selectedProduct, setSelectedProduct] = React.useState<string>('__all__');
  const [selectedPaymentType, setSelectedPaymentType] = React.useState<string>('__all__');
  const [dueDateStartDate, setDueDateStartDate] = React.useState<Date | undefined>(undefined);
  const [dueDateEndDate, setDueDateEndDate] = React.useState<Date | undefined>(undefined);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  
  // 결제 타입 코드 마스터
  const { data: paymentTypeCodes } = useCodesByCategory('PAYMENT_TYPE');
  // 결제 조건 코드 마스터
  const { data: paymentTermsCodes } = useCodesByCategory('PAYMENT_TERMS');

  // 결제 조건 코드 이름 가져오기
  const getPaymentMethodName = (value: string | null | undefined) => {
    if (!value) return null;
    const code = paymentTermsCodes?.find((c) => c.value === value);
    return code?.name || value;
  };

  // 결제 타입 코드 이름 가져오기
  const getPaymentTypeName = (value: string | null | undefined) => {
    if (!value) return 'REGULAR';
    const code = paymentTypeCodes?.find((c) => c.value === value);
    return code?.name || value;
  };

  // 결제 타입 뱃지 스타일
  const getPaymentTypeBadgeStyle = (paymentType: string | null | undefined) => {
    const type = paymentType || 'REGULAR';
    if (type === 'REGULAR') {
      return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
    }
    if (type === 'DO_COST') {
      return 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300';
    }
    if (type === 'CUSTOMS_COST') {
      return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
    }
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  };

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 서류처리(DOCUMENTS), DO처리(DO), 통관처리(CUSTOMS) 상태의 주문 가져오기
  const { data: documentsOrders = [], isLoading: isLoadingDocuments } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DOCUMENTS',
    productName: selectedProduct !== '__all__' ? selectedProduct : undefined,
  });
  const { data: doOrders = [], isLoading: isLoadingDo } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DO',
    productName: selectedProduct !== '__all__' ? selectedProduct : undefined,
  });
  const { data: customsOrders = [], isLoading: isLoadingCustoms } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'CUSTOMS',
    productName: selectedProduct !== '__all__' ? selectedProduct : undefined,
  });

  // 모든 주문 합치기
  const tradeOrders = React.useMemo(() => {
    const allOrders = [...documentsOrders, ...doOrders, ...customsOrders];
    // 중복 제거 (같은 id를 가진 주문이 여러 번 포함될 수 있음)
    const uniqueOrders = new Map<string, TradeOrder>();
    allOrders.forEach((order) => {
      if (!uniqueOrders.has(order.id)) {
        uniqueOrders.set(order.id, order);
      }
    });
    return Array.from(uniqueOrders.values());
  }, [documentsOrders, doOrders, customsOrders]);

  const isLoading = isLoadingDocuments || isLoadingDo || isLoadingCustoms;
  const refetch = React.useCallback(() => {
    // 모든 trade-orders 쿼리 무효화하여 다시 가져오기
    queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
  }, [queryClient]);

  // 결제 정보가 있는 주문만 필터링하고, 결제 건별로 행 분리
  const paymentRows = React.useMemo(() => {
    // 1단계: 결제 정보가 있는 주문만 필터링
    let filtered = tradeOrders.filter((order) => {
      return order.payments && order.payments.length > 0;
    });

    // 제품 필터링
    if (selectedProduct !== '__all__') {
      filtered = filtered.filter((order) => order.productName === selectedProduct);
    }

    // 2단계: 결제 건별로 행 분리
    const rows: PaymentRow[] = [];
    filtered.forEach((order) => {
      if (!order.payments || order.payments.length === 0) return;

      order.payments.forEach((payment) => {
        // 결제 결과 필터링: 대기(PENDING)이거나 결과가 없는 것만 표시
        if (payment.result && payment.result !== 'PENDING') {
          return; // 완료된 결제는 제외
        }

        // 결제 타입 필터링
        if (selectedPaymentType !== '__all__') {
          const paymentType = payment.paymentType || 'REGULAR';
          if (paymentType !== selectedPaymentType) {
            return;
          }
        }

        // 결제 예정일 기간 필터링
        if (dueDateStartDate || dueDateEndDate) {
          if (!payment.dueDate) return;

          const dueDate = new Date(payment.dueDate);
          if (Number.isNaN(dueDate.getTime())) return;

          const dueDateOnly = new Date(dueDate);
          dueDateOnly.setHours(0, 0, 0, 0);

          if (dueDateStartDate) {
            const startDate = new Date(dueDateStartDate);
            startDate.setHours(0, 0, 0, 0);
            if (dueDateOnly < startDate) return;
          }

          if (dueDateEndDate) {
            const endDate = new Date(dueDateEndDate);
            endDate.setHours(23, 59, 59, 999);
            if (dueDateOnly > endDate) return;
          }
        }

        rows.push({
          ...order,
          payment,
        });
      });
    });

    return rows;
  }, [tradeOrders, selectedProduct, selectedPaymentType, dueDateStartDate, dueDateEndDate]);

  // 제품 목록 추출 (서류처리, DO처리, 통관처리 상태 모두 포함)
  const { data: allDocumentsOrders = [] } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DOCUMENTS',
  });
  const { data: allDoOrders = [] } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DO',
  });
  const { data: allCustomsOrders = [] } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'CUSTOMS',
  });

  const allTradeOrdersForProducts = React.useMemo(() => {
    const allOrders = [...allDocumentsOrders, ...allDoOrders, ...allCustomsOrders];
    // 중복 제거
    const uniqueOrders = new Map<string, TradeOrder>();
    allOrders.forEach((order) => {
      if (!uniqueOrders.has(order.id)) {
        uniqueOrders.set(order.id, order);
      }
    });
    return Array.from(uniqueOrders.values());
  }, [allDocumentsOrders, allDoOrders, allCustomsOrders]);

  const availableProducts = React.useMemo(() => {
    const productSet = new Set<string>();
    allTradeOrdersForProducts.forEach((order) => {
      if (order.productName) {
        productSet.add(order.productName);
      }
    });
    return Array.from(productSet).sort();
  }, [allTradeOrdersForProducts]);

  const columns: ColumnDef<PaymentRow>[] = React.useMemo(() => [
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
      cell: ({ row }) => <div className="text-sm font-mono">{formatOrderSequence(row.original.sequence, row.original.sequenceSub)}</div>,
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
      accessorKey: 'productName',
      header: '제품',
      cell: ({ row }) => <div className="text-sm">{row.original.productName || '-'}</div>,
      size: 150,
    },
    {
      accessorKey: 'paymentType',
      header: '결제 타입',
      cell: ({ row }) => {
        const paymentType = row.original.payment.paymentType || 'REGULAR';
        const paymentTypeName = getPaymentTypeName(paymentType);
        return (
          <Badge
            variant="outline"
            className={`text-xs ${getPaymentTypeBadgeStyle(paymentType)}`}
          >
            {paymentTypeName}
          </Badge>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'paymentDueDate',
      header: '결제 예정일',
      cell: ({ row }) => (
        <div className="text-sm">{formatDate(row.original.payment.dueDate)}</div>
      ),
      size: 130,
    },
    {
      accessorKey: 'paymentDetails',
      header: '결제 정보',
      cell: ({ row }) => {
        const payment = row.original.payment;
        const paymentType = payment.paymentType || 'REGULAR';
        const currency = row.original.invoiceCurrencyName || row.original.invoiceCurrency || row.original.currencyName || '';
        
        // DO_COST, CUSTOMS_COST는 결제 정보 표시 안함
        if (paymentType !== 'REGULAR') {
          return <div className="text-sm">-</div>;
        }
        
        // REGULAR 결제 정보를 한 줄로 표시
        const sequenceText = `${payment.sequence}차`;
        const amountText = payment.amount != null 
          ? `${currency ? `${currency} ` : ''}${formatNumber(payment.amount)}`
          : '-';
        const methodText = payment.method 
          ? (getPaymentMethodName(payment.method) || payment.method)
          : '-';
        const exchangeRateText = payment.exchangeRate != null
          ? Number(payment.exchangeRate).toLocaleString('ko-KR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 6,
            })
          : '-';
        
        return (
          <div className="text-sm">
            {sequenceText} / {amountText} / {methodText} / {exchangeRateText}
          </div>
        );
      },
      size: 280,
    },
    {
      accessorKey: 'paymentKrwAmount',
      header: '결제 금액 (원화)',
      cell: ({ row }) => {
        const krwAmount = row.original.payment.krwAmount;
        return (
          <div className="text-sm text-right font-medium">
            {krwAmount != null 
              ? `${formatNumber(krwAmount)}원`
              : '-'}
          </div>
        );
      },
      size: 150,
    },
    {
      accessorKey: 'exporterName',
      header: '수출사',
      cell: ({ row }) => <div className="text-sm">{row.original.exporterName || '-'}</div>,
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
      accessorKey: 'managerUser',
      header: '등록자',
      cell: ({ row }) => (
        <div className="text-sm">{row.original.managerUser?.name || '-'}</div>
      ),
      size: 120,
    },
  ], [paymentTypeCodes, paymentTermsCodes, getPaymentTypeName, getPaymentTypeBadgeStyle]);

  const handleRowClick = (row: PaymentRow) => {
    setSelectedTradeOrderId(row.id);
    setDetailDrawerOpen(true);
  };

  const paginatedRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return paymentRows.slice(start, end);
  }, [paymentRows, page, pageSize]);

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">결제 대기</h1>
            <p className="hidden text-muted-foreground md:block">
              서류 처리 완료되고 결제 정보가 입력된 주문을 조회합니다.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={paginatedRows}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={paymentRows.length}
          totalPages={Math.max(1, Math.ceil(paymentRows.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
          filterControls={
            <div className="flex flex-wrap items-center gap-2">
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
                    <SelectValue placeholder="전체" />
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
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">결제 타입</Label>
                <Select
                  value={selectedPaymentType}
                  onValueChange={(value) => {
                    setSelectedPaymentType(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40" size="sm">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {paymentTypeCodes?.map((code) => (
                      <SelectItem key={code.value || code.id} value={code.value || ''}>
                        {code.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  결제 예정일 기간
                </Label>
                <DateRangePicker
                  startDate={dueDateStartDate}
                  endDate={dueDateEndDate}
                  onChange={(startDate, endDate) => {
                    setDueDateStartDate(startDate);
                    setDueDateEndDate(endDate);
                    setPage(1);
                  }}
                  className="w-64"
                />
              </div>
            </div>
          }
        />

        {detailDrawerOpen && selectedTradeOrderId && (
          <PaymentPendingDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                setSelectedTradeOrderId(null);
              }
            }}
            bookingId={selectedTradeOrderId}
            onSuccess={async () => {
              // 데이터 갱신
              await refetch();
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function PaymentPendingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PaymentPendingPageContent />
    </Suspense>
  );
}


