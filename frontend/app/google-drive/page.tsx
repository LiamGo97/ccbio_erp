'use client';

import * as React from 'react';
import { useState } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useGoogleDriveFiles,
  useGoogleDriveFolders,
  useGoogleDriveSharedDrives,
  useUploadFile,
  useDeleteFile,
  getFileDownloadUrl,
  GoogleDriveFile,
} from '@/lib/hooks/use-google-drive';
import { toast } from '@/components/ui/use-toast';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  Download,
  Trash2,
  Search,
  Folder,
  File,
  MoreHorizontal,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  ArrowLeft,
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function GoogleDrivePage() {
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDrive, setSelectedDrive] = useState<string>('my-drive'); // 'my-drive' 또는 공유 드라이브 ID
  const [selectedFolder, setSelectedFolder] = useState<string>('__all__');
  const [pageToken, setPageToken] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<GoogleDriveFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: sharedDrives } = useGoogleDriveSharedDrives();
  const driveId = selectedDrive === 'my-drive' ? undefined : selectedDrive;

  const { data: filesData, isLoading: filesLoading, refetch: refetchFiles } = useGoogleDriveFiles({
    query: searchQuery || undefined,
    pageSize: 20,
    pageToken,
    folderId: selectedFolder && selectedFolder !== '__all__' ? selectedFolder : undefined,
    driveId,
  });

  const { data: folders, isLoading: foldersLoading } = useGoogleDriveFolders(driveId);
  const uploadFileMutation = useUploadFile();
  const deleteFileMutation = useDeleteFile();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await uploadFileMutation.mutateAsync({
        file,
        folderId: selectedFolder && selectedFolder !== '__all__' ? selectedFolder : undefined,
        driveId,
      });
      setPageToken(undefined); // 첫 페이지로 리셋
      refetchFiles();
      toast({
        title: '업로드 완료',
        description: `${file.name} 파일을 Google Drive에 업로드했습니다.`,
      });
    } catch (error) {
      console.error('파일 업로드 실패:', error);
      toast({
        title: '업로드 실패',
        description: '파일 업로드에 실패했습니다. 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      event.target.value = ''; // 파일 입력 리셋
    }
  };

  const handleDelete = async () => {
    if (!fileToDelete) return;

    try {
      await deleteFileMutation.mutateAsync(fileToDelete.id);
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      refetchFiles();
      toast({
        title: '삭제 완료',
        description: `${fileToDelete.name} 파일을 삭제했습니다.`,
      });
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      toast({
        title: '삭제 실패',
        description: '파일 삭제에 실패했습니다. 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = (file: GoogleDriveFile) => {
    const url = getFileDownloadUrl(file.id);
    window.open(url, '_blank');
  };

  const getFileIcon = (mimeType: string) => {
    // 폴더인 경우
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

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return '-';
    const size = parseInt(bytes, 10);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">구글 드라이브</h1>
            <p className="text-sm text-muted-foreground mt-1">
              구글 드라이브 파일을 관리하고 다운로드할 수 있습니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchFiles()}
              disabled={filesLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${filesLoading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
            <label>
              <Button variant="default" size="sm" asChild disabled={uploading}>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? '업로드 중...' : '파일 업로드'}
                </span>
              </Button>
              <input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </div>

        {/* 필터 영역 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4 items-center">
              {selectedFolder && selectedFolder !== '__all__' && (
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
                    setPageToken(undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="드라이브 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="my-drive">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4" />
                        내 드라이브
                      </div>
                    </SelectItem>
                    {sharedDrives?.map((drive) => (
                      <SelectItem key={drive.id} value={drive.id}>
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4" />
                          {drive.name}
                        </div>
                      </SelectItem>
                    ))}
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
                      setPageToken(undefined);
                    }}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-[200px]">
                <Select
                  value={selectedFolder}
                  onValueChange={(value) => {
                    setSelectedFolder(value);
                    setPageToken(undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="폴더 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {folders?.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4" />
                          {folder.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 파일 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>파일 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {filesLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filesData?.files && filesData.files.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2">
                  {filesData.files.map((file) => (
                    <div
                      key={file.id}
                      className={`flex items-center gap-4 p-3 border rounded-lg hover:bg-accent transition-colors ${
                        isFolder(file.mimeType) ? 'cursor-pointer' : ''
                      }`}
                      onClick={() => {
                        if (isFolder(file.mimeType)) {
                          setSelectedFolder(file.id);
                          setPageToken(undefined);
                        }
                      }}
                    >
                      <div className="flex-shrink-0">{getFileIcon(file.mimeType)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {file.name}
                          {isFolder(file.mimeType) && (
                            <Badge variant="outline" className="text-xs">
                              폴더
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-4">
                          {!isFolder(file.mimeType) && <span>{formatFileSize(file.size)}</span>}
                          {file.modifiedTime && (
                            <span>
                              {format(new Date(file.modifiedTime), 'yyyy-MM-dd HH:mm', {
                                locale: ko,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {!isFolder(file.mimeType) && file.webViewLink && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(file.webViewLink, '_blank')}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!isFolder(file.mimeType) && (
                              <DropdownMenuItem onClick={() => handleDownload(file)}>
                                <Download className="mr-2 h-4 w-4" />
                                다운로드
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                setFileToDelete(file);
                                setDeleteDialogOpen(true);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 페이지네이션 */}
                {filesData.nextPageToken && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setPageToken(filesData.nextPageToken)}
                    >
                      더 보기
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                파일이 없습니다.
              </div>
            )}
          </CardContent>
        </Card>

        {/* 삭제 확인 다이얼로그 */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>파일 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                정말로 "{fileToDelete?.name}" 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수
                없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

