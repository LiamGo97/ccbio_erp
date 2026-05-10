'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useFeatureAuditLogsForEntity, type FeatureAuditLogRow } from '@/lib/hooks/use-feature-audit-log';
import { formatNumber } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const parseAsUtcIfNeeded = (value: string): string => {
  const s = String(value).trim();
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (isIsoLike && !hasTimezone) {
    return s.replace(/\.\d{3}$/, '') + 'Z';
  }
  return s;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(parseAsUtcIfNeeded(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/** 감사 로그 API의 createdAt 등 — 문자열/Date 모두 처리 */
function formatAnyDateTime(value: unknown): string {
  if (value == null || value === '') return '-';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '-';
    return value.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return formatDateTime(String(value));
}

function formatScheduleDateOnly(v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  const iso = s.includes('T') ? s : `${s}T00:00:00Z`;
  const date = new Date(parseAsUtcIfNeeded(iso));
  if (Number.isNaN(date.getTime())) return s;
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 변경 후 스냅샷 기준 하차 관련 일시
 * - 입력 하차일시(sd_unloading_date_time)
 * - 예정 하차(일정+시간)
 * - 이번 저장으로 하차완료가 된 경우 시스템 처리 시각(감사 로그와 동일 의미의 하차완료 확정 시각)
 */
function buildUnloadingTimeDisplay(row: FeatureAuditLogRow): string {
  const nd = row.newData as Record<string, unknown> | undefined;
  if (!nd) return '-';

  const lines: string[] = [];

  const udt = nd.unloadingDateTime;
  if (udt != null && String(udt).trim() !== '') {
    const raw = String(udt).trim();
    let display = raw;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const iso = raw.includes('T') ? raw : `${raw}T00:00:00Z`;
      const d = new Date(parseAsUtcIfNeeded(iso));
      if (!Number.isNaN(d.getTime())) {
        display = d.toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
    lines.push(`입력 하차: ${display}`);
  }

  const sd = nd.unloadingScheduleDate;
  const st = nd.unloadingScheduleTime;
  if (sd != null && String(sd).trim() !== '') {
    const datePart = formatScheduleDateOnly(sd);
    const timePart = st != null && String(st).trim() !== '' ? String(st).trim() : '';
    lines.push(`예정 하차: ${datePart}${timePart ? ` ${timePart}` : ''}`);
  }

  const newStatus = nd.status;
  const oldStatus = (row.oldData as Record<string, unknown> | undefined)?.status;
  const becameUnloadingComplete =
    newStatus === 'UNLOADING_COMPLETED' && oldStatus !== 'UNLOADING_COMPLETED';

  if (becameUnloadingComplete) {
    lines.push(`하차완료(시스템): ${formatAnyDateTime(row.createdAt)}`);
  }

  if (lines.length === 0) {
    if (newStatus === 'UNLOADING_COMPLETED') {
      return `하차완료(시스템): ${formatAnyDateTime(row.createdAt)}`;
    }
    return '-';
  }

  return lines.join('\n');
}

/** 감사 JSON의 중량은 톤(소수)으로 저장되는 경우가 많음 → 표시는 kg */
function tonToKgLabel(v: unknown): string {
  if (v == null || v === '') return '-';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return '-';
  return `${formatNumber(n * 1000, 0)} kg`;
}

function formatTonPair(oldV: unknown, newV: unknown): string {
  const a = tonToKgLabel(oldV);
  const b = tonToKgLabel(newV);
  if (a === b) return a;
  return `${a} → ${b}`;
}

type JsonLoadingItem = Record<string, unknown>;

function asLoadingItems(data: Record<string, unknown> | null | undefined): JsonLoadingItem[] {
  const raw = data?.loadingItems;
  if (!Array.isArray(raw)) return [];
  return raw as JsonLoadingItem[];
}

function buildContainerWeightLines(
  oldData: Record<string, unknown> | null | undefined,
  newData: Record<string, unknown> | null | undefined,
): string {
  const olds = asLoadingItems(oldData);
  const news = asLoadingItems(newData);
  if (news.length === 0 && olds.length === 0) return '-';

  const byId = new Map<string, JsonLoadingItem>();
  for (const o of olds) {
    const id = o.id != null ? String(o.id) : '';
    if (id) byId.set(id, o);
  }

  const lines: string[] = [];
  for (const neu of news) {
    const id = neu.id != null ? String(neu.id) : '';
    const old = id ? byId.get(id) : undefined;
    const container = neu.requestContainer != null ? String(neu.requestContainer) : old?.requestContainer != null ? String(old.requestContainer) : '-';
    const req = formatTonPair(old?.requestWeight, neu.requestWeight);
    const act = formatTonPair(old?.actualWeight, neu.actualWeight);
    lines.push(`${container}: 요청 ${req} · 실제 ${act}`);
  }
  return lines.join('\n');
}

function statusLabel(map: Map<string, string>, code: unknown): string {
  if (code == null || code === '') return '-';
  const s = String(code);
  return map.get(s) || s;
}

function buildStatusTransition(
  oldData: Record<string, unknown> | null | undefined,
  newData: Record<string, unknown> | null | undefined,
  map: Map<string, string>,
): string {
  const o = statusLabel(map, oldData?.status);
  const n = statusLabel(map, newData?.status);
  if (o === '-' && n === '-') return '-';
  if (o === n) return o;
  return `${o} → ${n}`;
}

function sortChronological(rows: FeatureAuditLogRow[]): FeatureAuditLogRow[] {
  return [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export interface SalesDeliveryStatusAuditSectionProps {
  deliveryId: string | null | undefined;
  open: boolean;
}

export function SalesDeliveryStatusAuditSection({ deliveryId, open }: SalesDeliveryStatusAuditSectionProps) {
  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');
  const statusMap = React.useMemo(() => {
    const m = new Map<string, string>();
    (statusCodes ?? []).forEach((c) => {
      const v = (c.value ?? '').trim();
      const name = (c.name ?? c.value ?? '').trim();
      if (v) m.set(v, name || v);
    });
    return m;
  }, [statusCodes]);

  const entityId = deliveryId != null && deliveryId !== '' ? Number(deliveryId) : null;
  const { data, isLoading, isError } = useFeatureAuditLogsForEntity({
    entityType: 'sales_delivery',
    entityId: entityId != null && !Number.isNaN(entityId) ? entityId : null,
    limit: 100,
    enabled: open && entityId != null && !Number.isNaN(entityId),
  });

  const rows = React.useMemo(() => sortChronological(data?.data ?? []), [data?.data]);

  if (!deliveryId || entityId == null || Number.isNaN(entityId)) return null;

  return (
    <section className="space-y-2.5">
      <h3 className="text-sm font-semibold text-foreground">운송 상태 변경 이력</h3>
      <p className="text-xs text-muted-foreground">
        시스템 감사 로그 기반입니다. 기록 일시는 저장이 반영된 서버 시각이며, 하차 일시는 해당 시점 배송 스냅샷의 입력 하차·예정 하차 및 하차완료 확정 시각을 표시합니다.
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">이력을 불러오는 중…</span>
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">이력을 불러오지 못했습니다.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 변경 이력이 없습니다.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[132px] whitespace-nowrap text-xs">기록 일시</TableHead>
                <TableHead className="min-w-[140px] text-xs">하차 일시</TableHead>
                <TableHead className="min-w-[160px] text-xs">운송 상태 변경</TableHead>
                <TableHead className="w-[72px] whitespace-nowrap text-xs">수정자</TableHead>
                <TableHead className="min-w-[240px] text-xs">컨테이너·중량 변화 (요청·실제, kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="align-top text-xs whitespace-nowrap">{formatAnyDateTime(row.createdAt)}</TableCell>
                  <TableCell className="align-top text-xs whitespace-pre-line">{buildUnloadingTimeDisplay(row)}</TableCell>
                  <TableCell className="align-top text-xs">{buildStatusTransition(row.oldData, row.newData, statusMap)}</TableCell>
                  <TableCell className="align-top text-xs whitespace-nowrap">{row.user?.name?.trim() || '-'}</TableCell>
                  <TableCell className="align-top text-xs whitespace-pre-line text-muted-foreground">
                    {buildContainerWeightLines(row.oldData, row.newData)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
