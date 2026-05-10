'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CustomerStatementName,
  useAddStatementName,
  useUpdateStatementName,
  useRemoveStatementName,
} from '@/lib/hooks/use-customers';
import { toast } from '@/components/ui/use-toast';
import { Plus, Trash2, Star, Loader2, Pencil, ChevronRight, X, Save } from 'lucide-react';
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
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits;
};

export interface CustomerStatementNamesSectionProps {
  customerId: string;
  statementNames: CustomerStatementName[];
  /** 배타적 아코디언: 부모에서 `statement` 패널 열림 여부 */
  accordionOpen: boolean;
  onAccordionOpenChange: (open: boolean) => void;
}

export function CustomerStatementNamesSection({
  customerId,
  statementNames,
  accordionOpen,
  onAccordionOpenChange,
}: CustomerStatementNamesSectionProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [companyName, setCompanyName] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [contactPhone, setContactPhone] = React.useState('');
  const [isDefault, setIsDefault] = React.useState(false);
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);

  const addMutation = useAddStatementName(customerId);
  const updateMutation = useUpdateStatementName(customerId);
  const removeMutation = useRemoveStatementName(customerId);

  const resetForm = React.useCallback(() => {
    setEditingId(null);
    setCompanyName('');
    setDisplayName('');
    setContactPhone('');
    setIsDefault(false);
  }, []);

  const openAdd = () => {
    onAccordionOpenChange(true);
    resetForm();
    setIsDefault(statementNames.length === 0);
    setFormOpen(true);
  };

  const openEdit = (sn: CustomerStatementName) => {
    onAccordionOpenChange(true);
    setEditingId(sn.id);
    setCompanyName(sn.companyName ?? '');
    setDisplayName(sn.displayName);
    setContactPhone(formatKoreanPhoneInput(sn.contactPhone ?? ''));
    setIsDefault(sn.isDefault);
    setFormOpen(true);
  };

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open);
    if (!open) resetForm();
  };

  const handleSave = async () => {
    const name = displayName.trim();
    if (!name) {
      toast({ title: '발행용 이름을 입력해주세요.', variant: 'destructive' });
      return;
    }
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          statementNameId: editingId,
          data: {
            companyName: companyName.trim() || undefined,
            displayName: name,
            contactPhone: contactPhone.trim() || undefined,
            isDefault,
          },
        });
        toast({ title: '수정되었습니다.' });
      } else {
        await addMutation.mutateAsync({
          companyName: companyName.trim() || undefined,
          displayName: name,
          contactPhone: contactPhone.trim() || undefined,
          isDefault: isDefault || statementNames.length === 0,
        });
        toast({ title: '발행용 이름이 추가되었습니다.' });
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

  const setAsDefault = async (sn: CustomerStatementName) => {
    if (sn.isDefault) return;
    try {
      await updateMutation.mutateAsync({ statementNameId: sn.id, data: { isDefault: true } });
      toast({ title: '기본으로 설정되었습니다.' });
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({
        title: '설정 실패',
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
          <span className="text-sm font-semibold text-foreground">거래명세서 발행용</span>
          <span className="text-xs text-muted-foreground">({statementNames.length})</span>
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
          {statementNames.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">등록된 항목이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {statementNames.map((sn) => (
                <div
                  key={sn.id}
                  className="flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border border-border/80 bg-card/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-2 pr-1">
                      <span className="text-sm font-medium text-foreground">{sn.displayName}</span>
                      {sn.isDefault ? (
                        <span className="inline-flex items-center" title="기본으로 사용">
                          <Star
                            className="h-4 w-4 shrink-0 fill-amber-400 text-amber-600"
                            aria-label="기본으로 사용"
                          />
                        </span>
                      ) : null}
                    </div>
                    <div className="-mr-1 -mt-0.5 flex shrink-0 flex-nowrap items-center gap-0.5">
                      {!sn.isDefault ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="기본으로 설정"
                          onClick={() => void setAsDefault(sn)}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="수정"
                        onClick={() => openEdit(sn)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive disabled:opacity-40"
                        onClick={() => setDeleteTargetId(sn.id)}
                        disabled={statementNames.length <= 1}
                        title={statementNames.length <= 1 ? '최소 1개' : '삭제'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {sn.companyName?.trim() ? (
                    <p className="text-xs text-muted-foreground">{sn.companyName.trim()}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{formatPhone(sn.contactPhone)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>

      <Dialog open={formOpen} onOpenChange={handleFormOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? '발행용 이름 수정' : '발행용 이름 추가'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">업체명</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="업체명"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">발행용 이름</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="필수"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">연락처</Label>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(formatKoreanPhoneInput(e.target.value))}
                placeholder="010-1234-5678"
                className="h-9 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-input"
              />
              기본으로 사용
            </label>
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
            <AlertDialogTitle>발행용 이름을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제된 항목은 복구할 수 없습니다. 기본으로 설정된 항목을 삭제하면 다른 항목이 자동으로 기본이 됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
