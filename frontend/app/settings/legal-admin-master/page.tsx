'use client';

import * as React from 'react';
import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Loader2, Upload, FileSpreadsheet } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  useLegalAdminMasterList,
  useLegalAdminSidoOptions,
  useLegalAdminSigunguOptions,
  LegalAdminMasterRow,
} from '@/lib/hooks/use-legal-admin-master';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Cookies from 'js-cookie';

const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) {
      return parsed;
    }
  }
  return 20;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export default function LegalAdminMasterPage() {
  const [user, setUser] = useState<User | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(getInitialPageSize);
  const [sortBy, setSortBy] = useState<string>('bCode');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedSido, setSelectedSido] = useState<string>('__all__');
  const [selectedSigungu, setSelectedSigungu] = useState<string>('__all__');
  const [searchQ, setSearchQ] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data: sidoOptions = [] } = useLegalAdminSidoOptions();
  const { data: sigunguOptions = [] } = useLegalAdminSigunguOptions(
    selectedSido !== '__all__' ? selectedSido : undefined,
  );

  const queryParams = React.useMemo(
    () => ({
      page,
      limit: pageSize,
      sortBy,
      sortOrder,
      sidoCode: selectedSido !== '__all__' ? selectedSido : undefined,
      sigunguCode: selectedSigungu !== '__all__' ? selectedSigungu : undefined,
      q: searchQ.trim() || undefined,
    }),
    [page, pageSize, sortBy, sortOrder, selectedSido, selectedSigungu, searchQ],
  );

  const { data, isLoading, error, refetch } = useLegalAdminMasterList(queryParams);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  React.useEffect(() => {
    setSelectedSigungu('__all__');
  }, [selectedSido]);

  const handleUpload = async () => {
    if (!dataFile) {
      toast({
        title: '파일 선택 필요',
        description: 'CSV 또는 Excel 파일을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', dataFile);
      const res = await api.post<{
        message?: string;
        imported?: number;
        skipped?: number;
        errors?: string[];
      }>('/legal-admin-master/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const errLines = res.data.errors?.length
        ? ` / 경고·오류 ${res.data.errors.length}건 (최대 30건까지 응답)`
        : '';
      toast({
        title: '업로드 완료',
        description: `${res.data.message ?? ''}${errLines}`,
      });
      if (res.data.errors?.length) {
        console.warn('legal-admin-master import errors', res.data.errors);
      }
      setUploadDialogOpen(false);
      setDataFile(null);
      await refetch();
    } catch (e: unknown) {
      const apiError = e as { response?: { data?: { message?: unknown } }; message?: string };
      const message = apiError?.response?.data?.message ?? apiError?.message ?? '업로드 실패';
      const normalized = Array.isArray(message) ? message.join(', ') : String(message);
      toast({ title: '업로드 실패', description: normalized, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const columns: ColumnDef<LegalAdminMasterRow>[] = [
    { accessorKey: 'bCode', header: '법정동코드' },
    { accessorKey: 'sidoName', header: '시도' },
    { accessorKey: 'sigunguName', header: '시군구' },
    { accessorKey: 'eupmyeondongName', header: '읍면동' },
    { accessorKey: 'riName', header: '리' },
    {
      accessorKey: 'deletedDateSrc',
      header: '삭제일(원본)',
      cell: ({ row }) => formatDate(row.original.deletedDateSrc),
    },
  ];

  const filterControls = (
    <div className="flex flex-wrap gap-3 md:gap-4 items-end">
      <div className="flex items-center gap-2">
        <Label htmlFor="lam-sido" className="text-sm whitespace-nowrap">
          시도
        </Label>
        <Select value={selectedSido} onValueChange={setSelectedSido}>
          <SelectTrigger id="lam-sido" className="w-[160px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {sidoOptions.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.name} ({o.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="lam-sg" className="text-sm whitespace-nowrap">
          시군구
        </Label>
        <Select
          value={selectedSigungu}
          onValueChange={setSelectedSigungu}
          disabled={selectedSido === '__all__'}
        >
          <SelectTrigger id="lam-sg" className="w-[200px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {sigunguOptions.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <Label htmlFor="lam-q" className="text-sm whitespace-nowrap">
          검색
        </Label>
        <Input
          id="lam-q"
          placeholder="코드·시도·시군구·동·리"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setSearchQ(searchInput);
              setPage(1);
            }
          }}
          className="max-w-xs"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setSearchQ(searchInput);
            setPage(1);
          }}
        >
          적용
        </Button>
      </div>
    </div>
  );

  if (!user) {
    return (
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout user={user}>
        <div className="flex items-center justify-center h-64">
          <div className="text-destructive">목록을 불러오지 못했습니다. 테이블 생성 여부를 확인하세요.</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">법정동 마스터</h1>
            <p className="text-sm text-muted-foreground mt-1">
              국토교통부「전국 법정동」CSV/Excel을 업로드하여 DB에 반영합니다. 동일 코드는 덮어씁니다(upsert).
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            파일 업로드
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          filterControls={filterControls}
          page={page}
          pageSize={pageSize}
          total={data?.total || 0}
          totalPages={data?.totalPages || 0}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          manualPagination={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(newSortBy, newSortOrder) => {
            setSortBy(newSortBy);
            setSortOrder(newSortOrder);
            setPage(1);
          }}
          rowClassName="h-10"
        />

        <Dialog
          open={uploadDialogOpen}
          onOpenChange={(open) => {
            setUploadDialogOpen(open);
            if (!open) setDataFile(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>법정동 마스터 업로드</DialogTitle>
              <DialogDescription>
                첫 행 헤더에 법정동코드, 시도명, 시군구명, 읍면동명, 리명, 순위, 생성일자, 삭제일자, 과거법정동코드가
                포함된 국토부 파일을 사용하세요.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="lam-file">CSV 또는 Excel</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    id="lam-file"
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => setDataFile(e.target.files?.[0] ?? null)}
                  />
                  {dataFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileSpreadsheet className="h-4 w-4" />
                      <span className="truncate max-w-[220px]">{dataFile.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={uploading}>
                취소
              </Button>
              <Button onClick={handleUpload} disabled={uploading || !dataFile}>
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                업로드
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
