'use client';

import * as React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useGoogleDriveFiles,
  useGoogleDriveFolders,
  useGoogleDriveSharedDrives,
  useGoogleDriveFileMetadata,
  GoogleDriveFile,
} from '@/lib/hooks/use-google-drive';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Folder,
  File,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  ArrowLeft,
  Check,
  Loader2,
  Eye,
} from 'lucide-react';
import { GoogleDriveFilePreview } from './google-drive-file-preview';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface GoogleDriveFilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (file: GoogleDriveFile) => void;
  acceptMimeTypes?: string[]; // 허용할 MIME 타입 (예: ['application/pdf', 'image/*'])
  title?: string;
  description?: string;
}

export function GoogleDriveFilePicker({
  open,
  onOpenChange,
  onSelect,
  acceptMimeTypes,
  title = '구글 드라이브에서 파일 선택',
  description = '파일을 선택하세요',
}: GoogleDriveFilePickerProps) {
  const [selectedDrive, setSelectedDrive] = useState<string>('my-drive');
  const [selectedFolder, setSelectedFolder] = useState<string>('__all__');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageToken, setPageToken] = useState<string | undefined>();
  const [selectedFile, setSelectedFile] = useState<GoogleDriveFile | null>(null);
  // Breadcrumb 경로 추적: [{ id, name }, ...]
  const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>([]);
  const [previewFile, setPreviewFile] = useState<GoogleDriveFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Dialog가 열릴 때만 공유 드라이브 목록 조회
  const { data: sharedDrives, isLoading: sharedDrivesLoading } = useGoogleDriveSharedDrives(open);

  // Dialog가 열릴 때 한 번만 기본값을 공유 드라이브로 설정
  const hasInitializedRef = React.useRef(false);
  
  React.useEffect(() => {
    if (!open) {
      // Dialog가 닫히면 초기화 플래그 리셋
      hasInitializedRef.current = false;
      return;
    }

    // 이미 초기화된 경우 스킵
    if (hasInitializedRef.current) {
      return;
    }

    // 공유 드라이브 목록이 로드되면 기본값 설정
    if (sharedDrives && sharedDrives.length > 0) {
      // 1순위: "GFI"라는 이름을 가진 공유 드라이브 찾기
      const gfiDrive = sharedDrives.find(
        (drive) => drive.type === 'shared' && drive.name.includes('GFI')
      );
      
      if (gfiDrive) {
        // GFI 폴더가 있으면 GFI 선택
        setSelectedDrive(gfiDrive.id);
        setSelectedFolder('__all__');
        setFolderPath([]);
        setPageToken(undefined);
        hasInitializedRef.current = true;
      } else {
        // GFI 폴더가 없으면 첫 번째 공유 드라이브 선택
        const firstSharedDrive = sharedDrives.find((drive) => drive.type === 'shared');
        if (firstSharedDrive) {
          setSelectedDrive(firstSharedDrive.id);
          setSelectedFolder('__all__');
          setFolderPath([]);
          setPageToken(undefined);
          hasInitializedRef.current = true;
        } else {
          // 공유 드라이브가 없으면 내 드라이브 유지
          hasInitializedRef.current = true;
        }
      }
    }
  }, [open, sharedDrives]);

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') {
      return <Folder className="h-5 w-5 text-yellow-500" />;
    }
    if (mimeType.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-blue-500" />;
    if (mimeType.startsWith('video/')) return <Video className="h-5 w-5 text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <Music className="h-5 w-5 text-green-500" />;
    if (mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const isFolder = (mimeType: string) => {
    return mimeType === 'application/vnd.google-apps.folder';
  };

  // 폴더만 선택 모드인지 확인 (acceptMimeTypes가 폴더만 포함하고 있는지)
  const isFolderOnlyMode = React.useMemo(() => {
    return acceptMimeTypes && acceptMimeTypes.length === 1 && acceptMimeTypes[0] === 'application/vnd.google-apps.folder';
  }, [acceptMimeTypes]);

  // Dialog가 열릴 때만 파일 목록 조회
  const driveId = selectedDrive === 'my-drive' ? undefined : selectedDrive;

  const { data: filesData, isLoading: filesLoading } = useGoogleDriveFiles({
    query: searchQuery || undefined,
    pageSize: 20,
    pageToken,
    folderId: selectedFolder && selectedFolder !== '__all__' ? selectedFolder : undefined,
    driveId,
    enabled: open, // Dialog가 열려있을 때만 조회
  });

  // 현재 폴더의 메타데이터 조회 (폴더만 선택 모드일 때만)
  const currentFolderId = isFolderOnlyMode && selectedFolder && selectedFolder !== '__all__' ? selectedFolder : null;
  const { data: currentFolderMetadata } = useGoogleDriveFileMetadata(currentFolderId, open && isFolderOnlyMode);

  const { data: folders } = useGoogleDriveFolders(driveId, open);

  const isFileAccepted = (file: GoogleDriveFile) => {
    if (!acceptMimeTypes || acceptMimeTypes.length === 0) {
      return true; // 필터 없음
    }
    return acceptMimeTypes.some((acceptType) => {
      if (acceptType.endsWith('/*')) {
        // 와일드카드 매칭 (예: 'image/*')
        const prefix = acceptType.slice(0, -2);
        return file.mimeType.startsWith(prefix);
      }
      return file.mimeType === acceptType;
    });
  };

  // 폴더와 파일을 분리 (모든 파일 표시, acceptMimeTypes는 선택 시에만 검증)
  const foldersAndFiles = React.useMemo(() => {
    if (!filesData?.files) return { folders: [], files: [] };
    const folders: GoogleDriveFile[] = [];
    const files: GoogleDriveFile[] = [];
    
    filesData.files.forEach((file) => {
      if (isFolder(file.mimeType)) {
        folders.push(file);
      } else {
        // 모든 파일을 표시 (필터링하지 않음)
        files.push(file);
      }
    });
    
    return { folders, files };
  }, [filesData?.files]);

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return '-';
    const size = parseInt(bytes, 10);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handleFileSelect = (file: GoogleDriveFile) => {
    // acceptMimeTypes가 있으면 선택 시에만 검증
    if (acceptMimeTypes && acceptMimeTypes.length > 0) {
      if (!isFileAccepted(file)) {
        // 허용되지 않는 파일 타입인 경우 경고만 표시하고 선택은 허용
        console.warn(`[GoogleDriveFilePicker] 허용되지 않는 파일 타입: ${file.name} (${file.mimeType})`);
        // 사용자에게 경고를 표시할 수도 있지만, 일단은 선택 허용
      }
    }
    setSelectedFile(file);
  };

  const handleConfirm = () => {
    if (selectedFile) {
      onSelect(selectedFile);
      onOpenChange(false);
      // 리셋
      setSelectedFile(null);
      setSelectedDrive('my-drive');
      setSelectedFolder('__all__');
      setFolderPath([]);
      setSearchQuery('');
      setPageToken(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 space-y-4">
          {/* 필터 영역 */}
          <div className="flex gap-4 items-center flex-shrink-0">
            {/* Breadcrumb 경로 표시 */}
            {folderPath.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // 루트로 이동
                    setSelectedFolder('__all__');
                    setFolderPath([]);
                    setPageToken(undefined);
                  }}
                  className="h-7 px-2"
                >
                  {selectedDrive === 'my-drive' ? '내 드라이브' : '공유 드라이브'}
                </Button>
                {folderPath.map((folder, index) => {
                  const isLastFolder = index === folderPath.length - 1;
                  return (
                    <React.Fragment key={folder.id}>
                      <span>/</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // 해당 폴더로 이동
                            const newPath = folderPath.slice(0, index + 1);
                            setFolderPath(newPath);
                            setSelectedFolder(folder.id);
                            setPageToken(undefined);
                          }}
                          className="h-7 px-2"
                        >
                          {folder.name}
                        </Button>
                        {/* 마지막 폴더(현재 폴더)에 선택 버튼 추가 (폴더만 선택 모드일 때) */}
                        {isLastFolder && isFolderOnlyMode && currentFolderMetadata && (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              // 현재 폴더 선택하고 다이얼로그 닫기
                              onSelect(currentFolderMetadata);
                              onOpenChange(false);
                              // 리셋
                              setSelectedFile(null);
                              setSearchQuery('');
                              setFolderPath([]);
                              setSelectedFolder('__all__');
                            }}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            선택
                          </Button>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            {/* 현재 폴더 선택 버튼 (Breadcrumb이 없고 폴더만 선택 모드일 때) */}
            {isFolderOnlyMode && selectedFolder && selectedFolder !== '__all__' && folderPath.length === 0 && currentFolderMetadata && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  // 현재 폴더 선택하고 다이얼로그 닫기
                  onSelect(currentFolderMetadata);
                  onOpenChange(false);
                  // 리셋
                  setSelectedFile(null);
                  setSearchQuery('');
                  setFolderPath([]);
                  setSelectedFolder('__all__');
                }}
                className="ml-2"
              >
                <Check className="h-4 w-4 mr-2" />
                현재 폴더 선택
              </Button>
            )}
            {/* 뒤로 버튼 (Breadcrumb이 없을 때만 표시) */}
            {selectedFolder && selectedFolder !== '__all__' && folderPath.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedFolder('__all__');
                  setPageToken(undefined);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                뒤로
              </Button>
            )}
            <div className="w-[180px]">
              <Select
                value={selectedDrive}
                onValueChange={(value) => {
                  setSelectedDrive(value);
                  setSelectedFolder('__all__');
                  setFolderPath([]); // 드라이브 변경 시 경로 초기화
                  setPageToken(undefined);
                }}
                disabled={sharedDrivesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={sharedDrivesLoading ? "로딩 중..." : "드라이브 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {sharedDrivesLoading ? (
                    <SelectItem value="__loading__" disabled>
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        로딩 중...
                      </div>
                    </SelectItem>
                  ) : sharedDrives && sharedDrives.length > 0 ? (
                    sharedDrives.map((drive) => (
                      <SelectItem key={drive.id} value={drive.id}>
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4" />
                          {drive.name}
                          {drive.type === 'shared' && (
                            <Badge variant="secondary" className="text-xs ml-1">
                              공유
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="my-drive" disabled>
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4" />
                        드라이브 없음
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="파일명으로 검색..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    // 검색 모드로 전환 시 breadcrumb 경로 초기화
                    if (e.target.value) {
                      setFolderPath([]);
                      setSelectedFolder('__all__');
                    }
                    setPageToken(undefined);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* 파일 목록 */}
          <div className="flex-1 overflow-y-auto border rounded-lg">
            {filesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (foldersAndFiles.folders.length > 0 || foldersAndFiles.files.length > 0) ? (
              <div className="divide-y">
                {/* 폴더 목록 */}
                {foldersAndFiles.folders.map((folder) => {
                  // 드라이브 정보 확인: driveId가 있고 현재 선택된 드라이브와 다르면 공유 드라이브 파일
                  const isFromSharedDrive = folder.driveId && folder.driveId !== selectedDrive && selectedDrive !== 'my-drive';
                  
                  return (
                    <div
                      key={folder.id}
                      className={`flex items-center gap-4 p-3 hover:bg-accent transition-colors cursor-pointer ${
                        selectedFile?.id === folder.id ? 'bg-accent' : ''
                      }`}
                      onClick={() => {
                        // 폴더를 클릭하면 항상 하위 폴더로 이동
                        // 검색 모드일 때는 검색 쿼리를 초기화하고 폴더로 이동
                        if (searchQuery) {
                          setSearchQuery('');
                          // 검색 모드에서 폴더 선택 시 breadcrumb 경로 초기화 (해당 폴더만 표시)
                          setFolderPath([{ id: folder.id, name: folder.name }]);
                        } else {
                          // 일반 모드에서는 breadcrumb 경로에 현재 폴더 추가
                          setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
                        }
                        setSelectedFolder(folder.id);
                        setPageToken(undefined);
                      }}
                    >
                      <div className="flex-shrink-0">{getFileIcon(folder.mimeType)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {folder.name}
                          <Badge variant="outline" className="text-xs">
                            폴더
                          </Badge>
                          {folder.driveId && folder.driveId !== selectedDrive && selectedDrive !== 'my-drive' && (
                            <Badge variant="secondary" className="text-xs">
                              공유 드라이브
                            </Badge>
                          )}
                        </div>
                        {folder.modifiedTime && (
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(folder.modifiedTime), 'yyyy-MM-dd HH:mm', {
                              locale: ko,
                            })}
                          </div>
                        )}
                      </div>
                      {isFolderOnlyMode && (
                        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3"
                            onClick={() => {
                              // 폴더 선택하고 다이얼로그 닫기
                              onSelect(folder);
                              onOpenChange(false);
                              // 리셋
                              setSelectedFile(null);
                              setSearchQuery('');
                              setFolderPath([]);
                              setSelectedFolder('__all__');
                            }}
                          >
                            선택
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* 파일 목록 - 모든 파일 표시 (이미지 확인용) */}
                {foldersAndFiles.files.map((file) => {
                  // 드라이브 정보 확인: driveId가 있고 현재 선택된 드라이브와 다르면 다른 드라이브에서 온 파일
                  const isFromOtherDrive = file.driveId && file.driveId !== selectedDrive && selectedDrive !== 'my-drive';
                  const isFromSharedDrive = file.driveId && file.driveId !== 'my-drive' && selectedDrive === 'my-drive';
                  
                  return (
                  <div
                    key={file.id}
                    className={`flex items-center gap-4 p-3 hover:bg-accent transition-colors ${
                      selectedFile?.id === file.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div
                      className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleFileSelect(file)}
                    >
                      <div className="flex-shrink-0">{getFileIcon(file.mimeType)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {file.name}
                          {selectedFile?.id === file.id && (
                            <Badge variant="default" className="text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              선택됨
                            </Badge>
                          )}
                          {isFromOtherDrive && (
                            <Badge variant="secondary" className="text-xs">
                              공유 드라이브
                            </Badge>
                          )}
                          {isFromSharedDrive && (
                            <Badge variant="secondary" className="text-xs">
                              공유 드라이브
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-4">
                          <span>{formatFileSize(file.size)}</span>
                          {file.modifiedTime && (
                            <span>
                              {format(new Date(file.modifiedTime), 'yyyy-MM-dd HH:mm', {
                                locale: ko,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setPreviewFile(file);
                          setPreviewOpen(true);
                        }}
                        title="미리보기"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? '검색 결과가 없습니다.' : '파일이 없습니다.'}
              </div>
            )}
          </div>

          {/* 페이지네이션 */}
          {filesData?.nextPageToken && (
            <div className="flex justify-center flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageToken(filesData.nextPageToken)}
              >
                더 보기
              </Button>
            </div>
          )}

          {/* 선택된 파일 정보 - 폴더만 선택 모드일 때는 표시하지 않음 (바로 선택됨) */}
          {selectedFile && !isFolderOnlyMode && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg flex-shrink-0">
              <div className="flex items-center gap-3">
                {getFileIcon(selectedFile.mimeType)}
                <div>
                  <div className="font-medium text-sm">{selectedFile.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </div>
                </div>
              </div>
              <Button onClick={handleConfirm} size="sm">
                선택
              </Button>
            </div>
          )}
        </div>
      </DialogContent>

      {/* 파일 미리보기 다이얼로그 */}
      <GoogleDriveFilePreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        file={previewFile}
      />
    </Dialog>
  );
}

