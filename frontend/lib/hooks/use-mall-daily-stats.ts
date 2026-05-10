'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

const MALL_DAILY_STATS_BASE_PATH = '/mall-daily-stats';

export interface MallDailyStat {
  id: number;
  statDate: string; // YYYY-MM-DD
  totalVisitors: number;
  visits: number;
  newVisitors: number;
  returningVisitors: number;
  pageViews: number;
  appInstalls: number;
  memberSignups: number;
  salesCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MallDailyStatListParams {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  sortBy?: keyof Pick<
    MallDailyStat,
    | 'statDate'
    | 'totalVisitors'
    | 'visits'
    | 'newVisitors'
    | 'returningVisitors'
    | 'pageViews'
    | 'appInstalls'
    | 'memberSignups'
    | 'salesCount'
  >;
  sortOrder?: 'asc' | 'desc';
}

export interface MallDailyStatListResponse {
  data: MallDailyStat[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WeekSummary {
  startDate: string;
  endDate: string;
  totalVisitors: number;
  visits: number;
  newVisitors: number;
  returningVisitors: number;
  pageViews: number;
  appInstalls: number;
  memberSignups: number;
  salesCount: number;
}

export interface DashboardResponse {
  daily: MallDailyStat[];
  lastWeek: WeekSummary | null;
  thisWeek: WeekSummary | null;
  cumulative: {
    totalMemberSignups: number;
    totalAppInstalls: number;
    totalSalesCount: number;
  };
}

export function useMallDailyStats(params: MallDailyStatListParams = {}) {
  const {
    page = 1,
    limit = 50,
    startDate,
    endDate,
    sortBy = 'statDate',
    sortOrder = 'desc',
  } = params;
  const search = new URLSearchParams();
  search.set('page', String(page));
  search.set('limit', String(limit));
  if (startDate) search.set('startDate', startDate);
  if (endDate) search.set('endDate', endDate);
  if (sortBy) search.set('sortBy', String(sortBy));
  if (sortOrder) search.set('sortOrder', sortOrder);

  return useQuery({
    queryKey: ['mall-daily-stats', page, limit, startDate, endDate, sortBy, sortOrder],
    queryFn: async () => {
      const res = await api.get<MallDailyStatListResponse>(
        `${MALL_DAILY_STATS_BASE_PATH}?${search.toString()}`,
      );
      return res.data;
    },
  });
}

export function useMallStatsDashboard(params?: { startDate?: string; endDate?: string }) {
  const search = new URLSearchParams();
  if (params?.startDate) search.set('startDate', params.startDate);
  if (params?.endDate) search.set('endDate', params.endDate);

  const qs = search.toString();
  return useQuery({
    queryKey: ['mall-stats-dashboard', params?.startDate, params?.endDate],
    queryFn: async () => {
      const res = await api.get<DashboardResponse>(
        `${MALL_DAILY_STATS_BASE_PATH}/dashboard${qs ? `?${qs}` : ''}`,
      );
      return res.data;
    },
  });
}

export function useCreateMallDailyStat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<MallDailyStat, 'id' | 'createdAt' | 'updatedAt'>) =>
      api.post<MallDailyStat>(MALL_DAILY_STATS_BASE_PATH, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mall-daily-stats'] });
      queryClient.invalidateQueries({ queryKey: ['mall-stats-dashboard'] });
    },
  });
}

export function useUpdateMallDailyStat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Omit<MallDailyStat, 'id' | 'createdAt' | 'updatedAt'>>;
    }) =>
      api.put<MallDailyStat>(`${MALL_DAILY_STATS_BASE_PATH}/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mall-daily-stats'] });
      queryClient.invalidateQueries({ queryKey: ['mall-stats-dashboard'] });
    },
  });
}

export function useDeleteMallDailyStat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ success: boolean }>(`${MALL_DAILY_STATS_BASE_PATH}/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mall-daily-stats'] });
      queryClient.invalidateQueries({ queryKey: ['mall-stats-dashboard'] });
    },
  });
}
