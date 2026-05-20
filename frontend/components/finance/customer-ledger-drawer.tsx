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
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { useCustomerLedger, CustomerLedgerEntry } from '@/lib/hooks/use-customer-ledger';
import { useCustomer } from '@/lib/hooks/use-customers';
import {
  useReceivable,
  useReceivableCollections,
  useUpdatePaymentTerms,
  useUpdateReceivableNotes,
  type ReceivableCollectionItem,
  type ReceivableDetail,
} from '@/lib/hooks/use-receivables';
import type { CollectionListItem } from '@/lib/hooks/use-collections';
import { CollectionFormDrawer } from '@/components/finance/collection-form-drawer';
import { useUpdateInvoiceIssuedAt } from '@/lib/hooks/use-invoices';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { X, Loader2, Save, Calendar, ExternalLink, Pencil } from 'lucide-react';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { DatePicker } from '@/components/schedules/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { InvoiceDetailDrawer } from '@/components/sales/invoice-detail-drawer';
import { formatSalesManagerDisplay } from '@/lib/format-sales-manager';

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

/** 수금관리(`/finance/receivables/collect/`)의 `CollectionFormDrawer`에 넘기기 위한 매핑 */
function receivableCollectionToListItem(
  receivable: ReceivableDetail,
  c: ReceivableCollectionItem,
  collectionNumber: string | null | undefined,
  customer: { companyName: string; ceo: string; phone: string } | null | undefined,
): CollectionListItem {
  const companyName = customer?.companyName?.trim() || receivable.customerName || null;
  const ceo = customer?.ceo?.trim() || null;
  const customerName = companyName ?? ceo ?? receivable.customerName;
  const phone = customer?.phone?.trim() || null;

  return {
    id: c.id,
    collectionNumber: collectionNumber ?? null,
    receivableId: receivable.id,
    customerId: receivable.customerId,
    customerName,
    companyName,
    ceo,
    phone,
    collectionAmount: c.collectionAmount,
    collectionDate: c.collectionDate,
    collectionMethod: c.collectionMethod,
    notes: c.notes,
    isPrepayment: c.isPrepayment,
    createdAt: c.createdAt,
  };
}

interface CustomerLedgerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string | null;
  receivableId?: string | null;
}

export function CustomerLedgerDrawer({
  open,
  onOpenChange,
  customerId,
  receivableId,
}: CustomerLedgerDrawerProps) {
  const [dateRange, setDateRange] = React.useState<{ start?: Date; end?: Date }>({});
  const [paymentTermsType, setPaymentTermsType] = React.useState<
    'DAYS' | 'THIS_MONTH_DAY' | 'NEXT_MONTH_DAY' | 'THIS_MONTH_END' | 'NEXT_MONTH_END'
  >('DAYS');
  const [paymentTermsValue, setPaymentTermsValue] = React.useState<string>('');

  const { data: customer, isLoading: isLoadingCustomer } = useCustomer(customerId ?? undefined);
  const { data: receivable, isLoading: isLoadingReceivable, refetch: refetchReceivable } = useReceivable(
    receivableId ?? undefined,
  );
  const { data: receivableCollections = [], refetch: refetchReceivableCollections } =
    useReceivableCollections(receivableId ?? undefined);
  const { data: ledger, isLoading: isLoadingLedger, refetch: refetchLedger } = useCustomerLedger(customerId, {
    startDate: dateRange.start?.toISOString().slice(0, 10),
    endDate: dateRange.end?.toISOString().slice(0, 10),
  });
  const updatePaymentTermsMutation = useUpdatePaymentTerms();
  const updateReceivableNotesMutation = useUpdateReceivableNotes();
  const updateIssuedAtMutation = useUpdateInvoiceIssuedAt();
  const [editDateByInvoiceId, setEditDateByInvoiceId] = React.useState<Record<string, string>>({});
  /** 발행일 수정 다이얼로그: 열린 경우 { invoiceId, initialDate, invoiceNumber } */
  const [issuedAtEditTarget, setIssuedAtEditTarget] = React.useState<{
    invoiceId: string;
    initialDate: string;
    invoiceNumber?: string | null;
  } | null>(null);
  /** 거래명세서 상세 Drawer */
  const [invoiceDetailDrawerOpen, setInvoiceDetailDrawerOpen] = React.useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string | null>(null);
  /** 원장에서 수금·선수금 행 → 수금관리와 동일 `CollectionFormDrawer` */
  const [collectionFormOpen, setCollectionFormOpen] = React.useState(false);
  const [collectionFormTarget, setCollectionFormTarget] = React.useState<CollectionListItem | null>(
    null,
  );
  const [receivableNotesDraft, setReceivableNotesDraft] = React.useState('');
  const [paymentTermsEditing, setPaymentTermsEditing] = React.useState(false);
  const [receivableNotesEditing, setReceivableNotesEditing] = React.useState(false);

  React.useEffect(() => {
    if (receivableNotesEditing) return;
    setReceivableNotesDraft(receivable?.notes ?? '');
  }, [receivable?.id, receivable?.notes, receivableNotesEditing]);

  React.useEffect(() => {
    setPaymentTermsEditing(false);
    setReceivableNotesEditing(false);
  }, [receivable?.id]);

  React.useEffect(() => {
    if (!open) {
      setPaymentTermsEditing(false);
      setReceivableNotesEditing(false);
    }
  }, [open]);

  // receivable 데이터가 로드되면 결제조건 설정 (편집 중엔 덮어쓰지 않음)
  React.useEffect(() => {
    if (paymentTermsEditing) return;
    if (receivable) {
      setPaymentTermsType(receivable.paymentTermsType || 'DAYS');
      setPaymentTermsValue(receivable.paymentTermsValue?.toString() || '');
    }
  }, [receivable, paymentTermsEditing]);

  const isLoading = isLoadingCustomer || isLoadingLedger || isLoadingReceivable;
  const isMobile = useIsMobile();

  // 텍스트 선택을 위한 핸들러 (재고 실사 상세 Drawer와 동일)
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
      if (invoiceDetailDrawerOpen) {
        return;
      }
      if (collectionFormOpen) {
        return;
      }
      if (issuedAtEditTarget) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setIssuedAtEditTarget(null);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange, invoiceDetailDrawerOpen, collectionFormOpen, issuedAtEditTarget]);

  const openCollectionEditFromLedger = React.useCallback(
    (entry: CustomerLedgerEntry) => {
      if (entry.type !== 'COLLECTION' || !entry.collectionId || !receivableId || !receivable) return;
      const c = receivableCollections.find((x) => x.id === entry.collectionId);
      if (!c) {
        toast({
          title: '수금 정보를 찾을 수 없습니다',
          description: '잠시 후 다시 시도하거나 채권 상세에서 수정해 주세요.',
          variant: 'destructive',
        });
        return;
      }
      setCollectionFormTarget(
        receivableCollectionToListItem(receivable, c, entry.collectionNumber ?? null, customer ?? undefined),
      );
      setCollectionFormOpen(true);
    },
    [receivableCollections, receivableId, receivable, customer],
  );

  const handleSavePaymentTerms = async () => {
    if (!receivableId) {
      toast({
        title: '오류',
        description: '채권 ID가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updatePaymentTermsMutation.mutateAsync({
        receivableId,
        paymentTermsType,
        paymentTermsValue:
          paymentTermsType === 'THIS_MONTH_END' || paymentTermsType === 'NEXT_MONTH_END'
            ? null
            : paymentTermsValue
              ? Number(paymentTermsValue)
              : null,
      });
      // 채권 정보와 ledger 데이터 모두 다시 불러오기
      await Promise.all([refetchReceivable(), refetchLedger()]);
      setPaymentTermsEditing(false);
      toast({
        title: '저장 완료',
        description: '결제조건이 업데이트되었습니다.',
      });
    } catch (error) {
      toast({
        title: '오류',
        description: '결제조건 업데이트 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const cancelPaymentTermsEdit = () => {
    if (receivable) {
      setPaymentTermsType(receivable.paymentTermsType || 'DAYS');
      setPaymentTermsValue(receivable.paymentTermsValue != null ? String(receivable.paymentTermsValue) : '');
    }
    setPaymentTermsEditing(false);
  };

  const handleSaveReceivableNotes = async () => {
    if (!receivableId) {
      toast({ title: '오류', description: '채권 ID가 없습니다.', variant: 'destructive' });
      return;
    }
    try {
      const trimmed = receivableNotesDraft.trim();
      await updateReceivableNotesMutation.mutateAsync({
        receivableId,
        notes: trimmed.length === 0 ? null : receivableNotesDraft,
      });
      await refetchReceivable();
      setReceivableNotesEditing(false);
      toast({ title: '저장 완료', description: '채권 비고가 저장되었습니다.' });
    } catch {
      toast({
        title: '오류',
        description: '채권 비고 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const cancelReceivableNotesEdit = () => {
    setReceivableNotesDraft(receivable?.notes ?? '');
    setReceivableNotesEditing(false);
  };

  const columns: ColumnDef<CustomerLedgerEntry>[] = React.useMemo(
    () => [
      {
        accessorKey: 'date',
        header: '날짜',
        cell: ({ row }) => formatDate(row.original.date),
        size: 120,
      },
      {
        accessorKey: 'type',
        header: '거래유형',
        cell: ({ row }) => {
          const type = row.original.type;
          if (type === 'INVOICE') {
            return (
              <Badge
                variant="outline"
                className="border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300"
              >
                거래명세서
              </Badge>
            );
          }
          const canOpenCollectionEdit =
            type === 'COLLECTION' &&
            !!row.original.collectionId &&
            !!receivableId &&
            !!receivable;
          const badgeEl = row.original.isPrepayment ? (
            <Badge
              variant="outline"
              className="border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-200"
            >
              선수금
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300"
            >
              수금
            </Badge>
          );
          if (!canOpenCollectionEdit) {
            return badgeEl;
          }
          return (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto gap-1.5 px-1 py-0 font-normal hover:bg-muted/80"
              title="수금 이력 수정(금액·선수금 여부·비고 등)"
              onClick={(e) => {
                e.stopPropagation();
                openCollectionEditFromLedger(row.original);
              }}
            >
              {badgeEl}
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            </Button>
          );
        },
        size: 120,
      },
      {
        accessorKey: 'invoiceNumber',
        header: '거래명세서 번호',
        cell: ({ row }) => {
          const entry = row.original;
          const invoiceNumber = entry.invoiceNumber || '-';
          const invoiceId = entry.type === 'INVOICE' ? entry.invoiceId : null;
          const isClickable = !!invoiceId;
          if (isClickable) {
            return (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 font-normal text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedInvoiceId(invoiceId);
                  setInvoiceDetailDrawerOpen(true);
                }}
              >
                <span className="flex items-center gap-1.5">
                  {invoiceNumber}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </span>
              </Button>
            );
          }
          return <span>{invoiceNumber}</span>;
        },
        size: 150,
      },
      {
        accessorKey: 'paymentTerms',
        header: '결제조건',
        cell: ({ row }) => {
          if (row.original.type !== 'INVOICE') return '-';
          const type = row.original.paymentTermsType;
          const value = row.original.paymentTermsValue;
          
          if (!type) return '-';
          
          const typeLabels: Record<string, string> = {
            DAYS: '일수',
            THIS_MONTH_DAY: '이번달 N일',
            NEXT_MONTH_DAY: '다음달 N일',
            THIS_MONTH_END: '이번달 마지막일',
            NEXT_MONTH_END: '다음달 마지막일',
          };
          
          const label = typeLabels[type] || type;
          
          if (type === 'THIS_MONTH_END' || type === 'NEXT_MONTH_END') {
            return label;
          }
          
          if (value !== null && value !== undefined) {
            return `${label} (${value})`;
          }
          
          return label;
        },
        size: 150,
      },
      {
        accessorKey: 'paymentDueDate',
        header: '결제조건일',
        cell: ({ row }) => {
          if (row.original.type !== 'INVOICE') return '-';
          return formatDate(row.original.paymentDueDate);
        },
        size: 120,
      },
      {
        accessorKey: 'daysElapsed',
        header: '경과일',
        cell: ({ row }) => {
          if (row.original.type !== 'INVOICE' || !row.original.paymentDueDate) return '-';
          
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const dueDate = new Date(row.original.paymentDueDate);
          dueDate.setHours(0, 0, 0, 0);
          
          const daysElapsed = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysElapsed < 0) {
            // 아직 안 지남 (D-DAY)
            return (
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                D{Math.abs(daysElapsed)}
              </span>
            );
          } else if (daysElapsed === 0) {
            return (
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                D-Day
              </span>
            );
          } else {
            // 지난 일수
            return (
              <span className="text-red-600 dark:text-red-400 font-medium">
                +{daysElapsed}일
              </span>
            );
          }
        },
        size: 100,
      },
      {
        accessorKey: 'collectionNumber',
        header: '수금 번호',
        cell: ({ row }) => row.original.collectionNumber || '-',
        size: 150,
      },
      {
        accessorKey: 'amount',
        header: '금액',
        cell: ({ row }) => {
          const amount = row.original.amount;
          const isNegative = amount < 0;
          return (
            <span
              className={
                isNegative
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-blue-600 dark:text-blue-400'
              }
            >
              {isNegative ? '-' : '+'}
              {formatNumber(Math.abs(amount))}
            </span>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'balance',
        header: '잔액',
        cell: ({ row }) => {
          const balance = row.original.balance;
          const isPositive = balance > 0; // 양수는 미수금 (나쁜 것)
          const isNegative = balance < 0; // 음수는 선수금/과납 (좋은 것)
          return (
            <span
              className={
                isPositive
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : isNegative
                    ? 'text-green-600 dark:text-green-400'
                    : ''
              }
            >
              {balance.toLocaleString('ko-KR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'notes',
        header: '비고',
        cell: ({ row }) => row.original.notes || '-',
        size: 200,
      },
      {
        id: 'issuedAtEdit',
        header: '발행일 수정',
        cell: ({ row }) => {
          const entry = row.original;
          if (entry.type !== 'INVOICE' || !entry.invoiceId) return null;
          return (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1"
              onClick={(e) => {
                e.stopPropagation();
                const initial = entry.date?.slice(0, 10) ?? '';
                setEditDateByInvoiceId((prev) => ({ ...prev, [entry.invoiceId!]: initial }));
                setIssuedAtEditTarget({
                  invoiceId: entry.invoiceId!,
                  initialDate: initial,
                  invoiceNumber: entry.invoiceNumber,
                });
              }}
            >
              <Calendar className="h-3.5 w-3.5" />
              수정
            </Button>
          );
        },
        size: 100,
      },
    ],
    [receivableId, receivable, openCollectionEditFromLedger],
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="flex h-full flex-col"
        style={{
          width: isMobile ? '100%' : '85%',
          maxWidth: '1200px',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>
                거래처관리대장 - {customer?.companyName || customer?.ceo || '고객'}
              </DrawerTitle>
              <DrawerDescription>
                거래명세서와 수금을 날짜순으로 표시하고 잔액을 계산합니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onOpenChange(false)}
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {customerId && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">고객 정보</h3>
                {isLoadingCustomer && !customer ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    불러오는 중…
                  </div>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-3 text-sm">
                    <div className="min-w-0 space-y-0.5">
                      <dt className="text-xs font-medium text-muted-foreground">회사명</dt>
                      <dd className="text-foreground break-words">
                        {customer?.companyName?.trim() || '—'}
                      </dd>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <dt className="text-xs font-medium text-muted-foreground">대표자</dt>
                      <dd className="text-foreground break-words">{customer?.ceo?.trim() || '—'}</dd>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <dt className="text-xs font-medium text-muted-foreground">연락처</dt>
                      <dd className="text-foreground break-words">{customer?.phone?.trim() || '—'}</dd>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <dt className="text-xs font-medium text-muted-foreground">영업 담당자</dt>
                      <dd className="text-foreground break-words">
                        {formatSalesManagerDisplay(customer?.salesManagerName, customer?.salesManagerEmail)}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            )}

            {/* 결제조건 설정: 제목+저장 / 타입·일수는 xl에서 4칸 중 2칸 비율 */}
            {receivable && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">결제조건 설정</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {paymentTermsEditing ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelPaymentTermsEdit}
                          disabled={updatePaymentTermsMutation.isPending}
                        >
                          <X className="h-3.5 w-3.5 mr-1.5" />
                          취소
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSavePaymentTerms}
                          disabled={updatePaymentTermsMutation.isPending}
                          size="sm"
                        >
                          {updatePaymentTermsMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          저장
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setPaymentTermsEditing(true)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        수정
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:items-stretch">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="payment-terms-type" className="text-xs text-muted-foreground">
                      타입
                    </Label>
                    <Select
                      value={paymentTermsType}
                      disabled={!paymentTermsEditing || updatePaymentTermsMutation.isPending}
                      onValueChange={(value: any) => {
                        setPaymentTermsType(value);
                        if (value === 'THIS_MONTH_END' || value === 'NEXT_MONTH_END') {
                          setPaymentTermsValue('');
                        }
                      }}
                    >
                      <SelectTrigger
                        id="payment-terms-type"
                        className="h-8 w-full text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAYS">일수</SelectItem>
                        <SelectItem value="THIS_MONTH_DAY">이번달 N일</SelectItem>
                        <SelectItem value="NEXT_MONTH_DAY">다음달 N일</SelectItem>
                        <SelectItem value="THIS_MONTH_END">이번달 마지막일</SelectItem>
                        <SelectItem value="NEXT_MONTH_END">다음달 마지막일</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="payment-terms-value" className="text-xs text-muted-foreground">
                      {paymentTermsType === 'DAYS'
                        ? '일수'
                        : paymentTermsType === 'THIS_MONTH_DAY' || paymentTermsType === 'NEXT_MONTH_DAY'
                          ? '일자'
                          : '값'}
                    </Label>
                    <Input
                      id="payment-terms-value"
                      type="number"
                      value={paymentTermsValue}
                      onChange={(e) => setPaymentTermsValue(e.target.value)}
                      disabled={
                        !paymentTermsEditing ||
                        updatePaymentTermsMutation.isPending ||
                        paymentTermsType === 'THIS_MONTH_END' ||
                        paymentTermsType === 'NEXT_MONTH_END'
                      }
                      className="h-8 text-sm"
                      placeholder={
                        paymentTermsType === 'DAYS'
                          ? '7 (기본값)'
                          : paymentTermsType === 'THIS_MONTH_DAY' || paymentTermsType === 'NEXT_MONTH_DAY'
                            ? '10'
                            : ''
                      }
                      min={paymentTermsType === 'DAYS' ? 1 : paymentTermsType.includes('DAY') ? 1 : undefined}
                      max={paymentTermsType.includes('DAY') ? 31 : undefined}
                    />
                  </div>
                </div>
                {receivable.lastPaymentDueDate && (
                  <div className="text-sm text-muted-foreground">
                    마지막 결제조건일: {formatDate(receivable.lastPaymentDueDate)}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              <DateRangePicker
                startDate={dateRange.start}
                endDate={dateRange.end}
                onChange={(start, end) => {
                  setDateRange({ start, end });
                }}
              />
            </div>

            {ledger && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border bg-card p-4">
                  <div className="text-sm text-muted-foreground">총 판매액</div>
                  <div className="text-2xl font-semibold mt-1">{formatNumber(ledger.totalSales)}</div>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <div className="text-sm text-muted-foreground">총 수금액</div>
                  <div className="text-2xl font-semibold mt-1">
                    {formatNumber(ledger.totalCollected)}
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <div className="text-sm text-muted-foreground">현재 잔액</div>
                  <div
                    className={`text-2xl font-semibold mt-1 ${
                      ledger.currentBalance > 0
                        ? 'text-red-600 dark:text-red-400'
                        : ledger.currentBalance < 0
                          ? 'text-green-600 dark:text-green-400'
                          : ''
                    }`}
                  >
                    {ledger.currentBalance.toLocaleString('ko-KR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={ledger?.entries ?? []}
                total={(ledger?.entries ?? []).length}
                totalPages={1}
                isLoading={isLoading}
                showRowNumber
                rowClassName="h-10"
              />
            )}

            {receivable && receivableId && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">채권 비고</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {receivableNotesEditing ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelReceivableNotesEdit}
                          disabled={updateReceivableNotesMutation.isPending}
                        >
                          <X className="h-3.5 w-3.5 mr-1.5" />
                          취소
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSaveReceivableNotes}
                          disabled={updateReceivableNotesMutation.isPending}
                          size="sm"
                        >
                          {updateReceivableNotesMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          저장
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setReceivableNotesEditing(true)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        수정
                      </Button>
                    )}
                  </div>
                </div>
                <Textarea
                  value={receivableNotesDraft}
                  onChange={(e) => setReceivableNotesDraft(e.target.value)}
                  readOnly={!receivableNotesEditing || updateReceivableNotesMutation.isPending}
                  placeholder={
                    receivableNotesEditing
                      ? '채권 관련 메모를 입력한 뒤 저장하세요.'
                      : '「수정」을 누른 뒤 입력할 수 있습니다.'
                  }
                  rows={5}
                  className="min-h-[120px] resize-y text-sm read-only:bg-muted/40 read-only:cursor-default"
                />
              </div>
            )}
          </div>
        </div>

        <DrawerFooter className="shrink-0 border-t border-border">
          <div className="flex justify-end gap-2 w-full">
            <DrawerClose asChild>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>

      {/* 발행일 수정 다이얼로그 (Drawer 안에서는 Popover가 동작하지 않아 Dialog 사용) */}
      <Dialog
        open={!!issuedAtEditTarget}
        onOpenChange={(open) => {
          if (!open) setIssuedAtEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>거래명세서 발행일 수정</DialogTitle>
            <DialogDescription>
              {issuedAtEditTarget?.invoiceNumber
                ? `거래명세서 번호: ${issuedAtEditTarget.invoiceNumber}`
                : '발행일을 변경한 뒤 저장하세요.'}
            </DialogDescription>
          </DialogHeader>
          {issuedAtEditTarget && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>발행일</Label>
                <DatePicker
                  value={editDateByInvoiceId[issuedAtEditTarget.invoiceId] || issuedAtEditTarget.initialDate || undefined}
                  onChange={(value) =>
                    setEditDateByInvoiceId((prev) => ({
                      ...prev,
                      [issuedAtEditTarget.invoiceId]: value ?? issuedAtEditTarget.initialDate,
                    }))
                  }
                  placeholder="날짜 선택"
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIssuedAtEditTarget(null)}
                >
                  취소
                </Button>
                <Button
                  disabled={
                    updateIssuedAtMutation.isPending ||
                    !(editDateByInvoiceId[issuedAtEditTarget.invoiceId] ?? issuedAtEditTarget.initialDate)
                  }
                  onClick={async () => {
                    const dateValue =
                      editDateByInvoiceId[issuedAtEditTarget.invoiceId] ?? issuedAtEditTarget.initialDate;
                    if (!dateValue) return;
                    try {
                      await updateIssuedAtMutation.mutateAsync({
                        invoiceId: issuedAtEditTarget.invoiceId,
                        issuedAt: dateValue,
                      });
                      await Promise.all([refetchLedger(), refetchReceivable()]);
                      setIssuedAtEditTarget(null);
                    } catch {
                      toast({
                        title: '오류',
                        description: '발행일 수정 중 오류가 발생했습니다.',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  {updateIssuedAtMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  저장
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <InvoiceDetailDrawer
        open={invoiceDetailDrawerOpen}
        onOpenChange={(open) => {
          setInvoiceDetailDrawerOpen(open);
          if (!open) setSelectedInvoiceId(null);
        }}
        invoiceId={selectedInvoiceId}
        title="거래명세서 상세정보"
        description="발행된 거래명세서 정보를 확인합니다."
        onSuccess={() => {
          refetchLedger();
          refetchReceivable();
        }}
      />

      <CollectionFormDrawer
        open={collectionFormOpen}
        onOpenChange={(next) => {
          setCollectionFormOpen(next);
          if (!next) setCollectionFormTarget(null);
        }}
        collection={collectionFormTarget}
        onSuccess={async () => {
          await Promise.all([
            refetchLedger(),
            refetchReceivable(),
            refetchReceivableCollections(),
          ]);
        }}
      />
    </Drawer>
  );
}
