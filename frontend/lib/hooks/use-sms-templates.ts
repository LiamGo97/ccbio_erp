import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface SmsTemplateToken {
  token: string;
  description: string;
}

export interface SmsTemplate {
  id: number;
  type: string;
  name: string;
  content: string;
  availableTokens?: SmsTemplateToken[] | null;
  supplierId?: number | null;
  supplier?: {
    id: number;
    companyName: string;
  } | null;
  sender?: string | null; // 발신번호
  createdAt: string;
  updatedAt: string;
  createdById?: number | null;
  updatedById?: number | null;
  createdBy?: {
    id: number;
    name: string;
    email: string;
  } | null;
  updatedBy?: {
    id: number;
    name: string;
    email: string;
  } | null;
}

export interface GetSmsTemplatesParams {
  type?: string;
  supplierId?: number | null;
  page?: number;
  limit?: number;
}

export interface SmsTemplatesResponse {
  data: SmsTemplate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 템플릿 목록 조회
export function useSmsTemplates(params?: GetSmsTemplatesParams) {
  return useQuery({
    queryKey: ['sms-templates', params],
    queryFn: async () => {
      const response = await api.get<SmsTemplatesResponse>('/sms-templates', { params });
      return response.data;
    },
  });
}

// 타입별 템플릿 조회
export function useSmsTemplatesByType(type: string, supplierId?: number | null) {
  return useQuery({
    queryKey: ['sms-templates', 'type', type, supplierId],
    queryFn: async () => {
      const params: any = {};
      if (supplierId !== undefined) {
        params.supplierId = supplierId;
      }
      const response = await api.get<SmsTemplate[]>('/sms-templates/type/' + type, { params });
      return response.data;
    },
    enabled: !!type,
  });
}

// 템플릿 상세 조회
export function useSmsTemplate(id: number | null) {
  return useQuery({
    queryKey: ['sms-templates', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await api.get<SmsTemplate>('/sms-templates/' + id);
      return response.data;
    },
    enabled: !!id,
  });
}

// 템플릿 생성
export function useCreateSmsTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      type: string;
      name: string;
      content: string;
      availableTokens?: SmsTemplateToken[];
      supplierId?: number | null;
      sender?: string | null;
    }) => {
      const response = await api.post<SmsTemplate>('/sms-templates', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
    },
  });
}

// 템플릿 수정
export function useUpdateSmsTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SmsTemplate> }) => {
      const response = await api.patch<SmsTemplate>(`/sms-templates/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
      queryClient.invalidateQueries({ queryKey: ['sms-templates', variables.id] });
    },
  });
}

// 템플릿 삭제
export function useDeleteSmsTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/sms-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
    },
  });
}
