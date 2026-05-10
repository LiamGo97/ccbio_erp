import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface SmsHistory {
  id: number;
  templateId?: number | null;
  templateType: string;
  templateContent?: string | null;
  recipientPhone: string;
  recipientName?: string | null;
  senderPhone: string;
  senderUserId?: number | null;
  message: string;
  messageType: string; // SMS, LMS, MMS
  imageUrl?: string | null;
  imagePath?: string | null;
  imageUrl2?: string | null;
  imagePath2?: string | null;
  invoiceId?: number | null;
  relatedId?: number | null;
  relatedType?: string | null;
  aligoMid?: string | null;
  aligoMdid?: string | null;
  status?: string | null;
  aligoStatus?: string | null;
  resultCode?: string | null;
  resultMessage?: string | null;
  smsCount?: number | null;
  failCount: number;
  sentAt?: string | Date | null;
  doneAt?: string | Date | null;
  reservedAt?: string | Date | null;
  isResent: boolean;
  originalHistoryId?: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  createdById?: number | null;
  notes?: string | null;
  template?: {
    id: number;
    name: string;
    type: string;
  } | null;
  senderUser?: {
    id: number;
    name: string;
    email: string;
  } | null;
  createdBy?: {
    id: number;
    name: string;
    email: string;
  } | null;
}

export interface GetSmsHistoryParams {
  invoiceId?: number;
  templateType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface SmsHistoryResponse {
  data: SmsHistory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// SMS 이력 목록 조회
export function useSmsHistory(params?: GetSmsHistoryParams) {
  return useQuery({
    queryKey: ['sms-history', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.invoiceId) {
        queryParams.append('invoiceId', params.invoiceId.toString());
      }
      if (params?.templateType) {
        queryParams.append('templateType', params.templateType);
      }
      if (params?.status) {
        queryParams.append('status', params.status);
      }
      if (params?.page) {
        queryParams.append('page', params.page.toString());
      }
      if (params?.limit) {
        queryParams.append('limit', params.limit.toString());
      }

      const queryString = queryParams.toString();
      const url = `/sms-history${queryString ? `?${queryString}` : ''}`;
      const response = await api.get<SmsHistoryResponse>(url);
      return response.data;
    },
  });
}

// 거래명세서별 SMS 이력 조회
export function useSmsHistoryByInvoice(invoiceId: number) {
  return useQuery({
    queryKey: ['sms-history', 'invoice', invoiceId],
    queryFn: async () => {
      const response = await api.get<SmsHistory[]>(`/sms-history/invoice/${invoiceId}`);
      return response.data;
    },
    enabled: !!invoiceId,
  });
}

// SMS 이력 상세 조회
export function useSmsHistoryDetail(id: number | null) {
  return useQuery({
    queryKey: ['sms-history', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await api.get<SmsHistory>(`/sms-history/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}
