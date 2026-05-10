'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { useVehicleDispatches, useVehicleDispatchAllChanges } from '@/lib/hooks/use-vehicle-dispatch';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Loader2, ArrowRight, AlertCircle, Clock, User as UserIcon, RefreshCw, Calendar, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// 메인 프로세스 상태
const processStatuses = [
  {
    status: 'DRAFT',
    label: '배차요청',
    path: '/transport/dispatch-request',
    color: 'bg-gray-50 border-gray-200 hover:bg-gray-100 dark:bg-gray-900 dark:border-gray-800',
    iconColor: 'text-gray-600 dark:text-gray-400',
  },
  {
    status: 'DISPATCHING',
    label: '배차중',
    path: '/transport/dispatch-dispatching',
    color: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:border-yellow-800',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  {
    status: 'DISPATCH_COMPLETED',
    label: '배차완료',
    path: '/transport/dispatch-completed',
    color: 'bg-purple-50 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/30 dark:border-purple-800',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    status: 'ASSIGNED',
    label: '상차중',
    path: '/transport/loading',
    color: 'bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:border-blue-800',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    status: 'LOADING_COMPLETED',
    label: '상차완료',
    path: '/transport/loading-completed',
    color: 'bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:border-green-800',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    status: 'UNLOADING_COMPLETED',
    label: '하차완료',
    path: '/transport/unloading-completed',
    color: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100 dark:bg-cyan-900/30 dark:border-cyan-800',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
  },
];

// 예외 상태
const exceptionStatuses = [
  {
    status: 'FAILED',
    label: '배차실패',
    path: '/transport/dispatch-failed',
    color: 'bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:border-red-800',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  {
    status: 'RESCHEDULED',
    label: '일정조정',
    path: '/transport/dispatch-rescheduled',
    color: 'bg-orange-50 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/30 dark:border-orange-800',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
];

// 상태 라벨 매핑
const statusLabels: Record<string, string> = {
  DRAFT: '배차요청',
  DISPATCHING: '배차중',
  DISPATCH_COMPLETED: '배차완료',
  ASSIGNED: '상차중',
  LOADING_COMPLETED: '상차완료',
  UNLOADING_COMPLETED: '하차완료',
  FAILED: '배차실패',
  RESCHEDULED: '일정조정',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function TransportDashboardPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = React.useState<string>('all');

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 대시보드: 30초마다 자동 갱신
  const REFETCH_INTERVAL = 30000; // 30초
  
  const { 
    data: vehicleDispatches = [], 
    isLoading, 
    refetch: refetchDispatches,
    isFetching: isFetchingDispatches,
    dataUpdatedAt: dispatchesUpdatedAt,
  } = useVehicleDispatches(undefined, { refetchInterval: REFETCH_INTERVAL });

  const {
    data: allChanges = [],
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory,
    isFetching: isFetchingHistory,
    dataUpdatedAt: historyUpdatedAt,
  } = useVehicleDispatchAllChanges(10, { refetchInterval: REFETCH_INTERVAL });

  // 차량 코드 가져오기
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');

  // 차량 코드 맵 생성
  const requestVehicleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (requestVehicleCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [requestVehicleCodes]);

  // 마지막 갱신 시간 포맷팅
  const formatLastUpdate = React.useCallback((dataUpdatedAt?: number) => {
    if (!dataUpdatedAt) return '갱신 중...';
    const now = Date.now();
    const diff = now - dataUpdatedAt;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 5) return '방금 전';
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}분 전`;
  }, []);

  // 프로그래스 바 값 계산 (배차 데이터 기준)
  const [progressValue, setProgressValue] = React.useState<number>(0);
  
  React.useEffect(() => {
    if (!dispatchesUpdatedAt) {
      setProgressValue(0);
      return;
    }
    
    const updateTimer = () => {
      const now = Date.now();
      const elapsed = now - dispatchesUpdatedAt;
      const remaining = Math.max(0, REFETCH_INTERVAL - elapsed);
      const progress = (remaining / REFETCH_INTERVAL) * 100;
      setProgressValue(progress);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100); // 100ms마다 업데이트하여 부드러운 애니메이션
    return () => clearInterval(interval);
  }, [dispatchesUpdatedAt, REFETCH_INTERVAL]);

  // 전체 새로고침 함수
  const handleRefresh = React.useCallback(async () => {
    await Promise.all([refetchDispatches(), refetchHistory()]);
  }, [refetchDispatches, refetchHistory]);

  // 각 상태별 카운트 계산
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    
    [...processStatuses, ...exceptionStatuses].forEach(config => {
      counts[config.status] = 0;
    });

    vehicleDispatches.forEach(dispatch => {
      const status = dispatch.status || 'DRAFT';
      if (counts.hasOwnProperty(status)) {
        counts[status]++;
      }
    });

    return counts;
  }, [vehicleDispatches]);

  // 전체 카운트
  const totalCount = vehicleDispatches.length;

  // 상차일정 월별 집계 계산
  const monthlyLoadingStats = React.useMemo(() => {
    const statsMap = new Map<string, {
      month: string;
      regionCity: string;
      requestVehicle: string;
      vehicleCount: number;
      transportFeeSum: number;
      transportFeeCount: number;
      transportFeeAvg: number;
      orderNumbers: string[];
    }[]>();

    vehicleDispatches.forEach(dispatch => {
      // 상차일정이 있는 경우만 집계
      const loadingDate = dispatch.loadingSchedule || dispatch.loadingDateTime;
      if (!loadingDate) return;

      // 운송비가 없는 경우 제외
      if (!dispatch.transportFee || dispatch.transportFee <= 0) return;

      const date = new Date(loadingDate);
      if (Number.isNaN(date.getTime())) return;

      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

      // 지역 정보 가져오기 (VehicleDispatch에 포함된 관계 데이터 사용)
      const regionName = dispatch.unloadingRegion?.name || '미지정';
      const cityName = dispatch.unloadingCity?.name || '';
      const regionCity = cityName ? `${regionName} ${cityName}` : regionName;

      // 요청차량
      const requestVehicle = dispatch.requestVehicle || '미지정';

      // 키: 월-지역-차량
      const key = `${yearMonth}-${regionCity}-${requestVehicle}`;

      if (!statsMap.has(yearMonth)) {
        statsMap.set(yearMonth, []);
      }

      const monthStats = statsMap.get(yearMonth)!;
      const existingStat = monthStats.find(
        s => s.regionCity === regionCity && s.requestVehicle === requestVehicle
      );

      // transportFee를 숫자로 변환하고 유효성 검사
      const transportFee = typeof dispatch.transportFee === 'number' 
        ? dispatch.transportFee 
        : (typeof dispatch.transportFee === 'string' 
          ? parseFloat(dispatch.transportFee) 
          : 0);
      
      // 유효하지 않은 숫자인 경우 0으로 처리
      const validTransportFee = (isNaN(transportFee) || !isFinite(transportFee)) ? 0 : transportFee;

      const orderNumber = dispatch.orderNumber || `#${dispatch.id}`;

      if (existingStat) {
        existingStat.vehicleCount += 1;
        existingStat.transportFeeSum += validTransportFee;
        existingStat.transportFeeCount += 1;
        // 평균 계산 시 NaN이나 Infinity 체크
        const avg = existingStat.transportFeeSum / existingStat.transportFeeCount;
        existingStat.transportFeeAvg = (isNaN(avg) || !isFinite(avg)) ? 0 : avg;
        if (!existingStat.orderNumbers.includes(orderNumber)) {
          existingStat.orderNumbers.push(orderNumber);
        }
      } else {
        monthStats.push({
          month: monthLabel,
          regionCity,
          requestVehicle,
          vehicleCount: 1,
          transportFeeSum: validTransportFee,
          transportFeeCount: 1,
          transportFeeAvg: validTransportFee,
          orderNumbers: [orderNumber],
        });
      }
    });

    // 월별로 정렬 (최신순)
    const sortedMonths = Array.from(statsMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6); // 최근 6개월만 표시

    return sortedMonths.map(([monthKey, stats]) => ({
      monthKey,
      monthLabel: stats[0]?.month || monthKey,
      stats: stats.sort((a, b) => {
        // 1순위: 지역, 시군구별 정렬
        const regionCityCompare = a.regionCity.localeCompare(b.regionCity, 'ko');
        if (regionCityCompare !== 0) {
          return regionCityCompare;
        }
        // 2순위: 차량순 정렬
        return a.requestVehicle.localeCompare(b.requestVehicle, 'ko');
      }),
    }));
  }, [vehicleDispatches]);

  // 필터링된 테이블 데이터 계산
  const tableData = React.useMemo(() => {
    // 모든 월의 데이터를 평탄화
    const allStats: Array<{
      monthKey: string;
      monthLabel: string;
      regionCity: string;
      region: string;
      city: string;
      requestVehicle: string;
      requestVehicleName: string;
      vehicleCount: number;
      transportFeeAvg: number;
    }> = [];

    monthlyLoadingStats.forEach(({ monthKey, monthLabel, stats }) => {
      stats.forEach(stat => {
        // 지역과 시군구 분리
        const parts = stat.regionCity.split(' ');
        const region = parts[0] || '미지정';
        const city = parts.slice(1).join(' ') || '';

        allStats.push({
          monthKey,
          monthLabel,
          regionCity: stat.regionCity,
          requestVehicle: stat.requestVehicle,
          requestVehicleName: requestVehicleMap.get(stat.requestVehicle) || stat.requestVehicle,
          vehicleCount: stat.vehicleCount,
          transportFeeAvg: stat.transportFeeAvg,
          region,
          city,
        });
      });
    });

    // 선택된 월로 필터링
    const filtered = selectedMonth === 'all' 
      ? allStats 
      : allStats.filter(item => item.monthKey === selectedMonth);

    // 차량 코드를 이름으로 변환
    const transformedData = filtered.map(item => ({
      ...item,
      requestVehicleName: requestVehicleMap.get(item.requestVehicle) || item.requestVehicle,
    }));

    // 정렬: 지역, 시군구, 차량순 (이름으로 정렬)
    return transformedData.sort((a, b) => {
      const regionCompare = a.region.localeCompare(b.region, 'ko');
      if (regionCompare !== 0) return regionCompare;
      
      const cityCompare = a.city.localeCompare(b.city, 'ko');
      if (cityCompare !== 0) return cityCompare;
      
      return a.requestVehicleName.localeCompare(b.requestVehicleName, 'ko');
    });
  }, [monthlyLoadingStats, selectedMonth, requestVehicleMap]);

  // 사용 가능한 월 목록
  const availableMonths = React.useMemo(() => {
    return monthlyLoadingStats.map(({ monthKey, monthLabel }) => ({
      value: monthKey,
      label: monthLabel,
    }));
  }, [monthlyLoadingStats]);

  // 상태 변경 이력에서 상태 정보 추출
  const getStatusChangeInfo = (history: any) => {
    const statusField = history.changedFields?.status;
    if (statusField) {
      return {
        oldStatus: statusField.old ? statusLabels[statusField.old] || statusField.old : null,
        newStatus: statusField.new ? statusLabels[statusField.new] || statusField.new : null,
      };
    }
    // changedFields에 없으면 oldData/newData에서 확인
    const oldStatus = history.oldData?.status;
    const newStatus = history.newData?.status;
    return {
      oldStatus: oldStatus ? statusLabels[oldStatus] || oldStatus : null,
      newStatus: newStatus ? statusLabels[newStatus] || newStatus : null,
    };
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-6 pb-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
            <p className="text-muted-foreground">
              운송관리 각 상태별 현황을 한눈에 확인할 수 있습니다.
            </p>
          </div>
          {/* 새로고침 컨트롤 */}
          <div className="flex flex-col gap-2 md:items-end md:min-w-[200px]">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isFetchingDispatches || isFetchingHistory ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>갱신 중...</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3" />
                    <span>마지막 갱신: {formatLastUpdate(dispatchesUpdatedAt)}</span>
                  </>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefresh}
                disabled={isFetchingDispatches || isFetchingHistory}
                className="h-7 px-2"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetchingDispatches || isFetchingHistory ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
            </div>
            {/* 프로그래스 바: 다음 갱신까지 진행률 표시 */}
            <Progress 
              value={progressValue} 
              className="h-1.5 w-full"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 운송 절차 카드 - 전체 화면 너비 */}
            <Card>
              <CardHeader>
                <CardTitle>운송 절차</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2 md:gap-4 justify-center py-4">
                  {/* 메인 프로세스 플로우 */}
                  {processStatuses.map((config, index) => {
                    const count = statusCounts[config.status] || 0;
                    return (
                      <React.Fragment key={config.status}>
                        <Card
                          className={cn(
                            'cursor-pointer transition-all hover:shadow-md min-w-[120px]',
                            config.color
                          )}
                          onClick={() => router.push(config.path)}
                        >
                          <CardHeader className="pb-2 pt-4">
                            <div className="flex flex-col items-center">
                              <CardTitle className="text-base text-center">{config.label}</CardTitle>
                              <div className="text-2xl font-bold mt-2">{count}</div>
                            </div>
                          </CardHeader>
                        </Card>
                        {index < processStatuses.length - 1 && (
                          <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 hidden md:block" />
                        )}
                      </React.Fragment>
                    );
                  })}
                  
                  {/* 예외 상태 (오른쪽에 배치) */}
                  <div className="hidden md:block h-12 w-px bg-border mx-2" />
                  <div className="flex gap-2 md:gap-3">
                    {exceptionStatuses.map((config) => {
                      const count = statusCounts[config.status] || 0;
                      return (
                        <Card
                          key={config.status}
                          className={cn(
                            'cursor-pointer transition-all hover:shadow-md min-w-[120px]',
                            config.color
                          )}
                          onClick={() => router.push(config.path)}
                        >
                          <CardHeader className="pb-2 pt-4">
                            <div className="flex flex-col items-center">
                              <CardTitle className="text-base text-center">{config.label}</CardTitle>
                              <div className="text-2xl font-bold mt-2">{count}</div>
                            </div>
                          </CardHeader>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 최근 변경 이력 및 상차일정 집계 - 2열 레이아웃 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 최근 변경 이력 카드 */}
              <Card className="flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    최근 변경 이력
                  </CardTitle>
                  <CardDescription>
                    최근 10개의 변경 내역(생성, 수정, 삭제, 상태 변경)을 최신순으로 확인할 수 있습니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden flex flex-col">
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : historyError ? (
                  <div className="text-center py-8 text-red-500">
                    <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                    <div>이력 조회 중 오류가 발생했습니다.</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {historyError instanceof Error ? historyError.message : '알 수 없는 오류'}
                    </div>
                  </div>
                ) : allChanges.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    변경 이력이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2">
                {allChanges.map((history) => {
                  const statusInfo = getStatusChangeInfo(history);
                  
                  // 변경 타입별 라벨 및 색상
                  const changeTypeLabels: Record<string, { label: string; className: string }> = {
                    CREATE: { label: '생성', className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300' },
                    UPDATE: { label: '수정', className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300' },
                    STATUS_CHANGE: { label: '상태 변경', className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300' },
                    DELETE: { label: '삭제', className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300' },
                  };
                  
                  const typeInfo = changeTypeLabels[history.changeType] || { label: history.changeType, className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300' };
                  
                  // 운송번호 가져오기 (newData 우선, 없으면 oldData)
                  const transportNumber = history.newData?.orderNumber || history.oldData?.orderNumber;
                  
                  return (
                    <div
                      key={history.id}
                      className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        // 배차 상세 페이지로 이동 (상태에 따라 다른 페이지) - 배차 ID를 쿼리 파라미터로 전달
                        const dispatchId = history.entityId;
                        const status = history.newData?.status || history.oldData?.status;
                        if (status === 'DRAFT') {
                          router.push(`/transport/dispatch-request?id=${dispatchId}`);
                        } else if (status === 'DISPATCHING') {
                          router.push(`/transport/dispatch-dispatching?id=${dispatchId}`);
                        } else if (status === 'DISPATCH_COMPLETED') {
                          router.push(`/transport/dispatch-completed?id=${dispatchId}`);
                        } else if (status === 'ASSIGNED') {
                          router.push(`/transport/loading?id=${dispatchId}`);
                        } else if (status === 'LOADING_COMPLETED') {
                          router.push(`/transport/loading-completed?id=${dispatchId}`);
                        } else if (status === 'UNLOADING_COMPLETED') {
                          router.push(`/transport/unloading-completed?id=${dispatchId}`);
                        } else if (status === 'FAILED') {
                          router.push(`/transport/dispatch-failed?id=${dispatchId}`);
                        } else if (status === 'RESCHEDULED') {
                          router.push(`/transport/dispatch-rescheduled?id=${dispatchId}`);
                        }
                      }}
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={typeInfo.className}>
                            {typeInfo.label}
                          </Badge>
                          <span className="font-semibold text-sm font-mono">
                            {transportNumber || `배차 #${history.entityId}`}
                          </span>
                          {statusInfo.oldStatus && statusInfo.newStatus && (
                            <span className="text-sm text-muted-foreground">
                              {statusInfo.oldStatus} → {statusInfo.newStatus}
                            </span>
                          )}
                        </div>
                        {history.description && (
                          <div className="text-xs text-muted-foreground">
                            {history.description}
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(history.changedAt)}
                          </div>
                          {history.changedByUser && (
                            <div className="flex items-center gap-1">
                              <UserIcon className="h-3 w-3" />
                              {history.changedByUser.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                  })}
                  </div>
                )}
                </CardContent>
              </Card>

              {/* 상차일정 월별 집계 카드 */}
              <Card className="flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        상차일정 월별 집계
                      </CardTitle>
                      <CardDescription>
                        상차일정별 요청차량, 지역(시군구), 운송비를 확인할 수 있습니다.
                      </CardDescription>
                    </div>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="년월 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        {availableMonths.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden flex flex-col">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : tableData.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      상차일정 데이터가 없습니다.
                    </div>
                  ) : (
                    <div className="overflow-y-auto max-h-[600px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[150px] text-base">지역</TableHead>
                            <TableHead className="w-[150px] text-base">시군구</TableHead>
                            <TableHead className="w-[150px] text-base">차량</TableHead>
                            <TableHead className="w-[120px] text-right text-base">평균 가격</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.map((row, index) => {
                            const avgInManwon = row.transportFeeAvg / 10000;
                            const formattedPrice = row.transportFeeAvg > 0 && isFinite(row.transportFeeAvg)
                              ? (Math.round(avgInManwon) === 0 && avgInManwon > 0
                                  ? `${avgInManwon.toFixed(1)}만원`
                                  : `${Math.round(avgInManwon).toLocaleString('ko-KR')}만원`)
                              : '-';
                            
                            return (
                              <TableRow key={index}>
                                <TableCell className="font-medium text-base">{row.region}</TableCell>
                                <TableCell className="text-base">{row.city || '-'}</TableCell>
                                <TableCell className="text-base">{row.requestVehicleName}</TableCell>
                                <TableCell className="text-right font-semibold text-primary text-base">
                                  {formattedPrice}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

