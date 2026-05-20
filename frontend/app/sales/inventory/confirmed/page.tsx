'use client';

import { Suspense } from 'react';
import { SalesInventoryConfirmedPageContent } from '@/components/inventory/sales-inventory-confirmed-page-content';

export default function SalesInventoryConfirmedPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SalesInventoryConfirmedPageContent instanceId="sales-inventory-confirmed" />
    </Suspense>
  );
}
