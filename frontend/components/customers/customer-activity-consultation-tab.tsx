'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { Consultation } from '@/lib/hooks/use-consultations';
import {
  buildConsultationProductStats,
  filterConsultations,
  resolveConsultationProductLabel,
  type CustomerActivityDateRange,
} from '@/lib/hooks/use-customer-consultations';
import { CustomerConsultationDetailOverlay } from './customer-consultation-detail-overlay';
import { formatActivityDate } from './customer-activity-shared';

const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });

interface CustomerActivityConsultationTabProps {
  consultations: Consultation[];
  isLoading: boolean;
  error: Error | null;
  canQuery: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  dateRange: CustomerActivityDateRange;
  onDateRangeChange: (range: CustomerActivityDateRange) => void;
  labelOr: (map: Map<string, string>, value?: string | null) => string;
  consultationTypeMap: Map<string, string>;
  consultationInOutMap: Map<string, string>;
  consultationSourceMap: Map<string, string>;
  consultationRequestWeightMap: Map<string, string>;
  consultationSalesGradeMap: Map<string, string>;
  consultationPackingTypeMap: Map<string, string>;
  consultationProductMap: Map<string, string>;
  consultationProductCategoryMap: Map<number, string>;
}

export function CustomerActivityConsultationTab({
  consultations,
  isLoading,
  error,
  canQuery,
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  labelOr,
  consultationTypeMap,
  consultationInOutMap,
  consultationSourceMap,
  consultationRequestWeightMap,
  consultationSalesGradeMap,
  consultationPackingTypeMap,
  consultationProductMap,
  consultationProductCategoryMap,
}: CustomerActivityConsultationTabProps) {
  const [selected, setSelected] = React.useState<Consultation | null>(null);

  const filtered = React.useMemo(
    () => filterConsultations(consultations, search, dateRange),
    [consultations, search, dateRange],
  );

  const productStats = React.useMemo(
    () => buildConsultationProductStats(filtered, consultationProductMap),
    [filtered, consultationProductMap],
  );

  React.useEffect(() => {
    if (!selected) return;
    if (!filtered.some((item) => item.id === selected.id)) setSelected(null);
  }, [filtered, selected]);

  return (
    <div className="relative min-h-0 flex-1">
      <div className="grid h-full grid-cols-7 gap-3">
        <div className="col-span-3 flex h-[min(400px,50vh)] min-h-[240px] flex-col rounded-lg border bg-card p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold">제품별 상담 비중</Label>
              <p className="text-xs text-muted-foreground">전체 상담 대비</p>
            </div>
            {productStats.total > 0 ? (
              <span className="text-xs text-muted-foreground">{productStats.total}건</span>
            ) : null}
          </div>
          {productStats.total === 0 ? (
            <p className="text-xs text-muted-foreground">집계할 상담 이력이 없습니다.</p>
          ) : (
            <div className="flex flex-1 items-center justify-center overflow-visible p-2">
              <Chart
                type="pie"
                series={productStats.entries.map((e) => e.count)}
                options={{
                  labels: productStats.entries.map((e) => e.name),
                  legend: { position: 'bottom', fontSize: '10px' },
                  chart: { toolbar: { show: false } },
                  dataLabels: {
                    enabled: true,
                    formatter: (_val: number, opts: { seriesIndex: number }) => {
                      const label = productStats.entries[opts.seriesIndex]?.name ?? '';
                      const count = productStats.entries[opts.seriesIndex]?.count ?? 0;
                      return `${label}\n${count}건`;
                    },
                    style: { fontSize: '11px', fontWeight: 500 },
                  },
                }}
                width="100%"
                height="100%"
              />
            </div>
          )}
        </div>

        <div className="col-span-4 flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="space-y-2 border-b px-3 py-3">
            <Input
              placeholder="제품명 / 메모 검색"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 text-sm"
            />
            <DateRangePicker
              startDate={dateRange.start}
              endDate={dateRange.end}
              onChange={(startDate, endDate) => {
                onDateRangeChange({ start: startDate ?? undefined, end: endDate ?? undefined });
              }}
              className="h-8 w-full text-xs"
            />
            <p className="pt-1 text-xs font-semibold text-foreground">상담 이력 목록</p>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-3">
              {!canQuery ? (
                <p className="text-xs text-muted-foreground">
                  고객 연락처가 없어 상담 내역을 조회할 수 없습니다.
                </p>
              ) : null}
              {canQuery && isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  상담 내역을 불러오는 중입니다...
                </div>
              ) : null}
              {canQuery && error ? (
                <p className="text-xs text-destructive">상담 내역을 불러오지 못했습니다.</p>
              ) : null}
              {canQuery && !isLoading && !error && filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground">등록된 상담 내역이 없습니다.</p>
              ) : null}
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full space-y-1.5 rounded-md border bg-background p-3 text-left hover:bg-accent/40"
                  onClick={() => setSelected(item)}
                >
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{formatActivityDate(item.consultationDate)}</span>
                    <span>{item.managerName || '-'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.type ? (
                      <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                        {labelOr(consultationTypeMap, item.type) || item.type}
                      </Badge>
                    ) : null}
                    {item.inOut ? (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        {labelOr(consultationInOutMap, item.inOut) || item.inOut}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-foreground break-words">
                    {resolveConsultationProductLabel(item, consultationProductMap)}
                  </p>
                  {item.notes?.trim() ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground break-words">
                      {item.notes.trim()}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {selected ? (
        <CustomerConsultationDetailOverlay
          consultation={selected}
          onClose={() => setSelected(null)}
          labelOr={labelOr}
          consultationTypeMap={consultationTypeMap}
          consultationInOutMap={consultationInOutMap}
          consultationSourceMap={consultationSourceMap}
          consultationRequestWeightMap={consultationRequestWeightMap}
          consultationSalesGradeMap={consultationSalesGradeMap}
          consultationPackingTypeMap={consultationPackingTypeMap}
          consultationProductMap={consultationProductMap}
          consultationProductCategoryMap={consultationProductCategoryMap}
        />
      ) : null}
    </div>
  );
}
