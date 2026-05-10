'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, Plus, Trash2, Search, Phone, Building2, ChevronDown, FileText, ImagePlus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/use-mobile';
import { SalesDetail, useSalesDetail } from '@/lib/hooks/use-sales';
import { useCreateInvoice, useUpdateInvoice, CreateInvoiceDto, InvoiceItem, useInvoice, SalesInvoice } from '@/lib/hooks/use-invoices';
import { useQueries } from '@tanstack/react-query';
import api from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { SalesItemSelectDrawer, SalesItemForInvoice } from './sales-item-select-drawer';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCompanyInfo } from '@/lib/hooks/use-company-info';
import { useConsultationLookup } from '@/lib/hooks/use-consultations';
import { usePrepayments, PrepaymentListItem } from '@/lib/hooks/use-prepayments';
import { useCustomerLedger } from '@/lib/hooks/use-customer-ledger';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { useCustomer } from '@/lib/hooks/use-customers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(Number(value))) return '-';
  const numValue = Number(value);
  // 소수점 이하가 0이면 정수로 표시
  const hasDecimal = numValue % 1 !== 0;
  const actualDecimals = hasDecimal ? decimals : 0;
  return numValue.toLocaleString('ko-KR', {
    minimumFractionDigits: actualDecimals,
    maximumFractionDigits: actualDecimals,
  });
};

export interface InvoiceIssueDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesIds?: string[]; // 하위 호환성 위해 optional 유지
  customerId?: string; // 고객 ID (우선 사용)
  invoiceId?: string | null; // 수정 모드일 때 기존 invoice ID
  onSuccess?: () => void;
}

interface SupplierInfo {
  serialNumber: string;
  tel: string;
  businessRegistrationNumber: string;
  name: string;
  companyName: string;
  address: string;
}

interface RecipientInfo {
  phone: string;
  companyName: string;
  ceo: string;
}

interface CompanySearchResult {
  id: string;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
}

const MAX_INVOICE_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const INVOICE_ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/jpg,image/gif,image/webp';

async function deleteStorageImageIfPossible(path: string | null | undefined) {
  if (!path || typeof path !== 'string') return;
  const trimmed = path.trim();
  if (!trimmed.startsWith('trade-statements/')) return;
  try {
    await api.delete('/storage/file', { params: { path: trimmed } });
  } catch {
    // 버킷 정리 실패는 발행/수정 흐름을 막지 않음
  }
}

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return phone;
};

// 부가세 적용 여부를 포함한 확장 타입
type InvoiceItemWithVat = InvoiceItem & {
  // BL, 컨테이너, 패킹, 수출사명 등은 salesItem을 통해 조회
  bl?: string | null;
  containerNo?: string | null;
  vatApplied?: boolean;
  date?: string | null;
  specification?: string | null;
  exporterName?: string | null;
  packingName?: string | null;
  salesId?: string | null;
  customerName?: string | null;
};

export function InvoiceIssueDrawer({
  open,
  onOpenChange,
  salesIds,
  customerId,
  invoiceId,
  onSuccess,
}: InvoiceIssueDrawerProps) {
  const isMobile = useIsMobile();
  const createInvoiceMutation = useCreateInvoice();
  const updateInvoiceMutation = useUpdateInvoice();
  const lookupMutation = useConsultationLookup();
  const isEditMode = !!invoiceId;
  
  // 수정 모드일 때 기존 invoice 데이터 로드
  const { data: existingInvoice, isLoading: isLoadingInvoice } = useInvoice(
    isEditMode ? invoiceId ?? undefined : undefined
  );

  // customerId props에서 가져오기
  
  // 제품 코드 가져오기
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  
  // 패킹 타입 코드 가져오기
  const { data: packingCodes = [] } = useCodeMastersByGroup('PACKING_TYPE');
  
  // 회사 정보 가져오기
  const { data: companyInfo } = useCompanyInfo();
  
  // 공급자 목록 조회 (활성화된 공급자만)
  const { data: suppliers = [] } = useSuppliers({ status: true });
  
  // 제품 코드를 이름으로 변환
  const getProductName = (code?: string | null) => {
    if (!code) return '-';
    const product = productCodes.find((c) => c.value === code || c.name === code);
    return product?.name || code;
  };

  // 패킹 타입 코드를 축약 형태로 변환
  const getPackingAbbreviation = (packing?: string | null) => {
    if (!packing) return null;
    
    // 패킹 코드 값 확인 (대소문자 무시, 공백은 _ 와 동일 취급)
    const packingUpper = packing.toUpperCase();
    const packingKey = packingUpper.replace(/\s+/g, '_');

    if (packingKey === 'BIG_BALE') {
      return '빅';
    } else if (packingKey === 'SMALL_BALE') {
      return '스';
    } else if (packingKey === 'SLEEVE_BALE') {
      return '슬';
    } else if (packingKey === 'HEAVY_BALE' || packingKey === 'HEAVY_BALES') {
      return '헤';
    }

    // 코드가 아닌 경우, packingCodes에서 찾아서 코드 값 확인
    const packingCode = packingCodes.find((c) => 
      c.value === packing || c.name === packing || c.value === packingUpper
    );
    
    if (packingCode?.value) {
      const codeKey = packingCode.value.toUpperCase().replace(/\s+/g, '_');
      if (codeKey === 'BIG_BALE') {
        return '빅';
      } else if (codeKey === 'SMALL_BALE') {
        return '스';
      } else if (codeKey === 'SLEEVE_BALE') {
        return '슬';
      } else if (codeKey === 'HEAVY_BALE' || codeKey === 'HEAVY_BALES') {
        return '헤';
      }
    }
    
    // 매칭되지 않으면 원래 값 반환
    return packing;
  };

  // 품목명 생성: 수출사 + 제품명 + (패킹)
  const generateProductName = (item: InvoiceItemWithVat) => {
    const parts: string[] = [];
    
    // 수출사 정보 (item에 저장된 경우)
    const exporterName = (item as any).exporterName;
    if (exporterName) {
      parts.push(exporterName);
    }
    
    // 제품 코드를 이름으로 변환
    const productName = item.productName;
    const productNameLabel = getProductName(productName);
    if (productNameLabel && productNameLabel !== '-') {
      parts.push(productNameLabel);
    }
    
    // 패킹 정보를 괄호로 감싸서 추가
    const packingType = (item as any).packingName || item.specification || (item as any).packingType;
    if (packingType) {
      const packingAbbr = getPackingAbbreviation(packingType);
      if (packingAbbr) {
        parts.push(`(${packingAbbr})`);
      }
    }
    
    return parts.length > 0 ? parts.join(' ') : (productNameLabel || productName || '-');
  };
  
  // 여러 판매 정보 병렬 조회 (Drawer가 열려있고 salesIds가 있을 때만)
  const salesIdsArray = salesIds || [];
  const salesQueries = useQueries({
    queries: (open && salesIdsArray.length > 0) ? salesIdsArray.map((id) => ({
      queryKey: ['sales', 'detail', id],
      queryFn: async () => {
        const response = await api.get(`/sales/${id}`);
        return response.data as SalesDetail;
      },
      enabled: open && !!id,
    })) : [],
  });

  const isLoadingSales = salesIdsArray.length > 0 && salesQueries.some(query => query.isLoading);
  const salesList = salesQueries.map(query => query.data).filter((data): data is SalesDetail => !!data);

  const [invoiceNumber, setInvoiceNumber] = React.useState<string>(''); // 자동 생성되므로 입력 필드 제거
  const [issuedAt, setIssuedAt] = React.useState<string>(''); // 발행일시 (YYYY-MM-DDTHH:mm:ss 형식)
  const [notes, setNotes] = React.useState<string>('');
  const [attachmentImageUrl, setAttachmentImageUrl] = React.useState<string | null>(null);
  const [attachmentImagePath, setAttachmentImagePath] = React.useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = React.useState(false);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = React.useState(false);
  const attachmentInputRef = React.useRef<HTMLInputElement>(null);
  const [invoiceItems, setInvoiceItems] = React.useState<InvoiceItemWithVat[]>([]);
  const [vatApplied, setVatApplied] = React.useState<boolean>(false);
  const [vatRate, setVatRate] = React.useState<number>(10);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | undefined>(undefined);
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<number | undefined>(undefined);
  const [selectedStatementNameId, setSelectedStatementNameId] = React.useState<string | null>(null);
  
  // 수정 모드일 때 기존 invoice의 고객 ID도 고려
  const invoiceCustomerId = React.useMemo(() => {
    if (isEditMode && existingInvoice?.customer?.id) {
      return existingInvoice.customer.id;
    }
    return null;
  }, [isEditMode, existingInvoice]);
  
  // 고객 ID: 항목 선택으로 바뀐 고객(selectedCustomerId)이 있으면 props의 명세 고객(customerId)보다 우선
  // (수정 화면에서 customerId만 쓰면 발행용 이름·useCustomer가 예전 고객에 묶임)
  const finalCustomerId = (selectedCustomerId || customerId || invoiceCustomerId) ?? undefined;
  const { data: customerDetail } = useCustomer(finalCustomerId ?? undefined);
  const statementNames = customerDetail?.statementNames ?? [];

  // 고객 전환 후 이전 고객의 발행용 이름 id가 남으면 드롭다운 표시와 수취인 필드가 어긋남
  React.useEffect(() => {
    if (!customerDetail || !selectedStatementNameId) return;
    const names = customerDetail.statementNames ?? [];
    if (names.length === 0) {
      setSelectedStatementNameId(null);
      return;
    }
    const exists = names.some((s) => String(s.id) === String(selectedStatementNameId));
    if (!exists) {
      setSelectedStatementNameId(null);
    }
  }, [customerDetail, selectedStatementNameId]);

  const { data: prepaymentsResponse, refetch: refetchPrepayments } = usePrepayments({
    customerId: finalCustomerId,
    limit: 1000,
  });
  
  // 고객이 선택되면 선입금 정보 자동 조회
  React.useEffect(() => {
    if (finalCustomerId && open) {
      refetchPrepayments();
    }
  }, [finalCustomerId, open, refetchPrepayments]);
  
  // 선입금 목록 필터링
  // paymentStatus: 'REQUESTED' | 'CONFIRMED' | 'AVAILABLE' | 'REFUNDED' | 'CANCELLED'
  // deductionStatus: 'NOT_DEDUCTED' | 'DEDUCTED'
  const availablePrepayments = React.useMemo(() => {
    if (!prepaymentsResponse?.data) return [];
    return prepaymentsResponse.data.filter(
      (p) => {
        // 일반 모드: paymentStatus가 CONFIRMED 또는 AVAILABLE이고, 아직 차감되지 않은 것만
        if (!isEditMode) {
          return (
            (p.paymentStatus === 'CONFIRMED' || p.paymentStatus === 'AVAILABLE') &&
            p.deductionStatus !== 'DEDUCTED'
          );
        }
        // 수정 모드: CONFIRMED, AVAILABLE 상태이거나, 이미 차감된 것도 표시 (DEDUCTED 상태)
        return (
          p.paymentStatus === 'CONFIRMED' ||
          p.paymentStatus === 'AVAILABLE' ||
          p.deductionStatus === 'DEDUCTED'
        );
      }
    );
  }, [prepaymentsResponse, isEditMode]);
  
  // 거래명세서 항목의 salesId 수집
  const invoiceItemSalesIds = React.useMemo(() => {
    const salesIds = new Set<string>();
    invoiceItems.forEach((item) => {
      if (item.salesId) {
        salesIds.add(item.salesId);
      }
    });
    return Array.from(salesIds);
  }, [invoiceItems]);
  
  // 차감될 선입금 계산 (거래명세서 항목의 salesId에 연결된 선입금)
  const prepaymentDeductedAmount = React.useMemo(() => {
    if (invoiceItemSalesIds.length === 0 || availablePrepayments.length === 0) {
      return 0;
    }
    
    // 거래명세서 항목의 salesId에 연결된 선입금만 차감
    const relevantPrepayments = availablePrepayments.filter((p) =>
      invoiceItemSalesIds.includes(p.salesId)
    );
    
    return relevantPrepayments.reduce((sum, prepayment) => {
      const amount = prepayment.actualAmount
        ? prepayment.actualAmount
        : prepayment.prepaymentAmount;
      return sum + amount;
    }, 0);
  }, [availablePrepayments, invoiceItemSalesIds]);

  // 전일잔액: 거래처관리대장과 동일한 '현재 잔액' 사용 (발행 전이므로 이번 거래명세서 반영 전 잔액)
  const { data: ledgerData, isLoading: isLedgerLoading } = useCustomerLedger(finalCustomerId ?? undefined);
  const previousBalanceExpected = React.useMemo(() => {
    if (!finalCustomerId) return null;
    const currentBalance = ledgerData?.currentBalance ?? 0;
    return Number(currentBalance) - prepaymentDeductedAmount;
  }, [finalCustomerId, ledgerData?.currentBalance, prepaymentDeductedAmount]);

  // 판매 항목 선택 Dialog 상태
  const [salesItemDialogOpen, setSalesItemDialogOpen] = React.useState(false);
  const [salesItemDialogIndex, setSalesItemDialogIndex] = React.useState<number | null>(null);

  // 이미 거래명세서에 추가된 항목의 salesItemId 추출 (제외 목록)
  const excludedItemIds = React.useMemo(() => {
    const excludedIds: string[] = [];
    invoiceItems.forEach((item, index) => {
      // 수정 모드일 때는 현재 수정 중인 항목은 제외하지 않음
      if (salesItemDialogIndex === index) {
        return;
      }
      if (item.salesItemId) {
        excludedIds.push(item.salesItemId);
      }
    });
    return excludedIds;
  }, [invoiceItems, salesItemDialogIndex]);
  
  // 공급자 정보
  const [supplierInfo, setSupplierInfo] = React.useState<SupplierInfo>({
    serialNumber: '',
    tel: '',
    businessRegistrationNumber: '',
    name: '',
    companyName: '',
    address: '',
  });
  
  // 회사 정보가 로드되면 공급자 정보 업데이트
  React.useEffect(() => {
    if (companyInfo) {
      setSupplierInfo({
        serialNumber: '', // 일련번호는 거래명세서 번호이므로 제외
        tel: companyInfo.tel || '',
        businessRegistrationNumber: companyInfo.businessRegistrationNumber || '',
        name: companyInfo.representativeName || '',
        companyName: companyInfo.companyName || '',
        address: companyInfo.address || '',
      });
    }
  }, [companyInfo]);

  // 공급받는자 정보
  const [recipientInfo, setRecipientInfo] = React.useState<RecipientInfo>({
    phone: '',
    companyName: '',
    ceo: '',
  });

  // 업체 검색 관련 state
  const [companySearchOpen, setCompanySearchOpen] = React.useState(false);
  const [companySearchTerm, setCompanySearchTerm] = React.useState('');
  const [companySearchResults, setCompanySearchResults] = React.useState<CompanySearchResult[]>([]);
  const [companySearchLoading, setCompanySearchLoading] = React.useState(false);
  const [companySearchError, setCompanySearchError] = React.useState<string | null>(null);
  const [companySearchAttempted, setCompanySearchAttempted] = React.useState(false);

  // 전화번호 검색 상태
  const [phoneSearchOpen, setPhoneSearchOpen] = React.useState(false);
  const [phoneSearchTerm, setPhoneSearchTerm] = React.useState('');
  const [phoneSearchResults, setPhoneSearchResults] = React.useState<CompanySearchResult[]>([]);
  const [phoneSearchLoading, setPhoneSearchLoading] = React.useState(false);
  const [phoneSearchError, setPhoneSearchError] = React.useState<string | null>(null);
  const [phoneSearchAttempted, setPhoneSearchAttempted] = React.useState(false);

  // salesList 변경 추적을 위한 ref
  const salesListRef = React.useRef<string>('');

  // 발행용 이름 선택 시 recipientInfo 업데이트
  React.useEffect(() => {
    if (!selectedStatementNameId) return;
    const sn = statementNames.find((s) => s.id === selectedStatementNameId);
    if (!sn) return;
    setRecipientInfo({
      companyName: sn.companyName || sn.displayName || '',
      phone: sn.contactPhone || '',
      ceo: sn.displayName || '',
    });
  }, [selectedStatementNameId, statementNames]);

  // 고객 로드 시 발행용 이름 기본 선택 및 recipientInfo 초기화 (selectedStatementNameId가 null일 때만)
  React.useEffect(() => {
    if (!customerDetail || statementNames.length === 0 || selectedStatementNameId !== null) return;
    const defaultSn = statementNames.find((s) => s.isDefault) ?? statementNames[0];
    if (defaultSn) {
      setSelectedStatementNameId(defaultSn.id);
      setRecipientInfo({
        companyName: defaultSn.companyName || defaultSn.displayName || '',
        phone: defaultSn.contactPhone || '',
        ceo: defaultSn.displayName || '',
      });
    }
  }, [customerDetail?.id, statementNames.length, selectedStatementNameId]);

  // 발행 모드에서 Drawer가 열릴 때 발행일시 기본값을 현재 시각으로 설정 (전일잔액 표시를 위해)
  React.useEffect(() => {
    if (open && !isEditMode && !issuedAt) {
      setIssuedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"));
    }
  }, [open, isEditMode]); // issuedAt 제외해 초기 한 번만 오늘로 설정

  // Drawer가 닫힐 때 초기화
  React.useEffect(() => {
    if (!open) {
      // Drawer가 닫힐 때 모든 state 초기화
      setInvoiceNumber('');
      setIssuedAt('');
      setNotes('');
      setInvoiceItems([]);
      setVatApplied(false);
      setVatRate(10);
      setSelectedCustomerId(undefined);
      setSelectedSupplierId(undefined);
      setSelectedStatementNameId(null);
      setRecipientInfo({
        phone: '',
        companyName: '',
        ceo: '',
      });
      setCompanySearchOpen(false);
      setCompanySearchTerm('');
      setCompanySearchResults([]);
      setCompanySearchError(null);
      setCompanySearchAttempted(false);
      setPhoneSearchOpen(false);
      setPhoneSearchTerm('');
      setPhoneSearchResults([]);
      setPhoneSearchError(null);
      setPhoneSearchAttempted(false);
      setSalesItemDialogOpen(false);
      setSalesItemDialogIndex(null);
      salesListRef.current = '';
      setAttachmentImageUrl(null);
      setAttachmentImagePath(null);
      setAttachmentUploading(false);
      setAttachmentPreviewOpen(false);
    }
  }, [open]);

  // 수정 모드일 때 기존 invoice 데이터 로드
  React.useEffect(() => {
    if (isEditMode && existingInvoice && open) {
      console.log('[InvoiceIssueDrawer] 수정 모드 - 기존 invoice 데이터:', existingInvoice);

      // 수취인 정보: 발행 시점 스냅샷 우선, 없으면 customer fallback
      const inv = existingInvoice as { companyName?: string | null; ceo?: string | null; phone?: string | null; statementNameId?: string | null };
      const customer = existingInvoice.customer;
      const recipientInfoToSet = {
        phone: inv.phone ?? customer?.phone ?? '',
        companyName: inv.companyName ?? customer?.companyName ?? '',
        ceo: inv.ceo ?? customer?.ceo ?? '',
      };
      setRecipientInfo(recipientInfoToSet);
      setSelectedStatementNameId(inv.statementNameId ?? null);
      if (customer?.id) {
        setSelectedCustomerId(customer.id);
      }

      // 거래명세서 기본 정보 설정
      setInvoiceNumber(existingInvoice.invoiceNumber || '');
      // 발행일시 설정 (YYYY-MM-DDTHH:mm:ss 형식)
      if (existingInvoice.issuedAt) {
        const issuedDate = new Date(existingInvoice.issuedAt);
        setIssuedAt(format(issuedDate, "yyyy-MM-dd'T'HH:mm:ss"));
      } else {
        setIssuedAt('');
      }
      setNotes(existingInvoice.notes || '');
      setAttachmentImageUrl(existingInvoice.attachmentImageUrl ?? null);
      setAttachmentImagePath(existingInvoice.attachmentImagePath ?? null);
      setVatApplied(existingInvoice.vatApplied ?? false);
      setVatRate(existingInvoice.vatRate ?? 10);
      setSelectedSupplierId(existingInvoice.supplierId ?? undefined);

      // 거래명세서 항목 설정
      if (existingInvoice.items && existingInvoice.items.length > 0) {
        const sortedItems = [...existingInvoice.items].sort((a, b) => (a.order || 0) - (b.order || 0));
        const itemsWithVat: InvoiceItemWithVat[] = sortedItems.map((item) => {
          // 기존 항목의 고객 정보 가져오기 (salesItem.sales.customer에서)
          const customerName = item.salesItem?.sales?.customer?.companyName || null;
          // salesId도 가져오기 (고객 검증용)
          const salesId = item.salesItem?.sales?.id || null;
          
          // BL과 컨테이너 정보 가져오기 (salesItem.container에서)
          // BL은 salesItem.container.order.bl에서 가져오기
          const bl = item.salesItem?.container?.order?.bl || null;
          // 컨테이너 번호는 salesItem.container.containerNo에서 가져오기
          const containerNo = item.salesItem?.container?.containerNo || null;
          
          return {
            id: item.id,
            order: item.order || 1,
            salesItemId: item.salesItemId || null,
            productName: item.productName || '',
            quantity: item.quantity ?? undefined,
            unit: item.unit || '',
            unitPrice: item.unitPrice ?? undefined,
            amount: item.amount ?? undefined,
            vatAmount: item.vatAmount ?? undefined,
            weight: item.weight ?? undefined,
            notes: item.notes || null,
            // 고객 정보 추가 (고객 검증용)
            customerName: customerName,
            salesId: salesId,
            // BL과 컨테이너 정보 추가
            bl: bl,
            containerNo: containerNo,
          } as InvoiceItemWithVat & { customerName?: string | null; salesId?: string | null };
        });
        setInvoiceItems(itemsWithVat);
      }
    }
  }, [isEditMode, existingInvoice, open]);

  // 판매 정보 로드 시 거래명세서 항목 초기화 및 공급받는자 정보 설정 (수정 모드가 아닐 때만)
  React.useEffect(() => {
    // 수정 모드일 때는 기존 데이터를 사용하므로 이 로직을 건너뜀
    if (isEditMode) {
      return;
    }

    // salesList를 JSON으로 직렬화하여 이전 값과 비교
    const currentSalesListKey = JSON.stringify(salesList.map(s => ({
      id: s.id,
      productInfo: s.productInfo?.map(p => ({
        productName: p.productName,
        cargoWeight: p.cargoWeight,
        weight: p.weight,
        salesUnitPrice: p.salesUnitPrice,
        exporterName: p.exporterName,
        exporter: p.exporter,
        packingName: p.packingName,
        packingType: p.packingType,
      })),
      customer: s.customer ? {
        phone: s.customer.phone,
        companyName: s.customer.companyName,
        ceo: s.customer.ceo,
      } : null,
    })));

    // 이전 값과 동일하면 업데이트하지 않음
    if (salesListRef.current === currentSalesListKey) {
      return;
    }

    // 현재 값을 저장
    salesListRef.current = currentSalesListKey;

      if (salesList.length > 0) {
        // 공급받는자 정보 설정 (첫 번째 판매 기준)
        const firstSales = salesList[0];
        if (firstSales?.customer) {
          setRecipientInfo({
            phone: firstSales.customer.phone || '',
            companyName: firstSales.customer.companyName || '',
            ceo: firstSales.customer.ceo || '',
          });
          // 고객 ID 설정
          if (firstSales.customer.id) {
            setSelectedCustomerId(firstSales.customer.id);
          }
        }

      // 모든 판매의 항목을 거래명세서 항목으로 변환 (참고용)
      const today = new Date();
      const allItems: InvoiceItemWithVat[] = [];
      let order = 1;

      // productInfo에서 수출사 정보 가져오기
      salesList.forEach((sales) => {
        if (sales?.productInfo && sales.productInfo.length > 0) {
          sales.productInfo.forEach((product) => {
            const productName = product.productName || '-';
            // productInfo weight/cargoWeight는 DB 톤 단위 → 화면 kg로 표시 (×1000)
            const weightTon = product.cargoWeight ?? product.weight ?? undefined;
            const weightKg = weightTon != null ? weightTon * 1000 : undefined;
            const unitPrice = product.salesUnitPrice || undefined;
            const amount = weightKg != null && unitPrice != null ? weightKg * unitPrice : undefined;
            
            // productInfo에서 수출사 및 패킹 정보 가져오기
            const exporterName = product.exporterName || product.exporter || null;
            const packingName = product.packingName || product.packingType || null;
            
            // 제품 코드를 이름으로 변환
            const productNameLabel = getProductName(productName);
            
            // 품목명 생성: 수출사 + 제품명 + (패킹)
            const nameParts: string[] = [];
            if (exporterName) nameParts.push(exporterName);
            if (productNameLabel && productNameLabel !== '-') nameParts.push(productNameLabel);
            if (packingName) {
              const packingAbbr = getPackingAbbreviation(packingName);
              if (packingAbbr) {
                nameParts.push(`(${packingAbbr})`);
              }
            }
            const fullProductName = nameParts.join(' ');

            allItems.push({
              order: order++,
              productName: fullProductName || productName,
              specification: product.packingName || product.packingType || null,
              quantity: weightKg,
              unit: 'KG',
              unitPrice: unitPrice,
              amount: amount,
              notes: null,
              date: format(today, 'MM/dd', { locale: ko }),
              vatApplied: false, // 기본값: 부가세 미적용
              exporterName: exporterName,
              packingName: packingName,
              salesId: sales.id || null,
              customerName: sales.customer?.companyName || null,
            });
          });
        }
      });

      if (allItems.length > 0) {
        setInvoiceItems(allItems);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesList]);

  // invoiceItems 변경 시 고객 정보 자동 업데이트
  React.useEffect(() => {
    if (invoiceItems.length > 0) {
      // 첫 번째 항목의 salesId 또는 customerName으로 고객 정보 찾기
      const firstItem = invoiceItems[0];
      let salesWithCustomer: SalesDetail | undefined;

      if (firstItem.salesId) {
        salesWithCustomer = salesList.find(sales => sales.id === firstItem.salesId);
      } else if (firstItem.customerName) {
        salesWithCustomer = salesList.find(sales =>
          sales.customer?.companyName === firstItem.customerName
        );
      }

      if (salesWithCustomer?.customer) {
        const newCustomerId = salesWithCustomer.customer.id;
        const isNewCustomer = newCustomerId && newCustomerId !== selectedCustomerId;

        if (newCustomerId) {
          setSelectedCustomerId(newCustomerId);
        }

        // 고객이 바뀌었을 때만 recipientInfo 업데이트 (발행용 이름 선택은 customerDetail 로드 후 별도 처리)
        if (isNewCustomer) {
          setSelectedStatementNameId(null); // 새 고객이면 발행용 이름 선택 초기화
          setRecipientInfo({
            phone: salesWithCustomer.customer.phone || '',
            companyName: salesWithCustomer.customer.companyName || '',
            ceo: salesWithCustomer.customer.ceo || '',
          });
        }

        if (!newCustomerId && salesWithCustomer.customer.phone) {
          performLookup(salesWithCustomer.customer.phone);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceItems]);

  /** 수정 모드: 상세/관리에서 `salesIds` 없이 열면 salesList가 비어 항목 변경 시 수취인이 갱신되지 않음.
   *  고객 마스터·발행용 이름으로 수취인을 맞춤. 첫 항목의 고객명이 마스터와 다르면(다른 고객 혼입) 건드리지 않음. */
  const invoiceEditRecipientSyncKey = React.useMemo(() => {
    const fi = invoiceItems[0];
    if (!fi) return '';
    return `${fi.salesId ?? ''}|${fi.customerName ?? ''}`;
  }, [invoiceItems]);

  React.useEffect(() => {
    if (!isEditMode || !open || !customerDetail || !finalCustomerId) return;
    if (invoiceItems.length === 0) return;
    if (String(customerDetail.id) !== String(finalCustomerId)) return;

    const firstItem = invoiceItems[0];
    if (firstItem.customerName && firstItem.customerName !== customerDetail.companyName) {
      return;
    }

    const names = customerDetail.statementNames ?? [];
    if (selectedStatementNameId) {
      const sn = names.find((s) => s.id === selectedStatementNameId);
      if (sn) {
        setRecipientInfo({
          companyName: sn.companyName || sn.displayName || '',
          phone: sn.contactPhone || '',
          ceo: sn.displayName || '',
        });
      }
      return;
    }

    setRecipientInfo({
      phone: customerDetail.phone || '',
      companyName: customerDetail.companyName || '',
      ceo: customerDetail.ceo || '',
    });
  }, [
    isEditMode,
    open,
    invoiceEditRecipientSyncKey,
    customerDetail,
    finalCustomerId,
    selectedStatementNameId,
  ]);

  const handleAddItem = () => {
    // 항목 추가 버튼 클릭 시 바로 판매 항목 선택 drawer 열기
    setSalesItemDialogIndex(null); // null이면 새 항목 추가 모드
    setSalesItemDialogOpen(true);
  };

  const handleAddManualItem = () => {
    // 수동 입력 항목 추가 (빈 항목 생성)
    const today = format(new Date(), 'MM/dd', { locale: ko });
    const newItem: InvoiceItemWithVat = {
      order: invoiceItems.length + 1,
      productName: '',
      quantity: undefined,
      unit: '건',
      unitPrice: undefined,
      amount: undefined,
      notes: null,
      date: today,
      vatApplied: false,
      salesItemId: null, // 판매 항목과 연결 안 함
      salesId: null,
      customerName: null,
    };
    setInvoiceItems([...invoiceItems, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index).map((item, i) => ({
      ...item,
      order: i + 1,
    })));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem | 'vatApplied', value: any) => {
    const updatedItems = [...invoiceItems];
    const item = updatedItems[index];
    updatedItems[index] = { ...item, [field]: value };

    // 수량 또는 단가 변경 시 금액 자동 계산 (둘 다 있을 때만)
    // 공급가액을 직접 입력하는 경우는 자동 계산하지 않음
    if (field === 'quantity' || field === 'unitPrice') {
      const quantity = field === 'quantity' ? value : item.quantity;
      const unitPrice = field === 'unitPrice' ? value : item.unitPrice;
      
      // 숫자로 변환 (문자열이거나 null/undefined인 경우 처리)
      const quantityNum = quantity != null ? Number(quantity) : 0;
      const unitPriceNum = unitPrice != null ? Number(unitPrice) : 0;
      
      // 수량과 단가가 모두 있고 0이 아니면 곱셈으로 계산
      if (!isNaN(quantityNum) && !isNaN(unitPriceNum) && quantityNum !== 0 && unitPriceNum !== 0) {
        updatedItems[index].amount = quantityNum * unitPriceNum;
      } else {
        // 수량이나 단가가 없으면 공급가액은 직접 입력하거나 유지
        // 자동으로 초기화하지 않음 (공급가액 직접 입력 가능)
      }
    }

    setInvoiceItems(updatedItems);
  };

  const calculateTotals = () => {
    // 공급가액 계산 (숫자 변환 보장)
    const subtotal = invoiceItems.reduce((sum, item) => {
      const amount = item.amount != null ? Number(item.amount) : 0;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    
    // 부가세 계산 (거래명세서 레벨에서 부가세 적용 시)
    const vat = vatApplied
      ? invoiceItems.reduce((sum, item) => {
          if (item.amount != null) {
            const amount = Number(item.amount);
            if (!isNaN(amount)) {
              return sum + Math.round(amount * (vatRate / 100));
            }
          }
          return sum;
        }, 0)
      : 0;
    
    const total = subtotal + vat;
    return { subtotal, vat, total };
  };

  const handleSubmit = async () => {
    if (invoiceItems.length === 0) {
      return;
    }

    console.log('[InvoiceIssueDrawer] handleSubmit - customerId:', {
      customerId,
      selectedCustomerId,
      invoiceCustomerId,
      finalCustomerId,
      recipientInfo,
    });

    if (!finalCustomerId) {
      toast({
        title: '고객 정보 필요',
        description: '거래명세서를 발행하려면 고객 정보가 필요합니다. 고객을 선택하거나 전화번호로 조회해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // 발행일시 필수 검증 (발행 모드에서만)
    if (!isEditMode && !issuedAt) {
      toast({
        title: '발행일시 필요',
        description: '거래명세서를 발행하려면 발행일시를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // 공급자 선택 필수 검증
    if (!selectedSupplierId) {
      toast({
        title: '공급자 선택 필요',
        description: '거래명세서를 발행하려면 공급자를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // 부가세 계산 (부가세 적용 시)
    const itemsForSubmit: InvoiceItem[] = invoiceItems.map((item) => {
      const itemVatAmount = vatApplied && item.amount 
        ? Math.round(item.amount * (vatRate / 100))
        : 0;
      
      const salesItemId = item.salesItemId || null;
      console.log('[InvoiceIssueDrawer] handleSubmit - 항목별 salesItemId:', {
        order: item.order,
        productName: item.productName,
        salesItemId,
        item: item,
      });
      
      return {
        order: item.order,
        salesItemId: salesItemId,
        productName: item.productName || null,
        quantity: item.quantity ?? null, // null/undefined만 null로, 0은 0으로 유지
        unit: item.unit || null,
        unitPrice: item.unitPrice ?? null, // null/undefined만 null로, 0은 0으로 유지
        amount: item.amount ?? null, // null/undefined만 null로, 음수도 제대로 전달
        vatAmount: itemVatAmount || null,
        weight: item.weight ?? null, // null/undefined만 null로, 0은 0으로 유지
        notes: item.notes || null,
      };
    });
    
    const dto: CreateInvoiceDto = {
      customerId: finalCustomerId,
      invoiceNumber: isEditMode ? invoiceNumber || null : null, // 수정 모드에서는 기존 번호 유지, 발행 모드에서는 자동 생성
      issuedAt: issuedAt || null, // 발행일시 (YYYY-MM-DDTHH:mm:ss 형식)
      items: itemsForSubmit,
      notes: notes || null,
      vatApplied: vatApplied,
      vatRate: vatRate,
      supplierId: selectedSupplierId || null,
      statementNameId: selectedStatementNameId || null,
      companyName: recipientInfo.companyName || null,
      ceo: recipientInfo.ceo || null,
      phone: recipientInfo.phone || null,
      attachmentImageUrl: attachmentImageUrl ?? null,
      attachmentImagePath: attachmentImagePath ?? null,
    };

    try {
      if (isEditMode && invoiceId) {
        // 수정 모드
        await updateInvoiceMutation.mutateAsync({ id: invoiceId, data: dto });
      } else {
        // 생성 모드
        await createInvoiceMutation.mutateAsync(dto);
      }
      onSuccess?.();
      onOpenChange(false);
      // 초기화
      setInvoiceNumber('');
      setIssuedAt('');
      setNotes('');
      setInvoiceItems([]);
      setVatApplied(false);
      setVatRate(10);
      setSelectedCustomerId(undefined);
      setSelectedSupplierId(undefined);
      setAttachmentImageUrl(null);
      setAttachmentImagePath(null);
    } catch (error) {
      // 에러는 mutation에서 처리
    }
  };

  const handleInvoiceAttachmentChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
      if (!allowed.includes(file.type)) {
        toast({
          title: '형식 오류',
          description: 'PNG, JPEG, GIF, WebP 이미지만 첨부할 수 있습니다.',
          variant: 'destructive',
        });
        return;
      }
      if (file.size > MAX_INVOICE_ATTACHMENT_BYTES) {
        toast({
          title: '용량 초과',
          description: `이미지는 ${MAX_INVOICE_ATTACHMENT_BYTES / 1024 / 1024}MB 이하로 선택해 주세요.`,
          variant: 'destructive',
        });
        return;
      }
      const previousPath = attachmentImagePath;
      setAttachmentUploading(true);
      try {
        const formData = new FormData();
        const safeName =
          file.name.replace(/[^\w.\-가-힣]/g, '_').replace(/_+/g, '_') || 'attachment';
        const fileName = safeName.includes('.') ? safeName : `${safeName}.jpg`;
        formData.append('file', file, fileName);
        const uploadResponse = await api.post<{ success: boolean; url: string; path: string }>(
          '/storage/upload/image',
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        if (!uploadResponse.data.success || !uploadResponse.data.url) {
          throw new Error('업로드 실패');
        }
        if (previousPath && previousPath !== uploadResponse.data.path) {
          await deleteStorageImageIfPossible(previousPath);
        }
        setAttachmentImageUrl(uploadResponse.data.url);
        setAttachmentImagePath(uploadResponse.data.path);
        toast({ title: '첨부 완료', description: '이미지가 저장되었습니다. 발행/저장 시 거래명세서에 반영됩니다.' });
      } catch {
        toast({
          title: '업로드 실패',
          description: '이미지 업로드에 실패했습니다.',
          variant: 'destructive',
        });
      } finally {
        setAttachmentUploading(false);
      }
    },
    [attachmentImagePath]
  );

  const handleRemoveInvoiceAttachment = React.useCallback(async () => {
    await deleteStorageImageIfPossible(attachmentImagePath ?? undefined);
    setAttachmentImageUrl(null);
    setAttachmentImagePath(null);
  }, [attachmentImagePath]);

  const { subtotal, vat, total } = calculateTotals();

  // 업체 검색 핸들러
  const resetCompanySearchState = React.useCallback(() => {
    setCompanySearchResults([]);
    setCompanySearchError(null);
    setCompanySearchTerm('');
    setCompanySearchLoading(false);
    setCompanySearchAttempted(false);
  }, []);

  const handleCompanySearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setCompanySearchOpen(nextOpen);
      if (!nextOpen) {
        resetCompanySearchState();
      }
    },
    [resetCompanySearchState],
  );

  const handleCompanySearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const keyword = companySearchTerm.trim();
      if (keyword.length < 2) {
        setCompanySearchError('두 글자 이상 입력해주세요.');
        setCompanySearchResults([]);
        setCompanySearchAttempted(false);
        return;
      }
      setCompanySearchAttempted(true);
      setCompanySearchLoading(true);
      setCompanySearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/company', {
          params: { keyword },
        });
        setCompanySearchResults(response.data);
        if (response.data.length === 0) {
          setCompanySearchError('일치하는 업체가 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        setCompanySearchError(message);
        setCompanySearchResults([]);
      } finally {
        setCompanySearchLoading(false);
      }
    },
    [companySearchTerm],
  );


  // 전화번호 검색 핸들러
  const resetPhoneSearchState = React.useCallback(() => {
    setPhoneSearchResults([]);
    setPhoneSearchError(null);
    setPhoneSearchTerm('');
    setPhoneSearchLoading(false);
    setPhoneSearchAttempted(false);
  }, []);

  const handlePhoneSearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setPhoneSearchOpen(nextOpen);
      if (!nextOpen) {
        resetPhoneSearchState();
      }
    },
    [resetPhoneSearchState],
  );

  const handlePhoneSearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const phone = phoneSearchTerm.trim();
      if (!phone) {
        setPhoneSearchError('전화번호를 입력해주세요.');
        setPhoneSearchResults([]);
        setPhoneSearchAttempted(false);
        return;
      }
      setPhoneSearchAttempted(true);
      setPhoneSearchLoading(true);
      setPhoneSearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/phone', {
          params: { phone },
        });
        setPhoneSearchResults(response.data);
        if (response.data.length === 0) {
          setPhoneSearchError('일치하는 고객이 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        setPhoneSearchError(message);
        setPhoneSearchResults([]);
      } finally {
        setPhoneSearchLoading(false);
      }
    },
    [phoneSearchTerm],
  );

  // 전화번호로 고객 정보 조회
  const performLookup = React.useCallback(
    async (rawPhone: string) => {
      const phoneValue = rawPhone?.trim().replace(/[^0-9]/g, '');
      if (!phoneValue || phoneValue.length < 3) {
        return;
      }
      try {
        const result = await lookupMutation.mutateAsync(phoneValue);
        if (result.customer) {
          setRecipientInfo({
            phone: result.customer.phone || '',
            companyName: result.customer.companyName || '',
            ceo: result.customer.ceo || '',
          });
          // 고객 ID 설정
          if (result.customer.id) {
            setSelectedCustomerId(result.customer.id);
          }
        }
      } catch (error: unknown) {
        // 조회 실패 시 무시 (고객이 없을 수 있음)
        console.error('고객 조회 오류:', error);
      }
    },
    [lookupMutation],
  );

  const handleSelectPhone = React.useCallback(
    (item: CompanySearchResult) => {
      handlePhoneSearchOpenChange(false);
      // 고객 ID 설정
      if (item.id) {
        setSelectedCustomerId(item.id);
      }
      if (item.phone) {
        const formattedPhone = formatPhone(item.phone);
        setRecipientInfo({
          phone: formattedPhone,
          companyName: item.companyName || '',
          ceo: item.ceo || '',
        });
        // 같은 전화번호를 가진 여러 고객이 있을 때 performLookup은 첫 번째 고객만 반환.
        // 검색 결과에서 사용자가 선택한 고객(item)을 그대로 사용.
      } else {
        setRecipientInfo({
          phone: '',
          companyName: item.companyName || '',
          ceo: item.ceo || '',
        });
      }
    },
    [handlePhoneSearchOpenChange],
  );

  const handleSelectCompany = React.useCallback(
    (item: CompanySearchResult) => {
      handleCompanySearchOpenChange(false);
      // 고객 ID 설정
      if (item.id) {
        setSelectedCustomerId(item.id);
      }
      if (item.phone) {
        const formattedPhone = formatPhone(item.phone);
        setRecipientInfo({
          phone: formattedPhone,
          companyName: item.companyName || '',
          ceo: item.ceo || '',
        });
        // 같은 전화번호를 가진 여러 고객(예: 자은목장, 은희목장)이 있을 때
        // performLookup(phone)은 DB에서 첫 번째 고객만 반환해 잘못된 고객으로 덮어쓸 수 있음.
        // 검색 결과에서 선택한 고객(item)을 그대로 사용.
      } else {
        setRecipientInfo({
          phone: '',
          companyName: item.companyName || '',
          ceo: item.ceo || '',
        });
      }
    },
    [handleCompanySearchOpenChange],
  );

  // 텍스트 선택을 위한 핸들러
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    e.stopPropagation();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (salesItemDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSalesItemDialogOpen(false);
        setSalesItemDialogIndex(null);
        return;
      }
      if (companySearchOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCompanySearchOpenChange(false);
        return;
      }
      if (phoneSearchOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handlePhoneSearchOpenChange(false);
        return;
      }
      if (attachmentPreviewOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setAttachmentPreviewOpen(false);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    open,
    onOpenChange,
    salesItemDialogOpen,
    companySearchOpen,
    phoneSearchOpen,
    attachmentPreviewOpen,
    handleCompanySearchOpenChange,
    handlePhoneSearchOpenChange,
  ]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent 
        className="h-full flex flex-col"
        style={{ 
          width: isMobile ? '100%' : '1200px',
          maxWidth: '95vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>{isEditMode ? '거래명세서 수정' : '거래명세서 발행'}</DrawerTitle>
              <DrawerDescription>
                {isEditMode 
                  ? '발행된 거래명세서를 수정합니다.'
                  : '하차완료된 배송에 대한 거래명세서를 발행합니다.'}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
          {isLoadingSales || (isEditMode && isLoadingInvoice) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* 공급자 선택 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">공급자 선택</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplierSelect">
                      공급자 선택 <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={selectedSupplierId ? String(selectedSupplierId) : undefined}
                      onValueChange={(value) => {
                        if (value && value !== '__no_suppliers__') {
                          setSelectedSupplierId(Number(value));
                        } else {
                          setSelectedSupplierId(undefined);
                        }
                      }}
                    >
                      <SelectTrigger id="supplierSelect">
                        <SelectValue placeholder="공급자를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.length === 0 ? (
                          <SelectItem value="__no_suppliers__" disabled>
                            등록된 공급자가 없습니다
                          </SelectItem>
                        ) : (
                          suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={String(supplier.id)}>
                              {supplier.companyName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {selectedSupplierId && (
                  <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md">
                    {(() => {
                      const supplier = suppliers.find(s => s.id === selectedSupplierId);
                      if (!supplier) return null;
                      return (
                        <div className="space-y-1">
                          <div>대표자: {supplier.representativeName}</div>
                          <div>사업자등록번호: {supplier.businessRegistrationNumber}</div>
                          <div>전화번호: {formatPhone(supplier.tel)}</div>
                          <div>주소: {supplier.address}</div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </section>

              <Separator />

              {/* 고객 정보 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">고객 정보</h3>
                {statementNames.length > 0 && finalCustomerId && (
                  <div className="space-y-2">
                    <Label>발행용 이름</Label>
                    <Select
                      value={selectedStatementNameId ?? (statementNames.find((s) => s.isDefault)?.id ?? statementNames[0]?.id ?? '')}
                      onValueChange={(value) => {
                        setSelectedStatementNameId(value);
                        const sn = statementNames.find((s) => s.id === value);
                        if (sn) {
                          setRecipientInfo({
                            companyName: sn.companyName || sn.displayName || '',
                            phone: sn.contactPhone || '',
                            ceo: sn.displayName || '',
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="w-full max-w-sm">
                        <SelectValue placeholder="발행용 이름 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {statementNames.map((sn) => (
                          <SelectItem key={sn.id} value={sn.id}>
                            {sn.companyName && `${sn.companyName} / `}{sn.displayName}
                            {sn.contactPhone ? ` · ${formatPhone(sn.contactPhone)}` : ''}
                            {sn.isDefault ? ' (기본)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">거래명세서에 표기할 고객명·연락처를 선택하세요.</p>
                  </div>
                )}
                {/* 기본 정보 */}
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipientPhone">전화번호</Label>
                    <div className="flex gap-2">
                      <Input
                        id="recipientPhone"
                        value={formatPhone(recipientInfo.phone)}
                        onChange={(e) => {
                          if (isEditMode) return;
                          const digits = e.target.value.replace(/[^0-9]/g, '');
                          setRecipientInfo({ ...recipientInfo, phone: digits });
                        }}
                        onBlur={(e) => {
                          if (isEditMode) return;
                          const phone = e.target.value.replace(/[^0-9]/g, '');
                          if (phone && phone.length >= 3) {
                            performLookup(phone);
                          }
                        }}
                        placeholder="010-1234-5678"
                        disabled={isEditMode}
                        readOnly={isEditMode}
                      />
                      {!isEditMode && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            if (recipientInfo.phone) {
                              setPhoneSearchTerm(formatPhone(recipientInfo.phone));
                            }
                            setPhoneSearchOpen(true);
                          }}
                          title="전화번호로 검색"
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipientCompanyName">업체명 / 농장명</Label>
                    <div className="flex gap-2">
                      <Input
                        id="recipientCompanyName"
                        value={recipientInfo.companyName}
                        onChange={(e) => {
                          if (isEditMode) return;
                          setRecipientInfo({ ...recipientInfo, companyName: e.target.value });
                        }}
                        placeholder="업체명 또는 농장명"
                        disabled={isEditMode}
                        readOnly={isEditMode}
                      />
                      {!isEditMode && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            if (recipientInfo.companyName) {
                              setCompanySearchTerm(recipientInfo.companyName);
                            }
                            setCompanySearchOpen(true);
                          }}
                          title="업체명으로 검색"
                        >
                          <Building2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipientCeo">대표자</Label>
                    <Input
                      id="recipientCeo"
                      value={recipientInfo.ceo}
                      onChange={(e) => {
                        if (isEditMode) return;
                        setRecipientInfo({ ...recipientInfo, ceo: e.target.value });
                      }}
                      placeholder="대표자명"
                      disabled={isEditMode}
                      readOnly={isEditMode}
                    />
                  </div>
                </div>
              </section>

              <Separator />

              {/* 거래명세서 기본 정보 (발행 모드에서만 표시) */}
              {!isEditMode && (
                <>
                  <section className="space-y-2.5">
                    <h3 className="text-sm font-semibold text-foreground">거래명세서 기본 정보</h3>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="issuedAt">
                          발행일시 <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="issuedAt"
                          type="datetime-local"
                          step={1}
                          value={issuedAt || ''}
                          onChange={(e) => setIssuedAt(e.target.value || '')}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          거래명세서 번호는 발행일시 기준으로 자동 생성됩니다.
                        </p>
                      </div>
                    </div>
                  </section>

                  <Separator />
                </>
              )}

              {/* 선입금 정보 */}
              {finalCustomerId && (
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">선입금 정보</h3>
                  {availablePrepayments.length > 0 ? (
                    <div className="space-y-2">
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-24">판매번호</TableHead>
                              <TableHead className="w-32">판매일</TableHead>
                              <TableHead className="w-32">청구액</TableHead>
                              <TableHead className="w-32">실제입금액</TableHead>
                              <TableHead className="w-24">상태</TableHead>
                              <TableHead className="w-32">차감여부</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {availablePrepayments.map((prepayment) => {
                              const willBeDeducted = invoiceItemSalesIds.includes(prepayment.salesId);
                              return (
                                <TableRow key={prepayment.id}>
                                  <TableCell className="text-sm">{prepayment.salesId || '-'}</TableCell>
                                  <TableCell className="text-sm">
                                    {prepayment.salesDate || prepayment.reservationDate || '-'}
                                  </TableCell>
                                  <TableCell className="text-sm text-right">
                                    {formatNumber(prepayment.prepaymentAmount, 0)}원
                                  </TableCell>
                                  <TableCell className="text-sm text-right">
                                    {prepayment.actualAmount
                                      ? formatNumber(prepayment.actualAmount, 0) + '원'
                                      : '-'}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={
                                        prepayment.deductionStatus === 'DEDUCTED'
                                          ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300'
                                          : prepayment.paymentStatus === 'CONFIRMED'
                                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                                          : prepayment.paymentStatus === 'AVAILABLE'
                                          ? 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300'
                                          : ''
                                      }
                                    >
                                      {prepayment.deductionStatus === 'DEDUCTED'
                                        ? '차감됨'
                                        : prepayment.paymentStatus === 'CONFIRMED'
                                        ? '입금확인'
                                        : prepayment.paymentStatus === 'AVAILABLE'
                                        ? '사용가능'
                                        : prepayment.paymentStatus || '-'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {willBeDeducted ? (
                                      <Badge variant="outline" className="border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300">
                                        차감예정
                                      </Badge>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      {prepaymentDeductedAmount > 0 && (
                        <div className="text-sm text-muted-foreground">
                          * 거래명세서 발행 시 <span className="font-semibold text-foreground">{formatNumber(prepaymentDeductedAmount, 0)}원</span>이 자동으로 차감됩니다.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      사용 가능한 선입금이 없습니다.
                    </div>
                  )}
                </section>
              )}

              {finalCustomerId && <Separator />}

              {/* 부가세 설정 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">부가세 설정</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={vatApplied}
                        onCheckedChange={setVatApplied}
                      />
                      <Label htmlFor="vatApplied">부가세 적용</Label>
                    </div>
                  </div>
                  {vatApplied && (
                    <div className="space-y-2">
                      <Label htmlFor="vatRate">부가세율 (%)</Label>
                      <NumberInput
                        id="vatRate"
                        value={vatRate}
                        onChange={(value) => setVatRate(value ?? 10)}
                        decimals={2}
                        min={0}
                        max={100}
                        placeholder="10.00"
                      />
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* 거래명세서 항목 */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">거래명세서 항목</h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-1" />
                        항목 추가
                        <ChevronDown className="h-4 w-4 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleAddItem}>
                        <FileText className="h-4 w-4 mr-2" />
                        판매 항목 선택
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleAddManualItem}>
                        <Plus className="h-4 w-4 mr-2" />
                        수동 입력
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">순서</TableHead>
                        <TableHead>품목명</TableHead>
                        <TableHead className="w-24">BL</TableHead>
                        <TableHead className="w-32">컨테이너</TableHead>
                        <TableHead className="w-36">수량(단위 포함)</TableHead>
                        <TableHead className="w-24">단가</TableHead>
                        <TableHead className="w-32">공급가액</TableHead>
                        <TableHead className="w-24">부가세</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            거래명세서 항목을 추가하세요
                          </TableCell>
                        </TableRow>
                      ) : (
                        invoiceItems.map((item, index) => {
                          return (
                            <TableRow key={index}>
                              <TableCell>{item.order}</TableCell>
                              <TableCell>
                                <Input
                                  value={item.productName || ''}
                                  onChange={(e) =>
                                    handleItemChange(index, 'productName', e.target.value)
                                  }
                                  placeholder="품목명"
                                  className="flex-1"
                                />
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {item.bl || '-'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {item.containerNo || '-'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <NumberInput
                                    value={item.quantity}
                                    onChange={(value) => handleItemChange(index, 'quantity', value)}
                                    decimals={4}
                                    placeholder="0"
                                    className="flex-1"
                                  />
                                  <Input
                                    value={item.unit || ''}
                                    onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                                    placeholder="KG"
                                    className="w-12"
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <NumberInput
                                  value={item.unitPrice}
                                  onChange={(value) =>
                                    handleItemChange(index, 'unitPrice', value)
                                  }
                                  decimals={2}
                                  allowNegative={true}
                                  placeholder="0"
                                />
                              </TableCell>
                              <TableCell>
                                <NumberInput
                                  value={item.amount}
                                  onChange={(value) => handleItemChange(index, 'amount', value)}
                                  decimals={2}
                                  allowNegative={true}
                                  placeholder="0"
                                />
                              </TableCell>
                              <TableCell>
                                <div className="text-sm font-medium">
                                  {vatApplied && item.amount != null
                                    ? formatNumber(Math.round(Number(item.amount) * (vatRate / 100)), 0) + '원'
                                    : '0원'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveItem(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <Separator />

              {/* 금액 합계 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground">금액 합계</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">수량 합계</span>
                    <span className="text-sm font-medium">
                      {formatNumber(
                        invoiceItems.reduce((sum, item) => {
                          // 수량이 null/undefined인 항목은 제외 (수동 입력 항목 등)
                          if (item.quantity == null) return sum;
                          const qty = Number(item.quantity);
                          return sum + (isNaN(qty) ? 0 : qty);
                        }, 0),
                        4
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">공급가액</span>
                    <span className="text-sm font-medium">{formatNumber(subtotal, 2)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">부가세</span>
                    <span className="text-sm font-medium">{formatNumber(vat, 2)}원</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold">합계</span>
                    <span className="text-sm font-semibold">{formatNumber(total, 2)}원</span>
                  </div>
                  {finalCustomerId && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">
                          {isEditMode ? '전일잔액' : '전일잔액 (예상)'}
                        </span>
                        <span className="text-sm font-medium">
                          {isEditMode && (existingInvoice as any)?.previousBalance != null
                            ? Number((existingInvoice as any).previousBalance) < 0
                              ? `-${formatNumber(Math.abs(Number((existingInvoice as any).previousBalance)), 0)}원`
                              : formatNumber(Number((existingInvoice as any).previousBalance), 0) + '원'
                            : isLedgerLoading
                              ? '조회 중...'
                              : previousBalanceExpected != null
                                ? previousBalanceExpected < 0
                                  ? `-${formatNumber(Math.abs(previousBalanceExpected), 0)}원`
                                  : formatNumber(previousBalanceExpected, 0) + '원'
                                : '0원'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">
                          {isEditMode ? '금일잔액' : '금일잔액 (예상)'}
                        </span>
                        <span className="text-sm font-semibold">
                          {isEditMode && (existingInvoice as any)?.previousBalance != null
                            ? formatNumber(total + (Number((existingInvoice as any).previousBalance) || 0), 0) + '원'
                            : isLedgerLoading
                              ? '-'
                              : formatNumber(total + (previousBalanceExpected ?? 0), 0) + '원'}
                        </span>
                      </div>
                    </>
                  )}
                  {prepaymentDeductedAmount > 0 && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">선입금 차감</span>
                        <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                          -{formatNumber(prepaymentDeductedAmount, 0)}원
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-semibold">
                          {total - prepaymentDeductedAmount >= 0 ? '차감 후 미수금액' : '초과 입금액 (환불)'}
                        </span>
                        <span className={`text-sm font-semibold ${
                          total - prepaymentDeductedAmount >= 0 
                            ? '' 
                            : 'text-blue-600 dark:text-blue-400'
                        }`}>
                          {formatNumber(total - prepaymentDeductedAmount, 0)}원
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <Separator />

              {/* 첨부 이미지 (1장) — 금액 합계 아래 */}
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 shrink-0" />
                  첨부 이미지 (선택, 1장)
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  명세서와 함께 보관할 이미지입니다. 선택 시 서버에 업로드되고, 발행/저장 시 DB에 연결됩니다. 썸네일을 누르면 크게 볼 수 있습니다.
                </p>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept={INVOICE_ATTACHMENT_ACCEPT}
                  className="hidden"
                  onChange={handleInvoiceAttachmentChange}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={attachmentUploading}
                    onClick={() => attachmentInputRef.current?.click()}
                  >
                    {attachmentUploading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {attachmentImageUrl ? '이미지 교체' : '이미지 선택'}
                  </Button>
                  {attachmentImageUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={attachmentUploading}
                      onClick={() => void handleRemoveInvoiceAttachment()}
                    >
                      첨부 삭제
                    </Button>
                  ) : null}
                </div>
                {attachmentImageUrl ? (
                  <button
                    type="button"
                    onClick={() => setAttachmentPreviewOpen(true)}
                    className="rounded-lg border overflow-hidden bg-muted/30 p-1 flex justify-center max-w-full w-fit cursor-pointer transition hover:ring-2 hover:ring-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <img
                      src={attachmentImageUrl}
                      alt="첨부 이미지 미리보기 (크게 보기)"
                      className="max-h-32 max-w-[200px] w-auto object-contain"
                    />
                  </button>
                ) : null}
              </section>
            </>
          )}
            </div>
          </ScrollArea>
        </div>

        <DrawerFooter className="border-t border-border p-4 flex-shrink-0">
          <div className="flex justify-between gap-2">
            <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={
                  createInvoiceMutation.isPending ||
                  updateInvoiceMutation.isPending ||
                  attachmentUploading ||
                  invoiceItems.length === 0
                }
              >
                {createInvoiceMutation.isPending || updateInvoiceMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isEditMode ? '저장 중...' : '발행 중...'}
                  </>
                ) : isEditMode ? (
                  '저장'
                ) : (
                  '발행'
                )}
              </Button>
            </div>
          </div>
        </DrawerFooter>
      </DrawerContent>

      {/* 판매 항목 선택 Drawer */}
      <SalesItemSelectDrawer
        open={salesItemDialogOpen}
        onOpenChange={(open) => {
          setSalesItemDialogOpen(open);
          if (!open) {
            setSalesItemDialogIndex(null);
          }
        }}
        excludedItemIds={excludedItemIds}
        onSelect={(selectedItems: SalesItemForInvoice[]) => {
          if (selectedItems.length > 0) {
            // 선택된 항목 로그
            console.log('[InvoiceIssueDrawer] 선택된 판매 항목:', selectedItems.map(item => ({
              id: item.id,
              itemId: item.itemId,
              salesId: item.salesId,
              salesItemId: item.itemId || item.id,
              customer: item.sales?.customer,
              customerId: item.sales?.customer?.id,
              sales: item.sales,
              fullCustomerObject: JSON.stringify(item.sales?.customer),
              // 전체 객체 확인
              fullItem: item,
            })));
            
            const today = format(new Date(), 'MM/dd', { locale: ko });
            
            // 새 항목 추가 모드일 때 고객 검증
            if (salesItemDialogIndex === null && invoiceItems.length > 0) {
              // 기존 항목들의 고객 목록 (중복 제거)
              const existingCustomers = new Set<string>();
              invoiceItems.forEach(item => {
                if (item.customerName) {
                  existingCustomers.add(item.customerName);
                }
              });
              
              // 거래명세서 전체의 고객 정보도 확인 (기존 항목에 customerName이 없는 경우 대비)
              if (existingCustomers.size === 0 && existingInvoice?.customer?.companyName) {
                existingCustomers.add(existingInvoice.customer.companyName);
              } else if (existingCustomers.size === 0 && recipientInfo.companyName) {
                existingCustomers.add(recipientInfo.companyName);
              }
              
              // 새로 선택한 항목들의 고객 목록 (중복 제거)
              const newCustomers = new Set<string>();
              selectedItems.forEach(item => {
                const customerName = item.sales?.customer?.companyName;
                if (customerName) {
                  newCustomers.add(customerName);
                }
              });
              
              // 기존 고객과 새 고객이 다른지 확인
              const existingCustomerList = Array.from(existingCustomers);
              const newCustomerList = Array.from(newCustomers);
              
              // 기존 고객이 있고, 새 고객이 있는 경우
              if (existingCustomerList.length > 0 && newCustomerList.length > 0) {
                // 거래명세서는 한 고객에 대해서만 발행하므로, 기존 고객은 하나여야 함
                // 새 고객 목록이 기존 고객과 완전히 일치하는지 확인
                const existingCustomer = existingCustomerList[0]; // 첫 번째 고객 (모두 같아야 함)
                const hasDifferentCustomer = newCustomerList.some(customer => customer !== existingCustomer);
                
                if (hasDifferentCustomer) {
                  toast({
                    title: '고객 선택 경고',
                    description: `거래명세서는 한 고객에 대해서만 발행할 수 있습니다. 기존 항목의 고객(${existingCustomer})과 새로 선택한 항목의 고객(${newCustomerList.join(', ')})이 다릅니다. 동일한 고객의 항목만 선택해주세요.`,
                    variant: 'destructive',
                    duration: 5000,
                  });
                  return; // 항목 추가하지 않음
                }
              }
            }
            
            if (salesItemDialogIndex !== null) {
              // 기존 항목 업데이트 모드
              const salesItem = selectedItems[0];
              
              // 고객 검증: 기존 항목의 고객과 다른 고객의 판매 항목으로 업데이트하려는지 확인
              if (invoiceItems.length > 0) {
                // 기존 항목들의 고객 목록 (중복 제거)
                const existingCustomers = new Set<string>();
                invoiceItems.forEach((item, idx) => {
                  // 현재 업데이트하려는 항목은 제외
                  if (idx !== salesItemDialogIndex && item.customerName) {
                    existingCustomers.add(item.customerName);
                  }
                });
                
                // 거래명세서 전체의 고객 정보도 확인 (기존 항목에 customerName이 없는 경우 대비)
                if (existingCustomers.size === 0 && existingInvoice?.customer?.companyName) {
                  existingCustomers.add(existingInvoice.customer.companyName);
                } else if (existingCustomers.size === 0 && recipientInfo.companyName) {
                  existingCustomers.add(recipientInfo.companyName);
                }
                
                // 새로 선택한 항목의 고객
                const newCustomerName = salesItem.sales?.customer?.companyName;
                
                // 기존 고객이 있고, 새 고객이 있는 경우
                if (existingCustomers.size > 0 && newCustomerName) {
                  // 거래명세서는 한 고객에 대해서만 발행하므로, 기존 고객은 하나여야 함
                  const existingCustomerList = Array.from(existingCustomers);
                  const existingCustomer = existingCustomerList[0]; // 첫 번째 고객 (모두 같아야 함)
                  
                  if (newCustomerName !== existingCustomer) {
                    toast({
                      title: '고객 선택 경고',
                      description: `거래명세서는 한 고객에 대해서만 발행할 수 있습니다. 기존 항목의 고객(${existingCustomer})과 새로 선택한 항목의 고객(${newCustomerName})이 다릅니다. 동일한 고객의 항목만 선택해주세요.`,
                      variant: 'destructive',
                      duration: 5000,
                    });
                    return; // 항목 업데이트하지 않음
                  }
                }
              }
              
              // findAvailableSalesItems의 weight/cargoWeight는 DB 톤 단위 → 화면 kg로 표시 (×1000)
              const weightTon = salesItem.weight ?? salesItem.cargoWeight ?? undefined;
              const weightKg = weightTon != null ? weightTon * 1000 : undefined;
              const unitPrice = salesItem.unitPrice || undefined;

              // 품목명 생성: 수출사 + 제품명 + (패킹)
              const exporterName = salesItem.exporterName || salesItem.exporter || null;
              const productNameCode = salesItem.productName || '';
              const productNameLabel = getProductName(productNameCode);
              const packingName = salesItem.packingName || salesItem.packingType || salesItem.specification || null;
              
              const nameParts: string[] = [];
              if (exporterName) nameParts.push(exporterName);
              if (productNameLabel && productNameLabel !== '-') nameParts.push(productNameLabel);
              if (packingName) {
                const packingAbbr = getPackingAbbreviation(packingName);
                if (packingAbbr) {
                  nameParts.push(`(${packingAbbr})`);
                }
              }
              const fullProductName = nameParts.join(' ');
              
              handleItemChange(salesItemDialogIndex, 'productName', fullProductName || productNameLabel || productNameCode);
              handleItemChange(salesItemDialogIndex, 'quantity', weightKg);
              handleItemChange(salesItemDialogIndex, 'unit', 'KG');
              handleItemChange(salesItemDialogIndex, 'unitPrice', unitPrice);
              // bl, containerNo, vatApplied, exporterName, specification, date도 업데이트
              const updatedItems = [...invoiceItems];
              const item = updatedItems[salesItemDialogIndex];
              item.bl = salesItem.bl || null;
              item.containerNo = salesItem.containerNo || null;
              item.exporterName = exporterName;
              item.packingName = packingName;
              item.specification = salesItem.specification || null;
              item.date = today;
              item.salesId = salesItem.salesId || null;
              // 판매 항목 ID 저장 - itemId가 실제 판매 항목 ID (tb_sales_item.si_id)
              const actualSalesItemId = salesItem.itemId || null;
              item.salesItemId = actualSalesItemId;
              console.log('[InvoiceIssueDrawer] 항목 업데이트 - salesItemId 설정:', {
                salesItemItemId: salesItem.itemId,
                salesItemId: salesItem.id,
                actualSalesItemId,
                salesItem: salesItem,
              });
              item.customerName = salesItem.sales?.customer?.companyName || null;
              if (item.vatApplied === undefined) {
                item.vatApplied = false; // 기본값: 부가세 미적용
              }
              setInvoiceItems(updatedItems);
              
              // 고객 정보 업데이트 (업데이트 모드)
              console.log('[InvoiceIssueDrawer] 항목 업데이트 - 고객 정보:', {
                salesItemCustomer: salesItem.sales?.customer,
                salesItem: salesItem,
              });
              
              if (salesItem.sales?.customer) {
                const customer = salesItem.sales.customer;
                const newRecipientInfo = {
                  phone: customer.phone || recipientInfo.phone,
                  companyName: customer.companyName || recipientInfo.companyName,
                  ceo: customer.ceo || recipientInfo.ceo,
                };
                console.log('[InvoiceIssueDrawer] recipientInfo 업데이트:', newRecipientInfo);
                setRecipientInfo(newRecipientInfo);
                // 고객 ID 설정
                if (customer.id) {
                  setSelectedCustomerId(customer.id);
                } else if (customer.phone) {
                  // 고객 ID가 없으면 전화번호로 조회
                  performLookup(customer.phone);
                }
              }
            } else {
              // 새 항목 추가 모드
              const newItems: InvoiceItemWithVat[] = selectedItems.map((salesItem, index) => {
                // findAvailableSalesItems의 weight/cargoWeight는 DB 톤 단위 → 화면 kg로 표시 (×1000)
                const weightTon = salesItem.weight ?? salesItem.cargoWeight ?? undefined;
                const weightKg = weightTon != null ? weightTon * 1000 : undefined;
                const unitPrice = salesItem.unitPrice || undefined;
                const amount = weightKg != null && unitPrice != null ? weightKg * unitPrice : undefined;

                // 품목명 생성: 수출사 + 제품명 + (패킹)
                const exporterName = salesItem.exporterName || salesItem.exporter || null;
                const productNameCode = salesItem.productName || '';
                const productNameLabel = getProductName(productNameCode);
                const packingName = salesItem.packingName || salesItem.packingType || salesItem.specification || null;
                
                const nameParts: string[] = [];
                if (exporterName) nameParts.push(exporterName);
                if (productNameLabel && productNameLabel !== '-') nameParts.push(productNameLabel);
                if (packingName) {
                  const packingAbbr = getPackingAbbreviation(packingName);
                  if (packingAbbr) {
                    nameParts.push(`(${packingAbbr})`);
                  }
                }
                const fullProductName = nameParts.join(' ');

                return {
                  order: invoiceItems.length + index + 1,
                  productName: fullProductName || productNameLabel || productNameCode,
                  specification: salesItem.specification || null,
                  quantity: weightKg,
                  unit: 'KG',
                  unitPrice: unitPrice,
                  amount: amount,
                  notes: null,
                  date: today,
                  // 화면 표시용 필드
                  bl: salesItem.bl || null,
                  containerNo: salesItem.containerNo || null,
                  vatApplied: false, // 기본값: 부가세 미적용
                  // 수출사 및 패킹 정보 저장
                  exporterName: exporterName,
                  packingName: packingName,
                  // 고객 정보 저장 (고객 검증용)
                  salesId: salesItem.salesId || null,
                  // 판매 항목 ID 저장 - itemId가 실제 판매 항목 ID (tb_sales_item.si_id)
                  salesItemId: salesItem.itemId || null,
                  customerName: salesItem.sales?.customer?.companyName || null,
                } as InvoiceItemWithVat & { exporterName?: string | null; packingName?: string | null };
              });

              setInvoiceItems([...invoiceItems, ...newItems]);
              
              // 고객 정보 업데이트 (새 항목 추가 모드)
              // 첫 번째 선택된 항목의 고객 정보로 업데이트
              console.log('[InvoiceIssueDrawer] 새 항목 추가 - 첫 번째 항목 고객 정보:', {
                firstItem: selectedItems[0],
                customer: selectedItems[0].sales?.customer,
                sales: selectedItems[0].sales,
              });
              
              // 고객 정보 업데이트 (새 항목 추가 모드)
              // 첫 번째 선택된 항목의 고객 정보로 업데이트
              if (selectedItems.length > 0) {
                const firstItem = selectedItems[0];
                const customer = firstItem.sales?.customer;
                
                console.log('[InvoiceIssueDrawer] 새 항목 추가 - 고객 정보 상세:', {
                  firstItem,
                  customer,
                  sales: firstItem.sales,
                  customerId: customer?.id,
                  customerObject: customer,
                });
                
                if (customer) {
                  const newRecipientInfo = {
                    phone: customer.phone || recipientInfo.phone,
                    companyName: customer.companyName || recipientInfo.companyName,
                    ceo: customer.ceo || recipientInfo.ceo,
                  };
                  console.log('[InvoiceIssueDrawer] recipientInfo 업데이트 (새 항목):', newRecipientInfo);
                  setRecipientInfo(newRecipientInfo);
                  
                  // 고객 ID 설정 (즉시 설정)
                  if (customer.id) {
                    console.log('[InvoiceIssueDrawer] 고객 ID 설정:', customer.id);
                    setSelectedCustomerId(customer.id);
                  } else if (customer.phone) {
                    // 고객 ID가 없으면 전화번호로 조회
                    console.log('[InvoiceIssueDrawer] 고객 ID 없음, 전화번호로 조회:', customer.phone);
                    performLookup(customer.phone);
                  } else {
                    console.warn('[InvoiceIssueDrawer] 고객 ID와 전화번호 모두 없음');
                  }
                } else {
                  console.warn('[InvoiceIssueDrawer] 고객 정보가 없습니다. firstItem:', firstItem);
                }
              }
            }
          }
        }}
      />

      {/* 업체명 검색 Dialog */}
      <Dialog open={companySearchOpen} onOpenChange={handleCompanySearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>업체명으로 고객 검색</DialogTitle>
            <DialogDescription>업체명 또는 대표자명을 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCompanySearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={companySearchTerm}
                onChange={(e) => setCompanySearchTerm(e.target.value)}
                placeholder="업체명 또는 대표자명"
                autoFocus
              />
              <Button type="submit" disabled={companySearchLoading}>
                {companySearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>
            {companySearchError && (
              <p className="text-sm text-destructive">{companySearchError}</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {companySearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : companySearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {companySearchAttempted ? '검색 결과가 없습니다.' : '업체명을 입력해 검색하세요.'}
                </div>
              ) : (
                companySearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelectCompany(item)}
                  >
                    <p className="font-medium">{item.companyName || '업체명 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(item.phone ?? '') || '전화번호 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 전화번호 검색 Dialog */}
      <Dialog open={phoneSearchOpen} onOpenChange={handlePhoneSearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>전화번호로 고객 검색</DialogTitle>
            <DialogDescription>전화번호를 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePhoneSearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={phoneSearchTerm}
                onChange={(e) => setPhoneSearchTerm(e.target.value)}
                placeholder="010-1234-5678"
                autoFocus
              />
              <Button type="submit" disabled={phoneSearchLoading}>
                {phoneSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>
            {phoneSearchError && (
              <p className="text-sm text-destructive">{phoneSearchError}</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {phoneSearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : phoneSearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {phoneSearchAttempted ? '검색 결과가 없습니다.' : '전화번호를 입력해 검색하세요.'}
                </div>
              ) : (
                phoneSearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelectPhone(item)}
                  >
                    <p className="font-medium">{formatPhone(item.phone ?? '') || '전화번호 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.companyName || '업체명 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 첨부 이미지 원본 크기 보기 */}
      <Dialog open={attachmentPreviewOpen} onOpenChange={setAttachmentPreviewOpen}>
        <DialogContent className="max-w-[min(96vw,1200px)] max-h-[90vh] flex flex-col gap-2 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>첨부 이미지</DialogTitle>
            <DialogDescription>
              원본에 가깝게 표시합니다. 화면보다 크면 스크롤해 보세요.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[min(82vh,880px)] rounded-md border bg-muted/20 p-2 flex justify-center">
            {attachmentImageUrl ? (
              <img
                src={attachmentImageUrl}
                alt="거래명세서 첨부 이미지 원본"
                className="max-w-none w-auto h-auto max-h-[min(80vh,860px)] object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
}

