import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Region {
  id: number;
  name: string;
  code?: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export function useRegions() {
  return useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: async () => {
      try {
        const response = await api.get<Region[]>('/regions');
        return response.data;
      } catch (error) {
        console.error('useRegions error:', error);
        throw error;
      }
    },
  });
}

