'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
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
  useEtaUpdateBatchHistory,
  EtaUpdateBatchHistoryItem,
  EtaUpdateBatchResultItem,
  EtaUpdateBatchErrorCode,
} from '@/lib/hooks/use-trade-contracts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { RefreshCw, CheckCircle2, XCircle, User as UserIcon, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

const formatUsageValue = (value?: number | null) => (value != null ? value.toLocaleString('ko-KR') : '-');

/** 실패 원인 코드 → 한글 라벨 */
const getErrorCodeLabel = (code?: EtaUpdateBatchErrorCode | null): string | null => {
  if (!code) return null;
  const labels: Record<EtaUpdateBatchErrorCode, string> = {
    NETWORK: '네트워크 오류',
    API_LIMIT: 'API 호출 제한',
    UNIQUE_SHIPMENT_LIMIT: '고유 선적 수량 부족',
    POSSIBLE_QUOTA: '수량 부족 가능성',
    API_KEY_EXPIRED: 'API 키 만료',
    API_ERROR: 'API 오류',
    UNKNOWN: '알 수 없음',
  };
  return labels[code] ?? null;
};

/** 날짜 문자열 파싱 후 일수 차이 반환 (after - before). 파싱 실패 시 null */
function getDateChangeDays(beforeStr: string | null | undefined, afterStr: string | null | undefined): number | null {
  if (!beforeStr || !afterStr) return null;
  const before = new Date(beforeStr);
  const after = new Date(afterStr);
  if (Number.isNaN(before.getTime()) || Number.isNaN(after.getTime())) return null;
  const diffMs = after.getTime() - before.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

function formatFilterParams(filterParams: Record<string, unknown> | null): string {
  if (!filterParams || Object.keys(filterParams).length === 0) return '-';
  const parts: string[] = [];
  if (filterParams.contractNo) parts.push(`계약/BK/BL: ${filterParams.contractNo}`);
  if (filterParams.productName) {
    const pn = filterParams.productName;
    parts.push(`제품: ${Array.isArray(pn) ? `${(pn as string[]).length}개` : String(pn)}`);
  }
  if (Array.isArray(filterParams.tradeStatus) && filterParams.tradeStatus.length > 0)
    parts.push(`상태: ${(filterParams.tradeStatus as string[]).join(', ')}`);
  if (filterParams.userId) parts.push(`등록자 ID: ${filterParams.userId}`);
  if (Array.isArray(filterParams.exporters) && filterParams.exporters.length > 0)
    parts.push(`수출사: ${(filterParams.exporters as string[]).length}개`);
  if (filterParams.dateType && (filterParams.dateFrom || filterParams.dateTo))
    parts.push(`기간(${filterParams.dateType}): ${filterParams.dateFrom ?? ''} ~ ${filterParams.dateTo ?? ''}`);
  if (filterParams.includeExcluded === true) parts.push('제외 주문 포함');
  if (filterParams.sortBy) parts.push(`정렬: ${filterParams.sortBy} ${filterParams.sortOrder ?? 'asc'}`);
  return parts.length > 0 ? parts.join(' · ') : '-';
}

function EtaUpdateHistoryPageContent() {
  const isMobile = useIsMobile();
  const columnSettings = useColumnSettings('logistics-eta-update-history');
  const [user, setUser] = React.useState<User | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [sortBy, setSortBy] = React.useState<string>('createdAt');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selectedBatch, setSelectedBatch] = React.useState<EtaUpdateBatchHistoryItem | null>(null);
  /** 갱신 상세 - ETA 변경된 주문 테이블 정렬 */
  const [changedTableSortBy, setChangedTableSortBy] = React.useState<'contractNo' | 'bk' | 'eta' | 'etd' | 'shippingLine'>('contractNo');
  const [changedTableSortOrder, setChangedTableSortOrder] = React.useState<'asc' | 'desc'>('asc');

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
      setDetailOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailOpen]);

  const { data, isLoading } = useEtaUpdateBatchHistory({
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
  });

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.lastPage ?? 1;

  const columns: ColumnDef<EtaUpdateBatchHistoryItem>[] = React.useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: '실행 일시',
        enableSorting: true,
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
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm">{row.original.createdBy?.name ?? '-'}</span>
        ),
        size: 120,
      },
      {
        accessorKey: 'trigger',
        header: '트리거',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.trigger === 'SCHEDULED' ? '스케줄' : '수동'}</span>
        ),
        size: 80,
      },
      {
        accessorKey: 'filterParams',
        header: '필터 조건',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground max-w-[220px] truncate block" title={formatFilterParams(row.original.filterParams)}>
            {formatFilterParams(row.original.filterParams)}
          </span>
        ),
        size: 220,
      },
      {
        accessorKey: 'total',
        header: '대상',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm font-medium">{row.original.total}건</span>
        ),
        size: 70,
      },
      {
        accessorKey: 'success',
        header: '성공',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
            {row.original.success}건
          </span>
        ),
        size: 70,
      },
      {
        accessorKey: 'failed',
        header: '실패',
        enableSorting: true,
        cell: ({ row }) => (
          <span className={`text-sm font-medium ${row.original.failed > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
            {row.original.failed}건
          </span>
        ),
        size: 70,
      },
      {
        accessorKey: 'apiUsageAfter',
        header: 'API 잔여',
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original.apiUsageAfter;
          if (!u?.apiCalls && !u?.uniqueShipments) return <span className="text-sm text-muted-foreground">-</span>;
          const ac = u.apiCalls;
          const us = u.uniqueShipments;
          return (
            <span className="text-sm text-muted-foreground">
              {ac && (ac.remaining != null || ac.total != null)
                ? `호출 ${formatUsageValue(ac.remaining)}/${formatUsageValue(ac.total)}`
                : ''}
              {ac && us && ' · '}
              {us && (us.remaining != null || us.total != null)
                ? `선적 ${formatUsageValue(us.remaining)}/${formatUsageValue(us.total)}`
                : ''}
            </span>
          );
        },
        size: 140,
      },
    ],
    [],
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ETA 정보 갱신 이력</h1>
          <p className="text-muted-foreground text-sm">
            물류관리에서 ETA 정보 갱신을 실행한 이력을 확인할 수 있습니다. 언제, 누가, 어떤 주문에 대해 실행했는지와 변경 여부를 볼 수 있습니다.
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
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(by, order) => {
            setSortBy(by);
            setSortOrder(order);
            setPage(1);
          }}
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
              width: isMobile ? '100%' : '960px',
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
                    <RefreshCw className="h-5 w-5 text-muted-foreground" />
                    <DrawerTitle>갱신 상세</DrawerTitle>
                  </div>
                  <DrawerDescription>
                    {selectedBatch
                      ? `${new Date(selectedBatch.createdAt).toLocaleString('ko-KR')} · ${selectedBatch.createdBy?.name ?? '시스템'}`
                      : 'ETA 일괄 갱신 상세 내역'}
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
              className="flex-1 flex flex-col min-h-0 overflow-hidden p-4"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              onDoubleClick={handleDoubleClick}
            >
              {selectedBatch && (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm flex-shrink-0">
                    <div className="text-muted-foreground">실행자</div>
                    <div className="font-medium flex items-center gap-1">
                      <UserIcon className="h-4 w-4 shrink-0" />
                      {selectedBatch.createdBy?.name ?? '-'}
                    </div>
                    <div className="text-muted-foreground">트리거</div>
                    <div>{selectedBatch.trigger === 'SCHEDULED' ? '스케줄' : '수동'}</div>
                    <div className="text-muted-foreground">필터 조건</div>
                    <div className="text-sm break-words">{formatFilterParams(selectedBatch.filterParams)}</div>
                    <div className="text-muted-foreground">대상 / 성공 / 실패</div>
                    <div>
                      {selectedBatch.total}건 /{' '}
                      <span className="text-green-600 dark:text-green-400">{selectedBatch.success}건</span>
                      {selectedBatch.failed > 0 && (
                        <>
                          {' '}/ <span className="text-red-600 dark:text-red-400">{selectedBatch.failed}건</span>
                        </>
                      )}
                    </div>
                    {(selectedBatch.apiUsageAfter?.apiCalls || selectedBatch.apiUsageAfter?.uniqueShipments) && (
                      <div className="col-span-2 space-y-1">
                        <div className="text-muted-foreground">API 사용량 (갱신 완료 시점)</div>
                        <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-xs space-y-1">
                          {selectedBatch.apiUsageAfter.apiCalls && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground">API 호출</span>
                              <span>
                                {formatUsageValue(selectedBatch.apiUsageAfter.apiCalls.used)} / {formatUsageValue(selectedBatch.apiUsageAfter.apiCalls.total)}
                                {selectedBatch.apiUsageAfter.apiCalls.remaining != null && (
                                  <span className="text-muted-foreground ml-1">(잔여 {formatUsageValue(selectedBatch.apiUsageAfter.apiCalls.remaining)})</span>
                                )}
                              </span>
                            </div>
                          )}
                          {selectedBatch.apiUsageAfter.uniqueShipments && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground">고유 선적</span>
                              <span>
                                {formatUsageValue(selectedBatch.apiUsageAfter.uniqueShipments.used)} / {formatUsageValue(selectedBatch.apiUsageAfter.uniqueShipments.total)}
                                {selectedBatch.apiUsageAfter.uniqueShipments.remaining != null && (
                                  <span className="text-muted-foreground ml-1">(잔여 {formatUsageValue(selectedBatch.apiUsageAfter.uniqueShipments.remaining)})</span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const results = selectedBatch.results ?? [];
                    const failedOnly = results.filter((r: EtaUpdateBatchResultItem) => !r.success);
                    const changedOnly = results.filter((r: EtaUpdateBatchResultItem) => r.success && r.changed === true);
                    return (
                      <>
                        {/* 실패한 주문: BK(또는 주문 ID) + 실패 원인 */}
                        <div className="flex-shrink-0">
                          <h4 className="text-sm font-medium mb-2">실패한 주문</h4>
                          <p className="text-xs text-muted-foreground mb-2">
                            선적 조회 또는 갱신에 실패한 주문입니다. (총 {results.length}건 중 {failedOnly.length}건 실패)
                          </p>
                          {selectedBatch.apiUsageAfter?.uniqueShipments?.remaining != null &&
                            selectedBatch.apiUsageAfter.uniqueShipments.remaining <= 0 &&
                            failedOnly.length > 0 && (
                              <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 mb-2 text-xs text-amber-800 dark:text-amber-200">
                                <strong>※ 고유 선적 잔여가 0건입니다.</strong> 아래 실패의 원인이 고유 선적 수량 부족일 수 있습니다. 일일 한도가 갱신된 후 다시 시도해주세요.
                              </div>
                            )}
                          {failedOnly.length === 0 ? (
                            <div className="rounded-lg border px-3 py-4 text-center text-sm text-muted-foreground">
                              실패한 주문이 없습니다.
                            </div>
                          ) : (
                            <div className="rounded-lg border overflow-y-auto max-h-[40vh]">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="w-0 py-2">
                                      <span className="sr-only">상태</span>
                                    </TableHead>
                                    <TableHead className="py-2 text-xs font-medium">계약 / BK</TableHead>
                                    <TableHead className="py-2 text-xs font-medium">실패 원인</TableHead>
                                    <TableHead className="py-2 text-xs font-medium w-24">분류</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {failedOnly.map((r: EtaUpdateBatchResultItem, idx: number) => {
                                    const codeLabel = getErrorCodeLabel(r.errorCode);
                                    const isQuotaRelated =
                                      r.errorCode === 'UNIQUE_SHIPMENT_LIMIT' ||
                                      r.errorCode === 'POSSIBLE_QUOTA' ||
                                      r.errorCode === 'API_LIMIT';
                                    return (
                                      <TableRow key={idx} className="text-sm">
                                        <TableCell className="py-2 w-0">
                                          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                                        </TableCell>
                                        <TableCell className="py-2 font-medium">
                                          {[r.contractNo && `계약: ${r.contractNo}`, r.bk && `BK: ${r.bk}`].filter(Boolean).join(' · ') || `주문 ID: ${r.orderId}`}
                                        </TableCell>
                                        <TableCell className="py-2 text-muted-foreground break-words text-xs align-top" title={[r.error, r.errorDetail].filter(Boolean).join(' | ')}>
                                          <div className="space-y-0.5">
                                            <span>{r.error ?? '-'}</span>
                                            {r.errorDetail && (
                                              <div className="text-amber-600 dark:text-amber-400 font-medium">
                                                {r.errorDetail}
                                              </div>
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell className="py-2 align-top">
                                          {codeLabel && (
                                            <span
                                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                                                isQuotaRelated
                                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                                                  : r.errorCode === 'NETWORK'
                                                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                    : 'bg-muted text-muted-foreground'
                                              }`}
                                            >
                                              {codeLabel}
                                            </span>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>

                        {/* 성공한 것 중 ETA가 실제로 변경된 주문만 - 남는 세로 공간 전체 사용 */}
                        <div className="flex-1 flex flex-col min-h-0">
                          <h4 className="text-sm font-medium mb-2 flex-shrink-0">ETA 변경된 주문</h4>
                          <p className="text-xs text-muted-foreground mb-2 flex-shrink-0">
                            성공한 주문 중 ETA·ETD·선사 등이 실제로 변경된 주문만 표시합니다. (성공 {selectedBatch.success}건 중 {changedOnly.length}건 변경)
                          </p>
                          {changedOnly.length === 0 ? (
                            <div className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground flex-shrink-0">
                              ETA 변경된 주문이 없습니다.
                            </div>
                          ) : (() => {
                            /** 정렬 키: 계약/BK는 원본, ETA/ETD/선사는 조회 후 바뀐 값(after) 기준 */
                            const getSortValue = (r: EtaUpdateBatchResultItem, key: 'contractNo' | 'bk' | 'eta' | 'etd' | 'shippingLine') => {
                              if (key === 'contractNo') return (r.contractNo ?? '') as string;
                              if (key === 'bk') return (r.bk ?? '') as string;
                              if (key === 'eta') return (r.after?.eta ?? '') as string;
                              if (key === 'etd') return (r.after?.etd ?? '') as string;
                              return (r.after?.shippingLine ?? '') as string;
                            };
                            const sorted = [...changedOnly].sort((a, b) => {
                              const va = getSortValue(a, changedTableSortBy);
                              const vb = getSortValue(b, changedTableSortBy);
                              const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
                              return changedTableSortOrder === 'asc' ? cmp : -cmp;
                            });
                            const handleSort = (col: 'contractNo' | 'bk' | 'eta' | 'etd' | 'shippingLine') => {
                              if (changedTableSortBy === col) setChangedTableSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                              else {
                                setChangedTableSortBy(col);
                                setChangedTableSortOrder('asc');
                              }
                            };
                            const SortIcon = ({ col }: { col: 'contractNo' | 'bk' | 'eta' | 'etd' | 'shippingLine' }) =>
                              changedTableSortBy !== col ? (
                                <ArrowUpDown className="ml-0.5 h-3 w-3 opacity-50 inline" />
                              ) : changedTableSortOrder === 'asc' ? (
                                <ArrowUp className="ml-0.5 h-3 w-3 inline" />
                              ) : (
                                <ArrowDown className="ml-0.5 h-3 w-3 inline" />
                              );
                            return (
                              <div className="rounded-lg border flex-1 min-h-0 overflow-y-auto">
                                <Table>
                                  <TableHeader className="sticky top-0 z-10 bg-background shadow-sm [&_th]:bg-background">
                                    <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                                      <TableHead className="py-2 text-xs font-medium w-0">NO</TableHead>
                                      <TableHead className="py-2 text-xs font-medium">
                                        <button type="button" className="flex items-center gap-0.5 hover:text-foreground" onClick={() => handleSort('contractNo')}>
                                          계약 <SortIcon col="contractNo" />
                                        </button>
                                      </TableHead>
                                      <TableHead className="py-2 text-xs font-medium">
                                        <button type="button" className="flex items-center gap-0.5 hover:text-foreground" onClick={() => handleSort('bk')}>
                                          BK <SortIcon col="bk" />
                                        </button>
                                      </TableHead>
                                      <TableHead className="py-2 text-xs font-medium">
                                        <button type="button" className="flex items-center gap-0.5 hover:text-foreground" onClick={() => handleSort('eta')}>
                                          ETA <SortIcon col="eta" />
                                        </button>
                                      </TableHead>
                                      <TableHead className="py-2 text-xs font-medium">
                                        <button type="button" className="flex items-center gap-0.5 hover:text-foreground" onClick={() => handleSort('etd')}>
                                          ETD <SortIcon col="etd" />
                                        </button>
                                      </TableHead>
                                      <TableHead className="py-2 text-xs font-medium">
                                        <button type="button" className="flex items-center gap-0.5 hover:text-foreground" onClick={() => handleSort('shippingLine')}>
                                          선사 <SortIcon col="shippingLine" />
                                        </button>
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {sorted.map((r: EtaUpdateBatchResultItem, idx: number) => (
                                      <TableRow key={idx} className="text-sm">
                                        <TableCell className="py-2 text-xs text-muted-foreground w-0">
                                          {idx + 1}
                                        </TableCell>
                                        <TableCell className="py-2 font-medium">
                                          {r.contractNo ?? '-'}
                                        </TableCell>
                                        <TableCell className="py-2 font-medium">
                                          {r.bk ?? '-'}
                                        </TableCell>
                                        <TableCell className="py-2 text-xs">
                                          {r.before && r.after ? (() => {
                                            const etaDays = getDateChangeDays(r.before.eta, r.after.eta);
                                            return (
                                              <span>
                                                <span className="text-muted-foreground">{r.before.eta ?? '-'}</span> → <span className="text-foreground">{r.after.eta ?? '-'}</span>
                                                {etaDays !== null && etaDays !== 0 && (
                                                  <span className={etaDays > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                                                    {' '}({etaDays > 0 ? '+' : ''}{etaDays}일)
                                                  </span>
                                                )}
                                              </span>
                                            );
                                          })() : '-'}
                                        </TableCell>
                                        <TableCell className="py-2 text-xs">
                                          {r.before && r.after ? (() => {
                                            const etdDays = getDateChangeDays(r.before.etd, r.after.etd);
                                            return (
                                              <span>
                                                <span className="text-muted-foreground">{r.before.etd ?? '-'}</span> → <span className="text-foreground">{r.after.etd ?? '-'}</span>
                                                {etdDays !== null && etdDays !== 0 && (
                                                  <span className={etdDays > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                                                    {' '}({etdDays > 0 ? '+' : ''}{etdDays}일)
                                                  </span>
                                                )}
                                              </span>
                                            );
                                          })() : '-'}
                                        </TableCell>
                                        <TableCell className="py-2 text-xs">
                                          {r.before && r.after ? (
                                            <span><span className="text-muted-foreground">{r.before.shippingLine ?? '-'}</span> → <span className="text-foreground">{r.after.shippingLine ?? '-'}</span></span>
                                          ) : '-'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            );
                          })()}
                        </div>
                      </>
                    );
                  })()}
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

export default function EtaUpdateHistoryPage() {
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
      <EtaUpdateHistoryPageContent />
    </Suspense>
  );
}
