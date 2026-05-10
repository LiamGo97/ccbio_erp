'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SmsTemplate,
  SmsTemplateToken,
  useCreateSmsTemplate,
  useUpdateSmsTemplate,
} from '@/lib/hooks/use-sms-templates';
import { useCodes } from '@/lib/hooks/use-codes';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { useSmsSenders } from '@/lib/hooks/use-sms-senders';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2, X, Copy } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface SmsTemplateFormData {
  type: string;
  name: string;
  content: string;
  availableTokens: SmsTemplateToken[];
  supplierId?: number | string | null;
  sender?: string | null;
}

interface SmsTemplateFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: SmsTemplate | null;
  mode: 'create' | 'edit';
  onSuccess?: () => void;
}

export function SmsTemplateFormDrawer({
  open,
  onOpenChange,
  template,
  mode,
  onSuccess,
}: SmsTemplateFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { data: templateTypes } = useCodes({ group: 'SMS_TEMPLATE_TYPE' });
  const { data: suppliers = [] } = useSuppliers({ status: true });
  const { data: smsSenders = [] } = useSmsSenders({ status: true });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SmsTemplateFormData>({
    defaultValues: {
      type: '',
      name: '',
      content: '',
      availableTokens: [],
      supplierId: null,
      sender: null,
    },
  });

  const selectedType = watch('type');
  
  // 수정 모드: 템플릿의 availableTokens 사용 (읽기 전용)
  // 생성 모드: 같은 타입의 다른 템플릿에서 토큰 가져오기
  const { data: templatesByType } = useQuery({
    queryKey: ['sms-templates', 'type', selectedType],
    queryFn: async () => {
      if (!selectedType) return [];
      const response = await api.get<SmsTemplate[]>(`/sms-templates/type/${selectedType}`);
      return response.data;
    },
    enabled: !!selectedType && open && mode === 'create', // 생성 모드에서만 조회
  });

  // 사용 가능한 토큰 결정
  const availableTokens = React.useMemo(() => {
    if (mode === 'edit' && template?.availableTokens) {
      // 수정 모드: 템플릿의 토큰 사용
      return template.availableTokens;
    } else if (mode === 'create' && templatesByType && templatesByType.length > 0) {
      // 생성 모드: 같은 타입의 첫 번째 템플릿의 토큰 사용
      return templatesByType[0].availableTokens || [];
    }
    return [];
  }, [mode, template?.availableTokens, templatesByType]);

  const createTemplateMutation = useCreateSmsTemplate();
  const updateTemplateMutation = useUpdateSmsTemplate();

  React.useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === 'edit' && template) {
      // 템플릿의 type이 코드의 value와 일치하는지 확인
      const templateTypeValue = template.type;
      console.log('[SMS 템플릿 수정] 템플릿 타입:', templateTypeValue);
      console.log('[SMS 템플릿 수정] 사용 가능한 코드:', templateTypes?.data);
      
      // 발신자 매칭: 저장된 전화번호로 SMS 발신자 찾기
      const templateSender = (template as any).sender;
      let matchedSenderId: string | null = null;
      if (templateSender && smsSenders && smsSenders.length > 0) {
        // 전화번호 정규화 (숫자만)
        const normalizedPhone = templateSender.replace(/[^0-9]/g, '');
        const matchedSender = smsSenders.find(sender => {
          const senderPhone = sender.phone.replace(/[^0-9]/g, '');
          return senderPhone === normalizedPhone;
        });
        if (matchedSender) {
          matchedSenderId = String(matchedSender.id);
        }
      }
      
      reset({
        type: templateTypeValue,
        name: template.name,
        content: template.content,
        availableTokens: template.availableTokens || [],
        supplierId: template.supplierId ?? null,
        sender: matchedSenderId || templateSender || null,
      });
      // 수정 모드에서 타입이 설정되면 토큰을 즉시 로드할 수 있도록 타입 설정
      if (templateTypeValue) {
        setValue('type', templateTypeValue, { shouldValidate: true });
      }
    } else {
      reset({
        type: '',
        name: '',
        content: '',
        availableTokens: [],
        supplierId: null,
        sender: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, template?.id, templateTypes]);


  const onSubmit = async (data: SmsTemplateFormData) => {
    setIsSubmitting(true);
    try {
      // 토큰은 제외하고 전송 (읽기 전용, DB에 저장된 값 유지)
      const { availableTokens, ...restData } = data;
      
      // supplierId 정규화: undefined, 빈 문자열, 또는 "null" 문자열을 null로 변환
      let normalizedSupplierId: string | number | null | undefined = restData.supplierId;
      if (normalizedSupplierId === undefined || normalizedSupplierId === '' || normalizedSupplierId === 'null') {
        normalizedSupplierId = null;
      } else if (typeof normalizedSupplierId === 'string') {
        // 문자열이면 숫자로 변환 시도
        const parsed = parseInt(normalizedSupplierId, 10);
        normalizedSupplierId = isNaN(parsed) ? null : parsed;
      }
      
      // sender 처리: 선택된 SMS 발신자 ID에서 전화번호 추출
      let normalizedSender: string | null | undefined = restData.sender;
      if (normalizedSender && typeof normalizedSender === 'string') {
        // SMS 발신자 ID가 선택된 경우, 해당 발신자의 전화번호 찾기
        const selectedSenderId = parseInt(normalizedSender, 10);
        if (!isNaN(selectedSenderId)) {
          const selectedSender = smsSenders.find(s => s.id === selectedSenderId);
          if (selectedSender?.phone) {
            normalizedSender = selectedSender.phone.replace(/[^0-9]/g, '');
          } else {
            normalizedSender = null;
          }
        }
      } else if (normalizedSender === '' || normalizedSender === 'null') {
        normalizedSender = null;
      }
      
      // 타입 안전한 submitData 생성
      const submitData: {
        type: string;
        name: string;
        content: string;
        supplierId?: number | null;
        sender?: string | null;
      } = {
        type: restData.type,
        name: restData.name,
        content: restData.content,
        supplierId: normalizedSupplierId,
        sender: normalizedSender,
      };
      
      console.log('[SMS 템플릿 수정] 전송 데이터:', {
        mode,
        templateId: template?.id,
        originalData: data,
        submitData,
      });
      
      if (mode === 'create') {
        const result = await createTemplateMutation.mutateAsync(submitData);
        console.log('[SMS 템플릿 생성] 응답:', result);
        toast({
          title: '템플릿을 생성했습니다.',
          description: `${data.name} 템플릿이 생성되었습니다.`,
        });
      } else if (template) {
        console.log('[SMS 템플릿 수정] 요청:', { id: template.id, data: submitData });
        const result = await updateTemplateMutation.mutateAsync({ id: template.id, data: submitData });
        console.log('[SMS 템플릿 수정] 응답:', result);
        toast({
          title: '템플릿을 수정했습니다.',
          description: `${data.name} 템플릿이 수정되었습니다.`,
        });
      }
      onSuccess?.();
    } catch (error: any) {
      console.error('[SMS 템플릿 수정] 오류:', {
        error,
        response: error?.response,
        data: error?.response?.data,
        status: error?.response?.status,
      });
      toast({
        title: mode === 'create' ? '템플릿 생성 실패' : '템플릿 수정 실패',
        description: error?.response?.data?.message || '오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyToken = (token: string) => {
    const tokenWithBraces = `{${token}}`;
    navigator.clipboard.writeText(tokenWithBraces);
    toast({
      title: '복사 완료',
      description: `토큰 "${tokenWithBraces}"이(가) 클립보드에 복사되었습니다.`,
    });
  };

  const isMobile = useIsMobile();

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full"
        style={{
          width: isMobile ? '100%' : '900px',
          maxWidth: '90vw',
        }}
      >
        <DrawerHeader className="border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle>{mode === 'create' ? '템플릿 추가' : '템플릿 수정'}</DrawerTitle>
              <DrawerDescription>
                SMS 발송에 사용할 템플릿을 {mode === 'create' ? '추가' : '수정'}합니다.
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

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">템플릿 타입 *</Label>
                <Select
                  value={selectedType || ''}
                  onValueChange={(value) => setValue('type', value)}
                  disabled={mode === 'edit'}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="템플릿 타입을 선택하세요">
                      {mode === 'edit' && selectedType && templateTypes?.data?.find(
                        (code) => (code.value || code.name) === selectedType
                      )?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes?.data?.map((code) => {
                      const codeValue = code.value || code.name || '';
                      return codeValue ? (
                        <SelectItem key={code.id} value={codeValue}>
                          {code.name || code.value}
                        </SelectItem>
                      ) : null;
                    })}
                  </SelectContent>
                </Select>
                {errors.type && (
                  <p className="text-sm text-destructive">{errors.type.message}</p>
                )}
                {mode === 'edit' && selectedType && (
                  <p className="text-xs text-muted-foreground">
                    수정 모드에서는 타입을 변경할 수 없습니다.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">템플릿 이름 *</Label>
                <Input
                  id="name"
                  {...register('name', { required: '템플릿 이름을 입력하세요' })}
                  placeholder="예: 거래명세서 발송 (기본)"
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplierId">공급사</Label>
              <Select
                value={watch('supplierId') === null || watch('supplierId') === undefined ? 'null' : String(watch('supplierId'))}
                onValueChange={(value) => {
                  const newValue = value === 'null' ? null : parseInt(value, 10);
                  setValue('supplierId', newValue, { shouldDirty: true, shouldValidate: true });
                }}
              >
                <SelectTrigger id="supplierId">
                  <SelectValue placeholder="기본 템플릿 (공급사 선택 안 함)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">기본 템플릿</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={String(supplier.id)}>
                      {supplier.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                공급사를 선택하지 않으면 모든 거래명세서에 사용되는 기본 템플릿이 됩니다.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sender">발신자 (선택사항)</Label>
              <Select
                value={watch('sender') ? String(watch('sender')) : undefined}
                onValueChange={(value) => {
                  if (value && value !== 'null') {
                    setValue('sender', value, { shouldDirty: true, shouldValidate: true });
                  } else {
                    setValue('sender', null, { shouldDirty: true, shouldValidate: true });
                  }
                }}
              >
                <SelectTrigger id="sender">
                  <SelectValue placeholder="발신자를 선택하세요 (자동 발송 시 사용)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">선택 안 함</SelectItem>
                  {smsSenders.map((sender) => (
                    <SelectItem key={sender.id} value={String(sender.id)}>
                      {sender.name} ({formatPhone(sender.phone)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {watch('sender') && watch('sender') !== 'null' && (
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const selectedSenderId = parseInt(String(watch('sender')), 10);
                    if (isNaN(selectedSenderId)) return null;
                    const selectedSender = smsSenders.find(s => s.id === selectedSenderId);
                    if (!selectedSender) return null;
                    return (
                      <div className="space-y-1">
                        <div>발신자: {selectedSender.name}</div>
                        <div>전화번호: {formatPhone(selectedSender.phone)}</div>
                      </div>
                    );
                  })()}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                자동 발송되는 템플릿(채권 경고 등)의 경우 발신자를 선택하면 해당 발신자의 전화번호가 발신번호로 사용됩니다.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">템플릿 내용 *</Label>
              <Textarea
                id="content"
                {...register('content', { required: '템플릿 내용을 입력하세요' })}
                placeholder="템플릿 내용을 입력하세요. 토큰은 {tokenName} 형식으로 사용하세요."
                className="min-h-[200px] font-mono text-sm"
                style={{ whiteSpace: 'pre-wrap' }}
              />
              {errors.content && (
                <p className="text-sm text-destructive">{errors.content.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>사용 가능한 토큰</Label>
              <div className="border rounded-lg p-4 bg-muted/50">
                {mode === 'edit' && !template?.availableTokens ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    이 템플릿에는 사용 가능한 토큰이 없습니다.
                  </p>
                ) : mode === 'create' && !selectedType ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    템플릿 타입을 선택하면 사용 가능한 토큰이 표시됩니다.
                  </p>
                ) : availableTokens && availableTokens.length > 0 ? (
                  <div className="space-y-2">
                    {availableTokens.map((token, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-md bg-background">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-primary">
                              {`{${token.token}}`}
                            </code>
                            <Badge variant="outline" className="text-xs">
                              {token.description}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToken(token.token)}
                          title="토큰 복사"
                          className="h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    이 타입에는 사용 가능한 토큰이 없습니다.
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                * 토큰은 템플릿 타입에 따라 자동으로 설정됩니다. 템플릿 내용에서 위 토큰을 사용할 수 있습니다.
              </p>
            </div>

            </div>
          </ScrollArea>

          <DrawerFooter className="border-t flex-shrink-0">
            <div className="flex justify-end gap-2">
              <DrawerClose asChild>
                <Button type="button" variant="outline">
                  취소
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'create' ? '생성 중...' : '수정 중...'}
                  </>
                ) : (
                  mode === 'create' ? '생성' : '수정'
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
