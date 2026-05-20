'use client';

import * as React from 'react';
import { SalesManagementV2PageContent } from '@/components/sales/sales-management-v2-page-content';

export default function SalesManagementV2SalesPage() {
  return (
    <React.Suspense fallback={null}>
      <SalesManagementV2PageContent />
    </React.Suspense>
  );
}
