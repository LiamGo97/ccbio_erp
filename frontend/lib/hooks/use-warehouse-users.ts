import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// 현재 사용자의 창고 ID 조회
export function useMyWarehouseId() {
  return useQuery<{ warehouseId: number | null }>({
    queryKey: ['warehouses', 'me', 'warehouse-id'],
    queryFn: async () => {
      const response = await api.get<{ warehouseId: number | null }>('/warehouses/me/warehouse-id');
      return response.data;
    },
    retry: false,
  });
}

