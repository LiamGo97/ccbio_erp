import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export type LegalAdminMasterRow = {
  bCode: string;
  sidoName: string;
  sigunguName: string;
  eupmyeondongName: string;
  riName: string;
  sortRank?: number | null;
  createdDateSrc?: string | null;
  deletedDateSrc?: string | null;
  legacyBCode?: string | null;
  createdAt: string;
  updatedAt: string;
  sidoCode: string;
  sigunguCode: string;
};

export type LegalAdminMasterListResponse = {
  data: LegalAdminMasterRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type GeoOption = { code: string; name: string };

export function useLegalAdminMasterList(params: {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  sidoCode?: string;
  sigunguCode?: string;
  q?: string;
}) {
  return useQuery({
    queryKey: ['legal-admin-master', params],
    queryFn: async () => {
      const res = await api.get<LegalAdminMasterListResponse>('/legal-admin-master', {
        params: {
          page: params.page,
          limit: params.limit,
          sortBy: params.sortBy ?? 'bCode',
          sortOrder: params.sortOrder ?? 'asc',
          sidoCode: params.sidoCode || undefined,
          sigunguCode: params.sigunguCode || undefined,
          q: params.q?.trim() || undefined,
        },
      });
      return res.data;
    },
  });
}

export function useLegalAdminSidoOptions() {
  return useQuery({
    queryKey: ['legal-admin-master', 'sido-options'],
    queryFn: async () => {
      const res = await api.get<GeoOption[]>('/legal-admin-master/sido-options');
      return res.data;
    },
  });
}

export function useLegalAdminSigunguOptions(sidoCode: string | undefined) {
  return useQuery({
    queryKey: ['legal-admin-master', 'sigungu-options', sidoCode],
    enabled: Boolean(sidoCode),
    queryFn: async () => {
      const res = await api.get<GeoOption[]>('/legal-admin-master/sigungu-options', {
        params: { sidoCode },
      });
      return res.data;
    },
  });
}
