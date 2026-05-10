'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useCustomerStats } from '@/lib/hooks/use-customers';
import { useCodesByCategory } from '@/lib/hooks/use-codes';

const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });

const LoadingPlaceholder = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
      <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
    </div>
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex h-64 items-center justify-center">
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

export default function CustomersDashboardPage() {
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const { data: stats, isLoading, error, refetch } = useCustomerStats();
  const { data: speciesCodes } = useCodesByCategory('SPECIES');
  const { data: operationSubtypeCodes } = useCodesByCategory('OPERATION_SUBTYPE');

  const speciesMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (speciesCodes ?? []).forEach((code) => {
      const key = (code.value ?? code.name ?? '').trim();
      const label = (code.name ?? code.value ?? '').trim();
      if (key) {
        map.set(key, label || key);
      }
    });
    return map;
  }, [speciesCodes]);

  const operationSubtypeLabelMap = React.useMemo(() => {
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

  const speciesStats = stats?.bySpecies ?? [];
  const regionAndSpeciesStats = stats?.byRegionAndSpecies ?? [];
  const regionAndBeefSubtypeStats = stats?.byRegionAndBeefSubtype ?? [];
  const regionAndDairySubtypeStats = stats?.byRegionAndDairySubtype ?? [];

  const speciesLabels = React.useMemo(
    () =>
      speciesStats.map((entry) => {
        const key = entry.species?.trim();
        if (!key || key === '미지정') {
          return '미지정';
        }
        return speciesMap.get(key) ?? key;
      }),
    [speciesStats, speciesMap],
  );
  const speciesSeries = React.useMemo(
    () => speciesStats.map((entry) => entry.count),
    [speciesStats],
  );

  // 지역별 축종 분포 차트 데이터 (스택형 바)
  const regionSpeciesChartData = React.useMemo(() => {
    if (regionAndSpeciesStats.length === 0) {
      return { categories: [], series: [] };
    }
    const regionTotals = new Map<string, number>();
    const regionSpeciesMap = new Map<string, Map<string, number>>();
    regionAndSpeciesStats.forEach((entry) => {
      const r = entry.region || '미지정';
      const s = entry.species?.trim() || '미지정';
      regionTotals.set(r, (regionTotals.get(r) || 0) + entry.count);
      if (!regionSpeciesMap.has(r)) {
        regionSpeciesMap.set(r, new Map());
      }
      regionSpeciesMap.get(r)!.set(s, (regionSpeciesMap.get(r)!.get(s) || 0) + entry.count);
    });
    const categories = Array.from(regionTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([r]) => r);
    const speciesSet = new Set<string>();
    regionAndSpeciesStats.forEach((e) => speciesSet.add(e.species?.trim() || '미지정'));
    const speciesOrder = speciesStats
      .map((s) => s.species?.trim() || '미지정')
      .filter((s) => speciesSet.has(s));
    speciesSet.forEach((s) => {
      if (!speciesOrder.includes(s)) speciesOrder.push(s);
    });
    const series = speciesOrder.map((species) => ({
      name: speciesMap.get(species) ?? species,
      data: categories.map((region) => regionSpeciesMap.get(region)?.get(species) || 0),
    }));
    return { categories, series };
  }, [regionAndSpeciesStats, speciesMap, speciesStats]);

  // 지역별 축종 분포 - 통합 레전드용 (바/파이 동일 순서)
  const regionSpeciesLegendData = React.useMemo(() => {
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return regionSpeciesChartData.series.map((s, i) => ({
      name: s.name,
      color: colors[i % colors.length],
    }));
  }, [regionSpeciesChartData.series]);

  const regionSpeciesPieData = React.useMemo(() => {
    if (regionSpeciesChartData.series.length === 0) return { labels: [] as string[], series: [] as number[] };
    return {
      labels: regionSpeciesChartData.series.map((s) => s.name),
      series: regionSpeciesChartData.series.map((s) => s.data.reduce((a, b) => a + b, 0)),
    };
  }, [regionSpeciesChartData.series]);

  const speciesTabTotal = React.useMemo(
    () => regionSpeciesPieData.series.reduce((a, b) => a + b, 0),
    [regionSpeciesPieData.series],
  );

  // 지역별 한우 세부 분포 차트 데이터 (스택형 바)
  const regionBeefSubtypeChartData = React.useMemo(() => {
    if (regionAndBeefSubtypeStats.length === 0) {
      return { categories: [], series: [] };
    }
    const regionTotals = new Map<string, number>();
    const regionSubtypeMap = new Map<string, Map<string, number>>();
    const subtypeTotals = new Map<string, number>();
    regionAndBeefSubtypeStats.forEach((entry) => {
      const r = entry.region || '미지정';
      const s = entry.operationSub?.trim() || '미지정';
      regionTotals.set(r, (regionTotals.get(r) || 0) + entry.count);
      subtypeTotals.set(s, (subtypeTotals.get(s) || 0) + entry.count);
      if (!regionSubtypeMap.has(r)) {
        regionSubtypeMap.set(r, new Map());
      }
      regionSubtypeMap.get(r)!.set(s, (regionSubtypeMap.get(r)!.get(s) || 0) + entry.count);
    });
    const categories = Array.from(regionTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([r]) => r);
    const subtypeOrder = Array.from(subtypeTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s);
    const series = subtypeOrder.map((subtype) => ({
      name: operationSubtypeLabelMap.get(subtype) ?? subtype,
      data: categories.map((region) => regionSubtypeMap.get(region)?.get(subtype) || 0),
    }));
    return { categories, series };
  }, [regionAndBeefSubtypeStats, operationSubtypeLabelMap]);

  const regionBeefSubtypeLegendData = React.useMemo(() => {
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return regionBeefSubtypeChartData.series.map((s, i) => ({
      name: s.name,
      color: colors[i % colors.length],
    }));
  }, [regionBeefSubtypeChartData.series]);

  const regionBeefSubtypePieData = React.useMemo(() => {
    if (regionBeefSubtypeChartData.series.length === 0) return { labels: [] as string[], series: [] as number[] };
    return {
      labels: regionBeefSubtypeChartData.series.map((s) => s.name),
      series: regionBeefSubtypeChartData.series.map((s) => s.data.reduce((a, b) => a + b, 0)),
    };
  }, [regionBeefSubtypeChartData.series]);

  const beefTabTotal = React.useMemo(
    () => regionBeefSubtypePieData.series.reduce((a, b) => a + b, 0),
    [regionBeefSubtypePieData.series],
  );

  // 지역별 낙농 세부 분포 차트 데이터 (스택형 바)
  const regionDairySubtypeChartData = React.useMemo(() => {
    if (regionAndDairySubtypeStats.length === 0) {
      return { categories: [], series: [] };
    }
    const regionTotals = new Map<string, number>();
    const regionSubtypeMap = new Map<string, Map<string, number>>();
    const subtypeTotals = new Map<string, number>();
    regionAndDairySubtypeStats.forEach((entry) => {
      const r = entry.region || '미지정';
      const s = entry.operationSub?.trim() || '미지정';
      regionTotals.set(r, (regionTotals.get(r) || 0) + entry.count);
      subtypeTotals.set(s, (subtypeTotals.get(s) || 0) + entry.count);
      if (!regionSubtypeMap.has(r)) {
        regionSubtypeMap.set(r, new Map());
      }
      regionSubtypeMap.get(r)!.set(s, (regionSubtypeMap.get(r)!.get(s) || 0) + entry.count);
    });
    const categories = Array.from(regionTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([r]) => r);
    const subtypeOrder = Array.from(subtypeTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s);
    const series = subtypeOrder.map((subtype) => ({
      name: operationSubtypeLabelMap.get(subtype) ?? subtype,
      data: categories.map((region) => regionSubtypeMap.get(region)?.get(subtype) || 0),
    }));
    return { categories, series };
  }, [regionAndDairySubtypeStats, operationSubtypeLabelMap]);

  const regionDairySubtypeLegendData = React.useMemo(() => {
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return regionDairySubtypeChartData.series.map((s, i) => ({
      name: s.name,
      color: colors[i % colors.length],
    }));
  }, [regionDairySubtypeChartData.series]);

  const regionDairySubtypePieData = React.useMemo(() => {
    if (regionDairySubtypeChartData.series.length === 0) return { labels: [] as string[], series: [] as number[] };
    return {
      labels: regionDairySubtypeChartData.series.map((s) => s.name),
      series: regionDairySubtypeChartData.series.map((s) => s.data.reduce((a, b) => a + b, 0)),
    };
  }, [regionDairySubtypeChartData.series]);

  const dairyTabTotal = React.useMemo(
    () => regionDairySubtypePieData.series.reduce((a, b) => a + b, 0),
    [regionDairySubtypePieData.series],
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">고객 현황</h1>
            <p className="text-sm text-muted-foreground">
              전체 고객 분포와 주요 지표를 확인하세요.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {stats && (
              <span>
                마지막 업데이트: {new Date().toLocaleString('ko-KR')}
              </span>
            )}
          </div>
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-destructive">데이터를 불러오지 못했습니다.</CardTitle>
              <CardDescription className="text-destructive">
                문제가 지속되면 관리자에게 문의해주세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                다시 시도
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 지역별 분포 (탭) */}
        <Card>
          <CardHeader>
            <CardTitle>지역별 분포</CardTitle>
            <CardDescription>지역별 축종·한우·낙농 세부 분포를 탭으로 확인하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="species" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="species">축종</TabsTrigger>
                <TabsTrigger value="beef">한우</TabsTrigger>
                <TabsTrigger value="dairy">낙농</TabsTrigger>
              </TabsList>

              <TabsContent value="species" className="mt-0">
                {isLoading ? (
                  <LoadingPlaceholder />
                ) : regionSpeciesChartData.categories.length === 0 && regionSpeciesPieData.series.length === 0 ? (
                  <EmptyState message="지역별 축종 데이터가 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {regionSpeciesLegendData.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3">
                        {regionSpeciesLegendData.map((item) => (
                          <div key={item.name} className="inline-flex items-center gap-1.5 px-2 py-1 text-sm">
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                            <span>{item.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                      <div className="min-h-[320px]">
                        {regionSpeciesChartData.categories.length === 0 ? (
                          <EmptyState message="지역별 축종 데이터가 없습니다." />
                        ) : (
                          <Chart
                            type="bar"
                            height={480}
                            series={regionSpeciesChartData.series}
                            options={{
                              chart: { id: 'region-species-bar', type: 'bar', height: 480, stacked: true, toolbar: { show: false } },
                              plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
                              dataLabels: { enabled: true, formatter: (val: number) => (val > 0 ? `${val}명` : '') },
                              xaxis: { categories: regionSpeciesChartData.categories, title: { text: '고객 수' } },
                              yaxis: { labels: { style: { fontSize: '12px' } } },
                              tooltip: { y: { formatter: (value: number) => `${value}명` } },
                              legend: { show: false },
                              colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                            }}
                          />
                        )}
                      </div>
                      <div className="flex flex-col justify-center">
                        {!isLoading && (
                          <p className="text-center mb-2 text-base font-semibold">고객 수: <span className="text-primary">{speciesTabTotal.toLocaleString()}</span>명</p>
                        )}
                        {regionSpeciesPieData.series.length === 0 ? (
                          <EmptyState message="축종 데이터가 없습니다." />
                        ) : (
                          <Chart
                            type="pie"
                            height={320}
                            series={regionSpeciesPieData.series}
                            options={{
                              chart: { id: 'region-species-pie', toolbar: { show: false } },
                              labels: regionSpeciesPieData.labels,
                              legend: { show: false },
                              dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
                              tooltip: { shared: false, fillSeriesColor: false, style: { fontSize: '12px' }, y: { formatter: (value: number) => `${value}명` } },
                              stroke: { width: 1 },
                              colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="beef" className="mt-0">
                {isLoading ? (
                  <LoadingPlaceholder />
                ) : regionBeefSubtypeChartData.categories.length === 0 && regionBeefSubtypePieData.series.length === 0 ? (
                  <EmptyState message="지역별 한우 세부 데이터가 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {regionBeefSubtypeLegendData.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3">
                        {regionBeefSubtypeLegendData.map((item) => (
                          <div key={item.name} className="inline-flex items-center gap-1.5 px-2 py-1 text-sm">
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                            <span>{item.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                      <div className="min-h-[320px]">
                        {regionBeefSubtypeChartData.categories.length === 0 ? (
                          <EmptyState message="지역별 한우 세부 데이터가 없습니다." />
                        ) : (
                          <Chart
                            type="bar"
                            height={480}
                            series={regionBeefSubtypeChartData.series}
                            options={{
                              chart: { type: 'bar', height: 480, stacked: true, toolbar: { show: false } },
                              plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
                              dataLabels: { enabled: true, formatter: (val: number) => (val > 0 ? `${val}명` : '') },
                              xaxis: { categories: regionBeefSubtypeChartData.categories, title: { text: '고객 수' } },
                              yaxis: { labels: { style: { fontSize: '12px' } } },
                              tooltip: { y: { formatter: (value: number) => `${value}명` } },
                              legend: { show: false },
                              colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                            }}
                          />
                        )}
                      </div>
                      <div className="flex flex-col justify-center">
                        {!isLoading && (
                          <p className="text-center mb-2 text-base font-semibold">고객 수: <span className="text-primary">{beefTabTotal.toLocaleString()}</span>명</p>
                        )}
                        {regionBeefSubtypePieData.series.length === 0 ? (
                          <EmptyState message="한우 세부 데이터가 없습니다." />
                        ) : (
                          <Chart
                            type="pie"
                            height={320}
                            series={regionBeefSubtypePieData.series}
                            options={{
                              chart: { toolbar: { show: false } },
                              labels: regionBeefSubtypePieData.labels,
                              legend: { show: false },
                              dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
                              tooltip: { shared: false, fillSeriesColor: false, style: { fontSize: '12px' }, y: { formatter: (value: number) => `${value}명` } },
                              stroke: { width: 1 },
                              colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="dairy" className="mt-0">
                {isLoading ? (
                  <LoadingPlaceholder />
                ) : regionDairySubtypeChartData.categories.length === 0 && regionDairySubtypePieData.series.length === 0 ? (
                  <EmptyState message="지역별 낙농 세부 데이터가 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {regionDairySubtypeLegendData.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3">
                        {regionDairySubtypeLegendData.map((item) => (
                          <div key={item.name} className="inline-flex items-center gap-1.5 px-2 py-1 text-sm">
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                            <span>{item.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                      <div className="min-h-[320px]">
                        {regionDairySubtypeChartData.categories.length === 0 ? (
                          <EmptyState message="지역별 낙농 세부 데이터가 없습니다." />
                        ) : (
                          <Chart
                            type="bar"
                            height={480}
                            series={regionDairySubtypeChartData.series}
                            options={{
                              chart: { type: 'bar', height: 480, stacked: true, toolbar: { show: false } },
                              plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
                              dataLabels: { enabled: true, formatter: (val: number) => (val > 0 ? `${val}명` : '') },
                              xaxis: { categories: regionDairySubtypeChartData.categories, title: { text: '고객 수' } },
                              yaxis: { labels: { style: { fontSize: '12px' } } },
                              tooltip: { y: { formatter: (value: number) => `${value}명` } },
                              legend: { show: false },
                              colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                            }}
                          />
                        )}
                      </div>
                      <div className="flex flex-col justify-center">
                        {!isLoading && (
                          <p className="text-center mb-2 text-base font-semibold">고객 수: <span className="text-primary">{dairyTabTotal.toLocaleString()}</span>명</p>
                        )}
                        {regionDairySubtypePieData.series.length === 0 ? (
                          <EmptyState message="낙농 세부 데이터가 없습니다." />
                        ) : (
                          <Chart
                            type="pie"
                            height={320}
                            series={regionDairySubtypePieData.series}
                            options={{
                              chart: { toolbar: { show: false } },
                              labels: regionDairySubtypePieData.labels,
                              legend: { show: false },
                              dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
                              tooltip: { shared: false, fillSeriesColor: false, style: { fontSize: '12px' }, y: { formatter: (value: number) => `${value}명` } },
                              stroke: { width: 1 },
                              colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}

