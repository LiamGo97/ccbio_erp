'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
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
import { Loader2, X, CheckCircle2, FileText, Eye, Folder } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toastSuccess, toastError, toastApiError } from '@/lib/utils/toast-helpers';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrder, useUpdateTradeOrder, useUpdateTradeContract } from '@/lib/hooks/use-trade-orders';
import { TradeContract } from '@/lib/hooks/use-trade-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';

interface ContractConfirmationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeOrder?: TradeOrder | null;
  tradeContract?: TradeContract | null;
  onSuccess?: () => void;
}

export function ContractConfirmationDrawer({
  open,
  onOpenChange,
  tradeOrder,
  tradeContract,
  onSuccess,
}: ContractConfirmationDrawerProps) {
  const isMobile = useIsMobile();
  const updateMutation = useUpdateTradeOrder();
  const updateContractMutation = useUpdateTradeContract();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [contractNo, setContractNo] = React.useState('');
  const [contractFile, setContractFile] = React.useState<GoogleDriveFile | null>(null);
  const [contractFilePickerOpen, setContractFilePickerOpen] = React.useState(false);
  const [contractFilePreviewOpen, setContractFilePreviewOpen] = React.useState(false);

  // tradeOrder 또는 tradeContract 중 하나를 사용
  const data = tradeOrder || tradeContract;
  const contractId = tradeOrder?.contractId || tradeContract?.id;

  // 기존 계약서 파일 메타데이터 조회 (수정 모드일 때만)
  const contractFileId = data?.contractGoogleDriveFileId || null;
  const shouldFetchMetadata = open && !!data?.contractGoogleDriveFileId;
  
  const { data: existingContractFileMetadata } = useGoogleDriveFileMetadata(
    contractFileId,
    shouldFetchMetadata,
  );

  // data가 변경되면 초기화
  React.useEffect(() => {
    if (data) {
      setContractNo(data.contractNo || '');
      
      // 기존 파일 메타데이터가 있으면 설정
      if (existingContractFileMetadata) {
        setContractFile(existingContractFileMetadata);
      } else {
        setContractFile(null);
      }
    }
  }, [data, existingContractFileMetadata]);

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

  const handleConfirm = async () => {
    if (!data) return;

    if (!contractNo || contractNo.trim() === '') {
      toastError('계약번호 필요', '계약번호를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updateData: any = {
        contractNo: contractNo.trim(),
        contractGoogleDriveFileId: contractFile?.id || null,
        contractFileName: contractFile?.name || null,
      };

      // TradeOrder인 경우 주문 정보도 업데이트
      if (tradeOrder) {
        await updateMutation.mutateAsync({
          id: tradeOrder.id,
          data: updateData,
        });
      }
      
      // 계약 상태를 CONTRACT로 변경 (계약 테이블에서 가져온 경우)
      if (contractId) {
        try {
          await updateContractMutation.mutateAsync({
            id: contractId,
            data: { 
              status: 'CONTRACT',
              contractNo: contractNo.trim(),
              contractGoogleDriveFileId: contractFile?.id || null,
              contractFileName: contractFile?.name || null,
            },
          });
        } catch (contractError: any) {
          console.error('계약 상태 자동 변경 오류:', contractError);
          // 계약 상태 변경 실패해도 계약 확정은 성공한 것으로 처리
        }
      }
      
      toastSuccess('계약 확정 완료', '발주가 계약 확정 상태로 변경되었습니다.');
      
      // 목록 데이터 갱신
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-contracts'] });
      if (tradeOrder) {
        await queryClient.invalidateQueries({ queryKey: ['trade-order', tradeOrder.id] });
      }
      if (contractId) {
        await queryClient.invalidateQueries({ queryKey: ['trade-contract', contractId] });
      }
      
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('계약 확정 오류:', error);
      toastApiError(error, '계약 확정 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
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
                <CheckCircle2 className="h-5 w-5 text-primary" />
                계약 확정
              </DrawerTitle>
              <DrawerDescription>
                발주를 계약 확정 상태로 변경합니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={isSubmitting}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div 
          className="flex-1 overflow-y-auto p-6"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          onDoubleClick={handleDoubleClick}
        >
          {data ? (
            <div className="space-y-4">
              {/* 계약 정보 입력 */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">계약 정보</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contractNo" className="text-sm font-medium text-foreground">
                      계약번호 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="contractNo"
                      value={contractNo}
                      onChange={(e) => setContractNo(e.target.value)}
                      placeholder="계약번호를 입력하세요"
                      disabled={isSubmitting}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      계약 확정 시 필요한 계약번호를 입력해주세요.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">
                      계약서 파일 (Google Drive)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setContractFilePickerOpen(true)}
                        disabled={isSubmitting}
                        className="flex-1"
                      >
                        <Folder className="mr-2 h-4 w-4" />
                        {contractFile ? contractFile.name : '파일 선택'}
                      </Button>
                      {contractFile && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setContractFilePreviewOpen(true)}
                            disabled={isSubmitting}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setContractFile(null)}
                            disabled={isSubmitting}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    {contractFile && (
                      <p className="text-xs text-muted-foreground">
                        선택된 파일: {contractFile.name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Google Drive에서 계약서 파일을 선택하세요.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              발주 정보를 불러올 수 없습니다.
            </div>
          )}
        </div>

        <DrawerFooter className="border-t">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              <X className="mr-2 h-4 w-4" />
              취소
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!data || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  처리 중...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  계약 확정
                </>
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>

      {/* 계약서 파일 선택 다이얼로그 */}
      <GoogleDriveFilePicker
        open={contractFilePickerOpen}
        onOpenChange={setContractFilePickerOpen}
        onSelect={(file) => {
          setContractFile(file);
        }}
        acceptMimeTypes={[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.google-apps.document', // Google Docs
          'application/vnd.google-apps.spreadsheet', // Google Sheets
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Excel
          'image/*'
        ]}
        title="계약서 파일 선택"
        description="구글 드라이브에서 계약서 파일을 선택하세요"
      />

      {/* 계약서 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={contractFilePreviewOpen}
        onOpenChange={setContractFilePreviewOpen}
        file={contractFile}
      />
    </Drawer>
  );
}

