'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  useSmsBatchHistory,
  SmsBatchHistoryItem,
} from '@/lib/hooks/use-receivables';
import { useIsMobile } from '@/hooks/use-mobile';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { Send, CheckCircle2, XCircle, User as UserIcon, X } from 'lucide-react';
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

function formatFilterParams(filterParams: Record<string, unknown> | null): string {
  if (!filterParams || Object.keys(filterParams).length === 0) return '-';
  const parts: string[] = [];
  if (filterParams.search) parts.push(`검색: ${filterParams.search}`);
  if (filterParams.excludeZeroBalance === true) parts.push('잔액0 제외');
  if (filterParams.supplierId) parts.push(`공급처 ID: ${filterParams.supplierId}`);
  return parts.length > 0 ? parts.join(', ') : '-';
}

function SmsBatchHistoryPageContent() {
  const columnSettings = useColumnSettings('finance-receivables-sms-batch-history');
  const isMobile = useIsMobile();
  const [user, setUser] = React.useState<User | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selectedBatch, setSelectedBatch] = React.useState<SmsBatchHistoryItem | null>(null);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    e.stopPropagation();
  }, []);

  React.useEffect(() => {
    if (!detailOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setDetailOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [detailOpen]);

  const { data, isLoading } = useSmsBatchHistory({ page, limit: pageSize });

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.lastPage ?? 1;

  const columns: ColumnDef<SmsBatchHistoryItem>[] = React.useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: '발송 일시',
        cell: ({ row }) => {
          const d = new Date(row.original.createdAt);
          return (
            <span className="text-sm">
              {d.toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'createdBy',
        header: '실행자',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.createdBy?.name ?? '-'}
          </span>
        ),
        size: 120,
      },
      {
        accessorKey: 'senderName',
        header: '발신자',
        cell: ({ row }) => (
          <span className="text-sm">{row.original.senderName ?? '-'}</span>
        ),
        size: 100,
      },
      {
        accessorKey: 'filterParams',
        header: '필터 조건',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground max-w-[200px] truncate block" title={formatFilterParams(row.original.filterParams)}>
            {formatFilterParams(row.original.filterParams)}
          </span>
        ),
        size: 200,
      },
      {
        accessorKey: 'totalTarget',
        header: '대상',
        cell: ({ row }) => (
          <span className="text-sm font-medium">{row.original.totalTarget}명</span>
        ),
        size: 70,
      },
      {
        accessorKey: 'sentCount',
        header: '성공',
        cell: ({ row }) => (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
            {row.original.sentCount}건
          </span>
        ),
        size: 70,
      },
      {
        accessorKey: 'failCount',
        header: '실패',
        cell: ({ row }) => (
          <span className={`text-sm font-medium ${row.original.failCount > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
            {row.original.failCount}건
          </span>
        ),
        size: 70,
      },
    ],
    [],
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">채권 경고 문자 발송 이력</h1>
          <p className="text-muted-foreground text-sm">
            채권 경고 문자 일괄 발송 시 언제, 누가, 어떤 필터로 발송했는지 이력을 확인할 수 있습니다.
          </p>
        </div>

        <DataTable
          columns={columns}
          data={items}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          page={page}
          total={total}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          manualPagination
          showRowNumber
          rowClassName="h-10 cursor-pointer"
          onRowClick={(row) => {
            setSelectedBatch(row);
            setDetailOpen(true);
          }}
          pageSizeCookieKey="data-table-page-size"
        />

        <Drawer open={detailOpen} onOpenChange={setDetailOpen} direction="right" dismissible={false}>
          <DrawerContent
            className="h-full flex flex-col"
            style={{
              width: isMobile ? '100%' : '480px',
              maxWidth: '95vw',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
            onPointerDown={handlePointerDown}
            onDoubleClick={handleDoubleClick}
          >
            <DrawerHeader className="border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-muted-foreground" />
                    <DrawerTitle>발송 상세</DrawerTitle>
                  </div>
                  <DrawerDescription>
                    {selectedBatch
                      ? `${new Date(selectedBatch.createdAt).toLocaleString('ko-KR')} · ${selectedBatch.createdBy?.name ?? '시스템'}`
                      : '채권 경고 문자 일괄 발송 상세 내역'}
                  </DrawerDescription>
                </div>
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setDetailOpen(false)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">닫기</span>
                  </Button>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <div
              className="flex-1 overflow-y-auto p-4 min-h-0"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              onDoubleClick={handleDoubleClick}
            >
              {selectedBatch && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div className="text-muted-foreground">실행자</div>
                    <div className="font-medium flex items-center gap-1">
                      <UserIcon className="h-4 w-4 shrink-0" />
                      {selectedBatch.createdBy?.name ?? '-'}
                    </div>
                    <div className="text-muted-foreground">발신자</div>
                    <div>{selectedBatch.senderName ?? '-'}</div>
                    <div className="text-muted-foreground">필터 조건</div>
                    <div className="text-sm break-words">{formatFilterParams(selectedBatch.filterParams)}</div>
                    <div className="text-muted-foreground">대상 / 성공 / 실패</div>
                    <div>
                      {selectedBatch.totalTarget}명 /{' '}
                      <span className="text-green-600 dark:text-green-400">{selectedBatch.sentCount}건</span>
                      {selectedBatch.failCount > 0 && (
                        <>
                          {' '}/ <span className="text-red-600 dark:text-red-400">{selectedBatch.failCount}건</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">발송 결과</h4>
                    <div className="rounded-lg border divide-y max-h-[400px] overflow-y-auto">
                      {(selectedBatch.results ?? []).map((r, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <span className="truncate flex-1" title={r.companyName ?? r.customerId}>
                            {r.companyName ?? r.customerId ?? '-'}
                          </span>
                          {r.success ? (
                            <Badge variant="outline" className="shrink-0 border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300">
                              <CheckCircle2 className="h-3.5 w-3.5 mr-0.5" />
                              성공
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="shrink-0 border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" title={r.error}>
                              <XCircle className="h-3.5 w-3.5 mr-0.5" />
                              실패
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DrawerFooter className="border-t flex-shrink-0">
              <DrawerClose asChild>
                <Button variant="outline" onClick={() => setDetailOpen(false)}>
                  <X className="mr-1.5 h-4 w-4" />
                  닫기
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </AppLayout>
  );
}

export default function SmsBatchHistoryPage() {
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
      <SmsBatchHistoryPageContent />
    </Suspense>
  );
}
