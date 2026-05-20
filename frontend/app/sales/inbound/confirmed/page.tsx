'use client';

import { SalesInboundV2Shell } from '@/components/sales/sales-inbound-v2-shell';

export default function SalesInboundConfirmedPage() {
  return (
    <SalesInboundV2Shell
      title="입고 확정"
      legacyHref="/inbound/confirmed"
      legacyLabel="기존 입고 확정으로 이동"
    />
  );
}
