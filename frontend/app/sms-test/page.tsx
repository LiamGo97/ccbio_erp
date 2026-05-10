'use client';

import * as React from 'react';
import { useState } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSmsList, useSmsDetail, SmsListItem } from '@/lib/hooks/use-aligo';
import { useQueries } from '@tanstack/react-query';
import api from '@/lib/api';
import { RefreshCw, AlertCircle, Calendar, Eye, Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function SmsTestPage() {
  // 오늘 날짜를 YYYYMMDD 형식으로 생성
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };

  const [todayDate] = useState(getTodayDate());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMid, setSelectedMid] = useState<string | null>(null);

  // 오늘 전송 결과 목록 조회 (최대 500건까지, 오늘 날짜만 정확히 필터링)
  const { data: smsListData, isLoading: smsListLoading, refetch: refetchSmsList } = useSmsList({
    start_date: todayDate,
    limit_day: todayDate, // 오늘 날짜만 정확히 필터링
    page: 1,
    page_size: 500, // 알리고 API 범위: 30~500 (최대값으로 설정하여 오늘 전체 목록 가져오기)
  });

  const smsList = smsListData?.list || [];

  // 모든 항목의 상세 정보를 병렬로 조회 (수신번호와 상태 정보 가져오기)
  const detailQueries = useQueries({
    queries: smsList
      .filter((item) => item.mid) // mid가 있는 항목만
      .map((item) => ({
        queryKey: ['aligo', 'sms-detail', item.mid],
        queryFn: async () => {
          const response = await api.get(`/aligo/sms/detail?mid=${encodeURIComponent(item.mid!)}`);
          return { mid: item.mid, data: response.data };
        },
        enabled: !!item.mid,
        staleTime: 5 * 60 * 1000, // 5분간 캐시
      })),
  });

  // 상세 정보를 mid로 매핑
  const detailMap = React.useMemo(() => {
    const map = new Map<string, SmsListItem>();
    detailQueries.forEach((query) => {
      if (query.data?.data?.list && query.data.data.list.length > 0) {
        const detail = query.data.data.list[0];
        if (query.data.mid) {
          map.set(query.data.mid, detail);
        }
      }
    });
    return map;
  }, [detailQueries]);

  // 목록에 상세 정보 병합
  const enrichedSmsList = React.useMemo(() => {
    return smsList.map((item) => {
      const detail = item.mid ? detailMap.get(item.mid) : null;
      return {
        ...item,
        receiver: detail?.receiver || item.receiver,
        status: detail?.status || item.status,
        sms_state: detail?.sms_state || item.sms_state,
      };
    });
  }, [smsList, detailMap]);

  // 선택된 메시지의 상세 조회
  const { data: smsDetailData, isLoading: smsDetailLoading, error: smsDetailError } = useSmsDetail(selectedMid || undefined);

  // 상세 정보 로딩 중인지 확인
  const isDetailsLoading = detailQueries.some((query) => query.isLoading);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchSmsList();
      toast({
        title: '갱신 완료',
        description: '오늘 발송 목록을 갱신했습니다.',
      });
    } catch (err) {
      toast({
        title: '갱신 실패',
        description: '목록을 갱신하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportExcel = () => {
    try {
      // CSV 헤더 정의
      const headers = [
        '발송일시',
        '타입',
        '발신번호',
        '수신번호',
        '전송상태',
        '메시지',
        '메시지ID',
      ];

      // CSV 행 데이터 생성
      const rows = enrichedSmsList.map((item) => {
        const status = item.status || item.sms_state || (item.fail_count !== undefined && item.fail_count > 0 ? `실패(${item.fail_count})` : '성공');
        return {
          '발송일시': formatDateTime(item.reg_date || item.send_date) || '-',
          '타입': item.type || item.msg_type || '-',
          '발신번호': item.sender ? formatPhone(item.sender) : '-',
          '수신번호': item.receiver ? formatPhone(item.receiver) : '-',
          '전송상태': status,
          '메시지': item.msg || '-',
          '메시지ID': item.mid || '-',
        };
      });

      // CSV 문자열 생성 (BOM 추가로 한글 깨짐 방지)
      const BOM = '\uFEFF';
      const csvContent = [
        headers.join(','),
        ...rows.map((row: Record<string, string>) =>
          headers.map((header) => {
            const value = row[header] || '';
            // 쉼표나 따옴표, 줄바꿈이 있으면 따옴표로 감싸고 내부 따옴표는 두 번
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              return `"${String(value).replace(/"/g, '""')}"`;
            }
            return String(value);
          }).join(',')
        ),
      ].join('\n');

      // Blob 생성 및 다운로드
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `SMS_발송목록_${formattedDate.replace(/\./g, '')}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast({
        title: '다운로드 완료',
        description: `CSV 파일이 다운로드되었습니다. (${enrichedSmsList.length}건)`,
      });
    } catch (error) {
      console.error('CSV 다운로드 오류:', error);
      toast({
        title: '다운로드 실패',
        description: 'CSV 파일 다운로드에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return '-';
    return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      // YYYY-MM-DD HH:mm:ss 형식
      if (dateStr.includes('-') && dateStr.includes(':')) {
        return dateStr.replace(/-/g, '.').replace(' ', ' ');
      }
      // YYYYMMDDHHmmss 형식
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

  const getStatusBadge = (status?: string, smsState?: string) => {
    const stateValue = smsState || status;
    if (!stateValue) return <Badge variant="secondary">-</Badge>;
    return <Badge variant="secondary">{stateValue}</Badge>;
  };

  const getTypeBadge = (type?: string, msgType?: string) => {
    const typeValue = type || msgType || 'SMS';
    const variant = typeValue === 'MMS' ? 'default' : typeValue === 'LMS' ? 'secondary' : 'outline';
    return <Badge variant={variant}>{typeValue}</Badge>;
  };

  const formattedDate = `${todayDate.substring(0, 4)}.${todayDate.substring(4, 6)}.${todayDate.substring(6, 8)}`;

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">SMS 발송 테스트</h1>
            <p className="text-muted-foreground mt-1">
              오늘({formattedDate}) 발송한 SMS 목록을 확인합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleExportExcel}
              disabled={enrichedSmsList.length === 0 || isDetailsLoading}
              variant="outline"
            >
              <Download className="mr-2 h-4 w-4" />
              엑셀 다운로드
            </Button>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing || smsListLoading}
              variant="outline"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              갱신
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              오늘 발송 목록
            </CardTitle>
            <CardDescription>
              총 {enrichedSmsList.length}건의 메시지가 발송되었습니다.
              {isDetailsLoading && enrichedSmsList.length > 0 && (
                <span className="ml-2 text-muted-foreground">(상세 정보 로딩 중...)</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {smsListLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : smsListData?.result_code !== 1 && smsListData?.result_code !== 0 ? (
              <div className="flex items-center justify-center py-12 text-center">
                <div className="max-w-md">
                  <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <p className="text-lg font-semibold mb-2">
                    {smsListData?.message || '목록을 불러오는 중 오류가 발생했습니다.'}
                  </p>
                  {smsListData?.message?.includes('IP') || smsListData?.result_code === -101 ? (
                    <div className="mt-4 p-4 bg-muted rounded-lg text-sm text-left space-y-2">
                      <p className="font-semibold">IP 인증 오류 해결 방법:</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>알리고 관리자 페이지에서 서버 IP를 화이트리스트에 추가</li>
                        <li>또는 환경변수에 <code className="bg-background px-1 rounded">ALIGO_USE_PROXY=true</code> 설정 후 프록시 서버 사용</li>
                      </ol>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : enrichedSmsList.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-center">
                <div>
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">오늘 발송된 메시지가 없습니다.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-sm">발송일시</th>
                      <th className="text-left p-3 font-medium text-sm">타입</th>
                      <th className="text-left p-3 font-medium text-sm">발신번호</th>
                      <th className="text-left p-3 font-medium text-sm">수신번호</th>
                      <th className="text-left p-3 font-medium text-sm">상태</th>
                      <th className="text-left p-3 font-medium text-sm">메시지</th>
                      <th className="text-left p-3 font-medium text-sm">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedSmsList.map((item: SmsListItem, index: number) => (
                      <tr key={item.mid || index} className="border-b hover:bg-muted/50">
                        <td className="p-3 text-sm">
                          {formatDateTime(item.reg_date || item.send_date)}
                        </td>
                        <td className="p-3">
                          {getTypeBadge(item.type, item.msg_type)}
                        </td>
                        <td className="p-3 text-sm font-mono">
                          {formatPhone(item.sender)}
                        </td>
                        <td className="p-3 text-sm font-mono">
                          {item.receiver ? (
                            formatPhone(item.receiver)
                          ) : item.mid && detailQueries.find((q) => q.data?.mid === item.mid)?.isLoading ? (
                            <span className="text-muted-foreground text-xs">로딩 중...</span>
                          ) : (
                            <span className="text-muted-foreground italic">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          {item.status || item.sms_state ? (
                            getStatusBadge(item.status, item.sms_state)
                          ) : item.fail_count !== undefined ? (
                            item.fail_count > 0 ? (
                              <Badge variant="destructive">실패 ({item.fail_count})</Badge>
                            ) : (
                              <Badge variant="default">성공</Badge>
                            )
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground max-w-md">
                          {item.msg ? (
                            <div className="whitespace-pre-wrap break-words">{item.msg}</div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-3">
                          {item.mid && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedMid(item.mid || null)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 상세 정보 모달 */}
        {selectedMid && (
          <Card className="bg-muted/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">상세 정보 (MID: {selectedMid})</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMid(null)}
                >
                  닫기
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {smsDetailLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : smsDetailError ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    상세 정보를 불러오는 중 오류가 발생했습니다.
                  </p>
                </div>
              ) : smsDetailData?.list && smsDetailData.list.length > 0 ? (
                <div className="space-y-4">
                  {smsDetailData.list.map((detail: SmsListItem, idx: number) => (
                    <div key={idx} className="p-4 bg-background rounded-lg space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-semibold">수신번호:</span>{' '}
                          {detail.receiver ? formatPhone(detail.receiver) : '-'}
                        </div>
                        <div>
                          <span className="font-semibold">전송 상태:</span>{' '}
                          {getStatusBadge(detail.status, detail.sms_state)}
                        </div>
                        <div>
                          <span className="font-semibold">발신번호:</span>{' '}
                          {detail.sender ? formatPhone(detail.sender) : '-'}
                        </div>
                        <div>
                          <span className="font-semibold">타입:</span>{' '}
                          {getTypeBadge(detail.type, detail.msg_type)}
                        </div>
                        <div>
                          <span className="font-semibold">발송일시:</span>{' '}
                          {formatDateTime(detail.reg_date || detail.send_date)}
                        </div>
                        {detail.done_date && (
                          <div>
                            <span className="font-semibold">완료일시:</span>{' '}
                            {formatDateTime(detail.done_date)}
                          </div>
                        )}
                      </div>
                      {detail.msg && (
                        <div className="pt-2 border-t">
                          <span className="font-semibold">메시지:</span>
                          <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{detail.msg}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">상세 정보를 불러올 수 없습니다.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* 디버깅용 정보 */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-sm">API 응답 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs font-mono">
              <div>
                <span className="font-semibold">조회 날짜:</span> {formattedDate} ({todayDate})
              </div>
              <div>
                <span className="font-semibold">result_code:</span> {smsListData?.result_code ?? '-'}
              </div>
              <div>
                <span className="font-semibold">message:</span> {smsListData?.message ?? '-'}
              </div>
              <div>
                <span className="font-semibold">목록 개수:</span> {enrichedSmsList.length}건
              </div>
              <div>
                <span className="font-semibold">상세 정보 로딩:</span>{' '}
                {isDetailsLoading ? '진행 중...' : '완료'}
              </div>
              <div className="pt-2 border-t text-xs text-muted-foreground">
                * 알리고 목록 조회 API는 수신번호와 상태 정보를 제공하지 않습니다. 상세보기 버튼을 클릭하면 상세 정보를 확인할 수 있습니다.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
