'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CustomerDeliveryAddress,
  useUpdateCustomerDeliveryAddress,
  useRemoveCustomerDeliveryAddress,
  type Customer,
} from '@/lib/hooks/use-customers';
import {
  resolveDefaultAddressKind,
  formatCustomerListDefaultAddress,
} from '@/lib/customer-default-address-kind';
import { toast } from '@/components/ui/use-toast';
import { Plus, Trash2, Star, Loader2, Pencil, RotateCcw, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { cn } from '@/lib/utils';
import { CustomerDeliveryAddressFormDialog } from '@/components/customers/customer-delivery-address-form-dialog';

function rowAsCustomer(row: CustomerDeliveryAddress): Customer {
  return {
    id: row.customerId,
    region: '',
    addressDetail: row.addressDetail ?? '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: row.addressRoad,
    addressJibun: row.addressJibun,
    addressDefaultType: row.addressDefaultType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function formatPhone(phone?: string | null): string {
  if (!phone?.trim()) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  if (digits.length > 3) return digits.replace(/(\d{3})(\d+)/, '$1-$2');
  return digits;
}

export interface CustomerDeliveryAddressesSectionProps {
  customerId: string;
  addresses: CustomerDeliveryAddress[];
  accordionOpen: boolean;
  onAccordionOpenChange: (open: boolean) => void;
}

export function CustomerDeliveryAddressesSection({
  customerId,
  addresses,
  accordionOpen,
  onAccordionOpenChange,
}: CustomerDeliveryAddressesSectionProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingRow, setEditingRow] = React.useState<CustomerDeliveryAddress | null>(null);
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);

  const activeCount = addresses.filter((a) => a.isActive).length;

  const updateMutation = useUpdateCustomerDeliveryAddress(customerId);
  const removeMutation = useRemoveCustomerDeliveryAddress(customerId);

  const errToast = (title: string, error: unknown) => {
    const msg = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    toast({
      title,
      description: Array.isArray(msg) ? msg.join(', ') : (msg as string) ?? '다시 시도해주세요.',
      variant: 'destructive',
    });
  };

  const handleFormOpenChange = (next: boolean) => {
    setFormOpen(next);
    if (!next) {
      setEditingRow(null);
    }
  };

  const openAdd = () => {
    onAccordionOpenChange(true);
    setEditingRow(null);
    setFormOpen(true);
  };

  const openEdit = (row: CustomerDeliveryAddress) => {
    onAccordionOpenChange(true);
    setEditingRow(row);
    setFormOpen(true);
  };

  const handleSoftDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    try {
      await removeMutation.mutateAsync(id);
      toast({ title: '배송지를 비활성 처리했습니다.' });
    } catch (e) {
      errToast('삭제 실패', e);
    }
  };

  const restore = async (row: CustomerDeliveryAddress) => {
    try {
      await updateMutation.mutateAsync({ addressId: row.id, data: { isActive: true } });
      toast({ title: '배송지를 다시 사용합니다.' });
    } catch (e) {
      errToast('복구 실패', e);
    }
  };

  return (
    <Collapsible open={accordionOpen} onOpenChange={onAccordionOpenChange} className="space-y-2">
      <div className="flex items-stretch gap-1 rounded-md border border-border/80 bg-muted/20">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-l-md px-2 py-2 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50">
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              accordionOpen && 'rotate-90',
            )}
          />
          <span className="text-sm font-semibold text-foreground">배송지</span>
          <span className="text-xs text-muted-foreground">
            (활성 {activeCount}
            {addresses.length !== activeCount ? ` / 전체 ${addresses.length}` : ''})
          </span>
        </CollapsibleTrigger>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto shrink-0 rounded-l-none rounded-r-md px-3"
          onClick={(e) => {
            e.preventDefault();
            openAdd();
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          추가
        </Button>
      </div>

      <CollapsibleContent className="space-y-2 data-[state=closed]:hidden">
        <div className="space-y-2">
          {addresses.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">등록된 배송지가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {addresses.map((row) => {
                const kind = resolveDefaultAddressKind(rowAsCustomer(row));
                const summary = formatCustomerListDefaultAddress(rowAsCustomer(row));
                const detail = row.addressDetail?.trim();

                return (
                  <div
                    key={row.id}
                    className={cn(
                      'flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border p-3',
                      !row.isActive && 'border-dashed bg-muted/20 opacity-80',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex flex-wrap items-center gap-2 pr-1">
                        <span className="text-sm font-medium text-foreground">
                          {row.label?.trim() || '이름 없음'}
                        </span>
                        {!row.isActive ? (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            비활성
                          </Badge>
                        ) : null}
                      </div>
                      <div className="-mr-1 -mt-0.5 flex shrink-0 flex-nowrap items-center gap-0.5">
                        {row.isActive ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="수정"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="비활성"
                              onClick={() => setDeleteTargetId(row.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0"
                            onClick={() => void restore(row)}
                            disabled={updateMutation.isPending}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            복구
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {row.recipientName?.trim() || '-'} · {formatPhone(row.recipientPhone)}
                      </p>
                      <p className="text-sm text-foreground break-words">
                        {row.postalCode?.trim() ? `[${row.postalCode}] ` : ''}
                        {summary}
                      </p>
                      <p className="text-xs leading-snug">
                        <span className="text-muted-foreground">상세주소</span>{' '}
                        <span className="text-sm text-foreground break-words">
                          {detail || '-'}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {row.addressRoad?.trim() ? (
                          <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
                            <span className="inline-flex items-center gap-0.5">
                              도로명
                              {kind === 'ROAD' ? (
                                <span className="inline-flex" title="기본(도로명)">
                                  <Star
                                    className="h-3 w-3 shrink-0 text-amber-600"
                                    aria-label="기본: 도로명"
                                  />
                                </span>
                              ) : null}
                            </span>
                            <span>: {row.addressRoad.trim()}</span>
                          </span>
                        ) : null}
                        {row.addressJibun?.trim() ? (
                          <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
                            <span className="inline-flex items-center gap-0.5">
                              지번
                              {kind === 'JIBUN' ? (
                                <span className="inline-flex" title="기본(지번)">
                                  <Star
                                    className="h-3 w-3 shrink-0 text-amber-600"
                                    aria-label="기본: 지번"
                                  />
                                </span>
                              ) : null}
                            </span>
                            <span>: {row.addressJibun.trim()}</span>
                          </span>
                        ) : null}
                      </div>
                      {row.mallDeliveryAddressId ? (
                        <p className="text-[10px] text-muted-foreground">몰 배송지 ID: {row.mallDeliveryAddressId}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleContent>

      <CustomerDeliveryAddressFormDialog
        customerId={customerId}
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        existingAddresses={addresses}
        editingAddress={editingRow}
      />

      <AlertDialog open={deleteTargetId != null} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>배송지를 비활성할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              목록에서 숨기듯 처리되며, 필요 시 복구할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleSoftDelete()}>비활성</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
