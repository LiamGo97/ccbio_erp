'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InventoryConfirmedDetailDrawer } from '@/components/inventory/inventory-confirmed-detail-drawer';

export interface BLRowForDetail {
  orderId: string;
  productName: string | null;
  bl: string | null;
  availableKg: number;
  totalKg: number;
  containerCount: number;
  firstContainerId: string;
}

interface FinanceInventoryConfirmedDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blRow?: BLRowForDetail | null;
  onInventoryAdjustmentSuccess?: () => void;
}

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) + ' kg';
};

export function FinanceInventoryConfirmedDetailDrawer({
  open,
  onOpenChange,
  blRow,
  onInventoryAdjustmentSuccess,
}: FinanceInventoryConfirmedDetailDrawerProps) {
  const isMobile = useIsMobile();
  const [containerDetailOpen, setContainerDetailOpen] = React.useState(false);
  const [selectedContainerId, setSelectedContainerId] = React.useState<string | null>(null);

  const { data: containers = [], isLoading } = useQuery({
    queryKey: ['trade-contracts', 'containers', 'by-bl', blRow?.bl ?? ''],
    queryFn: async () => {
      if (!blRow?.bl?.trim()) return [];
      const response = await api.get('/trade/contracts/containers', {
        params: { inboundStatus: 'CONFIRMED', bls: blRow.bl.trim() },
      });
      return (response.data ?? []) as Array<{
        id: string;
        containerNo: string;
        sequence?: number | null;
        availableBales?: number | null;
        availableWeight?: number | null;
        weight?: number | null;
        salesBales?: number | null;
        tradeBales?: number | null;
        bales?: number | null;
      }>;
    },
    enabled: !!blRow?.bl?.trim() && open,
  });

  const handleContainerRowClick = (containerId: string) => {
    setSelectedContainerId(containerId);
    setContainerDetailOpen(true);
  };

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
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (containerDetailOpen) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange, containerDetailOpen]);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="h-full"
          style={{
            width: isMobile ? '100%' : '85%',
            maxWidth: '900px',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>BL 상세 - {blRow?.bl ?? '-'}</DrawerTitle>
                <DrawerDescription>
                  BL 단위 재고 요약 및 해당 BL의 컨테이너 목록입니다.
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {!blRow ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  행을 선택해주세요.
                </div>
              ) : (
                <>
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">BL 요약</h3>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">상품명</span>
                        <span className="text-sm font-medium">{blRow.productName || '-'}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">BL</span>
                        <span className="text-sm font-medium">{blRow.bl || '-'}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">재고중량</span>
                        <span className="text-sm font-medium">{formatNumber(blRow.availableKg)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">총중량</span>
                        <span className="text-sm font-medium">{formatNumber(blRow.totalKg)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">컨테이너 수</span>
                        <span className="text-sm font-medium">{blRow.containerCount}대</span>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">컨테이너 목록</h3>
                    <p className="text-xs text-muted-foreground">
                      컨테이너 행을 클릭하면 상세(재고 조정 등)를 볼 수 있습니다.
                    </p>
                    {isLoading ? (
                      <div className="flex items-center justify-center h-20">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : containers.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        컨테이너가 없습니다.
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="w-[100px]">컨테이너번호</TableHead>
                              <TableHead className="text-right">베일</TableHead>
                              <TableHead className="text-right">중량(kg)</TableHead>
                              <TableHead className="text-right">재고중량(kg)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {containers.map((c) => {
                              const availBales = c.availableBales ?? c.bales ?? c.salesBales ?? c.tradeBales ?? 0;
                              const weightTons = c.weight ?? 0;
                              const availWeightTons = c.availableWeight ?? weightTons;
                              const availKg = availWeightTons * 1000;
                              return (
                                <TableRow
                                  key={c.id}
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleContainerRowClick(c.id)}
                                >
                                  <TableCell className="font-medium">
                                    {c.containerNo}
                                    {c.sequence != null && c.sequence > 0 ? ` [${c.sequence}]` : ''}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {availBales.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {(weightTons * 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {availKg.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      <InventoryConfirmedDetailDrawer
        open={containerDetailOpen}
        onOpenChange={(o) => {
          setContainerDetailOpen(o);
          if (!o) setSelectedContainerId(null);
        }}
        containerId={selectedContainerId}
        onInventoryAdjustmentSuccess={onInventoryAdjustmentSuccess}
      />
    </>
  );
}
