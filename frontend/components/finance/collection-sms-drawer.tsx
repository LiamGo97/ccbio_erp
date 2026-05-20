'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useSmsSenders } from '@/lib/hooks/use-sms-senders';
import { useSmsTemplatesByType, type SmsTemplate } from '@/lib/hooks/use-sms-templates';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

/** `tb_code` SMS_TEMPLATE_TYPE · `tb_sms_template.st_type` 와 동일해야 함 */
export const RECEIVABLE_COLLECTION_SMS_TEMPLATE_TYPE = 'RECEIVABLE_COLLECTION';

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return phone;
};

const digitsOnly = (phone: string) => phone.replace(/[^0-9]/g, '');

export interface CollectionSmsContext {
  /** 저장된 수금 ID — 있을 때만 실제 발송 가능 */
  collectionId?: string | null;
  recipientPhone?: string | null;
  companyName?: string | null;
  ceo?: string | null;
  collectionAmount?: number | null;
  collectionDate?: string | null;
  collectionMethod?: string | null;
  isPrepayment?: boolean | null;
  notes?: string | null;
  currentBalance?: number | null;
  supplierId?: number | null;
}

function formatAmountKo(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return Number(value).toLocaleString('ko-KR');
}

function pickReceivableCollectionTemplate(
  templates: SmsTemplate[] | undefined,
  supplierId?: number | null,
): SmsTemplate | null {
  if (!templates?.length) return null;
  if (supplierId != null && supplierId > 0) {
    const bySupplier = templates.filter((t) => t.supplierId === supplierId);
    if (bySupplier.length) {
      const def = bySupplier.find((t) => (t as { isDefault?: boolean }).isDefault);
      return def ?? bySupplier[0];
    }
  }
  const globals = templates.filter((t) => t.supplierId == null);
  if (globals.length) {
    const def = globals.find((t) => (t as { isDefault?: boolean }).isDefault);
    return def ?? globals[0];
  }
  const def = templates.find((t) => (t as { isDefault?: boolean }).isDefault);
  return def ?? templates[0];
}

function replaceCollectionSmsTokens(template: string, ctx: CollectionSmsContext): string {
  const company = ctx.companyName?.trim() || '';
  const ceo = ctx.ceo?.trim() || '';
  const customerName = company || ceo || '-';
  const phoneDigits = digitsOnly(ctx.recipientPhone || '');
  const amt = formatAmountKo(ctx.collectionAmount);
  const date = ctx.collectionDate?.trim() || '-';
  const method = ctx.collectionMethod?.trim() || '-';
  const prep = ctx.isPrepayment === true ? '선수금' : '일반';
  const bal =
    ctx.currentBalance != null && !Number.isNaN(Number(ctx.currentBalance))
      ? `${Number(ctx.currentBalance) >= 0 ? '' : '-'}${Math.abs(Number(ctx.currentBalance)).toLocaleString('ko-KR')}원`
      : '-';

  return template
    .replace(/{customerName}/g, customerName)
    .replace(/{companyName}/g, company || '-')
    .replace(/{ceo}/g, ceo || '-')
    .replace(/{phone}/g, phoneDigits || '-')
    .replace(/{collectionAmount}/g, amt)
    .replace(/{collectionDate}/g, date)
    .replace(/{collectionMethod}/g, method)
    .replace(/{isPrepayment}/g, prep)
    .replace(/{prepaymentLabel}/g, prep)
    .replace(/{notes}/g, ctx.notes?.trim() ?? '')
    .replace(/{currentBalance}/g, bal)
    .replace(/{invoiceNumber}/g, '-');
}

function buildFallbackMessage(ctx: CollectionSmsContext): string {
  const company = ctx.companyName?.trim() || '-';
  const ceo = ctx.ceo?.trim() || '-';
  const amt = formatAmountKo(ctx.collectionAmount);
  const date = ctx.collectionDate?.trim() || '-';
  const method = ctx.collectionMethod?.trim() || '-';
  const prep = ctx.isPrepayment === true ? '선수금' : '일반';
  const notes = ctx.notes?.trim();
  const bal =
    ctx.currentBalance != null && !Number.isNaN(Number(ctx.currentBalance))
      ? `${Number(ctx.currentBalance) >= 0 ? '' : '-'}${Math.abs(Number(ctx.currentBalance)).toLocaleString('ko-KR')}원`
      : '-';

  return `${company} (${ceo}) 님

수금 내역 안내드립니다.
· 금액: ${amt}원
· 수금일: ${date}
· 수금 방법: ${method}
· 구분: ${prep}
· 수금 후 잔액(참고): ${bal}
${notes ? `· 비고: ${notes}` : ''}

내용 확인 후 회신 부탁드립니다.
감사합니다.`;
}

export interface CollectionSmsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: CollectionSmsContext | null;
}

/** 거래명세서 상세의「미리보기 후 SMS 발송」다이얼로그와 동일한 Dialog 패턴 (수금은 미리보기 영역 없음) */
export function CollectionSmsDialog({ open, onOpenChange, context }: CollectionSmsDialogProps) {
  const queryClient = useQueryClient();
  const { data: smsSenders = [] } = useSmsSenders({ status: true });
  const { data: smsTemplates, isLoading: templatesLoading } = useSmsTemplatesByType(
    RECEIVABLE_COLLECTION_SMS_TEMPLATE_TYPE,
    undefined,
  );

  const [recipientPhone, setRecipientPhone] = React.useState('');
  const [smsMessage, setSmsMessage] = React.useState('');
  const [selectedSenderId, setSelectedSenderId] = React.useState<number | undefined>(undefined);
  const [isSending, setIsSending] = React.useState(false);
  const messageSeededRef = React.useRef(false);

  const resolveMessage = React.useCallback(
    (ctx: CollectionSmsContext) => {
      const picked = pickReceivableCollectionTemplate(smsTemplates, ctx.supplierId);
      if (picked?.content?.trim()) {
        return replaceCollectionSmsTokens(picked.content, ctx);
      }
      return buildFallbackMessage(ctx);
    },
    [smsTemplates],
  );

  React.useEffect(() => {
    if (!open) {
      messageSeededRef.current = false;
      return;
    }
    if (!context || templatesLoading) return;
    if (messageSeededRef.current) return;

    setRecipientPhone(digitsOnly(context.recipientPhone || ''));
    setSmsMessage(resolveMessage(context));
    setSelectedSenderId(undefined);
    messageSeededRef.current = true;
  }, [open, context, templatesLoading, resolveMessage]);

  const messageLength = smsMessage.length;
  const messageType = messageLength > 90 ? 'LMS' : 'SMS';
  const hasRecipient = recipientPhone.replace(/\D/g, '').length >= 8;
  const collectionNumericId =
    context?.collectionId != null && String(context.collectionId).trim() !== ''
      ? Number(context.collectionId)
      : NaN;
  const canSend =
    Number.isFinite(collectionNumericId) &&
    collectionNumericId > 0 &&
    hasRecipient &&
    selectedSenderId != null &&
    smsMessage.trim().length > 0 &&
    !templatesLoading &&
    !isSending;

  const handleSendSms = React.useCallback(async () => {
    if (!context || isSending || templatesLoading) return;
    const rid =
      context.collectionId != null && String(context.collectionId).trim() !== ''
        ? Number(context.collectionId)
        : NaN;
    if (!Number.isFinite(rid) || rid <= 0) return;
    const phoneOk = recipientPhone.replace(/\D/g, '').length >= 8;
    if (!phoneOk || selectedSenderId == null || !smsMessage.trim()) return;

    const selectedSender = smsSenders.find((s) => s.id === selectedSenderId);
    if (!selectedSender?.phone) {
      toast({
        title: '발송 불가',
        description: '선택한 SMS 발신자의 전화번호가 없습니다.',
        variant: 'destructive',
      });
      return;
    }
    const picked = pickReceivableCollectionTemplate(smsTemplates, context.supplierId);
    const company = context.companyName?.trim() || '';
    const ceo = context.ceo?.trim() || '';
    const recipientName = company || ceo || undefined;

    setIsSending(true);
    try {
      await api.post('/aligo/sms/send', {
        message: smsMessage.trim(),
        recipients: [
          {
            phone: recipientPhone.replace(/[^0-9]/g, ''),
            name: recipientName,
          },
        ],
        sender: selectedSender.phone.replace(/[^0-9]/g, ''),
        templateId: picked?.id,
        templateType: RECEIVABLE_COLLECTION_SMS_TEMPLATE_TYPE,
        templateContent: picked?.content ?? null,
        relatedId: rid,
        relatedType: 'RECEIVABLE_COLLECTION',
        senderUserId: selectedSenderId,
      });
      toast({ title: '발송 완료', description: '입금 알림 문자가 발송되었습니다.' });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      onOpenChange(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast({
        title: '발송 실패',
        description: err?.response?.data?.message || err?.message || '문자 발송 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  }, [
    context,
    isSending,
    onOpenChange,
    queryClient,
    recipientPhone,
    selectedSenderId,
    smsMessage,
    smsSenders,
    smsTemplates,
    templatesLoading,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isSending) return;
        onOpenChange(next);
        if (!next) {
          setSmsMessage('');
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            입금 알림 문자
          </DialogTitle>
          <DialogDescription>
            채권 수금 알림({RECEIVABLE_COLLECTION_SMS_TEMPLATE_TYPE}) 템플릿을 불러와 변수를 치환합니다. 내용을 확인·수정한 뒤
            발송합니다. 90자 초과 시 LMS로 발송됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="collection-sms-recipient" className="text-xs text-muted-foreground">
              수신 번호
            </Label>
            <Input
              id="collection-sms-recipient"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(digitsOnly(e.target.value))}
              placeholder="01012345678"
              inputMode="tel"
              maxLength={13}
              disabled={templatesLoading || isSending}
            />
            <p className="text-xs text-muted-foreground">
              {hasRecipient ? (
                <span className="text-green-600 dark:text-green-400">표시: {formatPhone(recipientPhone)}</span>
              ) : (
                <span>숫자만 입력하세요.</span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">발송 메시지</Label>
              {context && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={templatesLoading || isSending}
                  onClick={() => setSmsMessage(resolveMessage(context))}
                >
                  템플릿으로 복원
                </Button>
              )}
            </div>
            <Card className="border-2">
              <CardContent className="space-y-3 p-3 relative">
                {templatesLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/70">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                <Textarea
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  placeholder={templatesLoading ? '템플릿 불러오는 중…' : '문자 내용을 입력하세요…'}
                  className="min-h-[220px] resize-y font-mono text-sm"
                  style={{ whiteSpace: 'pre-wrap' }}
                  disabled={templatesLoading || isSending}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {messageLength}자 · {messageType}
                  </span>
                  <span>{messageLength > 2000 ? '2000자 초과' : ''}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <Label htmlFor="collection-sms-sender" className="text-xs text-muted-foreground">
              SMS 발송 담당자
            </Label>
            <Select
              value={selectedSenderId != null ? String(selectedSenderId) : undefined}
              onValueChange={(value) => {
                if (value && value !== 'null') {
                  setSelectedSenderId(Number(value));
                } else {
                  setSelectedSenderId(undefined);
                }
              }}
              disabled={templatesLoading || isSending}
            >
              <SelectTrigger id="collection-sms-sender">
                <SelectValue placeholder="발신자를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {smsSenders.length === 0 ? (
                  <SelectItem value="null" disabled>
                    등록된 발신자가 없습니다
                  </SelectItem>
                ) : (
                  smsSenders.map((sender) => (
                    <SelectItem key={sender.id} value={String(sender.id)}>
                      {sender.name} ({formatPhone(sender.phone)})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedSenderId != null && (
              <p className="text-xs text-muted-foreground">
                발신: {formatPhone(smsSenders.find((s) => s.id === selectedSenderId)?.phone ?? '')}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={!canSend}
            title={
              !Number.isFinite(collectionNumericId) || collectionNumericId <= 0
                ? '저장된 수금만 문자를 보낼 수 있습니다.'
                : !hasRecipient
                  ? '수신 번호를 입력하세요.'
                  : selectedSenderId == null
                    ? 'SMS 발송 담당자를 선택하세요.'
                    : !smsMessage.trim()
                      ? '발송할 메시지를 입력하세요.'
                      : undefined
            }
            className="gap-1.5"
            onClick={() => void handleSendSms()}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                발송 중…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                SMS 발송
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
