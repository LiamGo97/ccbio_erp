import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Consultation, ConsultationListResponse } from '@/lib/hooks/use-consultations';

export interface CustomerActivityDateRange {
  start?: Date;
  end?: Date;
}

export interface UseCustomerConsultationsParams {
  customerId?: string;
  customerPhone?: string;
  enabled?: boolean;
}

export function useCustomerConsultations({
  customerId = '',
  customerPhone = '',
  enabled = true,
}: UseCustomerConsultationsParams) {
  const canQuery = !!customerId || !!customerPhone;

  return useQuery<ConsultationListResponse>({
    queryKey: ['customer-consultations-panel', customerId, customerPhone],
    queryFn: async () => {
      const response = await api.get<ConsultationListResponse>('/consultations', {
        params: {
          customerId: customerId || undefined,
          phone: customerId ? undefined : customerPhone,
          limit: 50,
          sortBy: 'consultationDate',
          sortOrder: 'desc',
        },
      });
      return response.data;
    },
    enabled: enabled && canQuery,
  });
}

export function filterConsultations(
  consultations: Consultation[],
  search: string,
  dateRange: CustomerActivityDateRange,
): Consultation[] {
  const text = search.trim().toLowerCase();
  const start = dateRange.start ? new Date(dateRange.start) : null;
  const end = dateRange.end ? new Date(dateRange.end) : null;
  const startAt = start ? new Date(start.setHours(0, 0, 0, 0)) : null;
  const endAt = end ? new Date(end.setHours(23, 59, 59, 999)) : null;

  return consultations.filter((item) => {
    if (text) {
      const haystack = [
        item.productName ?? '',
        item.inquiryProduct ?? '',
        item.notes ?? '',
        item.managerName ?? '',
        item.type ?? '',
        item.inOut ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(text)) return false;
    }

    if (item.consultationDate && (startAt || endAt)) {
      const date = new Date(item.consultationDate);
      if (startAt && date < startAt) return false;
      if (endAt && date > endAt) return false;
    }
    return true;
  });
}

export function buildConsultationProductStats(
  consultations: Consultation[],
  productLabelMap: Map<string, string>,
): { total: number; entries: { name: string; count: number }[] } {
  const counts = new Map<string, number>();
  consultations.forEach((item) => {
    if (item.products && item.products.length > 0) {
      item.products.forEach((product) => {
        const productName =
          (product.productName
            ? productLabelMap.get(product.productName) ?? product.productName
            : '') || '기타';
        counts.set(productName, (counts.get(productName) ?? 0) + 1);
      });
      return;
    }
    const fallback =
      (item.productName
        ? productLabelMap.get(item.productName) ?? item.productName
        : item.inquiryProduct) || '기타';
    counts.set(fallback, (counts.get(fallback) ?? 0) + 1);
  });
  const entries = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const total = entries.reduce((sum, item) => sum + item.count, 0);
  return { total, entries };
}

export function resolveConsultationProductLabel(
  item: Consultation,
  productLabelMap: Map<string, string>,
): string {
  const productCode = (item.productName ?? '').trim();
  if (productCode) {
    return productLabelMap.get(productCode) ?? productCode;
  }
  return item.inquiryProduct?.trim() || '문의 제품 미정';
}
