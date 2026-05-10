'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { useSmsHistory, SmsHistory } from '@/lib/hooks/use-sms-history';
import { useCodes } from '@/lib/hooks/use-codes';
import { SmsHistoryDetailDrawer } from '@/components/sms/sms-history-detail-drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import Cookies from 'js-cookie';
import { useColumnSettings } from '@/hooks/use-column-settings';

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

const formatDate = (value?: string | Date | null) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function SmsHistoryPageContent() {
  const columnSettings = useColumnSettings('sms-history');
  const [user, setUser] = React.useState<User | null>(null);
  const [selectedTemplateType, setSelectedTemplateType] = React.useState<string>('');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('');
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<number | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);

  // 템플릿 타입 코드 조회
  const { data: templateTypes } = useCodes({ group: 'SMS_TEMPLATE_TYPE' });
  
  // SMS 상태 코드 조회
  const { data: statusCodes } = useCodes({ group: 'SMS_STATUS' });

  // SMS 이력 목록 조회
  const { data: historyData, isLoading } = useSmsHistory({
    templateType: selectedTemplateType || undefined,
    status: selectedStatus || undefined,
    page,
    limit: pageSize,
  });

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 필터 변경 시 페이지를 1로 리셋
  React.useEffect(() => {
    setPage(1);
  }, [selectedTemplateType, selectedStatus]);

  const handleRowClick = (history: SmsHistory) => {
    setSelectedHistoryId(history.id);
    setDetailDrawerOpen(true);
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return '-';
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('02')) {
      if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return phone;
  };

  const getStatusBadge = (status?: string | null) => {
    if (!status) {
      return (
        <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
          -
        </Badge>
      );
    }
    
    const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
      SENT: {
        variant: 'outline',
        className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
      },
      PENDING: {
        variant: 'outline',
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      },
      FAILED: {
        variant: 'outline',
        className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
      },
      CANCELLED: {
        variant: 'outline',
        className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
      },
    };

    const style = statusStyles[status];
    if (!style) {
      return (
        <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
          {status}
        </Badge>
      );
    }

    const statusCode = statusCodes?.data?.find((code) => code.value === status);
    const statusLabel = statusCode?.name || (status === 'SENT' ? '발송완료' : status === 'PENDING' ? '대기' : status === 'FAILED' ? '실패' : status === 'CANCELLED' ? '취소' : status);

    return (
      <Badge variant={style.variant} className={style.className}>
        {statusLabel}
      </Badge>
    );
  };

  const getMessageTypeBadge = (messageType?: string) => {
    if (!messageType) return '-';
    
    switch (messageType) {
      case 'SMS':
        return <Badge variant="outline">SMS</Badge>;
      case 'LMS':
        return <Badge variant="outline">LMS</Badge>;
      case 'MMS':
        return <Badge variant="outline">MMS</Badge>;
      default:
        return <Badge variant="outline">{messageType}</Badge>;
    }
  };

  const columns: ColumnDef<SmsHistory>[] = React.useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: '발송일시',
        cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.createdAt)}</div>,
        size: 160,
      },
      {
        accessorKey: 'templateType',
        header: '타입',
        cell: ({ row }) => {
          const typeCode = templateTypes?.data?.find((code) => code.value === row.original.templateType);
          return <div className="text-sm">{typeCode?.name || (row.original.templateType === 'INVOICE' ? '거래명세서' : row.original.templateType)}</div>;
        },
        size: 120,
      },
      {
        accessorKey: 'recipientPhone',
        header: '수신자',
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{formatPhone(row.original.recipientPhone)}</div>
            {row.original.recipientName && (
              <div className="text-xs text-muted-foreground">{row.original.recipientName}</div>
            )}
          </div>
        ),
        size: 140,
      },
      {
        accessorKey: 'senderPhone',
        header: '발신자',
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{formatPhone(row.original.senderPhone)}</div>
            {row.original.senderUser?.name && (
              <div className="text-xs text-muted-foreground">{row.original.senderUser.name}</div>
            )}
          </div>
        ),
        size: 140,
      },
      {
        accessorKey: 'messageType',
        header: '메시지 타입',
        cell: ({ row }) => getMessageTypeBadge(row.original.messageType),
        size: 120,
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ row }) => getStatusBadge(row.original.status),
        size: 120,
      },
      {
        accessorKey: 'message',
        header: '메시지',
        cell: ({ row }) => (
          <div className="min-w-0 truncate text-sm text-muted-foreground">
            {row.original.message ?? ''}
          </div>
        ),
        size: 300,
        minSize: 120,
      },
    ],
    [templateTypes, statusCodes],
  );

  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">템플릿 타입</Label>
        <Select
          value={selectedTemplateType || 'all'}
          onValueChange={(value) => {
            setSelectedTemplateType(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {templateTypes?.data?.map((code) => {
              const codeValue = code.value || code.name;
              return codeValue ? (
                <SelectItem key={code.id} value={codeValue}>
                  {code.name}
                </SelectItem>
              ) : null;
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상태</Label>
        <Select
          value={selectedStatus || 'all'}
          onValueChange={(value) => {
            setSelectedStatus(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {statusCodes?.data?.map((code) => {
              const codeValue = code.value || code.name;
              return codeValue ? (
                <SelectItem key={code.id} value={codeValue}>
                  {code.name}
                </SelectItem>
              ) : null;
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SMS 발송 이력</h1>
            <p className="hidden text-muted-foreground md:block">
              발송된 SMS/MMS 이력을 확인할 수 있습니다.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={historyData?.data || []}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={historyData?.total || 0}
          totalPages={historyData?.totalPages || 0}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            Cookies.set('data-table-page-size', size.toString());
          }}
          filterControls={filterControls}
          manualPagination={true}
          enableSorting={false}
          rowClassName="h-10"
        />

        {/* SMS 이력 상세 Drawer */}
        {selectedHistoryId && (
          <SmsHistoryDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                setSelectedHistoryId(null);
              }
            }}
            historyId={selectedHistoryId}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function SmsHistoryPage() {
  return (
    <Suspense fallback={
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    }>
      <SmsHistoryPageContent />
    </Suspense>
  );
}
