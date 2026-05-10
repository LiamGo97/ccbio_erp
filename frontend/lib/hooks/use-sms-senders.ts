import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface SmsSender {
  id: number;
  phone: string;
  name: string;
  status: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetSmsSendersParams {
  search?: string;
  status?: boolean;
}

export interface CreateSmsSenderDto {
  phone: string;
  name: string;
  status?: boolean;
  notes?: string;
}

export interface UpdateSmsSenderDto {
  phone?: string;
  name?: string;
  status?: boolean;
  notes?: string;
}

// SMS 발신자 목록 조회
export function useSmsSenders(params?: GetSmsSendersParams) {
  return useQuery<SmsSender[]>({
    queryKey: ['sms-senders', params],
    queryFn: async () => {
      const response = await api.get<SmsSender[]>('/sms-senders', { params });
      return response.data;
    },
  });
}

// SMS 발신자 단일 조회
export function useSmsSender(id: number | undefined) {
  return useQuery<SmsSender>({
    queryKey: ['sms-senders', id],
    queryFn: async () => {
      const response = await api.get<SmsSender>(`/sms-senders/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

// SMS 발신자 생성
export function useCreateSmsSender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSmsSenderDto) => {
      const response = await api.post<SmsSender>('/sms-senders', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-senders'] });
    },
  });
}

// SMS 발신자 수정
export function useUpdateSmsSender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateSmsSenderDto }) => {
      const response = await api.patch<SmsSender>(`/sms-senders/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-senders'] });
    },
  });
}

// SMS 발신자 삭제
export function useDeleteSmsSender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/sms-senders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-senders'] });
    },
  });
}
