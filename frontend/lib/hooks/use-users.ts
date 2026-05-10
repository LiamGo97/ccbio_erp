import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { User } from '@/lib/auth';

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  roleCode?: string;
}

export interface GetUsersResponse {
  data: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 사용자 목록 조회 (페이지네이션)
export function useUsers(params?: GetUsersParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const response = await api.get<GetUsersResponse>('/users', {
        params,
      });
      return response.data;
    },
  });
}

// 사용자 상세 조회
export function useUser(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId],
    queryFn: async () => {
      const response = await api.get<User>(`/users/${userId}`);
      return response.data;
    },
    enabled: typeof userId === 'number',
  });
}

// 사용자 생성
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { email: string; password?: string; name?: string; phone?: string; isActive?: boolean; roleIds?: number[]; warehouseId?: number }) => {
      const response = await api.post<User>('/users', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// 사용자 수정
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; email?: string; name?: string; phone?: string; password?: string; isActive?: boolean; roleIds?: number[]; warehouseId?: number | null }) => {
      const response = await api.patch<User>(`/users/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', variables.id] });
    },
  });
}

// 사용자 삭제
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

