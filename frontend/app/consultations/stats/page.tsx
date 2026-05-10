'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import dynamic from 'next/dynamic';
import { useUsers } from '@/lib/hooks/use-users';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { differenceInCalendarDays, endOfWeek, format, parseISO, startOfMonth, endOfMonth, startOfWeek } from 'date-fns';
const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });

export default function ConsultationsStatsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedManager, setSelectedManager] = useState<string>('__all__');
  const [periodType, setPeriodType] = useState<'day' | 'week' | 'month'>('day');
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const today = new Date();
    return startOfMonth(today);
  });
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    const today = new Date();
    return endOfMonth(today);
  });

  useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const { data: salesUsersResponse } = useUsers({
    page: 1,
    limit: 100,
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
    roleCode: 'ROLE_SALES',
  });
  const salesUsers = salesUsersResponse?.data ?? [];
  const { data: speciesCodes } = useCodesByCategory('SPECIES');
  const { data: operationSubtypeCodes } = useCodesByCategory('OPERATION_SUBTYPE');
  const { data: consultationTypeCodes } = useCodeMastersByGroup('CONSULTATION_TYPE');

  const speciesLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    (speciesCodes ?? []).forEach((code) => {
      const key = (code.value ?? code.name ?? '').trim();
      const label = (code.name ?? code.value ?? '').trim();
      if (key) {
        map.set(key, label || key);
      }
    });
    map.set('UNKNOWN', '기타');
    return map;
  }, [speciesCodes]);

  const operationSubtypeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    (operationSubtypeCodes ?? []).forEach((code) => {
      const key = (code.value ?? code.name ?? '').trim();
      const label = (code.name ?? code.value ?? '').trim();
      if (key) {
        map.set(key, label || key);
      }
    });
    map.set('UNKNOWN', '기타');
    return map;
  }, [operationSubtypeCodes]);

  const consultationTypeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    (consultationTypeCodes ?? []).forEach((code) => {
      const key = (code.value ?? code.name ?? '').trim();
      const label = (code.name ?? code.value ?? '').trim();
      if (key) {
        map.set(key, label || key);
      }
    });
    map.set('UNKNOWN', '기타');
    return map;
  }, [consultationTypeCodes]);

  const periodRange = useMemo(() => {
    if (!startDate || !endDate) {
      return { startDate: undefined, endDate: undefined };
    }
    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
    };
  }, [startDate, endDate]);

  const getErrorMessage = (error: unknown) => {
    if (!error) return '데이터를 불러오는 중 오류가 발생했습니다.';
    if (typeof error === 'object' && error && 'response' in error) {
      const response = (error as { response?: { data?: { message?: string } } }).response;
      if (response?.data?.message) {
        return response.data.message;
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
    return '데이터를 불러오는 중 오류가 발생했습니다.';
  };

  // 일별 상담 통계 조회
  const { data: dailyStats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: [
      'consultations',
      'daily-stats',
      periodRange.startDate,
      periodRange.endDate,
      selectedManager,
    ],
    queryFn: async () => {
      if (!periodRange.startDate || !periodRange.endDate) {
        return [];
      }
      const params = new URLSearchParams({
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
      });
      if (selectedManager !== '__all__') {
        params.append('managerId', selectedManager);
      }
      const response = await api.get<Array<{ date: string; count: number }>>(
        `/consultations/stats/daily?${params.toString()}`,
      );
      return response.data;
    },
    enabled: !!periodRange.startDate && !!periodRange.endDate,
  });

  const {
    data: regionStats,
    isLoading: regionLoading,
    error: regionError,
  } = useQuery({
    queryKey: [
      'consultations',
      'region-stats',
      periodRange.startDate,
      periodRange.endDate,
      selectedManager,
    ],
    queryFn: async () => {
      if (!periodRange.startDate || !periodRange.endDate) {
        return [];
      }
      const params = new URLSearchParams({
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
      });
      if (selectedManager !== '__all__') {
        params.append('managerId', selectedManager);
      }
      const response = await api.get<Array<{ region: string; count: number }>>(
        `/consultations/stats/regions?${params.toString()}`,
      );
      return response.data;
    },
    enabled: !!periodRange.startDate && !!periodRange.endDate,
  });

  const regionChartData = useMemo(() => {
    if (!regionStats || regionStats.length === 0) {
      return { categories: [], series: [] };
    }
    const categories = regionStats.map((item) =>
      item.region === 'UNKNOWN' ? '미정' : item.region,
    );
    const series = regionStats.map((item) => item.count);
    return { categories, series };
  }, [regionStats]);

  const {
    data: speciesStats,
    isLoading: speciesLoading,
    error: speciesError,
  } = useQuery({
    queryKey: [
      'consultations',
      'species-stats',
      periodRange.startDate,
      periodRange.endDate,
      selectedManager,
    ],
    queryFn: async () => {
      if (!periodRange.startDate || !periodRange.endDate) {
        return [];
      }
      const params = new URLSearchParams({
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
      });
      if (selectedManager !== '__all__') {
        params.append('managerId', selectedManager);
      }
      const response = await api.get<Array<{ species: string; count: number }>>(
        `/consultations/stats/species?${params.toString()}`,
      );
      return response.data;
    },
    enabled: !!periodRange.startDate && !!periodRange.endDate,
  });

  const speciesChartData = useMemo(() => {
    if (!speciesStats || speciesStats.length === 0) {
      return { labels: [], series: [] };
    }
    const labels: string[] = [];
    const series: number[] = [];
    speciesStats.forEach((item) => {
      const label =
        speciesLabelMap.get((item.species ?? '').trim()) ||
        item.species ||
        '기타';
      labels.push(label);
      series.push(item.count);
    });
    return { labels, series };
  }, [speciesStats, speciesLabelMap]);

  // 한우 세부 분류 통계
  const {
    data: beefSubtypeStats,
    isLoading: beefSubtypeLoading,
    error: beefSubtypeError,
  } = useQuery({
    queryKey: [
      'consultations',
      'beef-subtype-stats',
      periodRange.startDate,
      periodRange.endDate,
      selectedManager,
    ],
    queryFn: async () => {
      if (!periodRange.startDate || !periodRange.endDate) {
        return [];
      }
      const params = new URLSearchParams({
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
        operationType: 'BEEF',
      });
      if (selectedManager !== '__all__') {
        params.append('managerId', selectedManager);
      }
      const response = await api.get<Array<{ operationSub: string; count: number }>>(
        `/consultations/stats/operation-subtype?${params.toString()}`,
      );
      return response.data;
    },
    enabled: !!periodRange.startDate && !!periodRange.endDate,
  });

  const beefSubtypeChartData = useMemo(() => {
    if (!beefSubtypeStats || beefSubtypeStats.length === 0) {
      return { labels: [], series: [] };
    }
    const labels: string[] = [];
    const series: number[] = [];
    beefSubtypeStats.forEach((item) => {
      const label =
        operationSubtypeLabelMap.get((item.operationSub ?? '').trim()) ||
        item.operationSub ||
        '기타';
      labels.push(label);
      series.push(item.count);
    });
    return { labels, series };
  }, [beefSubtypeStats, operationSubtypeLabelMap]);

  // 상담유형별 통계
  const {
    data: consultationTypeStats,
    isLoading: consultationTypeLoading,
    error: consultationTypeError,
  } = useQuery({
    queryKey: [
      'consultations',
      'consultation-type-stats',
      periodRange.startDate,
      periodRange.endDate,
      selectedManager,
    ],
    queryFn: async () => {
      if (!periodRange.startDate || !periodRange.endDate) {
        return [];
      }
      const params = new URLSearchParams({
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
      });
      if (selectedManager !== '__all__') {
        params.append('managerId', selectedManager);
      }
      const response = await api.get<Array<{ type: string; count: number }>>(
        `/consultations/stats/consultation-types?${params.toString()}`,
      );
      return response.data;
    },
    enabled: !!periodRange.startDate && !!periodRange.endDate,
  });

  const consultationTypeChartData = useMemo(() => {
    if (!consultationTypeStats || consultationTypeStats.length === 0) {
      return { labels: [], series: [] };
    }
    const labels: string[] = [];
    const series: number[] = [];
    consultationTypeStats.forEach((item) => {
      const raw = (item.type ?? '').trim();
      const label = consultationTypeLabelMap.get(raw) || raw || '기타';
      labels.push(label);
      series.push(item.count);
    });
    return { labels, series };
  }, [consultationTypeStats, consultationTypeLabelMap]);

  // 그래프 데이터 준비 (일/주/월 단위로 집계)
  const chartData = useMemo(() => {
    if (!periodRange.startDate || !periodRange.endDate || !dailyStats) {
      return { categories: [], series: [] };
    }

    const statsMap = new Map<string, number>();
    (dailyStats ?? []).forEach((stat) => {
      statsMap.set(stat.date, stat.count);
    });

    const start = parseISO(periodRange.startDate);
    const end = parseISO(periodRange.endDate);
    const categories: string[] = [];
    const series: number[] = [];

    if (periodType === 'day') {
      // 일별 집계: 각 날짜별로 표시
      const totalDays = differenceInCalendarDays(end, start) + 1;
    for (let i = 0; i < totalDays; i += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);
      const dateKey = format(current, 'yyyy-MM-dd');
      categories.push(format(current, 'M월 d일'));
      series.push(statsMap.get(dateKey) ?? 0);
      }
    } else if (periodType === 'week') {
      // 주별 집계: 각 주의 시작일을 기준으로 집계
      const weekMap = new Map<string, number>();
      const totalDays = differenceInCalendarDays(end, start) + 1;
      
      for (let i = 0; i < totalDays; i += 1) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        const weekStart = startOfWeek(current, { weekStartsOn: 1 });
        const weekKey = format(weekStart, 'yyyy-MM-dd');
        const dateKey = format(current, 'yyyy-MM-dd');
        const count = statsMap.get(dateKey) ?? 0;
        weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + count);
      }

      // 주별 데이터를 정렬하여 표시
      const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      sortedWeeks.forEach(([weekKey, count]) => {
        const weekStart = parseISO(weekKey);
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        categories.push(`${format(weekStart, 'M월 d일')} ~ ${format(weekEnd, 'M월 d일')}`);
        series.push(count);
      });
    } else {
      // 월별 집계: 각 월을 기준으로 집계
      const monthMap = new Map<string, number>();
      const totalDays = differenceInCalendarDays(end, start) + 1;
      
      for (let i = 0; i < totalDays; i += 1) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        const monthStart = startOfMonth(current);
        const monthKey = format(monthStart, 'yyyy-MM');
        const dateKey = format(current, 'yyyy-MM-dd');
        const count = statsMap.get(dateKey) ?? 0;
        monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + count);
      }

      // 월별 데이터를 정렬하여 표시
      const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      sortedMonths.forEach(([monthKey, count]) => {
        const monthStart = parseISO(monthKey + '-01');
        categories.push(format(monthStart, 'yyyy년 M월'));
        series.push(count);
      });
    }

    return { categories, series };
  }, [dailyStats, periodRange, periodType]);


  // 통계 계산
  const totalConsultations = useMemo(() => {
    if (!dailyStats) return 0;
    return dailyStats.reduce((sum, stat) => sum + stat.count, 0);
  }, [dailyStats]);

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
            <h1 className="text-2xl font-bold">상담 통계</h1>
            <p className="text-sm text-muted-foreground">
              상담 담당자와 기간을 선택해 추이를 확인하세요.
            </p>
          </div>
        </div>

        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex w-full items-center gap-2 md:w-auto">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  상담자
                </Label>
                <Select
                  value={selectedManager}
                  onValueChange={(value) => setSelectedManager(value)}
                >
                  <SelectTrigger className="w-48 md:w-60" size="sm">
                    <SelectValue placeholder="상담자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {salesUsers.map((manager) => (
                      <SelectItem key={manager.id} value={String(manager.id)}>
                        {manager.name || manager.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full items-center gap-2 md:w-auto">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  검색 기간
                </Label>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                  className="w-48 md:w-60"
                />
              </div>

              <div className="flex w-full items-center gap-2 md:w-auto">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  집계 단위
                </Label>
                <Select
                  value={periodType}
                  onValueChange={(value) => setPeriodType(value as 'day' | 'week' | 'month')}
                >
                  <SelectTrigger className="w-32" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">일별</SelectItem>
                    <SelectItem value="week">주별</SelectItem>
                    <SelectItem value="month">월별</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-lg border border-dashed bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            선택된 조건의 총 상담 수는{' '}
            <span className="font-semibold text-foreground">{totalConsultations}건</span>입니다.
          </p>
        </div>

        {/* 차트 레이아웃: 2:1 비율 */}
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          {/* 왼쪽: 2 부분 - 일별 상담 추이, 지역별 상담 건수 (세로 배치) */}
          <div className="space-y-4">
            {/* 일별 상담 추이 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {periodType === 'day' ? '일별' : periodType === 'week' ? '주별' : '월별'} 상담 추이
                    </CardTitle>
                    <CardDescription>
                      선택한 조건에 해당하는 {periodType === 'day' ? '일일' : periodType === 'week' ? '주별' : '월별'} 상담 건수를 확인하세요.
                    </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                </div>
              </div>
            ) : statsError ? (
              <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
                <div className="text-center">
                  <p className="text-sm text-destructive">데이터를 불러오는 중 오류가 발생했습니다.</p>
                  <p className="text-xs text-muted-foreground mt-1">{getErrorMessage(statsError)}</p>
                </div>
              </div>
            ) : chartData.categories.length === 0 ? (
              <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
                <p className="text-sm text-muted-foreground">해당 기간의 상담 데이터가 없습니다.</p>
              </div>
            ) : (
              <div className="w-full" style={{ minHeight: '400px' }}>
                <Chart
                  type="bar"
                  height={400}
                  series={[
                    {
                      name: '상담 건수',
                      data: chartData.series,
                    },
                  ]}
                  options={{
                    chart: {
                      type: 'bar',
                      height: 400,
                      toolbar: {
                        show: true,
                      },
                      zoom: {
                        enabled: true,
                      },
                    },
                    plotOptions: {
                      bar: {
                        borderRadius: 4,
                        columnWidth: '60%',
                        dataLabels: {
                          position: 'top',
                        },
                      },
                    },
                    dataLabels: {
                      enabled: true,
                      formatter: (val: number) => val > 0 ? `${val}` : '',
                      offsetY: -20,
                      style: {
                        fontSize: '12px',
                        colors: ['#304758'],
                      },
                    },
                    xaxis: {
                      categories: chartData.categories,
                      title: {
                            text: periodType === 'day' ? '일' : periodType === 'week' ? '주' : '월',
                      },
                    },
                    yaxis: {
                      title: {
                        text: '상담 건수',
                      },
                      min: 0,
                      forceNiceScale: true,
                    },
                    tooltip: {
                      y: {
                        formatter: (value: number) => `${value}건`,
                      },
                    },
                    colors: ['#3b82f6'],
                    grid: {
                      borderColor: '#e5e7eb',
                    },
                    responsive: [
                      {
                        breakpoint: 768,
                        options: {
                          chart: {
                            height: 300,
                          },
                          dataLabels: {
                            enabled: false,
                          },
                        },
                      },
                    ],
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

            {/* 지역별 상담 건수 */}
            <Card>
              <CardHeader>
                <CardTitle>지역별 상담 건수</CardTitle>
                <CardDescription>선택한 조건에 해당하는 상담의 지역 분포입니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {regionLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : regionError ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-destructive">데이터를 불러오는 중 오류가 발생했습니다.</p>
                      <p className="mt-1 text-xs text-muted-foreground">{getErrorMessage(regionError)}</p>
                    </div>
                  </div>
                ) : regionChartData.categories.length === 0 ? (
                  <div className="flex h-64 items-center justify-center">
                    <p className="text-sm text-muted-foreground">해당 조건의 지역 데이터가 없습니다.</p>
                  </div>
                ) : (
                  <div className="w-full">
                    <Chart
                      type="bar"
                      height={480}
                      series={[
                        {
                          name: '상담 수',
                          data: regionChartData.series,
                        },
                      ]}
                      options={{
                        chart: {
                          type: 'bar',
                          height: 480,
                        },
                        plotOptions: {
                          bar: {
                            horizontal: true,
                            borderRadius: 4,
                          },
                        },
                        dataLabels: {
                          enabled: true,
                          formatter: (val: number) => `${val}건`,
                        },
                        xaxis: {
                          categories: regionChartData.categories,
                          title: {
                            text: '상담 수',
                          },
                        },
                        yaxis: {
                          labels: {
                            style: {
                              fontSize: '12px',
                            },
                          },
                        },
                        tooltip: {
                          y: {
                            formatter: (value: number) => `${value}건`,
                          },
                        },
                        colors: ['#22c55e'],
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 오른쪽: 축종별, 한우 세부, 상담유형 파이 차트 (세로 배치) */}
          <div className="space-y-4">
            {/* 축종별 상담 비중 */}
            <Card>
              <CardHeader>
                <CardTitle>축종별 상담 비중</CardTitle>
                <CardDescription>선택한 조건에 해당하는 상담 중 축종별 비율입니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {speciesLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : speciesError ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-destructive">데이터를 불러오는 중 오류가 발생했습니다.</p>
                      <p className="mt-1 text-xs text-muted-foreground">{getErrorMessage(speciesError)}</p>
                    </div>
                  </div>
                ) : speciesChartData.labels.length === 0 ? (
                  <div className="flex h-64 items-center justify-center">
                    <p className="text-sm text-muted-foreground">해당 조건의 축종 데이터가 없습니다.</p>
                  </div>
                ) : (
                  <div className="w-full">
                    <Chart
                      type="pie"
                      height={250}
                      series={speciesChartData.series}
                      options={{
                        labels: speciesChartData.labels,
                        legend: {
                          position: 'right',
                          fontSize: '12px',
                        },
                        dataLabels: {
                          enabled: true,
                          formatter: (val: number) => `${val.toFixed(1)}%`,
                        },
                        tooltip: {
                          shared: false,
                          fillSeriesColor: false,
                          style: {
                            fontSize: '12px',
                          },
                          y: {
                            formatter: (value: number) => `${value}건`,
                          },
                        },
                        stroke: {
                          width: 1,
                        },
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 한우 세부 분류 */}
            <Card>
              <CardHeader>
                <CardTitle>한우 세부 분류</CardTitle>
                <CardDescription>선택한 조건에 해당하는 한우 운영방식 세부 분류 비율입니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {beefSubtypeLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : beefSubtypeError ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-destructive">데이터를 불러오는 중 오류가 발생했습니다.</p>
                      <p className="mt-1 text-xs text-muted-foreground">{getErrorMessage(beefSubtypeError)}</p>
                    </div>
                  </div>
                ) : beefSubtypeChartData.labels.length === 0 ? (
                  <div className="flex h-64 items-center justify-center">
                    <p className="text-sm text-muted-foreground">해당 조건의 한우 세부 분류 데이터가 없습니다.</p>
                  </div>
                ) : (
                  <div className="w-full">
                    <Chart
                      type="pie"
                      height={250}
                      series={beefSubtypeChartData.series}
                      options={{
                        labels: beefSubtypeChartData.labels,
                        legend: {
                          position: 'right',
                          fontSize: '12px',
                        },
                        dataLabels: {
                          enabled: true,
                          formatter: (val: number) => `${val.toFixed(1)}%`,
                        },
                        tooltip: {
                          shared: false,
                          fillSeriesColor: false,
                          style: {
                            fontSize: '12px',
                          },
                          y: {
                            formatter: (value: number) => `${value}건`,
                          },
                        },
                        stroke: {
                          width: 1,
                        },
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 상담유형 */}
            <Card>
              <CardHeader>
                <CardTitle>상담유형</CardTitle>
                <CardDescription>선택한 조건에 해당하는 상담의 상담유형별 비율입니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {consultationTypeLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                    </div>
                  </div>
                ) : consultationTypeError ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-destructive">데이터를 불러오는 중 오류가 발생했습니다.</p>
                      <p className="mt-1 text-xs text-muted-foreground">{getErrorMessage(consultationTypeError)}</p>
                    </div>
                  </div>
                ) : consultationTypeChartData.labels.length === 0 ? (
                  <div className="flex h-64 items-center justify-center">
                    <p className="text-sm text-muted-foreground">해당 조건의 상담유형 데이터가 없습니다.</p>
                  </div>
                ) : (
                  <div className="w-full">
                    <Chart
                      type="pie"
                      height={250}
                      series={consultationTypeChartData.series}
                      options={{
                        labels: consultationTypeChartData.labels,
                        legend: {
                          position: 'right',
                          fontSize: '12px',
                        },
                        dataLabels: {
                          enabled: true,
                          formatter: (val: number) => `${val.toFixed(1)}%`,
                        },
                        tooltip: {
                          shared: false,
                          fillSeriesColor: false,
                          style: {
                            fontSize: '12px',
                          },
                          y: {
                            formatter: (value: number) => `${value}건`,
                          },
                        },
                        stroke: {
                          width: 1,
                        },
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

