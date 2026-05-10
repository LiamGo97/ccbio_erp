'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import {
  useReceivableWarningConfigs,
  ReceivableWarningConfig,
} from '@/lib/hooks/use-receivable-warning-configs';
import { ReceivableWarningConfigDetailDrawer } from '@/components/finance/receivable-warning-config-detail-drawer';
import { ReceivableWarningConfigFormDrawer } from '@/components/finance/receivable-warning-config-form-drawer';
import { AlertTriangle } from 'lucide-react';
import { useColumnSettings } from '@/hooks/use-column-settings';

const getWarningLevelName = (level: string) => {
  const map: Record<string, string> = {
    WARNING_1ST: '1차 경고',
    WARNING_2ND: '2차 경고',
    WARNING_3RD: '3차 경고',
    MALICIOUS: '악성 채권',
  };
  return map[level] || level;
};

const getWarningLevelBadge = (level: string) => {
  const normalized = level.trim().toUpperCase();
  if (normalized === 'WARNING_1ST') {
    return (
      <Badge variant="outline" className="border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300">
        {getWarningLevelName(level)}
      </Badge>
    );
  }
  if (normalized === 'WARNING_2ND') {
    return (
      <Badge variant="outline" className="border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300">
        {getWarningLevelName(level)}
      </Badge>
    );
  }
  if (normalized === 'WARNING_3RD') {
    return (
      <Badge variant="outline" className="border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300">
        {getWarningLevelName(level)}
      </Badge>
    );
  }
  if (normalized === 'MALICIOUS') {
    return (
      <Badge variant="outline" className="border-red-600 bg-red-100 text-red-800 dark:border-red-500 dark:bg-red-950/50 dark:text-red-200">
        {getWarningLevelName(level)}
      </Badge>
    );
  }
  return <Badge variant="outline">{getWarningLevelName(level)}</Badge>;
};

function ReceivableWarningConfigPageContent() {
  const columnSettings = useColumnSettings('finance-receivables-warning-config');
  const [user, setUser] = React.useState<User | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [selectedConfigId, setSelectedConfigId] = React.useState<number | null>(null);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const { data: configs = [], isLoading } = useReceivableWarningConfigs();

  const columns: ColumnDef<ReceivableWarningConfig>[] = React.useMemo(
    () => [
      {
        accessorKey: 'warningLevel',
        header: '경고 단계',
        cell: ({ row }) => getWarningLevelBadge(row.original.warningLevel),
      },
      {
        accessorKey: 'daysThreshold',
        header: '경과일 기준',
        cell: ({ row }) => (
          <div className="text-sm font-medium">{row.original.daysThreshold}일</div>
        ),
      },
      {
        accessorKey: 'smsEnabled',
        header: 'SMS 발송',
        cell: ({ row }) => (
          <Badge variant={row.original.smsEnabled ? 'default' : 'secondary'}>
            {row.original.smsEnabled ? '사용' : '미사용'}
          </Badge>
        ),
      },
      {
        accessorKey: 'smsDaily',
        header: '매일 발송',
        cell: ({ row }) => (
          <Badge variant={row.original.smsDaily ? 'default' : 'secondary'}>
            {row.original.smsDaily ? '예' : '아니오'}
          </Badge>
        ),
      },
      {
        accessorKey: 'description',
        header: '설명',
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground max-w-xs truncate">
            {row.original.description || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'userId',
        header: '설정 유형',
        cell: ({ row }) => (
          <Badge variant={row.original.userId ? 'default' : 'outline'}>
            {row.original.userId ? '사용자 설정' : '전역 설정'}
          </Badge>
        ),
      },
      {
        accessorKey: 'isActive',
        header: '상태',
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {row.original.isActive ? '활성' : '비활성'}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">채권 경고 설정</h1>
          <p className="text-muted-foreground text-sm">
            채권 경고 단계별 경과일 기준 및 SMS 발송 설정을 관리합니다. 사용자별로 다른 경고 기간을 설정할 수 있습니다.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <p className="text-sm text-muted-foreground">
              거래명세서 발행일 기준으로 경과일이 경과하면 자동으로 경고 상태가 설정됩니다.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={configs}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          showRowNumber
          rowClassName="h-10"
          onRowClick={(row) => {
            setSelectedConfigId(row.id);
            setDetailDrawerOpen(true);
          }}
        />

        <ReceivableWarningConfigDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open && !editDrawerOpen) {
              // 수정 Drawer가 열리는 중이 아닐 때만 selectedConfigId 초기화
              setSelectedConfigId(null);
            }
          }}
          configId={selectedConfigId}
          onEditDrawerOpen={(configId) => {
            setSelectedConfigId(configId);
            setDetailDrawerOpen(false);
            setEditDrawerOpen(true);
          }}
          onSuccess={async () => {
            // 데이터 갱신은 queryClient를 통해 자동으로 처리됨
          }}
        />

        <ReceivableWarningConfigFormDrawer
          open={editDrawerOpen}
          onOpenChange={(open) => {
            setEditDrawerOpen(open);
            if (!open) {
              setSelectedConfigId(null);
            }
          }}
          configId={selectedConfigId}
          onSuccess={async () => {
            // 데이터 갱신은 queryClient를 통해 자동으로 처리됨
          }}
        />
      </div>
    </AppLayout>
  );
}

export default function ReceivableWarningConfigPage() {
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
      <ReceivableWarningConfigPageContent />
    </Suspense>
  );
}
