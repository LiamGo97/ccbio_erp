import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface SafeFreightRate {
  id: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  portCodeId?: number | null;
  distanceKm?: number | null;
  regionName: string;
  cityName: string;
  townName: string;
  containerSize: '40FT';
  safeTransportRate: number;
  createdAt: string;
  updatedAt: string;
  portCode?: {
    id: number;
    name: string;
    value: string;
  };
}

export interface GetSafeFreightRatesParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  region?: string;
  city?: string;
  townName?: string;
  portCodeId?: number;
  distanceKm?: number;
  effectiveDate?: string;
}

export interface SafeFreightRatesResponse {
  data: SafeFreightRate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useSafeFreightRates(params?: GetSafeFreightRatesParams) {
  return useQuery({
    queryKey: ['safe-freight-rates', params],
    queryFn: async () => {
      const response = await api.get<SafeFreightRatesResponse>('/safe-freight-rates', {
        params,
      });
      if (response.data && 'data' in response.data) {
        return response.data as SafeFreightRatesResponse;
      }
      const data = Array.isArray(response.data) ? response.data : [];
      const total = data.length;
      const page = params?.page || 1;
      const limit = params?.limit || 20;
      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      } as SafeFreightRatesResponse;
    },
  });
}

export function useSafeFreightRate(id: number) {
  return useQuery({
    queryKey: ['safe-freight-rate', id],
    queryFn: async () => {
      const response = await api.get<SafeFreightRate>(`/safe-freight-rates/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateSafeFreightRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<SafeFreightRate>) => {
      const response = await api.post<SafeFreightRate>('/safe-freight-rates', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safe-freight-rates'] });
    },
  });
}

export function useUpdateSafeFreightRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SafeFreightRate> }) => {
      const response = await api.put<SafeFreightRate>(`/safe-freight-rates/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safe-freight-rates'] });
    },
  });
}

export function useDeleteSafeFreightRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/safe-freight-rates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safe-freight-rates'] });
    },
  });
}

/** 요금표에 등장하는 지역(시·도) 목록 */
export function useSafeFreightRegionNames() {
  return useQuery({
    queryKey: ['safe-freight-rates', 'regions'],
    queryFn: async () => {
      const response = await api.get<string[]>('/safe-freight-rates/regions');
      return response.data;
    },
  });
}

/** 특정 지역의 시군구 목록 */
export function useSafeFreightCityNames(regionName?: string) {
  return useQuery({
    queryKey: ['safe-freight-rates', 'cities', regionName],
    queryFn: async () => {
      const response = await api.get<string[]>('/safe-freight-rates/cities', {
        params: { region: regionName },
      });
      return response.data;
    },
    enabled: !!regionName,
  });
}

/** 특정 지역·시군구의 동명 목록 */
export function useTownNames(regionName?: string, cityName?: string) {
  return useQuery({
    queryKey: ['safe-freight-rates', 'towns', regionName, cityName],
    queryFn: async () => {
      const response = await api.get<string[]>('/safe-freight-rates/towns', {
        params: { region: regionName, city: cityName },
      });
      return response.data;
    },
    enabled: !!regionName && !!cityName,
  });
}

export function useDistanceKmList() {
  return useQuery({
    queryKey: ['safe-freight-rates', 'distances'],
    queryFn: async () => {
      const response = await api.get<number[]>('/safe-freight-rates/distances');
      return response.data;
    },
  });
}
