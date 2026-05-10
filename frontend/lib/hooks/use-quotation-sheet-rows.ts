'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { formatDecimalTrimTrailingZeros } from '@/lib/utils';

/** 백엔드 기본 시트 ID와 동일 */
export const SALES_QUOTATION_SHEET_ID = 'sales-quotation-sheet';

export type QuotationSheetRowDto = {
  id: string;
  sheetId: string;
  rowIndex: number;
  bl?: string | null;
  eta?: string | null;
  currency?: string | null;
  unitPrice?: string | null;
  exportCountry?: string | null;
  product?: string | null;
  grade?: string | null;
  packing?: string | null;
  remarks?: string | null;
  fxCalc?: string | null;
  cost?: string | null;
  margin?: string | null;
  sellingPrice?: string | null;
  userId?: number | null;
  updatedAt?: string;
};

export const quotationSheetRowsQueryKey = [
  'quotation-sheet-rows',
  SALES_QUOTATION_SHEET_ID,
] as const;

const queryKey = quotationSheetRowsQueryKey;

const COL = 13;

function emptyRowCellKeys(rowIndex: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let c = 0; c < COL; c++) {
    out[`${rowIndex},${c}`] = '';
  }
  return out;
}

/** 서버 행 → 그리드 `row,col` (헤더 A~M 순과 동일) */
export function rowsToCellMap(
  rows: QuotationSheetRowDto[] | undefined,
): Record<string, string> {
  if (!rows?.length) return {};
  const out: Record<string, string> = {};
  for (const r of rows) {
    const i = r.rowIndex;
    out[`${i},0`] = r.bl ?? '';
    out[`${i},1`] = r.eta ?? '';
    out[`${i},2`] = r.currency ?? '';
    out[`${i},3`] =
      r.unitPrice != null && String(r.unitPrice).trim() !== ''
        ? formatDecimalTrimTrailingZeros(String(r.unitPrice))
        : '';
    out[`${i},4`] = r.exportCountry ?? '';
    out[`${i},5`] = r.product ?? '';
    out[`${i},6`] = r.grade ?? '';
    out[`${i},7`] = r.packing ?? '';
    out[`${i},8`] = r.remarks ?? '';
    out[`${i},9`] = r.fxCalc ?? '';
    out[`${i},10`] = r.cost ?? '';
    out[`${i},11`] = r.margin ?? '';
    out[`${i},12`] = r.sellingPrice ?? '';
  }
  return out;
}

function mergeRowIntoList(
  old: QuotationSheetRowDto[] | undefined,
  row: QuotationSheetRowDto,
): QuotationSheetRowDto[] {
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

/**
 * 견적서 시트 행 로드·저장. 판매예약과 달리 SSE 없음 — 주기 refetch·포커스 시 갱신.
 */
export function useQuotationSheetRows(enabled: boolean) {
  const queryClient = useQueryClient();
  const [purgeRowIndex, setPurgeRowIndex] = React.useState<number | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<QuotationSheetRowDto[]>(
        '/quotation-sheet/rows',
        { params: { sheetId: SALES_QUOTATION_SHEET_ID } },
      );
      return data;
    },
    enabled,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

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
      const { data } = await api.put<
        QuotationSheetRowDto | { deleted: true; rowIndex: number }
      >(
        `/quotation-sheet/rows/${rowIndex}`,
        {
          bl: values[0] || null,
          eta: values[1] || null,
          currency: values[2] || null,
          unitPrice: values[3] || null,
          exportCountry: values[4] || null,
          product: values[5] || null,
          grade: values[6] || null,
          packing: values[7] || null,
          remarks: values[8] || null,
          fxCalc: values[9] || null,
          cost: values[10] || null,
          margin: values[11] || null,
          sellingPrice: values[12] || null,
        },
        { params: { sheetId: SALES_QUOTATION_SHEET_ID } },
      );
      if (
        data &&
        typeof data === 'object' &&
        'deleted' in data &&
        data.deleted === true
      ) {
        queryClient.setQueryData<QuotationSheetRowDto[]>(
          queryKey,
          (old) => old?.filter((x) => x.rowIndex !== rowIndex) ?? [],
        );
        setPurgeRowIndex(rowIndex);
        return data;
      }
      return data;
    },
    onError: () => {
      toast({
        title: '저장 실패',
        description: '행 저장에 실패했습니다.',
        variant: 'destructive',
      });
    },
    onSuccess: (data, variables) => {
      if (
        data &&
        typeof data === 'object' &&
        'deleted' in data &&
        data.deleted === true
      ) {
        const rowIndex = variables.rowIndex;
        queryClient.setQueryData<QuotationSheetRowDto[]>(
          queryKey,
          (old) => old?.filter((x) => x.rowIndex !== rowIndex) ?? [],
        );
        setPurgeRowIndex(rowIndex);
        return;
      }

      queryClient.setQueryData<QuotationSheetRowDto[]>(
        queryKey,
        (old) => mergeRowIntoList(old, data as QuotationSheetRowDto),
      );
    },
  });

  return {
    remoteCells,
    remoteVersion: query.dataUpdatedAt,
    isLoading: query.isLoading,
    persistRow: persistRow.mutateAsync,
  };
}
