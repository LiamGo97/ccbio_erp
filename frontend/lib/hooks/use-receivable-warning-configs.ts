import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ReceivableWarningConfig {
  id: number;
  warningLevel: 'WARNING_1ST' | 'WARNING_2ND' | 'WARNING_3RD' | 'MALICIOUS';
  daysThreshold: number;
  smsEnabled: boolean;
  smsDaily: boolean;
  smsTemplateType?: string | null;
  description?: string | null;
  order: number;
  isActive: boolean;
  userId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateReceivableWarningConfigDto {
  daysThreshold: number;
  smsEnabled: boolean;
  smsDaily: boolean;
  smsTemplateType?: string | null;
  description?: string | null;
  order: number;
  isActive: boolean;
  userId?: number | null;
}

export interface CreateReceivableWarningConfigDto {
  warningLevel: 'WARNING_1ST' | 'WARNING_2ND' | 'WARNING_3RD' | 'MALICIOUS';
  daysThreshold: number;
  smsEnabled: boolean;
  smsDaily: boolean;
  smsTemplateType?: string | null;
  description?: string | null;
  order: number;
  isActive: boolean;
  userId?: number | null;
}

export function useReceivableWarningConfigs() {
  return useQuery<ReceivableWarningConfig[]>({
    queryKey: ['receivable-warning-configs'],
    queryFn: async () => {
      const response = await api.get<ReceivableWarningConfig[]>('/receivables/warning-configs');
      return response.data;
    },
  });
}

export function useUpdateReceivableWarningConfig() {
  const queryClient = useQueryClient();
  return useMutation<ReceivableWarningConfig, Error, { id: number; dto: UpdateReceivableWarningConfigDto }>({
    mutationFn: async ({ id, dto }) => {
      const response = await api.put<ReceivableWarningConfig>(`/receivables/warning-configs/${id}`, dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivable-warning-configs'] });
    },
  });
}

export function useCreateReceivableWarningConfig() {
  const queryClient = useQueryClient();
  return useMutation<ReceivableWarningConfig, Error, CreateReceivableWarningConfigDto>({
    mutationFn: async (dto) => {
      const response = await api.post<ReceivableWarningConfig>('/receivables/warning-configs', dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivable-warning-configs'] });
    },
  });
}

export function useDeleteReceivableWarningConfig() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await api.delete(`/receivables/warning-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivable-warning-configs'] });
    },
  });
}
