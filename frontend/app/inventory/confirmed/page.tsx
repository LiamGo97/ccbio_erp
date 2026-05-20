'use client';

import { Suspense } from 'react';
import { InventoryConfirmedPageContent } from '@/components/inventory/inventory-confirmed-page-content';

export default function InventoryConfirmedPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InventoryConfirmedPageContent instanceId="inventory-confirmed" />
    </Suspense>
  );
}
