import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Code {
  id: number;
  group: string; // 코드 그룹 (예: 'SHIPPING_LINE')
  name: string; // 표시명
  value?: string | null; // 실제 코드 값
  order: number; // 정렬 순서
  parentId?: number | null; // 부모 ID
  aliases?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetCodesParams {
  group?: string; // 코드 그룹으로 필터링
  parentId?: number; // 부모 ID로 필터링
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetCodesResponse {
  data: Code[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateCodeDto {
  group: string;
  name: string;
  value?: string;
  order?: number;
  parentId?: number | null;
  aliases?: string;
}

export interface UpdateCodeDto {
  group?: string;
  name?: string;
  value?: string;
  order?: number;
  parentId?: number | null;
  aliases?: string;
}

// 코드 목록 조회 (페이지네이션)
export function useCodes(params?: GetCodesParams) {
  return useQuery<GetCodesResponse>({
    queryKey: ['codes', params],
    queryFn: async () => {
      try {
        const response = await api.get<GetCodesResponse | Code[]>('/codes', { params });
        const responseData = response.data;
        
        // 백엔드가 배열을 직접 반환하는 경우 (group만 있고 page/limit가 없는 경우)
        if (Array.isArray(responseData)) {
          return {
            data: responseData,
            total: responseData.length,
            page: 1,
            limit: responseData.length,
            totalPages: 1,
          };
        }
        
        // 페이지네이션 응답인 경우
        return responseData;
      } catch (error) {
        console.error('useCodes error:', error);
        throw error;
      }
    },
  });
}

// 카테고리별 코드 조회 (페이지네이션 없이)
export function useCodesByCategory(categoryCode: string) {
  return useQuery<Code[]>({
    queryKey: ['codes', 'category', categoryCode],
    queryFn: async () => {
      const response = await api.get<Code[]>('/codes', {
        params: { group: categoryCode },
      });
      return response.data;
    },
    enabled: !!categoryCode,
  });
}

// 코드 단일 조회
export function useCode(id: number | undefined) {
  return useQuery<Code>({
    queryKey: ['codes', id],
    queryFn: async () => {
      const response = await api.get<Code>(`/codes/${id}`);
      return response.data;
    },
    enabled: typeof id === 'number',
  });
}

// 코드 생성
export function useCreateCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCodeDto) => {
      const response = await api.post<Code>('/codes', data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['codes'] });
    },
  });
}

// 코드 수정
export function useUpdateCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateCodeDto }) => {
      const response = await api.patch<Code>(`/codes/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['codes'] });
    },
  });
}

// 코드 삭제
export function useDeleteCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['codes'] });
    },
  });
}

