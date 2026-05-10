import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Role {
  id: number;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface GetRolesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetRolesResponse {
  data: Role[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 역할 목록 조회 (페이지네이션)
export function useRoles(params?: GetRolesParams) {
  return useQuery({
    queryKey: ['roles', params],
    queryFn: async () => {
      const response = await api.get<GetRolesResponse | Role[]>('/roles', {
        params,
      });
      return response.data;
    },
  });
}

// 역할 상세 조회
export function useRole(roleId: number | undefined) {
  return useQuery({
    queryKey: ['roles', roleId],
    queryFn: async () => {
      const response = await api.get<Role>(`/roles/${roleId}`);
      return response.data;
    },
    enabled: typeof roleId === 'number',
  });
}

// 역할 생성
export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; code: string; description?: string; isActive?: boolean }) => {
      const response = await api.post<Role>('/roles', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

// 역할 수정
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; code?: string; description?: string; isActive?: boolean }) => {
      const response = await api.patch<Role>(`/roles/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles', variables.id] });
    },
  });
}

// 역할 삭제
export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/roles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

