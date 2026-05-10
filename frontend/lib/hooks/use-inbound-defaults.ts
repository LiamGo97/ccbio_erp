import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

export interface InboundDefaults {
  defaultExchangeRateUsd: number;
  defaultExchangeRateEur: number;
}

export interface InboundDefaultsHistoryItem {
  id: number;
  valueUsd: string;
  valueEur: string;
  changedAt: string;
  changedByName: string | null;
}

export function useInboundDefaults() {
  return useQuery<InboundDefaults>({
    queryKey: ['inbound-defaults'],
    queryFn: async () => {
      const response = await api.get<InboundDefaults>('/inbound-defaults');
      return response.data;
    },
  });
}

export function useInboundDefaultsHistory() {
  return useQuery<InboundDefaultsHistoryItem[]>({
    queryKey: ['inbound-defaults', 'history'],
    queryFn: async () => {
      const response = await api.get<InboundDefaultsHistoryItem[]>(
        '/inbound-defaults/history',
      );
      return response.data;
    },
  });
}

export function useUpdateInboundDefaults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: InboundDefaults) => {
      const response = await api.put<InboundDefaults>(
        '/inbound-defaults',
        dto,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound-defaults'] });
      queryClient.invalidateQueries({ queryKey: ['inbound-defaults', 'history'] });
      toast({
        title: '저장 완료',
        description: '입고 기본 설정이 저장되었습니다.',
      });
    },
    onError: (error: { response?: { data?: { message?: string }; message?: string } }) => {
      toast({
        title: '저장 실패',
        description:
          error.response?.data?.message || '입고 기본 설정 저장에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}
