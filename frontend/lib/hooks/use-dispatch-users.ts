import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface DispatchUser {
  id: number;
  userId: number;
  dispatchCompanyId: number;
  name: string;
  phone?: string | null;
  position?: string | null;
  status: boolean;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: number;
    email: string;
    name: string | null;
  };
  dispatchCompany?: {
    id: number;
    name: string;
  };
}

export interface GetDispatchUsersParams {
  dispatchCompanyId?: number;
  userId?: number;
  status?: boolean;
  search?: string;
}

export interface CreateDispatchUserDto {
  userId: number;
  dispatchCompanyId: number;
  name: string;
  phone?: string;
  position?: string;
  status?: boolean;
}

export interface UpdateDispatchUserDto {
  dispatchCompanyId?: number;
  name?: string;
  phone?: string;
  position?: string;
  status?: boolean;
}

// 현재 사용자의 배차 업체 ID 조회
export function useMyDispatchCompanyId() {
  return useQuery<{ dispatchCompanyId: number | null }>({
    queryKey: ['dispatch-users', 'me', 'company-id'],
    queryFn: async () => {
      const response = await api.get<{ dispatchCompanyId: number | null }>('/dispatch-users/me/company-id');
      return response.data;
    },
    retry: false,
  });
}

// 현재 사용자의 배차 업체 사용자 정보 조회
export function useMyDispatchUser() {
  return useQuery<DispatchUser | null>({
    queryKey: ['dispatch-users', 'me'],
    queryFn: async () => {
      const response = await api.get<DispatchUser | null>('/dispatch-users/me');
      return response.data;
    },
    retry: false,
  });
}

// 배차 업체 직원 목록 조회
export function useDispatchUsers(params?: GetDispatchUsersParams) {
  // 쿼리 키를 더 명확하게 만들기 (userId가 있으면 별도로 처리)
  const queryKey = React.useMemo(() => {
    if (params?.userId) {
      return ['dispatch-users', 'user', params.userId];
    }
    return ['dispatch-users', params];
  }, [params]);
  
  return useQuery<DispatchUser[]>({
    queryKey,
    queryFn: async () => {
      const response = await api.get<DispatchUser[]>('/dispatch-users', { params });
      return response.data;
    },
  });
}

// 배차 업체 직원 단일 조회
export function useDispatchUser(id: number | undefined) {
  return useQuery<DispatchUser>({
    queryKey: ['dispatch-users', id],
    queryFn: async () => {
      const response = await api.get<DispatchUser>(`/dispatch-users/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

// 배차 업체 직원 생성
export function useCreateDispatchUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDispatchUserDto) => {
      const response = await api.post<DispatchUser>('/dispatch-users', data);
      return response.data;
    },
    onSuccess: (data) => {
      // 모든 dispatch-users 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['dispatch-users'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-users', 'me'] });
      // 특정 사용자의 배차 업체 정보도 무효화 (객체 비교 문제를 피하기 위해 prefix로 무효화)
      if (data.userId) {
        queryClient.invalidateQueries({ 
          queryKey: ['dispatch-users'],
          predicate: (query) => {
            const params = query.queryKey[1] as GetDispatchUsersParams | undefined;
            return params?.userId === data.userId;
          }
        });
      }
    },
  });
}

// 배차 업체 직원 수정
export function useUpdateDispatchUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateDispatchUserDto }) => {
      const response = await api.patch<DispatchUser>(`/dispatch-users/${id}`, data);
      return response.data;
    },
    onSuccess: (data) => {
      // 모든 dispatch-users 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['dispatch-users'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-users', 'me'] });
      // 특정 사용자의 배차 업체 정보도 무효화 (객체 비교 문제를 피하기 위해 prefix로 무효화)
      if (data.userId) {
        queryClient.invalidateQueries({ 
          queryKey: ['dispatch-users'],
          predicate: (query) => {
            const params = query.queryKey[1] as GetDispatchUsersParams | undefined;
            return params?.userId === data.userId;
          }
        });
      }
    },
  });
}

// 배차 업체 직원 삭제
export function useDeleteDispatchUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/dispatch-users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-users'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-users', 'me'] });
    },
  });
}

