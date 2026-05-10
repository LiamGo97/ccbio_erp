'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Loader2, X, ExternalLink } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';

interface InventoryPendingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerId?: string | null;
  onRefresh?: () => void;
}

interface ContainerDetail {
  id: string;
  containerNo: string;
  salesBales: number | null;
  tradeBales: number | null;
  weight: number | null;
  product: string | null;
  productName: string | null;
  tradeGrade: string | null;
  tradeGradeName: string | null;
  salesGrade: string | null;
  salesGradeName: string | null;
  packingType: string | null;
  packingTypeName: string | null;
  pendingPurchaseCost: number | null;
  confirmedPurchaseCost: number | null;
  inventoryStatus: string | null;
  orderId: string | null;
  contractNo: string | null;
  sequence: number | null;
  bk: string | null;
  bl: string | null;
  etaDate: string | null;
  exportCountry: string | null;
  exportCountryName: string | null;
  exporter: string | null;
  exporterName: string | null;
  destination: string | null;
  destinationName: string | null;
  inboundWarehouse: string | null;
  inboundWarehouseName: string | null;
  inboundIgodate: string | null;
  inboundQuarantineDate: string | null;
  inboundDtDate: string | null;
  returnStatus?: string | null;
  returnStatusName?: string | null;
  notes?: string | null;
  /** BL(주문) 영업 비고 - 컨테이너 비고 없을 때 fallback */
  orderSalesNotes?: string | null;
}

interface SalesHistoryItem {
  id: string;
  salesId: string | null;
  salesNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  status: string | null;
  statusName: string | null;
  containerType: string | null;
  cargoBales: number;
  cargoWeight: number;
  salesUnitPrice: number | null;
  stoCost: number | null;
  dtCost: number | null;
  reservationDate: string | null;
  salesDate: string | null;
  createdAt: string | null;
  registeredBy: number | null;
  registeredByName: string | null;
}

interface ContainerDetailResponse {
  container: ContainerDetail;
  salesHistory: SalesHistoryItem[];
}

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

const formatNumber = (value?: number | null, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

const getInventoryStatusBadgeStyle = (status?: string | null) => {
  if (!status) {
    return { className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300', label: '-' };
  }
  const statusStyles: Record<string, { className: string; label: string }> = {
    AVAILABLE: { className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300', label: '가용' },
    RESERVED: { className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300', label: '예약됨' },
    PARTIALLY_RESERVED: { className: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300', label: '부분 예약' },
    PARTIALLY_SOLD: { className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300', label: '부분 판매중' },
    PARTIALLY_SOLD_COMPLETED: { className: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200', label: '부분 판매완료' },
    SELLING: { className: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200', label: '판매중' },
    SOLD_OUT: { className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300', label: '판매 완료' },
  };
  return statusStyles[status] ?? { className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300', label: status };
};

const getStatusBadgeStyle = (status?: string | null) => {
  if (!status) return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  const normalized = status.trim().toUpperCase();
  if (normalized === 'SALES_ITEM_RESERVED') return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
  if (normalized === 'SALES_ITEM_SOLD') return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
  if (normalized === 'SALES_ITEM_COMPLETED') return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
  if (normalized === 'SALES_ITEM_CANCELLED') return 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300';
  return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
};

export function InventoryPendingDetailDrawer({
  open,
  onOpenChange,
  containerId,
  onRefresh,
}: InventoryPendingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ContainerDetailResponse>({
    queryKey: ['container-detail', containerId],
    queryFn: async () => {
      if (!containerId) throw new Error('컨테이너 ID가 필요합니다.');
      const response = await api.get(`/trade/contracts/containers/${containerId}`);
      return response.data;
    },
    enabled: !!containerId && open,
  });

  const [containerNotesEdit, setContainerNotesEdit] = React.useState<string>('');
  React.useEffect(() => {
    if (!data?.container) return;
    // 입고확정 상세와 동일: 컨테이너 비고 없으면 BL 영업 비고를 기본값으로
    setContainerNotesEdit(data.container.notes ?? data.container.orderSalesNotes ?? '');
  }, [data?.container?.id, data?.container?.notes, data?.container?.orderSalesNotes]);

  const updateContainerNotesMutation = useMutation({
    mutationFn: async (notes: string | null) => {
      if (!containerId) throw new Error('컨테이너 ID가 필요합니다.');
      const response = await api.patch(`/trade/contracts/containers/${containerId}`, {
        notes: notes?.trim() || null,
      });
      return response.data;
    },
    onSuccess: async (_data, notes) => {
      setContainerNotesEdit(notes ?? '');
      toast({ title: '저장됨', description: '컨테이너 비고가 저장되었습니다.' });
      await queryClient.invalidateQueries({ queryKey: ['container-detail', containerId] });
      await queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'containers', 'pending'] });
      onRefresh?.();
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.response?.data?.message || '컨테이너 비고 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{
          width: isMobile ? '100%' : '85%',
          maxWidth: '1200px',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>입고예정 재고 상세정보</DrawerTitle>
              <DrawerDescription>
                컨테이너 정보와 예약된 판매 목록을 확인할 수 있습니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              데이터를 불러올 수 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              {/* 컨테이너 기본 정보 */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">컨테이너 정보</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <InfoRow label="컨테이너 번호" value={data.container.containerNo} />
                  <InfoRow label="계약번호" value={data.container.contractNo} />
                  <InfoRow label="B/K" value={data.container.bk} />
                  <InfoRow label="B/L" value={data.container.bl} />
                  <InfoRow label="상품" value={data.container.productName} />
                  <InfoRow label="등급(무역)" value={data.container.tradeGradeName} />
                  <InfoRow label="등급(영업)" value={data.container.salesGradeName} />
                  <InfoRow label="패킹 타입" value={data.container.packingTypeName} />
                  <InfoRow label="베일(영업)" value={(data.container.salesBales ?? data.container.tradeBales) != null ? formatNumber(Number(data.container.salesBales ?? data.container.tradeBales), 4) : '-'} />
                  <InfoRow label="중량" value={data.container.weight != null ? formatNumber(data.container.weight, 3) + ' 톤' : '-'} />
                  <InfoRow label="예정원가" value={data.container.pendingPurchaseCost != null ? formatNumber(data.container.pendingPurchaseCost, 2) : '-'} />
                  <InfoRow label="확정원가" value={data.container.confirmedPurchaseCost != null ? formatNumber(data.container.confirmedPurchaseCost, 2) : '-'} />
                  <InfoRow
                    label="재고 상태"
                    value={
                      data.container.inventoryStatus ? (
                        <Badge variant="outline" className={getInventoryStatusBadgeStyle(data.container.inventoryStatus).className}>
                          {getInventoryStatusBadgeStyle(data.container.inventoryStatus).label}
                        </Badge>
                      ) : (
                        '-'
                      )
                    }
                  />
                  <InfoRow label="수출국" value={data.container.exportCountryName} />
                  <InfoRow label="수출자" value={data.container.exporterName} />
                  <InfoRow label="목적지" value={data.container.destinationName} />
                  <InfoRow label="ETA" value={formatDate(data.container.etaDate)} />
                  <InfoRow label="창고" value={data.container.inboundWarehouseName} />
                  <InfoRow label="이고날짜" value={formatDate(data.container.inboundIgodate)} />
                  <InfoRow label="검역날짜" value={formatDate(data.container.inboundQuarantineDate)} />
                  <InfoRow label="DT날짜" value={formatDate(data.container.inboundDtDate)} />
                </div>
              </section>

              {/* 컨테이너 비고 - 예약된 판매 목록 위 */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">비고</h3>
                <div className="flex gap-2">
                  <Textarea
                    value={containerNotesEdit}
                    onChange={(e) => setContainerNotesEdit(e.target.value)}
                    placeholder="컨테이너 비고를 입력하세요"
                    rows={2}
                    className="resize-none flex-1"
                    disabled={updateContainerNotesMutation.isPending}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateContainerNotesMutation.mutate(containerNotesEdit.trim() || null)}
                    disabled={updateContainerNotesMutation.isPending}
                  >
                    {updateContainerNotesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '저장'}
                  </Button>
                </div>
              </section>

              {/* 예약된 판매 목록 */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">예약된 판매 목록</h3>
                <p className="text-xs text-muted-foreground">
                  이 컨테이너와 연결된 판매(예약/판매중/완료) 목록입니다.
                </p>
                {data.salesHistory && data.salesHistory.length > 0 ? (
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="w-[60px]">번호</TableHead>
                          <TableHead className="w-[140px]">고객명</TableHead>
                          <TableHead className="w-[100px]">상태</TableHead>
                          <TableHead className="w-[70px]">타입</TableHead>
                          <TableHead className="w-[80px] text-right">베일</TableHead>
                          <TableHead className="w-[80px] text-right">중량</TableHead>
                          <TableHead className="w-[100px] text-right">판매단가</TableHead>
                          <TableHead className="w-[90px]">예약일</TableHead>
                          <TableHead className="w-[90px]">판매일</TableHead>
                          <TableHead className="w-[80px]">등록자</TableHead>
                          <TableHead className="w-[80px]">액션</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.salesHistory.map((item, index) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell>{item.customerName || '-'}</TableCell>
                            <TableCell>
                              {item.status ? (
                                <Badge variant="outline" className={getStatusBadgeStyle(item.status)}>
                                  {item.statusName || item.status}
                                </Badge>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell>
                              {item.containerType === 'CONTAINER' ? '컨테이너' : item.containerType === 'CARGO' ? '카고' : '-'}
                            </TableCell>
                            <TableCell className="text-right">{item.cargoBales > 0 ? formatNumber(item.cargoBales, 0) : '-'}</TableCell>
                            <TableCell className="text-right">{item.cargoWeight > 0 ? formatNumber(item.cargoWeight, 3) + ' 톤' : '-'}</TableCell>
                            <TableCell className="text-right">{item.salesUnitPrice != null ? formatNumber(item.salesUnitPrice, 2) : '-'}</TableCell>
                            <TableCell>{formatDate(item.reservationDate)}</TableCell>
                            <TableCell>{formatDate(item.salesDate)}</TableCell>
                            <TableCell>{item.registeredByName || '-'}</TableCell>
                            <TableCell>
                              {item.salesId ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    onOpenChange(false);
                                    router.push(`/sales?open=${item.salesId}`);
                                  }}
                                >
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  판매 보기
                                </Button>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-8 text-center border border-border rounded-md">
                    예약된 판매가 없습니다.
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        <DrawerFooter className="border-t border-border">
          <div className="flex justify-between gap-2">
            <DrawerClose asChild>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
