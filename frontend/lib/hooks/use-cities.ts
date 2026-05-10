import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface City {
  id: number;
  regionId: number;
  name: string;
  code?: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  region?: {
    id: number;
    name: string;
  };
}

export function useCities(regionId?: number) {
  return useQuery<City[]>({
    queryKey: ['cities', regionId],
    queryFn: async () => {
      try {
        const params = regionId ? { regionId: regionId.toString() } : {};
        const response = await api.get<City[]>('/cities', { params });
        const cities = response.data;
        // 디버깅: 실제 응답 데이터 확인
        if (cities && cities.length > 0) {
          console.log('useCities 응답 데이터 샘플:', cities[0]);
          console.log('useCities 응답 데이터 id 필드:', cities[0]?.id);
          const citiesWithoutId = cities.filter(city => city.id == null);
          if (citiesWithoutId.length > 0) {
            console.warn('Cities without id:', citiesWithoutId);
          }
        }
        return cities;
      } catch (error) {
        console.error('useCities error:', error);
        throw error;
      }
    },
    enabled: regionId != null, // regionId가 있을 때만 조회
  });
}

