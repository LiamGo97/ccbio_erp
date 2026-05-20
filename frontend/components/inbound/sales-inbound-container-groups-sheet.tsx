'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TradeOrder } from '@/lib/hooks/use-trade-orders';
import { Trash2 } from 'lucide-react';

type ContainerRow = { id: string; no: string; product: string };

export interface SalesInboundContainerGroupsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeOrder: TradeOrder | null;
}

function makeGroupId(): string {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 신규 입고대기: BL 내 컨테이너를 그룹으로 나누는 UI만 (로컬 state, API·저장 없음).
 * 열 때마다 기본값은 그룹 1개에 모든 컨테이너.
 */
export function SalesInboundContainerGroupsSheet({
  open,
  onOpenChange,
  tradeOrder,
}: SalesInboundContainerGroupsSheetProps) {
  const [groupIds, setGroupIds] = React.useState<string[]>([]);
  const [assignment, setAssignment] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open || !tradeOrder) return;
    const rows: ContainerRow[] = (tradeOrder.containers ?? [])
      .filter((c) => c?.id)
      .map((c) => ({
        id: String(c.id),
        no: (c.containerNo ?? '').trim() || '-',
        product: (c.product ?? '').trim(),
      }));
    const first = makeGroupId();
    setGroupIds([first]);
    const next: Record<string, string> = {};
    rows.forEach((r) => {
      next[r.id] = first;
    });
    setAssignment(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 주문 id·시트 열림 기준으로만 초기화
  }, [open, tradeOrder?.id]);

  const containerRows: ContainerRow[] = React.useMemo(() => {
    if (!tradeOrder) return [];
    return (tradeOrder.containers ?? [])
      .filter((c) => c?.id)
      .map((c) => ({
        id: String(c.id),
        no: (c.containerNo ?? '').trim() || '-',
        product: (c.product ?? '').trim(),
      }));
  }, [tradeOrder]);

  const addGroup = React.useCallback(() => {
    setGroupIds((prev) => [...prev, makeGroupId()]);
  }, []);

  const mergeAllToOneGroup = React.useCallback(() => {
    const first = makeGroupId();
    setGroupIds([first]);
    setAssignment(() => {
      const next: Record<string, string> = {};
      containerRows.forEach((r) => {
        next[r.id] = first;
      });
      return next;
    });
  }, [containerRows]);

  const setContainerGroup = React.useCallback((containerId: string, groupId: string) => {
    setAssignment((prev) => ({ ...prev, [containerId]: groupId }));
  }, []);

  const removeEmptyGroup = React.useCallback((groupId: string) => {
    const inGroup = containerRows.filter((r) => assignment[r.id] === groupId);
    if (inGroup.length > 0 || groupIds.length <= 1) return;
    setGroupIds((prev) => prev.filter((id) => id !== groupId));
  }, [assignment, containerRows, groupIds.length]);

  const rowsByGroup = React.useMemo(() => {
    const map = new Map<string, ContainerRow[]>();
    groupIds.forEach((gid) => map.set(gid, []));
    for (const row of containerRows) {
      const gid = assignment[row.id] ?? groupIds[0];
      const arr = map.get(gid) ?? [];
      arr.push(row);
      map.set(gid, arr);
    }
    return map;
  }, [groupIds, containerRows, assignment]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader className="border-b pb-4 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>컨테이너 그룹</SheetTitle>
            <Badge variant="secondary" className="text-xs font-normal">
              화면만 · 저장 없음
            </Badge>
          </div>
          <SheetDescription>
            기본은 그룹 1개에 모든 컨테이너입니다. 그룹을 나눈 뒤 컨마다 소속 그룹을 바꿀 수 있습니다. 추후 창고·이고비는
            그룹 단위로 연결할 예정입니다.
          </SheetDescription>
          {tradeOrder ? (
            <div className="mt-3 space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">BL </span>
                {tradeOrder.bl?.trim() || '—'}
                <span className="mx-2 text-border">|</span>
                <span className="font-medium text-foreground">BK </span>
                {tradeOrder.bk?.trim() || '—'}
              </div>
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={addGroup}>
              그룹 추가
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={mergeAllToOneGroup}>
              전부 한 그룹으로
            </Button>
          </div>

          <ScrollArea className="h-[min(480px,calc(100vh-280px))] pr-3">
            <div className="space-y-4 pb-2">
              {groupIds.map((gid, idx) => {
                const inGroup = rowsByGroup.get(gid) ?? [];
                const isEmpty = inGroup.length === 0;
                return (
                  <div key={gid} className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">그룹 {idx + 1}</span>
                        <Badge variant="outline" className="tabular-nums text-xs font-normal">
                          컨 {inGroup.length}건
                        </Badge>
                      </div>
                      {groupIds.length > 1 && isEmpty ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-muted-foreground"
                          onClick={() => removeEmptyGroup(gid)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          빈 그룹 삭제
                        </Button>
                      ) : null}
                    </div>
                    {isEmpty ? (
                      <p className="text-xs text-muted-foreground">이 그룹에 컨테이너가 없습니다. 아래 목록에서 소속을 바꿔 옮기세요.</p>
                    ) : (
                      <div className="space-y-2">
                        {inGroup.map((row) => (
                          <div
                            key={row.id}
                            className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-xs font-medium">{row.no}</div>
                              <div className="truncate text-xs text-muted-foreground" title={row.product}>
                                {row.product || '—'}
                              </div>
                            </div>
                            <div className="w-full shrink-0 sm:w-[140px]" onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={assignment[row.id] ?? gid}
                                onValueChange={(v) => setContainerGroup(row.id, v)}
                              >
                                <SelectTrigger size="sm" className="h-8">
                                  <SelectValue placeholder="그룹" />
                                </SelectTrigger>
                                <SelectContent>
                                  {groupIds.map((g, i) => (
                                    <SelectItem key={g} value={g}>
                                      그룹 {i + 1}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <SheetFooter className="border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
