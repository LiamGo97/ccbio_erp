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
import { Loader2, X, FileText, Eye, Folder } from 'lucide-react';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrder, useUpdateTradeOrder } from '@/lib/hooks/use-trade-orders';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';
import { DatePicker } from '@/components/schedules/date-picker';

interface CustomsProcessingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeOrder: TradeOrder | null;
  onSuccess?: () => void;
}

export function CustomsProcessingDrawer({
  open,
  onOpenChange,
  tradeOrder,
  onSuccess,
}: CustomsProcessingDrawerProps) {
  const isMobile = useIsMobile();
  const updateMutation = useUpdateTradeOrder();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  // 면장 파일
  const [certificateFile, setCertificateFile] = React.useState<GoogleDriveFile | null>(null);
  const [certificateFile2, setCertificateFile2] = React.useState<GoogleDriveFile | null>(null);
  const [certificateFilePickerOpen, setCertificateFilePickerOpen] = React.useState(false);
  const [certificateFilePreviewOpen, setCertificateFilePreviewOpen] = React.useState(false);
  const [certificateFilePicker2Open, setCertificateFilePicker2Open] = React.useState(false);
  const [certificateFilePreview2Open, setCertificateFilePreview2Open] = React.useState(false);
  
  // 검역일
  const [quarantineDate, setQuarantineDate] = React.useState<string>('');
  // 통관일
  const [customsDate, setCustomsDate] = React.useState<string>('');

  // 기존 면장 파일 메타데이터 조회
  const certificateFileId = tradeOrder?.customsCertificateGoogleDriveFileId || null;
  const shouldFetchMetadata = open && !!tradeOrder?.customsCertificateGoogleDriveFileId;
  
  const { data: existingCertificateFileMetadata } = useGoogleDriveFileMetadata(
    certificateFileId,
    shouldFetchMetadata,
  );

  const certificateFileId2 = tradeOrder?.customsCertificateGoogleDriveFileId2 || null;
  const shouldFetchMetadata2 = open && !!tradeOrder?.customsCertificateGoogleDriveFileId2;

  const { data: existingCertificateFileMetadata2 } = useGoogleDriveFileMetadata(
    certificateFileId2,
    shouldFetchMetadata2,
  );

  // tradeOrder가 변경되면 초기화
  React.useEffect(() => {
    if (tradeOrder && open) {
      // 기존 파일 메타데이터가 있으면 설정
      if (existingCertificateFileMetadata) {
        setCertificateFile(existingCertificateFileMetadata);
      } else {
        setCertificateFile(null);
      }
      if (existingCertificateFileMetadata2) {
        setCertificateFile2(existingCertificateFileMetadata2);
      } else {
        setCertificateFile2(null);
      }
      // 검역일 설정 (기존 값이 있으면 사용, 없으면 빈 값)
      if (tradeOrder.quarantineDate) {
        setQuarantineDate(tradeOrder.quarantineDate);
      } else {
        setQuarantineDate('');
      }
      // 통관일 설정 (기존 값이 있으면 사용, 없으면 통관예정일, 그것도 없으면 오늘 날짜)
      if (tradeOrder.customsDate) {
        setCustomsDate(tradeOrder.customsDate);
      } else if (tradeOrder.customsScheduledDate) {
        setCustomsDate(tradeOrder.customsScheduledDate);
      } else {
        // 오늘 날짜를 기본값으로 설정
        setCustomsDate(new Date().toISOString().split('T')[0]);
      }
    } else if (!open) {
      setCertificateFile(null);
      setCertificateFile2(null);
      setQuarantineDate('');
      setCustomsDate('');
    }
  }, [open, tradeOrder, existingCertificateFileMetadata, existingCertificateFileMetadata2]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (certificateFilePreview2Open) {
        e.preventDefault();
        setCertificateFilePreview2Open(false);
        return;
      }
      if (certificateFilePicker2Open) {
        e.preventDefault();
        setCertificateFilePicker2Open(false);
        return;
      }
      if (certificateFilePreviewOpen) {
        e.preventDefault();
        setCertificateFilePreviewOpen(false);
        return;
      }
      if (certificateFilePickerOpen) {
        e.preventDefault();
        setCertificateFilePickerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    open,
    certificateFilePreview2Open,
    certificateFilePicker2Open,
    certificateFilePreviewOpen,
    certificateFilePickerOpen,
    onOpenChange,
  ]);

  const handleSubmit = async () => {
    if (!tradeOrder) return;

    // 면장 파일은 선택사항 (없어도 통관 처리 완료 가능)
    if (!customsDate || !customsDate.trim()) {
      toastApiError(new Error('통관일을 입력해주세요.'), '통관일 필요');
      return;
    }

    setIsSubmitting(true);
    try {
      const updateData: any = {
        tradeStatus: 'CUSTOMS',
        customsCertificateGoogleDriveFileId: certificateFile?.id ?? null,
        customsCertificateFileName: certificateFile?.name ?? null,
        customsCertificateGoogleDriveFileId2: certificateFile2?.id ?? null,
        customsCertificateFileName2: certificateFile2?.name ?? null,
        customsDate: customsDate.trim(),
        quarantineDate: quarantineDate?.trim() || null,
      };

      await updateMutation.mutateAsync({
        id: tradeOrder.id,
        data: updateData,
      });

      toastSuccess(
        '통관 처리 완료',
        certificateFile || certificateFile2 ? '면장 파일과 통관일이 등록되었습니다.' : '통관일이 등록되었습니다.',
      );
      
      // 데이터 갱신
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-order', tradeOrder.id] });
      
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('통관 처리 오류:', error);
      toastApiError(error, '통관 처리 실패');
    } finally {
      setIsSubmitting(false);
    }
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
    <>
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
                  <FileText className="h-5 w-5 text-primary" />
                  통관 처리
                </DrawerTitle>
                <DrawerDescription>
                  통관일을 등록하여 통관 처리 완료합니다. 면장 파일은 선택사항입니다.
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
            {tradeOrder ? (
              <div className="space-y-6">
                {/* 면장 파일 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">면장 파일 (선택)</h3>
                  <div className="space-y-4">
                    {/* 면장 파일 */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        면장 파일 (Google Drive)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCertificateFilePickerOpen(true)}
                          disabled={isSubmitting}
                          className="flex-1"
                        >
                          <Folder className="mr-2 h-4 w-4" />
                          {certificateFile ? certificateFile.name : '파일 선택'}
                        </Button>
                        {certificateFile && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setCertificateFilePreviewOpen(true)}
                              disabled={isSubmitting}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setCertificateFile(null)}
                              disabled={isSubmitting}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      {certificateFile && (
                        <p className="text-xs text-muted-foreground">
                          선택된 파일: {certificateFile.name}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        면장 파일 추가 (Google Drive)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCertificateFilePicker2Open(true)}
                          disabled={isSubmitting}
                          className="flex-1"
                        >
                          <Folder className="mr-2 h-4 w-4" />
                          {certificateFile2 ? certificateFile2.name : '파일 선택'}
                        </Button>
                        {certificateFile2 && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setCertificateFilePreview2Open(true)}
                              disabled={isSubmitting}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setCertificateFile2(null)}
                              disabled={isSubmitting}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      {certificateFile2 && (
                        <p className="text-xs text-muted-foreground">
                          선택된 파일: {certificateFile2.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 검역일 및 통관일 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">검역일 및 통관일</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        검역일
                      </Label>
                      <DatePicker
                        value={quarantineDate || undefined}
                        onChange={(date) => setQuarantineDate(date || '')}
                        disabled={isSubmitting}
                        placeholder="검역일 선택"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        통관일 <span className="text-destructive">*</span>
                      </Label>
                      <DatePicker
                        value={customsDate || undefined}
                        onChange={(date) => setCustomsDate(date || '')}
                        disabled={isSubmitting}
                        placeholder="통관일 선택"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                주문 정보를 불러올 수 없습니다.
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
                  disabled={!tradeOrder || isSubmitting || !customsDate?.trim()}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      처리 중...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      통관 처리 완료
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* 면장 파일 선택 다이얼로그 */}
      <GoogleDriveFilePicker
        open={certificateFilePickerOpen}
        onOpenChange={setCertificateFilePickerOpen}
        onSelect={(file) => {
          setCertificateFile(file);
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
        title="면장 파일 선택"
        description="구글 드라이브에서 면장 파일을 선택하세요"
      />

      {/* 면장 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={certificateFilePreviewOpen}
        onOpenChange={setCertificateFilePreviewOpen}
        file={certificateFile}
      />

      <GoogleDriveFilePicker
        open={certificateFilePicker2Open}
        onOpenChange={setCertificateFilePicker2Open}
        onSelect={(file) => {
          setCertificateFile2(file);
        }}
        acceptMimeTypes={[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.google-apps.document',
          'application/vnd.google-apps.spreadsheet',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/*',
        ]}
        title="면장 파일 추가 선택"
        description="구글 드라이브에서 추가 면장 파일을 선택하세요"
      />

      <GoogleDriveFilePreview
        open={certificateFilePreview2Open}
        onOpenChange={setCertificateFilePreview2Open}
        file={certificateFile2}
      />
    </>
  );
}


