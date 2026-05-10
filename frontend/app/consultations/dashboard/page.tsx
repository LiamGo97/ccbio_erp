'use client';

import { SalesDashboardPage } from '@/components/sales/sales-dashboard-page';

/** 상담 관리 > 대시보드: 판매 대시보드와 동일한 주간 재고 / 통관 전 재고 2탭만 표시 */
export default function ConsultationsStockDashboardPage() {
  return <SalesDashboardPage variant="stockOnly" />;
}
