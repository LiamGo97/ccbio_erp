'use client';

import { Suspense } from 'react';
import { InboundPendingPageContent } from '@/components/inbound/inbound-pending-page-content';

export default function InboundPendingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InboundPendingPageContent instanceId="inbound-pending" />
    </Suspense>
  );
}
