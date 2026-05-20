'use client';

import { SalesInboundV2Shell } from '@/components/sales/sales-inbound-v2-shell';

export default function SalesInboundScheduledPage() {
  return (
    <SalesInboundV2Shell
      title="입고 예정"
      legacyHref="/inbound/scheduled"
      legacyLabel="기존 입고 예정으로 이동"
    />
  );
}
