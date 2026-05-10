import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  parents?: string[]; // Google Drive의 부모 폴더 ID 배열
  driveId?: string; // 파일이 속한 드라이브 ID (공유 드라이브인 경우 해당 드라이브 ID, 내 드라이브인 경우 없거나 파일 ID와 다를 수 있음)
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface GoogleDriveSharedDrive {
  id: string;
  name: string;
  type: 'my' | 'shared'; // 드라이브 타입: 'my' = 내 드라이브, 'shared' = 공유 드라이브
}

export interface ListFilesResponse {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

export interface ListFilesParams {
  query?: string;
  pageSize?: number;
  pageToken?: string;
  folderId?: string;
  driveId?: string;
  enabled?: boolean;
}

// 파일 목록 조회
export function useGoogleDriveFiles(params?: ListFilesParams) {
  const { enabled = true, ...queryParams } = params || {};
  return useQuery<ListFilesResponse>({
    queryKey: ['google-drive', 'files', queryParams],
    queryFn: async () => {
      const response = await api.get<ListFilesResponse>('/google-drive/files', {
        params: queryParams,
      });
      return response.data;
    },
    enabled,
  });
}

// 폴더 목록 조회
export function useGoogleDriveFolders(driveId?: string, enabled = true) {
  return useQuery<GoogleDriveFolder[]>({
    queryKey: ['google-drive', 'folders', driveId],
    queryFn: async () => {
      const response = await api.get<GoogleDriveFolder[]>('/google-drive/folders', {
        params: driveId ? { driveId } : {},
      });
      return response.data;
    },
    enabled,
  });
}

// 공유 드라이브 목록 조회
export function useGoogleDriveSharedDrives(enabled = true) {
  return useQuery<GoogleDriveSharedDrive[]>({
    queryKey: ['google-drive', 'shared-drives'],
    queryFn: async () => {
      try {
        const response = await api.get<GoogleDriveSharedDrive[]>('/google-drive/shared-drives');
        console.log('공유 드라이브 목록 응답:', response.data);
        return response.data || [];
      } catch (error) {
        console.error('공유 드라이브 목록 조회 실패:', error);
        // 에러가 발생해도 빈 배열 반환
        return [];
      }
    },
    enabled,
    retry: 1, // 실패 시 1번만 재시도
  });
}

// 파일 메타데이터 조회
export function useGoogleDriveFileMetadata(fileId: string | null | undefined, enabled = true) {
  return useQuery<GoogleDriveFile>({
    queryKey: ['google-drive', 'file', fileId],
    queryFn: async () => {
      if (!fileId) {
        throw new Error('파일 ID가 필요합니다.');
      }
      const response = await api.get<GoogleDriveFile>(`/google-drive/files/${fileId}`);
      return response.data;
    },
    enabled: enabled && !!fileId,
    retry: 1,
  });
}

// 파일 업로드
export function useUploadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      folderId,
      driveId,
    }: {
      file: File;
      folderId?: string;
      driveId?: string;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (folderId) {
        formData.append('folderId', folderId);
      }
      if (driveId) {
        formData.append('driveId', driveId);
      }

      const response = await api.post<GoogleDriveFile>(
        '/google-drive/files/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-drive', 'files'] });
      queryClient.invalidateQueries({ queryKey: ['google-drive', 'folders'] });
    },
  });
}

// VehicleDispatch용 파일 업로드 (상차업체별 폴더에 자동 업로드)
export function useUploadFileForVehicleDispatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      warehouseId,
    }: {
      file: File;
      warehouseId: number;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('warehouseId', String(warehouseId));

      const response = await api.post<GoogleDriveFile>(
        '/google-drive/files/upload/vehicle-dispatch',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-drive', 'files'] });
      queryClient.invalidateQueries({ queryKey: ['google-drive', 'folders'] });
    },
  });
}

// 파일 삭제
export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/google-drive/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-drive', 'files'] });
    },
  });
}

// 파일 다운로드 URL 생성
export function getFileDownloadUrl(fileId: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  return `${apiUrl}/google-drive/files/${fileId}/download`;
}

