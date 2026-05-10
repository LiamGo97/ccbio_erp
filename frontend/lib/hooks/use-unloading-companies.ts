import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface UnloadingCompany {
  id: number;
  representativeName: string;
  contact: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetUnloadingCompaniesParams {
  search?: string;
}

export interface CreateUnloadingCompanyDto {
  representativeName: string;
  contact: string;
  notes?: string;
}

export interface UpdateUnloadingCompanyDto {
  representativeName?: string;
  contact?: string;
  notes?: string;
}

// 하차 업체 목록 조회
export function useUnloadingCompanies(params?: GetUnloadingCompaniesParams) {
  return useQuery<UnloadingCompany[]>({
    queryKey: ['unloading-companies', params],
    queryFn: async () => {
      const response = await api.get<UnloadingCompany[]>('/unloading-companies', { params });
      return response.data;
    },
  });
}

// 하차 업체 단일 조회
export function useUnloadingCompany(id: number | undefined) {
  return useQuery<UnloadingCompany>({
    queryKey: ['unloading-companies', id],
    queryFn: async () => {
      const response = await api.get<UnloadingCompany>(`/unloading-companies/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

// 하차 업체 생성
export function useCreateUnloadingCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUnloadingCompanyDto) => {
      const response = await api.post<UnloadingCompany>('/unloading-companies', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unloading-companies'] });
    },
  });
}

// 하차 업체 수정
export function useUpdateUnloadingCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateUnloadingCompanyDto }) => {
      const response = await api.patch<UnloadingCompany>(`/unloading-companies/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unloading-companies'] });
    },
  });
}

// 하차 업체 삭제
export function useDeleteUnloadingCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/unloading-companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unloading-companies'] });
    },
  });
}

