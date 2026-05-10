import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Warehouse {
  id: number;
  name: string;
  postalCode?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  useInternalGyegeundae: boolean;
  gyegeundaePostalCode?: string | null;
  gyegeundaeAddress?: string | null;
  gyegeundaeAddressDetail?: string | null;
  phone?: string | null;
  managerName?: string | null;
  managerPhone?: string | null;
  notes?: string | null;
  status: boolean;
  createdAt: string;
  updatedAt: string;
  latestIgobi?: {
    baseDate: string;
    igobi: number;
  } | null;
}

export interface GetWarehousesParams {
  search?: string;
  status?: boolean;
}

export interface CreateWarehouseDto {
  name: string;
  postalCode?: string;
  address?: string;
  addressDetail?: string;
  useInternalGyegeundae?: boolean;
  gyegeundaePostalCode?: string;
  gyegeundaeAddress?: string;
  gyegeundaeAddressDetail?: string;
  phone?: string;
  managerName?: string;
  managerPhone?: string;
  notes?: string;
  status?: boolean;
}

export interface UpdateWarehouseDto {
  name?: string;
  postalCode?: string;
  address?: string;
  addressDetail?: string;
  useInternalGyegeundae?: boolean;
  gyegeundaePostalCode?: string;
  gyegeundaeAddress?: string;
  gyegeundaeAddressDetail?: string;
  phone?: string;
  managerName?: string;
  managerPhone?: string;
  notes?: string;
  status?: boolean;
}

// 창고 목록 조회
export function useWarehouses(params?: GetWarehousesParams) {
  return useQuery<Warehouse[]>({
    queryKey: ['warehouses', params],
    queryFn: async () => {
      const response = await api.get<Warehouse[]>('/warehouses', { params });
      return response.data;
    },
  });
}

// 창고 단일 조회
export function useWarehouse(id: number | undefined) {
  return useQuery<Warehouse>({
    queryKey: ['warehouses', id],
    queryFn: async () => {
      const response = await api.get<Warehouse>(`/warehouses/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

// 창고 생성
export function useCreateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWarehouseDto) => {
      const response = await api.post<Warehouse>('/warehouses', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });
}

// 창고 수정
export function useUpdateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateWarehouseDto }) => {
      const response = await api.patch<Warehouse>(`/warehouses/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });
}

// 창고 삭제
export function useDeleteWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/warehouses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });
}

