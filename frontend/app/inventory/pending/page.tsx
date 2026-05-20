'use client';

import { Suspense } from 'react';
import { InventoryPendingPageContent } from '@/components/inventory/inventory-pending-page-content';

export default function InventoryPendingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InventoryPendingPageContent instanceId="inventory-pending" />
    </Suspense>
  );
}
