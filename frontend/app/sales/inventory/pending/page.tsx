'use client';

import { Suspense } from 'react';
import { SalesInventoryPendingPageContent } from '@/components/inventory/sales-inventory-pending-page-content';

export default function SalesInventoryPendingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SalesInventoryPendingPageContent instanceId="sales-inventory-pending" />
    </Suspense>
  );
}
