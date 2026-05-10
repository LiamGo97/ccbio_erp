'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  SmsSender,
  useSmsSenders,
} from '@/lib/hooks/use-sms-senders';
import { SmsSenderFormDrawer } from '@/components/sms-senders/sms-sender-form-drawer';
import { SmsSenderDetailDrawer } from '@/components/sms-senders/sms-sender-detail-drawer';
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

const formatPhone = (phone?: string) => {
  if (!phone) return '-';
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
};

export default function SmsSendersPage() {
  const columnSettings = useColumnSettings('sms-senders');
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedSmsSender, setSelectedSmsSender] = React.useState<SmsSender | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedSmsSenderId, setSelectedSmsSenderId] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const params = React.useMemo(
    () => ({
      search: search.trim() || undefined,
    }),
    [search],
  );

  const { data: smsSenders = [], isLoading } = useSmsSenders(params);

  const handleCreate = () => {
    setSelectedSmsSender(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleRowClick = (smsSender: SmsSender) => {
    setSelectedSmsSenderId(smsSender.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (smsSender: SmsSender) => {
    setSelectedSmsSender(smsSender);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const columns = React.useMemo<ColumnDef<SmsSender>[]>(() => {
    return [
      {
        accessorKey: 'name',
        header: '담당자명',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm font-semibold">{row.original.name}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'phone',
        header: '전화번호',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{formatPhone(row.original.phone)}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'status',
        header: '상태',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status ? 'default' : 'secondary'}>
            {row.original.status ? '활성' : '비활성'}
          </Badge>
        ),
        size: 100,
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        enableSorting: false,
        cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
        size: 120,
      },
    ];
  }, []);

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          검색
        </Label>
        <Input
          id="search"
          value={search}
          placeholder="담당자명 또는 전화번호"
          className="w-48 md:w-60"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">SMS 발신자 관리</h1>
            <p className="text-sm text-muted-foreground">회사 전화번호와 담당자 정보를 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              발신자 추가
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={smsSenders}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={smsSenders.length}
          totalPages={Math.max(1, Math.ceil(smsSenders.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            Cookies.set('data-table-page-size', size.toString());
          }}
          rowClassName="h-10"
        />

        <SmsSenderFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedSmsSender(null);
            }
          }}
          smsSender={selectedSmsSender}
          mode={drawerMode}
          onCancel={
            drawerMode === 'edit' && selectedSmsSender
              ? () => {
                  setDrawerOpen(false);
                  setSelectedSmsSenderId(selectedSmsSender.id);
                  setDetailDrawerOpen(true);
                }
              : undefined
          }
        />

        <SmsSenderDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedSmsSenderId(null);
            }
          }}
          smsSenderId={selectedSmsSenderId}
          onEdit={handleEdit}
        />
      </div>
    </AppLayout>
  );
}
