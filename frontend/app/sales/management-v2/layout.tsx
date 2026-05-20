import { SalesManagementV2Layout } from '@/components/sales/sales-management-v2-layout';

export default function SalesManagementV2RouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SalesManagementV2Layout>{children}</SalesManagementV2Layout>;
}
