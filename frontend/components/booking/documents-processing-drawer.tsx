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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Loader2, X, FileCheck, Eye, Folder, Search, AlertTriangle } from 'lucide-react';
import { DatePicker } from '@/components/schedules/date-picker';
import { toastSuccess, toastApiError, toastError } from '@/lib/utils/toast-helpers';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrder, useUpdateTradeOrder } from '@/lib/hooks/use-trade-orders';
import { useTradeContract } from '@/lib/hooks/use-trade-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import api from '@/lib/api';

interface DocumentsProcessingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: TradeOrder | null;
  onSuccess?: () => void;
}

type InvoiceAnalysisResponse = {
  fileName: string;
  originalFileName?: string | null;
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
    bales: number | null;
    tradeBales?: number | null;
    salesBales?: number | null;
    unitPrice?: number | null;
  }>;
  containerComparisons?: Array<{
    containerNo: string | null;
    containerNoMatched: boolean | null;
    unitPriceMatched: boolean | null;
    existingContainerNo: string | null;
    existingUnitPrice: number | null;
    analyzedContainerNo: string | null;
    analyzedUnitPrice: number | null;
  }>;
};

export function DocumentsProcessingDrawer({
  open,
  onOpenChange,
  booking,
  onSuccess,
}: DocumentsProcessingDrawerProps) {
  const isMobile = useIsMobile();
  const updateMutation = useUpdateTradeOrder();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<InvoiceAnalysisResponse | null>(null);
  const [analysisMessage, setAnalysisMessage] = React.useState<string | null>(null);
  
  // 계약 정보 조회 (기본값 설정을 위해)
  const { data: contractData } = useTradeContract(booking?.contractId ?? undefined);
  
  // 패킹 타입 코드 조회 (패킹 타입 변환을 위해)
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  
  // 송장 파일
  const [invoiceFile, setInvoiceFile] = React.useState<GoogleDriveFile | null>(null);
  // 통관예정일
  const [customsScheduledDate, setCustomsScheduledDate] = React.useState<string>('');
  const [invoiceFilePickerOpen, setInvoiceFilePickerOpen] = React.useState(false);
  const [invoiceFilePreviewOpen, setInvoiceFilePreviewOpen] = React.useState(false);

  // 불일치 확인 모달
  const [mismatchConfirmDialogOpen, setMismatchConfirmDialogOpen] = React.useState(false);
  const [mismatchConfirmed, setMismatchConfirmed] = React.useState(false);

  // 컨테이너별 처리 옵션 (Phase 2): 'add' | 'match' | 'exclude'
  const [containerActions, setContainerActions] = React.useState<
    Record<string, 'add' | 'match' | 'exclude'>
  >({});

  // 기존 송장 파일 메타데이터 조회
  const invoiceFileId = booking?.invoiceGoogleDriveFileId || null;
  const shouldFetchMetadata = open && !!booking?.invoiceGoogleDriveFileId;
  
  const { data: existingInvoiceFileMetadata } = useGoogleDriveFileMetadata(
    invoiceFileId,
    shouldFetchMetadata,
  );

  // booking이 변경되면 초기화
  React.useEffect(() => {
    if (booking) {
      // 기존 파일 메타데이터가 있으면 설정
      if (existingInvoiceFileMetadata) {
        setInvoiceFile(existingInvoiceFileMetadata);
      } else {
        setInvoiceFile(null);
      }
      // 통관예정일 설정 (기존 값이 있으면)
      setCustomsScheduledDate(booking.customsScheduledDate || '');
      // 분석 결과 초기화
      setAnalysisResult(null);
      setAnalysisMessage(null);
      // 컨테이너 처리 옵션 초기화
      setContainerActions({});
      setMismatchConfirmed(false);
    }
  }, [booking, existingInvoiceFileMetadata]);

  // 파일이 변경되면 분석 결과 초기화
  React.useEffect(() => {
    setAnalysisResult(null);
    setAnalysisMessage(null);
  }, [invoiceFile]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (mismatchConfirmDialogOpen) {
        e.preventDefault();
        setMismatchConfirmDialogOpen(false);
        return;
      }
      if (invoiceFilePreviewOpen) {
        e.preventDefault();
        setInvoiceFilePreviewOpen(false);
        return;
      }
      if (invoiceFilePickerOpen) {
        e.preventDefault();
        setInvoiceFilePickerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, mismatchConfirmDialogOpen, invoiceFilePreviewOpen, invoiceFilePickerOpen, onOpenChange]);

  const handleAnalyze = async () => {
    if (!booking) return;
    if (!invoiceFile) {
      toastError('송장 파일 필요', '송장 파일을 선택해주세요.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisMessage(null);
    setAnalysisResult(null);

    try {
      const response = await api.post<InvoiceAnalysisResponse>(
        `/trade/contracts/orders/${booking.id}/invoice/analyze`,
        {
          googleDriveFileId: invoiceFile.id,
        },
      );

      const data = response.data ?? {};
      setAnalysisMessage(data.message ?? '송장 분석이 완료되었습니다. 결과를 확인해주세요.');
      setAnalysisResult(data);
    } catch (error: any) {
      console.error('송장 분석 중 오류가 발생했습니다.', error);
      const axiosError = error as any;
      const responseMessage = axiosError.response?.data?.message;
      const fallbackMessage = '송장 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      setAnalysisMessage(
        Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? fallbackMessage,
      );
      toastApiError(error, '송장 분석 실패');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 불일치 컨테이너 확인
  const hasMismatchedContainers = React.useMemo(() => {
    if (!analysisResult?.containerComparisons) return false;
    return analysisResult.containerComparisons.some(
      (comparison) =>
        comparison.containerNoMatched === false || comparison.unitPriceMatched === false
    );
  }, [analysisResult]);

  // 불일치 컨테이너 통계
  const mismatchStats = React.useMemo(() => {
    if (!analysisResult?.containerComparisons) {
      return { containerNoMismatch: 0, unitPriceMismatch: 0, total: 0 };
    }
    const containerNoMismatch = analysisResult.containerComparisons.filter(
      (c) => c.containerNoMatched === false
    ).length;
    const unitPriceMismatch = analysisResult.containerComparisons.filter(
      (c) => c.unitPriceMatched === false
    ).length;
    return {
      containerNoMismatch,
      unitPriceMismatch,
      total: containerNoMismatch + unitPriceMismatch,
    };
  }, [analysisResult]);

  const handleSubmit = async () => {
    if (!booking) return;

    // 통관예정일 필수 체크
    if (!customsScheduledDate || !customsScheduledDate.trim()) {
      toastApiError(new Error('통관예정일을 입력해주세요.'), '통관예정일 필요');
      return;
    }

    // 불일치 컨테이너가 있고 확인하지 않은 경우 모달 표시
    if (hasMismatchedContainers && !mismatchConfirmed) {
      setMismatchConfirmDialogOpen(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const updateData: any = {
        tradeStatus: 'DOCUMENTS',
        // 서류 처리 완료 시 영업 상태를 입고대기로 자동 설정
        salesStatus: 'INBOUND_PENDING',
      };

      // Google Drive 파일 정보 추가
      if (invoiceFile) {
        updateData.invoiceGoogleDriveFileId = invoiceFile.id;
        updateData.invoiceFileName = invoiceFile.name || '송장.pdf';
      } else if (booking.invoiceGoogleDriveFileId) {
        // 기존 파일이 있는데 새로 선택하지 않은 경우 유지 (수정 모드)
        // 파일을 명시적으로 제거하려면 빈 값으로 설정하지 않음
      } else {
        // 파일이 선택되지 않은 경우 null로 설정
        updateData.invoiceGoogleDriveFileId = null;
        updateData.invoiceFileName = null;
      }

      // 분석 결과가 있으면 송장 정보도 함께 저장
      if (analysisResult?.invoice) {
        const invoice = analysisResult.invoice;
        if (invoice.invoiceNumber) {
          updateData.invoiceNumber = invoice.invoiceNumber;
        }
        if (invoice.invoiceDate) {
          updateData.invoiceDate = invoice.invoiceDate;
        }
        if (invoice.invoiceCurrency) {
          updateData.invoiceCurrency = invoice.invoiceCurrency;
        }
        if (invoice.invoiceAmount != null) {
          updateData.invoiceAmount = invoice.invoiceAmount;
        }
        if (invoice.invoiceWeight != null) {
          updateData.invoiceWeight = invoice.invoiceWeight;
        }
      }
      
      // 송장 입력 날짜 설정 (분석 결과에 invoiceDate가 없으면 현재 날짜로 설정)
      if (!updateData.invoiceDate) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
        updateData.invoiceDate = today;
      }

      // 통관예정일
      updateData.customsScheduledDate = customsScheduledDate?.trim() || null;

      // 분석 결과에서 컨테이너 정보도 함께 저장 (서류 처리 완료 시점에만)
      // 기존 컨테이너 정보를 유지하면서 중량과 베일만 업데이트
      if (analysisResult?.containers && analysisResult.containers.length > 0) {
        // 기존 컨테이너 정보를 Map으로 변환 (컨테이너 번호로 조회)
        const existingContainersMap = new Map(
          (booking?.containers || []).map((c) => [
            c.containerNo?.toUpperCase().trim() || '',
            c,
          ])
        );

        // 첫 번째 기존 컨테이너를 참조용으로 사용
        const firstExistingContainer = booking?.containers?.[0];

        // 패킹 이름을 코드로 변환하는 헬퍼 함수
        const getPackingTypeCode = (packingNameOrCode: string | null | undefined): string => {
          if (!packingNameOrCode) return '';
          // packingCodes에서 이름으로 찾기
          const foundByName = packingCodes?.find((code) => code.name === packingNameOrCode);
          if (foundByName?.value) return foundByName.value;
          // packingCodes에서 코드로 찾기 (이미 코드인 경우)
          const foundByValue = packingCodes?.find((code) => code.value === packingNameOrCode);
          if (foundByValue?.value) return foundByValue.value;
          // 못 찾으면 그대로 반환 (빈 문자열이면 빈 문자열)
          return packingNameOrCode;
        };

        // 컨테이너별 처리 옵션에 따라 필터링 및 처리
        const processedContainers = analysisResult.containers
          .map((container, index) => {
            const containerNo = container.containerNo?.trim() || null;
            const normalizedContainerNo = containerNo?.toUpperCase().trim() || '';
            const action = containerActions[normalizedContainerNo] || 'add'; // 기본값: 추가

            // 제외 옵션 선택 시 null 반환 (필터링됨)
            if (action === 'exclude') {
              return null;
            }

            const existingContainer = existingContainersMap.get(normalizedContainerNo);
            const comparison = analysisResult.containerComparisons?.[index];

            // 매칭 옵션: 기존 컨테이너와 매칭하려고 했지만 없으면 추가
            if (action === 'match' && !existingContainer) {
              // 기존 컨테이너가 없으면 추가로 처리
            }

            // 기존 컨테이너가 있으면 기존 정보 유지 (중량/베일/단가만 업데이트)
            // 없으면 참조 컨테이너 > 계약 정보 > 주문 정보 순으로 기본값 설정
            if (existingContainer) {
              // 기존 컨테이너가 있으면 기존 정보 유지하고 중량/베일/단가만 업데이트
              return {
                containerNo,
                product: existingContainer.product || null,
                tradeGrade: existingContainer.tradeGrade || null,
                salesGrade: existingContainer.salesGrade || null,
                packingType: existingContainer.packingType || null,
                currency: existingContainer.currency || null,
                unitPrice: container.unitPrice != null 
                  ? Number(container.unitPrice) 
                  : (existingContainer.unitPrice != null ? Number(existingContainer.unitPrice) : null),
                weight: container.weight || null, // 분석 결과의 중량
                tradeBales: container.tradeBales ?? container.salesBales ?? null,
              salesBales: container.salesBales ?? null,
              };
            }

            // 기존 컨테이너가 없으면 기본값 설정
            const defaultProduct = firstExistingContainer?.product 
              || contractData?.productName 
              || booking?.productCode 
              || booking?.productName 
              || null;
            
            const defaultTradeGrade = firstExistingContainer?.tradeGrade 
              || contractData?.grade 
              || booking?.grade 
              || null;
            
            const defaultSalesGrade = firstExistingContainer?.salesGrade 
              || null;
            
            // 패킹 타입: 이름일 수 있으므로 코드로 변환 필요
            const packingTypeFromContainer = firstExistingContainer?.packingType || '';
            const packingTypeFromContract = contractData?.packingName || contractData?.packingType || '';
            const packingTypeFromOrder = booking?.packingCode 
              || booking?.packingType 
              || (booking as any)?.packing 
              || '';
            const defaultPackingType = getPackingTypeCode(
              packingTypeFromContainer || packingTypeFromContract || packingTypeFromOrder
            ) || null;
            
            const defaultCurrency = firstExistingContainer?.currency 
              || contractData?.currency 
              || booking?.currencyCode 
              || booking?.currencyName 
              || null;
            
            const defaultUnitPrice = container.unitPrice != null
              ? Number(container.unitPrice)
              : firstExistingContainer?.unitPrice
                ? Number(firstExistingContainer.unitPrice)
                : contractData?.unitPrice
                  ? Number(contractData.unitPrice)
                  : booking?.unitPrice
                    ? Number(booking.unitPrice)
                    : null;

            return {
              containerNo,
              product: defaultProduct,
              tradeGrade: defaultTradeGrade,
              salesGrade: defaultSalesGrade,
              packingType: defaultPackingType,
              currency: defaultCurrency,
              unitPrice: defaultUnitPrice,
              weight: container.weight || null, // 분석 결과의 중량
              tradeBales: container.tradeBales ?? container.salesBales ?? null,
              salesBales: container.salesBales ?? null,
            };
          })
          .filter((c) => c !== null); // 제외된 컨테이너 필터링

        updateData.containers = processedContainers;
      }

      // 부킹 상태를 DOCUMENTS로 변경하고 송장 정보 및 컨테이너 정보 업데이트
      await updateMutation.mutateAsync({
        id: booking.id,
        data: updateData,
      });
      
      toastSuccess('서류 처리 완료', '부킹 상태가 서류 처리 상태로 변경되었습니다.');
      
      // 목록 데이터 갱신
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-order', booking.id] });
      
      onOpenChange(false);
      setMismatchConfirmed(false); // 제출 완료 후 초기화
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('서류 처리 오류:', error);
      toastApiError(error, '서류 처리 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmMismatch = () => {
    setMismatchConfirmed(true);
    setMismatchConfirmDialogOpen(false);
    // 확인 후 제출 진행
    void handleSubmit();
  };

  // 텍스트 선택을 위한 핸들러
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    // 텍스트 선택 중일 때는 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 텍스트 선택이 이미 시작된 경우에만 드래그 방지
    // 더블클릭으로 텍스트 선택을 시작하는 경우는 허용
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  // 더블클릭으로 텍스트 선택을 허용하기 위한 핸들러
  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    // 더블클릭 시 텍스트 선택이 가능하도록 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 더블클릭으로 텍스트 선택을 시작할 수 있도록 드래그 제스처 방지
    e.stopPropagation();
  }, []);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{ 
          width: isMobile ? '100%' : '600px', 
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-primary" />
                서류 처리
              </DrawerTitle>
              <DrawerDescription>
                부킹을 서류 처리 상태로 변경하고 송장 정보를 입력합니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {booking ? (
            <div className="space-y-6">
              {/* 통관예정일 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  통관예정일 <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  value={customsScheduledDate || undefined}
                  onChange={(date) => setCustomsScheduledDate(date || '')}
                  disabled={isSubmitting}
                  placeholder="통관예정일 선택"
                />
              </div>

              {/* 송장 파일 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">송장 파일</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">
                      송장 파일 (Google Drive)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setInvoiceFilePickerOpen(true)}
                        disabled={isSubmitting}
                        className="flex-1"
                      >
                        <Folder className="mr-2 h-4 w-4" />
                        {invoiceFile ? invoiceFile.name : '파일 선택'}
                      </Button>
                      {invoiceFile && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setInvoiceFilePreviewOpen(true)}
                            disabled={isSubmitting}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setInvoiceFile(null)}
                            disabled={isSubmitting}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    {invoiceFile && (
                      <p className="text-xs text-muted-foreground">
                        선택된 파일: {invoiceFile.name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Google Drive에서 송장 파일을 선택한 뒤 <strong>분석</strong> 버튼을 누르면 GPT가 자동으로 값을 추출합니다.
                    </p>
                  </div>
                  
                  {/* 분석 버튼 */}
                  {invoiceFile && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || !invoiceFile || !booking}
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            분석 중...
                          </>
                        ) : (
                          <>
                            <Search className="mr-2 h-4 w-4" />
                            분석
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  {/* 분석 메시지 */}
                  {analysisMessage && (
                    <div className={`text-xs whitespace-pre-line rounded-md border border-dashed px-3 py-2 ${
                      analysisResult?.contractNumberMatched === false
                        ? 'border-yellow-500 bg-yellow-50 text-yellow-900'
                        : 'border-border bg-muted/10 text-muted-foreground'
                    }`}>
                      {analysisMessage}
                    </div>
                  )}
                  
                  {/* 계약번호 비교 결과 */}
                  {analysisResult && analysisResult.contractNumberExpected && (
                    <div className="space-y-2 rounded-md border border-border bg-muted/10 p-3">
                      <h4 className="text-xs font-semibold text-foreground">계약번호 확인</h4>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">부킹의 계약번호:</span>
                          <span className="font-medium text-foreground">{analysisResult.contractNumberExpected}</span>
                        </div>
                        {analysisResult.contractNumberExtracted && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">송장에서 추출한 계약번호:</span>
                            <span className={`font-medium ${
                              analysisResult.contractNumberMatched ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {analysisResult.contractNumberExtracted}
                            </span>
                          </div>
                        )}
                        {analysisResult.contractNumberMatched === false && (
                          <div className="mt-2 text-xs text-red-600 font-medium">
                            ⚠️ 계약번호가 일치하지 않습니다. 송장이 올바른 부킹에 연결되었는지 확인하세요.
                          </div>
                        )}
                        {analysisResult.contractNumberMatched === true && (
                          <div className="mt-2 text-xs text-green-600 font-medium">
                            ✓ 계약번호가 일치합니다.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* 분석 결과 */}
              {analysisResult && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-semibold text-foreground">분석 결과</h3>
                  
                  {/* 송장 기본 정보 */}
                  {analysisResult.invoice && (
                    <div className="space-y-3 rounded-md border border-border bg-muted/10 p-4">
                      <h4 className="text-xs font-semibold text-foreground">송장 정보</h4>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        {analysisResult.invoice.invoiceNumber && (
                          <>
                            <dt className="text-muted-foreground">송장번호</dt>
                            <dd className="font-medium text-foreground">{analysisResult.invoice.invoiceNumber}</dd>
                          </>
                        )}
                        {analysisResult.invoice.invoiceDate && (
                          <>
                            <dt className="text-muted-foreground">송장 날짜</dt>
                            <dd className="font-medium text-foreground">{analysisResult.invoice.invoiceDate}</dd>
                          </>
                        )}
                        {analysisResult.invoice.invoiceCurrency && (
                          <>
                            <dt className="text-muted-foreground">통화</dt>
                            <dd className="font-medium text-foreground">{analysisResult.invoice.invoiceCurrency}</dd>
                          </>
                        )}
                        {analysisResult.invoice.invoiceAmount != null && (
                          <>
                            <dt className="text-muted-foreground">송장 금액</dt>
                            <dd className="font-medium text-foreground">
                              {analysisResult.invoice.invoiceAmount.toLocaleString('ko-KR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              {analysisResult.invoice.invoiceCurrency ? ` ${analysisResult.invoice.invoiceCurrency}` : ''}
                            </dd>
                          </>
                        )}
                        {analysisResult.invoice.invoiceWeight != null && (
                          <>
                            <dt className="text-muted-foreground">송장 중량 (송장 기준)</dt>
                            <dd className="font-medium text-foreground">
                              {analysisResult.invoice.invoiceWeight.toLocaleString('ko-KR', {
                                minimumFractionDigits: 3,
                                maximumFractionDigits: 3,
                              })} MT
                            </dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}
                  
                  {/* 컨테이너 정보 */}
                  {analysisResult.containers && analysisResult.containers.length > 0 && (
                    <div className="space-y-3 rounded-md border border-border bg-muted/10 p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-foreground">컨테이너 정보</h4>
                        {/* 불일치 요약 섹션 (Phase 2) */}
                        {hasMismatchedContainers && (
                          <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-yellow-50 border border-yellow-200">
                            <AlertTriangle className="h-3 w-3 text-yellow-600" />
                            <span className="text-xs font-medium text-yellow-800">
                              불일치 {mismatchStats.total}건
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        {analysisResult.containers.map((container, index) => {
                          const comparison = analysisResult.containerComparisons?.[index];
                          const isMismatched =
                            comparison?.containerNoMatched === false ||
                            comparison?.unitPriceMatched === false;
                          return (
                            <div
                              key={index}
                              className={`space-y-2 border-b border-border pb-2 last:border-b-0 rounded-md p-2 ${
                                isMismatched
                                  ? 'bg-yellow-50 border-yellow-200 border-2'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs gap-4">
                                <div className="flex items-center gap-2 flex-1">
                                  {isMismatched && (
                                    <AlertTriangle className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                                  )}
                                  <span className="font-medium text-foreground">
                                    {container.containerNo || '-'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  {(container.tradeBales ?? container.salesBales) != null && (
                                    <span className="text-muted-foreground">
                                      베일: {(container.tradeBales ?? container.salesBales)!.toLocaleString('ko-KR')}
                                    </span>
                                  )}
                                  <span className="text-muted-foreground">
                                    {container.weight != null
                                      ? `${container.weight.toLocaleString('ko-KR', {
                                          minimumFractionDigits: 3,
                                          maximumFractionDigits: 3,
                                        })} MT`
                                      : '-'}
                                  </span>
                                  {container.unitPrice != null && (
                                    <span className="text-muted-foreground">
                                      단가: {container.unitPrice.toLocaleString('ko-KR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      USD/MT
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* 컨테이너 번호 및 단가 비교 결과 */}
                              {comparison && (
                                <div className="space-y-1 text-xs pl-2 border-l-2 border-border">
                                  {comparison.containerNoMatched === false && (
                                    <div className="text-yellow-700 font-medium">
                                      ⚠️ 컨테이너 번호가 일치하지 않습니다. 기존:{' '}
                                      {comparison.existingContainerNo || '-'}, 송장:{' '}
                                      {comparison.analyzedContainerNo || '-'}
                                    </div>
                                  )}
                                  {comparison.containerNoMatched === true && (
                                    <div className="text-green-600 font-medium">
                                      ✓ 컨테이너 번호가 일치합니다.
                                    </div>
                                  )}
                                  {comparison.containerNoMatched === null && comparison.existingContainerNo === null && (
                                    <div className="text-blue-600 font-medium">
                                      ℹ️ 기존 컨테이너 정보가 없습니다. 송장에서 추출한 번호: {comparison.analyzedContainerNo || '-'}
                                    </div>
                                  )}
                                  {comparison.unitPriceMatched === false && (
                                    <div className="text-yellow-700 font-medium">
                                      ⚠️ 단가가 일치하지 않습니다. 기존:{' '}
                                      {comparison.existingUnitPrice != null
                                        ? comparison.existingUnitPrice.toLocaleString('ko-KR', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })
                                        : '-'}{' '}
                                      USD/MT, 송장:{' '}
                                      {comparison.analyzedUnitPrice != null
                                        ? comparison.analyzedUnitPrice.toLocaleString('ko-KR', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })
                                        : '-'}{' '}
                                      USD/MT
                                    </div>
                                  )}
                                  {comparison.unitPriceMatched === true && (
                                    <div className="text-green-600 font-medium">
                                      ✓ 단가가 일치합니다.
                                    </div>
                                  )}
                                  {comparison.containerNoMatched === null &&
                                    comparison.unitPriceMatched === null && (
                                      <div className="text-muted-foreground">
                                        기존 컨테이너 정보와 비교할 수 없습니다.
                                      </div>
                                    )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {/* 컨테이너 중량 합계 */}
                        {(() => {
                          const totalWeight = analysisResult.containers.reduce((sum, container) => {
                            return sum + (container.weight != null ? container.weight : 0);
                          }, 0);
                          return (
                            <div className="flex items-center justify-between text-xs font-semibold pt-2 border-t border-border">
                              <span className="text-foreground">컨테이너 합계 (실제 중량)</span>
                              <span className="text-foreground">
                                {totalWeight > 0 ? `${totalWeight.toLocaleString('ko-KR', {
                                  minimumFractionDigits: 3,
                                  maximumFractionDigits: 3,
                                })} MT` : '-'}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      
                      {/* 송장 중량 vs 컨테이너 합계 비교 */}
                      {analysisResult.invoice?.invoiceWeight != null && (() => {
                        const totalWeight = analysisResult.containers.reduce((sum, container) => {
                          return sum + (container.weight != null ? container.weight : 0);
                        }, 0);
                        const invoiceWeight = analysisResult.invoice.invoiceWeight;
                        const difference = totalWeight - invoiceWeight;
                        const differencePercent = invoiceWeight > 0 ? (difference / invoiceWeight) * 100 : 0;
                        const isMatched = Math.abs(difference) < 0.01; // 0.01MT 미만 차이는 일치로 간주
                        
                        return (
                          <div className={`mt-3 rounded-md border p-3 text-xs ${
                            isMatched 
                              ? 'bg-green-50 border-green-200' 
                              : Math.abs(differencePercent) < 1 
                                ? 'bg-yellow-50 border-yellow-200' 
                                : 'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">중량 비교</span>
                              <span className={`font-semibold ${
                                isMatched 
                                  ? 'text-green-700' 
                                  : Math.abs(differencePercent) < 1 
                                    ? 'text-yellow-700' 
                                    : 'text-red-700'
                              }`}>
                                {isMatched ? '일치' : difference > 0 ? '초과' : '부족'}
                              </span>
                            </div>
                            <div className="space-y-1 text-muted-foreground">
                              <div className="flex justify-between">
                                <span>송장 중량:</span>
                                <span>{invoiceWeight.toLocaleString('ko-KR', {
                                  minimumFractionDigits: 3,
                                  maximumFractionDigits: 3,
                                })} MT</span>
                              </div>
                              <div className="flex justify-between">
                                <span>컨테이너 합계:</span>
                                <span>{totalWeight.toLocaleString('ko-KR', {
                                  minimumFractionDigits: 3,
                                  maximumFractionDigits: 3,
                                })} MT</span>
                              </div>
                              {!isMatched && (
                                <div className="flex justify-between font-medium">
                                  <span>차이:</span>
                                  <span className={difference > 0 ? 'text-red-600' : 'text-blue-600'}>
                                    {difference > 0 ? '+' : ''}{difference.toLocaleString('ko-KR', {
                                      minimumFractionDigits: 3,
                                      maximumFractionDigits: 3,
                                    })} MT ({differencePercent > 0 ? '+' : ''}{differencePercent.toFixed(2)}%)
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  
                  {/* 비고 */}
                  {analysisResult.notes && (
                    <div className="space-y-2 rounded-md border border-border bg-muted/10 p-4">
                      <h4 className="text-xs font-semibold text-foreground">비고</h4>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{analysisResult.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              부킹 정보를 불러올 수 없습니다.
            </div>
          )}
        </div>

        <DrawerFooter className="border-t border-border">
          <div className="flex justify-between gap-2">
            <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={!booking || isSubmitting || !customsScheduledDate?.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <FileCheck className="mr-2 h-4 w-4" />
                    서류 처리 완료
                  </>
                )}
              </Button>
            </div>
          </div>
        </DrawerFooter>
      </DrawerContent>

      {/* 송장 파일 선택 다이얼로그 */}
      <GoogleDriveFilePicker
        open={invoiceFilePickerOpen}
        onOpenChange={setInvoiceFilePickerOpen}
        onSelect={(file) => {
          setInvoiceFile(file);
        }}
        acceptMimeTypes={[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.google-apps.document',
          'application/vnd.google-apps.spreadsheet',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/*'
        ]}
        title="송장 파일 선택"
        description="구글 드라이브에서 송장 파일을 선택하세요"
      />

      {/* 송장 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={invoiceFilePreviewOpen}
        onOpenChange={setInvoiceFilePreviewOpen}
        file={invoiceFile}
      />

      {/* 불일치 확인 모달 (Phase 1) */}
      <AlertDialog open={mismatchConfirmDialogOpen} onOpenChange={setMismatchConfirmDialogOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              컨테이너 정보 불일치 확인
            </AlertDialogTitle>
            <AlertDialogDescription>
              다음 컨테이너가 기존 정보와 일치하지 않습니다. 확인 후 계속 진행해주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            {/* 불일치 요약 */}
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
              <div className="text-sm font-medium text-yellow-800 mb-2">불일치 요약</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-yellow-700">
                <div>
                  컨테이너 번호 불일치: <strong>{mismatchStats.containerNoMismatch}건</strong>
                </div>
                <div>
                  단가 불일치: <strong>{mismatchStats.unitPriceMismatch}건</strong>
                </div>
              </div>
            </div>

            {/* 불일치 컨테이너 목록 */}
            <div className="space-y-2">
              <div className="text-sm font-medium">불일치 컨테이너 상세</div>
              {analysisResult?.containers?.map((container, index) => {
                const comparison = analysisResult.containerComparisons?.[index];
                const isMismatched =
                  comparison?.containerNoMatched === false ||
                  comparison?.unitPriceMatched === false;

                if (!isMismatched) return null;

                const containerNo = container.containerNo?.trim() || '';
                const normalizedContainerNo = containerNo.toUpperCase().trim();
                const currentAction =
                  containerActions[normalizedContainerNo] || 'add';

                return (
                  <div
                    key={index}
                    className="rounded-md border border-yellow-200 bg-yellow-50 p-3 space-y-2"
                  >
                    <div className="font-medium text-sm">{container.containerNo || '-'}</div>
                    <div className="space-y-1 text-xs">
                      {comparison?.containerNoMatched === false && (
                        <div className="text-yellow-700">
                          ⚠️ 컨테이너 번호 불일치: 기존{' '}
                          {comparison.existingContainerNo || '없음'} → 송장{' '}
                          {comparison.analyzedContainerNo || '-'}
                        </div>
                      )}
                      {comparison?.unitPriceMatched === false && (
                        <div className="text-yellow-700">
                          ⚠️ 단가 불일치: 기존{' '}
                          {comparison.existingUnitPrice != null
                            ? `${comparison.existingUnitPrice.toLocaleString('ko-KR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })} USD/MT`
                            : '없음'}{' '}
                          → 송장{' '}
                          {comparison.analyzedUnitPrice != null
                            ? `${comparison.analyzedUnitPrice.toLocaleString('ko-KR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })} USD/MT`
                            : '-'}
                        </div>
                      )}
                    </div>
                    {/* 컨테이너별 처리 옵션 (Phase 2) */}
                    <div className="pt-2 border-t border-yellow-200">
                      <Label className="text-xs font-medium text-yellow-800">
                        처리 방법:
                      </Label>
                      <Select
                        value={currentAction}
                        onValueChange={(value: 'add' | 'match' | 'exclude') => {
                          setContainerActions((prev) => ({
                            ...prev,
                            [normalizedContainerNo]: value,
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="add">새 컨테이너로 추가</SelectItem>
                          <SelectItem value="match">
                            기존 컨테이너와 매칭 (기존 정보 유지)
                          </SelectItem>
                          <SelectItem value="exclude">제외하고 저장</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 확인 체크박스 (Phase 1) */}
            <div className="flex items-center space-x-2 pt-2 border-t">
              <Checkbox
                id="mismatch-confirm"
                checked={mismatchConfirmed}
                onCheckedChange={(checked) => setMismatchConfirmed(checked === true)}
              />
              <Label
                htmlFor="mismatch-confirm"
                className="text-sm font-normal cursor-pointer"
              >
                위 불일치를 확인하고 계속 진행합니다
              </Label>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmMismatch}
              disabled={!mismatchConfirmed}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              계속 진행
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Drawer>
  );
}

