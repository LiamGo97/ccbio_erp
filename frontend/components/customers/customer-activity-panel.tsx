'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import {
  filterConsultations,
  useCustomerConsultations,
  type CustomerActivityDateRange,
} from '@/lib/hooks/use-customer-consultations';
import {
  filterLedgerEntries,
  useCustomerLedgerActivity,
} from '@/lib/hooks/use-customer-ledger-activity';
import { CustomerActivityConsultationTab } from './customer-activity-consultation-tab';
import { CustomerActivityTradeTab } from './customer-activity-trade-tab';
import { CustomerActivityReceivableTab } from './customer-activity-receivable-tab';
import { CustomerLedgerDrawer } from '@/components/finance/customer-ledger-drawer';
import { InvoiceDetailDrawer } from '@/components/sales/invoice-detail-drawer';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CustomerActivityTab = 'consultation' | 'trade' | 'receivable';

interface CustomerActivityPanelProps {
  customerId?: string;
  customerPhone?: string;
  enabled?: boolean;
  /** 모바일 전체 화면 패널 닫기 */
  onClose?: () => void;
}

function toCodeMap(codes?: Array<{ value?: string | null; name?: string | null }>) {
  const map = new Map<string, string>();
  (codes ?? []).forEach((c) => {
    const key = (c.value ?? c.name ?? '').trim();
    const label = (c.name ?? c.value ?? '').trim();
    if (key) map.set(key, label || key);
  });
  return map;
}

export function CustomerActivityPanel({
  customerId = '',
  customerPhone = '',
  enabled = true,
  onClose,
}: CustomerActivityPanelProps) {
  const [activeTab, setActiveTab] = React.useState<CustomerActivityTab>('consultation');
  const [search, setSearch] = React.useState('');
  const [dateRange, setDateRange] = React.useState<CustomerActivityDateRange>({});
  const [ledgerDrawerOpen, setLedgerDrawerOpen] = React.useState(false);
  const [invoiceDrawerOpen, setInvoiceDrawerOpen] = React.useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string | null>(null);

  const canQueryConsultations = !!customerId || !!customerPhone;
  const canQueryLedger = !!customerId;

  React.useEffect(() => {
    if (!enabled) {
      setSearch('');
      setDateRange({});
      setActiveTab('consultation');
      setLedgerDrawerOpen(false);
      setInvoiceDrawerOpen(false);
      setSelectedInvoiceId(null);
    }
  }, [enabled, customerId]);

  const { data: consultationTypeCodes } = useCodeMastersByGroup('CONSULTATION_TYPE');
  const { data: consultationInOutCodes } = useCodeMastersByGroup('CONSULTATION_INOUT');
  const { data: consultationSourceCodes } = useCodeMastersByGroup('CONSULTATION_SOURCE');
  const { data: consultationRequestWeightCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: consultationSalesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: consultationPackingTypeCodes } = useCodeMastersByGroup('PACKING_TYPE');
  const { data: consultationProductCategories } = useCodeMastersByGroup('PRODUCT_CATEGORY');
  const { data: consultationProductCodes } = useCodeMastersByGroup('PRODUCT');

  const consultationTypeMap = React.useMemo(() => toCodeMap(consultationTypeCodes), [consultationTypeCodes]);
  const consultationInOutMap = React.useMemo(() => toCodeMap(consultationInOutCodes), [consultationInOutCodes]);
  const consultationSourceMap = React.useMemo(() => toCodeMap(consultationSourceCodes), [consultationSourceCodes]);
  const consultationRequestWeightMap = React.useMemo(
    () => toCodeMap(consultationRequestWeightCodes),
    [consultationRequestWeightCodes],
  );
  const consultationSalesGradeMap = React.useMemo(
    () => toCodeMap(consultationSalesGradeCodes),
    [consultationSalesGradeCodes],
  );
  const consultationPackingTypeMap = React.useMemo(
    () => toCodeMap(consultationPackingTypeCodes),
    [consultationPackingTypeCodes],
  );
  const consultationProductMap = React.useMemo(
    () => toCodeMap(consultationProductCodes),
    [consultationProductCodes],
  );
  const consultationProductCategoryMap = React.useMemo(() => {
    const map = new Map<number, string>();
    (consultationProductCategories ?? []).forEach((c) => {
      const id = Number(c.id);
      if (!Number.isFinite(id)) return;
      const label = (c.name ?? c.value ?? '').trim();
      if (label) map.set(id, label);
    });
    return map;
  }, [consultationProductCategories]);

  const labelOr = React.useCallback((map: Map<string, string>, value?: string | null) => {
    const key = (value ?? '').trim();
    if (!key) return '';
    return map.get(key) ?? key;
  }, []);

  const consultationsQuery = useCustomerConsultations({
    customerId,
    customerPhone,
    enabled: enabled && activeTab === 'consultation' && canQueryConsultations,
  });

  const ledgerQuery = useCustomerLedgerActivity({
    customerId,
    enabled: enabled && canQueryLedger,
    dateRange,
  });

  const consultations = React.useMemo(
    () => consultationsQuery.data?.data ?? [],
    [consultationsQuery.data],
  );

  const filteredConsultationCount = React.useMemo(
    () => filterConsultations(consultations, search, dateRange).length,
    [consultations, search, dateRange],
  );

  const tabCountBadge = React.useMemo(() => {
    if (activeTab === 'consultation') return filteredConsultationCount;
    if (activeTab === 'trade') {
      return filterLedgerEntries(ledgerQuery.tradeEntries, search).length;
    }
    return filterLedgerEntries(ledgerQuery.receivableEntries, search).length;
  }, [
    activeTab,
    filteredConsultationCount,
    ledgerQuery.tradeEntries,
    ledgerQuery.receivableEntries,
    search,
  ]);

  const handleSelectInvoice = React.useCallback((invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setInvoiceDrawerOpen(true);
  }, []);

  const tabTitles: Record<CustomerActivityTab, string> = {
    consultation: '상담',
    trade: '거래',
    receivable: '채권',
  };

  return (
    <>
      <aside
        className={cn(
          'flex min-h-0 shrink-0 flex-col bg-muted/20',
          onClose ? 'w-full border-0' : 'w-[min(840px,48vw)] border-r border-border',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">활동 이력</h3>
            <p className="text-xs text-muted-foreground">
              {tabTitles[activeTab]} · {tabCountBadge}건
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              {tabCountBadge}건
            </Badge>
            {onClose ? (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
                <span className="sr-only">활동 이력 닫기</span>
              </Button>
            ) : null}
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as CustomerActivityTab);
            setSearch('');
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border px-4 py-2">
            <TabsList className="grid h-9 w-full grid-cols-3">
              <TabsTrigger value="consultation" className="text-xs">
                상담
              </TabsTrigger>
              <TabsTrigger value="trade" className="text-xs">
                거래
              </TabsTrigger>
              <TabsTrigger value="receivable" className="text-xs">
                채권
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-3">
            <TabsContent value="consultation" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <CustomerActivityConsultationTab
                consultations={consultations}
                isLoading={consultationsQuery.isLoading}
                error={consultationsQuery.error}
                canQuery={canQueryConsultations}
                search={search}
                onSearchChange={setSearch}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                labelOr={labelOr}
                consultationTypeMap={consultationTypeMap}
                consultationInOutMap={consultationInOutMap}
                consultationSourceMap={consultationSourceMap}
                consultationRequestWeightMap={consultationRequestWeightMap}
                consultationSalesGradeMap={consultationSalesGradeMap}
                consultationPackingTypeMap={consultationPackingTypeMap}
                consultationProductMap={consultationProductMap}
                consultationProductCategoryMap={consultationProductCategoryMap}
              />
            </TabsContent>

            <TabsContent value="trade" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <CustomerActivityTradeTab
                entries={ledgerQuery.tradeEntries}
                isLoading={ledgerQuery.isLoading}
                error={ledgerQuery.error}
                customerId={customerId}
                search={search}
                onSearchChange={setSearch}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                onSelectInvoice={handleSelectInvoice}
              />
            </TabsContent>

            <TabsContent value="receivable" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <CustomerActivityReceivableTab
                entries={ledgerQuery.receivableEntries}
                isLoading={ledgerQuery.isLoading}
                error={ledgerQuery.error}
                customerId={customerId}
                summary={ledgerQuery.summary}
                search={search}
                onSearchChange={setSearch}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                onOpenLedger={() => setLedgerDrawerOpen(true)}
                onSelectInvoice={handleSelectInvoice}
              />
            </TabsContent>
          </div>
        </Tabs>
      </aside>

      <CustomerLedgerDrawer
        open={ledgerDrawerOpen}
        onOpenChange={setLedgerDrawerOpen}
        customerId={customerId || null}
      />

      <InvoiceDetailDrawer
        open={invoiceDrawerOpen}
        onOpenChange={(open) => {
          setInvoiceDrawerOpen(open);
          if (!open) setSelectedInvoiceId(null);
        }}
        invoiceId={selectedInvoiceId}
        onSuccess={() => {
          ledgerQuery.refetch();
        }}
      />
    </>
  );
}
