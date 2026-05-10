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
import { useSmsHistoryDetail, SmsHistory } from '@/lib/hooks/use-sms-history';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, FileText, Image as ImageIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export interface SmsHistoryDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historyId: number | null;
}

export function SmsHistoryDetailDrawer({
  open,
  onOpenChange,
  historyId,
}: SmsHistoryDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading } = useSmsHistoryDetail(historyId);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange]);

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

  const formatDateTime = (value?: string | Date | null) => {
    if (!value) return '-';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusBadge = (status?: string | null) => {
    if (!status) {
      return (
        <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
          -
        </Badge>
      );
    }
    
    const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
      SENT: {
        variant: 'outline',
        className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
      },
      PENDING: {
        variant: 'outline',
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      },
      FAILED: {
        variant: 'outline',
        className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
      },
      CANCELLED: {
        variant: 'outline',
        className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
      },
    };

    const style = statusStyles[status];
    if (!style) {
      return (
        <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
          {status}
        </Badge>
      );
    }

    return (
      <Badge variant={style.variant} className={style.className}>
        {status === 'SENT' ? '발송완료' : status === 'PENDING' ? '대기' : status === 'FAILED' ? '실패' : status === 'CANCELLED' ? '취소' : status}
      </Badge>
    );
  };

  const getMessageTypeBadge = (messageType?: string) => {
    if (!messageType) return '-';
    
    switch (messageType) {
      case 'SMS':
        return <Badge variant="outline">SMS</Badge>;
      case 'LMS':
        return <Badge variant="outline">LMS</Badge>;
      case 'MMS':
        return <Badge variant="outline">MMS</Badge>;
      default:
        return <Badge variant="outline">{messageType}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent
          className="h-full"
          style={{
            width: isMobile ? '100%' : '800px',
            maxWidth: '90vw',
          }}
        >
          <DrawerHeader>
            <DrawerTitle>SMS 발송 이력 상세</DrawerTitle>
            <DrawerDescription>발송 이력 정보를 불러오는 중...</DrawerDescription>
          </DrawerHeader>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!data) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent
          className="h-full"
          style={{
            width: isMobile ? '100%' : '800px',
            maxWidth: '90vw',
          }}
        >
          <DrawerHeader>
            <DrawerTitle>SMS 발송 이력 상세</DrawerTitle>
            <DrawerDescription>발송 이력을 찾을 수 없습니다.</DrawerDescription>
          </DrawerHeader>
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">발송 이력 정보를 찾을 수 없습니다.</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full flex flex-col"
        style={{
          width: isMobile ? '100%' : '900px',
          maxWidth: '95vw',
        }}
      >
        <DrawerHeader className="border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <DrawerTitle>SMS 발송 이력 상세</DrawerTitle>
                {getStatusBadge(data.status)}
                {getMessageTypeBadge(data.messageType)}
              </div>
              <DrawerDescription>발송된 SMS/MMS 상세 정보를 확인합니다.</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {/* 기본 정보 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">기본 정보</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">발송일시</span>
                    <span className="text-sm font-medium">{formatDateTime(data.createdAt)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">템플릿 타입</span>
                    <span className="text-sm font-medium">
                      {data.templateType === 'INVOICE' ? '거래명세서' : data.templateType}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">템플릿 이름</span>
                    <span className="text-sm font-medium">
                      {data.template?.name || '-'}
                    </span>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 발송 대상 정보 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">발송 대상 정보</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">수신자 전화번호</span>
                    <span className="text-sm font-medium">{formatPhone(data.recipientPhone)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">수신자 이름</span>
                    <span className="text-sm font-medium">{data.recipientName || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">발신자 전화번호</span>
                    <span className="text-sm font-medium">{formatPhone(data.senderPhone)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">발송 담당자</span>
                    <span className="text-sm font-medium">
                      {data.senderUser?.name || '-'}
                      {data.senderUser?.email && (
                        <span className="text-muted-foreground ml-2">({data.senderUser.email})</span>
                      )}
                    </span>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 메시지 정보 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">메시지 정보</h3>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">발송 메시지</Label>
                    <Card>
                      <CardContent className="p-4">
                        <pre className="whitespace-pre-wrap text-sm font-mono">
                          {data.message}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                  {data.imageUrl && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        첨부 이미지 {data.imageUrl2 ? '(1번)' : ''}
                      </Label>
                      <Card>
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <img
                              src={data.imageUrl}
                              alt="발송된 이미지 1"
                              className="max-w-full h-auto rounded-lg border"
                            />
                            {data.imagePath && (
                              <p className="text-xs text-muted-foreground">
                                경로: {data.imagePath}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  {data.imageUrl2 && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">첨부 이미지 (2번)</Label>
                      <Card>
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <img
                              src={data.imageUrl2}
                              alt="발송된 이미지 2"
                              className="max-w-full h-auto rounded-lg border"
                            />
                            {data.imagePath2 && (
                              <p className="text-xs text-muted-foreground">
                                경로: {data.imagePath2}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* 연관 정보 */}
              {data.invoiceId && (
                <>
                  <section className="space-y-2.5">
                    <h3 className="text-sm font-semibold text-foreground">연관 정보</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">거래명세서 ID</span>
                        <span className="text-sm font-medium font-mono">{data.invoiceId}</span>
                      </div>
                    </div>
                  </section>
                  <Separator />
                </>
              )}

              {/* 발송 결과 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">발송 결과</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">알리고 메시지 ID (mid)</span>
                    <span className="text-sm font-medium font-mono">{data.aligoMid || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">알리고 상세 ID (mdid)</span>
                    <span className="text-sm font-medium font-mono">{data.aligoMdid || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">결과 코드</span>
                    <span className="text-sm font-medium">{data.resultCode || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">결과 메시지</span>
                    <span className="text-sm font-medium">{data.resultMessage || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">SMS 건수</span>
                    <span className="text-sm font-medium">{data.smsCount || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">실패 건수</span>
                    <span className="text-sm font-medium">{data.failCount}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">실제 발송 시간</span>
                    <span className="text-sm font-medium">{formatDateTime(data.sentAt)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">완료 시간</span>
                    <span className="text-sm font-medium">{formatDateTime(data.doneAt)}</span>
                  </div>
                </div>
              </section>

              {data.notes && (
                <>
                  <Separator />
                  <section className="space-y-2.5">
                    <h3 className="text-sm font-semibold text-foreground">비고</h3>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium whitespace-pre-wrap">{data.notes}</span>
                    </div>
                  </section>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        <DrawerFooter className="border-t flex-shrink-0">
          <DrawerClose asChild>
            <Button variant="outline">닫기</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
