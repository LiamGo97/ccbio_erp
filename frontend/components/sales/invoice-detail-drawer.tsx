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
import { useInvoice, SalesInvoice, useUpdateInvoiceEcountProcessingStatus, useUpdateInvoiceSmsNotApplicable, useUpdateInvoice, useDeleteInvoice } from '@/lib/hooks/use-invoices';
import { useReceivables, useReceivable } from '@/lib/hooks/use-receivables';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Edit, Send, Eye, Download, CheckCircle, Trash2, ImagePlus } from 'lucide-react';
import { useSmsSenders } from '@/lib/hooks/use-sms-senders';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatNumber } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InvoicePrintView } from './invoice-print-view';
import { useCompanyInfo } from '@/lib/hooks/use-company-info';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageSquare, RotateCcw } from 'lucide-react';
import { useSmsTemplatesByType } from '@/lib/hooks/use-sms-templates';
import { useSmsHistoryByInvoice, SmsHistory } from '@/lib/hooks/use-sms-history';
import { SmsHistoryDetailDrawer } from '@/components/sms/sms-history-detail-drawer';
import { useCodes } from '@/lib/hooks/use-codes';
import { usePrepayments, PrepaymentListItem } from '@/lib/hooks/use-prepayments';
import { InvoiceIssueDrawer } from './invoice-issue-drawer';
import {
  getSmsAddresseeTokens,
  normalizeSmsGreetingLineBreaks,
  buildInvoiceSmsGreetingLine,
} from '@/lib/sms-addressee-tokens';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** 거래명세서 품목 규격: HEAVY_BALE / HEAVY_BALES 등 → 헤 (발행·인쇄와 동일 계열) */
function abbreviateHeavyPackingSpec(spec: string): string {
  const key = spec.trim().toUpperCase().replace(/\s+/g, '_');
  if (key === 'HEAVY_BALE' || key === 'HEAVY_BALES') return '헤';
  return spec;
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

export interface InvoiceDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId?: string | null;
  title?: string;
  description?: string;
  onSuccess?: () => void;
}

export const InvoiceDetailDrawer: React.FC<InvoiceDetailDrawerProps> = ({
  open,
  onOpenChange,
  invoiceId,
  title = '거래명세서 상세정보',
  description = '발행된 거래명세서 정보를 확인합니다.',
  onSuccess,
}) => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useInvoice(invoiceId ?? undefined);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const deleteInvoiceMutation = useDeleteInvoice();

  // invoiceId로 채권 조회 (전일잔액 계산용)
  const { data: receivablesData, refetch: refetchReceivables } = useReceivables({
    limit: 100,
  });
  
  // 현재 거래명세서에 연결된 채권 찾기
  const currentReceivable = React.useMemo(() => {
    if (!receivablesData?.data || !invoiceId) return null;
    // invoiceId를 문자열과 숫자 모두 비교
    const receivable = receivablesData.data.find((r) => 
      r.invoiceId === invoiceId || 
      r.invoiceId === String(invoiceId) || 
      String(r.invoiceId) === String(invoiceId)
    );
    return receivable || null;
  }, [receivablesData, invoiceId]);
  
  // 채권 상세 정보 조회 (prepaymentDeducted 포함)
  const currentReceivableId = React.useMemo(() => {
    return currentReceivable?.id || null;
  }, [currentReceivable]);
  
  const { data: receivableDetail } = useReceivable(currentReceivableId ?? undefined);
  
  // prepaymentDeducted: 채권 상세 정보에서 직접 가져오거나 계산
  const prepaymentDeducted = React.useMemo(() => {
    // 채권 상세 정보에서 직접 가져오기 (우선)
    if (receivableDetail?.prepaymentDeducted != null) {
      return Number(receivableDetail.prepaymentDeducted) || 0;
    }
    // 없으면 계산: receivableAmount - outstandingAmount
    if (currentReceivable) {
      const receivableAmount = Number(currentReceivable.receivableAmount) || 0;
      const outstandingAmount = Number(currentReceivable.outstandingAmount) || 0;
      return receivableAmount - outstandingAmount;
    }
    return 0;
  }, [receivableDetail, currentReceivable]);
  
  // 거래명세서 항목의 salesId 수집
  const invoiceItemSalesIds = React.useMemo(() => {
    if (!data?.items) return [];
    const salesIds = new Set<string>();
    data.items.forEach((item: any) => {
      if (item.salesItem?.sales?.id) {
        salesIds.add(item.salesItem.sales.id);
      }
    });
    return Array.from(salesIds);
  }, [data]);

  const invoiceAttachmentDisplayUrl = React.useMemo(() => {
    if (!data) return null;
    const u =
      data.attachmentImageUrl ||
      (data as { attachment_image_url?: string | null }).attachment_image_url;
    return u && String(u).trim() ? String(u).trim() : null;
  }, [data]);

  const invoiceAttachmentStoredPath = React.useMemo(() => {
    if (!data) return null;
    const p =
      data.attachmentImagePath ||
      (data as { attachment_image_path?: string | null }).attachment_image_path;
    return p && String(p).trim() ? String(p).trim() : null;
  }, [data]);
  
  // 선입금 조회 (고객 ID가 있을 때만)
  const customerId = data?.customer?.id;
  const { data: prepaymentsResponse, refetch: refetchPrepayments } = usePrepayments({
    customerId: customerId,
    limit: 1000,
  });
  
  // 선입금 목록 (입금 확인된 선입금만 포함: CONFIRMED, AVAILABLE, 그리고 차감된 것도 포함)
  const allPrepayments = React.useMemo(() => {
    if (!prepaymentsResponse?.data) return [];
    return prepaymentsResponse.data.filter(
      (p) => 
        (p.paymentStatus === 'CONFIRMED' || p.paymentStatus === 'AVAILABLE') ||
        p.deductionStatus === 'DEDUCTED'
    );
  }, [prepaymentsResponse]);
  
  // 거래명세서 항목의 salesId에 연결된 선입금만 필터링
  const relevantPrepayments = React.useMemo(() => {
    if (invoiceItemSalesIds.length === 0) return [];
    return allPrepayments.filter((p) => invoiceItemSalesIds.includes(p.salesId));
  }, [allPrepayments, invoiceItemSalesIds]);
  
  // 선입금 차감액 계산 (선입금 목록에서 직접 계산)
  const prepaymentDeductedFromList = React.useMemo(() => {
    if (relevantPrepayments.length === 0) return 0;
    // DEDUCTED 상태의 선입금만 합산 (실제 입금액만 차감, 입금 안 했으면 0원)
    const deductedPrepayments = relevantPrepayments.filter((p) => p.deductionStatus === 'DEDUCTED');
    return deductedPrepayments.reduce((sum, prepayment) => {
      // 실제 입금액이 있을 때만 차감, 없으면 0원
      const amount = prepayment.actualAmount
        ? Number(prepayment.actualAmount)
        : 0;
      return sum + amount;
    }, 0);
  }, [relevantPrepayments]);
  
  // 최종 prepaymentDeducted: 채권 정보 우선, 없으면 선입금 목록에서 계산
  const finalPrepaymentDeducted = React.useMemo(() => {
    if (prepaymentDeducted > 0) {
      return prepaymentDeducted;
    }
    return prepaymentDeductedFromList;
  }, [prepaymentDeducted, prepaymentDeductedFromList]);
  
  const { data: companyInfo } = useCompanyInfo();
  // 거래명세서의 공급사 ID로 템플릿 조회 (없으면 기본 템플릿)
  const supplierId = data?.supplierId ?? null;
  const { data: smsTemplates } = useSmsTemplatesByType('INVOICE', supplierId);
  const [isSending, setIsSending] = React.useState(false);
  const updateInvoiceMutation = useUpdateInvoice();
  
  // SMS 발신자 목록 조회
  const { data: smsSenders = [] } = useSmsSenders({ status: true });
  
  // SMS 발송 이력 조회 (거래명세서별)
  const { data: smsHistories } = useSmsHistoryByInvoice(invoiceId ? Number(invoiceId) : 0);
  const latestSmsHistory = React.useMemo(() => {
    if (!smsHistories || smsHistories.length === 0) return null;
    // 최신 이력만 반환 (createdAt 기준 내림차순 정렬된 첫 번째)
    return smsHistories[0];
  }, [smsHistories]);
  
  // SMS 상태 코드 조회
  const { data: statusCodes } = useCodes({ group: 'SMS_STATUS' });
  
  // SMS 이력 상세 drawer 상태
  const [smsHistoryDetailOpen, setSmsHistoryDetailOpen] = React.useState(false);
  const [invoiceAttachmentPreviewOpen, setInvoiceAttachmentPreviewOpen] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [smsMessage, setSmsMessage] = React.useState<string>('');
  const [selectedSmsManagerId, setSelectedSmsManagerId] = React.useState<number | undefined>(undefined);
  const printViewRef = React.useRef<HTMLDivElement>(null);
  const previewViewRef = React.useRef<HTMLDivElement>(null);

  // 미리보기가 열릴 때 기존 SMS 발송 담당자 설정
  // smsManagerId는 사용자 ID가 아니라 SMS 발신자 ID로 변경됨
  React.useEffect(() => {
    if (previewOpen && data?.smsManagerId) {
      // 기존에 사용자 ID로 저장된 경우를 대비하여 SMS 발신자 ID로 변환
      // smsManagerId가 SMS 발신자 ID인지 확인
      const senderId = smsSenders.find(s => s.id === data.smsManagerId)?.id;
      if (senderId) {
        setSelectedSmsManagerId(senderId);
      } else {
        // 기존 사용자 ID로 저장된 경우, 해당 사용자의 전화번호로 SMS 발신자 찾기
        // 이 부분은 백엔드에서 smsManagerId를 SMS 발신자 ID로 마이그레이션해야 함
        setSelectedSmsManagerId(undefined);
      }
    } else if (previewOpen) {
      setSelectedSmsManagerId(undefined);
    }
  }, [previewOpen, data?.smsManagerId, smsSenders]);

  // 이카운트 ERP 처리 상태 업데이트
  const updateEcountProcessingStatus = useUpdateInvoiceEcountProcessingStatus();
  const updateSmsNotApplicable = useUpdateInvoiceSmsNotApplicable();

  React.useEffect(() => {
    if (!open) {
      setInvoiceAttachmentPreviewOpen(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirmOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setDeleteConfirmOpen(false);
        return;
      }
      if (invoiceAttachmentPreviewOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setInvoiceAttachmentPreviewOpen(false);
        return;
      }
      if (previewOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPreviewOpen(false);
        setSmsMessage('');
        return;
      }
      if (editDrawerOpen) {
        return;
      }
      if (smsHistoryDetailOpen) {
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
    deleteConfirmOpen,
    invoiceAttachmentPreviewOpen,
    previewOpen,
    editDrawerOpen,
    smsHistoryDetailOpen,
  ]);

  React.useEffect(() => {
    if (open && invoiceId) {
      // 거래명세서 데이터 갱신
      refetch();
      // 선입금 및 채권 데이터도 갱신 (전일잔액 계산을 위해)
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      // refetch도 호출하여 즉시 갱신
      refetchPrepayments();
      refetchReceivables();
    }
  }, [open, invoiceId, refetch, queryClient, refetchPrepayments, refetchReceivables]);

  // 토큰 치환 함수
  const replaceTokens = React.useCallback((template: string, invoiceData: typeof data): string => {
    if (!invoiceData || !invoiceData.customer) return template;

    const issuedDate = invoiceData.issuedAt
      ? format(new Date(invoiceData.issuedAt), 'yyyy-MM-dd', { locale: ko })
      : format(new Date(), 'yyyy-MM-dd', { locale: ko });

    // 합계 금액 포맷팅 (천 단위 구분)
    const totalAmount = invoiceData.invoiceAmount 
      ? Number(invoiceData.invoiceAmount) 
      : 0;
    const formattedAmount = new Intl.NumberFormat('ko-KR').format(totalAmount);

    // 금일잔액 계산 (합계 + 전일잔액)
    // printViewData와 동일한 방식으로 계산
    let previousBalance: number | null = null;
    
    if (invoiceData.status === 'ISSUED' && (invoiceData as any).previousBalance != null) {
      // 발행된 거래명세서: 저장된 전일잔액 사용
      previousBalance = Number((invoiceData as any).previousBalance) || 0;
    } else {
      // 미발행 거래명세서 또는 기존 발행 거래명세서(previousBalance가 null): 발행일 기준으로 계산
      // 기존 미수금(채권 잔액) 계산: 발행일 이전의 채권 balance 합산
      let previousReceivableBalance = 0;
      if (receivablesData?.data && invoiceData?.customer?.id) {
        const issuedDateObj = invoiceData.issuedAt ? new Date(invoiceData.issuedAt) : new Date();
        receivablesData.data.forEach((receivable) => {
          // 같은 고객의 채권만
          if (receivable.customerId === invoiceData.customer?.id) {
            const receivableOccurredDate = receivable.occurredDate 
              ? new Date(receivable.occurredDate)
              : null;
            
            // 발행일 이전의 채권만 포함
            if (receivableOccurredDate && receivableOccurredDate < issuedDateObj) {
              // balance는 receivableDetail에서 가져오거나 계산
              const balance = receivable.balance != null 
                ? Number(receivable.balance) 
                : 0;
              previousReceivableBalance += balance;
            }
          }
        });
      }
      
      // 전일잔액 = 기존 미수금 - 선입금 차감액
      previousBalance = previousReceivableBalance - finalPrepaymentDeducted;
    }
    
    // 금일잔액 = 합계 + 전일잔액
    const totalNum = totalAmount;
    const previousBalanceNum = previousBalance != null ? Number(previousBalance) : 0;
    const currentBalanceNum = totalNum + previousBalanceNum;
    const formattedCurrentBalance = new Intl.NumberFormat('ko-KR').format(currentBalanceNum);

    // 수신: 발행 시점 스냅샷(inv) 우선, 없으면 customer
    const inv = invoiceData as any;
    const { customerCompanyName, customerName } = getSmsAddresseeTokens({
      companyName: inv.companyName ?? invoiceData.customer?.companyName,
      ceo: inv.ceo ?? invoiceData.customer?.ceo,
    });

    // 계좌 정보 (환경변수나 설정에서 가져올 수 있도록 하드코딩 - 추후 개선 가능)
    const bankAccount = '농협 301-0377-4231-81';

    // 거래명세서 번호
    const invoiceNumber = invoiceData.invoiceNumber || '';

    // 토큰 치환 (상호=대표인 경우 {customerCompanyName}은 비어 중복 기재 방지)
    return normalizeSmsGreetingLineBreaks(
      template
        .replace(/{customerName}/g, customerName)
        .replace(/{customerCompanyName}/g, customerCompanyName)
        .replace(/{amount}/g, formattedAmount) // 합계 금액 (기존 호환성 유지)
        .replace(/{totalAmount}/g, formattedAmount) // 합계 금액 (명시적)
        .replace(/{currentBalance}/g, formattedCurrentBalance) // 금일잔액 (새 토큰)
        .replace(/{todayBalance}/g, formattedCurrentBalance) // 금일잔액 (별칭)
        .replace(/{bankAccount}/g, bankAccount)
        .replace(/{invoiceNumber}/g, invoiceNumber)
        .replace(/{issuedDate}/g, issuedDate),
    );
  }, [finalPrepaymentDeducted, receivablesData]);

  // SMS 메시지 템플릿 생성 함수
  const generateSmsMessage = React.useCallback((invoiceData: typeof data) => {
    if (!invoiceData || !invoiceData.customer) return '';

    // SMS 템플릿이 있으면 템플릿 사용, 없으면 기본 메시지
    if (smsTemplates && smsTemplates.length > 0) {
      // 기본 템플릿 우선 사용 (isDefault가 true인 것), 없으면 첫 번째 템플릿
      const defaultTemplate = smsTemplates.find(t => (t as any).isDefault) || smsTemplates[0];
      if (defaultTemplate?.content) {
        return replaceTokens(defaultTemplate.content, invoiceData);
      }
    }

    // 템플릿이 없을 때 fallback 메시지
    const issuedDate = invoiceData.issuedAt
      ? format(new Date(invoiceData.issuedAt), 'yyyy-MM-dd', { locale: ko })
      : format(new Date(), 'yyyy-MM-dd', { locale: ko });

    const formattedAmount = invoiceData.invoiceAmount 
      ? new Intl.NumberFormat('ko-KR').format(Number(invoiceData.invoiceAmount)) 
      : '0';

    const inv = invoiceData as any;
    const addressee = getSmsAddresseeTokens({
      companyName: inv.companyName ?? invoiceData.customer?.companyName,
      ceo: inv.ceo ?? invoiceData.customer?.ceo,
    });
    const bankAccount = '농협 301-0377-4231-81';
    const greetingLine = buildInvoiceSmsGreetingLine(addressee);

    return `알림
[Web발신]
[참참바이오]



${greetingLine} 
(주)참참바이오 입니다.

계좌 및 금액 안내드리오니, 확인 후 입금 부탁드립니다.
세부사항은 거래명세표 확인 부탁드립니다.

- 금액 : ${formattedAmount} 원
- 계좌: ${bankAccount}

좋은 하루 되세요^^

* 입금 계좌가 변경되었으니 이전 계좌 번호가 아닌
위 수정된 계좌 번호를 확인하시어 입금 부탁 드리겠습니다.
감사합니다.`;
  }, [smsTemplates, replaceTokens]);

  // 데이터가 로드되고 미리보기가 열리면 기본 메시지 생성
  React.useEffect(() => {
    if (data && previewOpen && !smsMessage) {
      // SMS 템플릿이 로드되면 메시지 생성
      if (smsTemplates !== undefined) {
        const defaultMessage = generateSmsMessage(data);
        if (defaultMessage) {
          setSmsMessage(defaultMessage);
        }
      }
    }
  }, [data, previewOpen, generateSmsMessage, smsMessage, smsTemplates]);

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

  const getStatusLabel = (status?: string | null) => {
    if (status === 'ISSUED') return '발행완료';
    if (status === 'PENDING_ISSUE') return '발행대기';
    return status || '-';
  };

  const getStatusStyle = (status?: string | null): { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string } => {
    if (status === 'ISSUED') {
      return {
        variant: 'outline',
        className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
      };
    }
    if (status === 'PENDING_ISSUE') {
      return {
        variant: 'outline',
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      };
    }
    return {
      variant: 'outline',
      className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
    };
  };

  // items를 order 순서로 정렬 (Hooks는 항상 같은 순서로 호출되어야 하므로 early return 이전에 위치)
  const sortedItems = React.useMemo(() => {
    if (!data?.items) return [];
    return [...data.items].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [data?.items]);

  // 부가세 계산 함수 (early return 이전에 정의)
  const calculateItemVat = React.useCallback((item: any, invoiceData?: typeof data) => {
    const invoice = invoiceData || data;
    // 부가세가 적용되어 있고 amount가 있으면 계산 (음수도 포함)
    if (invoice?.vatApplied && item.amount != null && invoice.vatRate != null) {
      // amount를 숫자로 변환 (문자열일 수도 있음)
      const amount = Number(item.amount);
      if (isNaN(amount)) return 0;
      
      const calculatedVat = Math.round(amount * (invoice.vatRate / 100));
      
      // 백엔드에서 제공한 vatAmount가 있고 0이 아니면 우선 사용
      // vatAmount가 null이거나 0이면 계산값 사용 (기존 데이터가 잘못 저장된 경우 대비)
      const savedVatAmount = item.vatAmount != null ? Number(item.vatAmount) : null;
      if (savedVatAmount != null && savedVatAmount !== 0) {
        return savedVatAmount;
      }
      
      // 계산값 반환 (음수도 포함)
      return calculatedVat;
    }
    // 부가세가 적용되지 않았거나 amount가 없으면 0
    return 0;
  }, [data]);

  // BL과 컨테이너 정보 추출 헬퍼 (early return 이전에 정의)
  const getItemBl = React.useCallback((item: any) => {
    // 직접 필드 확인 (백엔드에서 미리 조인된 경우)
    if ((item as any).bl) return (item as any).bl;
    // salesItem -> container -> order 경로로 확인
    if (item.salesItem?.container?.order?.bl) return item.salesItem.container.order.bl;
    return null;
  }, []);

  const getItemContainerNo = React.useCallback((item: any) => {
    // 직접 필드 확인 (백엔드에서 미리 조인된 경우)
    if ((item as any).containerNo) return (item as any).containerNo;
    // salesItem -> container 경로로 확인
    if (item.salesItem?.container?.containerNo) return item.salesItem.container.containerNo;
    return null;
  }, []);

  // 금액 계산 (early return 이전에 계산)
  // 항상 항목들의 실제 amount 합산으로 계산 (백엔드 subtotal은 참고용)
  // 음수 항목(할인 등)도 포함하여 정확한 합계 계산
  const subtotal = React.useMemo(() => {
    if (!data || !sortedItems || sortedItems.length === 0) return 0;
    // 항목들의 amount 합산 (숫자 변환 보장, 음수도 포함)
    return sortedItems.reduce((sum, item) => {
      const amount = item.amount != null ? Number(item.amount) : 0;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
  }, [data, sortedItems]);

  const vat = React.useMemo(() => {
    if (!data || !sortedItems || sortedItems.length === 0) return 0;
    // 항목들의 부가세 합산으로 계산 (백엔드 vatAmount는 참고용)
    return sortedItems.reduce((sum, item) => {
      const itemVat = calculateItemVat(item, data);
      return sum + (isNaN(itemVat) ? 0 : itemVat);
    }, 0);
  }, [data, sortedItems, calculateItemVat]);

  const total = React.useMemo(() => {
    if (!data) return 0;
    // 공급가액 + 부가세로 계산 (백엔드 invoiceAmount는 참고용)
    // 명시적으로 숫자로 변환하여 계산 (문자열 연결 방지)
    const subtotalNum = Number(subtotal) || 0;
    const vatNum = Number(vat) || 0;
    return subtotalNum + vatNum;
  }, [data, subtotal, vat]);

  const totalQuantity = React.useMemo(() => {
    // 백엔드에서 계산된 totalQuantity가 있으면 우선 사용
    if (data?.totalQuantity != null) {
      return data.totalQuantity;
    }
    // 없으면 프론트엔드에서 계산 (수량이 null/undefined인 항목은 제외)
    return sortedItems.reduce((sum, item) => {
      // 수량이 null/undefined인 항목은 제외 (수동 입력 항목 등)
      if (item.quantity == null) return sum;
      return sum + (item.quantity || 0);
    }, 0);
  }, [data?.totalQuantity, sortedItems]);

  // 이미지 캡처 함수 (공통 로직, blob 반환)
  const captureInvoiceImage = React.useCallback(async (targetElement: HTMLElement): Promise<Blob> => {
    try {
      // html2canvas로 화면 캡처
      const html2canvas = (await import('html2canvas')).default;
      
      // 복제된 문서에서 lab 색상을 rgb로 변환하는 함수
      const fixLabColors = (doc: Document) => {
        const allElements = doc.querySelectorAll('*');
        allElements.forEach((el) => {
          const htmlEl = el as HTMLElement;
          try {
            // 현재 스타일 가져오기
            const computedStyle = window.getComputedStyle(htmlEl);
            
            // 배경색 처리
            const bgColor = computedStyle.backgroundColor;
            if (bgColor && (bgColor.includes('lab') || bgColor.includes('Lab'))) {
              // lab 색상이면 RGB로 변환
              if (bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                htmlEl.style.backgroundColor = '#ffffff';
              }
            }
            
            // 텍스트 색상 처리
            const textColor = computedStyle.color;
            if (textColor && (textColor.includes('lab') || textColor.includes('Lab'))) {
              htmlEl.style.color = '#000000';
            }
            
            // 테두리 색상 처리
            const borderColor = computedStyle.borderColor;
            if (borderColor && (borderColor.includes('lab') || borderColor.includes('Lab'))) {
              htmlEl.style.borderColor = '#000000';
            }
          } catch (e) {
            // 스타일 읽기 실패 시 무시
          }
        });
      };

      // 이미지가 모두 로드될 때까지 대기
      const images = targetElement.querySelectorAll('img');
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve, reject) => {
              if (img.complete) {
                resolve();
              } else {
                img.onload = () => resolve();
                img.onerror = () => resolve(); // 이미지 로드 실패해도 계속 진행
                setTimeout(() => resolve(), 2000); // 최대 2초 대기
              }
            })
        )
      );

      // 요소의 실제 렌더링 크기 가져오기
      const rect = targetElement.getBoundingClientRect();
      
      // 실제 렌더링된 너비와 높이
      const renderedWidth = rect.width || 800;
      const renderedHeight = Math.max(rect.height, targetElement.scrollHeight);

      const canvas = await html2canvas(targetElement, {
        backgroundColor: '#ffffff',
        scale: 1,
        logging: false,
        useCORS: true,
        allowTaint: false,
        //width: renderedWidth,
        //height: renderedHeight,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          fixLabColors(clonedDoc);
          
          // 복제된 요소의 오버플로우를 visible로 설정하여 스탬프 등이 잘리지 않도록 함
          const clonedElement = clonedDoc.querySelector('[data-invoice-print-view="true"]') as HTMLElement;
          if (clonedElement) {
            clonedElement.style.overflow = 'visible';
            clonedElement.style.width = `${renderedWidth}px`;
            clonedElement.style.minWidth = `${renderedWidth}px`;
            clonedElement.style.maxWidth = `${renderedWidth}px`;
            // 부모 컨테이너도 오버플로우 허용
            let parent = clonedElement.parentElement;
            while (parent && parent !== clonedDoc.body) {
              (parent as HTMLElement).style.overflow = 'visible';
              if (parent === clonedElement.parentElement) {
                (parent as HTMLElement).style.width = `${renderedWidth}px`;
                (parent as HTMLElement).style.minWidth = `${renderedWidth}px`;
                (parent as HTMLElement).style.maxWidth = `${renderedWidth}px`;
              }
              parent = parent.parentElement;
            }
          }
        
          const mainContainer = clonedDoc.querySelector('[data-invoice-print-view="true"]') as HTMLElement;
          if (mainContainer) {
            mainContainer.style.setProperty('margin-bottom', '0px', 'important');
            mainContainer.style.setProperty('padding-bottom', '0px', 'important');
            mainContainer.style.setProperty('letter-spacing', '2px', 'important');
          }

          const h1 = clonedDoc.querySelectorAll('h1');
          h1.forEach((h1) => {
            const h1El = h1 as HTMLElement;
            
            // vertical-align과 padding 강제 설정 (중앙 정렬 - 미리보기와 동일하게)
            h1El.style.setProperty('padding-bottom', '12px', 'important');
          });

          const custom = clonedDoc.querySelectorAll('.custom');
          custom.forEach((custom) => {
            const h1El = custom as HTMLElement;
            
            // vertical-align과 padding 강제 설정 (중앙 정렬 - 미리보기와 동일하게)
            h1El.style.setProperty('margin-top', '0px', 'important');
            h1El.style.setProperty('padding-top', '0px', 'important');
            h1El.style.setProperty('padding-bottom', '12px', 'important');
          });


          const price = clonedDoc.querySelectorAll('.price');
          price.forEach((price) => {
            const h1El = price as HTMLElement;
            
            // vertical-align과 padding 강제 설정 (중앙 정렬 - 미리보기와 동일하게)
            h1El.style.setProperty('margin-top', '0px', 'important');
            h1El.style.setProperty('padding-top', '0px', 'important');
            h1El.style.setProperty('padding-bottom', '10px', 'important');
            h1El.style.setProperty('letter-spacing', '1px', 'important');
            
          });

          // --- 테이블 셀 보정 로직 (이미지 다운로드용) ---
          // 테이블 스타일 보장 (html2canvas 렌더링 문제 해결)
          const tables = clonedDoc.querySelectorAll('table');
          tables.forEach((table) => {
            const tableEl = table as HTMLElement;
            tableEl.style.setProperty('border-collapse', 'collapse', 'important');
            tableEl.style.setProperty('border-spacing', '0', 'important');
            // 테이블의 border 제거
            tableEl.style.setProperty('border', 'none', 'important');
            
            const rows = Array.from(table.querySelectorAll('tr'));
            const totalRows = rows.length;
            
            // 모든 셀의 스타일 보장 및 border 재설정
            rows.forEach((row, rowIndex) => {
              const rowCells = Array.from(row.querySelectorAll('td, th'));
              
              rowCells.forEach((cell, colIndex) => {
                const cellEl = cell as HTMLElement;
                
                // box-sizing 보장
                cellEl.style.setProperty('box-sizing', 'border-box', 'important');
                // line-height 보장
                if (!cellEl.style.lineHeight) {
                  cellEl.style.setProperty('line-height', '1.6', 'important');
                }
                
                // 기존 border 완전히 제거
                cellEl.style.setProperty('border', 'none', 'important');
                cellEl.style.setProperty('border-top', 'none', 'important');
                cellEl.style.setProperty('border-right', 'none', 'important');
                cellEl.style.setProperty('border-bottom', 'none', 'important');
                cellEl.style.setProperty('border-left', 'none', 'important');
                
                // border를 조건부로 적용 (겹치는 부분 완전히 방지)
                const isFirstRow = rowIndex === 0;
                const isLastRow = rowIndex === totalRows - 1;
                const isFirstCol = colIndex === 0;
                const isLastCol = colIndex === rowCells.length - 1;
                
                // 모든 셀에 오른쪽과 아래쪽 border 적용 (내부 격자선)
                if (!isLastCol) {
                  cellEl.style.setProperty('border-right', '1px solid #000', 'important');
                }
                if (!isLastRow) {
                  cellEl.style.setProperty('border-bottom', '1px solid #000', 'important');
                }
                
                // 외곽선: 첫 번째 행, 마지막 행, 첫 번째 열, 마지막 열
                if (isFirstRow) {
                  cellEl.style.setProperty('border-top', '1px solid #000', 'important');
                }
                if (isLastRow) {
                  cellEl.style.setProperty('border-bottom', '1px solid #000', 'important');
                }
                if (isFirstCol) {
                  cellEl.style.setProperty('border-left', '1px solid #000', 'important');
                }
                if (isLastCol) {
                  cellEl.style.setProperty('border-right', '1px solid #000', 'important');
                }
              });
            });
          });
          
          const cells = Array.from(clonedDoc.querySelectorAll('td, th'));
          cells.forEach((cell) => {
            const cellEl = cell as HTMLElement;
            
            // vertical-align과 padding 강제 설정 (중앙 정렬 - 미리보기와 동일하게)
            cellEl.style.setProperty('vertical-align', 'middle', 'important');
            cellEl.style.setProperty('display', 'table-cell', 'important');
            cellEl.style.setProperty('padding-top', '0px', 'important');
            cellEl.style.setProperty('padding-bottom', '12px', 'important');
            
            // 셀 내부의 모든 자식 요소도 정렬 보정
            const childElements = cellEl.children;
            Array.from(childElements).forEach((child) => {
              const childEl = child as HTMLElement;
              childEl.style.setProperty('margin-top', '0', 'important');
              childEl.style.setProperty('margin-bottom', '0', 'important');
              childEl.style.setProperty('padding-top', '0', 'important');
              childEl.style.setProperty('padding-bottom', '0', 'important');
            });
          });
        
          
          // --- 추가: div 및 내부 p 태그 보정 로직 ---
          // 1. 왼쪽 공급받는자 정보를 담은 테두리 div 찾기
          const recipientDivs = clonedDoc.querySelectorAll('div[style*="min-height: 80px"]');
          recipientDivs.forEach((div) => {
            const divEl = div as HTMLElement;
            divEl.style.setProperty('display', 'flex', 'important');
            divEl.style.setProperty('flex-direction', 'column', 'important');
            divEl.style.setProperty('justify-content', 'center', 'important');
            divEl.style.setProperty('padding-top', '0px', 'important');
            divEl.style.setProperty('padding-bottom', '16px', 'important');
          });

          const paddingTopDivs = clonedDoc.querySelectorAll('div[style*="padding-top: 0px"]');
          paddingTopDivs.forEach((div) => {
            const divEl = div as HTMLElement;
            divEl.style.setProperty('margin-top', '0px', 'important');
          });
        
          // 2. 제목(거래명세서)과 공급자 테이블 사이의 레이아웃 배치 보정
          const topContainer = clonedDoc.querySelector('div[style*="align-items: flex-end"]');
          if (topContainer) {
            (topContainer as HTMLElement).style.setProperty('align-items', 'center', 'important');
          }
        }
      });

      // canvas를 blob으로 변환 (Promise로 처리)
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        try {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('이미지 변환 실패'));
              }
            },
            'image/png',
            1.0
          );
        } catch (error) {
          reject(error);
        }
      });

      if (!blob) {
        throw new Error('이미지 변환 실패');
      }

      return blob;
    } catch (error: any) {
      console.error('이미지 캡처 오류:', error);
      throw error;
    }
  }, []);

  // SMS 발송 핸들러 (early return 이전에 정의)
  const handleSendSms = React.useCallback(
    async (opts?: { message: string }) => {
    // 이미 발송 중이면 중복 호출 방지
    if (isSending) {
      return;
    }

    if (!data) {
      toast({
        title: '오류',
        description: '거래명세서 데이터를 불러올 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const storedMmsUrl = invoiceAttachmentDisplayUrl;
    const storedMmsPath = invoiceAttachmentStoredPath;

    if (!printViewRef.current) {
      toast({
        title: '오류',
        description: '거래명세서 영역을 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const recipientPhone = (data as { phone?: string | null; customer?: { phone?: string | null } | null }).phone
      ?? data?.customer?.phone;
    if (!recipientPhone) {
      toast({
        title: '오류',
        description: '수신자 전화번호가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    // SMS 발송 담당자 검증
    if (!selectedSmsManagerId) {
      toast({
        title: '오류',
        description: 'SMS 발송 담당자를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const selectedSender = smsSenders.find(s => s.id === selectedSmsManagerId);
    if (!selectedSender) {
      toast({
        title: '오류',
        description: '선택한 SMS 발신자 정보를 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedSender.phone) {
      toast({
        title: '오류',
        description: 'SMS 발신자의 전화번호가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      // 1. MMS 1번: 항상 거래명세서 미리보기와 동일 영역 캡처 후 업로드 (첨부 유무와 관계없이)
      const statementBlob = await captureInvoiceImage(printViewRef.current!);
      const statementFileName = `거래명세서_${data.invoiceNumber || data.id}_${format(new Date(), 'yyyyMMdd')}.png`;
      const statementFormData = new FormData();
      statementFormData.append('file', statementBlob, statementFileName);
      const statementUpload = await api.post<{ success: boolean; url: string; path: string }>(
        '/storage/upload/image',
        statementFormData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      if (!statementUpload.data.success || !statementUpload.data.url) {
        throw new Error('거래명세서 이미지 업로드 실패');
      }
      const mmsImageUrl = statementUpload.data.url;
      const mmsImagePath = statementUpload.data.path;

      // 2. MMS 2번: 발행·수정에서 등록한 첨부가 있으면 알리고 image2로 함께 전송
      const mmsImageUrl2 = storedMmsUrl?.trim() ? storedMmsUrl.trim() : undefined;
      const mmsImagePath2 =
        mmsImageUrl2 && invoiceAttachmentStoredPath?.trim()
          ? invoiceAttachmentStoredPath.trim()
          : undefined;

      // 3. 알리고 API로 MMS 발송
      const issuedDate = data.issuedAt
        ? format(new Date(data.issuedAt), 'yyyy-MM-dd', { locale: ko })
        : format(new Date(), 'yyyy-MM-dd', { locale: ko });

      // 발신번호는 선택된 SMS 발신자의 전화번호 사용
      const senderPhone = selectedSender.phone.replace(/[^0-9]/g, '');

      // 편집된 메시지 사용 (없으면 기본 메시지 생성)
      const messageText = opts?.message !== undefined ? opts.message : smsMessage;
      const message = messageText.trim() ? messageText : generateSmsMessage(data);

      // 사용한 템플릿 정보 찾기
      const usedTemplate = smsTemplates && smsTemplates.length > 0
        ? (smsTemplates.find(t => (t as any).isDefault) || smsTemplates[0])
        : null;

      const recipientName = (data as any).companyName ?? (data as any).ceo ?? data.customer?.companyName ?? undefined;
      await api.post('/aligo/sms/send', {
        message: message,
        recipients: [
          {
            phone: recipientPhone.replace(/[^0-9]/g, ''),
            name: recipientName,
          },
        ],
        sender: senderPhone,
        imageUrl: mmsImageUrl,
        ...(mmsImageUrl2
          ? {
              imageUrl2: mmsImageUrl2,
              imagePath2: mmsImagePath2,
            }
          : {}),
        // SMS 이력 저장용 추가 정보
        templateId: usedTemplate?.id,
        templateType: 'INVOICE',
        templateContent: usedTemplate?.content,
        imagePath: mmsImagePath ?? undefined,
        invoiceId: data.id,
        senderUserId: selectedSmsManagerId, // SMS 발신자 ID
      });
      
      // SMS 발송 후 거래명세서의 smsManagerId 업데이트
      if (invoiceId && selectedSmsManagerId) {
        try {
          await updateInvoiceMutation.mutateAsync({
            id: invoiceId,
            data: {
              customerId: data.customerId || '',
              invoiceNumber: data.invoiceNumber || null,
              netWeight: data.netWeight || null,
              items: data.items?.map((item) => ({
                order: item.order || 1,
                salesItemId: item.salesItemId || null,
                productName: item.productName || null,
                quantity: item.quantity || null,
                unit: item.unit || null,
                unitPrice: item.unitPrice || null,
                amount: item.amount || null,
                vatAmount: item.vatAmount || null,
                weight: item.weight || null,
                notes: item.notes || null,
              })) || [],
              notes: data.notes || null,
              vatApplied: data.vatApplied ?? false,
              vatRate: data.vatRate ?? 10,
              supplierId: data.supplierId ?? null,
              smsManagerId: selectedSmsManagerId,
            },
          });
        } catch (updateError) {
          // 업데이트 실패해도 SMS는 발송되었으므로 경고만 표시
          console.error('거래명세서 SMS 발송 담당자 업데이트 실패:', updateError);
        }
      }

      toast({
        title: '발송 완료',
        description: '거래명세서가 문자로 발송되었습니다.',
      });
    } catch (error: any) {
      console.error('문자 발송 오류:', error);
      toast({
        title: '발송 실패',
        description: error?.response?.data?.message || '거래명세서 발송 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  },
  [
    data,
    smsMessage,
    invoiceAttachmentDisplayUrl,
    invoiceAttachmentStoredPath,
    generateSmsMessage,
    selectedSmsManagerId,
    smsSenders,
    invoiceId,
    updateInvoiceMutation,
    captureInvoiceImage,
    isSending,
  ]
);

  // 이미지 다운로드 핸들러 (미리보기에서는 previewViewRef, 그 외에는 printViewRef 사용)
  const handleDownloadImage = React.useCallback(async () => {
    // 미리보기 다이얼로그가 열려있으면 previewViewRef 사용, 아니면 printViewRef 사용
    const targetRef = previewOpen && previewViewRef.current ? previewViewRef : printViewRef;
    
    if (!targetRef.current) {
      toast({
        title: '오류',
        description: '거래명세서 영역을 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsDownloading(true);
    try {
      const blob = await captureInvoiceImage(targetRef.current);

      // 다운로드
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = `거래명세서_${data?.invoiceNumber || data?.id || 'unknown'}_${format(new Date(), 'yyyyMMdd')}.png`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // URL 정리 (약간의 지연 후)
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      toast({
        title: '다운로드 완료',
        description: '거래명세서 이미지가 다운로드되었습니다.',
      });
    } catch (error: any) {
      console.error('이미지 다운로드 오류:', error);
      toast({
        title: '다운로드 실패',
        description: error?.message || '이미지 다운로드 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  }, [data, previewOpen, captureInvoiceImage]);

  // 인쇄용 컴포넌트에 전달할 데이터 준비 (early return 이전에 정의)
  const printViewData = React.useMemo(() => {
    if (!data) return null;

    const issuedDate = data.issuedAt ? new Date(data.issuedAt) : new Date();
    const invoiceNumber = data.invoiceNumber || '';

    // 공급자 정보: 선택된 공급자가 있으면 사용, 없으면 회사 정보 사용
    const supplier = data.supplier
      ? {
          serialNumber: invoiceNumber,
          tel: data.supplier.tel || '',
          businessRegistrationNumber: data.supplier.businessRegistrationNumber || '',
          name: data.supplier.representativeName || '',
          companyName: data.supplier.companyName || '',
          address: data.supplier.address || '',
        }
      : companyInfo
      ? {
          serialNumber: invoiceNumber,
          tel: companyInfo.tel || '',
          businessRegistrationNumber: companyInfo.businessRegistrationNumber || '',
          name: companyInfo.representativeName || '',
          companyName: companyInfo.companyName || '',
          address: companyInfo.address || '',
        }
      : null;

    if (!supplier) return null;

    // 공급받는자 정보: 발행 시점 스냅샷 우선, 없으면 customer fallback
    const recipient = {
      companyName: (data as any).companyName ?? data.customer?.companyName ?? '',
      ceo: (data as any).ceo ?? data.customer?.ceo ?? '',
      address: (data.customer as any)?.address || '',
      phone: (data as any).phone ?? data.customer?.phone ?? '',
    };

    // 거래명세서 항목 데이터
    const invoiceItems = sortedItems.map((item) => {
      const itemDate = (item as any).date
        ? (item as any).date
        : format(issuedDate, 'MM/dd', { locale: ko });
      const itemVat = calculateItemVat(item, data);

      return {
        date: itemDate,
        productName: item.productName || '',
        specification: (item as any).specification || undefined,
        quantity: item.quantity ?? 0,
        unit: item.unit || '',
        unitPrice: item.unitPrice ?? 0, // 음수도 허용하므로 ?? 사용
        amount: item.amount ?? 0, // 음수도 허용하므로 ?? 사용
        vatAmount: itemVat,
      };
    });

    // 전일잔액 계산
    // 발행된 거래명세서는 저장된 값을 사용, 저장된 값이 없으면 발행일 기준으로 계산
    let previousBalance: number | null = null;
    
    if (data.status === 'ISSUED' && (data as any).previousBalance != null) {
      // 발행된 거래명세서: 저장된 전일잔액 사용
      previousBalance = Number((data as any).previousBalance) || 0;
    } else {
      // 미발행 거래명세서 또는 기존 발행 거래명세서(previousBalance가 null): 발행일 기준으로 계산
      // 기존 미수금(채권 잔액) 계산: 발행일 이전의 채권 balance 합산
      let previousReceivableBalance = 0;
      if (receivablesData?.data && data?.customer?.id) {
        const issuedDate = data.issuedAt ? new Date(data.issuedAt) : new Date();
        receivablesData.data.forEach((receivable) => {
          // 같은 고객의 채권만
          if (receivable.customerId === data.customer?.id) {
            const receivableOccurredDate = receivable.occurredDate 
              ? new Date(receivable.occurredDate)
              : null;
            
            // 발행일 이전의 채권만 포함
            // 주의: 현재 시점의 balance를 사용하므로, 발행 후 입금이 발생한 경우 정확하지 않을 수 있음
            // 하지만 기존 발행 거래명세서의 경우 발행일 이전 채권만 계산하므로 어느 정도는 맞음
            if (receivableOccurredDate && receivableOccurredDate < issuedDate) {
              // balance는 receivableDetail에서 가져오거나 계산
              const balance = receivable.balance != null 
                ? Number(receivable.balance) 
                : (Number(receivable.outstandingAmount) - Number(receivable.collectedAmount || 0));
              previousReceivableBalance += balance;
            }
          }
        });
      }
      
      // 전일잔액 = 기존 미수금 - 선입금 차감액
      // 선입금 차감액도 발행일 기준으로 계산해야 하지만, 현재는 실시간 계산값 사용
      // (기존 발행 거래명세서의 경우 발행일 이전 선입금만 차감되므로 어느 정도는 맞음)
      previousBalance = previousReceivableBalance - finalPrepaymentDeducted;
    }
    
    // 디버깅용 로그
    console.log('[InvoiceDetailDrawer] 전일잔액 계산:', {
      invoiceId,
      status: data.status,
      savedPreviousBalance: (data as any).previousBalance,
      previousBalance,
      previousReceivableBalance: data.status !== 'ISSUED' ? 'calculated' : 'N/A',
      finalPrepaymentDeducted,
      total,
    });
    
    // 금일잔액 = 합계 + 전일잔액 (전일잔액이 없으면 합계와 동일)
    // 항상 숫자로 계산 (null이 되지 않도록)
    const totalNum = Number(total) || 0;
    const previousBalanceNum = previousBalance != null ? Number(previousBalance) : 0;
    const currentBalance = totalNum + previousBalanceNum;
    
    // 디버깅용 로그
    console.log('[InvoiceDetailDrawer] 금일잔액 계산:', {
      total,
      totalNum,
      previousBalance,
      previousBalanceNum,
      currentBalance,
    });
    
    return {
      supplier,
      recipient,
      invoice: {
        invoiceNumber,
        issuedAt: issuedDate,
        items: invoiceItems,
        subtotal,
        vatAmount: vat,
        total,
        totalQuantity,
        previousBalance,
        currentBalance,
      },
    };
  }, [data, companyInfo, sortedItems, subtotal, vat, total, totalQuantity, calculateItemVat, finalPrepaymentDeducted, receivablesData]);

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
              <div className="flex items-center gap-3">
                <DrawerTitle>{title}</DrawerTitle>
                {data && (() => {
                  const statusStyle = getStatusStyle(data.status);
                  return (
                    <>
                      <Badge variant={statusStyle.variant} className={statusStyle.className}>
                        {getStatusLabel(data.status)}
                      </Badge>
                      {data.invoiceCancelled && (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300 text-xs"
                        >
                          취소
                        </Badge>
                      )}
                      {data.salesCancelled && (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300 text-xs"
                        >
                          판매 취소
                        </Badge>
                      )}
                    </>
                  );
                })()}
              </div>
              <DrawerDescription>{description}</DrawerDescription>
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
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !data ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">거래명세서 정보를 찾을 수 없습니다.</p>
              </div>
            ) : (
              <>
            {/* 거래명세서 기본 정보 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">거래명세서 기본 정보</h3>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">거래명세서 번호</span>
                  <span className="text-sm font-medium font-mono">{data.invoiceNumber || '-'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">발행일시</span>
                  <span className="text-sm font-medium">
                    {data.issuedAt ? formatDateTime(data.issuedAt) : '-'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">발행자</span>
                  <span className="text-sm font-medium">{data.issuedByUser?.name || '-'}</span>
                </div>
                {data.netWeight != null && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">계근 중량</span>
                    <span className="text-sm font-medium">
                      {formatNumber(data.netWeight, 4)} kg
                    </span>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* 공급자 정보 */}
            {data.supplier && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">공급자 정보</h3>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">상호 (회사명)</span>
                      <span className="text-sm font-medium">{data.supplier.companyName || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">대표자</span>
                      <span className="text-sm font-medium">{data.supplier.representativeName || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">사업자등록번호</span>
                      <span className="text-sm font-medium font-mono">{data.supplier.businessRegistrationNumber || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">전화번호</span>
                      <span className="text-sm font-medium">{data.supplier.tel ? formatPhone(data.supplier.tel) : '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1 md:col-span-4">
                      <span className="text-xs text-muted-foreground">주소</span>
                      <span className="text-sm font-medium">{data.supplier.address || '-'}</span>
                    </div>
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* SMS 발송 담당자 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">SMS 발송 담당자</h3>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">발신자</span>
                  <span className="text-sm font-medium">
                    {(() => {
                      if (!data.smsManagerId) return '-';
                      const sender = smsSenders.find(s => s.id === data.smsManagerId);
                      if (sender) {
                        return `${sender.name} (${formatPhone(sender.phone)})`;
                      }
                      // 기존 사용자 ID로 저장된 경우 (하위 호환성)
                      if (data.smsManager) {
                        return `${data.smsManager.name}${data.smsManager.phone ? ` (${formatPhone(data.smsManager.phone)})` : ''}`;
                      }
                      return '-';
                    })()}
                  </span>
                </div>
              </div>
            </section>

            <Separator />

            {/* 수취인 정보 (발행 시점 스냅샷 우선) */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">수취인 정보</h3>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">전화번호</span>
                  <span className="text-sm font-medium">
                    {(data as any)?.phone ?? data.customer?.phone ? formatPhone((data as any)?.phone ?? data.customer?.phone) : '-'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">업체명 / 농장명</span>
                  <span className="text-sm font-medium">
                    {((data as any)?.companyName ?? data.customer?.companyName) || '-'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">대표자</span>
                  <span className="text-sm font-medium">
                    {((data as any)?.ceo ?? data.customer?.ceo) || '-'}
                  </span>
                </div>
              </div>
            </section>

            <Separator />

            {/* 선입금 정보 */}
            {customerId && relevantPrepayments.length > 0 && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">선입금 정보</h3>
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
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {relevantPrepayments.map((prepayment: PrepaymentListItem) => (
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
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {finalPrepaymentDeducted > 0 && (
                      <div className="text-sm text-muted-foreground">
                        * 총 <span className="font-semibold text-foreground">{formatNumber(finalPrepaymentDeducted, 0)}원</span>이 차감되었습니다.
                      </div>
                    )}
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 부가세 설정 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">부가세 설정</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">부가세 적용</span>
                  <span className="text-sm font-medium">
                    {data.vatApplied ? '적용' : '미적용'}
                  </span>
                </div>
                {data.vatApplied && data.vatRate != null && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">부가세율 (%)</span>
                    <span className="text-sm font-medium">
                      {formatNumber(data.vatRate, 2)}
                    </span>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* 거래명세서 항목 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">거래명세서 항목</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">순서</TableHead>
                      <TableHead>품목명</TableHead>
                      <TableHead className="w-24">BL</TableHead>
                      <TableHead className="w-32">컨테이너</TableHead>
                      <TableHead className="w-40">수량(단위 포함)</TableHead>
                      <TableHead className="w-24">단가</TableHead>
                      <TableHead className="w-32">공급가액</TableHead>
                      <TableHead className="w-32">부가세</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          거래명세서 항목이 없습니다
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedItems.map((item, index) => {
                        const itemVat = calculateItemVat(item, data);
                        const itemBl = getItemBl(item);
                        const itemContainerNo = getItemContainerNo(item);
                        return (
                          <TableRow key={item.id || index}>
                            <TableCell>{item.order || index + 1}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {item.productName || '-'}
                                {(item as any).specification &&
                                  ` (${abbreviateHeavyPackingSpec(String((item as any).specification))})`}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{itemBl || '-'}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{itemContainerNo || '-'}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {item.quantity != null
                                  ? `${formatNumber(item.quantity, 4)} ${item.unit || ''}`
                                  : '-'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {item.unitPrice != null ? formatNumber(item.unitPrice, 0) + '원' : '-'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">
                                {item.amount != null ? formatNumber(item.amount, 0) + '원' : '-'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">
                                {itemVat !== 0 ? formatNumber(itemVat, 0) + '원' : '0원'}
                              </div>
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
                    {formatNumber(totalQuantity, 4)}
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
                {data?.customer?.id && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">전일잔액</span>
                      <span className="text-sm font-medium">
                        {(data as any).previousBalance != null
                          ? Number((data as any).previousBalance) < 0
                            ? `-${formatNumber(Math.abs(Number((data as any).previousBalance)), 0)}원`
                            : formatNumber(Number((data as any).previousBalance), 0) + '원'
                          : '0원'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">금일잔액</span>
                      <span className="text-sm font-semibold">
                        {formatNumber(total + (Number((data as any).previousBalance) || 0), 0)}원
                      </span>
                    </div>
                  </>
                )}
                {finalPrepaymentDeducted > 0 && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">선입금 차감</span>
                      <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                        -{formatNumber(finalPrepaymentDeducted, 0)}원
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-semibold">
                        {total - finalPrepaymentDeducted < 0 ? '초과 입금액 (환불)' : '차감 후 미수금액'}
                      </span>
                      <span className={`text-sm font-semibold ${
                        total - finalPrepaymentDeducted < 0 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : ''
                      }`}>
                        {formatNumber(total - finalPrepaymentDeducted, 0)}원
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>

            {invoiceAttachmentDisplayUrl ? (
              <>
                <Separator />
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 shrink-0" />
                    첨부 이미지
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    발행·수정 화면에서 등록한 이미지입니다. (1장) · 썸네일을 누르면 크게 볼 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setInvoiceAttachmentPreviewOpen(true)}
                    className="rounded-lg border overflow-hidden bg-muted/30 p-1 flex justify-center max-w-full w-fit cursor-pointer transition hover:ring-2 hover:ring-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <img
                      src={invoiceAttachmentDisplayUrl}
                      alt="거래명세서 첨부 이미지 (크게 보기)"
                      className="max-h-32 max-w-[200px] w-auto object-contain"
                    />
                  </button>
                </section>
              </>
            ) : null}

            {/* 비고 */}
            {data.notes && (
              <>
                <Separator />
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">비고</h3>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium whitespace-pre-wrap">{data.notes}</span>
                  </div>
                </section>
              </>
            )}

            <Separator />

            {/* SMS 발송 이력 */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">SMS 발송 이력</h3>
                <div className="flex items-center gap-2">
                  {data?.smsNotApplicable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (invoiceId) updateSmsNotApplicable.mutate({ invoiceId, smsNotApplicable: false });
                      }}
                      disabled={updateSmsNotApplicable.isPending}
                    >
                      {updateSmsNotApplicable.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '해당없음 해제'}
                    </Button>
                  ) : !latestSmsHistory && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (invoiceId) updateSmsNotApplicable.mutate({ invoiceId, smsNotApplicable: true });
                      }}
                      disabled={updateSmsNotApplicable.isPending}
                    >
                      {updateSmsNotApplicable.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'SMS 해당없음으로 설정'}
                    </Button>
                  )}
                  {latestSmsHistory && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSmsHistoryDetailOpen(true)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      상세보기
                    </Button>
                  )}
                </div>
              </div>
              {data?.smsNotApplicable ? (
                <div className="text-sm text-slate-600 dark:text-slate-400 py-4 flex items-center gap-2">
                  <Badge variant="outline" className="border-slate-400 bg-slate-100 text-slate-600 dark:border-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                    해당없음
                  </Badge>
                  <span>SMS 발송을 하지 않는 업체입니다.</span>
                </div>
              ) : !latestSmsHistory ? (
                <div className="text-sm text-muted-foreground py-4">
                  발송 이력이 없습니다.
                </div>
              ) : (
                <Card className="py-0">
                  <CardContent className="p-4 space-y-3">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">발송일시</span>
                        <span className="text-sm font-medium">
                          {latestSmsHistory.sentAt 
                            ? formatDateTime(latestSmsHistory.sentAt)
                            : latestSmsHistory.createdAt
                            ? formatDateTime(latestSmsHistory.createdAt)
                            : '-'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">상태</span>
                        <div>
                          {(() => {
                            const status = latestSmsHistory.status;
                            if (!status) {
                              return (
                                <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
                                  -
                                </Badge>
                              );
                            }
                            
                            const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
                              SENT: {
                                variant: 'outline',
                                className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
                              },
                              PENDING: {
                                variant: 'outline',
                                className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
                              },
                              FAILED: {
                                variant: 'outline',
                                className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
                              },
                              CANCELLED: {
                                variant: 'outline',
                                className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
                              },
                            };

                            const style = statusStyles[status];
                            if (!style) {
                              return (
                                <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
                                  {status}
                                </Badge>
                              );
                            }

                            const statusCode = statusCodes?.data?.find((code: { value?: string | null; name: string }) => code.value === status);
                            const statusLabel = statusCode?.name || (status === 'SENT' ? '발송완료' : status === 'PENDING' ? '대기' : status === 'FAILED' ? '실패' : status === 'CANCELLED' ? '취소' : status);

                            return (
                              <Badge variant={style.variant} className={style.className}>
                                {statusLabel}
                              </Badge>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">수신자</span>
                        <span className="text-sm font-medium">
                          {latestSmsHistory.recipientPhone ? formatPhone(latestSmsHistory.recipientPhone) : '-'}
                          {latestSmsHistory.recipientName && (
                            <span className="text-muted-foreground ml-1">({latestSmsHistory.recipientName})</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            <Separator />

            {/* 이카운트 ERP 처리 */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">이카운트 ERP 처리</h3>
                {data && data.ecountProcessingStatus !== 'PROCESSED' && data.ecountProcessingStatus !== 'NOT_APPLICABLE' && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        if (invoiceId) {
                          updateEcountProcessingStatus.mutate({ invoiceId, status: 'PROCESSED' });
                        }
                      }}
                      disabled={updateEcountProcessingStatus.isPending}
                    >
                      {updateEcountProcessingStatus.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                          처리 완료
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (invoiceId) {
                          updateEcountProcessingStatus.mutate({ invoiceId, status: 'NOT_APPLICABLE' });
                        }
                      }}
                      disabled={updateEcountProcessingStatus.isPending}
                    >
                      해당없음
                    </Button>
                  </div>
                )}
                {data && data.ecountProcessingStatus === 'NOT_APPLICABLE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (invoiceId) {
                        updateEcountProcessingStatus.mutate({ invoiceId, status: 'NOT_PROCESSED' });
                      }
                    }}
                    disabled={updateEcountProcessingStatus.isPending}
                  >
                    {updateEcountProcessingStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '미처리로 변경'}
                  </Button>
                )}
              </div>
              {data && data.ecountProcessingStatus === 'PROCESSED' ? (
                <Card className="py-0">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle className="h-5 w-5" />
                      <div className="flex-1">
                        <div className="font-semibold">처리 완료</div>
                        <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                          {data.ecountProcessedAt && (
                            <div>처리일시: {formatDateTime(data.ecountProcessedAt)}</div>
                          )}
                          {data.ecountProcessedByUser && (
                            <div>처리자: {data.ecountProcessedByUser.name}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : data.ecountProcessingStatus === 'NOT_APPLICABLE' ? (
                <div className="text-sm text-slate-600 dark:text-slate-400 py-4 flex items-center gap-2">
                  <Badge variant="outline" className="border-slate-400 bg-slate-100 text-slate-600 dark:border-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                    해당없음
                  </Badge>
                  <span>이카운트 처리 대상이 아닙니다.</span>
                </div>
              ) : data.ecountProcessingStatus === 'NEEDS_CONFIRMATION' ? (
                <div className="text-sm text-amber-700 dark:text-amber-400 py-4 space-y-1">
                  <div className="font-medium">거래명세서가 수정되어 확인이 필요합니다.</div>
                  <div className="text-muted-foreground">이카운트에 반영 후 처리 완료를 눌러주세요.</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4">
                  이카운트 ERP에 입력 대기 중입니다.
                </div>
              )}
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
                variant="outline"
                disabled={!printViewData || isDownloading}
                onClick={handleDownloadImage}
              >
                {isDownloading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-4 w-4" />
                )}
                거래명세서 다운로드
              </Button>
              <Button
                variant="outline"
                disabled={!printViewData}
                onClick={() => {
                  setSmsMessage('');
                  setPreviewOpen(true);
                }}
              >
                <Send className="mr-1.5 h-4 w-4" />
                미리보기 후 SMS 발송
              </Button>
              {data?.status === 'ISSUED' && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={deleteInvoiceMutation.isPending}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  {deleteInvoiceMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1.5 h-4 w-4" />
                  )}
                  발행 취소
                </Button>
              )}
              {data && (
                <Button
                  variant="default"
                  onClick={() => {
                    setEditDrawerOpen(true);
                  }}
                >
                  <Edit className="mr-1.5 h-4 w-4" />
                  수정
                </Button>
              )}
            </div>
          </div>
        </DrawerFooter>

        {/* 거래명세서 발행 취소 확인 */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>거래명세서 발행 취소</DialogTitle>
              <DialogDescription>
                이 거래명세서 발행을 취소하면 채권에서 해당 금액이 자동으로 차감됩니다. 취소 후 필요 시 올바른 내용으로 다시 발행할 수 있습니다. 계속하시겠습니까?
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                닫기
              </Button>
              <Button
                variant="destructive"
                disabled={!data?.id || deleteInvoiceMutation.isPending}
                onClick={async () => {
                  if (!data?.id) return;
                  try {
                    await deleteInvoiceMutation.mutateAsync(data.id);
                    setDeleteConfirmOpen(false);
                    onOpenChange(false);
                    onSuccess?.();
                  } catch {
                    // toast is from mutation onError
                  }
                }}
              >
                {deleteInvoiceMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                발행 취소하기
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 첨부 이미지 원본 크기 보기 */}
        <Dialog open={invoiceAttachmentPreviewOpen} onOpenChange={setInvoiceAttachmentPreviewOpen}>
          <DialogContent className="max-w-[min(96vw,1200px)] max-h-[90vh] flex flex-col gap-2 p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>첨부 이미지</DialogTitle>
              <DialogDescription>
                원본에 가깝게 표시합니다. 화면보다 크면 스크롤해 보세요.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-auto max-h-[min(82vh,880px)] rounded-md border bg-muted/20 p-2 flex justify-center">
              {invoiceAttachmentDisplayUrl ? (
                <img
                  src={invoiceAttachmentDisplayUrl}
                  alt="거래명세서 첨부 이미지 원본"
                  className="max-w-none w-auto h-auto max-h-[min(80vh,860px)] object-contain"
                />
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        {/* 숨겨진 인쇄용 컴포넌트 */}
        {printViewData && (
          <div 
            style={{ 
              position: 'absolute', 
              left: '-9999px', 
              opacity: 0, 
              pointerEvents: 'none',
              width: '800px',
              backgroundColor: '#ffffff',
              padding: '0',
            }}
          >
            <InvoicePrintView
              ref={printViewRef}
              supplier={printViewData.supplier}
              recipient={printViewData.recipient}
              invoice={printViewData.invoice}
            />
          </div>
        )}
      </DrawerContent>

      {/* 거래명세서 미리보기 Dialog */}
      <Dialog 
        open={previewOpen} 
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) {
            setSmsMessage('');
          }
        }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
            <DialogTitle>거래명세서 미리보기 및 SMS 발송</DialogTitle>
            <DialogDescription>
              MMS에는 거래명세서 화면 캡처 1장이 항상 포함됩니다. 발행·수정에서 첨부 이미지를 등록한 경우 추가로 1장 더 보내 총 2장이 전송됩니다. SMS 메시지를 확인·편집한 뒤 발송하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-6 pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-4">
              {/* 거래명세서 미리보기 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">거래명세서 미리보기</h3>
                </div>
                <div className="border rounded-lg overflow-auto bg-gray-50 p-4" >
                  {printViewData ? (
                    <div 
                      style={{ 
                        backgroundColor: '#ffffff', 
                        padding: '0',
                        width: '100%',
                        margin: '0 auto',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                    >
                      <InvoicePrintView
                        ref={previewViewRef}
                        supplier={printViewData.supplier}
                        recipient={printViewData.recipient}
                        invoice={printViewData.invoice}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-sm text-muted-foreground">거래명세서 데이터를 불러올 수 없습니다.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 shrink-0" />
                    MMS에 포함될 이미지
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">1번(필수):</span> 발송 시점의 거래명세서 미리보기(위)와 동일한 영역이 캡처되어 전송됩니다.
                  </p>
                  {invoiceAttachmentDisplayUrl ? (
                    <>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <span className="font-medium text-foreground">2번(추가):</span> 아래 등록 첨부 이미지가 함께 전송됩니다.
                      </p>
                      <div className="border rounded-lg overflow-auto bg-gray-50 p-4 w-full">
                        <div
                          className="w-full bg-white mx-auto"
                          style={{
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          }}
                        >
                          <img
                            src={invoiceAttachmentDisplayUrl}
                            alt="등록된 첨부 이미지 미리보기"
                            className="w-full h-auto object-contain max-h-[min(70vh,900px)] block"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      등록된 첨부 이미지가 없어 MMS는 거래명세서 캡처 1장만 전송됩니다.
                    </p>
                  )}
                </div>
              </div>

              {/* SMS 메시지 편집 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    SMS 발송 메시지
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (data) {
                        const defaultMessage = generateSmsMessage(data);
                        setSmsMessage(defaultMessage);
                      }
                    }}
                    className="h-7 text-xs"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    기본값으로 복원
                  </Button>
                </div>
                <Card className="border-2">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="sms-message" className="text-xs text-muted-foreground">
                          발송 메시지 내용
                        </Label>
                        <Textarea
                          id="sms-message"
                          value={smsMessage}
                          onChange={(e) => setSmsMessage(e.target.value)}
                          placeholder="SMS 메시지를 입력하세요..."
                          className="min-h-[400px] font-mono text-sm resize-none"
                          style={{ whiteSpace: 'pre-wrap' }}
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>메시지 길이: {smsMessage.length}자</span>
                          <span>
                            {((data as any)?.phone ?? data?.customer?.phone) ? (
                              <span className="text-green-600">수신자: {formatPhone((data as any)?.phone ?? data?.customer?.phone)}</span>
                            ) : (
                              <span className="text-red-600">수신자 전화번호 없음</span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sms-manager-select" className="text-xs text-muted-foreground">
                          SMS 발송 담당자
                        </Label>
                        <Select
                          value={selectedSmsManagerId ? String(selectedSmsManagerId) : undefined}
                          onValueChange={(value) => {
                            if (value && value !== 'null') {
                              setSelectedSmsManagerId(Number(value));
                            } else {
                              setSelectedSmsManagerId(undefined);
                            }
                          }}
                        >
                          <SelectTrigger id="sms-manager-select">
                            <SelectValue placeholder="SMS 발신자를 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            {smsSenders.length === 0 ? (
                              <SelectItem value="null" disabled>
                                SMS 발신자가 없습니다
                              </SelectItem>
                            ) : (
                              smsSenders.map((sender) => (
                                <SelectItem key={sender.id} value={String(sender.id)}>
                                  {sender.name} ({formatPhone(sender.phone)})
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {selectedSmsManagerId && (
                          <div className="text-xs text-muted-foreground">
                            {(() => {
                              const sender = smsSenders.find(s => s.id === selectedSmsManagerId);
                              if (!sender) return null;
                              return (
                                <div className="space-y-1">
                                  <div>발신자: {sender.name}</div>
                                  <div>전화번호: {formatPhone(sender.phone)}</div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          <div className="px-6 pb-6 pt-4 border-t flex justify-end gap-2 flex-shrink-0 bg-gray-50">
            <Button
              variant="outline"
              disabled={!printViewData || isDownloading}
              onClick={handleDownloadImage}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              거래명세서 다운로드
            </Button>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              닫기
            </Button>
            <Button
              variant="default"
              disabled={!((data as any)?.phone ?? data?.customer?.phone) || !selectedSmsManagerId || isSending || !smsMessage.trim()}
              onClick={async () => {
                if (isSending) return;
                const snapMessage = smsMessage;
                setPreviewOpen(false);
                await new Promise((resolve) => setTimeout(resolve, 100));
                await handleSendSms({ message: snapMessage });
              }}
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  발송 중...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-4 w-4" />
                  SMS 발송
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SMS 이력 상세 Drawer */}
      {latestSmsHistory && (
        <SmsHistoryDetailDrawer
          open={smsHistoryDetailOpen}
          onOpenChange={setSmsHistoryDetailOpen}
          historyId={latestSmsHistory.id}
        />
      )}

      {/* 수정 Drawer - 중첩으로 열림 (항상 렌더링하여 애니메이션 보장) */}
      <InvoiceIssueDrawer
        open={editDrawerOpen && !!data}
        onOpenChange={(open) => {
          setEditDrawerOpen(open);
          if (!open) {
            // 수정 drawer가 닫힐 때 상세 drawer는 유지하고 데이터만 갱신
            refetch();
          }
        }}
        customerId={data?.customerId || undefined}
        invoiceId={data?.id || null}
        onSuccess={async () => {
          setEditDrawerOpen(false);
          await refetch();
          // 페이지의 데이터도 갱신하기 위해 queryClient 사용
          if (data?.id) {
            await queryClient.invalidateQueries({ queryKey: ['invoices'] });
            await queryClient.invalidateQueries({ queryKey: ['invoice', data.id] });
          }
          onSuccess?.();
        }}
      />
    </Drawer>
  );
};

