import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface WarehouseIgobi {
  id: string;
  warehouseId: number;
  warehouseName?: string | null;
  baseDate: string;
  igobi: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseIgobiDto {
  warehouseId: number;
  baseDate: string;
  igobi: number;
}

export interface UpdateWarehouseIgobiDto extends Partial<CreateWarehouseIgobiDto> {}

export interface GetWarehouseIgobiParams {
  warehouseId?: number;
  baseDate?: string;
}

export function useWarehouseIgobis(params?: GetWarehouseIgobiParams) {
  return useQuery<WarehouseIgobi[]>({
    queryKey: ['warehouse-igobi', params],
    queryFn: async () => {
      const apiParams: Record<string, string | number> = {};
      if (params?.warehouseId) {
        apiParams.warehouseId = params.warehouseId;
      }
      if (params?.baseDate) {
        apiParams.baseDate = params.baseDate;
      }
      const response = await api.get<WarehouseIgobi[]>('/warehouse-igobi', {
        params: apiParams,
      });
      return response.data;
    },
  });
}

export function useCreateWarehouseIgobi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateWarehouseIgobiDto) => {
      const response = await api.post<WarehouseIgobi>('/warehouse-igobi', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-igobi'] });
    },
  });
}

export function useUpdateWarehouseIgobi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWarehouseIgobiDto }) => {
      const response = await api.put<WarehouseIgobi>(`/warehouse-igobi/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-igobi'] });
    },
  });
}

export function useDeleteWarehouseIgobi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/warehouse-igobi/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-igobi'] });
    },
  });
}

export function useCalculateWarehouseIgobi() {
  return useMutation({
    mutationFn: async (params: { warehouseCode: string; targetDate: string }) => {
      const response = await api.get('/warehouse-igobi/calculate', {
        params,
      });
      return response.data as {
        igobi: number | null;
      };
    },
  });
}

