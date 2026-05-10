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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { useSendSms, SendSmsRecipient } from '@/lib/hooks/use-aligo';
import { useSmsSenders } from '@/lib/hooks/use-sms-senders';
import { toast } from '@/components/ui/use-toast';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SmsSendDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SmsSendFormData {
  sender?: string;
  senderSelect?: string; // Select에서 선택한 값 ('', 'custom', 또는 전화번호)
  recipients: Array<{
    phone: string;
    name?: string;
  }>;
  message: string;
  imageUrl?: string;
}

export function SmsSendDrawer({ open, onOpenChange }: SmsSendDrawerProps) {
  const sendSmsMutation = useSendSms();
  const { data: smsSenders = [] } = useSmsSenders({ status: true });
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SmsSendFormData>({
    defaultValues: {
      recipients: [{ phone: '', name: '' }],
      message: '',
      sender: '',
      senderSelect: '',
      imageUrl: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'recipients',
  });

  const message = watch('message');
  const imageUrl = watch('imageUrl');
  const isMms = !!imageUrl && imageUrl.trim().length > 0;

  // 메시지 길이 계산 (SMS: 90자, LMS: 2000자)
  const messageLength = message?.length || 0;
  const maxLength = isMms ? 2000 : 90;
  const messageType = isMms ? 'MMS' : messageLength > 90 ? 'LMS' : 'SMS';

  React.useEffect(() => {
    if (!open) {
      reset({
        recipients: [{ phone: '', name: '' }],
        message: '',
        sender: '',
        senderSelect: '',
        imageUrl: '',
      });
    }
  }, [open, reset]);

  const senderSelect = watch('senderSelect');
  const showCustomInput = senderSelect === 'custom';

  const onSubmit = async (data: SmsSendFormData) => {
    // 수신자 검증
    const validRecipients = data.recipients.filter(
      (r) => r.phone && r.phone.trim().length > 0
    );

    if (validRecipients.length === 0) {
      toast({
        title: '수신자 필요',
        description: '최소 1명의 수신자 전화번호를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // 전화번호 형식 검증 (숫자만 허용)
    const invalidPhones = validRecipients.filter(
      (r) => !/^[0-9]+$/.test(r.phone.replace(/[^0-9]/g, ''))
    );

    if (invalidPhones.length > 0) {
      toast({
        title: '전화번호 형식 오류',
        description: '올바른 전화번호 형식을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // 메시지 검증
    if (!data.message || data.message.trim().length === 0) {
      toast({
        title: '메시지 필요',
        description: '메시지 내용을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const recipients: SendSmsRecipient[] = validRecipients.map((r) => ({
        phone: r.phone.replace(/[^0-9]/g, ''), // 숫자만 추출
        name: r.name?.trim() || undefined,
      }));

      const result = await sendSmsMutation.mutateAsync({
        message: data.message.trim(),
        recipients,
        sender: data.sender?.trim() || undefined,
        imageUrl: data.imageUrl?.trim() || undefined,
      });

      if (result.success) {
        const successCount = result.results.filter((r) => r.result?.result_code === 0 || r.result?.result_code === 1).length;
        const failCount = result.results.length - successCount;

        toast({
          title: '발송 완료',
          description: `${successCount}건 발송 성공${failCount > 0 ? `, ${failCount}건 실패` : ''}`,
        });

        onOpenChange(false);
        reset();
      } else {
        toast({
          title: '발송 실패',
          description: 'SMS 발송에 실패했습니다.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.message ||
        'SMS 발송 중 오류가 발생했습니다.';
      toast({
        title: '발송 실패',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const formatPhone = (phone: string) => {
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <DrawerTitle>SMS 발송</DrawerTitle>
              <DrawerDescription>
                SMS/LMS/MMS 메시지를 발송할 수 있습니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 발신번호 */}
            <div className="space-y-2">
              <Label htmlFor="sender">
                발신번호 <span className="text-muted-foreground text-xs">(선택사항)</span>
              </Label>
              <div className="space-y-2">
                <Select
                  value={senderSelect || ''}
                  onValueChange={(value) => {
                    setValue('senderSelect', value);
                    if (value === 'custom') {
                      setValue('sender', '');
                    } else if (value === '') {
                      setValue('sender', '');
                    } else {
                      // 발신자 선택 시 전화번호 설정
                      setValue('sender', value);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="발신자 선택 또는 직접 입력" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">기본 발신번호</SelectItem>
                    {smsSenders.map((sender) => (
                      <SelectItem key={sender.id} value={sender.phone}>
                        {sender.name} ({sender.phone})
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {showCustomInput && (
                  <Input
                    id="sender"
                    placeholder="010-1234-5678"
                    {...register('sender')}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                발신자를 선택하거나 직접 입력할 수 있습니다. 입력하지 않으면 기본 발신번호가 사용됩니다.
              </p>
            </div>

            {/* 수신자 목록 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>수신자</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ phone: '', name: '' })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  추가
                </Button>
              </div>
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="전화번호 (010-1234-5678)"
                        {...register(`recipients.${index}.phone` as const, {
                          required: index === 0 ? '전화번호를 입력해주세요.' : false,
                        })}
                        className={errors.recipients?.[index]?.phone ? 'border-destructive' : ''}
                      />
                      <Input
                        placeholder="이름 (선택사항)"
                        {...register(`recipients.${index}.name` as const)}
                      />
                    </div>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        className="mt-0.5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 메시지 내용 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">메시지 내용</Label>
                <span className={`text-xs ${messageLength > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {messageLength} / {maxLength}자 ({messageType})
                </span>
              </div>
              <Textarea
                id="message"
                placeholder="메시지 내용을 입력하세요..."
                rows={8}
                {...register('message', {
                  required: '메시지 내용을 입력해주세요.',
                  maxLength: {
                    value: maxLength,
                    message: `메시지는 ${maxLength}자를 초과할 수 없습니다.`,
                  },
                })}
                className={errors.message ? 'border-destructive' : ''}
              />
              {errors.message && (
                <p className="text-xs text-destructive">{errors.message.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {messageLength <= 90 && 'SMS (90자 이하)'}
                {messageLength > 90 && messageLength <= 2000 && 'LMS (91-2000자)'}
                {messageLength > 2000 && '메시지가 너무 깁니다. 2000자 이하로 입력해주세요.'}
              </p>
            </div>

            {/* 이미지 URL (MMS) */}
            <div className="space-y-2">
              <Label htmlFor="imageUrl">
                이미지 URL <span className="text-muted-foreground text-xs">(MMS 선택사항)</span>
              </Label>
              <Input
                id="imageUrl"
                type="url"
                placeholder="https://example.com/image.jpg"
                {...register('imageUrl')}
              />
              <p className="text-xs text-muted-foreground">
                이미지 URL을 입력하면 MMS로 발송됩니다.
              </p>
            </div>
          </div>

          <div className="border-t border-border p-4">
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    발송 중...
                  </>
                ) : (
                  '발송'
                )}
              </Button>
            </div>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

