import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface CustomerLedgerEntry {
  date: string;
  type: 'INVOICE' | 'COLLECTION';
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  collectionId?: string | null;
  collectionNumber?: string | null;
  amount: number;
  balance: number;
  notes?: string | null;
  paymentDueDate?: string | null; // 결제조건일
  paymentTermsType?: string | null; // 결제조건 타입
  paymentTermsValue?: number | null; // 결제조건 값
  /** 수금 행만 */
  isPrepayment?: boolean;
}

export interface CustomerLedgerResponse {
  customerId: string;
  customerName: string | null;
  entries: CustomerLedgerEntry[];
  totalSales: number;
  totalCollected: number;
  currentBalance: number;
}

export interface GetCustomerLedgerParams {
  startDate?: string;
  endDate?: string;
}

export function useCustomerLedger(
  customerId: string | null | undefined,
  params?: GetCustomerLedgerParams,
) {
  return useQuery<CustomerLedgerResponse>({
    queryKey: ['customer-ledger', customerId, params],
    queryFn: async () => {
      if (!customerId) {
        throw new Error('고객 ID가 필요합니다.');
      }
      const response = await api.get<CustomerLedgerResponse>(
        `/receivables/customers/${customerId}/ledger`,
        { params },
      );
      return response.data;
    },
    enabled: !!customerId,
  });
}
