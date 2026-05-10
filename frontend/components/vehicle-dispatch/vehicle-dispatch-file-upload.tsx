'use client';

import * as React from 'react';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileText, X, CheckCircle2 } from 'lucide-react';
import { useUploadFileForVehicleDispatch } from '@/lib/hooks/use-google-drive';
import { toastSuccess, toastError } from '@/lib/utils/toast-helpers';

interface VehicleDispatchFileUploadProps {
  warehouseId: number;
  onUploadComplete?: (fileId: string, fileName: string) => void;
  existingFiles?: Array<{
    id: string;
    name: string;
  }>;
  onRemoveFile?: (fileId: string) => void;
}

export function VehicleDispatchFileUpload({
  warehouseId,
  onUploadComplete,
  existingFiles = [],
  onRemoveFile,
}: VehicleDispatchFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadFileMutation = useUploadFileForVehicleDispatch();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // 파일 크기 제한 (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      toastError('파일 업로드 실패', '파일 크기는 100MB를 초과할 수 없습니다.');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadFileMutation.mutateAsync({
        file,
        warehouseId,
      });

      toastSuccess('파일 업로드 완료', `${file.name} 파일이 업로드되었습니다.`);
      
      if (onUploadComplete) {
        onUploadComplete(result.id, result.name || file.name);
      }

      // 파일 입력 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('파일 업로드 오류:', error);
      toastError(
        '파일 업로드 실패',
        error?.response?.data?.message || '파일 업로드 중 오류가 발생했습니다.',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    if (onRemoveFile) {
      onRemoveFile(fileId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>파일 첨부</Label>
        <div className="flex items-center gap-2">
          <Input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            disabled={uploading || !warehouseId}
            className="hidden"
            id="vehicle-dispatch-file-upload"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !warehouseId}
            className="flex items-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                업로드 중...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                파일 선택
              </>
            )}
          </Button>
          {!warehouseId && (
            <span className="text-sm text-muted-foreground">
              상차업체를 선택해야 파일을 업로드할 수 있습니다.
            </span>
          )}
        </div>
      </div>

      {existingFiles.length > 0 && (
        <div className="space-y-2">
          <Label>첨부된 파일</Label>
          <div className="space-y-2">
            {existingFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{file.name}</span>
                </div>
                {onRemoveFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFile(file.id)}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">삭제</span>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

