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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, X, DollarSign, FileText, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useReceivable, useReceivableCollections, useDeleteCollection, ReceivableCollectionItem } from '@/lib/hooks/use-receivables';
import { useInvoice, useUpdateInvoiceIssuedAt } from '@/lib/hooks/use-invoices';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useRouter } from 'next/navigation';
import { ReceivableCollectionDialog } from './receivable-collection-dialog';
import { ReceivableCollectionEditDialog } from './receivable-collection-edit-dialog';
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
import { toast } from '@/components/ui/use-toast';

interface ReceivableDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivableId?: string | null;
  onSuccess?: () => void;
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

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (num % 1 === 0) return num.toLocaleString('ko-KR');
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function ReceivableDetailDrawer({
  open,
  onOpenChange,
  receivableId,
  onSuccess,
}: ReceivableDetailDrawerProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { data, isLoading, refetch } = useReceivable(receivableId ?? undefined);
  const { data: collections = [], isLoading: isLoadingCollections } = useReceivableCollections(
    receivableId ?? undefined,
  );
  const { data: statusCodes } = useCodesByCategory('RECEIVABLE_STATUS');
  const { data: warningCodes } = useCodesByCategory('RECEIVABLE_WARNING_STATUS');
  const [collectionDialogOpen, setCollectionDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [selectedCollection, setSelectedCollection] = React.useState<ReceivableCollectionItem | null>(null);
  const deleteMutation = useDeleteCollection();

  const invoiceId = data?.invoiceId ?? undefined;
  const { data: invoice, refetch: refetchInvoice } = useInvoice(invoiceId);
  const updateIssuedAtMutation = useUpdateInvoiceIssuedAt();
  const [issuedAtEdit, setIssuedAtEdit] = React.useState<string>('');
  const issuedAtDisplay = invoice?.issuedAt
    ? new Date(invoice.issuedAt).toISOString().slice(0, 10)
    : '';
  React.useEffect(() => {
    if (issuedAtDisplay) setIssuedAtEdit(issuedAtDisplay);
  }, [issuedAtDisplay]);

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && receivableId) {
      refetch();
    }
  }, [open, receivableId, refetch]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setDeleteDialogOpen(false);
        return;
      }
      if (editDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setEditDialogOpen(false);
        setSelectedCollection(null);
        return;
      }
      if (collectionDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setCollectionDialogOpen(false);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    open,
    onOpenChange,
    deleteDialogOpen,
    editDialogOpen,
    collectionDialogOpen,
  ]);

  const getStatusBadge = (status?: string | null) => {
    if (!status) {
      return (
        <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
          -
        </Badge>
      );
    }

    const code = statusCodes?.find((c) => c.value === status);
    const statusName = code?.name ?? status;
    const normalizedStatus = status.trim().toUpperCase();

    if (normalizedStatus === 'OUTSTANDING') {
      return (
        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300">
          {statusName}
        </Badge>
      );
    }
    if (normalizedStatus === 'PARTIAL') {
      return (
        <Badge variant="outline" className="border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300">
          {statusName}
        </Badge>
      );
    }
    if (normalizedStatus === 'COMPLETED') {
      return (
        <Badge variant="outline" className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300">
          {statusName}
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
        {statusName}
      </Badge>
    );
  };

  const getWarningBadge = (warningStatus?: string | null) => {
    if (!warningStatus) return null;

    const code = warningCodes?.find((c) => c.value === warningStatus);
    const warningName = code?.name ?? warningStatus;
    const normalizedWarning = warningStatus.trim().toUpperCase();

    if (normalizedWarning.startsWith('WARNING_1ST')) {
      return (
        <Badge variant="outline" className="border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300">
          {warningName}
        </Badge>
      );
    }
    if (normalizedWarning.startsWith('WARNING_2ND')) {
      return (
        <Badge variant="outline" className="border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300">
          {warningName}
        </Badge>
      );
    }
    if (normalizedWarning.startsWith('WARNING_3RD')) {
      return (
        <Badge variant="outline" className="border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300">
          {warningName}
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
        {warningName}
      </Badge>
    );
  };

  const handleInvoiceClick = () => {
    if (data?.invoiceId) {
      router.push(`/sales/invoice-management?invoiceId=${data.invoiceId}`);
      onOpenChange(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{ width: isMobile ? '100%' : '85%', maxWidth: '1200px' }}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>채권 상세정보</DrawerTitle>
              <DrawerDescription>
                채권 정보를 확인하고 수금 처리를 할 수 있습니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !data ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                데이터를 불러올 수 없습니다.
              </div>
            ) : (
              <>
                {/* 채권 정보 섹션 */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">채권 정보</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">고객명</span>
                      <span className="text-sm font-medium">{data.customerName || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">거래명세서 번호</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{data.invoiceNumber || '-'}</span>
                        {data.invoiceId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            onClick={handleInvoiceClick}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">발생일</span>
                      <span className="text-sm font-medium">{formatDate(data.occurredDate)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">상태</span>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(data.status)}
                        {getWarningBadge(data.warningStatus)}
                      </div>
                    </div>
                  </div>
                  {data.invoiceId && invoice && (
                    <div className="mt-4 p-3 rounded-lg border border-dashed bg-muted/30">
                      <span className="text-xs text-muted-foreground block mb-2">거래명세서 발행일 수정 (임시)</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={issuedAtEdit}
                          onChange={(e) => setIssuedAtEdit(e.target.value)}
                          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={updateIssuedAtMutation.isPending || issuedAtEdit === issuedAtDisplay || !issuedAtEdit}
                          onClick={async () => {
                            if (!data.invoiceId || !issuedAtEdit) return;
                            try {
                              await updateIssuedAtMutation.mutateAsync({
                                invoiceId: data.invoiceId,
                                issuedAt: issuedAtEdit,
                              });
                              refetchInvoice();
                              refetch();
                            } catch {
                              // toast handled in mutation
                            }
                          }}
                        >
                          {updateIssuedAtMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            '저장'
                          )}
                        </Button>
                        {issuedAtDisplay && (
                          <span className="text-xs text-muted-foreground">
                            현재: {formatDate(invoice?.issuedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                {/* 금액 정보 섹션 */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">금액 정보</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">채권 금액</span>
                      <span className="text-sm font-medium">{formatNumber(data.receivableAmount)}원</span>
                    </div>
                    {/* 선입금 정보는 항상 표시 (0이 아니거나 null이 아닌 경우) */}
                    {data.prepaymentDeducted != null && (
                      <>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">선수금 차감액</span>
                          <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                            {formatNumber(data.prepaymentDeducted)}원
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">
                            {data.outstandingAmount < 0 ? '초과 입금액 (환불)' : '미수금액'}
                          </span>
                          <span className={`text-sm font-medium ${
                            data.outstandingAmount < 0 
                              ? 'text-blue-600 dark:text-blue-400' 
                              : ''
                          }`}>
                            {formatNumber(data.outstandingAmount)}원
                          </span>
                        </div>
                      </>
                    )}
                    {/* 선입금이 없으면 채권 금액 다음에 바로 수금액 표시 */}
                    {data.prepaymentDeducted == null && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">미수금액</span>
                        <span className="text-sm font-medium">{formatNumber(data.outstandingAmount)}원</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">수금액</span>
                      <span className="text-sm font-medium">{formatNumber(data.collectedAmount)}원</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">
                        {data.balance < 0 ? '초과 입금액 (환불)' : '잔액'}
                      </span>
                      <span className={`text-sm font-semibold ${
                        data.balance < 0 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-primary'
                      }`}>
                        {formatNumber(data.balance)}원
                      </span>
                    </div>
                  </div>
                </section>

                {/* 수금 이력 섹션 */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">수금 이력</h3>
                  {isLoadingCollections ? (
                    <div className="flex items-center justify-center h-20">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : collections.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      수금 이력이 없습니다.
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">수금일</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">수금 금액</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">수금 방법</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground">선수금</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">비고</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {collections.map((collection) => (
                            <tr key={collection.id} className="border-t">
                              <td className="px-4 py-2">{formatDate(collection.collectionDate)}</td>
                              <td className="px-4 py-2 text-right font-medium">
                                {formatNumber(collection.collectionAmount)}원
                              </td>
                              <td className="px-4 py-2">{collection.collectionMethod || '-'}</td>
                              <td className="px-4 py-2 text-center text-sm">
                                {collection.isPrepayment === true ? (
                                  <span className="text-amber-700 dark:text-amber-400">Y</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-muted-foreground">{collection.notes || '-'}</td>
                              <td className="px-4 py-2">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => {
                                      setSelectedCollection(collection);
                                      setEditDialogOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      setSelectedCollection(collection);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* 비고 섹션 */}
                {data.notes && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">비고</h3>
                    <p className="text-sm text-muted-foreground">{data.notes}</p>
                  </section>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
            {/* 수금 처리 버튼: 잔액이 0이 아닐 때만 표시 (음수는 초과 입금) */}
            {data && data.balance !== 0 && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => {
                  setCollectionDialogOpen(true);
                }}
                className={data.balance > 0 
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
                }
              >
                <DollarSign className="mr-1.5 h-4 w-4" />
                {data.balance > 0 ? '수금 처리' : '환불 처리'}
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>

      {/* 수금 처리 다이얼로그 */}
      {data && (
        <ReceivableCollectionDialog
          open={collectionDialogOpen}
          onOpenChange={(open) => {
            setCollectionDialogOpen(open);
            if (!open) {
              refetch();
            }
          }}
          receivable={data}
          onSuccess={async () => {
            await refetch();
            if (onSuccess) {
              onSuccess();
            }
          }}
        />
      )}

      {/* 수금 이력 수정 다이얼로그 */}
      {data && selectedCollection && (
        <ReceivableCollectionEditDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              setSelectedCollection(null);
              refetch();
            }
          }}
          receivableId={data.id}
          collection={collections.find((c) => c.id === selectedCollection.id) || null}
          maxAmount={data.balance}
          onSuccess={async () => {
            await refetch();
            if (onSuccess) {
              onSuccess();
            }
          }}
        />
      )}

      {/* 수금 이력 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수금 이력 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 수금 이력을 삭제하시겠습니까?
              <br />
              삭제 시 수금 금액({selectedCollection ? formatNumber(selectedCollection.collectionAmount) : ''}원)이 채권 잔액에 다시 추가됩니다.
              <br />
              <span className="text-destructive font-medium">이 작업은 되돌릴 수 없습니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!selectedCollection || !receivableId) return;

                try {
                  await deleteMutation.mutateAsync({
                    receivableId,
                    collectionId: selectedCollection.id,
                  });

                  toast({
                    title: '수금 이력 삭제 완료',
                    description: '수금 이력이 성공적으로 삭제되었습니다.',
                  });

                  setDeleteDialogOpen(false);
                  setSelectedCollection(null);
                  await refetch();

                  if (onSuccess) {
                    onSuccess();
                  }
                } catch (error: any) {
                  console.error('수금 이력 삭제 실패:', error);
                  toast({
                    title: '수금 이력 삭제 실패',
                    description: error?.response?.data?.message || '수금 이력 삭제 중 오류가 발생했습니다.',
                    variant: 'destructive',
                  });
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Drawer>
  );
}
