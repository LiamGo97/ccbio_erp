'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CustomerContact,
  useAddCustomerContact,
  useUpdateCustomerContact,
  useRemoveCustomerContact,
} from '@/lib/hooks/use-customers';
import { toast } from '@/components/ui/use-toast';
import { Plus, Trash2, Loader2, Pencil, ChevronRight, X, Save } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatKoreanPhoneInput } from '@/lib/format-korean-phone-input';
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

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  if (digits.length > 3) return digits.replace(/(\d{3})(\d+)/, '$1-$2');
  return digits;
};

export interface CustomerContactsSectionProps {
  customerId: string;
  contacts: CustomerContact[];
  accordionOpen: boolean;
  onAccordionOpenChange: (open: boolean) => void;
}

export function CustomerContactsSection({
  customerId,
  contacts,
  accordionOpen,
  onAccordionOpenChange,
}: CustomerContactsSectionProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [relationship, setRelationship] = React.useState('');
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);

  const addMutation = useAddCustomerContact(customerId);
  const updateMutation = useUpdateCustomerContact(customerId);
  const removeMutation = useRemoveCustomerContact(customerId);

  const resetForm = React.useCallback(() => {
    setEditingId(null);
    setName('');
    setPhone('');
    setRelationship('');
  }, []);

  const openAdd = () => {
    onAccordionOpenChange(true);
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (row: CustomerContact) => {
    onAccordionOpenChange(true);
    setEditingId(row.id);
    setName(row.name?.trim() ?? '');
    setPhone(formatKoreanPhoneInput(row.phone ?? ''));
    setRelationship(row.relationship?.trim() ?? '');
    setFormOpen(true);
  };

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open);
    if (!open) resetForm();
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: '이름을 입력해주세요.', variant: 'destructive' });
      return;
    }
    try {
      const payload = {
        name: trimmedName,
        phone: phone.trim() ? phone.trim() : null,
        relationship: relationship.trim() ? relationship.trim() : null,
      };
      if (editingId) {
        await updateMutation.mutateAsync({ contactId: editingId, data: payload });
        toast({ title: '수정되었습니다.' });
      } else {
        await addMutation.mutateAsync(payload);
        toast({ title: '연락처가 추가되었습니다.' });
      }
      setFormOpen(false);
      resetForm();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({
        title: editingId ? '수정 실패' : '추가 실패',
        description: Array.isArray(msg) ? msg.join(', ') : msg ?? '다시 시도해주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    const idToDelete = deleteTargetId;
    setDeleteTargetId(null);
    try {
      await removeMutation.mutateAsync(idToDelete);
      toast({ title: '삭제되었습니다.' });
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({
        title: '삭제 실패',
        description: Array.isArray(msg) ? msg.join(', ') : msg ?? '다시 시도해주세요.',
        variant: 'destructive',
      });
    }
  };

  const saving = addMutation.isPending || updateMutation.isPending;

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
          <span className="text-sm font-semibold text-foreground">연락처·관계</span>
          <span className="text-xs text-muted-foreground">({contacts.length})</span>
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
        <p className="text-xs text-muted-foreground">
          추가 연락처입니다. 대표자·연락처는 기본 정보에서 확인·수정합니다.
        </p>
        <div className="space-y-2">
          {contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">등록된 연락처가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {contacts.map((row) => (
                <div
                  key={row.id}
                  className="flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border border-border/80 bg-card/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 pr-1">
                      <span className="text-sm font-medium text-foreground">{row.name}</span>
                      {row.relationship?.trim() ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.relationship.trim()}
                        </p>
                      ) : null}
                    </div>
                    <div className="-mr-1 -mt-0.5 flex shrink-0 flex-nowrap items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="수정"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTargetId(row.id)}
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatPhone(row.phone)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>

      <Dialog open={formOpen} onOpenChange={handleFormOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? '연락처 수정' : '연락처 추가'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">이름</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="필수"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">전화번호</Label>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(formatKoreanPhoneInput(e.target.value))}
                placeholder="010-1234-5678"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">관계</Label>
              <Input
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="예: 배우자, 담당자"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleFormOpenChange(false)}>
              <X className="mr-1.5 h-4 w-4" />
              취소
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-4 w-4" />
                  저장
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>연락처를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>삭제된 항목은 복구할 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
