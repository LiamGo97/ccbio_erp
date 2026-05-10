import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface DispatchCompany {
  id: number;
  name: string;
  status: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GetDispatchCompaniesParams {
  search?: string;
  status?: boolean;
}

export interface CreateDispatchCompanyDto {
  name: string;
  status?: boolean;
}

export interface UpdateDispatchCompanyDto {
  name?: string;
  status?: boolean;
}

// 배차 업체 목록 조회
export function useDispatchCompanies(params?: GetDispatchCompaniesParams) {
  return useQuery<DispatchCompany[]>({
    queryKey: ['dispatch-companies', params],
    queryFn: async () => {
      const response = await api.get<DispatchCompany[]>('/dispatch-companies', { params });
      return response.data;
    },
  });
}

// 배차 업체 단일 조회
export function useDispatchCompany(id: number | undefined) {
  return useQuery<DispatchCompany>({
    queryKey: ['dispatch-companies', id],
    queryFn: async () => {
      const response = await api.get<DispatchCompany>(`/dispatch-companies/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

// 배차 업체 생성
export function useCreateDispatchCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDispatchCompanyDto) => {
      const response = await api.post<DispatchCompany>('/dispatch-companies', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-companies'] });
    },
  });
}

// 배차 업체 수정
export function useUpdateDispatchCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateDispatchCompanyDto }) => {
      const response = await api.patch<DispatchCompany>(`/dispatch-companies/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-companies'] });
    },
  });
}

// 배차 업체 삭제
export function useDeleteDispatchCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/dispatch-companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-companies'] });
    },
  });
}

