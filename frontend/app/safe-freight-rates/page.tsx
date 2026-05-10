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
import { Checkbox } from '@/components/ui/checkbox';
import {
  useSafeFreightRates,
  useDistanceKmList,
  useSafeFreightRegionNames,
  useSafeFreightCityNames,
  useTownNames,
  SafeFreightRate,
} from '@/lib/hooks/use-safe-freight-rates';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/schedules/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Cookies from 'js-cookie';

// 쿠키에서 페이지당 행수 읽기
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

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('ko-KR').format(value);
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

export default function SafeFreightRatesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelSheetNames, setExcelSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [effectiveTo, setEffectiveTo] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(getInitialPageSize);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 필터 상태 (지역/시군구는 요금표 텍스트 기준)
  const [selectedPortCodeId, setSelectedPortCodeId] = useState<string>('__all__');
  const [selectedRegion, setSelectedRegion] = useState<string>('__all__');
  const [selectedCity, setSelectedCity] = useState<string>('__all__');
  const [selectedTownName, setSelectedTownName] = useState<string>('__all__');
  const [selectedDistanceKm, setSelectedDistanceKm] = useState<string>('__all__');

  // 할증 적용 (화물자동차 운임 규정): 심야 20%, 공휴일 20%, 심야+공휴일 중복 시 30%(단순 40% 아님)
  const [surchargeHoliday, setSurchargeHoliday] = useState(false);
  const [surchargeLateNight, setSurchargeLateNight] = useState(false);

  const { data: portCodes = [] } = useCodesByCategory('DESTINATION_PORT');
  const { data: regionNames = [] } = useSafeFreightRegionNames();
  const { data: cityNames = [] } = useSafeFreightCityNames(
    selectedRegion !== '__all__' ? selectedRegion : undefined,
  );
  const { data: townNames = [] } = useTownNames(
    selectedRegion !== '__all__' ? selectedRegion : undefined,
    selectedCity !== '__all__' ? selectedCity : undefined,
  );
  const { data: distanceKmList = [] } = useDistanceKmList();

  const queryParams = React.useMemo(
    () => ({
      page,
      limit: pageSize,
      sortBy,
      sortOrder,
      portCodeId: selectedPortCodeId !== '__all__' ? parseInt(selectedPortCodeId, 10) : undefined,
      region: selectedRegion !== '__all__' ? selectedRegion : undefined,
      city: selectedCity !== '__all__' ? selectedCity : undefined,
      townName: selectedTownName !== '__all__' ? selectedTownName : undefined,
      distanceKm: selectedDistanceKm !== '__all__' ? parseInt(selectedDistanceKm, 10) : undefined,
    }),
    [
      page,
      pageSize,
      sortBy,
      sortOrder,
      selectedPortCodeId,
      selectedRegion,
      selectedCity,
      selectedTownName,
      selectedDistanceKm,
    ],
  );

  const { data, isLoading, error } = useSafeFreightRates(queryParams);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 시군구 선택 시 동명 필터 리셋
  React.useEffect(() => {
    setSelectedTownName('__all__');
  }, [selectedCity]);

  // 지역 선택 시 시군구, 동명 필터 리셋
  React.useEffect(() => {
    setSelectedCity('__all__');
    setSelectedTownName('__all__');
  }, [selectedRegion]);

  const handleExcelFileSelect = async (file: File | null) => {
    setExcelFile(file);
    setSelectedSheetName('');
    setExcelSheetNames([]);
    if (!file) return;
    setLoadingSheets(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{ sheetNames: string[] }>(
        '/safe-freight-rates/upload-excel-sheets',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setExcelSheetNames(data.sheetNames || []);
      if (data.sheetNames?.length) {
        setSelectedSheetName(data.sheetNames[0]);
      }
    } catch {
      toast({
        title: '시트 목록 조회 실패',
        description: 'Excel 파일 형식을 확인해주세요.',
        variant: 'destructive',
      });
      setExcelSheetNames([]);
    } finally {
      setLoadingSheets(false);
    }
  };

  const handleExcelUpload = async () => {
    if (!excelFile) {
      toast({
        title: '파일 선택 필요',
        description: 'Excel 파일을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }
    if (!selectedSheetName) {
      toast({
        title: '시트 선택 필요',
        description: '처리할 시트(항구)를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', excelFile);
      formData.append('sheetName', selectedSheetName);
      if (effectiveFrom) formData.append('effectiveFrom', effectiveFrom);
      if (effectiveTo) formData.append('effectiveTo', effectiveTo);

      const response = await api.post('/safe-freight-rates/upload-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast({
        title: '업로드 완료',
        description:
          response.data.message ||
          `해당 항구(${selectedSheetName}) 요금표 ${response.data.imported}건을 import했습니다.`,
      });

      setUploadDialogOpen(false);
      setExcelFile(null);
      setExcelSheetNames([]);
      setSelectedSheetName('');
      setEffectiveFrom(new Date().toISOString().split('T')[0]);
      setEffectiveTo('');

      window.location.reload();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        apiError?.response?.data?.message ??
        apiError?.message ??
        'Excel 업로드 중 오류가 발생했습니다.';
      const normalizedMessage = Array.isArray(message)
        ? message.join(', ')
        : String(message);
      toast({
        title: '업로드 실패',
        description: normalizedMessage,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const columns: ColumnDef<SafeFreightRate>[] = [
    {
      accessorKey: 'portCode',
      header: '항구',
      cell: ({ row }) => row.original.portCode?.name || '-',
    },
    {
      accessorKey: 'regionName',
      header: '지역',
      cell: ({ row }) => row.original.regionName || '-',
    },
    {
      accessorKey: 'cityName',
      header: '시군구',
      cell: ({ row }) => row.original.cityName || '-',
    },
    {
      accessorKey: 'townName',
      header: '동명',
    },
    {
      accessorKey: 'distanceKm',
      header: '거리(km)',
      cell: ({ row }) => {
        const km = row.original.distanceKm;
        return km != null ? `${km}km` : '-';
      },
    },
    {
      accessorKey: 'safeTransportRate',
      header: '안전운송운임',
      cell: ({ row }) => {
        const base = row.original.safeTransportRate;
        if (base == null) return '-';
        const baseNum = Number(base);
        // 할증: 1개=20%(×1.2), 2개(중복)=규정상 30%(×1.3). 백원 단위 반올림.
        const surchargeCount = [surchargeHoliday, surchargeLateNight].filter(Boolean).length;
        const hasSurcharge = surchargeCount > 0;
        const multiplier = surchargeCount === 1 ? 1.2 : surchargeCount === 2 ? 1.3 : 1;
        const surchargedRate = hasSurcharge
          ? Math.round(baseNum * multiplier / 100) * 100
          : baseNum;

        if (hasSurcharge) {
          return (
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="text-muted-foreground">
                기본 {formatNumber(baseNum)}원
              </span>
              <span className="font-medium">
                할증 적용 {formatNumber(surchargedRate)}원
              </span>
            </div>
          );
        }
        return formatNumber(baseNum);
      },
    },
    {
      accessorKey: 'effectiveFrom',
      header: '적용 시작일',
      cell: ({ row }) => formatDate(row.original.effectiveFrom),
    },
  ];

  const filterControls = (
    <div className="flex flex-wrap gap-3 md:gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="port-filter" className="text-sm whitespace-nowrap">
          항구
        </Label>
        <Select value={selectedPortCodeId} onValueChange={setSelectedPortCodeId}>
          <SelectTrigger id="port-filter" className="w-[150px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {portCodes.map((code) => (
              <SelectItem key={code.id} value={code.id.toString()}>
                {code.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="region-filter" className="text-sm whitespace-nowrap">
          지역
        </Label>
        <Select value={selectedRegion} onValueChange={setSelectedRegion}>
          <SelectTrigger id="region-filter" className="w-[150px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {regionNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="city-filter" className="text-sm whitespace-nowrap">
          시군구
        </Label>
        <Select
          value={selectedCity}
          onValueChange={setSelectedCity}
          disabled={selectedRegion === '__all__'}
        >
          <SelectTrigger id="city-filter" className="w-[150px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {cityNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="town-filter" className="text-sm whitespace-nowrap">
          동명
        </Label>
        <Select
          value={selectedTownName}
          onValueChange={setSelectedTownName}
          disabled={selectedCity === '__all__'}
        >
          <SelectTrigger id="town-filter" className="w-[150px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {townNames?.map((townName) => (
              <SelectItem key={townName} value={townName}>
                {townName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="distance-filter" className="text-sm whitespace-nowrap">
          거리(km)
        </Label>
        <Select value={selectedDistanceKm} onValueChange={setSelectedDistanceKm}>
          <SelectTrigger id="distance-filter" className="w-[120px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {distanceKmList.map((km) => (
              <SelectItem key={km} value={km.toString()}>
                {km}km
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <span className="text-sm text-muted-foreground">할증 적용:</span>
        <div className="flex items-center gap-2">
          <Checkbox
            id="surcharge-holiday"
            checked={surchargeHoliday}
            onCheckedChange={(checked) => setSurchargeHoliday(checked === true)}
          />
          <Label htmlFor="surcharge-holiday" className="text-sm font-normal cursor-pointer">
            공휴일 및 대체공휴일 20%
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="surcharge-late-night"
            checked={surchargeLateNight}
            onCheckedChange={(checked) => setSurchargeLateNight(checked === true)}
          />
          <Label htmlFor="surcharge-late-night" className="text-sm font-normal cursor-pointer">
            심야(22:00~06:00) 20%
          </Label>
        </div>
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
          <div className="text-destructive">에러가 발생했습니다.</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">안전운임 요금표 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              안전운임 요금표를 확인하고 관리할 수 있습니다.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Excel 업로드
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
            if (!open) {
              setExcelFile(null);
              setExcelSheetNames([]);
              setSelectedSheetName('');
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>안전운임 요금표 업로드</DialogTitle>
              <DialogDescription>
                Excel 파일에서 선택한 시트(항구)의 기존 데이터만 삭제 후 신규 import됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="excel-file">Excel 파일</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="excel-file"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        handleExcelFileSelect(file || null);
                      }}
                    />
                {excelFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span className="truncate max-w-[180px]">{excelFile.name}</span>
                  </div>
                )}
              </div>
              {loadingSheets && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  시트 목록 조회 중...
                </div>
              )}
            </div>
            <div className="space-y-2">
                  <Label htmlFor="sheet-select">
                    처리할 시트 (항구) <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedSheetName}
                    onValueChange={setSelectedSheetName}
                    disabled={!excelSheetNames.length || loadingSheets}
                  >
                    <SelectTrigger id="sheet-select">
                      <SelectValue placeholder="시트를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {excelSheetNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              <div className="space-y-2">
                <Label htmlFor="effective-from">
                  적용 시작일 <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  value={effectiveFrom}
                  onChange={(v) => setEffectiveFrom(v ?? new Date().toISOString().split('T')[0])}
                  placeholder="시작일 선택"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="effective-to">적용 종료일 (선택사항)</Label>
                <DatePicker
                  value={effectiveTo || undefined}
                  onChange={(v) => setEffectiveTo(v ?? '')}
                  placeholder="종료일 선택 (비워두면 무기한)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setExcelFile(null);
                }}
                disabled={uploading}
              >
                취소
              </Button>
              <Button
                onClick={handleExcelUpload}
                disabled={uploading || !excelFile || !selectedSheetName}
              >
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

