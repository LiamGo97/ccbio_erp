'use client';

import { Suspense } from 'react';
import { SalesInventoryConfirmedPageContent } from '@/components/inventory/sales-inventory-confirmed-page-content';

export default function SalesManagementV2InventoryPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground text-sm">로딩 중…</div>}>
      <SalesInventoryConfirmedPageContent
        instanceId="sales-management-v2-inventory"
        embedded
        title="재고 풀"
        description="입고 확정된 BL·패킹별 가용 베일·중량입니다. 행을 클릭하면 BL 정보·컨테이너·연결 판매를 확인합니다."
      />
    </Suspense>
  );
}
