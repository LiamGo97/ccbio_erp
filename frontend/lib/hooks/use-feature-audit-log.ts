import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface FeatureAuditUser {
  id?: number;
  name?: string | null;
}

export interface FeatureAuditLogRow {
  id: number;
  createdAt: string;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  summary: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  user?: FeatureAuditUser | null;
}

export interface FeatureAuditLogsResponse {
  data: FeatureAuditLogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useFeatureAuditLogsForEntity(options: {
  entityType: string;
  entityId: number | null;
  limit?: number;
  enabled?: boolean;
}) {
  const { entityType, entityId, limit = 100, enabled = true } = options;
  return useQuery({
    queryKey: ['feature-audit-log', entityType, entityId, limit],
    queryFn: async () => {
      const res = await api.get<FeatureAuditLogsResponse>('/feature-audit-log', {
        params: {
          entityType,
          entityId,
          limit,
          page: 1,
        },
      });
      return res.data;
    },
    enabled: enabled && entityId != null && !Number.isNaN(entityId),
  });
}
