import type { Customer } from '@/lib/hooks/use-customers';
import { formatCustomerListDefaultAddress } from '@/lib/customer-default-address-kind';

export type SalesUnloadingAddressSlice = {
  unloadingPostalCode?: string | null;
  unloadingAddress?: string | null;
  unloadingAddressDetail?: string | null;
  unloadingAddressRoad?: string | null;
  unloadingAddressJibun?: string | null;
};

/**
 * 운송관리 등: 배송(tb_sales_delivery) 레거시 한 줄 대신
 * 판매(tb_sales) 도로명·지번을 우선하고, 둘 다 없을 때만 판매 레거시 한 줄(sa_unloading_address).
 */
export function salesUnloadingMainLine(sales: SalesUnloadingAddressSlice | null | undefined): string {
  if (!sales) return '';
  const road = sales.unloadingAddressRoad?.trim() || '';
  const jibun = sales.unloadingAddressJibun?.trim() || '';
  if (road || jibun) {
    return formatCustomerListDefaultAddress({
      address: '',
      addressRoad: road,
      addressJibun: jibun,
      addressDefaultType: '',
    } as Customer);
  }
  return sales.unloadingAddress?.trim() || '';
}
