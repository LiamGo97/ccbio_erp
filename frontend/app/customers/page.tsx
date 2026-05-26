'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import {
  Plus,
  Trash2,
  XCircle,
  FileSpreadsheet,
  Loader2,
  Download,
} from 'lucide-react';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { CustomersDataTable } from '@/components/customers/customers-data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  Customer,
  useCustomers,
  useDeleteCustomer,
} from '@/lib/hooks/use-customers';
import { formatCustomerListDefaultAddress } from '@/lib/customer-default-address-kind';
import { formatSalesManagerDisplay } from '@/lib/format-sales-manager';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { CustomerFormDrawer } from '@/components/customers/customer-form-drawer';
import { CustomerDetailDrawer } from '@/components/customers/customer-detail-drawer';
import { CustomerEventSmsExcelDialog } from '@/components/customers/customer-event-sms-excel-dialog';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import type { AxiosError } from 'axios';
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

const formatPhone = (phone?: string | null) => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits;
};

const LIVESTOCK_TYPE_LABELS: Record<string, string> = {
  HANWOO: '한우',
  NAKWOO: '낙우',
  YUKWOO: '육우',
  ETC: '기타',
};

const OPERATION_METHOD_LABELS: Record<string, string> = {
  BREEDING: '번식',
  FATTENING: '비육',
  RAISING: '육성',
  BATCH: '일괄',
  MILKING: '착유',
};

const FEEDING_METHOD_LABELS: Record<string, string> = {
  SELF_MIX: '자가배합(배합기)',
  DIRECT: '직접급여',
  TMF: 'TMF',
};

const formatLivestockCount = (count?: number | null) => {
  if (count === undefined || count === null || Number.isNaN(Number(count))) return '-';
  return `${new Intl.NumberFormat('ko-KR').format(count)}두`;
};

/** ISO 문자열이 타임존 없이 오면 UTC로 간주 (운송관리·물류관리와 동일) */
const parseAsUtcIfNeeded = (value: string): string => {
  const s = String(value).trim();
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (isIsoLike && !hasTimezone) {
    return s.replace(/\.\d{3}$/, '') + 'Z';
  }
  return s;
};

/** 등록일시/수정일시 — 날짜+시간, 한국시간 (sales/transport-management/transport 참조) */
const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(parseAsUtcIfNeeded(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CustomersPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [customerToDelete, setCustomerToDelete] = React.useState<Customer | null>(null);
  const [sheetDialogOpen, setSheetDialogOpen] = React.useState(false);
  const [eventSmsExcelOpen, setEventSmsExcelOpen] = React.useState(false);
  const [spreadsheetId, setSpreadsheetId] = React.useState('');
  const [sheetGid, setSheetGid] = React.useState('');
  const [isExporting, setIsExporting] = React.useState(false);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [search, setSearch] = React.useState('');
  const [selectedChamcham, setSelectedChamcham] = React.useState('__all__');
  const [selectedCustomerType, setSelectedCustomerType] = React.useState('__all__');
  const [selectedCustomerGrade, setSelectedCustomerGrade] = React.useState('__all__');
  const [sortBy, setSortBy] = React.useState<
    'createdAt' | 'updatedAt' | 'companyName' | 'customerType' | 'consultationCount'
  >('createdAt');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const { data: chamchamCodes } = useCodesByCategory('CHAMCHAM_STATUS');
  const { data: chamcharmMemberCodes } = useCodesByCategory('CHAMCHARM_MEMBER_STATUS');
  const { data: customerTypeCodes } = useCodesByCategory('CUSTOMER_TYPE');
  const { data: customerGradeCodes } = useCodesByCategory('CUSTOMER_GRADE');

  const chamchamMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (chamchamCodes ?? []).forEach((code) => {
      const key = (code.value ?? code.name ?? '').trim();
      const label = (code.name ?? code.value ?? '').trim();
      if (key) {
        map.set(key, label || key);
      }
    });
    return map;
  }, [chamchamCodes]);

  const chamcharmMemberMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (chamcharmMemberCodes ?? []).forEach((code) => {
      const key = (code.value ?? code.name ?? '').trim();
      const label = (code.name ?? code.value ?? '').trim();
      if (key) {
        map.set(key, label || key);
      }
    });
    return map;
  }, [chamcharmMemberCodes]);

  const customerTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (customerTypeCodes ?? []).forEach((code) => {
      const key = (code.value ?? code.name ?? '').trim();
      const label = (code.name ?? code.value ?? '').trim();
      if (key) {
        map.set(key, label || key);
      }
    });
    return map;
  }, [customerTypeCodes]);

  const customerGradeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (customerGradeCodes ?? []).forEach((code) => {
      const label = (code.name ?? code.value ?? '').trim();
      const value = (code.value ?? '').trim();
      const name = (code.name ?? '').trim();
      if (value) map.set(value, label || value);
      if (name) map.set(name, label || name);
    });
    return map;
  }, [customerGradeCodes]);

  const params = React.useMemo(
    () => ({
      search: search.trim() || undefined,
      chamchamStatus: selectedChamcham !== '__all__' ? selectedChamcham : undefined,
      customerType: selectedCustomerType !== '__all__' ? selectedCustomerType : undefined,
      customerGrade: selectedCustomerGrade !== '__all__' ? selectedCustomerGrade : undefined,
      page,
      limit: pageSize,
      sortBy,
      sortOrder,
    }),
    [search, selectedChamcham, selectedCustomerType, selectedCustomerGrade, page, pageSize, sortBy, sortOrder],
  );

  const { data, isLoading, refetch } = useCustomers(params);
  const deleteMutation = useDeleteCustomer();

  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(total / pageSize));

  const handleCreate = () => {
    setSelectedCustomer(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleRowClick = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleDelete = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      await deleteMutation.mutateAsync(customerToDelete.id);
      toast({
        title: '고객 삭제 완료',
        description: `${customerToDelete.companyName || customerToDelete.ceo || ''} 고객 정보를 삭제했습니다.`,
      });
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      if (selectedCustomerId === customerToDelete.id) {
        setDetailDrawerOpen(false);
        setSelectedCustomerId(null);
      }
      await refetch();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const message =
        axiosError?.response?.data?.message ??
        (error as Error)?.message ??
        '고객 삭제 중 오류가 발생했습니다.';
      toast({
        title: '삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        className: 'border border-red-300 text-red-600',
      });
    }
  };

  const handleExportToSheet = async () => {
    if (!spreadsheetId.trim()) {
      toast({
        title: '시트 ID 필요',
        description: '구글 시트 ID를 입력해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    setIsExporting(true);
    try {
      const response = await api.post('/google-drive/sheets/customers', {
        spreadsheetId: spreadsheetId.trim(),
        sheetGid: sheetGid.trim() || undefined,
      });

      toast({
        title: '시트 반영 완료',
        description: response.data.message || '고객 데이터가 구글 시트에 반영되었습니다.',
      });
      setSheetDialogOpen(false);
      setSpreadsheetId('');
      setSheetGid('');
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const message =
        axiosError?.response?.data?.message ??
        (error as Error)?.message ??
        '시트 반영 중 오류가 발생했습니다.';
      toast({
        title: '시트 반영 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        className: 'border border-red-300 text-red-600',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await api.get('/customers/export/excel', {
        params,
        responseType: 'blob',
      });

      // 파일 다운로드
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `고객_관리_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: '다운로드 완료',
        description: '엑셀 파일이 다운로드되었습니다.',
      });
    } catch (err) {
      console.error('엑셀 다운로드 오류:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast({
        title: '다운로드 실패',
        description: error.response?.data?.message || '엑셀 파일 다운로드에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const columns = React.useMemo<ColumnDef<Customer>[]>(() => {
    const labelOr = (map: Map<string, string>, value?: string | null) => {
      const key = (value ?? '').trim();
      if (!key) return '';
      return map.get(key) ?? key;
    };

    return [
      {
        accessorKey: 'customerType',
        header: '구분',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">
            {labelOr(customerTypeMap, row.original.customerType) || '-'}
          </div>
        ),
        size: 90,
      },
      {
        accessorKey: 'companyName',
        header: '업체명',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-semibold">{row.original.companyName || '-'}</div>
            <div className="text-xs text-muted-foreground">{row.original.ceo || '-'}</div>
          </div>
        ),
        size: 200,
      },
      {
        accessorKey: 'phone',
        header: '전화번호',
        enableSorting: false,
        cell: ({ row }) => <div className="text-sm">{formatPhone(row.original.phone)}</div>,
        size: 140,
      },
      {
        id: 'address',
        header: '주소',
        enableSorting: false,
        cell: ({ row }) => {
          const text = formatCustomerListDefaultAddress(row.original);
          return (
            <div
              className="text-sm max-w-[min(280px,32vw)] truncate"
              title={text || undefined}
            >
              {text || '-'}
            </div>
          );
        },
        size: 260,
      },
      {
        accessorKey: 'livestockTypes',
        header: '축종',
        enableSorting: false,
        cell: ({ row }) => {
          const raw = row.original.livestockTypes?.trim();
          if (!raw) {
            return <div className="text-sm">-</div>;
          }
          const text = raw
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
            .map((v) => LIVESTOCK_TYPE_LABELS[v] || v)
            .join(', ');
          return <div className="text-sm">{text || '-'}</div>;
        },
        size: 140,
      },
      {
        accessorKey: 'operationMethod',
        header: '운영방식',
        enableSorting: false,
        cell: ({ row }) => {
          const raw = row.original.operationMethod?.trim();
          if (!raw) {
            return <div className="text-sm">-</div>;
          }
          const text = raw
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
            .map((v) => OPERATION_METHOD_LABELS[v] || v)
            .join(', ');
          return (
            <div className="text-sm max-w-[min(200px,28vw)] truncate" title={text || undefined}>
              {text || '-'}
            </div>
          );
        },
        size: 160,
      },
      {
        accessorKey: 'feedingMethod',
        header: '급여방식',
        enableSorting: false,
        cell: ({ row }) => {
          const raw = row.original.feedingMethod?.trim();
          if (!raw) {
            return <div className="text-sm">-</div>;
          }
          const text = FEEDING_METHOD_LABELS[raw] || raw;
          return (
            <div className="text-sm max-w-[min(160px,24vw)] truncate" title={text}>
              {text}
            </div>
          );
        },
        size: 130,
      },
      {
        accessorKey: 'livestockCount',
        header: '두수',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm tabular-nums whitespace-nowrap">
            {formatLivestockCount(row.original.livestockCount)}
          </div>
        ),
        size: 72,
      },
      {
        accessorKey: 'customerGrade',
        header: '회원등급',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm whitespace-nowrap">
            {labelOr(customerGradeMap, row.original.customerGrade) || '-'}
          </div>
        ),
        size: 88,
      },
      {
        id: 'chamchamStatus',
        accessorKey: 'chamchamStatus',
        header: '구 참참회원',
        enableSorting: false,
        cell: ({ row }) => {
          const label = labelOr(chamchamMap, row.original.chamchamStatus);
          return label ? <Badge variant="outline">{label}</Badge> : <span className="text-xs text-muted-foreground">-</span>;
        },
        size: 120,
      },
      {
        id: 'chamcharmMemberStatus',
        accessorKey: 'chamcharmMemberStatus',
        header: '참참회원',
        enableSorting: false,
        cell: ({ row }) => {
          const label = labelOr(chamcharmMemberMap, row.original.chamcharmMemberStatus);
          return label ? (
            <Badge variant="outline">{label}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          );
        },
        size: 120,
      },
      {
        accessorKey: 'consultationCount',
        header: '상담건수',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">{row.original.consultationCount ?? 0}</div>
        ),
        size: 90,
      },
      {
        accessorKey: 'salesManagerName',
        header: '영업 담당자',
        enableSorting: false,
        cell: ({ row }) => {
          const o = row.original;
          const text = formatSalesManagerDisplay(o.salesManagerName, o.salesManagerEmail);
          return (
            <div
              className="text-sm max-w-[min(220px,30vw)] line-clamp-2 break-words"
              title={text !== '—' ? text : undefined}
            >
              {text}
            </div>
          );
        },
        size: 200,
      },
      {
        accessorKey: 'createdAt',
        header: '등록일시',
        enableSorting: true,
        cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.createdAt)}</div>,
        size: 140,
      },
      {
        accessorKey: 'updatedAt',
        header: '수정일시',
        enableSorting: true,
        cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.updatedAt)}</div>,
        size: 140,
      },
    ];
  }, [chamchamMap, chamcharmMemberMap, customerTypeMap, customerGradeMap]);

  const sortableColumns = React.useMemo(
    () =>
      new Set(['companyName', 'createdAt', 'updatedAt', 'customerType', 'consultationCount']),
    [],
  );

  const handleSortChange = React.useCallback(
    (columnId: string, order: 'asc' | 'desc') => {
      if (!sortableColumns.has(columnId)) return;
      setSortBy(
        columnId as
          | 'createdAt'
          | 'updatedAt'
          | 'companyName'
          | 'customerType'
          | 'consultationCount',
      );
      setSortOrder(order);
      setPage(1);
    },
    [sortableColumns],
  );

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          검색
        </Label>
        <Input
          id="search"
          value={search}
          placeholder="업체명, 대표자, 전화번호"
          className="w-48 md:w-60"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">구분</Label>
        <Select
          value={selectedCustomerType}
          onValueChange={(value) => {
            setSelectedCustomerType(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue placeholder="농가/유통" />
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
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">회원등급</Label>
        <Select
          value={selectedCustomerGrade}
          onValueChange={(value) => {
            setSelectedCustomerGrade(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32" size="sm">
            <SelectValue placeholder="등급" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {(customerGradeCodes ?? []).map((code) => {
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
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">구 참참회원</Label>
        <Select
          value={selectedChamcham}
          onValueChange={(value) => {
            setSelectedChamcham(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue placeholder="회원 여부" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {(chamchamCodes ?? []).map((code) => {
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
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">고객 관리</h1>
            <p className="text-sm text-muted-foreground">등록된 고객 정보를 조회하고 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSheetDialogOpen(true)}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  반영 중...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  구글 시트 반영
                </>
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportExcel}>
              <Download className="mr-2 h-4 w-4" />
              엑셀 다운로드
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEventSmsExcelOpen(true)} title="구조 점검 · 미리보기 · DB 반영">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              엑셀 가져오기
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              고객 추가
            </Button>
          </div>
        </div>

        <CustomersDataTable
          columns={columns}
          data={customers}
          isLoading={isLoading}
          filterControls={filterControls}
          manualPagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onRowClick={handleRowClick}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
        />
      </div>

      <CustomerEventSmsExcelDialog
        open={eventSmsExcelOpen}
        onOpenChange={setEventSmsExcelOpen}
        onApplied={() => void refetch()}
      />

      <CustomerFormDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedCustomer(null);
          }
        }}
        customer={selectedCustomer}
        mode={drawerMode}
        onCancel={
          drawerMode === 'edit' && selectedCustomer
            ? () => {
                setDrawerOpen(false);
                setSelectedCustomerId(selectedCustomer.id);
                setDetailDrawerOpen(true);
              }
            : undefined
        }
      />

      <CustomerDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={(open) => {
          setDetailDrawerOpen(open);
          if (!open) {
            setSelectedCustomerId(null);
          }
        }}
        customerId={selectedCustomerId}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>고객을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제된 고객 정보는 복구할 수 없습니다. 계속 진행하시겠습니까?
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
            >
              <Trash2 className="mr-2 h-4 w-4" />
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={sheetDialogOpen} onOpenChange={(open) => {
        setSheetDialogOpen(open);
        if (!open) {
          setSpreadsheetId('');
          setSheetGid('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>구글 시트 반영</DialogTitle>
            <DialogDescription>
              구글 시트 URL 또는 시트 ID를 입력하세요. 시트의 기존 내용은 모두 삭제되고 현재 고객 데이터로 대체됩니다.
              <br />
              <span className="text-xs text-yellow-600 font-medium">
                ⚠️ 권한 오류가 발생하면 구글 로그인을 다시 진행해주세요. (Google Sheets API 권한 필요)
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="spreadsheetUrl">시트 URL 또는 시트 ID</Label>
              <Input
                id="spreadsheetUrl"
                placeholder="https://docs.google.com/spreadsheets/d/1taSkyPNMRc21l5hDJN9Tahd7MiPQHDcAHtdqDr1-Y00/edit?gid=1405370332"
                value={spreadsheetId}
                onChange={(e) => {
                  const value = e.target.value;
                  
                  // URL에서 시트 ID와 GID 자동 추출
                  const urlMatch = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
                  if (urlMatch) {
                    setSpreadsheetId(urlMatch[1]);
                  } else {
                    // URL이 아니면 그대로 사용
                    setSpreadsheetId(value);
                  }
                  
                  const gidMatch = value.match(/[?&#]gid=(\d+)/);
                  if (gidMatch) {
                    setSheetGid(gidMatch[1]);
                  }
                }}
                disabled={isExporting}
              />
              <p className="text-xs text-muted-foreground">
                구글 시트 URL을 붙여넣으면 시트 ID와 시트 탭 ID가 자동으로 추출됩니다.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheetGid">시트 탭 ID (선택사항)</Label>
              <Input
                id="sheetGid"
                placeholder="예: 1405370332"
                value={sheetGid}
                onChange={(e) => setSheetGid(e.target.value)}
                disabled={isExporting}
              />
              <p className="text-xs text-muted-foreground">
                특정 시트 탭에 쓰려면 gid를 입력하세요. 비워두면 첫 번째 시트에 작성됩니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSheetDialogOpen(false);
                setSpreadsheetId('');
                setSheetGid('');
              }}
              disabled={isExporting}
            >
              취소
            </Button>
            <Button onClick={handleExportToSheet} disabled={isExporting || !spreadsheetId.trim()}>
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  반영 중...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  반영하기
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
