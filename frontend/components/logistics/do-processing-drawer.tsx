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
import { DatePicker } from '@/components/schedules/date-picker';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';
import { useIsMobile } from '@/hooks/use-mobile';
import { TradeOrder, useUpdateTradeOrder } from '@/lib/hooks/use-trade-orders';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { GoogleDriveFile, useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCodesByCategory } from '@/lib/hooks/use-codes';

interface DoProcessingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeOrder: TradeOrder | null;
  onSuccess?: () => void;
}

export function DoProcessingDrawer({
  open,
  onOpenChange,
  tradeOrder,
  onSuccess,
}: DoProcessingDrawerProps) {
  const isMobile = useIsMobile();
  const updateMutation = useUpdateTradeOrder();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  // DO 파일
  const [doFile, setDoFile] = React.useState<GoogleDriveFile | null>(null);
  const [doFilePickerOpen, setDoFilePickerOpen] = React.useState(false);
  const [doFilePreviewOpen, setDoFilePreviewOpen] = React.useState(false);
  
  // 도착항
  const [destination, setDestination] = React.useState<string>('');
  // 검역일
  const [quarantineDate, setQuarantineDate] = React.useState<string>('');

  // 도착항 코드 마스터 조회
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');

  // 도착항 옵션 생성
  const destinationOptions = React.useMemo(() => {
    if (!destinationCodes) return [];
    return destinationCodes.map((code) => ({
      value: code.value || '',
      label: code.name || code.value || '',
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [destinationCodes]);

  // 기존 DO 파일 메타데이터 조회
  const doFileId = tradeOrder?.doGoogleDriveFileId || null;
  const shouldFetchDoMetadata = open && !!tradeOrder?.doGoogleDriveFileId;
  
  const { data: existingDoFileMetadata } = useGoogleDriveFileMetadata(
    doFileId,
    shouldFetchDoMetadata,
  );

  // tradeOrder가 변경되면 초기화
  React.useEffect(() => {
    if (tradeOrder && open) {
      // 기존 파일 메타데이터가 있으면 설정
      if (existingDoFileMetadata) {
        setDoFile(existingDoFileMetadata);
      } else {
        setDoFile(null);
      }
      // 도착항 설정
      // destinationCode를 우선 사용, 없으면 destinationName 사용
      const currentDestination = tradeOrder.destinationCode || tradeOrder.destinationName || '';
      setDestination(currentDestination);
      // 검역일 설정 (quarantineDate는 TradeOrder에 없을 수 있으므로 확인 필요)
      // 일단 빈 값으로 시작
      setQuarantineDate('');
    } else if (!open) {
      setDoFile(null);
      setDestination('');
      setQuarantineDate('');
    }
  }, [open, tradeOrder, existingDoFileMetadata]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (doFilePreviewOpen) {
        e.preventDefault();
        setDoFilePreviewOpen(false);
        return;
      }
      if (doFilePickerOpen) {
        e.preventDefault();
        setDoFilePickerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, doFilePreviewOpen, doFilePickerOpen, onOpenChange]);

  const handleSubmit = async () => {
    if (!tradeOrder) return;

    setIsSubmitting(true);
    try {
      const updateData: any = {
        tradeStatus: 'DO',
        doGoogleDriveFileId: doFile?.id || null,
        doFileName: doFile?.name || null,
        destination: destination?.trim() || null,
        quarantineDate: quarantineDate?.trim() || null,
      };

      await updateMutation.mutateAsync({
        id: tradeOrder.id,
        data: updateData,
      });

      toastSuccess('DO 처리 완료', 'DO 문서가 등록되었습니다.');
      
      // 데이터 갱신
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-order', tradeOrder.id] });
      
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('DO 처리 오류:', error);
      toastApiError(error, 'DO 처리 실패');
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
                  DO 처리
                </DrawerTitle>
                <DrawerDescription>
                  DO 문서를 등록하고 처리합니다.
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
                {/* DO 문서 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">DO 문서</h3>
                  <div className="space-y-4">
                    {/* DO 파일 */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        DO 파일 (Google Drive)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDoFilePickerOpen(true)}
                          disabled={isSubmitting}
                          className="flex-1"
                        >
                          <Folder className="mr-2 h-4 w-4" />
                          {doFile ? doFile.name : '파일 선택'}
                        </Button>
                        {doFile && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setDoFilePreviewOpen(true)}
                              disabled={isSubmitting}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setDoFile(null)}
                              disabled={isSubmitting}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      {doFile && (
                        <p className="text-xs text-muted-foreground">
                          선택된 파일: {doFile.name}
                        </p>
                      )}
                    </div>
                    
                    {/* 검역일 */}
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

                    {/* 도착항 */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        도착항
                      </Label>
                      <Select
                        value={destination}
                        onValueChange={setDestination}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={tradeOrder?.destinationName || "도착항 선택"} />
                        </SelectTrigger>
                        <SelectContent>
                          {destinationOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {tradeOrder?.destinationName && (
                        <p className="text-xs text-muted-foreground">
                          현재 도착항: {tradeOrder.destinationName}
                          {destination && destination !== tradeOrder.destinationCode && destination !== tradeOrder.destinationName && (
                            <span className="ml-2 text-blue-600">→ 변경됨</span>
                          )}
                        </p>
                      )}
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
                  disabled={!tradeOrder || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      처리 중...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      DO 처리 완료
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* DO 파일 선택 다이얼로그 */}
      <GoogleDriveFilePicker
        open={doFilePickerOpen}
        onOpenChange={setDoFilePickerOpen}
        onSelect={(file) => {
          setDoFile(file);
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
        title="DO 파일 선택"
        description="구글 드라이브에서 DO 파일을 선택하세요"
      />

      {/* DO 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={doFilePreviewOpen}
        onOpenChange={setDoFilePreviewOpen}
        file={doFile}
      />

    </>
  );
}

