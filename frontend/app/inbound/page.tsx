'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { format, parse, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { useCodesByCategory, type Code } from '@/lib/hooks/use-codes';
import { useWarehouses, type Warehouse } from '@/lib/hooks/use-warehouses';
import { toast } from '@/components/ui/use-toast';
import { InboundDetailDrawer } from '@/components/inbound/inbound-detail-drawer';
import { InboundEditDrawer } from '@/components/inbound/inbound-edit-drawer';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter } from 'lucide-react';
import { useColumnSettings } from '@/hooks/use-column-settings';

// 스케줄 타입 정의 (스케줄 관리와 동일)
export type SchedulePayment = {
  id?: string;
  sequence: number;
  dueDate: string | null;
  ratio: number | null;
  amount: number | null;
  method: string | null;
  exchangeRate: number | null;
  result: string | null;
  notes: string | null;
};

export type ScheduleInbound = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | null;
  doCost: number | null;
  customsFee: number | null;
  quarantineAgencyFee: number | null;
  customsDuty: number | null;
  spot: number | null;
  fumigationQuarantine: number | null;
  document: number | null;
  igobi: number | null;
  extractionFee: number | null;
  firstTierLoadingFee: number | null;
  fee: number | null;
  sampleCollection: number | null;
  quotaCost: number | null;
  additionalItem: number | null;
  bankFee: number | null;
  quarantineWorkCost: number | null;
  sto: number | null;
  warehouse: string | null;
  igodate: string | null;
  quarantineDate: string | null;
  dtDate: string | null;
  dayExchangeRate: number | null;
  comparisonExchangeRate: number | null;
  targetMargin: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type Schedule = {
  id: string;
  newOld: string;
  commissionMonth: string;
  commissionDollar: string;
  manager: string;
  orderDate: string;
  contractNo: string;
  quota?: string;
  fumigation?: string;
  spot?: string;
  customsDuty?: string;
  status?: 'PENDING' | 'CONFIRMED'; // 입고예정(PENDING) / 입고확정(CONFIRMED)
  shippingLine: string;
  shippingLineCode: string | null;
  shippingLineName: string | null;
  shipmentSeq?: number;
  exporter: string;
  exportCountry: string;
  product: string;
  productCode: string;
  bk: string;
  bl: string;
  qty?: number;
  grade: string | null;
  packingType: string | null;
  currencyUnit: string;
  unitPrice?: number;
  destination: string | null;
  finalDestination: string | null;
  finalDestinationArrivalDate: string;
  etd: string;
  eta?: string;
  notes: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceCurrency: string | null;
  invoiceCurrencyName: string | null;
  invoiceAmount: number | null;
  totalAmount: number | null;
  currencyName: string | null;
  invoiceWeight: number | null;
  invoiceFilePath: string | null;
  invoiceFileName: string | null;
  invoiceGoogleDriveFileId: string | null;
  contractGoogleDriveFileId: string | null;
  contractFileName: string | null;
  productImagesFolderId: string | null;
  productImagesFolderName: string | null;
  dm?: string;
  dt?: string;
  cb?: string;
  quarantineDate: string;
  customsDate: string;
  certificateRequest: string;
  claim: string;
  bankPickup: string;
  sto: string;
  originalShipment: string;
  payments: SchedulePayment[];
  // 입고 데이터 필드
  inboundDoCost?: number | null;
  inboundCustomsFee?: number | null;
  inboundQuarantineAgencyFee?: number | null;
  inboundFumigationQuarantine?: number | null;
  inboundDocument?: number | null;
  inboundIgobi?: number | null;
  inboundExtractionFee?: number | null;
  inboundFirstTierLoadingFee?: number | null;
  inboundFee?: number | null;
  inboundSampleCollection?: number | null;
  inboundQuotaCost?: number | null;
  inboundCustomsDuty?: number | null;
  inboundSpot?: number | null;
  inboundAdditionalItem?: number | null;
  inboundBankFee?: number | null;
  inboundQuarantineWorkCost?: number | null;
  inboundSto?: number | null;
  inboundWarehouse?: string | null;
  inboundIgodate?: string | null;
  inboundQuarantineDate?: string | null;
  inboundDtDate?: string | null;
  inboundDayExchangeRate?: number | null;
  inboundComparisonExchangeRate?: number | null;
  inboundTargetMargin?: number | null;
  pendingInbound?: ScheduleInbound | null;
  confirmedInbound?: ScheduleInbound | null;
};

type TradeOrderResponse = {
  id: string;
  sequence: number;
  contractNo: string;
  quota?: string | null;
  fumigation?: string | null;
  spot?: string | null;
  customsDuty?: string | null;
  status?: 'PENDING' | 'CONFIRMED' | null;
  newOld?: string | null;
  commissionMonth?: string | null;
  commissionDollar?: string | null;
  manager?: string | null;
  orderDate?: string | null;
  shippingLine?: string | null;
  shippingLineCode?: string | null;
  shippingLineName?: string | null;
  exporterCode?: string | null;
  exporterName?: string | null;
  exportCountryCode?: string | null;
  exportCountryName?: string | null;
  productCode?: string | null;
  productName?: string | null;
  bk?: string | null;
  bl?: string | null;
  quantity?: string | null;
  grade?: string | null;
  gradeCode?: string | null;
  gradeName?: string | null;
  packingType?: string | null;
  packingCode?: string | null;
  packingName?: string | null;
  currency?: string | null;
  currencyCode?: string | null;
  currencyName?: string | null;
  unitPrice?: string | null;
  destination?: string | null;
  destinationCode?: string | null;
  destinationName?: string | null;
  finalDestination?: string | null;
  finalDestinationCode?: string | null;
  finalDestinationName?: string | null;
  finalDestinationArrivalDate?: string | null;
  etdText?: string | null;
  etdDate?: string | null;
  etaDate?: string | null;
  notes?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceCurrency?: string | null;
  invoiceCurrencyName?: string | null;
  invoiceAmount?: string | null;
  totalAmount?: string | null;
  invoiceWeight?: string | null;
  invoiceFilePath?: string | null;
  invoiceFileName?: string | null;
  invoiceGoogleDriveFileId?: string | null;
  contractGoogleDriveFileId?: string | null;
  contractFileName?: string | null;
  productImagesFolderId?: string | null;
  productImagesFolderName?: string | null;
  dm?: string | null;
  dt?: string | null;
  cb?: string | null;
  quarantineDate?: string | null;
  customsDate?: string | null;
  certificateRequest?: string | null;
  claim?: string | null;
  bankPickup?: string | null;
  sto?: string | null;
  originalShipment?: string | null;
  // 입고 데이터 필드
  inboundDoCost?: number | null;
  inboundCustomsFee?: number | null;
  inboundQuarantineAgencyFee?: number | null;
  inboundCustomsDuty?: number | null;
  inboundSpot?: number | null;
  inboundFumigationQuarantine?: number | null;
  inboundDocument?: number | null;
  inboundIgobi?: number | null;
  inboundExtractionFee?: number | null;
  inboundFirstTierLoadingFee?: number | null;
  inboundFee?: number | null;
  inboundSampleCollection?: number | null;
  inboundQuotaCost?: number | null;
  inboundWarehouse?: string | null;
  inboundIgodate?: string | null;
  inboundQuarantineDate?: string | null;
  inboundDtDate?: string | null;
  inboundDayExchangeRate?: number | null;
  inboundComparisonExchangeRate?: number | null;
  inboundTargetMargin?: number | null;
  payments?: Array<{
    id?: string;
    sequence: number;
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    result?: string | null;
    notes?: string | null;
  }>;
  pendingInbound?: TradeOrderInboundResponse | null;
  confirmedInbound?: TradeOrderInboundResponse | null;
};

type TradeOrderInboundResponse = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | null;
  doCost: number | null;
  customsFee: number | null;
  quarantineAgencyFee: number | null;
  customsDuty: number | null;
  spot: number | null;
  fumigationQuarantine: number | null;
  document: number | null;
  igobi: number | null;
  extractionFee: number | null;
  firstTierLoadingFee: number | null;
  fee: number | null;
  sampleCollection: number | null;
  quotaCost: number | null;
  additionalItem?: number | null;
  bankFee?: number | null;
  quarantineWorkCost?: number | null;
  sto?: number | null;
  warehouse: string | null;
  igodate: string | null;
  quarantineDate: string | null;
  dtDate: string | null;
  dayExchangeRate: number | null;
  comparisonExchangeRate: number | null;
  targetMargin: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export default function CostPage() {
  const columnSettings = useColumnSettings('inbound-management');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedScheduleForDetail, setSelectedScheduleForDetail] = useState<Schedule | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [selectedScheduleForEdit, setSelectedScheduleForEdit] = useState<Schedule | null>(null);
  const [editMode, setEditMode] = useState<'PENDING' | 'CONFIRMED'>('PENDING');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('eta');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(['WAITING', 'PENDING', 'CONFIRMED'])); // 기본값: 전체 선택
  const [productSearch, setProductSearch] = useState<string>('');
  const today = new Date();
  const [etaStartDate, setEtaStartDate] = useState<Date | undefined>(startOfMonth(today));
  const [etaEndDate, setEtaEndDate] = useState<Date | undefined>(endOfMonth(today));

  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const { data: warehouses = [] } = useWarehouses({ status: true });

  const toCodeMap = useCallback((codes?: Code[]) => {
    const map = new Map<string, string>();
    (codes ?? []).forEach((code) => {
      const key = (code.value ?? code.name ?? '').trim();
      if (!key) {
        return;
      }
      map.set(key, (code.name ?? code.value ?? '').trim() || key);
    });
    return map;
  }, []);

  const toWarehouseMap = useCallback((warehouses: Warehouse[]) => {
    const map = new Map<string, string>();
    warehouses.forEach((warehouse) => {
      // 이름으로 매핑 (기존 데이터 호환성)
      map.set(warehouse.name, warehouse.name);
      // ID로도 매핑 (혹시 모를 경우 대비)
      map.set(warehouse.id.toString(), warehouse.name);
    });
    return map;
  }, []);

  const destinationLabelMap = useMemo(() => toCodeMap(destinationCodes), [destinationCodes, toCodeMap]);
  const warehouseLabelMap = useMemo(() => toWarehouseMap(warehouses), [warehouses, toWarehouseMap]);

  const formatCodeLabel = useCallback(
    (map: Map<string, string>, code?: string | null, fallback = '-') => {
      const key = (code ?? '').trim();
      if (!key) {
        return fallback;
      }
      return map.get(key) ?? code ?? fallback;
    },
    [],
  );

  const resolveDestinationLabel = useCallback(
    (code?: string | null, fallback = '-') => formatCodeLabel(destinationLabelMap, code, fallback),
    [destinationLabelMap, formatCodeLabel],
  );

  const resolveWarehouseLabel = useCallback(
    (code?: string | null, fallback = '-') => formatCodeLabel(warehouseLabelMap, code, fallback),
    [warehouseLabelMap, formatCodeLabel],
  );

  const mapInboundRecord = useCallback((record?: TradeOrderInboundResponse | null): ScheduleInbound | null => {
    if (!record) {
      return null;
    }

    const toNumber = (value?: number | null) => (value !== null && value !== undefined ? Number(value) : null);
    const toStringOrNull = (value?: string | null) => value ?? null;

    return {
      id: record.id,
      status: record.status ?? null,
      doCost: toNumber(record.doCost),
      customsFee: toNumber(record.customsFee),
      quarantineAgencyFee: toNumber(record.quarantineAgencyFee),
      customsDuty: toNumber(record.customsDuty),
      spot: toNumber(record.spot),
      additionalItem: toNumber(record.additionalItem),
      bankFee: toNumber(record.bankFee),
      quarantineWorkCost: toNumber(record.quarantineWorkCost),
      fumigationQuarantine: toNumber(record.fumigationQuarantine),
      document: toNumber(record.document),
      igobi: toNumber(record.igobi),
      extractionFee: toNumber(record.extractionFee),
      sto: toNumber(record.sto),
      firstTierLoadingFee: toNumber(record.firstTierLoadingFee),
      fee: toNumber(record.fee),
      sampleCollection: toNumber(record.sampleCollection),
      quotaCost: toNumber(record.quotaCost),
      warehouse: toStringOrNull(record.warehouse),
      igodate: toStringOrNull(record.igodate),
      quarantineDate: toStringOrNull(record.quarantineDate),
      dtDate: toStringOrNull(record.dtDate),
      dayExchangeRate: toNumber(record.dayExchangeRate),
      comparisonExchangeRate: toNumber(record.comparisonExchangeRate),
      targetMargin: toNumber(record.targetMargin),
      createdAt: toStringOrNull(record.createdAt),
      updatedAt: toStringOrNull(record.updatedAt),
    };
  }, []);

  const buildScheduleForMode = useCallback((schedule: Schedule, mode: 'PENDING' | 'CONFIRMED'): Schedule => {
    const source = mode === 'CONFIRMED' ? schedule.confirmedInbound : schedule.pendingInbound;
    const fallback = schedule.pendingInbound ?? schedule.confirmedInbound ?? null;
    const inbound = source ?? fallback;

    return {
      ...schedule,
      status: mode,
      inboundDoCost: inbound?.doCost ?? null,
      inboundCustomsFee: inbound?.customsFee ?? null,
      inboundQuarantineAgencyFee: inbound?.quarantineAgencyFee ?? null,
      inboundCustomsDuty: inbound?.customsDuty ?? null,
      inboundSpot: inbound?.spot ?? null,
      inboundFumigationQuarantine: inbound?.fumigationQuarantine ?? null,
      inboundDocument: inbound?.document ?? null,
      inboundIgobi: inbound?.igobi ?? null,
      inboundExtractionFee: inbound?.extractionFee ?? null,
      inboundFirstTierLoadingFee: inbound?.firstTierLoadingFee ?? null,
      inboundFee: inbound?.fee ?? null,
      inboundSampleCollection: inbound?.sampleCollection ?? null,
      inboundQuotaCost: inbound?.quotaCost ?? null,
      inboundWarehouse: inbound?.warehouse ?? null,
      inboundIgodate: inbound?.igodate ?? null,
      inboundQuarantineDate: inbound?.quarantineDate ?? null,
      inboundDtDate: inbound?.dtDate ?? null,
      inboundAdditionalItem: inbound?.additionalItem ?? null,
      inboundBankFee: inbound?.bankFee ?? null,
      inboundQuarantineWorkCost: inbound?.quarantineWorkCost ?? null,
      inboundSto: inbound?.sto ?? null,
      inboundDayExchangeRate: inbound?.dayExchangeRate ?? null,
      inboundComparisonExchangeRate: inbound?.comparisonExchangeRate ?? null,
      inboundTargetMargin: inbound?.targetMargin ?? null,
    };
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    void checkAuth();
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      setIsSchedulesLoading(true);
      const params: Record<string, unknown> = {};
      const response = await api.get('/trade/contracts/orders', { params });
      const orders: TradeOrderResponse[] = Array.isArray(response.data) ? response.data : [];
      const mapped: Schedule[] = orders.map((order) => {
        const legacyDestination = (order as { destination?: string | null }).destination;
        const destinationCode = order.destinationCode ?? legacyDestination ?? null;
        const finalDestinationCode = order.finalDestinationCode ?? order.finalDestination ?? null;
        const legacyPackingName = (order as { packingName?: string | null }).packingName;
        const legacyGradeName = (order as { gradeName?: string | null }).gradeName;
        const packingCode = order.packingCode ?? order.packingType ?? legacyPackingName ?? null;
        const gradeCode = order.gradeCode ?? order.grade ?? legacyGradeName ?? null;
        const payments: SchedulePayment[] = Array.isArray(order.payments)
          ? order.payments
              .map((payment) => ({
                id: payment.id ? String(payment.id) : undefined,
                sequence: payment.sequence ?? 0,
                dueDate: payment.dueDate ?? null,
                ratio: payment.ratio ?? null,
                amount:
                  payment.amount !== null && payment.amount !== undefined
                    ? Number(payment.amount)
                    : null,
                method: payment.method ?? null,
                exchangeRate:
                  payment.exchangeRate !== null && payment.exchangeRate !== undefined
                    ? Number(payment.exchangeRate)
                    : null,
                result: payment.result ?? null,
                notes: payment.notes ?? null,
              }))
              .sort((a, b) => a.sequence - b.sequence)
          : [];

        const pendingInbound = mapInboundRecord(order.pendingInbound);
        const confirmedInbound = mapInboundRecord(order.confirmedInbound);
        const derivedStatus =
          (confirmedInbound?.status as 'PENDING' | 'CONFIRMED' | null | undefined) ??
          (pendingInbound?.status as 'PENDING' | 'CONFIRMED' | null | undefined) ??
          (order.status as 'PENDING' | 'CONFIRMED' | null | undefined) ??
          undefined;
        const activeInbound =
          derivedStatus === 'CONFIRMED'
            ? confirmedInbound ?? pendingInbound
            : pendingInbound ?? confirmedInbound;

        return {
          id: order.id ? String(order.id) : `${order.contractNo ?? 'unknown'}-${order.sequence ?? ''}`,
          newOld: order.newOld ?? '',
          commissionMonth: order.commissionMonth ?? '',
          commissionDollar: order.commissionDollar ?? '',
          manager: order.manager ?? '',
          orderDate: order.orderDate ?? '',
          contractNo: order.contractNo ?? '',
          quota: order.quota ?? undefined,
          fumigation: order.fumigation ?? undefined,
          spot: order.spot ?? undefined,
          customsDuty: order.customsDuty ?? undefined,
          status: derivedStatus ?? undefined,
          shippingLine: order.shippingLine ?? '',
          shippingLineCode: order.shippingLineCode ?? null,
          shippingLineName: order.shippingLineName ?? order.shippingLine ?? null,
          shipmentSeq: order.sequence ?? undefined,
          exporter: order.exporterName ?? order.exporterCode ?? '',
          exportCountry: order.exportCountryName ?? order.exportCountryCode ?? '',
          product: order.productName ?? order.productCode ?? '',
          productCode: order.productCode ?? order.productName ?? '',
          bk: order.bk ?? '',
          bl: order.bl ?? '',
          qty:
            order.quantity !== null && order.quantity !== undefined
              ? Number(order.quantity)
              : undefined,
          grade: gradeCode ?? null,
          packingType: packingCode ?? null,
          currencyUnit: order.currencyName ?? order.currencyCode ?? '',
          unitPrice:
            order.unitPrice !== null && order.unitPrice !== undefined
              ? Number(order.unitPrice)
              : undefined,
          destination: destinationCode ?? null,
          finalDestination: finalDestinationCode ?? null,
          finalDestinationArrivalDate: order.finalDestinationArrivalDate ?? '',
          etd: order.etdDate
            ? format(parseISO(order.etdDate), 'yyyy-MM-dd')
            : order.etdText ?? '',
          eta: order.etaDate ? format(parseISO(order.etaDate), 'yyyy-MM-dd') : undefined,
          notes: order.notes ?? '',
          invoiceNumber: order.invoiceNumber ?? null,
          invoiceDate: order.invoiceDate ?? null,
          invoiceCurrency: order.invoiceCurrency ?? null,
          invoiceCurrencyName: order.invoiceCurrencyName ?? null,
          invoiceAmount:
            order.invoiceAmount !== null && order.invoiceAmount !== undefined
              ? Number(order.invoiceAmount)
              : null,
          totalAmount:
            order.totalAmount !== null && order.totalAmount !== undefined
              ? Number(order.totalAmount)
              : order.invoiceWeight !== null && order.invoiceWeight !== undefined
                ? Number(order.invoiceWeight)
                : null,
          currencyName: order.currencyName ?? null,
          invoiceWeight:
            order.invoiceWeight !== null && order.invoiceWeight !== undefined
              ? Number(order.invoiceWeight)
              : null,
          invoiceFilePath: order.invoiceFilePath ?? null,
          invoiceFileName: order.invoiceFileName ?? null,
          invoiceGoogleDriveFileId: order.invoiceGoogleDriveFileId ?? null,
          contractGoogleDriveFileId: order.contractGoogleDriveFileId ?? null,
          contractFileName: order.contractFileName ?? null,
          productImagesFolderId: order.productImagesFolderId ?? null,
          productImagesFolderName: order.productImagesFolderName ?? null,
          dm: order.dm?.trim() ? order.dm.trim() : undefined,
          dt: order.dt?.trim() ? order.dt.trim() : undefined,
          cb: order.cb?.trim() ? order.cb.trim() : undefined,
          quarantineDate: order.quarantineDate
            ? format(parseISO(order.quarantineDate), 'yyyy-MM-dd')
            : order.quarantineDate ?? '',
          customsDate: order.customsDate
            ? format(parseISO(order.customsDate), 'yyyy-MM-dd')
            : order.customsDate ?? '',
          certificateRequest: order.certificateRequest ?? '',
          claim: order.claim ?? '',
          bankPickup: order.bankPickup
            ? format(parseISO(order.bankPickup), 'yyyy-MM-dd')
            : order.bankPickup ?? '',
          sto: order.sto ?? '',
          originalShipment: order.originalShipment
            ? format(parseISO(order.originalShipment), 'yyyy-MM-dd')
            : order.originalShipment ?? '',
          payments,
          // 입고 데이터 필드
          inboundDoCost: activeInbound?.doCost ?? null,
          inboundCustomsFee: activeInbound?.customsFee ?? null,
          inboundQuarantineAgencyFee: activeInbound?.quarantineAgencyFee ?? null,
          inboundCustomsDuty: activeInbound?.customsDuty ?? null,
          inboundSpot: activeInbound?.spot ?? null,
          inboundFumigationQuarantine: activeInbound?.fumigationQuarantine ?? null,
          inboundDocument: activeInbound?.document ?? null,
          inboundIgobi: activeInbound?.igobi ?? null,
          inboundExtractionFee: activeInbound?.extractionFee ?? null,
          inboundFirstTierLoadingFee: activeInbound?.firstTierLoadingFee ?? null,
          inboundFee: activeInbound?.fee ?? null,
          inboundSampleCollection: activeInbound?.sampleCollection ?? null,
          inboundQuotaCost: activeInbound?.quotaCost ?? null,
          inboundWarehouse: activeInbound?.warehouse ?? null,
          inboundIgodate: activeInbound?.igodate ?? null,
          inboundQuarantineDate: activeInbound?.quarantineDate ?? null,
          inboundDtDate: activeInbound?.dtDate ?? null,
          inboundDayExchangeRate: activeInbound?.dayExchangeRate ?? null,
          inboundComparisonExchangeRate: activeInbound?.comparisonExchangeRate ?? null,
          inboundTargetMargin: activeInbound?.targetMargin ?? null,
          pendingInbound,
          confirmedInbound,
        };
      });
      setSchedules(mapped);
    } catch (error) {
      console.error('스케줄 목록 조회 중 오류가 발생했습니다.', error);
      toast({
        title: '오류',
        description: '스케줄 목록을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSchedulesLoading(false);
    }
  }, [mapInboundRecord]);

  useEffect(() => {
    if (!loading) {
      void fetchSchedules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // 정렬된 데이터 (필터링 제거 - 모든 데이터 표시)
  const filteredSchedules = useMemo(() => {
    let filtered = [...schedules];

    // 정렬만 수행 (필터링 제거)
    filtered.sort((a, b) => {
      const aValue = a[sortBy as keyof Schedule];
      const bValue = b[sortBy as keyof Schedule];
      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [schedules, sortBy, sortOrder]);

  // 페이지네이션
  const total = filteredSchedules.length;
  const totalPages = Math.ceil(total / pageSize);
  const paginatedSchedules = filteredSchedules.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const handleSortChange = useCallback((column: string, order: 'asc' | 'desc') => {
    setSortBy(column);
    setSortOrder(order);
    setPage(1);
  }, []);

  // 상태 표시 함수
  const getStatusLabel = useCallback((status: string | null | undefined) => {
    if (!status || status === null) {
      return '입고대기';
    }
    if (status === 'PENDING') {
      return '입고예정';
    }
    if (status === 'CONFIRMED') {
      return '입고확정';
    }
    return '-';
  }, []);

  const getStatusBadgeColor = useCallback((status: string | null | undefined) => {
    if (!status || status === null) {
      return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
    }
    if (status === 'PENDING') {
      return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
    }
    if (status === 'CONFIRMED') {
      return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
    }
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  }, []);

  // 컬럼 정의
  const columns: ColumnDef<Schedule>[] = [
    {
      accessorKey: 'status',
      header: '상태',
      enableSorting: true,
      cell: ({ row }) => {
        const status = row.getValue('status') as string | null | undefined;
        const label = getStatusLabel(status);
        
        if (!status || status === null) {
          return (
            <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
              {label}
            </Badge>
          );
        }
        if (status === 'PENDING') {
          return (
            <Badge variant="outline" className="border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300">
              {label}
            </Badge>
          );
        }
        if (status === 'CONFIRMED') {
          return (
            <Badge variant="outline" className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300">
              {label}
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
            {label}
          </Badge>
        );
      },
      size: 100,
    },
    {
      accessorKey: 'exporter',
      header: '수출사',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-sm">{row.getValue('exporter') || '-'}</div>;
      },
      size: 110,
    },
    {
      accessorKey: 'exportCountry',
      header: '수출국',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-sm">{row.getValue('exportCountry') || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'product',
      header: '상품',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-sm">{row.getValue('product') || '-'}</div>;
      },
      size: 150,
    },
    {
      accessorKey: 'bk',
      header: 'BK',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-sm font-mono">{row.getValue('bk') || '-'}</div>;
      },
      size: 120,
    },
    {
      accessorKey: 'bl',
      header: 'BL',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-sm font-mono">{row.getValue('bl') || '-'}</div>;
      },
      size: 150,
    },
    {
      accessorKey: 'qty',
      header: 'Qty',
      enableSorting: true,
      cell: ({ row }) => {
        const qty = row.getValue('qty') as number;
        return <div className="text-sm text-right">{qty ? qty : '-'}</div>;
      },
      size: 70,
    },
    {
      accessorKey: 'currencyUnit',
      header: 'Currency',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        const currencyDisplay = schedule.currencyName || schedule.currencyUnit || '-';
        return <div className="text-sm">{currencyDisplay}</div>;
      },
      size: 70,
    },
    {
      accessorKey: 'unitPrice',
      header: 'Unit Price',
      enableSorting: true,
      cell: ({ row }) => {
        const price = row.getValue('unitPrice') as number;
        return <div className="text-sm text-right">{price ? price.toLocaleString() : '-'}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'destination',
      header: '도착지',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        return <div className="text-sm">{resolveDestinationLabel(schedule.destination)}</div>;
      },
      size: 70,
    },
    {
      accessorKey: 'eta',
      header: 'ETA',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-sm">{row.getValue('eta') || '-'}</div>;
      },
      size: 80,
    },
    {
      accessorKey: 'notes',
      header: '비고',
      enableSorting: false,
      cell: ({ row }) => {
        return <div className="text-sm max-w-xs truncate">{row.getValue('notes') || '-'}</div>;
      },
      size: 200,
    },
    {
      accessorKey: 'totalAmount',
      header: '총량',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        const amount = schedule.totalAmount ?? schedule.invoiceWeight ?? null;
        return (
          <div className="text-sm text-right">
            {amount !== null && amount !== undefined ? amount.toLocaleString() : '-'}
          </div>
        );
      },
      size: 90,
    },
    {
      id: 'paymentMethod',
      header: '결제조건',
      enableSorting: false,
      cell: ({ row }) => {
        const schedule = row.original;
        const payments = schedule.payments ?? [];
        const methods = payments
          .map((payment) => payment.method)
          .filter((method): method is string => method !== null && method !== undefined && method.trim() !== '');
        return <div className="text-sm">{methods.length > 0 ? methods.join(', ') : '-'}</div>;
      },
      size: 150,
    },
    {
      id: 'comparisonExchangeRate',
      header: '판매환율',
      enableSorting: false,
      cell: ({ row }) => {
        const schedule = row.original;
        const rate = schedule.pendingInbound?.comparisonExchangeRate ?? schedule.confirmedInbound?.comparisonExchangeRate ?? null;
        return (
          <div className="text-sm text-right">
            {rate !== null && rate !== undefined ? rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '-'}
          </div>
        );
      },
      size: 100,
    },
    {
      id: 'comparisonCost',
      header: '판매원가',
      enableSorting: false,
      cell: ({ row }) => {
        const schedule = row.original;
        const inbound = schedule.pendingInbound ?? schedule.confirmedInbound ?? null;
        const rate = inbound?.comparisonExchangeRate ?? null;
        
        if (!inbound || rate === null || rate === undefined) {
          return <div className="text-sm text-right">-</div>;
        }

        const unitPrice = schedule.unitPrice ?? 0;
        const qty = schedule.qty ?? 0;
        const firstPart = (rate * unitPrice) / 1000;

        const customsFee = inbound.customsFee ?? 0;
        const firstTierLoadingFee = inbound.firstTierLoadingFee ?? 0;
        const doCost = inbound.doCost ?? 0;
        const quarantineAgencyFee = inbound.quarantineAgencyFee ?? 0;
        const customsDuty = inbound.customsDuty ?? 0;
        const additionalItem = inbound.additionalItem ?? 0;
        const bankFee = inbound.bankFee ?? 0;
        const quarantineWorkCost = inbound.quarantineWorkCost ?? 0;
        const spot = inbound.spot ?? 0;
        const document = inbound.document ?? 0;
        const igobi = (inbound.igobi ?? 0) * qty;
        const extractionFee = inbound.extractionFee ?? 0;
        const sto = inbound.sto ?? 0;
        const fumigationQuarantine = inbound.fumigationQuarantine ?? 0;
        const fee = inbound.fee ?? 0;
        const sampleCollection = inbound.sampleCollection ?? 0;

        const sum =
          customsFee +
          firstTierLoadingFee +
          doCost +
          quarantineAgencyFee +
          customsDuty +
          additionalItem +
          bankFee +
          quarantineWorkCost +
          spot +
          document +
          igobi +
          extractionFee +
          sto +
          fumigationQuarantine +
          fee +
          sampleCollection;

        const totalAmount = schedule.totalAmount ?? schedule.invoiceWeight ?? 0;
        let secondPart = 0;
        if (totalAmount > 0) {
          secondPart = sum / totalAmount / 1000;
        }

        const quotaCost = inbound.quotaCost ?? 0;
        const cost = firstPart + secondPart + quotaCost;

        return (
          <div className="text-sm text-right">
            {cost > 0 ? Math.round(cost).toLocaleString() : '-'}
          </div>
        );
      },
      size: 120,
    },
    {
      id: 'dayExchangeRate',
      header: '적용환율',
      enableSorting: false,
      cell: ({ row }) => {
        const schedule = row.original;
        const rate = schedule.confirmedInbound?.dayExchangeRate ?? schedule.pendingInbound?.dayExchangeRate ?? null;
        return (
          <div className="text-sm text-right">
            {rate !== null && rate !== undefined ? rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '-'}
          </div>
        );
      },
      size: 100,
    },
    {
      id: 'purchaseCost',
      header: '구매원가',
      enableSorting: false,
      cell: ({ row }) => {
        const schedule = row.original;
        const inbound = schedule.confirmedInbound ?? schedule.pendingInbound ?? null;
        const rate = inbound?.dayExchangeRate ?? null;
        
        if (!inbound || rate === null || rate === undefined) {
          return <div className="text-sm text-right">-</div>;
        }

        const unitPrice = schedule.unitPrice ?? 0;
        const qty = schedule.qty ?? 0;
        const firstPart = (rate * unitPrice) / 1000;

        const customsFee = inbound.customsFee ?? 0;
        const firstTierLoadingFee = inbound.firstTierLoadingFee ?? 0;
        const doCost = inbound.doCost ?? 0;
        const quarantineAgencyFee = inbound.quarantineAgencyFee ?? 0;
        const customsDuty = inbound.customsDuty ?? 0;
        const additionalItem = inbound.additionalItem ?? 0;
        const bankFee = inbound.bankFee ?? 0;
        const quarantineWorkCost = inbound.quarantineWorkCost ?? 0;
        const spot = inbound.spot ?? 0;
        const document = inbound.document ?? 0;
        const igobi = (inbound.igobi ?? 0) * qty;
        const extractionFee = inbound.extractionFee ?? 0;
        const sto = inbound.sto ?? 0;
        const fumigationQuarantine = inbound.fumigationQuarantine ?? 0;
        const fee = inbound.fee ?? 0;
        const sampleCollection = inbound.sampleCollection ?? 0;

        const sum =
          customsFee +
          firstTierLoadingFee +
          doCost +
          quarantineAgencyFee +
          customsDuty +
          additionalItem +
          bankFee +
          quarantineWorkCost +
          spot +
          document +
          igobi +
          extractionFee +
          sto +
          fumigationQuarantine +
          fee +
          sampleCollection;

        const totalAmount = schedule.totalAmount ?? schedule.invoiceWeight ?? 0;
        let secondPart = 0;
        if (totalAmount > 0) {
          secondPart = sum / totalAmount / 1000;
        }

        const quotaCost = inbound.quotaCost ?? 0;
        const cost = firstPart + secondPart + quotaCost;

        return (
          <div className="text-sm text-right">
            {cost > 0 ? Math.round(cost).toLocaleString() : '-'}
          </div>
        );
      },
      size: 120,
    },
  ];

  if (loading) {
    return (
      <AppLayout user={user}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-3 min-w-0 max-w-full">
        {/* 헤더 영역 */}
        <div className="flex items-center justify-between flex-shrink-0 min-w-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">입고 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              ETA 기준으로 입고일정을 확인할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 테이블 카드 */}
        {isSchedulesLoading ? (
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            스케줄을 불러오는 중입니다...
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={paginatedSchedules}
            visibleColumns={columnSettings.visibleColumns}
            onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
            columnSizing={columnSettings.columnSizing}
            onColumnSizingChange={columnSettings.onColumnSizingChange}
            columnOrder={columnSettings.columnOrder}
            onColumnOrderChange={columnSettings.onColumnOrderChange}
            columnSettingsIconOnly={true}
            filterControls={
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex w-full items-center gap-2 md:w-auto">
                  <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                    ETA 기간
                  </Label>
                  <DateRangePicker
                    startDate={etaStartDate}
                    endDate={etaEndDate}
                    onChange={(start, end) => {
                      setEtaStartDate(start);
                      setEtaEndDate(end);
                      setPage(1);
                    }}
                    className="w-48 md:w-60"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">상태:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8">
                        <Filter className="mr-2 h-4 w-4" />
                        {statusFilters.size === 3 ? '전체' : `${statusFilters.size}개 선택됨`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-3" align="start">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id="filter-all"
                              checked={statusFilters.size === 3}
                              onCheckedChange={(checked: boolean) => {
                                if (checked) {
                                  setStatusFilters(new Set(['WAITING', 'PENDING', 'CONFIRMED']));
                                } else {
                                  setStatusFilters(new Set());
                                }
                                setPage(1);
                              }}
                            />
                            <Label
                              htmlFor="filter-all"
                              className="text-sm font-medium cursor-pointer flex-1"
                            >
                              전체
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id="filter-waiting"
                              checked={statusFilters.has('WAITING')}
                              onCheckedChange={(checked: boolean) => {
                                const newFilters = new Set(statusFilters);
                                if (checked) {
                                  newFilters.add('WAITING');
                                } else {
                                  newFilters.delete('WAITING');
                                }
                                setStatusFilters(newFilters);
                                setPage(1);
                              }}
                            />
                            <Label
                              htmlFor="filter-waiting"
                              className="text-sm font-medium cursor-pointer flex-1"
                            >
                              입고대기
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id="filter-pending"
                              checked={statusFilters.has('PENDING')}
                              onCheckedChange={(checked: boolean) => {
                                const newFilters = new Set(statusFilters);
                                if (checked) {
                                  newFilters.add('PENDING');
                                } else {
                                  newFilters.delete('PENDING');
                                }
                                setStatusFilters(newFilters);
                                setPage(1);
                              }}
                            />
                            <Label
                              htmlFor="filter-pending"
                              className="text-sm font-medium cursor-pointer flex-1"
                            >
                              입고예정
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id="filter-confirmed"
                              checked={statusFilters.has('CONFIRMED')}
                              onCheckedChange={(checked: boolean) => {
                                const newFilters = new Set(statusFilters);
                                if (checked) {
                                  newFilters.add('CONFIRMED');
                                } else {
                                  newFilters.delete('CONFIRMED');
                                }
                                setStatusFilters(newFilters);
                                setPage(1);
                              }}
                            />
                            <Label
                              htmlFor="filter-confirmed"
                              className="text-sm font-medium cursor-pointer flex-1"
                            >
                              입고확정
                            </Label>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">상품:</Label>
                  <Input
                    type="text"
                    placeholder="상품명 검색..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setPage(1);
                    }}
                    className="h-8 w-48"
                  />
                </div>
              </div>
            }
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            manualPagination={true}
            enableSorting={true}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onRowClick={(schedule) => {
              setSelectedScheduleForDetail(schedule);
              setDetailDrawerOpen(true);
            }}
            rowClassName="h-10"
          />
        )}

        <InboundDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedScheduleForDetail(null);
            }
          }}
          schedule={selectedScheduleForDetail}
          onEdit={(schedule, mode) => {
            setEditMode(mode);
            setSelectedScheduleForEdit(buildScheduleForMode(schedule, mode));
            setEditDrawerOpen(true);
            setDetailDrawerOpen(false);
          }}
          onConfirm={async (schedule) => {
            if (!schedule.id) return;
            try {
              await api.put(`/trade/contracts/orders/${schedule.id}/inbound`, {
                status: 'CONFIRMED',
              });
              toast({
                title: '성공',
                description: '입고 상태가 입고확정으로 변경되었습니다.',
              });
              setDetailDrawerOpen(false);
              void fetchSchedules();
            } catch (error) {
              console.error('입고확정 처리 중 오류:', error);
              toast({
                title: '오류',
                description: '입고확정 처리 중 오류가 발생했습니다.',
                variant: 'destructive',
              });
            }
          }}
          labelResolvers={{
            destination: resolveDestinationLabel,
            warehouse: resolveWarehouseLabel,
          }}
        />

        <InboundEditDrawer
          open={editDrawerOpen}
          onOpenChange={(open) => {
            setEditDrawerOpen(open);
            if (!open) {
              setSelectedScheduleForEdit(null);
              setEditMode('PENDING');
            }
          }}
          schedule={selectedScheduleForEdit}
          labelResolvers={{
            destination: resolveDestinationLabel,
          }}
          onSubmit={async (data) => {
            if (!selectedScheduleForEdit) return;
            try {
              // 모든 필드를 명시적으로 전송 (null 값도 포함)
              const payload: Record<string, unknown> = {
                doCost: data.doCost ?? null,
                customsFee: data.customsFee ?? null,
                quarantineAgencyFee: data.quarantineAgencyFee ?? null,
                additionalItem: data.additionalItem ?? null,
                fumigationQuarantine: data.fumigationQuarantine ?? null,
                document: data.document ?? null,
                igobi: data.igobi ?? null,
                extractionFee: data.extractionFee ?? null,
                sto: data.sto ?? null,
                firstTierLoadingFee: data.firstTierLoadingFee ?? null,
                fee: data.fee ?? null,
                sampleCollection: data.sampleCollection ?? null,
                bankFee: data.bankFee ?? null,
                quarantineWorkCost: data.quarantineWorkCost ?? null,
                quotaCost: data.quotaCost ?? null,
                warehouse: data.warehouse ?? null,
                igodate: data.igodate ?? null,
                quarantineDate: data.quarantineDate ?? null,
                dtDate: data.dtDate ?? null,
                dayExchangeRate: data.dayExchangeRate ?? null,
                comparisonExchangeRate: data.comparisonExchangeRate ?? null,
                customsDuty: data.customsDuty ?? null,
                spot: data.spot ?? null,
                status: 'PENDING',
              };
              await api.put(`/trade/contracts/orders/${selectedScheduleForEdit.id}/inbound`, payload);
              toast({
                title: '성공',
                description: '입고 데이터가 저장되었습니다.',
              });
              setEditDrawerOpen(false);
              setSelectedScheduleForEdit(null);
              setEditMode('PENDING');
              void fetchSchedules();
            } catch (error) {
              console.error('입고 데이터 저장 중 오류:', error);
              toast({
                title: '오류',
                description: '입고 데이터 저장 중 오류가 발생했습니다.',
                variant: 'destructive',
              });
            }
          }}
        />
      </div>
    </AppLayout>
  );
}

