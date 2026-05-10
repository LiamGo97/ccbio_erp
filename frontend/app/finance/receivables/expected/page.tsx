'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/schedules/date-picker';
import { useCustomersWithBalanceByCutoff, CustomerWithReceivable } from '@/lib/hooks/use-receivables';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { CustomerLedgerDrawer } from '@/components/finance/customer-ledger-drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Cookies from 'js-cookie';
import { useColumnSettings } from '@/hooks/use-column-settings';

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!Number.isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) return parsed;
  }
  return 20;
};

function formatPaymentTerms(type: string | undefined, value: number | null | undefined): string {
  if (!type) return '';
  const typeLabels: Record<string, string> = {
    DAYS: '일수',
    THIS_MONTH_DAY: '이번달 N일',
    NEXT_MONTH_DAY: '다음달 N일',
    THIS_MONTH_END: '이번달 마지막일',
    NEXT_MONTH_END: '다음달 마지막일',
  };
  const label = typeLabels[type] || type;
  if (type === 'THIS_MONTH_END' || type === 'NEXT_MONTH_END') return label;
  if (value != null) return `${label} (${value})`;
  return label;
}

function ExpectedPaymentPageContent() {
  const columnSettings = useColumnSettings('finance-receivables-expected');
  const [user, setUser] = React.useState<User | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [sortBy, setSortBy] = React.useState<string>('companyName');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');

  // 날짜 단일 선택 (기본: 오늘)
  const [selectedDate, setSelectedDate] = React.useState<string | undefined>(() =>
    format(new Date(), 'yyyy-MM-dd')
  );
  const [search, setSearch] = React.useState('');
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<string>('');
  const [selectedCustomerType, setSelectedCustomerType] = React.useState<string>('__all__');

  const [ledgerDrawerOpen, setLedgerDrawerOpen] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
  const [selectedReceivableId, setSelectedReceivableId] = React.useState<string | null>(null);

  const { data: suppliers } = useSuppliers({ status: true });
  const { data: customerTypeCodes } = useCodesByCategory('CUSTOMER_TYPE');
  const customerTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (customerTypeCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [customerTypeCodes]);

  const supplierIdsArray = React.useMemo(() => {
    if (!selectedSupplierId || selectedSupplierId === '') return undefined;
    if (selectedSupplierId === '0') return [0];
    const n = parseInt(selectedSupplierId, 10);
    return !Number.isNaN(n) && n > 0 ? [n] : undefined;
  }, [selectedSupplierId]);

  const queryParams = React.useMemo(
    () =>
      selectedDate
        ? {
            cutoffDate: selectedDate,
            page,
            limit: pageSize,
            sortBy,
            sortOrder,
            search: search.trim() || undefined,
            excludeZeroBalance: true,
            customerType: selectedCustomerType !== '__all__' ? selectedCustomerType : undefined,
            supplierIds: supplierIdsArray,
          }
        : null,
    [selectedDate, page, pageSize, sortBy, sortOrder, search, selectedCustomerType, supplierIdsArray]
  );

  const { data, isLoading } = useCustomersWithBalanceByCutoff(queryParams);
  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.lastPage ?? 1;
  const totalBalance = data?.totalBalance ?? 0;

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const handleSortChange = (newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
  };

  const columns: ColumnDef<CustomerWithReceivable>[] = React.useMemo(
    () => [
      { accessorKey: 'customerType', header: '구분', enableSorting: false, cell: ({ row }) => customerTypeMap.get(row.original.customerType ?? '') ?? row.original.customerType ?? '-', size: 90 },
      { accessorKey: 'companyName', header: '회사명', enableSorting: true, cell: ({ row }) => row.original.companyName || row.original.ceo || '-', size: 200 },
      { accessorKey: 'ceo', header: '대표자', enableSorting: true, cell: ({ row }) => row.original.ceo || '-', size: 150 },
      { accessorKey: 'supplierCompanyName', header: '공급자', enableSorting: false, cell: ({ row }) => row.original.supplierCompanyName || '-', size: 140 },
      {
        accessorKey: 'phone',
        header: '전화번호',
        enableSorting: true,
        cell: ({ row }) => {
          const phone = row.original.phone;
          if (!phone) return '-';
          const digits = phone.replace(/[^0-9]/g, '');
          if (digits.startsWith('02')) return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
          if (digits.length > 10) return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
          if (digits.length > 7) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
          return phone;
        },
        size: 150,
      },
      {
        accessorKey: 'occurredDate',
        header: '명세서 발행일',
        enableSorting: true,
        cell: ({ row }) => {
          const date = row.original.occurredDate;
          if (!date) return '-';
          try {
            return format(new Date(date), 'yyyy.MM.dd', { locale: ko });
          } catch {
            return String(date);
          }
        },
        size: 120,
      },
      {
        accessorKey: 'paymentTerms',
        header: '결제조건',
        enableSorting: false,
        cell: ({ row }) => formatPaymentTerms(row.original.paymentTermsType, row.original.paymentTermsValue),
        size: 150,
      },
      {
        accessorKey: 'lastPaymentDueDate',
        header: '결제조건일',
        enableSorting: false,
        cell: ({ row }) => {
          const date = row.original.lastPaymentDueDate;
          if (!date) return '-';
          try {
            return format(new Date(date), 'yyyy.MM.dd', { locale: ko });
          } catch {
            return String(date);
          }
        },
        size: 120,
      },
      {
        accessorKey: 'daysElapsed',
        header: '경과일',
        enableSorting: false,
        cell: ({ row }) => {
          const dDay = row.original.dDay;
          if (dDay === null) return '-';
          if (dDay < 0) return <span className="text-blue-600 dark:text-blue-400 font-medium">D{Math.abs(dDay)}</span>;
          return <span className="text-red-600 dark:text-red-400 font-medium">+{dDay}일</span>;
        },
        size: 100,
      },
      {
        accessorKey: 'balance',
        header: '현재 잔액',
        enableSorting: true,
        cell: ({ row }) => {
          const balance = row.original.balance;
          const isPositive = balance > 0;
          const isNegative = balance < 0;
          return (
            <span className={isPositive ? 'text-red-600 dark:text-red-400 font-medium' : isNegative ? 'text-green-600 dark:text-green-400' : ''}>
              {balance.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          );
        },
        size: 150,
      },
    ],
    [customerTypeMap]
  );

  const handleRowClick = (customer: CustomerWithReceivable) => {
    setSelectedCustomerId(customer.customerId);
    setSelectedReceivableId(customer.receivableId);
    setLedgerDrawerOpen(true);
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">입금예상액</h1>
          <p className="text-muted-foreground">선택한 기준일까지의 입금 예상액을 결제조건일 기준으로 조회합니다.</p>
        </div>

        <DataTable
          headerRightContent={
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">선택 필터 총금액</div>
              <div className="text-sm font-semibold">
                {totalBalance >= 0 ? (
                  <span className="text-red-600 dark:text-red-400">
                    {totalBalance.toLocaleString('ko-KR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                ) : (
                  <span className="text-green-600 dark:text-green-400">
                    {totalBalance.toLocaleString('ko-KR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                )}
                <span className="text-xs font-normal text-muted-foreground ml-1">원</span>
              </div>
            </div>
          }
          filterControls={
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">날짜</Label>
                <DatePicker
                  value={selectedDate}
                  onChange={(value) => {
                    setSelectedDate(value);
                    setPage(1);
                  }}
                  placeholder="날짜 선택"
                  className="w-[160px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">고객 검색</Label>
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
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">구분</Label>
                <Select
                  value={selectedCustomerType}
                  onValueChange={(v) => {
                    setSelectedCustomerType(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {(customerTypeCodes ?? []).map((code) => {
                      const key = (code.value ?? code.name ?? '').trim();
                      if (!key) return null;
                      return (
                        <SelectItem key={key} value={key}>
                          {code.name ?? code.value ?? key}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">공급자</Label>
                <Select
                  value={selectedSupplierId || 'all'}
                  onValueChange={(v) => {
                    setSelectedSupplierId(v === 'all' ? '' : v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="0">공급자 없음</SelectItem>
                    {suppliers?.map((supplier) => (
                      <SelectItem key={supplier.id} value={String(supplier.id)}>
                        {supplier.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          }
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
          onSortChange={handleSortChange}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onRowClick={handleRowClick}
          bodyCellClassName="py-2.5"
        />

        <CustomerLedgerDrawer
          open={ledgerDrawerOpen}
          onOpenChange={(open) => {
            setLedgerDrawerOpen(open);
            if (!open) {
              setSelectedCustomerId(null);
              setSelectedReceivableId(null);
            }
          }}
          customerId={selectedCustomerId}
          receivableId={selectedReceivableId}
        />
      </div>
    </AppLayout>
  );
}

export default function ExpectedPaymentPage() {
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
      <ExpectedPaymentPageContent />
    </Suspense>
  );
}
