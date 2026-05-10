import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface OrganicCertification {
  id: number;
  certificationAgency?: string | null;
  certificationNumber?: string | null;
  mainProduct?: string | null;
  certificationType?: string | null;
  companyName?: string | null;
  producer?: string | null;
  phone?: string | null;
  farmCount: number;
  address?: string | null;
  certificationStartDate?: string | null;
  certificationEndDate?: string | null;
  cultivationAreaM2?: number | null;
  annualProductionTarget?: number | null;
  livestockCount?: number | null;
  deliveryDestination?: string | null;
  detailProducts?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetOrganicCertificationsParams {
  page?: number;
  limit?: number;
  search?: string;
  certificationAgency?: string;
  certificationType?: string;
  producer?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface OrganicCertificationsResponse {
  data: OrganicCertification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useOrganicCertifications(params?: GetOrganicCertificationsParams) {
  return useQuery<OrganicCertificationsResponse>({
    queryKey: ['organic-certifications', params],
    queryFn: async () => {
      const response = await api.get<OrganicCertificationsResponse>('/organic-certifications', {
        params,
      });
      return response.data;
    },
  });
}

export function useOrganicCertification(id: number | undefined) {
  return useQuery<OrganicCertification>({
    queryKey: ['organic-certification', id],
    queryFn: async () => {
      const response = await api.get<OrganicCertification>(`/organic-certifications/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateOrganicCertification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<OrganicCertification>) => {
      const response = await api.post<OrganicCertification>('/organic-certifications', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organic-certifications'] });
    },
  });
}

export function useUpdateOrganicCertification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<OrganicCertification> }) => {
      const response = await api.put<OrganicCertification>(`/organic-certifications/${id}`, data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // 목록 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['organic-certifications'] });
      // 개별 인증 정보 쿼리 무효화 (상세보기 갱신)
      queryClient.invalidateQueries({ queryKey: ['organic-certification', variables.id] });
    },
  });
}

export function useDeleteOrganicCertification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/organic-certifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organic-certifications'] });
    },
  });
}

export function useUploadOrganicCertificationExcel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<{
        success: boolean;
        imported: number;
        skipped: number;
        errors: number;
        message: string;
      }>('/organic-certifications/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organic-certifications'] });
    },
  });
}

export interface OrganicCertificationStats {
  totalFarmCount: number;
  totalLivestockCount: number;
  farmCountByProduct: {
    전체: number;
    젖소: number;
    한우: number;
  };
  livestockCountByProduct: {
    전체: number;
    젖소: number;
    한우: number;
  };
  byRegion: Array<{
    region: string;
    farmCount: number;
    livestockCount: number;
    byProduct: {
      젖소: { farmCount: number; livestockCount: number };
      한우: { farmCount: number; livestockCount: number };
    };
  }>;
  mainProducts: string[]; // 대표품목 목록 추가
}

export function useOrganicCertificationStats() {
  return useQuery<OrganicCertificationStats>({
    queryKey: ['organic-certification-stats'],
    queryFn: async () => {
      const response = await api.get<OrganicCertificationStats>('/organic-certifications/stats/summary');
      return response.data;
    },
  });
}

