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
import { Loader2, X, Eye, Folder, Search } from 'lucide-react';
import { toastSuccess, toastApiError, toastError } from '@/lib/utils/toast-helpers';
import { useIsMobile } from '@/hooks/use-mobile';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';
import api from '@/lib/api';
import { useTradeOrder } from '@/lib/hooks/use-trade-orders';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface InvoiceAnalysisDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  existingInvoiceFileId?: string | null;
  onApply?: (result: {
    invoiceFile: GoogleDriveFile | null;
    analysisResult: InvoiceAnalysisResponse | null;
  }) => void;
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
  containerMappings?: Record<number, string>; // 매핑 정보 추가
  weightMatched?: boolean | null; // 송장 중량과 컨테이너 중량 합 일치 여부
  totalContainerWeight?: number | null; // 컨테이너 중량 합계
  weightDifference?: number | null; // 중량 차이
};

export function InvoiceAnalysisDrawer({
  open,
  onOpenChange,
  orderId,
  existingInvoiceFileId,
  onApply,
}: InvoiceAnalysisDrawerProps) {
  const isMobile = useIsMobile();
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<InvoiceAnalysisResponse | null>(null);
  const [analysisMessage, setAnalysisMessage] = React.useState<string | null>(null);
  
  // 송장 파일
  const [invoiceFile, setInvoiceFile] = React.useState<GoogleDriveFile | null>(null);
  const [invoiceFilePickerOpen, setInvoiceFilePickerOpen] = React.useState(false);
  const [invoiceFilePreviewOpen, setInvoiceFilePreviewOpen] = React.useState(false);
  
  // 기존 주문 정보 조회 (컨테이너 목록을 위해)
  const { data: existingOrder } = useTradeOrder(orderId ?? undefined);
  
  // 불일치 항목 매핑 정보: { analyzedContainerIndex: existingContainerNo }
  const [containerMappings, setContainerMappings] = React.useState<Record<number, string>>({});

  // 기존 송장 파일 메타데이터 조회
  const shouldFetchMetadata = open && !!existingInvoiceFileId;
  
  const { data: existingInvoiceFileMetadata } = useGoogleDriveFileMetadata(
    existingInvoiceFileId || null,
    shouldFetchMetadata,
  );

  // drawer가 열릴 때 초기화
  React.useEffect(() => {
    if (open) {
      // 기존 파일 메타데이터가 있으면 설정
      if (existingInvoiceFileMetadata) {
        setInvoiceFile(existingInvoiceFileMetadata);
      } else {
        setInvoiceFile(null);
      }
      // 분석 결과 초기화
      setAnalysisResult(null);
      setAnalysisMessage(null);
      setContainerMappings({});
    }
  }, [open, existingInvoiceFileMetadata]);

  // 파일이 변경되면 분석 결과 초기화
  React.useEffect(() => {
    setAnalysisResult(null);
    setAnalysisMessage(null);
    setContainerMappings({});
  }, [invoiceFile]);

  const handleAnalyze = async () => {
    if (!orderId) {
      toastError('부킹 정보 필요', '부킹 정보를 불러올 수 없습니다.');
      return;
    }
    if (!invoiceFile) {
      toastError('송장 파일 필요', '송장 파일을 선택해주세요.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisMessage(null);
    setAnalysisResult(null);

    try {
      const response = await api.post<InvoiceAnalysisResponse>(
        `/trade/contracts/orders/${orderId}/invoice/analyze`,
        {
          googleDriveFileId: invoiceFile.id,
        },
      );

      const data = response.data ?? {};
      setAnalysisMessage(data.message ?? '송장 분석이 완료되었습니다. 결과를 확인해주세요.');
      setAnalysisResult(data);
    } catch (error: unknown) {
      console.error('송장 분석 중 오류가 발생했습니다.', error);
      const axiosError = error as { response?: { data?: { message?: string | string[] } } };
      const responseMessage = axiosError.response?.data?.message;
      const fallbackMessage = '송장 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      setAnalysisMessage(
        Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? fallbackMessage,
      );
      toastApiError(error as any, '송장 분석 실패');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = () => {
    if (!onApply) return;
    // 파일 삭제 반영: 기존에 송장이 있었는데 사용자가 삭제한 경우
    if (invoiceFile === null && existingInvoiceFileId) {
      onApply({ invoiceFile: null, analysisResult: null });
      onOpenChange(false);
      toastSuccess('적용 완료', '송장 파일이 삭제되었습니다. 저장 버튼을 눌러 반영하세요.');
      return;
    }
    // 분석 결과 적용
    if (analysisResult) {
      const resultWithMappings: InvoiceAnalysisResponse = {
        ...analysisResult,
        containerMappings,
      };
      onApply({
        invoiceFile,
        analysisResult: resultWithMappings,
      });
      onOpenChange(false);
      toastSuccess('적용 완료', '분석 결과가 폼에 적용되었습니다.');
    }
  };

  /** 적용 버튼 활성화: 분석 결과가 있거나, 기존 송장을 삭제한 경우 */
  const canApply = Boolean(
    onApply && (
      (invoiceFile && analysisResult) ||
      (invoiceFile === null && existingInvoiceFileId)
    ),
  );
  
  // 기존 컨테이너 목록
  const existingContainers = React.useMemo(() => {
    return existingOrder?.containers || [];
  }, [existingOrder]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full"
        style={{ width: isMobile ? '100%' : '600px', maxWidth: '90vw' }}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                송장 파일 분석
              </DrawerTitle>
              <DrawerDescription>
                Google Drive에서 송장 파일을 선택하고 GPT로 분석합니다.
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

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-w-0">
          <div className="space-y-6 min-w-0">
            {/* 송장 파일 */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">송장 파일</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    송장 파일 (Google Drive)
                  </Label>
                  <div className="flex items-center gap-2 min-w-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setInvoiceFilePickerOpen(true)}
                      className="flex-1 min-w-0 justify-start"
                    >
                      <Folder className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate" title={invoiceFile?.name}>
                        {invoiceFile ? invoiceFile.name : '파일 선택'}
                      </span>
                    </Button>
                    {invoiceFile && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setInvoiceFilePreviewOpen(true)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setInvoiceFile(null);
                            setAnalysisResult(null);
                            setAnalysisMessage(null);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  {invoiceFile && (
                    <p className="text-xs text-muted-foreground truncate min-w-0" title={invoiceFile.name}>
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
                      disabled={isAnalyzing || !invoiceFile || !orderId}
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
                  <div className={`text-xs whitespace-pre-line break-words overflow-hidden rounded-md border border-dashed px-3 py-2 min-w-0 ${
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
                      {analysisResult.totalContainerWeight != null && (
                        <>
                          <dt className="text-muted-foreground">컨테이너 중량 합계</dt>
                          <dd className={`font-medium ${
                            analysisResult.weightMatched === false ? 'text-red-600' : 'text-foreground'
                          }`}>
                            {analysisResult.totalContainerWeight.toLocaleString('ko-KR', {
                              minimumFractionDigits: 3,
                              maximumFractionDigits: 3,
                            })} MT
                            {analysisResult.weightMatched === false && analysisResult.weightDifference != null && (
                              <span className="ml-2 text-xs text-red-600">
                                (차이: {analysisResult.weightDifference.toFixed(3)} MT)
                              </span>
                            )}
                            {analysisResult.weightMatched === true && (
                              <span className="ml-2 text-xs text-green-600">
                                ✓ 일치
                              </span>
                            )}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
                
                {/* 컨테이너 정보 */}
                {analysisResult.containers && analysisResult.containers.length > 0 && (
                  <div className="space-y-3 rounded-md border border-border bg-muted/10 p-4">
                    <h4 className="text-xs font-semibold text-foreground">컨테이너 정보</h4>
                    <div className="space-y-2">
                      {analysisResult.containers.map((container, index) => {
                        const comparison = analysisResult.containerComparisons?.[index];
                        return (
                          <div key={index} className="space-y-2 border-b border-border pb-2 last:border-b-0">
                            <div className="flex items-center justify-between text-xs gap-4 min-w-0">
                              <span className="font-medium text-foreground flex-1 truncate" title={container.containerNo ?? undefined}>{container.containerNo || '-'}</span>
                              <div className="flex items-center gap-4">
                                {(container.tradeBales ?? container.salesBales) != null && (
                                  <span className="text-muted-foreground">
                                    베일: {(container.tradeBales ?? container.salesBales)!.toLocaleString('ko-KR')}
                                  </span>
                                )}
                                <span className="text-muted-foreground">
                                  {container.weight != null ? `${container.weight.toLocaleString('ko-KR', {
                                    minimumFractionDigits: 3,
                                    maximumFractionDigits: 3,
                                  })} MT` : '-'}
                                </span>
                                {container.unitPrice != null && (
                                  <span className="text-muted-foreground">
                                    단가: {container.unitPrice.toLocaleString('ko-KR', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })} USD/MT
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* 컨테이너 번호 및 단가 비교 결과 */}
                            {comparison && (
                              <div className="space-y-2 text-xs pl-2 border-l-2 border-border">
                                {/* 기존 컨테이너가 없는 경우 (새 컨테이너) - 먼저 체크 */}
                                {comparison.containerNoMatched === null && comparison.existingContainerNo === null && (
                                  <div className="space-y-2">
                                    <div className="text-blue-600 font-medium">
                                      ℹ️ 기존 컨테이너 정보가 없습니다. 송장에서 추출한 번호: {comparison.analyzedContainerNo || '-'}
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">매핑할 컨테이너 선택:</Label>
                                      <Select
                                        value={containerMappings[index] ? containerMappings[index] : '__none__'}
                                        onValueChange={(value) => {
                                          setContainerMappings((prev) => ({
                                            ...prev,
                                            [index]: value === '__none__' ? '' : value,
                                          }));
                                        }}
                                      >
                                        <SelectTrigger className="h-7 text-xs">
                                          <SelectValue placeholder="컨테이너 선택" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__none__">매핑하지 않음 (새로 추가)</SelectItem>
                                          {existingContainers.length > 0 ? (
                                            existingContainers.map((existingContainer) => {
                                              const containerNo = existingContainer.containerNo || '';
                                              if (!containerNo) return null;
                                              return (
                                                <SelectItem
                                                  key={existingContainer.id}
                                                  value={containerNo}
                                                >
                                                  {containerNo}
                                                </SelectItem>
                                              );
                                            })
                                          ) : null}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                )}
                                {/* 컨테이너 번호 불일치 (기존 컨테이너가 있는 경우) */}
                                {comparison.containerNoMatched === false && comparison.existingContainerNo !== null && (
                                  <div className="space-y-2">
                                    <div className="text-red-600 font-medium">
                                      ⚠️ 컨테이너 번호가 일치하지 않습니다. 기존: {comparison.existingContainerNo || '-'}, 송장: {comparison.analyzedContainerNo || '-'}
                                    </div>
                                    {existingContainers.length > 0 && (
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">매핑할 컨테이너 선택:</Label>
                                        <Select
                                          value={containerMappings[index] ? containerMappings[index] : '__none__'}
                                          onValueChange={(value) => {
                                            setContainerMappings((prev) => ({
                                              ...prev,
                                              [index]: value === '__none__' ? '' : value,
                                            }));
                                          }}
                                        >
                                          <SelectTrigger className="h-7 text-xs">
                                            <SelectValue placeholder="컨테이너 선택" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="__none__">매핑하지 않음</SelectItem>
                                            {existingContainers.map((existingContainer) => {
                                              const containerNo = existingContainer.containerNo || '';
                                              if (!containerNo) return null;
                                              return (
                                                <SelectItem
                                                  key={existingContainer.id}
                                                  value={containerNo}
                                                >
                                                  {containerNo}
                                                </SelectItem>
                                              );
                                            })}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {comparison.containerNoMatched !== false && comparison.unitPriceMatched === false && (
                                  <div className="text-yellow-600 font-medium">
                                    ⚠️ 단가가 일치하지 않습니다. 기존: {comparison.existingUnitPrice != null ? comparison.existingUnitPrice.toLocaleString('ko-KR', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }) : '-'} USD/MT, 송장: {comparison.analyzedUnitPrice != null ? comparison.analyzedUnitPrice.toLocaleString('ko-KR', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }) : '-'} USD/MT
                                  </div>
                                )}
                                {comparison.containerNoMatched === true && (
                                  <div className="text-green-600 font-medium">
                                    ✓ 컨테이너 번호가 일치합니다.
                                  </div>
                                )}
                                {comparison.unitPriceMatched === true && (
                                  <div className="text-green-600 font-medium">
                                    ✓ 단가가 일치합니다.
                                  </div>
                                )}
                                {comparison.containerNoMatched === null && comparison.unitPriceMatched === null && (
                                  <div className="text-muted-foreground">
                                    기존 컨테이너 정보와 비교할 수 없습니다.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
        </div>

        <DrawerFooter className="border-t">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              <X className="mr-2 h-4 w-4" />
              취소
            </Button>
            <Button
              onClick={handleApply}
              disabled={!canApply}
            >
              <Search className="mr-2 h-4 w-4" />
              적용
            </Button>
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
    </Drawer>
  );
}

