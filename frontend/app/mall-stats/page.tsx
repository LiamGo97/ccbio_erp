'use client';

import * as React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { useMallStatsDashboard, MallDailyStat } from '@/lib/hooks/use-mall-daily-stats';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { ko } from 'date-fns/locale';

const LABELS = {
  totalVisitors: '총 방문자수',
  visits: '방문횟수',
  newVisitors: '신규방문자',
  returningVisitors: '재방문자',
  pageViews: '총 페이지 뷰',
  appInstalls: '어플설치',
  memberSignups: '회원가입',
  salesCount: '판매',
} as const;

function formatNum(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

function WeekRow({
  label,
  data,
  isChange,
}: {
  label: string;
  data: { totalVisitors: number; visits: number; newVisitors: number; returningVisitors: number; pageViews: number; appInstalls: number; memberSignups: number; salesCount: number } | null;
  isChange?: boolean;
}) {
  if (!data) return null;
  return (
    <tr className={isChange ? 'bg-muted/50 font-medium' : ''}>
      <td className="border px-3 py-2 text-left">{label}</td>
      <td className="border px-3 py-2 text-right">{formatNum(data.totalVisitors)}</td>
      <td className="border px-3 py-2 text-right">{formatNum(data.visits)}</td>
      <td className="border px-3 py-2 text-right">{formatNum(data.newVisitors)}</td>
      <td className="border px-3 py-2 text-right">{formatNum(data.returningVisitors)}</td>
      <td className="border px-3 py-2 text-right">{formatNum(data.pageViews)}</td>
      <td className="border px-3 py-2 text-right">{formatNum(data.appInstalls)}</td>
      <td className="border px-3 py-2 text-right">{formatNum(data.memberSignups)}</td>
      <td className="border px-3 py-2 text-right">{formatNum(data.salesCount)}</td>
    </tr>
  );
}

type PeriodSummary = {
  totalVisitors: number;
  visits: number;
  newVisitors: number;
  returningVisitors: number;
  pageViews: number;
  appInstalls: number;
  memberSignups: number;
  salesCount: number;
};

function DailyTable({
  rows,
  title,
  sumRow,
}: {
  rows: MallDailyStat[];
  title: string;
  sumRow?: PeriodSummary | null;
}) {
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-sm font-medium text-muted-foreground">{title}</p>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="border px-2 py-1.5 text-left">날짜</th>
            <th className="border px-2 py-1.5 text-right">총 방문자</th>
            <th className="border px-2 py-1.5 text-right">방문횟수</th>
            <th className="border px-2 py-1.5 text-right">신규</th>
            <th className="border px-2 py-1.5 text-right">재방문</th>
            <th className="border px-2 py-1.5 text-right">페이지뷰</th>
            <th className="border px-2 py-1.5 text-right">어플설치</th>
            <th className="border px-2 py-1.5 text-right">회원가입</th>
            <th className="border px-2 py-1.5 text-right">판매</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="border px-2 py-4 text-center text-muted-foreground">
                데이터 없음
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.statDate}>
                <td className="border px-2 py-1.5">
                  {format(parseISO(r.statDate), 'M/d (EEE)', { locale: ko })}
                </td>
                <td className="border px-2 py-1.5 text-right">{formatNum(r.totalVisitors)}</td>
                <td className="border px-2 py-1.5 text-right">{formatNum(r.visits)}</td>
                <td className="border px-2 py-1.5 text-right">{formatNum(r.newVisitors)}</td>
                <td className="border px-2 py-1.5 text-right">{formatNum(r.returningVisitors)}</td>
                <td className="border px-2 py-1.5 text-right">{formatNum(r.pageViews)}</td>
                <td className="border px-2 py-1.5 text-right">{formatNum(r.appInstalls)}</td>
                <td className="border px-2 py-1.5 text-right">{formatNum(r.memberSignups)}</td>
                <td className="border px-2 py-1.5 text-right">{formatNum(r.salesCount)}</td>
              </tr>
            ))
          )}
          {sumRow && (
            <tr className="bg-muted/50 font-medium">
              <td className="border px-2 py-1.5 text-left">합계</td>
              <td className="border px-2 py-1.5 text-right">{formatNum(sumRow.totalVisitors)}</td>
              <td className="border px-2 py-1.5 text-right">{formatNum(sumRow.visits)}</td>
              <td className="border px-2 py-1.5 text-right">{formatNum(sumRow.newVisitors)}</td>
              <td className="border px-2 py-1.5 text-right">{formatNum(sumRow.returningVisitors)}</td>
              <td className="border px-2 py-1.5 text-right">{formatNum(sumRow.pageViews)}</td>
              <td className="border px-2 py-1.5 text-right">{formatNum(sumRow.appInstalls)}</td>
              <td className="border px-2 py-1.5 text-right">{formatNum(sumRow.memberSignups)}</td>
              <td className="border px-2 py-1.5 text-right">{formatNum(sumRow.salesCount)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function getLastWeekRange(): { from: string; to: string } {
  const lastWeek = subWeeks(new Date(), 1);
  const start = startOfWeek(lastWeek, { locale: ko });
  const end = endOfWeek(lastWeek, { locale: ko });
  return {
    from: format(start, 'yyyy-MM-dd'),
    to: format(end, 'yyyy-MM-dd'),
  };
}

export default function MallStatsDashboardPage() {
  const [dateRange, setDateRange] = React.useState<{ from: string; to: string }>(() => getLastWeekRange());
  const { data, isLoading, error } = useMallStatsDashboard({
    startDate: dateRange.from,
    endDate: dateRange.to,
  });

  const lastWeekRows = React.useMemo(() => {
    if (!data?.daily) return [];
    return data.daily.filter(
      (r) => data.lastWeek && r.statDate >= data.lastWeek.startDate && r.statDate <= data.lastWeek.endDate,
    );
  }, [data]);

  const thisWeekRows = React.useMemo(() => {
    if (!data?.daily) return [];
    return data.daily.filter(
      (r) => data.thisWeek && r.statDate >= data.thisWeek.startDate && r.statDate <= data.thisWeek.endDate,
    );
  }, [data]);

  const sumRow = React.useMemo(() => {
    if (!data?.lastWeek || !data?.thisWeek) return null;
    return {
      totalVisitors: data.thisWeek.totalVisitors + data.lastWeek.totalVisitors,
      visits: data.thisWeek.visits + data.lastWeek.visits,
      newVisitors: data.thisWeek.newVisitors + data.lastWeek.newVisitors,
      returningVisitors: data.thisWeek.returningVisitors + data.lastWeek.returningVisitors,
      pageViews: data.thisWeek.pageViews + data.lastWeek.pageViews,
      appInstalls: data.thisWeek.appInstalls + data.lastWeek.appInstalls,
      memberSignups: data.thisWeek.memberSignups + data.lastWeek.memberSignups,
      salesCount: data.thisWeek.salesCount + data.lastWeek.salesCount,
    };
  }, [data]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">쇼핑몰·앱 통계 현황</h1>
            <p className="text-muted-foreground">기간 선택 시 선택 기간과 이전 기간 비교</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">기간:</span>
            <DateRangePicker
              startDate={new Date(dateRange.from)}
              endDate={new Date(dateRange.to)}
              onChange={(start, end) => {
                if (start && end) {
                  setDateRange({
                    from: format(start, 'yyyy-MM-dd'),
                    to: format(end, 'yyyy-MM-dd'),
                  });
                }
              }}
              placeholder="기간 선택"
              className="w-[240px]"
            />
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-destructive">데이터를 불러오지 못했습니다.</p>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <p className="text-muted-foreground">로딩 중...</p>
        )}

        {data && !isLoading && (
          <>
            {/* 주간 비교 + 집계 */}
            <Card>
              <CardHeader>
                <CardTitle>통계 현황</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border px-3 py-2 text-left">구분</th>
                      <th className="border px-3 py-2 text-right">{LABELS.totalVisitors}</th>
                      <th className="border px-3 py-2 text-right">{LABELS.visits}</th>
                      <th className="border px-3 py-2 text-right">{LABELS.newVisitors}</th>
                      <th className="border px-3 py-2 text-right">{LABELS.returningVisitors}</th>
                      <th className="border px-3 py-2 text-right">{LABELS.pageViews}</th>
                      <th className="border px-3 py-2 text-right">{LABELS.appInstalls}</th>
                      <th className="border px-3 py-2 text-right">{LABELS.memberSignups}</th>
                      <th className="border px-3 py-2 text-right">{LABELS.salesCount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <WeekRow
                      label={data.lastWeek ? `${data.lastWeek.startDate} ~ ${data.lastWeek.endDate}` : '이전 기간'}
                      data={data.lastWeek}
                    />
                    <WeekRow
                      label={data.thisWeek ? `${data.thisWeek.startDate} ~ ${data.thisWeek.endDate}` : '선택 기간'}
                      data={data.thisWeek}
                    />
                    <WeekRow label="합계" data={sumRow ?? null} isChange />
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* 누적 (입력 데이터 기준) */}
            <Card>
              <CardHeader>
                <CardTitle>누적 (입력 데이터 기준)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6 text-sm">
                  <span>회원가입 누적: <strong>{formatNum(data.cumulative.totalMemberSignups)}</strong></span>
                  <span>어플설치 누적: <strong>{formatNum(data.cumulative.totalAppInstalls)}</strong></span>
                  <span>누적 판매: <strong>{formatNum(data.cumulative.totalSalesCount)}</strong></span>
                </div>
              </CardContent>
            </Card>

            {/* 일별 */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardContent className="pt-4">
                  <DailyTable
                    title={data.lastWeek ? `${data.lastWeek.startDate} ~ ${data.lastWeek.endDate}` : '이전 기간'}
                    rows={lastWeekRows}
                    sumRow={data.lastWeek ?? undefined}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <DailyTable
                    title={data.thisWeek ? `${data.thisWeek.startDate} ~ ${data.thisWeek.endDate}` : '선택 기간'}
                    rows={thisWeekRows}
                    sumRow={data.thisWeek ?? undefined}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
