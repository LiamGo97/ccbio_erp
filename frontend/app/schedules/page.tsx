'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { MoreHorizontal, Edit, Trash2, Plus, Copy, FileUp, FileText, X, Ship, Loader2, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { format, parse, parseISO } from 'date-fns';
import { ScheduleFormDrawer } from '@/components/schedules/schedule-form-drawer';
import { ScheduleDetailDrawer } from '@/components/schedules/schedule-detail-drawer';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';
import { useCodesByCategory, type Code } from '@/lib/hooks/use-codes';
import Cookies from 'js-cookie';
import api from '@/lib/api';
import type { AxiosError } from 'axios';
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type InvoicePaymentDraft = {
  sequence: number;
  dueDate: string | null;
  ratio: number | null;
  method: string | null;
  amount: number | null;
  exchangeRate: number | null;
  result: string | null;
};

type InvoiceDraft = {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceCurrency: string | null;
  invoiceCurrencyName?: string | null;
  invoiceAmount: number | null;
  invoiceWeight: number | null;
  unitPrice: number | null;
  totalAmount?: number | null; // 총량 (송장에서 추출된 수량)
  destination: string | null;
  etd: string | null;
  currencyName?: string | null;
  payments: InvoicePaymentDraft[];
};

type InvoiceAnalysisResponse = {
  fileName: string;
  originalFileName?: string | null;
  tempFilePath?: string | null;
  message?: string | null;
  notes?: string | null;
  contractNumberExpected?: string | null;
  contractNumberExtracted?: string | null;
  contractNumberMatched?: boolean;
  invoice?: {
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    invoiceCurrency?: string | null;
    invoiceAmount?: number | null;
    invoiceWeight?: number | null;
    unitPrice?: number | null;
    destination?: string | null;
    etd?: string | null;
  } | null;
  payments?: Array<{
    sequence: number;
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    result?: string | null;
  }>;
  containers?: Array<{
    containerNo: string | null;
    weight: number | null;
    bales?: number | null;
    unitPrice?: number | null;
  }>;
};

const createInvoiceDraftFromSchedule = (schedule: Schedule | null): InvoiceDraft => {
  const buildPayment = (sequence: number): InvoicePaymentDraft => {
    const payment = schedule?.payments?.find((item) => item.sequence === sequence);
    return {
      sequence,
      dueDate: payment?.dueDate ?? null,
      ratio: payment?.ratio ?? null,
      method: payment?.method ?? null,
      amount: payment?.amount ?? null,
      exchangeRate: payment?.exchangeRate ?? null,
      result: payment?.result ?? null,
    };
  };

  return {
    invoiceNumber: schedule?.invoiceNumber ?? '',
    invoiceDate: schedule?.invoiceDate ?? '',
    invoiceCurrency: schedule?.invoiceCurrency ?? schedule?.currencyUnit ?? '',
    invoiceCurrencyName: schedule?.invoiceCurrencyName ?? schedule?.currencyName ?? null,
    currencyName: schedule?.currencyName ?? null,
    invoiceAmount: schedule?.invoiceAmount ?? null,
    invoiceWeight: schedule?.invoiceWeight ?? null,
    unitPrice: schedule?.unitPrice ?? null,
    totalAmount: schedule?.totalAmount ?? null, // 총량 포함
    destination: schedule?.destination ?? null,
    etd: schedule?.etd ?? null,
    payments: [buildPayment(1), buildPayment(2)],
  };
};

type SchedulePayment = {
  id?: string;
  sequence: number;
  dueDate?: string | null;
  ratio?: number | null;
  amount?: number | null;
  method?: string | null;
  exchangeRate?: number | null;
  result?: string | null;
  notes?: string | null;
};

// 스케줄 데이터 타입 정의
export interface Schedule {
  id: string;
  newOld?: string; // 신/구 구분
  shippingLine?: string; // EVERGREEN (선사)
  shippingLineCode?: string | null;
  shippingLineName?: string | null;
  commissionMonth?: string; // 커미션 월
  commissionDollar?: string; // 커미션 $
  manager?: string; // 담당
  orderDate?: string; // 발주일
  exporter?: string; // EXPORTER
  contractId?: string | null; // Contract ID
  contractNo?: string; // Contract No.
  quota?: string | null; // 쿼터 유무
  fumigation?: string | null; // 훈증 유무
  spot?: string | null; // 현물 유무
  customsDuty?: string | null; // 관세 유무
  shipmentSeq?: number; // 선적 순번
  exportCountry?: string; // 수출국 (라벨)
  exportCountryCode?: string | null; // 수출국 코드
  product?: string; // Product label
  productCode?: string; // Product code value
  longShort?: string; // 장/단
  qty?: number; // Qty
  grade?: string | null; // Grade code
  bk?: string; // BK
  bl?: string; // BL
  packingType?: string | null; // Packing type code
  currencyUnit?: string; // Currency unit
  unitPrice?: number; // Unit price
  destination?: string | null; // 도착지 코드
  etd?: string; // ETD
  eta?: string; // ETA
  notes?: string; // 비고
  certificateRequest?: string; // 필증신청
  totalAmount?: number | null; // 총량
  originalShipment?: string; // 원본발송
  quarantineDate?: string; // 검역일
  customsDate?: string; // 통관일
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceCurrency?: string | null;
  invoiceCurrencyName?: string | null;
  invoiceAmount?: number | null;
  currencyName?: string | null;
  invoiceWeight?: number | null;
  invoiceFilePath?: string | null;
  invoiceFileName?: string | null;
  invoiceGoogleDriveFileId?: string | null; // 송장 Google Drive 파일 ID
  contractGoogleDriveFileId?: string | null; // 계약서 Google Drive 파일 ID
  contractFileName?: string | null; // 계약서 파일명
  productImagesFolderId?: string | null; // 제품 이미지 폴더 Google Drive ID
  productImagesFolderName?: string | null; // 제품 이미지 폴더명
  claim?: string; // 클레임
  bankPickup?: string; // 은행픽업
  sto?: string; // STO
  dm?: string; // DM
  dt?: string; // DT
  cb?: string; // CB
  finalDestination?: string | null; // 최종 목적지 코드
  finalDestinationArrivalDate?: string; // 최종 목적지 도착일
  payments?: SchedulePayment[]; // 결제 정보
}

type ScheduleDraft = {
  to_contract_no: string;
  to_shipment_seq?: number;
  to_export_country: string;
  to_product_name: string;
  to_exporter?: string;
  to_quantity: number;
  to_grade: string;
  to_bk?: string;
  to_bl?: string;
  to_packing: string;
  to_currency: string;
  to_unit_price: number;
  to_destination: string;
  to_etd: string;
};

type TradeOrderResponse = {
  id: string;
  contractId: string | null;
  contractNo: string | null;
  quota?: string | null;
  fumigation?: string | null;
  spot?: string | null;
  customsDuty?: string | null;
  sequence: number;
  newOld: string | null;
  commissionMonth: string | null;
  commissionDollar: string | null;
  manager: string | null;
  orderDate: string | null;
  exportCountryCode: string | null;
  exportCountryName: string | null;
  productCode: string | null;
  productName: string | null;
  exporterCode: string | null;
  exporterName: string | null;
  shippingLineCode: string | null;
  shippingLineName: string | null;
  shippingLine: string | null;
  quantity: number | null;
  grade: string | null;
  gradeCode: string | null;
  bk: string | null;
  bl: string | null;
  packingCode: string | null;
  packingType: string | null;
  currencyCode: string | null;
  currencyName: string | null;
  unitPrice: number | null;
  totalAmount: number | null;
  destinationCode: string | null;
  destinationName: string | null;
  finalDestination: string | null;
  finalDestinationCode: string | null;
  finalDestinationName: string | null;
  finalDestinationArrivalDate: string | null;
  etdText: string | null;
  etdDate: string | null;
  etaDate: string | null;
  notes: string | null;
  payments?: Array<{
    id?: string;
    sequence: number;
    dueDate: string | null;
    ratio: number | null;
    amount: number | null;
    method: string | null;
    exchangeRate: number | null;
    result: string | null;
    notes: string | null;
  }>;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceCurrency: string | null;
  invoiceCurrencyName: string | null;
  invoiceAmount: number | null;
  invoiceWeight: number | null;
  invoiceFilePath: string | null;
  invoiceFileName: string | null;
  invoiceGoogleDriveFileId: string | null;
  contractGoogleDriveFileId: string | null;
  contractFileName: string | null;
  productImagesFolderId: string | null;
  productImagesFolderName: string | null;
  dm: string | null;
  dt: string | null;
  cb: string | null;
  quarantineDate: string | null;
  customsDate: string | null;
  certificateRequest: string | null;
  claim: string | null;
  bankPickup: string | null;
  sto: string | null;
  originalShipment: string | null;
};

type TrackingContainer = {
  containerNumber?: string | null;
  weight?: string | null;
  gateOutDate?: string | null;
  detentionDays?: number | null;
  lastEvent?: string | null;
  events?: Array<{
    date?: string | null;
    description?: string | null;
    code?: string | null;
  }> | null;
};

type TrackingUsageBreakdown = {
  used?: number | null;
  total?: number | null;
  remaining?: number | null;
};

type TrackingResult = {
  identifier?: string | null;
  identifierType?: 'BL' | 'BK' | null;
  etd?: string | null;
  eta?: string | null;
  etaPriority?: string | null;
  etaDestination?: string | null;
  shippingLine?: string | null;
  blNumber?: string | null;
  bookingNumber?: string | null;
  responseBlNumber?: string | null;
  responseBookingNumber?: string | null;
  containers?: TrackingContainer[] | null;
  usage?: {
    apiCalls?: TrackingUsageBreakdown | null;
    uniqueShipments?: TrackingUsageBreakdown | null;
  } | null;
  raw?: unknown;
};

const draftKeyLabels: Record<string, string> = {
  to_exporter: 'EXPORTER',
  to_contract_no: '계약번호',
  to_shipment_seq: '선적 순번',
  to_export_country: '수출국',
  to_product_name: '제품',
  to_bk: 'BK',
  to_bl: 'BL',
  to_quantity: '수량',
  to_grade: '품질',
  to_packing: '포장',
  to_currency: '통화',
  to_unit_price: '단가',
  to_destination: '도착지',
  to_etd: 'ETD',
};

// Contract No. 셀 컴포넌트 (계약서 파일 메타데이터 로드)
function ContractNoCell({
  contractNo,
  contractFileId,
  contractFileName,
  onViewContract,
}: {
  contractNo?: string | null;
  contractFileId?: string | null;
  contractFileName?: string | null;
  onViewContract: (file: GoogleDriveFile) => void;
}) {
  const { data: fileMetadata } = useGoogleDriveFileMetadata(
    contractFileId || null,
    !!contractFileId,
  );

  const handleClick = () => {
    if (fileMetadata) {
      onViewContract(fileMetadata);
    } else if (contractFileId && contractFileName) {
      // 메타데이터가 아직 로드되지 않았으면 기본 정보로 표시
      onViewContract({
        id: contractFileId,
        name: contractFileName,
        mimeType: '',
        size: undefined,
        modifiedTime: undefined,
        webViewLink: undefined,
        thumbnailLink: undefined,
      });
    }
  };

  return (
    <div className="flex items-center gap-1">
      <div className="text-xs font-mono">{contractNo || '-'}</div>
      {contractFileId && contractFileName && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleClick}
          title="계약서 보기"
        >
          <FileText className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export default function SchedulesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedScheduleForDetail, setSelectedScheduleForDetail] = useState<Schedule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [scheduleToCopy, setScheduleToCopy] = useState<Schedule | null>(null);
  const [copyQuantity, setCopyQuantity] = useState<string>('1');
  const [copyError, setCopyError] = useState<string>('');
  const [contractDrawerOpen, setContractDrawerOpen] = useState(false);
  const [contractFile, setContractFile] = useState<GoogleDriveFile | null>(null);
  const [contractFilePickerOpen, setContractFilePickerOpen] = useState(false);
  const [contractFilePreviewOpen, setContractFilePreviewOpen] = useState(false);
  const [scheduleContractFilePreviewOpen, setScheduleContractFilePreviewOpen] = useState(false);
  const [scheduleContractFile, setScheduleContractFile] = useState<GoogleDriveFile | null>(null);
  const [isContractAnalyzing, setIsContractAnalyzing] = useState(false);
  const [isContractSaving, setIsContractSaving] = useState(false);
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(false);
  const [contractAnalysis, setContractAnalysis] = useState<{
    fileName: string;
    tempFilePath?: string;
    draftOrders: Array<ScheduleDraft & { to_shipment_seq?: number }>;
    rawResult?: string | null;
    extractedText?: string;
    textLength?: number;
    preview?: string;
    message?: string;
    notes?: string;
    googleDriveFileId?: string; // Google Drive 파일 ID
    core?: {
      contractNumber?: string | null;
    };
  } | null>(null);
  const [contractError, setContractError] = useState<string>('');
  const [contractInfo, setContractInfo] = useState<string>('');
  const [page, setPage] = useState(1);
  // 쿠키에서 페이지당 행수 읽기 (초기값)
  const getInitialPageSize = () => {
    const saved = Cookies.get('data-table-page-size');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) {
        return parsed;
      }
    }
    return 10;
  };
  const [pageSize, setPageSize] = useState(getInitialPageSize);
  const [sortBy, setSortBy] = useState<string>('contractNo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [etdStartDate, setEtdStartDate] = useState<Date | undefined>(undefined);
  const [etdEndDate, setEtdEndDate] = useState<Date | undefined>(undefined);
  const [trackingDrawerOpen, setTrackingDrawerOpen] = useState(false);
  const [trackingSchedule, setTrackingSchedule] = useState<Schedule | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingResult, setTrackingResult] = useState<TrackingResult | null>(null);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [trackingSaveError, setTrackingSaveError] = useState<string | null>(null);
  const [invoiceDrawerOpen, setInvoiceDrawerOpen] = useState(false);
  const [invoiceSchedule, setInvoiceSchedule] = useState<Schedule | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<GoogleDriveFile | null>(null);
  const [invoiceFilePickerOpen, setInvoiceFilePickerOpen] = useState(false);
  const [invoiceFilePreviewOpen, setInvoiceFilePreviewOpen] = useState(false);
  const [invoiceFileError, setInvoiceFileError] = useState<string | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<InvoiceDraft | null>(null);
  const [invoiceAnalyzing, setInvoiceAnalyzing] = useState(false);
  const [invoiceAnalysisMessage, setInvoiceAnalysisMessage] = useState<string | null>(null);
  const [invoiceSaveMessage, setInvoiceSaveMessage] = useState<string | null>(null);

  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const { data: packingTypeCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: tradeGradeCodes } = useCodesByCategory('TRADE_GRADE');

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

  const destinationLabelMap = useMemo(() => toCodeMap(destinationCodes), [destinationCodes, toCodeMap]);
  const packingLabelMap = useMemo(() => toCodeMap(packingTypeCodes), [packingTypeCodes, toCodeMap]);
  const gradeLabelMap = useMemo(() => toCodeMap(tradeGradeCodes), [tradeGradeCodes, toCodeMap]);

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
  const resolveFinalDestinationLabel = useCallback(
    (code?: string | null, fallback = '-') => formatCodeLabel(destinationLabelMap, code, fallback),
    [destinationLabelMap, formatCodeLabel],
  );
  const resolvePackingLabel = useCallback(
    (code?: string | null) => formatCodeLabel(packingLabelMap, code),
    [packingLabelMap, formatCodeLabel],
  );
  const resolveGradeLabel = useCallback(
    (code?: string | null) => formatCodeLabel(gradeLabelMap, code),
    [gradeLabelMap, formatCodeLabel],
  );

  useEffect(() => {
    if (selectedScheduleForDetail && detailDrawerOpen) {
    }
  }, [selectedScheduleForDetail, detailDrawerOpen]);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceNotes, setInvoiceNotes] = useState<string | null>(null);
  const [invoiceAnalysisResult, setInvoiceAnalysisResult] = useState<InvoiceAnalysisResponse | null>(null);
  const [invoiceContractMismatch, setInvoiceContractMismatch] = useState(false);
  const [managerFilter, setManagerFilter] = useState<string>('');

  // 기존 invoice 파일 메타데이터 조회 (drawer가 열려있고 기존 파일이 있을 때만)
  const invoiceFileId = invoiceDrawerOpen && invoiceSchedule?.invoiceGoogleDriveFileId ? invoiceSchedule.invoiceGoogleDriveFileId : null;
  const shouldFetchInvoiceMetadata = invoiceDrawerOpen && !!invoiceSchedule?.invoiceGoogleDriveFileId;
  const { data: existingInvoiceFileMetadata } = useGoogleDriveFileMetadata(
    invoiceFileId,
    shouldFetchInvoiceMetadata,
  );

  // 기존 invoice 파일 메타데이터가 로드되면 invoiceFile state 업데이트
  React.useEffect(() => {
    if (existingInvoiceFileMetadata && invoiceDrawerOpen && invoiceSchedule) {
      setInvoiceFile(existingInvoiceFileMetadata);
    }
  }, [existingInvoiceFileMetadata, invoiceDrawerOpen, invoiceSchedule]);

  // 스케줄에 할당된 담당자 목록 조회 (담당 필터용)
  const [managerUsers, setManagerUsers] = useState<Array<{ id: number; name: string; email: string }>>([]);
  
  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const response = await api.get('/trade/contracts/orders/managers');
        setManagerUsers(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('담당자 목록 조회 실패:', error);
        setManagerUsers([]);
      }
    };
    void fetchManagers();
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      setIsSchedulesLoading(true);
      const params: Record<string, any> = {};
      if (managerFilter && managerFilter !== '__all__') {
        const userId = parseInt(managerFilter, 10);
        if (!isNaN(userId)) {
          params.userId = userId;
        }
      }
      const response = await api.get('/trade/contracts/orders', { params });
      const orders: TradeOrderResponse[] = Array.isArray(response.data) ? response.data : [];
      const mapped: Schedule[] = orders.map((order) => {
        const legacyDestination = (order as { destination?: string | null }).destination;
        console.log('[Schedules] Order payload', {
          id: order.id ?? `${order.contractNo ?? 'unknown'}-${order.sequence ?? ''}`,
          quota: order.quota,
          fumigation: order.fumigation,
          spot: order.spot,
          customsDuty: order.customsDuty,
          contractId: order.contractId,
          contractNo: order.contractNo,
        });
        console.log('[Schedules] Destination payload', {
          id: order.id ?? `${order.contractNo ?? 'unknown'}-${order.sequence ?? ''}`,
          destinationCode: order.destinationCode ?? legacyDestination,
          destinationName: order.destinationName,
          finalDestinationCode: order.finalDestinationCode ?? order.finalDestination,
          finalDestinationName: order.finalDestinationName ?? order.finalDestination,
        });

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

        const mappedSchedule = {
          id: order.id ? String(order.id) : `${order.contractNo ?? 'unknown'}-${order.sequence ?? ''}`,
          newOld: order.newOld ?? '',
          commissionMonth: order.commissionMonth ?? '',
          commissionDollar: order.commissionDollar ?? '',
          manager: order.manager ?? '',
          orderDate: order.orderDate ?? '',
          contractNo: order.contractNo ?? '',
          quota: order.quota ?? null,
          fumigation: order.fumigation ?? null,
          spot: order.spot ?? null,
          customsDuty: order.customsDuty ?? null,
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
          unitPrice: order.unitPrice ?? undefined,
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
        };
        
        // 디버깅: 매핑된 데이터 확인
        if (mappedSchedule.quota !== null || mappedSchedule.fumigation !== null || mappedSchedule.spot !== null || mappedSchedule.customsDuty !== null) {
          console.log('[Schedules] Mapped schedule with 유무 fields', {
            id: mappedSchedule.id,
            quota: mappedSchedule.quota,
            fumigation: mappedSchedule.fumigation,
            spot: mappedSchedule.spot,
            customsDuty: mappedSchedule.customsDuty,
          });
        }
        
        return mappedSchedule;
      });
      setSchedules(mapped);
      console.log('[Schedules] Row data', mapped);
    } catch (error) {
      console.error('스케줄 목록 조회 중 오류가 발생했습니다.', error);
    } finally {
      setIsSchedulesLoading(false);
    }
  }, [managerFilter]);

  const handleOpenInvoiceDrawer = useCallback((schedule: Schedule) => {
    setInvoiceSchedule(schedule);
    setInvoiceDrawerOpen(true);
    // 기존 invoice 파일이 있으면 초기화
    if (schedule.invoiceGoogleDriveFileId && schedule.invoiceFileName) {
      setInvoiceFile({
        id: schedule.invoiceGoogleDriveFileId,
        name: schedule.invoiceFileName,
        mimeType: '',
        size: undefined,
        modifiedTime: undefined,
        webViewLink: undefined,
        thumbnailLink: undefined,
      });
    } else {
      setInvoiceFile(null);
    }
    setInvoiceFileError(null);
    setInvoicePreview(null);
    setInvoiceAnalysisMessage(null);
    setInvoiceNotes(null);
    setInvoiceSaveMessage(null);
    setInvoiceAnalyzing(false);
    setInvoiceSaving(false);
    setInvoiceContractMismatch(false);
  }, []);

  const handleInvoiceDrawerOpenChange = useCallback((open: boolean) => {
    setInvoiceDrawerOpen(open);
    if (!open) {
      setInvoiceSchedule(null);
      setInvoiceFile(null);
      setInvoiceFileError(null);
      setInvoicePreview(null);
      setInvoiceAnalysisMessage(null);
      setInvoiceNotes(null);
      setInvoiceSaveMessage(null);
      setInvoiceAnalyzing(false);
      setInvoiceAnalysisResult(null);
      setInvoiceContractMismatch(false);
    }
  }, []);

  const handleInvoiceFileSelect = useCallback((file: GoogleDriveFile) => {
    setInvoiceFile(file);
    setInvoiceFileError(null);
    setInvoiceAnalysisMessage(null);
    setInvoiceSaveMessage(null);
  }, []);

  const handleInvoiceAnalyze = useCallback(async () => {
    if (!invoiceFile) {
      setInvoiceFileError('송장 파일을 선택해주세요.');
      return;
    }
    if (!invoiceSchedule) {
      setInvoiceAnalysisMessage('분석할 스케줄을 찾을 수 없습니다. 다시 시도해주세요.');
      return;
    }
    setInvoiceAnalyzing(true);
    setInvoiceAnalysisMessage(null);
    setInvoiceSaveMessage(null);

    try {
      const response = await api.post<InvoiceAnalysisResponse>(
        `/trade/contracts/orders/${invoiceSchedule.id}/invoice/analyze`,
        {
          googleDriveFileId: invoiceFile.id,
        },
      );

      const data = response.data ?? {};
      setInvoiceNotes(data.notes ?? null);
      setInvoiceAnalysisMessage(data.message ?? '송장 분석이 완료되었습니다. 결과를 확인해주세요.');
      setInvoiceAnalysisResult(data);
      const contractMatched = data.contractNumberMatched ?? true;
      setInvoiceContractMismatch(!contractMatched);

      const fallbackDraft = createInvoiceDraftFromSchedule(invoiceSchedule);
      const invoice = data.invoice ?? {};
      const payments = data.payments ?? [];

      const buildPaymentFromResponse = (sequence: number): InvoicePaymentDraft => {
        const payment = payments.find((item) => item.sequence === sequence);
        return {
          sequence,
          dueDate: payment?.dueDate ?? null,
          ratio: payment?.ratio ?? null,
          amount: payment?.amount ?? null,
          method: payment?.method ?? null,
          exchangeRate: payment?.exchangeRate ?? null,
          result: payment?.result ?? null,
        };
      };

      setInvoicePreview({
        invoiceNumber: invoice.invoiceNumber ?? fallbackDraft.invoiceNumber,
        invoiceDate: invoice.invoiceDate ?? fallbackDraft.invoiceDate,
        invoiceCurrency: invoice.invoiceCurrency ?? fallbackDraft.invoiceCurrency,
        invoiceAmount: invoice.invoiceAmount ?? fallbackDraft.invoiceAmount,
        invoiceWeight: invoice.invoiceWeight ?? fallbackDraft.invoiceWeight,
        unitPrice: invoice.unitPrice ?? fallbackDraft.unitPrice,
        totalAmount: fallbackDraft.totalAmount ?? undefined, // 총량은 기존 스케줄 값 유지 (송장에서 추출하지 않음)
        destination: invoice.destination ?? fallbackDraft.destination,
        etd: invoice.etd ?? fallbackDraft.etd,
        payments: [buildPaymentFromResponse(1), buildPaymentFromResponse(2)],
      });
    } catch (error) {
      console.error('송장 분석 중 오류가 발생했습니다.', error);
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const responseMessage = axiosError.response?.data?.message;
      const fallbackMessage = '송장 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      setInvoiceAnalysisMessage(
        Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? fallbackMessage,
      );
    } finally {
      setInvoiceAnalyzing(false);
    }
  }, [invoiceFile, invoiceSchedule]);

  const currentInvoiceData = React.useMemo(() => {
    return invoicePreview ?? createInvoiceDraftFromSchedule(invoiceSchedule ?? null);
  }, [invoicePreview, invoiceSchedule]);

  const currentInvoicePayments = React.useMemo(() => {
    return currentInvoiceData.payments ?? [];
  }, [currentInvoiceData]);

  const handleInvoiceSave = useCallback(async () => {
    if (!invoiceSchedule) {
      setInvoiceSaveMessage('저장할 스케줄을 찾을 수 없습니다.');
      return;
    }
    if (invoiceContractMismatch) {
      setInvoiceSaveMessage('계약번호가 일치하지 않습니다. 확인 후 다시 시도해주세요.');
      return;
    }

    const invoiceData = currentInvoiceData;

    const toNullableNumber = (value: number | null | undefined) => {
      if (value === null || value === undefined) {
        return null;
      }
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const paymentsPayload = currentInvoicePayments.map((payment) => ({
      sequence: payment.sequence,
      dueDate: payment.dueDate ?? null,
      ratio: toNullableNumber(payment.ratio),
      amount: toNullableNumber(payment.amount),
      method: payment.method ?? null,
      exchangeRate: toNullableNumber(payment.exchangeRate),
      result: payment.result ?? null,
    }));

    const payload = {
      googleDriveFileId: invoiceFile?.id ?? null,
      originalFileName:
        invoiceAnalysisResult?.originalFileName ??
        invoiceAnalysisResult?.fileName ??
        invoiceFile?.name ??
        null,
      invoiceNumber: invoiceData.invoiceNumber || null,
      invoiceDate: invoiceData.invoiceDate || null,
      invoiceCurrency: invoiceData.invoiceCurrency || null,
      invoiceCurrencyName: invoiceData.invoiceCurrencyName ?? null,
      invoiceAmount: toNullableNumber(invoiceData.invoiceAmount),
      currencyName: invoiceData.currencyName ?? null,
      invoiceWeight: toNullableNumber(invoiceData.invoiceWeight),
      unitPrice: toNullableNumber(invoiceData.unitPrice),
      // totalAmount는 보내지 않음 (undefined로 두어 기존 총량 값 유지)
      // 송장 저장 시 총량은 변경하지 않고, invoiceAmount가 총량으로 저장되지 않도록 함
      destination: invoiceData.destination || null,
      etd: invoiceData.etd || null,
      payments: paymentsPayload,
    };

    setInvoiceSaving(true);
    setInvoiceSaveMessage(null);

    try {
      await api.put(`/trade/contracts/orders/${invoiceSchedule.id}/invoice`, payload);
      setInvoiceSaveMessage('송장 정보가 저장되었습니다.');
      toast({
        title: '송장 저장 완료',
        description: `${invoiceSchedule.contractNo ?? '무계약'} 선적의 송장 정보가 저장되었습니다.`,
      });
      await fetchSchedules();
    } catch (error) {
      console.error('송장 정보 저장 중 오류가 발생했습니다.', error);
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const responseMessage = axiosError.response?.data?.message;
      const fallbackMessage = '송장 정보를 저장하는 중 문제가 발생했습니다.';
      setInvoiceSaveMessage(
        Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? fallbackMessage,
      );
      toast({
        title: '송장 저장 실패',
        description: Array.isArray(responseMessage)
          ? responseMessage.join(', ')
          : responseMessage ?? fallbackMessage,
        variant: 'destructive',
      });
    } finally {
      setInvoiceSaving(false);
    }
  }, [
    invoiceSchedule,
    currentInvoiceData,
    currentInvoicePayments,
    invoiceAnalysisResult,
    invoiceFile,
    fetchSchedules,
    invoiceContractMismatch,
  ]);

  const formatUsageValue = useCallback((value?: number | null) => {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toLocaleString();
    }
    return String(value);
  }, []);

  type PaymentFieldKey = 'dueDate' | 'ratio' | 'method' | 'amount' | 'exchangeRate' | 'result';

  const getPaymentFieldValue = useCallback(
    (
      payments: SchedulePayment[] | undefined,
      sequence: number,
      field: PaymentFieldKey,
      currencyUnit?: string | null,
      invoiceCurrency?: string | null,
      currencyName?: string | null,
      invoiceCurrencyName?: string | null,
    ) => {
      if (!payments || payments.length === 0) {
        return '';
      }
      const payment = payments.find((item) => item.sequence === sequence);
      if (!payment) {
        return '';
      }

      switch (field) {
        case 'dueDate': {
          if (!payment.dueDate) {
            return '';
          }
          try {
            return format(parseISO(payment.dueDate), 'yyyy-MM-dd');
          } catch {
            return payment.dueDate;
          }
        }
        case 'ratio':
          return payment.ratio !== null && payment.ratio !== undefined
            ? `${payment.ratio}%`
            : '';
        case 'method':
          return payment.method ?? '';
        case 'amount': {
          if (payment.amount === null || payment.amount === undefined) {
            return '';
          }
          const currency =
            (invoiceCurrencyName || currencyName || invoiceCurrency || currencyUnit || '').trim();
          const formattedAmount = payment.amount.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          });
          return currency ? `${currency} ${formattedAmount}` : formattedAmount;
        }
        case 'exchangeRate':
          return payment.exchangeRate !== null && payment.exchangeRate !== undefined
            ? payment.exchangeRate.toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })
            : '';
        case 'result':
          return '';
        default:
          return '';
      }
    },
    [],
  );

  const renderPaymentField = useCallback(
    (schedule: Schedule, field: PaymentFieldKey) => {
      const payments = schedule.payments ?? [];
      const first = getPaymentFieldValue(
        payments,
        1,
        field,
        schedule.currencyUnit,
        schedule.invoiceCurrency,
        schedule.currencyName,
        schedule.invoiceCurrencyName,
      );
      const second = getPaymentFieldValue(
        payments,
        2,
        field,
        schedule.currencyUnit,
        schedule.invoiceCurrency,
        schedule.currencyName,
        schedule.invoiceCurrencyName,
      );
      const hasSecond = payments.some((payment) => payment.sequence === 2);
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span>
            <span className="text-[10px] text-muted-foreground mr-1">1차</span>
            {first || '-'}
          </span>
          <span>
            <span className="text-[10px] text-muted-foreground mr-1">2차</span>
            {hasSecond ? second || '-' : '-'}
          </span>
        </div>
      );
    },
    [getPaymentFieldValue],
  );

  const draftOrders = useMemo(
    () => (Array.isArray(contractAnalysis?.draftOrders) ? contractAnalysis?.draftOrders ?? [] : []),
    [contractAnalysis],
  );

  const draftColumns = useMemo(() => {
    if (!draftOrders.length) {
      return [];
    }
    const keySet = new Set<string>();
    draftOrders.forEach((order) => {
      Object.keys(order || {}).forEach((key) => keySet.add(key));
    });
    const keys = Array.from(keySet);
    const priority = [
      'to_exporter',
      'to_contract_no',
      'to_shipment_seq',
      'to_export_country',
      'to_product_name',
      'to_bk',
      'to_bl',
      'to_quantity',
      'to_grade',
      'to_packing',
      'to_currency',
      'to_unit_price',
      'to_destination',
      'to_etd',
    ];
    const priorityIndex = (key: string) => {
      const index = priority.indexOf(key);
      return index === -1 ? priority.length + keys.indexOf(key) : index;
    };
    return keys.sort((a, b) => {
      const diff = priorityIndex(a) - priorityIndex(b);
      if (diff !== 0) {
        return diff;
      }
      return a.localeCompare(b);
    });
  }, [draftOrders]);
  
  // 컬럼 표시 상태 변경 핸들러
  const handleVisibleColumnsChange = (columns: string[]) => {
    setVisibleColumns(columns);
    // 쿠키에 저장 (30일 유지)
    Cookies.set('schedules-visible-columns', JSON.stringify(columns), { expires: 30 });
  };

  // 필터링 및 정렬된 데이터
  const filteredSchedules = useMemo(() => {
    let filtered = [...schedules];

    // ETD 날짜 범위 필터
    if (etdStartDate && etdEndDate) {
      filtered = filtered.filter((schedule) => {
        if (!schedule.etd) return false;
        try {
          // ETD 형식이 "MM/dd" 또는 "MM/dd" 형식일 수 있음
          const etdParts = schedule.etd.trim().split('/');
          if (etdParts.length === 2) {
            const currentYear = new Date().getFullYear();
            const etdDate = parse(schedule.etd.trim(), 'MM/dd', new Date());
            etdDate.setFullYear(currentYear);
            
            // 날짜 범위 확인
            return etdDate >= etdStartDate && etdDate <= etdEndDate;
          }
          return false;
        } catch {
          return false;
        }
      });
    }

    // 정렬
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
  }, [schedules, etdStartDate, etdEndDate, sortBy, sortOrder]);

  // 페이지네이션
  const total = filteredSchedules.length;
  const totalPages = Math.ceil(total / pageSize);
  const paginatedSchedules = filteredSchedules.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // 컬럼 정의
  const allColumns: ColumnDef<Schedule>[] = [
    {
      accessorKey: 'newOld',
      header: '구분',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('newOld') || '-'}</div>;
      },
      size: 70,
    },
    {
      accessorKey: 'shippingLine',
      header: '선사',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('shippingLine') || '-'}</div>;
      },
      size: 80,
    },
    {
      accessorKey: 'commissionMonth',
      header: '커미션 월',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('commissionMonth') || '-'}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'commissionDollar',
      header: '커미션 $',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('commissionDollar') || '-'}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'manager',
      header: '담당',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('manager') || '-'}</div>;
      },
      size: 80,
    },
    {
      accessorKey: 'exportCountry',
      header: '수출국',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('exportCountry') || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'quota',
      header: '쿼터 유무',
      enableSorting: true,
      cell: ({ row }) => {
        const quota = row.original.quota ?? null;
        const normalized = typeof quota === 'string' ? quota.trim().toUpperCase() : null;
        const displayValue = normalized === 'Y' ? '있음' : normalized === 'N' ? '없음' : '-';
        return <div className="text-sm">{displayValue}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'fumigation',
      header: '훈증 유무',
      enableSorting: false,
      cell: ({ row }) => {
        const fumigation = row.original.fumigation ?? null;
        const normalized = typeof fumigation === 'string' ? fumigation.trim().toUpperCase() : null;
        const displayValue = normalized === 'Y' ? '있음' : normalized === 'N' ? '없음' : '-';
        return <div className="text-sm">{displayValue}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'spot',
      header: '현물 유무',
      enableSorting: false,
      cell: ({ row }) => {
        const spot = row.original.spot ?? null;
        const normalized = typeof spot === 'string' ? spot.trim().toUpperCase() : null;
        const displayValue = normalized === 'Y' ? '있음' : normalized === 'N' ? '없음' : '-';
        return <div className="text-sm">{displayValue}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'customsDuty',
      header: '관세 유무',
      enableSorting: false,
      cell: ({ row }) => {
        const customsDuty = row.original.customsDuty ?? null;
        const normalized =
          typeof customsDuty === 'string' ? customsDuty.trim().toUpperCase() : null;
        const displayValue = normalized === 'Y' ? '있음' : normalized === 'N' ? '없음' : '-';
        return <div className="text-sm">{displayValue}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'exporter',
      header: '수출사',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('exporter') || '-'}</div>;
      },
      size: 110,
    },
    {
      accessorKey: 'product',
      header: '상품',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('product') || '-'}</div>;
      },
      size: 150,
    },
    {
      accessorKey: 'orderDate',
      header: '발주일',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('orderDate') || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'contractNo',
      header: 'Contract No.',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        return (
          <ContractNoCell
            contractNo={row.getValue('contractNo') as string}
            contractFileId={schedule.contractGoogleDriveFileId}
            contractFileName={schedule.contractFileName}
            onViewContract={(file) => {
              setScheduleContractFile(file);
              setScheduleContractFilePreviewOpen(true);
            }}
          />
        );
      },
      size: 140,
    },
    {
      accessorKey: 'shipmentSeq',
      header: '선적 순번',
      enableSorting: true,
      cell: ({ row }) => {
        const seq = row.getValue('shipmentSeq') as number | undefined;
        return <div className="text-xs">{seq ? `${seq}회차` : '-'}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'longShort',
      header: '장/단',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('longShort') || '-'}</div>;
      },
      size: 60,
    },
    {
      accessorKey: 'bk',
      header: 'BK',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs font-mono">{row.getValue('bk') || '-'}</div>;
      },
      size: 120,
    },
    {
      accessorKey: 'bl',
      header: 'BL',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs font-mono">{row.getValue('bl') || '-'}</div>;
      },
      size: 150,
    },
    {
      accessorKey: 'qty',
      header: 'Qty',
      enableSorting: true,
      cell: ({ row }) => {
        const qty = row.getValue('qty') as number;
        return <div className="text-xs text-right">{qty ? qty : '-'}</div>;
      },
      size: 70,
    },
    {
      accessorKey: 'grade',
      header: 'Grade',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        return <div className="text-xs">{resolveGradeLabel(schedule.grade)}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'packingType',
      header: 'Packing',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        return <div className="text-xs">{resolvePackingLabel(schedule.packingType)}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'currencyUnit',
      header: 'Currency',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        const currencyDisplay = schedule.currencyName || schedule.currencyUnit || '-';
        return <div className="text-xs">{currencyDisplay}</div>;
      },
      size: 70,
    },
    {
      accessorKey: 'unitPrice',
      header: 'Unit Price',
      enableSorting: true,
      cell: ({ row }) => {
        const price = row.getValue('unitPrice') as number;
        return <div className="text-xs text-right">{price ? price.toLocaleString() : '-'}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'destination',
      header: '도착지',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        return <div className="text-xs">{resolveDestinationLabel(schedule.destination)}</div>;
      },
      size: 70,
    },
    {
      accessorKey: 'etd',
      header: 'ETD',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('etd') || '-'}</div>;
      },
      size: 80,
    },
    {
      accessorKey: 'eta',
      header: 'ETA',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('eta') || '-'}</div>;
      },
      size: 80,
    },
    {
      accessorKey: 'notes',
      header: '비고',
      enableSorting: false,
      cell: ({ row }) => {
        return <div className="text-xs max-w-xs truncate">{row.getValue('notes') || '-'}</div>;
      },
      size: 200,
    },
    {
      accessorKey: 'certificateRequest',
      header: '필증신청',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('certificateRequest') || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'totalAmount',
      header: '총량',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        const amount = schedule.totalAmount ?? schedule.invoiceWeight ?? null;
        return (
          <div className="text-xs text-right">
            {amount !== null && amount !== undefined ? amount.toLocaleString() : '-'}
          </div>
        );
      },
      size: 90,
    },
    {
      accessorKey: 'originalShipment',
      header: '원본발송',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('originalShipment') || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'quarantineDate',
      header: '검역일',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('quarantineDate') || '-'}</div>;
      },
      size: 80,
    },
    {
      accessorKey: 'customsDate',
      header: '통관일',
      enableSorting: true,
      cell: ({ row }) => {
        const date = row.getValue('customsDate') as string;
        return <div className="text-xs">{date || '-'}</div>;
      },
      size: 80,
    },
    {
      id: 'paymentDueDate',
      header: '결제 예정일',
      enableSorting: false,
      cell: ({ row }) => renderPaymentField(row.original, 'dueDate'),
      size: 130,
    },
    {
      id: 'paymentRatio',
      header: '결제 비율',
      enableSorting: false,
      cell: ({ row }) => renderPaymentField(row.original, 'ratio'),
      size: 110,
    },
    {
      id: 'paymentMethod',
      header: '결제 조건',
      enableSorting: false,
      cell: ({ row }) => renderPaymentField(row.original, 'method'),
      size: 130,
    },
    {
      id: 'paymentAmount',
      header: '결제 금액',
      enableSorting: false,
      cell: ({ row }) => renderPaymentField(row.original, 'amount'),
      size: 150,
    },
    {
      id: 'paymentExchangeRate',
      header: '환율',
      enableSorting: false,
      cell: ({ row }) => renderPaymentField(row.original, 'exchangeRate'),
      size: 110,
    },
    {
      id: 'paymentResult',
      header: '결제 결과',
      enableSorting: false,
      cell: ({ row }) => renderPaymentField(row.original, 'result'),
      size: 200,
    },
    {
      accessorKey: 'invoiceAmount',
      header: '인보이스금액',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        if (schedule.invoiceAmount === null || schedule.invoiceAmount === undefined) {
          return <div className="text-xs">-</div>;
        }
        const currency =
          schedule.invoiceCurrency && schedule.invoiceCurrency.trim().length > 0
            ? schedule.invoiceCurrency
            : schedule.currencyUnit ?? '';
        // 소수점 2자리로 포맷팅
        const formattedAmount = schedule.invoiceAmount.toLocaleString('ko-KR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <div className="text-xs">
            {currency ? `${currency} ${formattedAmount}` : formattedAmount}
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'claim',
      header: '클레임',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('claim') || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'bankPickup',
      header: '은행픽업',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('bankPickup') || '-'}</div>;
      },
      size: 90,
    },
    {
      accessorKey: 'sto',
      header: 'STO',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('sto') || '-'}</div>;
      },
      size: 60,
    },
    {
      accessorKey: 'dm',
      header: 'DM',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('dm') || '-'}</div>;
      },
      size: 60,
    },
    {
      accessorKey: 'dt',
      header: 'DT',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('dt') || '-'}</div>;
      },
      size: 60,
    },
    {
      accessorKey: 'cb',
      header: 'CB',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('cb') || '-'}</div>;
      },
      size: 60,
    },
    {
      accessorKey: 'finalDestination',
      header: '최종 목적지',
      enableSorting: true,
      cell: ({ row }) => {
        const schedule = row.original;
        return <div className="text-xs">{resolveFinalDestinationLabel(schedule.finalDestination)}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'finalDestinationArrivalDate',
      header: '최종 목적지 도착일',
      enableSorting: true,
      cell: ({ row }) => {
        return <div className="text-xs">{row.getValue('finalDestinationArrivalDate') || '-'}</div>;
      },
      size: 130,
    },
    {
      id: 'actions',
      header: '작업',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const schedule = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <span className="sr-only">메뉴 열기</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setScheduleToCopy(schedule);
                    setCopyQuantity('1');
                    setCopyError('');
                    setCopyDialogOpen(true);
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  주문 추가
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setTrackingSchedule(schedule);
                    setTrackingResult(null);
                    setTrackingError(null);
                    setTrackingSaveError(null);
                    setTrackingSaving(false);
                    setTrackingLoading(false);
                    setTrackingDrawerOpen(true);
                  }}
                >
                  <Ship className="mr-2 h-4 w-4" />
                  선적 조회 (ETA)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenInvoiceDrawer(schedule);
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  송장 업로드/분석
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSchedule(schedule);
                    setDrawerMode('edit');
                    setDrawerOpen(true);
                    setDetailDrawerOpen(false);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  수정
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteError('');
                    setIsDeleting(false);
                    setScheduleToDelete(schedule);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      size: 80,
    },
  ];
  
  // 컬럼 표시 상태 관리 (쿠키에 저장)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = Cookies.get('schedules-visible-columns');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // 빈 배열이면 모든 컬럼 ID 반환
          if (Array.isArray(parsed) && parsed.length === 0) {
            const allIds = allColumns
              .map((col) => {
                if (col.id) return col.id;
                if ((col as any).accessorKey) return (col as any).accessorKey;
                return null;
              })
              .filter((id): id is string => id !== null && id !== 'no' && id !== 'actions');
            return allIds;
          }
          return parsed;
        } catch {
          // 파싱 실패 시 모든 컬럼 ID 반환
          const allIds = allColumns
            .map((col) => {
              if (col.id) return col.id;
              if ((col as any).accessorKey) return (col as any).accessorKey;
              return null;
            })
            .filter((id): id is string => id !== null && id !== 'no' && id !== 'actions');
          return allIds;
        }
      }
    }
    // 초기값: 모든 컬럼 ID
    const allIds = allColumns
      .map((col) => {
        if (col.id) return col.id;
        if ((col as any).accessorKey) return (col as any).accessorKey;
        return null;
      })
      .filter((id): id is string => id !== null && id !== 'no' && id !== 'actions');
    return allIds;
  });
  
  // DataTable에 모든 컬럼을 전달하고, DataTable 내부에서 visibleColumns로 필터링하도록 함
  const columns = allColumns;

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    void checkAuth();
  }, []);

  // 초기 로드 및 managerFilter 변경 시 재조회
  useEffect(() => {
    if (!loading) {
      const loadSchedules = async () => {
        try {
          setIsSchedulesLoading(true);
          const params: Record<string, any> = {};
          if (managerFilter && managerFilter !== '__all__') {
            const userId = parseInt(managerFilter, 10);
            if (!isNaN(userId)) {
              params.userId = userId;
            }
          }
          const response = await api.get('/trade/contracts/orders', { params });
          const orders: TradeOrderResponse[] = Array.isArray(response.data) ? response.data : [];
          const mapped: Schedule[] = orders.map((order) => {
            // 프론트 디버깅 로그: 원본 주문 데이터
            console.log('[Schedules] Order payload', {
              id: order.id ?? `${order.contractNo ?? 'unknown'}-${order.sequence ?? ''}`,
              quota: order.quota,
              fumigation: order.fumigation,
              spot: order.spot,
              customsDuty: order.customsDuty,
              contractId: order.contractId,
              contractNo: order.contractNo,
            });
            const legacyDestination = (order as { destination?: string | null }).destination;
            const destinationCode = order.destinationCode ?? legacyDestination ?? null;
            const finalDestinationCode = order.finalDestinationCode ?? order.finalDestination ?? null;
            const legacyPackingName = (order as { packingName?: string | null }).packingName;
            const legacyGradeName = (order as { gradeName?: string | null }).gradeName;
            const packingCode = order.packingCode ?? order.packingType ?? legacyPackingName ?? null;
            const gradeCode = order.gradeCode ?? order.grade ?? legacyGradeName ?? null;
            const exportCountryCode = order.exportCountryCode?.trim() || null;
            const exportCountryLabel = order.exportCountryName ?? exportCountryCode ?? '';
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

            const mappedSchedule: Schedule = {
              id: order.id ? String(order.id) : `${order.contractNo ?? 'unknown'}-${order.sequence ?? ''}`,
              newOld: order.newOld ?? '',
              quota: order.quota ?? null,
              fumigation: order.fumigation ?? null,
              spot: order.spot ?? null,
              customsDuty: order.customsDuty ?? null,
              commissionMonth: order.commissionMonth ?? '',
              commissionDollar: order.commissionDollar ?? '',
              manager: order.manager ?? '',
              orderDate: order.orderDate ?? '',
              contractId: order.contractId ?? null,
              contractNo: order.contractNo ?? undefined,
              exportCountryCode,
              shippingLine: order.shippingLine ?? '',
              shippingLineCode: order.shippingLineCode ?? null,
              shippingLineName: order.shippingLineName ?? order.shippingLine ?? null,
              shipmentSeq: order.sequence ?? undefined,
              exporter: order.exporterName ?? order.exporterCode ?? '',
              exportCountry: exportCountryLabel || '',
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
              unitPrice: order.unitPrice ?? undefined,
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
            };

            return mappedSchedule;
          });
          setSchedules(mapped);
        } catch (error) {
          console.error('스케줄 목록 조회 중 오류가 발생했습니다.', error);
        } finally {
          setIsSchedulesLoading(false);
        }
      };
      void loadSchedules();
    }
  }, [loading, managerFilter]);

  const handleDelete = async () => {
    if (!scheduleToDelete) {
      return;
    }

    const isPersisted = /^\d+$/.test(scheduleToDelete.id);

    if (!isPersisted) {
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleToDelete.id));
      setDeleteDialogOpen(false);
      setScheduleToDelete(null);
      setDeleteError('');
      toast({
        title: '스케줄이 삭제되었습니다.',
        description: `${scheduleToDelete.contractNo ?? '무계약'} 선적이 삭제되었습니다.`,
      });
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError('');
      await api.delete(`/trade/contracts/orders/${scheduleToDelete.id}`);
      await fetchSchedules();
      setDeleteDialogOpen(false);
      setScheduleToDelete(null);
    } catch (error) {
      console.error('스케줄 삭제 중 오류가 발생했습니다.', error);
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const responseMessage = axiosError.response?.data?.message;
      const fallbackMessage = '스케줄 삭제 중 오류가 발생했습니다.';
      setDeleteError(
        Array.isArray(responseMessage)
          ? responseMessage.join(', ')
          : responseMessage ?? fallbackMessage,
      );
      toast({
        title: '스케줄 삭제 실패',
        description: Array.isArray(responseMessage)
          ? responseMessage.join(', ')
          : responseMessage ?? fallbackMessage,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchTrackingResult = useCallback(
    async (schedule: Schedule) => {
      setTrackingLoading(true);
      setTrackingError(null);
      setTrackingResult(null);
    setTrackingSaveError(null);
    setTrackingSaving(false);

      try {
        const response = await api.post(`/trade/contracts/orders/${schedule.id}/tracking`);
        const data: TrackingResult = response.data ?? null;
        setTrackingResult(data);
      } catch (error) {
        console.error('선적 조회 중 오류가 발생했습니다.', error);
        const axiosError = error as AxiosError<{ message?: string | string[] }>;
        const responseMessage = axiosError.response?.data?.message;
        const fallbackMessage = '선적 정보를 조회하는 중 문제가 발생했습니다.';
        setTrackingError(
          Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? fallbackMessage,
        );
      } finally {
        setTrackingLoading(false);
      }
    },
    [],
  );

  const handleApplyTracking = useCallback(async () => {
    if (!trackingSchedule || !trackingResult) {
      return;
    }

    const etaValue = trackingResult.eta ?? trackingResult.etaPriority ?? null;
    const blValue =
      trackingResult.responseBlNumber ??
      trackingResult.blNumber ??
      (trackingSchedule.bl && trackingSchedule.bl.trim().length > 0 ? trackingSchedule.bl : null);
    const bookingValue =
      trackingResult.responseBookingNumber ??
      trackingResult.bookingNumber ??
      (trackingSchedule.bk && trackingSchedule.bk.trim().length > 0 ? trackingSchedule.bk : null);

    const payload: Record<string, string | null> = {};

    if (etaValue) {
      payload.eta = etaValue;
    }
    if (trackingResult.etd) {
      payload.etd = trackingResult.etd;
    }
    if (blValue) {
      payload.bl = blValue;
    }
    if (bookingValue) {
      payload.bk = bookingValue;
    }
    if (trackingResult.shippingLine) {
      payload.shippingLine = trackingResult.shippingLine;
    }

    if (Object.keys(payload).length === 0) {
      setTrackingSaveError('반영할 데이터가 없습니다.');
      return;
    }

    // 스케줄 반영 데이터 로그
    console.log('[스케줄 반영] 반영할 데이터:', {
      scheduleId: trackingSchedule.id,
      contractNo: trackingSchedule.contractNo,
      shipmentSeq: trackingSchedule.shipmentSeq,
      payload,
      trackingResult: {
        eta: trackingResult.eta,
        etaPriority: trackingResult.etaPriority,
        etd: trackingResult.etd,
        shippingLine: trackingResult.shippingLine,
        blNumber: trackingResult.blNumber,
        bookingNumber: trackingResult.bookingNumber,
        responseBlNumber: trackingResult.responseBlNumber,
        responseBookingNumber: trackingResult.responseBookingNumber,
      },
      selectedValues: {
        etaValue,
        blValue,
        bookingValue,
      },
    });

    setTrackingSaving(true);
    setTrackingSaveError(null);

    try {
      await api.put(`/trade/contracts/orders/${trackingSchedule.id}`, payload);
      await fetchSchedules();
      setTrackingDrawerOpen(false);
    } catch (error) {
      console.error('선적 정보 반영 중 오류가 발생했습니다.', error);
      const axiosError = error as AxiosError<{ message?: string | string[] }>;
      const responseMessage = axiosError.response?.data?.message;
      const fallbackMessage = '선적 정보를 스케줄에 반영하는 중 문제가 발생했습니다.';
      setTrackingSaveError(
        Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? fallbackMessage,
      );
    } finally {
      setTrackingSaving(false);
    }
  }, [trackingSchedule, trackingResult, fetchSchedules]);

  useEffect(() => {
    if (!trackingDrawerOpen) {
      setTrackingSchedule(null);
      setTrackingResult(null);
      setTrackingError(null);
      setTrackingLoading(false);
      setTrackingSaving(false);
      setTrackingSaveError(null);
    }
  }, [trackingDrawerOpen]);

  const handleCopySchedules = async () => {
    if (!scheduleToCopy) {
      setCopyError('주문을 선택해주세요.');
      return;
    }
    
    // contractId와 contractNo 추출
    let contractId = scheduleToCopy.contractId;
    let contractNo = scheduleToCopy.contractNo?.trim() || null;
    
    // contractId가 없으면 같은 계약의 다른 주문에서 찾기
    if (!contractId) {
      // 계약번호로 같은 계약 찾기
      if (contractNo) {
        const sameContract = schedules.find(
          (s) => s.contractNo?.trim() === contractNo?.trim() && s.contractId
        );
        if (sameContract?.contractId) {
          contractId = sameContract.contractId;
        }
      }
      
      // 계약번호도 없으면 exporter/exportCountry/product 조합으로 찾기
      if (!contractId) {
        const sameContract = schedules.find(
          (s) =>
            (s.exporter || null) === (scheduleToCopy.exporter || null) &&
            (s.exportCountry || null) === (scheduleToCopy.exportCountry || null) &&
            (s.product || null) === (scheduleToCopy.product || null) &&
            s.contractId
        );
        if (sameContract?.contractId) {
          contractId = sameContract.contractId;
        }
      }
    }

    const quantity = Number.parseInt(copyQuantity, 10);
    if (Number.isNaN(quantity) || quantity <= 0) {
      setCopyError('1 이상의 숫자를 입력해주세요.');
      return;
    }
    if (quantity > 50) {
      setCopyError('한번에 50개 이하로 추가할 수 있습니다.');
      return;
    }

    // 같은 계약을 가진 주문들의 선적 순번 확인
    // contractId 우선, 없으면 계약번호, 둘 다 없으면 exporter/exportCountry/product 조합
    const sameContractSchedules = schedules.filter((s) => {
      // 1. contractId로 비교 (가장 정확)
      if (contractId && s.contractId) {
        return String(s.contractId) === String(contractId);
      }
      // 2. 계약번호로 비교
      if (contractNo && s.contractNo) {
        return s.contractNo.trim() === contractNo.trim();
      }
      // 3. contractId가 없고 계약번호도 없으면, exporter/exportCountry/product 조합으로 비교
      if (!contractId && !contractNo && !s.contractId && !s.contractNo) {
        return (
          (s.exporter || null) === (scheduleToCopy.exporter || null) &&
          (s.exportCountry || null) === (scheduleToCopy.exportCountry || null) &&
          (s.product || null) === (scheduleToCopy.product || null)
        );
      }
      return false;
    });
    
    const existingSequences = sameContractSchedules
      .map((s) => s.shipmentSeq)
      .filter((seq): seq is number => seq !== undefined && seq !== null)
      .sort((a, b) => a - b);

    // 주문이 1개일 때 1을 입력하면 동작 안함
    if (existingSequences.length === 1 && existingSequences[0] === 1 && quantity === 1) {
      setCopyError('선적 순번 1이 이미 존재합니다.');
      return;
    }

    // 최대 선적 순번 확인
    const maxSequence = existingSequences.length > 0 
      ? Math.max(...existingSequences) 
      : 0;

    // 추가할 선적 순번들 생성
    const newSequences: number[] = [];
    for (let i = 1; i <= quantity; i++) {
      const newSeq = maxSequence + i;
      // 이미 존재하는 순번인지 확인
      if (existingSequences.includes(newSeq)) {
        setCopyError(`선적 순번 ${newSeq}이(가) 이미 존재합니다.`);
        return;
      }
      newSequences.push(newSeq);
    }

    // API를 통해 주문 생성 (순차 처리로 변경하여 race condition 방지)
    try {
      setIsSchedulesLoading(true);
      setCopyError('');

      const createdSequences: number[] = [];
      
      // 순차적으로 주문 생성
      for (const seq of newSequences) {
        const orderData: any = {
          shipmentSeq: seq,
        };

        // contractId가 있으면 우선 사용
        if (contractId) {
          orderData.contractId = String(contractId);
        } else if (contractNo) {
          orderData.contractNo = contractNo;
        }

        // 나머지 필드 추가
        if (scheduleToCopy.exportCountry) orderData.exportCountry = scheduleToCopy.exportCountry;
        if (scheduleToCopy.exporter) orderData.exporter = scheduleToCopy.exporter;
        if (scheduleToCopy.product) orderData.productName = scheduleToCopy.product;
        if (scheduleToCopy.newOld) orderData.newOld = scheduleToCopy.newOld;
        if (scheduleToCopy.commissionMonth) orderData.commissionMonth = scheduleToCopy.commissionMonth;
        if (scheduleToCopy.commissionDollar) orderData.commissionDollar = scheduleToCopy.commissionDollar;
        if (scheduleToCopy.orderDate) orderData.orderDate = scheduleToCopy.orderDate;
        if (scheduleToCopy.shippingLineCode || scheduleToCopy.shippingLine) {
          orderData.shippingLine = scheduleToCopy.shippingLineCode || scheduleToCopy.shippingLine;
        }
        if (scheduleToCopy.qty) orderData.quantity = scheduleToCopy.qty;
        if (scheduleToCopy.grade) orderData.grade = scheduleToCopy.grade;
        if (scheduleToCopy.bk) orderData.bk = scheduleToCopy.bk;
        if (scheduleToCopy.bl) orderData.bl = scheduleToCopy.bl;
        if (scheduleToCopy.packingType) orderData.packingType = scheduleToCopy.packingType;
        if (scheduleToCopy.currencyUnit) orderData.currency = scheduleToCopy.currencyUnit;
        if (scheduleToCopy.unitPrice) orderData.unitPrice = scheduleToCopy.unitPrice;
        if (scheduleToCopy.destination) orderData.destination = scheduleToCopy.destination;
        if (scheduleToCopy.etd) orderData.etd = scheduleToCopy.etd;
        if (scheduleToCopy.eta) orderData.eta = scheduleToCopy.eta;
        if (scheduleToCopy.notes) orderData.notes = scheduleToCopy.notes;
        if (scheduleToCopy.dm) orderData.dm = scheduleToCopy.dm;
        if (scheduleToCopy.dt) orderData.dt = scheduleToCopy.dt;
        if (scheduleToCopy.cb) orderData.cb = scheduleToCopy.cb;
        if (scheduleToCopy.payments && scheduleToCopy.payments.length > 0) {
          orderData.payments = scheduleToCopy.payments.map((p) => ({
            sequence: p.sequence,
            dueDate: p.dueDate || null,
            ratio: p.ratio || null,
            amount: p.amount || null,
            method: p.method || null,
            exchangeRate: p.exchangeRate || null,
            result: p.result || null,
          }));
        }

        try {
          await api.post('/trade/contracts/orders', orderData);
          createdSequences.push(seq);
        } catch (error: any) {
          console.error(`주문 추가 에러 (순번 ${seq}):`, error);
          console.error('에러 응답:', error?.response?.data);
          const message = error?.response?.data?.message ?? error?.response?.data?.error ?? error?.message ?? '주문 추가 중 오류가 발생했습니다.';
          throw new Error(`순번 ${seq} 주문 추가 실패: ${Array.isArray(message) ? message.join(', ') : message}`);
        }
      }

      toast({
        title: '주문 추가 완료',
        description: `${createdSequences.length}개의 주문이 추가되었습니다. (선적 순번: ${createdSequences.join(', ')})`,
      });

      // 최종 스케줄 목록 새로고침
      await fetchSchedules();

      setCopyDialogOpen(false);
      setScheduleToCopy(null);
      setCopyQuantity('1');
      setCopyError('');
    } catch (error: any) {
      console.error('주문 추가 에러:', error);
      const message = error?.message ?? error?.response?.data?.message ?? error?.response?.data?.error ?? '주문 추가 중 오류가 발생했습니다.';
      setCopyError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setIsSchedulesLoading(false);
    }
  };

  const handleContractAnalyze = async () => {
    if (!contractFile) {
      toast({
        title: '계약서 파일 필요',
        description: '먼저 계약서 파일을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }
    setIsContractAnalyzing(true);
    setContractError('');
    setContractAnalysis(null);

    try {
      const response = await api.post('/trade/contracts/analyze', {
        googleDriveFileId: contractFile.id,
      });

      const result = response.data;
      setContractAnalysis({
        fileName: result.fileName ?? contractFile.name,
        tempFilePath: result.tempFilePath,
        draftOrders: Array.isArray(result.draftOrders) ? result.draftOrders : [],
        rawResult: typeof result.rawResult === 'string' ? result.rawResult : null,
        extractedText: result.extractedText,
        textLength: result.textLength,
        preview: result.preview,
        message: result.message,
        notes: result.notes,
        googleDriveFileId: result.googleDriveFileId ?? contractFile.id, // 분석 결과 또는 contractFile에서 가져오기
        core: result.core,
      });
      setContractInfo(result.message || '');
    } catch (error) {
      console.error('계약서 업로드 중 오류 발생:', error);
      const err = error as AxiosError<{ message?: string }>;
      const message =
        err.response?.data?.message ??
        err.message ??
        '계약서 업로드 중 오류가 발생했습니다.';
      setContractError(message);
    } finally {
      setIsContractAnalyzing(false);
    }
  };

  const handleContractSave = async () => {
    if (!contractAnalysis) {
      toast({
        title: '계약서 분석 필요',
        description: '계약서를 먼저 분석한 후 저장해 주세요.',
        variant: 'destructive',
      });
      return;
    }

    // Google Drive 파일 ID는 contractAnalysis 또는 contractFile에서 가져오기
    const googleDriveFileId = contractAnalysis.googleDriveFileId || contractFile?.id;
    const fileName = contractAnalysis.fileName ?? contractFile?.name ?? 'unknown';
    const fileMimeType = contractFile?.mimeType;
    const fileSize = contractFile?.size ? parseInt(contractFile.size, 10) : undefined;

    const payload = {
      googleDriveFileId: googleDriveFileId || undefined, // Google Drive 파일이 있는 경우만 전달
      originalFileName: fileName,
      fileMimeType: fileMimeType,
      fileSize: fileSize,
      contractNumber:
        contractAnalysis.core?.contractNumber ??
        contractAnalysis.draftOrders[0]?.to_contract_no ??
        undefined,
      rawResult: contractAnalysis.rawResult ?? null,
      notes: contractAnalysis.notes ?? null,
      draftOrders: contractAnalysis.draftOrders.map((order, index) => ({
        ...order,
        to_shipment_seq: order.to_shipment_seq ?? index + 1,
      })),
    };

    try {
      setIsContractSaving(true);
      await api.post('/trade/contracts/save', payload);
      setContractError('');
      toast({
        title: '계약서 저장 완료',
        description: '계약서 분석 결과와 스케줄이 저장되었습니다.',
      });
      await fetchSchedules();
      setContractAnalysis(null);
      setContractFile(null);
      setContractDrawerOpen(false);
    } catch (error) {
      console.error('계약서 저장 중 오류 발생:', error);
      const err = error as AxiosError<{ message?: string }>;
      const message =
        err.response?.data?.message ??
        err.message ??
        '계약서 저장 중 오류가 발생했습니다.';
      setContractError(message);
      toast({
        title: '계약서 저장 실패',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsContractSaving(false);
    }
  };

  // 정렬 변경 핸들러
  const handleSortChange = (newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
  };

  const invoiceSummaryContent = React.useMemo(() => {
    if (!invoiceAnalysisResult) {
      return null;
    }

    const invoiceData = currentInvoiceData;
    const payments = currentInvoicePayments;
    const currency = invoiceData.invoiceCurrencyName || invoiceData.invoiceCurrency || '';

    const formatAmount = (amount: number | null) =>
      amount != null ? `${currency} ${amount.toLocaleString()}` : '-';

    const expectedContractNo = invoiceAnalysisResult?.contractNumberExpected ?? invoiceSchedule?.contractNo ?? null;
    const extractedContractNo = invoiceAnalysisResult?.contractNumberExtracted ?? null;
    const contractMatched = invoiceAnalysisResult?.contractNumberMatched ?? true;

    return (
      <>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">송장 기본 정보</h3>
          {!contractMatched && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              분석된 계약번호가 스케줄의 계약번호와 일치하지 않습니다. 파일을 다시 확인해주세요.
            </div>
          )}
          <div className="rounded-md border border-border bg-background p-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <dt className="text-muted-foreground">스케줄 계약번호</dt>
                <dd className="text-sm font-medium text-foreground">
                  {expectedContractNo || '-'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">송장 분석 계약번호</dt>
                <dd
                  className={`text-sm font-medium ${
                    contractMatched ? 'text-foreground' : 'text-destructive'
                  }`}
                >
                  {extractedContractNo || '-'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">송장번호</dt>
                <dd className="text-sm font-medium text-foreground">{invoiceData.invoiceNumber || '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">송장일자</dt>
                <dd className="text-sm font-medium text-foreground">{invoiceData.invoiceDate || '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">통화</dt>
                <dd className="text-sm font-medium text-foreground">{invoiceData.invoiceCurrency || '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">총금액</dt>
                <dd className="text-sm font-medium text-foreground">{formatAmount(invoiceData.invoiceAmount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">총중량</dt>
                <dd className="text-sm font-medium text-foreground">
                  {invoiceData.invoiceWeight != null ? invoiceData.invoiceWeight.toLocaleString('ko-KR', {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  }) + ' MT' : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">단가</dt>
                <dd className="text-sm font-medium text-foreground">
                  {invoiceData.unitPrice != null ? invoiceData.unitPrice.toLocaleString() : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">도착지</dt>
                <dd className="text-sm font-medium text-foreground">
                  {resolveDestinationLabel(invoiceData.destination)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ETD</dt>
                <dd className="text-sm font-medium text-foreground">{invoiceData.etd || '-'}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">결제 스케줄</h3>
          <div className="rounded-md border border-border bg-background overflow-hidden">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">회차</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">결제 예정일</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">비율</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">금액</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">결제조건</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment, index) => (
                  <tr key={payment.sequence ?? index} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-foreground">{payment.sequence}차</td>
                    <td className="px-3 py-2 text-foreground">{payment.dueDate || '-'}</td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {payment.ratio != null ? `${payment.ratio}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {payment.amount != null ? formatAmount(payment.amount) : '-'}
                    </td>
                    <td className="px-3 py-2 text-foreground">{payment.method || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {invoiceAnalysisResult?.containers && invoiceAnalysisResult.containers.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">컨테이너 정보</h3>
            <div className="rounded-md border border-border bg-background">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-semibold text-foreground">컨테이너 번호</th>
                    <th className="px-3 py-2 text-right font-semibold text-foreground">중량 (MT)</th>
                    {invoiceAnalysisResult.containers?.some(c => c.unitPrice != null) && (
                      <th className="px-3 py-2 text-right font-semibold text-foreground">단가 (USD/MT)</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {invoiceAnalysisResult.containers?.map((container, index) => (
                    <tr key={container.containerNo ?? index} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-foreground">{container.containerNo || '-'}</td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {container.weight != null ? container.weight.toLocaleString('ko-KR', {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        }) : '-'}
                      </td>
                      {invoiceAnalysisResult.containers?.some(c => c.unitPrice != null) && (
                        <td className="px-3 py-2 text-right text-foreground">
                          {container.unitPrice != null ? container.unitPrice.toLocaleString('ko-KR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }) : '-'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </>
    );
  }, [invoiceAnalysisResult, currentInvoiceData, currentInvoicePayments, invoiceSchedule, resolveDestinationLabel]);

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
            <h1 className="text-2xl font-bold tracking-tight">스케줄 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              수입 스케줄을 확인하고 관리할 수 있습니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                try {
                  setSelectedSchedule(null);
                  setDrawerMode('create');
                  setDrawerOpen(true);
                } catch (error) {
                  console.error('스케줄 추가 버튼 클릭 오류:', error);
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              스케줄 추가
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setContractFile(null);
                setContractDrawerOpen(true);
              }}
            >
              <FileUp className="mr-2 h-4 w-4" />
              스케줄 추가 (계약서)
            </Button>
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
          filterControls={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex w-full items-center gap-2 md:w-auto">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  ETD 기간
                </Label>
            <DateRangePicker
              startDate={etdStartDate}
              endDate={etdEndDate}
              onChange={(start, end) => {
                setEtdStartDate(start);
                setEtdEndDate(end);
                setPage(1);
              }}
                  className="w-48 md:w-60"
            />
              </div>
              <div className="flex w-full items-center gap-2 md:w-auto">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                  담당
                </Label>
              <Select
                value={managerFilter || '__all__'}
                onValueChange={(value) => {
                  setManagerFilter(value === '__all__' ? '' : value);
                  setPage(1);
                }}
              >
                  <SelectTrigger className="w-48 md:w-60" size="sm">
                    <SelectValue placeholder="담당 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {managerUsers.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
            </div>
          }
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={handleVisibleColumnsChange}
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
        />
        )}
      </div>

      <ScheduleDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={(open) => {
          setDetailDrawerOpen(open);
          if (!open) {
            setSelectedScheduleForDetail(null);
          }
        }}
        schedule={selectedScheduleForDetail}
        onEdit={(schedule) => {
          setSelectedSchedule(schedule);
          setDrawerMode('edit');
          setDrawerOpen(true);
          setDetailDrawerOpen(false);
        }}
        onDelete={(schedule) => {
          setDeleteError('');
          setIsDeleting(false);
          setScheduleToDelete(schedule);
          setDeleteDialogOpen(true);
          setDetailDrawerOpen(false);
        }}
        labelResolvers={{
          grade: resolveGradeLabel,
          packingType: resolvePackingLabel,
          destination: resolveDestinationLabel,
          finalDestination: resolveFinalDestinationLabel,
        }}
      />

      <ScheduleFormDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedSchedule(null);
          } else if (drawerMode === 'edit' && selectedSchedule) {
            setDetailDrawerOpen(false);
          }
        }}
        schedule={selectedSchedule}
        mode={drawerMode}
        schedules={schedules}
        currentUserName={user?.name ?? null}
        onSubmit={async (data) => {
          const paymentsPayload =
            data.payments?.map((payment, index) => ({
              sequence: payment.sequence ?? index + 1,
              dueDate: payment.dueDate ?? null,
              ratio: payment.ratio ?? null,
              amount: payment.amount ?? null,
              method: payment.method ?? null,
              exchangeRate: payment.exchangeRate ?? null,
              result: payment.result ?? null,
            })) ?? [];

          if (drawerMode === 'create') {
            const toNullableString = (value?: string) =>
              value && value.trim().length > 0 ? value.trim() : null;
            const toNullableNumber = (value?: number) =>
              value !== undefined && value !== null && !Number.isNaN(value) ? value : null;

            const payload: Record<string, unknown> = {
              newOld: toNullableString(data.newOld),
              commissionMonth: toNullableString(data.commissionMonth),
              commissionDollar: toNullableString(data.commissionDollar),
              orderDate: toNullableString(data.orderDate),
              contractNo: toNullableString(data.contractNo),
              quota: toNullableString(data.quota),
              fumigation: toNullableString(data.fumigation),
              spot: toNullableString(data.spot),
              customsDuty: toNullableString(data.customsDuty),
              shipmentSeq: toNullableNumber(data.shipmentSeq),
              shippingLine: toNullableString(data.shippingLine),
              exportCountry: toNullableString(data.exportCountry),
              exporter: toNullableString(data.exporter),
              productName: toNullableString(data.product),
              quantity: toNullableNumber(data.qty),
              grade: toNullableString(data.grade),
              bk: toNullableString(data.bk),
              bl: toNullableString(data.bl),
              packingType: toNullableString(data.packingType),
              currency: toNullableString(data.currencyUnit),
              unitPrice: toNullableNumber(data.unitPrice),
              invoiceAmount: toNullableNumber(data.invoiceAmount),
              totalAmount: toNullableNumber(data.totalAmount),
              destination: toNullableString(data.destination),
              finalDestination: toNullableString(data.finalDestination),
              finalDestinationArrivalDate: toNullableString(data.finalDestinationArrivalDate),
              etd: toNullableString(data.etd),
              eta: toNullableString(data.eta),
              notes: toNullableString(data.notes),
              dm: toNullableString(data.dm),
              dt: toNullableString(data.dt),
              cb: toNullableString(data.cb),
              quarantineDate: toNullableString(data.quarantineDate),
              customsDate: toNullableString(data.customsDate),
              certificateRequest: toNullableString(data.certificateRequest),
              claim: toNullableString(data.claim),
              bankPickup: toNullableString(data.bankPickup),
              sto: toNullableString(data.sto),
              originalShipment: toNullableString(data.originalShipment),
              // 계약서 파일 정보 추가
              contractGoogleDriveFileId: data.googleDriveFileId || null,
              contractFileName: data.contractFileName || null,
              // 송장 파일 정보 추가
              invoiceGoogleDriveFileId: data.invoiceGoogleDriveFileId || null,
              invoiceFileName: data.invoiceFileName || null,
              // 제품 이미지 폴더 정보 추가
              productImagesFolderId: data.productImagesFolderId || null,
              productImagesFolderName: data.productImagesFolderName || null,
              payments: paymentsPayload.map((payment, index) => ({
                sequence: payment.sequence ?? index + 1,
                dueDate: payment.dueDate ?? null,
                ratio: toNullableNumber(
                  payment.ratio !== undefined && payment.ratio !== null
                    ? Number(payment.ratio)
                    : undefined,
                ),
                amount: toNullableNumber(
                  payment.amount !== undefined && payment.amount !== null
                    ? Number(payment.amount)
                    : undefined,
                ),
                method: toNullableString(payment.method ?? undefined),
                exchangeRate: toNullableNumber(
                  payment.exchangeRate !== undefined && payment.exchangeRate !== null
                    ? Number(payment.exchangeRate)
                    : undefined,
                ),
                result: toNullableString(payment.result ?? undefined),
              })),
            };

            try {
              await api.post('/trade/contracts/orders', payload);
              await fetchSchedules();
              toast({
                title: '스케줄 생성 성공',
                description: `${data.contractNo ?? '무계약'} 선적이 성공적으로 추가되었습니다.`,
              });
            } catch (error: any) {
              const responseMessage = error?.response?.data?.message;
              const fallbackMessage = '스케줄 생성 중 오류가 발생했습니다.';
              toast({
                title: '스케줄 생성 실패',
                description: Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? fallbackMessage,
                variant: 'destructive',
              });
              throw error;
            }
          } else if (selectedSchedule) {
            const scheduleId = selectedSchedule.id;
            const toNullableString = (value?: string) =>
              value && value.trim().length > 0 ? value.trim() : null;
            const toNullableNumber = (value?: number) =>
              value !== undefined && value !== null && !Number.isNaN(value) ? value : null;

            const payload: Record<string, unknown> = {
              newOld: toNullableString(data.newOld),
              commissionMonth: toNullableString(data.commissionMonth),
              commissionDollar: toNullableString(data.commissionDollar),
              orderDate: toNullableString(data.orderDate),
              contractNo: toNullableString(data.contractNo),
              quota: toNullableString(data.quota),
              fumigation: toNullableString(data.fumigation),
              spot: toNullableString(data.spot),
              customsDuty: toNullableString(data.customsDuty),
              shipmentSeq: toNullableNumber(data.shipmentSeq),
              shippingLine: toNullableString(data.shippingLine),
              exportCountry: toNullableString(data.exportCountry),
              exporter: toNullableString(data.exporter),
              productName: toNullableString(data.product),
              quantity: toNullableNumber(data.qty),
              grade: toNullableString(data.grade),
              bk: toNullableString(data.bk),
              bl: toNullableString(data.bl),
              packingType: toNullableString(data.packingType),
              currency: toNullableString(data.currencyUnit),
              unitPrice: toNullableNumber(data.unitPrice),
              invoiceAmount: toNullableNumber(data.invoiceAmount),
              totalAmount: toNullableNumber(data.totalAmount),
              destination: toNullableString(data.destination),
              finalDestination: toNullableString(data.finalDestination),
              finalDestinationArrivalDate: toNullableString(data.finalDestinationArrivalDate),
              etd: toNullableString(data.etd),
              eta: toNullableString(data.eta),
              notes: toNullableString(data.notes),
              dm: toNullableString(data.dm),
              dt: toNullableString(data.dt),
              cb: toNullableString(data.cb),
              quarantineDate: toNullableString(data.quarantineDate),
              customsDate: toNullableString(data.customsDate),
              certificateRequest: toNullableString(data.certificateRequest),
              claim: toNullableString(data.claim),
              bankPickup: toNullableString(data.bankPickup),
              sto: toNullableString(data.sto),
              originalShipment: toNullableString(data.originalShipment),
              // 계약서 파일 정보 추가
              contractGoogleDriveFileId: data.googleDriveFileId || null,
              contractFileName: data.contractFileName || null,
              // 송장 파일 정보 추가
              invoiceGoogleDriveFileId: data.invoiceGoogleDriveFileId || null,
              invoiceFileName: data.invoiceFileName || null,
              // 제품 이미지 폴더 정보 추가
              productImagesFolderId: data.productImagesFolderId || null,
              productImagesFolderName: data.productImagesFolderName || null,
              payments: paymentsPayload.map((payment, index) => ({
                sequence: payment.sequence ?? index + 1,
                dueDate: payment.dueDate ?? null,
                ratio: toNullableNumber(
                  payment.ratio !== undefined && payment.ratio !== null
                    ? Number(payment.ratio)
                    : undefined,
                ),
                amount: toNullableNumber(
                  payment.amount !== undefined && payment.amount !== null
                    ? Number(payment.amount)
                    : undefined,
                ),
                method: toNullableString(payment.method ?? undefined),
                exchangeRate: toNullableNumber(
                  payment.exchangeRate !== undefined && payment.exchangeRate !== null
                    ? Number(payment.exchangeRate)
                    : undefined,
                ),
                result: toNullableString(payment.result ?? undefined),
              })),
            };

            try {
              await api.put(`/trade/contracts/orders/${scheduleId}`, payload);
              await fetchSchedules();
              toast({
                title: '스케줄이 저장되었습니다.',
                description: `${data.contractNo ?? selectedSchedule.contractNo ?? '무계약'} 선적 정보가 업데이트되었습니다.`,
              });
            } catch (error) {
              throw error;
            }
          }
        }}
      />

      <Drawer
        open={trackingDrawerOpen}
        onOpenChange={setTrackingDrawerOpen}
        direction="right"
      >
        <DrawerContent className="h-full" style={{ width: '480px', maxWidth: '480px' }}>
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>선적 조회</DrawerTitle>
                <DrawerDescription>
                  SeaRates API를 통해 실시간 선적 정보를 확인합니다.
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b text-xs text-muted-foreground">
              <div className="flex flex-col gap-1">
                <span>
                  계약번호{' '}
                  <span className="font-semibold text-foreground">
                    {trackingSchedule?.contractNo || '-'}
                  </span>
                </span>
                <span>
                  선적 순번{' '}
                  <span className="font-semibold text-foreground">
                    {trackingSchedule?.shipmentSeq ? `${trackingSchedule.shipmentSeq}회차` : '-'}
                  </span>
                </span>
              </div>
              <div className="flex flex-col gap-1 text-right">
                <span>
                  수출사{' '}
                  <span className="font-semibold text-foreground">
                    {trackingSchedule?.exporter || '-'}
                  </span>
                </span>
                <span>
                  도착지{' '}
                  <span className="font-semibold text-foreground">
                    {resolveDestinationLabel(trackingSchedule?.destination)}
                  </span>
                </span>
              </div>
            </div>
            <div className="px-4 py-3 border-b text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>조회 기준</span>
                <span className="font-semibold text-foreground">
                  {trackingResult?.identifier
                    ? `${trackingResult.identifierType === 'BK' ? 'Booking' : 'B/L'} (${trackingResult.identifier})`
                    : trackingSchedule?.bl
                      ? `B/L (${trackingSchedule.bl})`
                      : trackingSchedule?.bk
                        ? `Booking (${trackingSchedule.bk})`
                        : '-'}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">선적 상태</span>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (trackingSchedule) {
                        void fetchTrackingResult(trackingSchedule);
                      }
                    }}
                    disabled={trackingLoading || !trackingSchedule}
                  >
                    {trackingLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {trackingResult ? '다시 조회' : '선적 조회'}
                  </Button>
                </div>
              </div>

              {trackingLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  선적 정보를 불러오는 중입니다...
                </div>
              ) : trackingError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {trackingError}
                </div>
              ) : trackingResult ? (
                <>
                  <div className="rounded-md border border-border bg-muted/10 px-3 py-3">
                    <dl className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">ETD</dt>
                        <dd className="font-medium text-foreground">
                          {trackingResult.etd || '정보 없음'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">ETA</dt>
                        <dd className="font-medium text-foreground">
                          {trackingResult.eta || '정보 없음'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">도착지</dt>
                        <dd className="font-medium text-foreground">
                          {trackingResult.etaDestination ||
                            resolveDestinationLabel(trackingSchedule?.destination, '정보 없음')}
                        </dd>
                      </div>
                      {trackingResult.identifier && (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">
                            조회 식별자
                          </dt>
                          <dd className="font-medium text-foreground">
                            {trackingResult.identifierType === 'BK' ? 'Booking' : 'B/L'} · {trackingResult.identifier}
                          </dd>
                        </div>
                      )}
                      {trackingResult.shippingLine && (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">선사</dt>
                          <dd className="font-medium text-foreground">
                            {trackingResult.shippingLine}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {trackingResult.usage &&
                    (trackingResult.usage.apiCalls || trackingResult.usage.uniqueShipments) && (
                      <div className="rounded-md border border-border bg-muted/10 px-3 py-3 text-xs space-y-2">
                        <h3 className="text-sm font-semibold text-foreground">API 사용량</h3>
                        {trackingResult.usage.apiCalls && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">API 호출</span>
                            <span className="font-medium text-foreground">
                              {formatUsageValue(trackingResult.usage.apiCalls.used)} /{' '}
                              {formatUsageValue(trackingResult.usage.apiCalls.total)}
                              {trackingResult.usage.apiCalls.remaining !== null &&
                                trackingResult.usage.apiCalls.remaining !== undefined && (
                                  <span className="text-muted-foreground ml-1">
                                    (잔여 {formatUsageValue(trackingResult.usage.apiCalls.remaining)})
                                  </span>
                                )}
                            </span>
                          </div>
                        )}
                        {trackingResult.usage.uniqueShipments && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">고유 선적</span>
                            <span className="font-medium text-foreground">
                              {formatUsageValue(trackingResult.usage.uniqueShipments.used)} /{' '}
                              {formatUsageValue(trackingResult.usage.uniqueShipments.total)}
                              {trackingResult.usage.uniqueShipments.remaining !== null &&
                                trackingResult.usage.uniqueShipments.remaining !== undefined && (
                                  <span className="text-muted-foreground ml-1">
                                    (잔여 {formatUsageValue(trackingResult.usage.uniqueShipments.remaining)})
                                  </span>
                                )}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                  {(trackingResult.blNumber ||
                    trackingResult.responseBlNumber ||
                    trackingResult.bookingNumber ||
                    trackingResult.responseBookingNumber) && (
                    <div className="rounded-md border border-border bg-background px-3 py-3 text-xs space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">식별자 정보</h3>
                      {(trackingResult.responseBlNumber || trackingResult.blNumber) && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">B/L 번호</span>
                          <span className="font-medium text-foreground">
                            {trackingResult.responseBlNumber || trackingResult.blNumber || '-'}
                          </span>
                        </div>
                      )}
                      {(trackingResult.responseBookingNumber || trackingResult.bookingNumber) && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Booking 번호</span>
                          <span className="font-medium text-foreground">
                            {trackingResult.responseBookingNumber || trackingResult.bookingNumber || '-'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">컨테이너</h3>
                    {trackingResult.containers && trackingResult.containers.length > 0 ? (
                      <div className="space-y-3">
                        {trackingResult.containers.map((container, index) => (
                          <div
                            key={`${container.containerNumber ?? index}-${index}`}
                            className="rounded-md border border-border bg-background px-3 py-2 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-foreground">
                                {container.containerNumber || `컨테이너 ${index + 1}`}
                              </div>
                              {container.weight && (
                                <span className="text-muted-foreground">{container.weight}</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <div>
                                <span className="text-muted-foreground">Gate Out</span>
                                <div className="text-foreground">
                                  {container.gateOutDate || '-'}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Detention</span>
                                <div className="text-foreground">
                                  {container.detentionDays != null
                                    ? `${container.detentionDays}일`
                                    : '-'}
                                </div>
                              </div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">마지막 이벤트</span>
                                <div className="text-foreground">
                                  {container.lastEvent || '-'}
                                </div>
                              </div>
                            </div>
                            {container.events && container.events.length > 0 && (
                              <details className="rounded border border-dashed border-border px-3 py-2">
                                <summary className="cursor-pointer text-muted-foreground">
                                  이벤트 타임라인 보기
                                </summary>
                                <ul className="mt-2 space-y-1">
                                  {container.events.map((event, eventIndex) => (
                                    <li key={`${event.date ?? eventIndex}-${eventIndex}`}>
                                      <div className="flex flex-col">
                                        <span className="font-medium text-foreground">
                                          {event.date || '-'}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {event.description || event.code || '이벤트 정보 없음'}
                                        </span>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-xs text-muted-foreground text-center">
                        컨테이너 정보가 없습니다.
                      </div>
                    )}
                  </div>

                  {trackingSaveError && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {trackingSaveError}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-sm text-muted-foreground text-center">
                  선적 정보를 조회하려면 상단의 <strong>선적 조회</strong> 버튼을 눌러주세요.
                </div>
              )}
            </div>
          </div>
          <DrawerFooter className="border-t">
            <DrawerClose asChild>
              <Button type="button" size="sm" variant="outline">
                닫기
              </Button>
            </DrawerClose>
            <Button
              type="button"
              size="sm"
              disabled={
                !trackingSchedule ||
                trackingLoading ||
                trackingSaving ||
                !!trackingError ||
                !trackingResult
              }
              onClick={() => {
                void handleApplyTracking();
              }}
            >
              {trackingSaving ? '반영 중...' : '스케줄에 반영'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer
        open={invoiceDrawerOpen}
        onOpenChange={handleInvoiceDrawerOpenChange}
        direction="right"
      >
        <DrawerContent className="h-full" style={{ width: '520px', maxWidth: '520px' }}>
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>송장 업로드/분석</DrawerTitle>
                <DrawerDescription>
                  송장 PDF를 업로드하고 분석 결과를 검토한 뒤 스케줄에 반영할 수 있습니다.
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b text-xs text-muted-foreground">
              <div className="flex flex-col gap-1">
                <span>
                  계약번호{' '}
                  <span className="font-semibold text-foreground">
                    {invoiceSchedule?.contractNo || '-'}
                  </span>
                </span>
                <span>
                  선적 순번{' '}
                  <span className="font-semibold text-foreground">
                    {invoiceSchedule?.shipmentSeq ? `${invoiceSchedule.shipmentSeq}회차` : '-'}
                  </span>
                </span>
              </div>
              <div className="flex flex-col gap-1 text-right">
                <span>
                  수출사{' '}
                  <span className="font-semibold text-foreground">
                    {invoiceSchedule?.exporter || '-'}
                  </span>
                </span>
                <span>
                  도착지{' '}
                  <span className="font-semibold text-foreground">
                    {resolveDestinationLabel(invoiceSchedule?.destination)}
                  </span>
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">송장 파일</h3>
                  {invoiceFile && invoiceFile.size && (
                    <span className="text-[11px] text-muted-foreground">
                      {(parseInt(invoiceFile.size, 10) / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setInvoiceFilePickerOpen(true)}
                    className="flex-1"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {invoiceFile ? '파일 변경' : '파일 선택'}
                  </Button>
                  {invoiceFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setInvoiceFilePreviewOpen(true)}
                      title="미리보기"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  구글 드라이브에서 PDF 형식의 송장을 선택한 뒤 <strong>분석</strong> 버튼을 누르면 GPT가 자동으로 값을 추출합니다.
                </p>
                {invoiceFile && (
                  <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{invoiceFile.name}</div>
                        {invoiceFile.size && (
                          <div className="text-muted-foreground">
                            {(parseInt(invoiceFile.size, 10) / 1024).toFixed(1)} KB
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-2"
                        onClick={() => setInvoiceFile(null)}
                        title="파일 제거"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
                {invoiceFileError && (
                  <div className="text-[11px] text-destructive">{invoiceFileError}</div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleInvoiceAnalyze}
                    disabled={invoiceAnalyzing || !invoiceFile}
                  >
                    {invoiceAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    분석
                  </Button>
                </div>
                {invoiceAnalysisMessage && (
                  <div className="text-[11px] text-muted-foreground whitespace-pre-line">
                    {invoiceAnalysisMessage}
                  </div>
                )}
                {invoiceNotes && (
                  <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                    {invoiceNotes}
                  </div>
                )}
              </section>

              {invoiceAnalysisResult ? (
                invoiceSummaryContent
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-sm text-muted-foreground text-center">
                  송장 파일을 업로드한 뒤 <strong>분석</strong> 버튼을 눌러 결과를 확인하세요.
                </div>
              )}
            </div>
          </div>
          <DrawerFooter className="border-t">
            {invoiceSaveMessage && (
              <div className="text-[11px] text-muted-foreground">{invoiceSaveMessage}</div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <DrawerClose asChild>
                <Button type="button" size="sm" variant="outline">
                  닫기
                </Button>
              </DrawerClose>
              <Button
                type="button"
                size="sm"
                onClick={handleInvoiceSave}
                disabled={invoiceSaving || !invoicePreview || invoiceContractMismatch}
              >
                {invoiceSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {invoiceSaving ? '저장 중...' : '송장 정보 저장'}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setScheduleToDelete(null);
            setDeleteError('');
            setIsDeleting(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>스케줄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 스케줄을 삭제하시겠습니까?
              <br />
              <strong>{scheduleToDelete?.product}</strong> ({scheduleToDelete?.contractNo})
              <br />
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
            {deleteError && (
              <p className="mt-2 text-sm text-destructive">{deleteError}</p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Drawer
        open={contractDrawerOpen}
        onOpenChange={(open) => {
          setContractDrawerOpen(open);
          if (!open) {
            setContractFile(null);
            setContractError('');
            setIsContractAnalyzing(false);
            setIsContractSaving(false);
          } else {
            setContractAnalysis(null);
            setContractError('');
          setContractInfo('');
          }
        }}
        direction="right"
      >
        <DrawerContent
          className="h-full"
          style={{ width: '75%', minWidth: '640px', maxWidth: '1080px' }}
        >
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DrawerTitle>계약서로 스케줄 추가</DrawerTitle>
                <DrawerDescription>
                  계약서를 업로드하면 자동으로 스케줄 정보가 추출되어 등록됩니다.
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-3">
                <Label htmlFor="contractFile" className="text-sm font-semibold">
                  계약서 파일
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setContractFilePickerOpen(true)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  구글 드라이브에서 파일 선택
                </Button>
                {contractFile && (
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium truncate">{contractFile.name}</span>
                      <span className="text-muted-foreground">
                        {contractFile.size ? `${(parseInt(contractFile.size, 10) / (1024 * 1024)).toFixed(2)} MB` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setContractFilePreviewOpen(true)}
                        title="미리보기"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setContractFile(null)}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">파일 제거</span>
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  구글 드라이브에서 PDF · DOC · 이미지 파일을 선택할 수 있습니다.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleContractAnalyze}
                    disabled={!contractFile || isContractAnalyzing}
                  >
                    {isContractAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    분석
                  </Button>
                </div>
                  {isContractAnalyzing && (
                  <p className="text-xs text-muted-foreground">계약서를 분석 중입니다…</p>
                  )}
                {contractError && (
                  <p className="text-sm text-destructive">{contractError}</p>
                )}
                {!contractError && contractInfo && (
                  <p className="text-sm text-muted-foreground">{contractInfo}</p>
                )}
              </div>
              {contractAnalysis && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">분석 결과</p>
                      <p className="text-xs text-muted-foreground">파일명: {contractAnalysis.fileName}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setContractAnalysis(null);
                        setContractInfo('');
                      }}
                    >
                      결과 지우기
                    </Button>
                  </div>
                  {contractAnalysis.message && (
                    <p className="text-sm text-muted-foreground">{contractAnalysis.message}</p>
                  )}
                  {contractAnalysis.preview && (
                    <details className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer text-foreground">추출된 텍스트 미리보기</summary>
                      <p className="mt-2 whitespace-pre-wrap break-words text-[11px]">{contractAnalysis.preview}</p>
                    </details>
                  )}
                  {draftOrders.length > 0 ? (
                    <div className="rounded-md border border-border bg-background">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              {draftColumns.map((column) => (
                                <th
                                  key={column}
                                  className={`px-3 py-2 font-medium text-muted-foreground ${
                                    typeof (draftOrders[0] as Record<string, unknown>)[column] ===
                                    'number'
                                      ? 'text-right'
                                      : 'text-left'
                                  }`}
                                >
                                  {draftKeyLabels[column] ?? column}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {draftOrders.map((draft, index) => (
                              <tr key={`${draft.to_contract_no}-${index}`}>
                                {draftColumns.map((column) => {
                                  const value = (draft as Record<string, unknown>)[column];
                                  let displayValue: string | number = '-';

                                  if (value !== undefined && value !== null && value !== '') {
                                    if (typeof value === 'number') {
                                      displayValue = Number.isFinite(value) ? value.toLocaleString() : value;
                                    } else if (Array.isArray(value)) {
                                      displayValue = value.join(', ');
                                    } else if (typeof value === 'object') {
                                      displayValue = JSON.stringify(value);
                                    } else {
                                      displayValue = String(value);
                                    }
                                  }

                                  const alignClass =
                                    typeof value === 'number' ? 'text-right' : 'text-left';

                                  return (
                                    <td
                                      key={`${column}-${index}`}
                                      className={`px-3 py-2 ${alignClass} ${
                                        column === 'to_contract_no' ? 'font-medium text-foreground' : ''
                                      }`}
                                    >
                                      {displayValue}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      추출된 선적 데이터가 없습니다. 계약서를 다시 확인해 주세요.
                    </p>
                  )}
                  {contractAnalysis.rawResult && (
                    <details className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer text-foreground">GPT 원본 응답 보기</summary>
                      <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[11px]">
                        {contractAnalysis.rawResult}
                    </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
          <DrawerFooter className="border-t">
            <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isContractAnalyzing || isContractSaving}
              >
                취소
              </Button>
            </DrawerClose>
            <Button
              type="button"
              size="sm"
              onClick={handleContractSave}
              disabled={!contractAnalysis || isContractSaving || isContractAnalyzing}
            >
              {isContractSaving ? '저장 중...' : '저장'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog
        open={copyDialogOpen}
        onOpenChange={(open) => {
          setCopyDialogOpen(open);
          if (!open) {
            setScheduleToCopy(null);
            setCopyError('');
            setCopyQuantity('1');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>주문 추가</AlertDialogTitle>
            <AlertDialogDescription>
              {scheduleToCopy ? (
                <>
                  계약번호 <span className="font-medium">{scheduleToCopy.contractNo}</span>에 주문을 추가합니다.
                  <br />
                  추가할 주문 개수를 입력하세요. 선적 순번은 자동으로 이어집니다.
                </>
              ) : (
                '주문을 추가할 스케줄을 선택해주세요.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="copyQuantity">
              추가할 주문 개수
            </label>
            <Input
              id="copyQuantity"
              type="number"
              min={1}
              max={50}
              value={copyQuantity}
              onChange={(event) => {
                setCopyQuantity(event.target.value);
                if (copyError) setCopyError('');
              }}
              autoFocus
            />
            {copyError && <p className="text-xs text-destructive">{copyError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleCopySchedules} disabled={isSchedulesLoading}>
              {isSchedulesLoading ? '추가 중...' : '추가'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 구글 드라이브 파일 선택기 - 계약서 */}
      <GoogleDriveFilePicker
        open={contractFilePickerOpen}
        onOpenChange={setContractFilePickerOpen}
        onSelect={(file) => {
          setContractFile(file);
          setContractError('');
        }}
        acceptMimeTypes={['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*']}
        title="계약서 파일 선택"
        description="구글 드라이브에서 계약서 파일을 선택하세요"
      />

      {/* 구글 드라이브 파일 선택기 - 송장 */}
      <GoogleDriveFilePicker
        open={invoiceFilePickerOpen}
        onOpenChange={setInvoiceFilePickerOpen}
        onSelect={handleInvoiceFileSelect}
        acceptMimeTypes={['application/pdf']}
        title="송장 파일 선택"
        description="구글 드라이브에서 송장 파일을 선택하세요"
      />

      {/* 계약서 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={contractFilePreviewOpen}
        onOpenChange={setContractFilePreviewOpen}
        file={contractFile}
      />

      {/* 송장 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={invoiceFilePreviewOpen}
        onOpenChange={setInvoiceFilePreviewOpen}
        file={invoiceFile}
      />

      {/* 스케줄 목록에서 계약서 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={scheduleContractFilePreviewOpen}
        onOpenChange={setScheduleContractFilePreviewOpen}
        file={scheduleContractFile}
      />
    </AppLayout>
  );
}

