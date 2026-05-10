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
import { Label } from '@/components/ui/label';
import { Loader2, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useSmsDetail, SmsListItem } from '@/lib/hooks/use-aligo';

const formatPhone = (phone?: string) => {
  if (!phone) return '-';
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
};

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  try {
    // YYYY-MM-DD HH:mm:ss 형식 (알리고 API 기본 형식)
    if (dateStr.includes('-') && dateStr.includes(':')) {
      return dateStr.replace(/-/g, '.').replace(' ', ' ');
    }
    // YYYYMMDDHHmmss 형식으로 오는 경우
    if (dateStr.length === 14) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      const hour = dateStr.substring(8, 10);
      const minute = dateStr.substring(10, 12);
      const second = dateStr.substring(12, 14);
      return `${year}.${month}.${day} ${hour}:${minute}:${second}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

const getMsgTypeLabel = (msgType?: string) => {
  switch (msgType) {
    case 'SMS':
      return <Badge variant="outline">SMS</Badge>;
    case 'LMS':
      return <Badge variant="outline">LMS</Badge>;
    case 'MMS':
      return <Badge variant="outline">MMS</Badge>;
    default:
      return msgType || '-';
  }
};

const getStatusBadge = (status?: string, smsState?: string, result?: string) => {
  // API에서 받은 값 그대로 표시
  const stateValue = smsState || status;
  
  // 빈값이면 빈값으로 표시
  if (!stateValue && !result) {
    return '-';
  }
  
  // 값이 있으면 그대로 표시
  if (stateValue) {
    return <Badge variant="secondary">{stateValue}</Badge>;
  }
  
  // result만 있는 경우
  if (result) {
    return <Badge variant="secondary">{result}</Badge>;
  }
  
  return '-';
};

interface SmsDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mid?: string | null;
  listItem?: SmsListItem | null; // 목록에서 가져온 데이터 (메시지 내용 등 포함)
}

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-4 py-2">
    <Label className="text-sm font-medium text-muted-foreground min-w-[120px]">{label}</Label>
    <div className="flex-1 text-sm">{value || '-'}</div>
  </div>
);

export function SmsDetailDrawer({ open, onOpenChange, mid, listItem }: SmsDetailDrawerProps) {
  const { data, isLoading, error } = useSmsDetail(mid ?? undefined);

  // 상세 조회 API 응답 또는 목록 데이터 사용
  const apiDetail = data?.list && data.list.length > 0 ? data.list[0] : null;
  // 목록 데이터와 API 상세 데이터를 병합 (목록 데이터 우선)
  const smsDetail = React.useMemo(() => {
    if (!apiDetail && !listItem) return null;
    const merged = {
      ...apiDetail,
      ...listItem, // 목록 데이터로 덮어쓰기 (메시지 내용 등)
    } as SmsListItem;
    
    // 상태 값 디버깅
    console.log('[SMS 상세] 상태 값 확인:', {
      sms_state: merged.sms_state,
      status: merged.status,
      result: merged.result,
      'sms_state 타입': typeof merged.sms_state,
      'sms_state 길이': merged.sms_state?.length,
      'sms_state 빈값 체크': merged.sms_state === '' || merged.sms_state === null || merged.sms_state === undefined,
      전체데이터: merged,
    });
    
    return merged;
  }, [apiDetail, listItem]);

  if (!mid) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>SMS 전송 결과 상세</DrawerTitle>
                <DrawerDescription>메시지를 선택해주세요.</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">메시지를 선택하면 상세 정보가 표시됩니다.</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (isLoading) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>SMS 전송 결과 상세</DrawerTitle>
                <DrawerDescription>상세 정보를 불러오는 중...</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (error || !smsDetail) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>SMS 전송 결과 상세</DrawerTitle>
                <DrawerDescription>상세 정보를 불러올 수 없습니다.</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : '상세 정보를 불러올 수 없습니다.'}
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>SMS 전송 결과 상세</DrawerTitle>
              <DrawerDescription>전송 결과의 상세 정보를 확인할 수 있습니다.</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {/* 기본 정보 */}
            <div>
              <h3 className="text-lg font-semibold mb-4">기본 정보</h3>
              <div className="space-y-1">
                <InfoRow label="타입" value={getMsgTypeLabel(smsDetail.type || smsDetail.msg_type)} />
                <InfoRow label="발신번호" value={<span className="font-mono">{formatPhone(smsDetail.sender)}</span>} />
                {smsDetail.receiver && (
                  <InfoRow label="수신번호" value={<span className="font-mono">{formatPhone(smsDetail.receiver)}</span>} />
                )}
                {(smsDetail.status || smsDetail.sms_state || smsDetail.result) && (
                  <InfoRow 
                    label="상태" 
                    value={smsDetail.sms_state || smsDetail.status || smsDetail.result || '-'} 
                  />
                )}
                <InfoRow label="발송일시" value={formatDateTime(smsDetail.reg_date || smsDetail.send_date)} />
                {smsDetail.done_date && (
                  <InfoRow label="완료일시" value={formatDateTime(smsDetail.done_date)} />
                )}
              </div>
            </div>

            <Separator />

            {/* 메시지 내용 - 목록에서는 truncate되지만 상세에서는 전체 표시 */}
            <div>
              <h3 className="text-lg font-semibold mb-4">메시지 내용</h3>
              <div className="bg-muted/50 rounded-md p-4">
                <p className="text-sm whitespace-pre-wrap break-words">{smsDetail.msg || '-'}</p>
              </div>
            </div>

            <Separator />

            {/* 추가 정보 - 상세 조회에서만 제공되는 정보 */}
            {(smsDetail.sms_count || smsDetail.fail_count !== undefined || smsDetail.reserve_state !== undefined || smsDetail.result || smsDetail.result_msg || smsDetail.etc1 || smsDetail.etc2 || smsDetail.etc3 || smsDetail.etc4 || smsDetail.etc5) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-4">추가 정보</h3>
                  <div className="space-y-1">
                    {smsDetail.sms_count && (
                      <InfoRow label="SMS 건수" value={smsDetail.sms_count} />
                    )}
                    {smsDetail.fail_count !== undefined && (
                      <InfoRow label="실패 건수" value={smsDetail.fail_count} />
                    )}
                    {smsDetail.reserve_state !== undefined && (
                      <InfoRow label="예약 상태" value={smsDetail.reserve_state || '없음'} />
                    )}
                    {smsDetail.result && (
                      <InfoRow label="결과 코드" value={smsDetail.result} />
                    )}
                    {smsDetail.result_msg && (
                      <InfoRow label="결과 메시지" value={smsDetail.result_msg} />
                    )}
                    {/* 기타 필드들 */}
                    {smsDetail.etc1 && (
                      <InfoRow label="기타1" value={smsDetail.etc1} />
                    )}
                    {smsDetail.etc2 && (
                      <InfoRow label="기타2" value={smsDetail.etc2} />
                    )}
                    {smsDetail.etc3 && (
                      <InfoRow label="기타3" value={smsDetail.etc3} />
                    )}
                    {smsDetail.etc4 && (
                      <InfoRow label="기타4" value={smsDetail.etc4} />
                    )}
                    {smsDetail.etc5 && (
                      <InfoRow label="기타5" value={smsDetail.etc5} />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              닫기
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

