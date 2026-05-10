import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface CodeMaster {
  id: number;
  group: string;
  name: string;
  value?: string | null;
  order: number;
  parentId?: number | null;
  aliases?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useCodeMasters(group?: string, parentId?: number | null) {
  return useQuery<CodeMaster[]>({
    queryKey: ['code-masters', group, parentId],
    queryFn: async () => {
      try {
        const params: any = {};
        if (group) {
          params.group = group;
        }
        if (parentId !== undefined && parentId !== null) {
          params.parentId = parentId;
        }
        const response = await api.get<CodeMaster[]>('/codes', { params });
        // 응답이 배열이 아닌 경우 처리
        if (Array.isArray(response.data)) {
          return response.data;
        }
        // 응답이 객체인 경우 (페이지네이션 응답일 수 있음)
        if (response.data && typeof response.data === 'object' && 'data' in response.data) {
          return (response.data as any).data || [];
        }
        return [];
      } catch (error) {
        console.error('useCodeMasters error:', error);
        throw error;
      }
    },
    enabled: !!group, // group이 있을 때만 쿼리 실행
  });
}

export function useCodeMastersByGroup(group: string, parentId?: number | null) {
  return useCodeMasters(group, parentId);
}

