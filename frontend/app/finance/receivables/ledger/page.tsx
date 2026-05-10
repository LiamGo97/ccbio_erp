'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useCustomersWithReceivables, CustomerWithReceivable } from '@/lib/hooks/use-receivables';
import { CustomerLedgerDrawer } from '@/components/finance/customer-ledger-drawer';
import { Loader2 } from 'lucide-react';
import Cookies from 'js-cookie';
import { useColumnSettings } from '@/hooks/use-column-settings';

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) return parsed;
  }
  return 20;
};

function CustomerLedgerListPageContent() {
  const columnSettings = useColumnSettings('finance-receivables-ledger');
  const searchParams = useSearchParams();
  const [user, setUser] = React.useState<User | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [search, setSearch] = React.useState('');
  const [ledgerDrawerOpen, setLedgerDrawerOpen] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // URL 쿼리 파라미터에서 customerId를 읽어서 drawer 자동으로 열기
  React.useEffect(() => {
    const customerIdParam = searchParams.get('customerId');
    if (customerIdParam) {
      setSelectedCustomerId(customerIdParam);
      setLedgerDrawerOpen(true);
      // URL에서 쿼리 파라미터 제거 (브라우저 히스토리 정리)
      const url = new URL(window.location.href);
      url.searchParams.delete('customerId');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  const { data, isLoading } = useCustomersWithReceivables({
    search: search.trim() || undefined,
    page,
    limit: pageSize,
  });

  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.lastPage ?? 1;

  const columns: ColumnDef<CustomerWithReceivable>[] = React.useMemo(
    () => [
      {
        accessorKey: 'companyName',
        header: '회사명',
        cell: ({ row }) => row.original.companyName || row.original.ceo || '-',
        size: 200,
      },
      {
        accessorKey: 'ceo',
        header: '대표자',
        cell: ({ row }) => row.original.ceo || '-',
        size: 150,
      },
      {
        accessorKey: 'phone',
        header: '전화번호',
        cell: ({ row }) => {
          const phone = row.original.phone;
          if (!phone) return '-';
          const digits = phone.replace(/[^0-9]/g, '');
          if (digits.startsWith('02')) {
            return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
          } else if (digits.length > 10) {
            return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
          } else if (digits.length > 7) {
            return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
          }
          return phone;
        },
        size: 150,
      },
      {
        accessorKey: 'balance',
        header: '현재 잔액',
        cell: ({ row }) => {
          const balance = row.original.balance;
          const isPositive = balance > 0; // 양수는 미수금 (나쁜 것)
          const isNegative = balance < 0; // 음수는 선수금/과납 (좋은 것)
          return (
            <span
              className={
                isPositive
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : isNegative
                    ? 'text-green-600 dark:text-green-400'
                    : ''
              }
            >
              {balance.toLocaleString('ko-KR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
          );
        },
        size: 150,
      },
    ],
    [],
  );

  const handleRowClick = (customer: CustomerWithReceivable) => {
    setSelectedCustomerId(customer.customerId);
    setLedgerDrawerOpen(true);
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">거래처관리대장</h1>
          <p className="text-muted-foreground">
            채권이 있는 고객의 거래처관리대장을 조회할 수 있습니다.
          </p>
        </div>

        <DataTable
          columns={columns}
          data={customers}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          manualPagination
          page={data?.page ?? 1}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(v) => {
            setPageSize(v);
            setPage(1);
          }}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          showRowNumber
          rowClassName="h-10"
          filterControls={
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  고객 검색
                </Label>
                <Input
                  type="text"
                  placeholder="회사명 또는 대표자명으로 검색..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-40 h-8 text-sm"
                />
              </div>
            </div>
          }
        />

        <CustomerLedgerDrawer
          open={ledgerDrawerOpen}
          onOpenChange={(open) => {
            setLedgerDrawerOpen(open);
            if (!open) {
              setSelectedCustomerId(null);
            }
          }}
          customerId={selectedCustomerId}
        />
      </div>
    </AppLayout>
  );
}

export default function CustomerLedgerListPage() {
  return (
    <Suspense
      fallback={
        <AppLayout user={null}>
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </AppLayout>
      }
    >
      <CustomerLedgerListPageContent />
    </Suspense>
  );
}
