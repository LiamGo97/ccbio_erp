'use client';

import * as React from 'react';
import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { useAligoBalance, useSmsList, SmsListItem } from '@/lib/hooks/use-aligo';
import { RefreshCw, AlertCircle, Send } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SmsDetailDrawer } from '@/components/sms/sms-detail-drawer';
import { SmsSendDrawer } from '@/components/sms/sms-send-drawer';

export default function SmsManagementPage() {
  const { data: balance, isLoading, error, refetch } = useAligoBalance();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [smsListPage, setSmsListPage] = useState(1);
  const [smsListPageSize] = useState(30); // 알리고 API 기본값: 30, 범위: 30~500
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedMid, setSelectedMid] = useState<string | null>(null);
  const [selectedSmsItem, setSelectedSmsItem] = useState<SmsListItem | null>(null);
  const [sendDrawerOpen, setSendDrawerOpen] = useState(false);
  
  // 전송 결과 목록 조회
  const { data: smsListData, isLoading: smsListLoading, refetch: refetchSmsList } = useSmsList({
    page: smsListPage,
    page_size: smsListPageSize,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), refetchSmsList()]);
      toast({
        title: '갱신 완료',
        description: '정보를 갱신했습니다.',
      });
    } catch (err) {
      toast({
        title: '갱신 실패',
        description: '정보를 갱신하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

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

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  const handleRowClick = (item: SmsListItem) => {
    if (item.mid) {
      setSelectedMid(item.mid);
      setSelectedSmsItem(item); // 목록에서 가져온 데이터도 저장
      setDetailDrawerOpen(true);
    }
  };

  // 전송 결과 목록 컬럼 정의
  const smsListColumns: ColumnDef<SmsListItem>[] = React.useMemo(() => [
    {
      accessorKey: 'type',
      header: '타입',
      cell: ({ row }) => getMsgTypeLabel(row.original.type || row.original.msg_type),
      size: 100,
    },
    {
      accessorKey: 'sender',
      header: '발신번호',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{formatPhone(row.original.sender)}</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'msg',
      header: '메시지',
      cell: ({ row }) => (
        <div className="max-w-[300px] truncate">{row.original.msg || '-'}</div>
      ),
      size: 300,
    },
    {
      accessorKey: 'reg_date',
      header: '발송일시',
      cell: ({ row }) => {
        const dateStr = row.original.reg_date || row.original.send_date;
        return (
          <span className="text-xs text-muted-foreground">
            {dateStr ? formatDateTime(dateStr) : '-'}
          </span>
        );
      },
      size: 150,
    },
  ], []);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SMS 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              알리고 SMS 발송 현황 및 잔액을 확인할 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setSendDrawerOpen(true)}
              disabled={isRefreshing || isLoading}
            >
              <Send className="h-4 w-4 mr-2" />
              SMS 발송
            </Button>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              갱신
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                오류 발생
              </CardTitle>
              <CardDescription>
                알리고 API 설정이 완료되지 않았거나, API 키가 올바르지 않습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                백엔드 환경 변수에 다음 값들이 설정되어 있는지 확인해주세요:
              </p>
              <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
                <li>ALIGO_API_KEY</li>
                <li>ALIGO_USER_ID</li>
                <li>ALIGO_SENDER (선택사항)</li>
              </ul>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : balance ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  SMS 잔여 건수
                </CardTitle>
                <CardDescription>단문 메시지 잔여 발송 가능 건수</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {balance.SMS_CNT !== undefined ? formatNumber(balance.SMS_CNT) : '-'} 건
                </div>
                {balance.SMS_CNT !== undefined && balance.SMS_CNT < 100 && (
                  <p className="text-sm text-destructive mt-2">
                    잔여 건수가 부족합니다. 충전이 필요합니다.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  LMS 잔여 건수
                </CardTitle>
                <CardDescription>장문 메시지 잔여 발송 가능 건수</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {balance.LMS_CNT !== undefined ? formatNumber(balance.LMS_CNT) : '-'} 건
                </div>
                {balance.LMS_CNT !== undefined && balance.LMS_CNT < 100 && (
                  <p className="text-sm text-destructive mt-2">
                    잔여 건수가 부족합니다.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  MMS 잔여 건수
                </CardTitle>
                <CardDescription>이미지 첨부 메시지 잔여 발송 가능 건수</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {balance.MMS_CNT !== undefined ? formatNumber(balance.MMS_CNT) : '-'} 건
                </div>
                {balance.MMS_CNT !== undefined && balance.MMS_CNT < 100 && (
                  <p className="text-sm text-destructive mt-2">
                    잔여 건수가 부족합니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* 전송 결과 목록 */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">전송 결과 목록</h2>
            <p className="text-muted-foreground">
              최근 발송한 SMS/MMS 전송 결과를 확인할 수 있습니다.
              {smsListData?.list && smsListData.list.length > 0 && (
                <span className="ml-2">(현재 페이지: {smsListData.list.length}건)</span>
              )}
            </p>
          </div>
          <DataTable
            columns={smsListColumns}
            data={smsListData?.list || []}
            isLoading={smsListLoading}
            page={smsListPage}
            pageSize={smsListPageSize}
            total={(smsListData?.list?.length || 0) + (smsListPage > 1 ? (smsListPage - 1) * smsListPageSize : 0)} // 추정값 (API에서 전체 개수 제공 안함)
            totalPages={
              smsListData?.list && smsListData.list.length === smsListPageSize
                ? smsListPage + 1 // 현재 페이지가 가득 차면 다음 페이지가 있을 수 있음
                : smsListPage // 현재 페이지가 가득 차지 않으면 마지막 페이지
            }
            onPageChange={setSmsListPage}
            onPageSizeChange={() => {}} // 페이지 사이즈 변경은 지원하지 않음
            manualPagination={true}
            enableSorting={false}
            showRowNumber={true}
            rowClassName="h-10"
            onRowClick={handleRowClick}
          />
        </div>
      </div>

      {/* 상세정보 Drawer */}
      <SmsDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        mid={selectedMid}
        listItem={selectedSmsItem} // 목록 데이터 전달
      />

      {/* 발송 Drawer */}
      <SmsSendDrawer
        open={sendDrawerOpen}
        onOpenChange={setSendDrawerOpen}
      />
    </AppLayout>
  );
}

