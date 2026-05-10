'use client';

import * as React from 'react';
import { GoogleDriveFile } from '@/lib/hooks/use-google-drive';

interface GoogleDriveFilePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: GoogleDriveFile | null;
}

export function GoogleDriveFilePreview({
  open,
  onOpenChange,
  file,
}: GoogleDriveFilePreviewProps) {
  React.useEffect(() => {
    if (open && file) {
      // Google Drive에서 파일 열기
      let url: string;
      
      if (file.webViewLink) {
        // webViewLink가 있으면 직접 사용
        url = file.webViewLink;
      } else {
        // webViewLink가 없으면 Google Drive 직접 링크 생성
        url = `https://drive.google.com/file/d/${file.id}/view`;
      }
      
      window.open(url, '_blank');
      // 다이얼로그는 즉시 닫기
      onOpenChange(false);
    }
  }, [open, file, onOpenChange]);

  // 이 컴포넌트는 실제로 UI를 렌더링하지 않고, 자동으로 Google Drive에서 파일을 엽니다
  return null;
}

