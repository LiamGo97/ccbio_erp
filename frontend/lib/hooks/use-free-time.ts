import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface FreeTime {
  id: string;
  exporterCode: string;
  exporterName: string;
  shippingLineCode: string;
  shippingLineName: string;
  type: 'DM' | 'DT' | 'CB';
  baseDate: string;
  value: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFreeTimeDto {
  exporterCode: string;
  shippingLineCode: string;
  type: 'DM' | 'DT' | 'CB';
  baseDate: string;
  value?: string | null;
}

export interface UpdateFreeTimeDto extends Partial<CreateFreeTimeDto> {}

export interface GetFreeTimeParams {
  exporterCode?: string;
  shippingLineCode?: string;
  type?: string;
  baseDate?: string;
}

export function useFreeTimes(params?: GetFreeTimeParams) {
  return useQuery<FreeTime[]>({
    queryKey: ['free-time', params],
    queryFn: async () => {
      const response = await api.get<FreeTime[]>('/trade/free-time', {
        params,
      });
      return response.data;
    },
  });
}

export function useCreateFreeTime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateFreeTimeDto) => {
      const response = await api.post<FreeTime>('/trade/free-time', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['free-time'] });
    },
  });
}

export function useUpdateFreeTime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateFreeTimeDto }) => {
      const response = await api.put<FreeTime>(`/trade/free-time/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['free-time'] });
    },
  });
}

export function useDeleteFreeTime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trade/free-time/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['free-time'] });
    },
  });
}

export function useCalculateFreeTime() {
  return useMutation({
    mutationFn: async (params: { exporterCode: string; shippingLineCode: string; eta: string }) => {
      const response = await api.get(
        '/trade/free-time/calculate',
        {
          params,
        },
      );
      return response.data as {
        dmDate: string | null;
        dmOffsetDays: number | null;
        dtDate: string | null;
        dtOffsetDays: number | null;
        cbDate: string | null;
        cbOffsetDays: number | null;
      };
    },
  });
}



