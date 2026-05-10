'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export const PRODUCT_RESERVATIONS_SHEET_ID = 'product-reservations-sheet';

type LocksResponse = {
  locks: Record<string, { userId: number; userName: string }>;
};

export function useProductReservationsSheetPresence(userId: number | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['sheet-presence-locks', PRODUCT_RESERVATIONS_SHEET_ID],
    queryFn: async () => {
      const { data } = await api.get<LocksResponse>('/sheet-presence/locks', {
        params: { sheetId: PRODUCT_RESERVATIONS_SHEET_ID },
      });
      return data.locks ?? {};
    },
    enabled: userId != null,
    refetchInterval: 2000,
    staleTime: 0,
  });

  const foreignCellLocks = React.useMemo(() => {
    if (userId == null || !query.data) return {};
    const self = Number(userId);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(query.data)) {
      // API/JSON에서 userId가 문자열로 올 수 있어 본인 잠금을 타인으로 오인하지 않도록 통일
      if (Number(v.userId) !== self) {
        out[k] = v.userName;
      }
    }
    return out;
  }, [userId, query.data]);

  const acquireLock = React.useCallback(async (row: number, col: number) => {
    await api.post('/sheet-presence/lock', {
      sheetId: PRODUCT_RESERVATIONS_SHEET_ID,
      row,
      col,
    });
    await queryClient.invalidateQueries({
      queryKey: ['sheet-presence-locks', PRODUCT_RESERVATIONS_SHEET_ID],
    });
  }, [queryClient]);

  const releaseLock = React.useCallback(
    async (row: number, col: number) => {
      await api.delete('/sheet-presence/lock', {
        params: {
          sheetId: PRODUCT_RESERVATIONS_SHEET_ID,
          row: String(row),
          col: String(col),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: ['sheet-presence-locks', PRODUCT_RESERVATIONS_SHEET_ID],
      });
    },
    [queryClient],
  );

  const heartbeat = React.useCallback(async (row: number, col: number) => {
    await api.post('/sheet-presence/heartbeat', {
      sheetId: PRODUCT_RESERVATIONS_SHEET_ID,
      row,
      col,
    });
  }, []);

  return {
    foreignCellLocks,
    acquireLock,
    releaseLock,
    heartbeat,
    refetchLocks: query.refetch,
  };
}
