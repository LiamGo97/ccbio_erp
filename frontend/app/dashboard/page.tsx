'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { serializeReceivablesParams } from '@/lib/hooks/use-receivables';
import { TradeOrder, useTradeOrders } from '@/lib/hooks/use-trade-orders';
import { useQueries } from '@tanstack/react-query';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import api from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthPicker } from '@/components/schedules/month-picker';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getThisMonthDateRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function getMonthDateRange(ym: string): { from: string; to: string } {
  const [year, month] = ym.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

/** 대시보드 미수·채권 상태 — 채권관리와 동일한 경고 단위(단일 선택 API) */
const RECEIVABLE_WARNING_STATUS_ROWS: { key: string; label: string; warningStatus: string[] }[] = [
  { key: 'null', label: '정상', warningStatus: ['__null__'] },
  { key: 'WARNING_1ST', label: '1차 경고', warningStatus: ['WARNING_1ST'] },
  { key: 'WARNING_2ND', label: '2차 경고', warningStatus: ['WARNING_2ND'] },
  { key: 'WARNING_3RD', label: '3차 경고', warningStatus: ['WARNING_3RD'] },
  { key: 'MALICIOUS', label: '악성 채권', warningStatus: ['MALICIOUS'] },
];

/** 농가·유통·(기타) 비율 — 가로 스택 바 + 범례 */
function ReceivableCustomerMixBar({
  farm,
  distribution,
  total,
  dense,
  farmCustomerCount,
  distributionCustomerCount,
  totalCustomerCount,
}: {
  farm: number;
  distribution: number;
  total: number;
  dense?: boolean;
  /** 미수 거래처 수(농가 구분) — 없으면 표시 생략 */
  farmCustomerCount?: number;
  distributionCustomerCount?: number;
  /** 미수 거래처 수(전체) — 기타 구간 업체 수 = total − farm − dist */
  totalCustomerCount?: number;
}) {
  const other = Math.max(0, total - farm - distribution);
  const otherCustomerCount =
    totalCustomerCount != null && farmCustomerCount != null && distributionCustomerCount != null
      ? Math.max(0, totalCustomerCount - farmCustomerCount - distributionCustomerCount)
      : undefined;
  const barH = dense ? 'h-2' : 'h-2.5';
  /** 범례 글자: 업체별(dense)·전체 동일 크기 */
  const labelClass = 'text-xs sm:text-sm';
  const countInParens = (n?: number) =>
    n != null ? (
      <span className="text-muted-foreground/90 font-normal">({n.toLocaleString('ko-KR')}건)</span>
    ) : null;

  if (total <= 0) {
    return (
      <div
        className={`w-full rounded-full bg-muted ${barH}`}
        title="미수 잔액 없음"
        aria-label="미수 잔액 없음"
      />
    );
  }

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const pFarm = pct(farm);
  const pDist = pct(distribution);
  const pOther = pct(other);
  const label = `농가 ${pFarm.toFixed(1)}%, 유통 ${pDist.toFixed(1)}%${other > 0 ? `, 기타 ${pOther.toFixed(1)}%` : ''}`;

  return (
    <div className="space-y-1.5 min-w-0">
      <div
        className={`flex w-full min-w-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/50 ${barH}`}
        role="img"
        aria-label={`고객 구분 비율: ${label}`}
      >
        {pFarm > 0 ? (
          <div
            className="h-full min-w-0 bg-amber-500 transition-[width] dark:bg-amber-400"
            style={{ width: `${pFarm}%` }}
            title={`농가 ${formatCurrency(farm)} (${pFarm.toFixed(1)}%)`}
          />
        ) : null}
        {pDist > 0 ? (
          <div
            className="h-full min-w-0 bg-indigo-600 transition-[width] dark:bg-indigo-500"
            style={{ width: `${pDist}%` }}
            title={`유통 ${formatCurrency(distribution)} (${pDist.toFixed(1)}%)`}
          />
        ) : null}
        {pOther > 0 ? (
          <div
            className="h-full min-w-0 bg-zinc-500 dark:bg-zinc-400"
            style={{ width: `${pOther}%` }}
            title={`기타·미분류 ${formatCurrency(other)} (${pOther.toFixed(1)}%)`}
          />
        ) : null}
      </div>
      <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground ${labelClass}`}>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-amber-500 dark:bg-amber-400" aria-hidden />
          농가 <span className="font-medium text-foreground">{formatCurrency(farm)}</span>
          {countInParens(farmCustomerCount)}
          <span className="text-muted-foreground/90">({pFarm.toFixed(1)}%)</span>
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-indigo-600 dark:bg-indigo-500" aria-hidden />
          유통 <span className="font-medium text-foreground">{formatCurrency(distribution)}</span>
          {countInParens(distributionCustomerCount)}
          <span className="text-muted-foreground/90">({pDist.toFixed(1)}%)</span>
        </span>
        {other > 0 ? (
          <span className="inline-flex items-center gap-1 tabular-nums" title="고객 구분이 농가·유통 외이거나 미지정">
            <span className="h-2 w-2 shrink-0 rounded-sm bg-zinc-500 dark:bg-zinc-400" aria-hidden />
            기타 <span className="font-medium text-foreground">{formatCurrency(other)}</span>
            {countInParens(otherCustomerCount)}
            <span className="text-muted-foreground/90">({pOther.toFixed(1)}%)</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const authed = auth.isAuthenticated();
    if (!authed) {
      router.push('/login');
      return;
    }

    const fetchUser = async () => {
      const userData = await auth.getCurrentUser();
      if (!userData) {
        router.push('/login');
        return;
      }
      setUser(userData);
      setLoading(false);
    };

    fetchUser();
  }, [router]);

  const { data: suppliers = [] } = useSuppliers({ status: true });
  const { data: customerTypeCodes = [] } = useCodesByCategory('CUSTOMER_TYPE');

  /** 미수·채권 상태 카드 필터 */
  const [receivableStatusSupplierId, setReceivableStatusSupplierId] = useState<string>('');
  const [receivableStatusCustomerType, setReceivableStatusCustomerType] = useState<string>('__all__');

  const receivableStatusSupplierIds = useMemo(() => {
    if (!receivableStatusSupplierId || receivableStatusSupplierId === '') return undefined;
    if (receivableStatusSupplierId === '0') return [0];
    const n = parseInt(receivableStatusSupplierId, 10);
    return !Number.isNaN(n) && n > 0 ? [n] : undefined;
  }, [receivableStatusSupplierId]);

  /** 전체·공급사별 × (전체|농가|유통) 미수 합계 — 계산 잔액 > 0(채권)만, 0원·선수금 제외 */
  const receivableDashboardQueries = useMemo(() => {
    /** 채권 경고 EXCLUDED와 동일: 10만원 미만 미수는 집계에서 제외 */
    const base = { page: 1, limit: 1, balanceCategories: ['RECEIVABLE'], minReceivableBalance: 100_000 };
    const rows: {
      queryKey: (string | number)[];
      params: Record<string, string | number | boolean | string[]>;
    }[] = [
      { queryKey: ['dashboard-receivables', 'total', 'all'], params: { ...base } },
      { queryKey: ['dashboard-receivables', 'total', 'FARM'], params: { ...base, customerType: 'FARM' } },
      { queryKey: ['dashboard-receivables', 'total', 'DISTRIBUTION'], params: { ...base, customerType: 'DISTRIBUTION' } },
    ];
    for (const s of suppliers) {
      rows.push(
        { queryKey: ['dashboard-receivables', 'supplier', s.id, 'all'], params: { ...base, supplierIds: s.id } },
        { queryKey: ['dashboard-receivables', 'supplier', s.id, 'FARM'], params: { ...base, supplierIds: s.id, customerType: 'FARM' } },
        {
          queryKey: ['dashboard-receivables', 'supplier', s.id, 'DISTRIBUTION'],
          params: { ...base, supplierIds: s.id, customerType: 'DISTRIBUTION' },
        },
      );
    }
    return rows;
  }, [suppliers]);

  const receivableDashboardResults = useQueries({
    queries: receivableDashboardQueries.map((row) => ({
      queryKey: row.queryKey,
      queryFn: async () => {
        const response = await api.get('/receivables/customers/with-receivables', {
          params: row.params,
          paramsSerializer: serializeReceivablesParams,
        });
        return response.data as { totalBalance?: number; total?: number };
      },
    })),
  });

  const receivableSlices = useMemo(() => {
    const results = receivableDashboardResults;
    const totalAll = results[0]?.data?.totalBalance ?? 0;
    const totalFarm = results[1]?.data?.totalBalance ?? 0;
    const totalDist = results[2]?.data?.totalBalance ?? 0;
    const countAll = results[0]?.data?.total ?? 0;
    const countFarm = results[1]?.data?.total ?? 0;
    const countDist = results[2]?.data?.total ?? 0;
    const bySupplier = suppliers.map((supplier, i) => {
      const base = 3 + i * 3;
      const all = results[base]?.data?.totalBalance ?? 0;
      const farm = results[base + 1]?.data?.totalBalance ?? 0;
      const dist = results[base + 2]?.data?.totalBalance ?? 0;
      const cAll = results[base]?.data?.total ?? 0;
      const cFarm = results[base + 1]?.data?.total ?? 0;
      const cDist = results[base + 2]?.data?.total ?? 0;
      return {
        supplierId: supplier.id,
        supplierName: supplier.companyName,
        balanceAll: all,
        balanceFarm: farm,
        balanceDistribution: dist,
        customerCountAll: cAll,
        customerCountFarm: cFarm,
        customerCountDistribution: cDist,
      };
    });
    return {
      totalAll,
      totalFarm,
      totalDist,
      countAll,
      countFarm,
      countDist,
      bySupplier,
    };
  }, [receivableDashboardResults, suppliers]);

  const isLoadingReceivables = receivableDashboardResults.some((q) => q.isLoading);

  /** 미수 채권(10만 이상)·채권 상태별 totalBalance / total — 공급자·구분 필터 반영 */
  const receivableWarningStatusQueries = useMemo(() => {
    const base = {
      page: 1,
      limit: 1,
      balanceCategories: ['RECEIVABLE'],
      minReceivableBalance: 100_000,
      ...(receivableStatusCustomerType !== '__all__'
        ? { customerType: receivableStatusCustomerType }
        : {}),
      ...(receivableStatusSupplierIds ? { supplierIds: receivableStatusSupplierIds } : {}),
    };
    return RECEIVABLE_WARNING_STATUS_ROWS.map((row) => ({
      queryKey: [
        'dashboard-receivables',
        'by-warning',
        row.key,
        receivableStatusSupplierId || 'all',
        receivableStatusCustomerType,
      ] as const,
      params: {
        ...base,
        warningStatus: row.warningStatus,
      },
    }));
  }, [
    receivableStatusSupplierIds,
    receivableStatusSupplierId,
    receivableStatusCustomerType,
  ]);

  const receivableWarningStatusResults = useQueries({
    queries: receivableWarningStatusQueries.map((row) => ({
      queryKey: row.queryKey,
      queryFn: async () => {
        const response = await api.get('/receivables/customers/with-receivables', {
          params: row.params,
          paramsSerializer: serializeReceivablesParams,
        });
        return response.data as { totalBalance?: number; total?: number };
      },
    })),
  });

  const receivableWarningTableRows = useMemo(() => {
    return RECEIVABLE_WARNING_STATUS_ROWS.map((row, i) => {
      const d = receivableWarningStatusResults[i]?.data;
      return {
        key: row.key,
        label: row.label,
        totalBalance: d?.totalBalance ?? 0,
        total: d?.total ?? 0,
      };
    });
  }, [receivableWarningStatusResults]);

  const receivableWarningSumBalance = useMemo(
    () => receivableWarningTableRows.reduce((s, r) => s + r.totalBalance, 0),
    [receivableWarningTableRows],
  );
  const receivableWarningSumCount = useMemo(
    () => receivableWarningTableRows.reduce((s, r) => s + r.total, 0),
    [receivableWarningTableRows],
  );

  const isLoadingReceivableWarnings = receivableWarningStatusResults.some((q) => q.isLoading);

  const [etaMonth, setEtaMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const selectedMonth = useMemo(() => {
    const [, m] = etaMonth.split('-').map(Number);
    return m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  }, [etaMonth]);

  // 입고 예정 - 물류관리(http://localhost:3000/logistics/management/)와 동일한 조건
  const { from: etaFrom, to: etaTo } = useMemo(
    () => (etaMonth ? getMonthDateRange(etaMonth) : getThisMonthDateRange()),
    [etaMonth],
  );
  const { data: etaOrdersRaw = [], isLoading: etaLoading } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: ['BOOKING', 'DOCUMENTS', 'DO', 'CUSTOMS'],
    dateType: 'eta',
    dateFrom: etaFrom,
    dateTo: etaTo,
  });

  const etaOrders = useMemo(() => {
    return [...etaOrdersRaw].sort((a, b) => {
      const dateA = a.etaDate ? new Date(a.etaDate).getTime() : 0;
      const dateB = b.etaDate ? new Date(b.etaDate).getTime() : 0;
      return dateA - dateB;
    });
  }, [etaOrdersRaw]);

  // 상품별 컨테이너 수 (막대 차트용)
  const etaProductChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of etaOrders) {
      const productName = order.productName?.trim() || '미지정';
      const count = (order.containers ?? []).length;
      map.set(productName, (map.get(productName) ?? 0) + count);
    }
    const labels: string[] = [];
    const series: number[] = [];
    for (const [name, count] of map.entries()) {
      if (count > 0) {
        labels.push(name);
        series.push(count);
      }
    }
    const totalContainers = series.reduce((s, v) => s + v, 0);
    return { labels, series, totalContainers };
  }, [etaOrders]);

  const { data: tradeStatusCodes = [] } = useCodeMastersByGroup('TRADE_ORDER_STATUS');
  const TRADE_STATUS_NAME_FALLBACK: Record<string, string> = {
    BOOKING: '부킹',
    DOCUMENTS: '서류처리',
    DO: 'DO',
    ARRIVED: '입고',
    QUARANTINE: '격리완료',
    CUSTOMS: '통관',
    COMPLETED: '완료',
  };
  const getTradeStatusName = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    const code = tradeStatusCodes.find(
      (c) => c.value && c.value.trim().toUpperCase() === normalized
    );
    return code?.name || TRADE_STATUS_NAME_FALLBACK[normalized] || value;
  };
  const getStatusBadgeStyle = (status?: string | null) => {
    if (!status) return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
    const n = status.trim().toUpperCase();
    if (n === 'BOOKING') return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
    if (n === 'DOCUMENTS') return 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300';
    if (n === 'DO') return 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300';
    if (n === 'CUSTOMS') return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
    if (n === 'ARRIVED') return 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300';
    if (n === 'QUARANTINE') return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
    if (n === 'COMPLETED') return 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300';
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  };

  if (loading) {
    return (
      <AppLayout user={user}>
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">로딩 중...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="w-full max-w-full min-w-0 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">대시보드</h2>
            <p className="text-sm text-muted-foreground sm:text-base">
              시스템 현황을 한눈에 확인하세요
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-sm font-medium whitespace-nowrap">입고 예정 월</Label>
            <MonthPicker
              value={etaMonth}
              onChange={(v) => setEtaMonth(v ?? '')}
              placeholder="월 선택"
              className="w-[140px]"
            />
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-6">
          {/* 1행: 총 미수채권 ↔ 상품별 컨테이너 차트 — 같은 행 높이(stretch) */}
          <div className="grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:items-stretch">
          {/* 총 미수채권 리스트 */}
          <Card className="w-full min-w-0 h-full min-h-0">
            <CardHeader>
              <CardTitle>총 미수채권</CardTitle>
              <CardDescription>
                잔액 0 이하·10만원 미만은 제외하고, 미수 채권만 집계합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 flex flex-1 flex-col overflow-hidden">
              {isLoadingReceivables ? (
                <div className="flex py-8 items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-border min-w-0 space-y-0">
                  {receivableSlices.bySupplier.map((item) => (
                    <li key={item.supplierId} className="py-3 first:pt-0 min-w-0">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <span className="text-sm font-medium leading-tight">{item.supplierName}</span>
                          <span className="text-base font-semibold tabular-nums shrink-0 text-right">
                            {formatCurrency(item.balanceAll)}
                            <span className="text-sm font-normal text-muted-foreground">
                              ({item.customerCountAll.toLocaleString('ko-KR')}건)
                            </span>
                          </span>
                        </div>
                        <ReceivableCustomerMixBar
                          farm={item.balanceFarm}
                          distribution={item.balanceDistribution}
                          total={item.balanceAll}
                          dense
                          farmCustomerCount={item.customerCountFarm}
                          distributionCustomerCount={item.customerCountDistribution}
                          totalCustomerCount={item.customerCountAll}
                        />
                      </div>
                    </li>
                  ))}
                  <li className="py-3 pt-4 mt-1 border-t border-border min-w-0">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3 min-w-0 font-semibold">
                        <span className="text-sm">전체</span>
                        <span className="text-lg tabular-nums shrink-0 text-right">
                          {formatCurrency(receivableSlices.totalAll)}
                          <span className="text-base font-normal text-muted-foreground">
                            ({receivableSlices.countAll.toLocaleString('ko-KR')}건)
                          </span>
                        </span>
                      </div>
                      <ReceivableCustomerMixBar
                        farm={receivableSlices.totalFarm}
                        distribution={receivableSlices.totalDist}
                        total={receivableSlices.totalAll}
                        farmCustomerCount={receivableSlices.countFarm}
                        distributionCustomerCount={receivableSlices.countDist}
                        totalCustomerCount={receivableSlices.countAll}
                      />
                    </div>
                  </li>
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 입고 예정 상품별 컨테이너 수 — 컬럼(막대) 차트 */}
          <Card className="w-full min-w-0 h-full min-h-0 py-4 gap-4">
            <CardHeader className="gap-1.5">
              <CardTitle className="text-lg flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>{selectedMonth}월 입고 예정 - 상품별 컨테이너 수</span>
                {!etaLoading ? (
                  <span className="text-sm font-normal tabular-nums text-muted-foreground">
                    (총 {etaProductChartData.totalContainers.toLocaleString('ko-KR')}개)
                  </span>
                ) : null}
              </CardTitle>
              <CardDescription className="text-sm">
                {selectedMonth}월 도착 예정 상품별 컨테이너 개수
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col justify-center pt-0">
              {etaLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                  </div>
                </div>
              ) : etaProductChartData.labels.length === 0 ? (
                <div className="flex h-48 items-center justify-center">
                  <p className="text-sm text-muted-foreground text-center">
                    {selectedMonth}월 입고 예정 데이터가 없습니다.
                  </p>
                </div>
              ) : (
                <div className="w-full min-w-0">
                  <Chart
                    type="bar"
                    height={Math.min(96 + etaProductChartData.labels.length * 30, 360)}
                    series={[
                      {
                        name: '컨테이너',
                        data: etaProductChartData.series,
                      },
                    ]}
                    options={{
                      chart: {
                        toolbar: { show: false },
                        fontFamily: 'inherit',
                      },
                      plotOptions: {
                        bar: {
                          borderRadius: 4,
                          columnWidth: '55%',
                          distributed: true,
                          dataLabels: { position: 'top' },
                        },
                      },
                      colors: etaProductChartData.labels.map(
                        (_, i) =>
                          ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'][
                            i % 8
                          ],
                      ),
                      dataLabels: {
                        enabled: true,
                        offsetY: -20,
                        style: { fontSize: '11px' },
                        formatter: (val: number) => (val > 0 ? `${Math.round(val)}개` : ''),
                      },
                      legend: { show: false },
                      xaxis: {
                        categories: etaProductChartData.labels,
                        labels: {
                          rotate: -35,
                          rotateAlways: etaProductChartData.labels.length > 4,
                          hideOverlappingLabels: true,
                          trim: true,
                          maxHeight: 100,
                          style: { fontSize: '11px' },
                        },
                      },
                      yaxis: {
                        title: { text: '컨테이너 수', style: { fontSize: '12px' } },
                        labels: {
                          formatter: (v: string | number) =>
                            `${typeof v === 'number' ? Math.round(v) : v}`,
                        },
                        min: 0,
                        tickAmount: 5,
                      },
                      grid: {
                        borderColor: 'hsl(var(--border) / 0.6)',
                        strokeDashArray: 4,
                        padding: { top: 4, right: 6, bottom: 0, left: 6 },
                      },
                      tooltip: {
                        y: {
                          formatter: (value: number) => `${value}개`,
                        },
                      },
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
          </div>

          <div className="grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:items-start">
          {/* 미수·채권 상태 (공급자·구분 선택) */}
          <Card className="w-full min-w-0">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="text-base">미수·채권 상태</CardTitle>
              <Link
                href="/finance/receivables"
                className="text-xs sm:text-sm text-muted-foreground hover:text-primary shrink-0 flex items-center gap-0.5 whitespace-nowrap"
              >
                채권관리
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden pt-0 space-y-4">
              <div className="flex flex-row flex-nowrap items-center gap-2 sm:gap-3 min-w-0 w-full">
                <div className="flex min-w-0 flex-[1.65] items-center gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap shrink-0">
                    공급자
                  </Label>
                  <Select
                    value={receivableStatusSupplierId || 'all'}
                    onValueChange={(v) => setReceivableStatusSupplierId(v === 'all' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 min-w-0 w-full max-w-[14.5rem] flex-1 text-sm">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={String(supplier.id)}>
                          {supplier.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap shrink-0 leading-none">
                    구분
                  </Label>
                  <Select
                    value={receivableStatusCustomerType}
                    onValueChange={setReceivableStatusCustomerType}
                  >
                    <SelectTrigger className="h-8 min-w-0 max-w-[7.25rem] w-[7.25rem] text-[11px] leading-tight">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">전체</SelectItem>
                      {(customerTypeCodes ?? []).map((code) => {
                        const key = (code.value ?? code.name ?? '').trim();
                        if (!key) return null;
                        return (
                          <SelectItem key={key} value={key}>
                            {code.name ?? code.value ?? key}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {isLoadingReceivableWarnings ? (
                <div className="flex py-6 items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary mx-auto" />
                    <p className="mt-2 text-xs text-muted-foreground">불러오는 중...</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground text-xs">
                        <th className="py-2 pr-2 font-medium">상태</th>
                        <th className="py-2 px-2 font-medium text-right">미수</th>
                        <th className="py-2 pl-2 font-medium text-right w-[4.5rem]">건수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivableWarningTableRows.map((r) => (
                        <tr key={r.key} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-2 text-foreground">{r.label}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(r.totalBalance)}</td>
                          <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                            {r.total.toLocaleString('ko-KR')}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-border font-medium bg-muted/40">
                        <td className="py-2 pr-2">합계</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {formatCurrency(receivableWarningSumBalance)}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums">
                          {receivableWarningSumCount.toLocaleString('ko-KR')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 입고 예정 - 물류관리와 동일한 조건 */}
          <Card className="w-full min-w-0">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="text-lg">{selectedMonth}월 입고 예정</CardTitle>
              <CardDescription className="text-sm">
                {selectedMonth}월 ETA 도착 예정 (물류관리 기준)
              </CardDescription>
            </div>
            <Link
              href={`/logistics/management?dateType=eta&dateFrom=${etaFrom}&dateTo=${etaTo}`}
              className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              물류관리에서 전체 보기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden py-4">
            {etaLoading ? (
              <div className="flex py-6 items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">데이터를 불러오는 중...</p>
                </div>
              </div>
            ) : etaOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {selectedMonth}월 입고 예정이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b border-border">
                      <th className="text-left py-2.5 px-2 font-medium">상태</th>
                      <th className="text-left py-2.5 px-2 font-medium">ETA</th>
                      <th className="text-left py-2.5 px-2 font-medium">검역일</th>
                      <th className="text-left py-2.5 px-2 font-medium">통관일</th>
                      <th className="text-left py-2.5 px-2 font-medium">수출국</th>
                      <th className="text-left py-2.5 px-2 font-medium">수출사</th>
                      <th className="text-left py-2.5 px-2 font-medium">상품</th>
                      <th className="text-right py-2.5 px-2 font-medium">컨테이너</th>
                      <th className="text-right py-2.5 px-2 font-medium">중량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etaOrders.map((order: TradeOrder) => {
                      const tradeStatus = order.tradeStatus || order.status || 'BOOKING';
                      const statusName = getTradeStatusName(tradeStatus) || order.tradeStatusName || tradeStatus;
                      const totalWeight = (order.containers ?? []).reduce(
                        (sum, c) => sum + (c.weight ?? 0),
                        0
                      );
                      return (
                        <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-2">
                            <Badge variant="outline" className={`text-xs leading-tight ${getStatusBadgeStyle(tradeStatus)}`}>
                              {statusName}
                            </Badge>
                          </td>
                          <td className="py-2 px-2">{formatDate(order.etaDate)}</td>
                          <td className="py-2 px-2">{formatDate(order.quarantineDate)}</td>
                          <td className="py-2 px-2">{formatDate(order.customsDate)}</td>
                          <td className="py-2 px-2">{order.exportCountryName || '-'}</td>
                          <td className="py-2 px-2">{order.exporterName || '-'}</td>
                          <td className="py-2 px-2">{order.productName || '-'}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {(order.containers ?? []).length}개
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {totalWeight > 0
                              ? totalWeight.toLocaleString('ko-KR', {
                                  minimumFractionDigits: 3,
                                  maximumFractionDigits: 3,
                                })
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
