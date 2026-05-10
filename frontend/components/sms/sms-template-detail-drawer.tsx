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
import { Loader2, X, Edit, Copy, CheckCircle2 } from 'lucide-react';
import { useSmsTemplate, SmsTemplate } from '@/lib/hooks/use-sms-templates';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCodes } from '@/lib/hooks/use-codes';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface SmsTemplateDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: number;
  onEdit: (template: SmsTemplate) => void;
}

export function SmsTemplateDetailDrawer({
  open,
  onOpenChange,
  templateId,
  onEdit,
}: SmsTemplateDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data: template, isLoading, refetch } = useSmsTemplate(templateId);
  const { data: templateTypes } = useCodes({ group: 'SMS_TEMPLATE_TYPE' });

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && templateId) {
      refetch();
    }
  }, [open, templateId, refetch]);

  const handleCopyContent = () => {
    if (template?.content) {
      navigator.clipboard.writeText(template.content);
      toast({
        title: '복사 완료',
        description: '템플릿 내용이 클립보드에 복사되었습니다.',
      });
    }
  };

  const typeName = React.useMemo(() => {
    if (!template?.type) return '-';
    
    const codes = templateTypes?.data || [];
    
    // 1. value로 먼저 찾기 (정확한 매칭)
    const foundByValue = codes.find(
      (code) => code.value && code.value.trim() === template.type.trim()
    );
    if (foundByValue?.name) {
      return foundByValue.name;
    }
    
    // 2. name으로 찾기 (하위 호환성)
    const foundByName = codes.find(
      (code) => code.name && code.name.trim() === template.type.trim()
    );
    if (foundByName?.name) {
      return foundByName.name;
    }
    
    // 3. 둘 다 없으면 원본 값 반환
    return template.type;
  }, [template?.type, templateTypes]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full"
        style={{
          width: isMobile ? '100%' : '900px',
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>SMS 템플릿 상세정보</DrawerTitle>
              <DrawerDescription>
                템플릿의 상세 정보를 확인할 수 있습니다.
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

        <div
          className="flex-1 overflow-y-auto p-4"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !template ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              데이터를 불러올 수 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              {/* 기본 정보 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">기본 정보</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">템플릿 이름</label>
                    <p className="mt-1 text-sm font-medium">{template.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">타입</label>
                    <p className="mt-1 text-sm">{typeName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">공급사</label>
                    <p className="mt-1 text-sm">{template.supplier?.companyName || '기본 템플릿'}</p>
                  </div>
                </div>
              </div>

              {/* 템플릿 내용 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">템플릿 내용</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyContent}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    내용 복사
                  </Button>
                </div>
                <div className="rounded-md border bg-muted/50 p-4">
                  <pre className="whitespace-pre-wrap text-sm font-mono">
                    {template.content}
                  </pre>
                </div>
              </div>

              {/* 등록 정보 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">등록 정보</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">등록일</label>
                    <p className="mt-1 text-sm">
                      {template.createdAt
                        ? format(new Date(template.createdAt), 'yyyy-MM-dd HH:mm:ss', { locale: ko })
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">등록자</label>
                    <p className="mt-1 text-sm">{template.createdBy?.name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">수정일</label>
                    <p className="mt-1 text-sm">
                      {template.updatedAt
                        ? format(new Date(template.updatedAt), 'yyyy-MM-dd HH:mm:ss', { locale: ko })
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">수정자</label>
                    <p className="mt-1 text-sm">{template.updatedBy?.name || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
            <DrawerClose asChild>
              <Button variant="outline">닫기</Button>
            </DrawerClose>
            {template && (
              <Button
                onClick={() => {
                  onEdit(template);
                }}
              >
                <Edit className="h-4 w-4 mr-1" />
                수정
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
