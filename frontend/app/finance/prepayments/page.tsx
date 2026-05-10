'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PrepaymentListItem,
  usePrepayments,
  GetPrepaymentsParams,
} from '@/lib/hooks/use-prepayments';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { PrepaymentDetailDrawer } from '@/components/finance/prepayment-detail-drawer';
import Cookies from 'js-cookie';

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) return parsed;
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
  if (num % 1 === 0) return num.toLocaleString('ko-KR');
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function PrepaymentsPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [statusFilter, setStatusFilter] = React.useState<string>('__all__');
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedPrepaymentId, setSelectedPrepaymentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const params: GetPrepaymentsParams = React.useMemo(
    () => ({
      page,
      limit: pageSize,
      status: statusFilter !== '__all__' ? statusFilter : undefined,
    }),
    [page, pageSize, statusFilter],
  );

  const { data, isLoading } = usePrepayments(params);
  const { data: paymentStatusCodes } = useCodesByCategory('PREPAYMENT_PAYMENT_STATUS');
  const { data: deductionStatusCodes } = useCodesByCategory('PREPAYMENT_DEDUCTION_STATUS');

  const getStatusBadge = (paymentStatus?: string | null, deductionStatus?: string | null) => {
    const paymentCode = paymentStatusCodes?.find((c) => c.value === paymentStatus);
    const deductionCode = deductionStatusCodes?.find((c) => c.value === deductionStatus);
    
    const paymentStatusName = paymentCode?.name ?? paymentStatus ?? '-';
    const deductionStatusName = deductionCode?.name ?? deductionStatus ?? '-';
    
    const normalizedPaymentStatus = paymentStatus?.trim().toUpperCase() ?? '';
    const normalizedDeductionStatus = deductionStatus?.trim().toUpperCase() ?? '';

    // 차감 상태가 DEDUCTED면 차감 상태를 우선 표시
    if (normalizedDeductionStatus === 'DEDUCTED') {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300">
            {deductionStatusName}
          </Badge>
          <span className="text-xs text-muted-foreground">
            ({paymentStatusName})
          </span>
        </div>
      );
    }

    // 입금 상태별 뱃지 스타일
    if (normalizedPaymentStatus === 'REQUESTED') {
      return (
        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300">
          {paymentStatusName}
        </Badge>
      );
    }
    if (normalizedPaymentStatus === 'CONFIRMED') {
      return (
        <Badge variant="outline" className="border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300">
          {paymentStatusName}
        </Badge>
      );
    }
    if (normalizedPaymentStatus === 'AVAILABLE') {
      return (
        <Badge variant="outline" className="border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300">
          {paymentStatusName}
        </Badge>
      );
    }
    if (normalizedPaymentStatus === 'REFUNDED') {
      return (
        <Badge variant="outline" className="border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300">
          {paymentStatusName}
        </Badge>
      );
    }
    if (normalizedPaymentStatus === 'CANCELLED') {
      return (
        <Badge variant="outline" className="border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300">
          {paymentStatusName}
        </Badge>
      );
    }

    // 기본 스타일
    return (
      <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
        {paymentStatusName}
      </Badge>
    );
  };

  const columns: ColumnDef<PrepaymentListItem>[] = React.useMemo(
    () => [
      {
        accessorKey: 'requestedDate',
        header: '청구일',
        cell: ({ row }) => formatDate(row.original.requestedDate),
      },
      {
        accessorKey: 'customerName',
        header: '고객명',
        cell: ({ row }) => row.original.customerName ?? '-',
      },
      {
        accessorKey: 'prepaymentAmount',
        header: '청구 금액',
        cell: ({ row }) => formatNumber(row.original.prepaymentAmount),
      },
      {
        accessorKey: 'actualAmount',
        header: '실제 입금액',
        cell: ({ row }) => formatNumber(row.original.actualAmount),
      },
      {
        accessorKey: 'differenceAmount',
        header: '차액',
        cell: ({ row }) => {
          const diff = row.original.differenceAmount;
          if (diff === null || diff === undefined) return '-';
          const formatted = formatNumber(diff);
          if (diff > 0) {
            return <span className="text-green-600 dark:text-green-400">+{formatted}</span>;
          } else if (diff < 0) {
            return <span className="text-red-600 dark:text-red-400">{formatted}</span>;
          }
          return formatted;
        },
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ row }) => (
          <div className="flex items-center h-full">
            {getStatusBadge(row.original.paymentStatus, row.original.deductionStatus)}
          </div>
        ),
      },
      {
        accessorKey: 'confirmedDate',
        header: '입금확인일',
        cell: ({ row }) => formatDate(row.original.confirmedDate),
      },
    ],
    [paymentStatusCodes, deductionStatusCodes],
  );

  const filterControls = (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Label className="text-muted-foreground text-sm">상태</Label>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {(paymentStatusCodes ?? [])
              .filter((c) => c.value != null)
              .map((c) => (
                <SelectItem key={c.value!} value={c.value!}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">선입금 관리</h1>
          <p className="text-muted-foreground text-sm">
            판매 예약 시 생성된 선입금을 조회하고 입금 확인을 관리합니다.
          </p>
        </div>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          filterControls={filterControls}
          manualPagination
          page={data?.page ?? 1}
          total={data?.total ?? 0}
          totalPages={data?.lastPage ?? 1}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(v) => {
            setPageSize(v);
            setPage(1);
          }}
          isLoading={isLoading}
          showRowNumber
          rowClassName="h-10"
          onRowClick={(row) => {
            setSelectedPrepaymentId(row.id);
            setDetailDrawerOpen(true);
          }}
        />

        {detailDrawerOpen && selectedPrepaymentId && (
          <PrepaymentDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                setSelectedPrepaymentId(null);
              }
            }}
            prepaymentId={selectedPrepaymentId}
            onSuccess={async () => {
              // 데이터 갱신은 queryClient를 통해 자동으로 처리됨
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function PrepaymentsPage() {
  return (
    <Suspense
      fallback={
        <AppLayout user={null}>
          <div className="flex items-center justify-center p-12">
            <div className="text-muted-foreground">로딩 중…</div>
          </div>
        </AppLayout>
      }
    >
      <PrepaymentsPageContent />
    </Suspense>
  );
}
