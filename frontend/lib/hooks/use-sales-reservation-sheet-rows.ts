'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import api, { getApiBaseUrl } from '@/lib/api';
import { AUTH_TOKEN_COOKIE_NAME } from '@/lib/auth-constants';
import { toastError, toastSuccess } from '@/lib/utils/toast-helpers';
import { formatDecimalTrimTrailingZeros } from '@/lib/utils';
import { PRODUCT_RESERVATIONS_SHEET_ID } from '@/lib/hooks/use-product-reservations-sheet-presence';

export type SalesReservationSheetRowDto = {
  id: string;
  sheetId: string;
  rowIndex: number;
  productCode: string | null;
  /** 영업 등급(SALES_GRADE). 구 API·캐시에는 없을 수 있음 */
  salesGrade?: string | null;
  bl: string | null;
  companyName: string | null;
  contact: string | null;
  requestedQty: string | null;
  vehicleCode: string | null;
  loadingSchedule: string | null;
  arrivalSchedule: string | null;
  remarks: string | null;
  unitPrice: string | null;
  reference: string | null;
  status: string | null;
  userId?: number | null;
  updatedAt?: string;
};

export const salesReservationSheetRowsQueryKey = [
  'sales-reservation-sheet-rows',
  PRODUCT_RESERVATIONS_SHEET_ID,
] as const;

const queryKey = salesReservationSheetRowsQueryKey;

const COL = 13;

function formatApiErrorMessage(error: unknown, fallback: string): string {
  const raw = (error as { response?: { data?: { message?: unknown } } })?.response
    ?.data?.message;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const parts = raw
      .map((x) => (typeof x === 'string' ? x : String(x)))
      .filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  return fallback;
}

/** 한 행의 모든 셀을 빈 문자열로 채운 키 맵(행 삭제·비우기 후 로컬 병합용) */
function emptyRowCellKeys(rowIndex: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let c = 0; c < COL; c++) {
    out[`${rowIndex},${c}`] = '';
  }
  return out;
}

/** 서버 행 목록 → 그리드 `row,col` 키 맵 */
export function rowsToCellMap(
  rows: SalesReservationSheetRowDto[] | undefined,
): Record<string, string> {
  if (!rows?.length) return {};
  const out: Record<string, string> = {};
  for (const r of rows) {
    const i = r.rowIndex;
    out[`${i},0`] = r.productCode ?? '';
    out[`${i},1`] = r.salesGrade ?? '';
    out[`${i},2`] = r.companyName ?? '';
    out[`${i},3`] = r.status ?? '';
    out[`${i},4`] = r.bl ?? '';
    out[`${i},5`] = r.contact ?? '';
    out[`${i},6`] = r.requestedQty ?? '';
    out[`${i},7`] = r.vehicleCode ?? '';
    out[`${i},8`] = r.loadingSchedule ?? '';
    out[`${i},9`] = r.arrivalSchedule ?? '';
    out[`${i},10`] = r.remarks ?? '';
    out[`${i},11`] =
      r.unitPrice != null && String(r.unitPrice).trim() !== ''
        ? formatDecimalTrimTrailingZeros(String(r.unitPrice))
        : '';
    out[`${i},12`] = r.reference ?? '';
  }
  return out;
}

function mergeRowIntoList(
  old: SalesReservationSheetRowDto[] | undefined,
  row: SalesReservationSheetRowDto,
): SalesReservationSheetRowDto[] {
  const list = old ? [...old] : [];
  const idx = list.findIndex((x) => x.rowIndex === row.rowIndex);
  if (idx >= 0) {
    list[idx] = row;
  } else {
    list.push(row);
  }
  list.sort((a, b) => a.rowIndex - b.rowIndex);
  return list;
}

export function useSalesReservationSheetRows(enabled: boolean) {
  const queryClient = useQueryClient();
  /** DB에서 행이 삭제된 직후 한 번만 remoteCells에 빈 칸을 넣어 그리드가 이전 값을 남기지 않게 함 */
  const [purgeRowIndex, setPurgeRowIndex] = React.useState<number | null>(null);

  /** 연속 PUT 완료 시 토스트 1회로 묶음(행 삽입 등으로 짧은 간격에 여러 줄 저장될 때) */
  const saveToastBatchRef = React.useRef<{
    lines: number[];
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lines: [], timer: null });

  const scheduleSaveSuccessToast = React.useCallback((displayLine: number) => {
    const b = saveToastBatchRef.current;
    b.lines.push(displayLine);
    if (b.timer != null) clearTimeout(b.timer);
    b.timer = setTimeout(() => {
      b.timer = null;
      const uniq = [...new Set(b.lines)].sort((a, c) => a - c);
      b.lines.length = 0;
      if (uniq.length === 0) return;
      if (uniq.length === 1) {
        toastSuccess(
          '저장 완료',
          `${uniq[0]}번 줄이 서버에 저장되었습니다.`,
        );
        return;
      }
      const head = uniq.slice(0, 10).join(', ');
      const tail =
        uniq.length > 10 ? ` … 외 ${uniq.length - 10}줄` : '';
      toastSuccess(
        '저장 완료',
        `${uniq.length}개 줄이 서버에 저장되었습니다. (${head}${tail})`,
      );
    }, 280);
  }, []);

  React.useEffect(() => {
    return () => {
      const t = saveToastBatchRef.current.timer;
      if (t != null) clearTimeout(t);
    };
  }, []);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<SalesReservationSheetRowDto[]>(
        '/sales-reservation-sheet/rows',
        { params: { sheetId: PRODUCT_RESERVATIONS_SHEET_ID } },
      );
      return data;
    },
    enabled,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  React.useEffect(() => {
    if (!enabled) return;
    const token = Cookies.get(AUTH_TOKEN_COOKIE_NAME);
    if (!token) return;

    const base = getApiBaseUrl();
    const url = `${base}/sales-reservation-sheet/stream?sheetId=${encodeURIComponent(
      PRODUCT_RESERVATIONS_SHEET_ID,
    )}&token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          type?: string;
          row?: SalesReservationSheetRowDto;
          rowIndex?: number;
        };
        if (msg.type === 'row-deleted' && msg.rowIndex != null) {
          const ri = msg.rowIndex;
          queryClient.setQueryData<SalesReservationSheetRowDto[]>(
            queryKey,
            (old) => old?.filter((x) => x.rowIndex !== ri) ?? [],
          );
          setPurgeRowIndex(ri);
          return;
        }
        if (msg.type === 'row-updated' && msg.row) {
          queryClient.setQueryData<SalesReservationSheetRowDto[]>(
            queryKey,
            (old) => mergeRowIntoList(old, msg.row!),
          );
        }
      } catch {
        /* ignore */
      }
    };

    return () => {
      es.close();
    };
  }, [enabled, queryClient]);

  const remoteCells = React.useMemo(() => {
    if (!enabled) return undefined;
    const base = rowsToCellMap(query.data);
    if (purgeRowIndex == null) return base;
    return { ...base, ...emptyRowCellKeys(purgeRowIndex) };
  }, [enabled, query.data, purgeRowIndex]);

  React.useEffect(() => {
    if (purgeRowIndex == null) return;
    const id = requestAnimationFrame(() => setPurgeRowIndex(null));
    return () => cancelAnimationFrame(id);
  }, [purgeRowIndex]);

  const persistRow = useMutation({
    mutationFn: async ({
      rowIndex,
      values,
    }: {
      rowIndex: number;
      values: string[];
    }) => {
      const unitRaw = values[11]?.trim() ?? '';
      let unitPrice: number | null = null;
      if (unitRaw) {
        const n = parseFloat(unitRaw.replace(/,/g, ''));
        if (Number.isFinite(n)) unitPrice = n;
      }
      const { data } = await api.put<
        SalesReservationSheetRowDto | { deleted: true; rowIndex: number }
      >(
        `/sales-reservation-sheet/rows/${rowIndex}`,
        {
          productCode: values[0] || null,
          salesGrade: values[1] || null,
          companyName: values[2] || null,
          status: values[3] || null,
          bl: values[4] || null,
          contact: values[5] || null,
          requestedQty: values[6] || null,
          vehicleCode: values[7] || null,
          loadingSchedule: values[8] || null,
          arrivalSchedule: values[9] || null,
          remarks: values[10] || null,
          unitPrice,
          reference: values[12] || null,
        },
        { params: { sheetId: PRODUCT_RESERVATIONS_SHEET_ID } },
      );
      if (
        data &&
        typeof data === 'object' &&
        'deleted' in data &&
        data.deleted === true
      ) {
        queryClient.setQueryData<SalesReservationSheetRowDto[]>(
          queryKey,
          (old) => old?.filter((x) => x.rowIndex !== rowIndex) ?? [],
        );
        setPurgeRowIndex(rowIndex);
        return data;
      }
      return data;
    },
    onError: (error) => {
      toastError(
        '저장 실패',
        formatApiErrorMessage(
          error,
          '네트워크 또는 서버 오류로 행 저장에 실패했습니다.',
        ),
      );
    },
    onSuccess: (data, variables) => {
      const rowIndex = variables.rowIndex;
      const displayLine = rowIndex + 1;

      if (data && typeof data === 'object' && 'deleted' in data && data.deleted === true) {
        queryClient.setQueryData<SalesReservationSheetRowDto[]>(
          queryKey,
          (old) => old?.filter((x) => x.rowIndex !== rowIndex) ?? [],
        );
        setPurgeRowIndex(rowIndex);
        toastSuccess(
          '저장 완료',
          `${displayLine}번 줄이 비워져 서버에서 해당 행이 삭제되었습니다.`,
        );
        return;
      }

      queryClient.setQueryData<SalesReservationSheetRowDto[]>(
        queryKey,
        (old) => mergeRowIntoList(old, data as SalesReservationSheetRowDto),
      );
      scheduleSaveSuccessToast(displayLine);
    },
  });

  return {
    remoteCells,
    remoteVersion: query.dataUpdatedAt,
    isLoading: query.isLoading,
    persistRow: persistRow.mutateAsync,
  };
}
