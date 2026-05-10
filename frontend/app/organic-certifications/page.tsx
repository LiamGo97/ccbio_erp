'use client';

import * as React from 'react';
import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Plus, Download, Image as ImageIcon } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  useOrganicCertifications,
  useDeleteOrganicCertification,
  useOrganicCertificationStats,
  OrganicCertification,
} from '@/lib/hooks/use-organic-certifications';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import api from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('react-apexcharts').then((mod) => mod.default), { ssr: false });
import { toast } from '@/components/ui/use-toast';
import { OrganicCertificationFormDrawer } from '@/components/organic-certifications/organic-certification-form-drawer';
import { OrganicCertificationDetailDrawer } from '@/components/organic-certifications/organic-certification-detail-drawer';
import { Trash2 } from 'lucide-react';
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
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value);
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

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits;
};

export default function OrganicCertificationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [certificationToDelete, setCertificationToDelete] = useState<OrganicCertification | null>(null);
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedCertification, setSelectedCertification] = useState<OrganicCertification | null>(null);
  const [selectedCertificationId, setSelectedCertificationId] = useState<number | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(getInitialPageSize);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedMainProduct, setSelectedMainProduct] = useState<string>('__all__');
  const [selectedRegion, setSelectedRegion] = useState<string>('__all__');

  const queryParams = React.useMemo(
    () => ({
      page,
      limit: pageSize,
      sortBy,
      sortOrder,
      mainProduct: selectedMainProduct !== '__all__' ? selectedMainProduct : undefined,
      region: selectedRegion !== '__all__' ? selectedRegion : undefined,
    }),
    [page, pageSize, sortBy, sortOrder, selectedMainProduct, selectedRegion],
  );

  const { data, isLoading, refetch } = useOrganicCertifications(queryParams);
  const { data: stats, isLoading: statsLoading } = useOrganicCertificationStats();
  const deleteMutation = useDeleteOrganicCertification();
  const { data: detailProductCodes } = useCodeMastersByGroup('ORGANIC_DETAIL_PRODUCT');
  
  // 세부품목 코드 맵 생성
  const detailProductMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (detailProductCodes ?? []).forEach((code) => {
      if (code.value) {
        map.set(code.value, code.name);
      }
    });
    return map;
  }, [detailProductCodes]);
  
  // 세부품목 라벨 가져오기
  const getDetailProductLabels = React.useCallback((products?: string[] | null) => {
    if (!products || products.length === 0) return '-';
    return products.map((value) => detailProductMap.get(value) || value).join(', ');
  }, [detailProductMap]);

  // 차트 인스턴스 저장
  const chartInstances = React.useRef<Record<string, ApexCharts | null>>({
    chart1: null, // 지역별 농가수
    chart2: null, // 전체 농가수
    chart3: null, // 지역별 사육두수
    chart4: null, // 전체 사육두수
  });

  // 차트 다운로드 함수
  const downloadChart = React.useCallback(async (chartKey: string, filename: string) => {
    const chart = chartInstances.current[chartKey];
    if (!chart) {
      toast({
        title: '다운로드 실패',
        description: '차트를 불러올 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const dataURI = await chart.dataURI();
      const link = document.createElement('a');
      link.download = `${filename}_${new Date().toISOString().split('T')[0]}.png`;
      link.href = 'imgURI' in dataURI ? dataURI.imgURI : URL.createObjectURL(dataURI.blob);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if ('blob' in dataURI) {
        URL.revokeObjectURL(link.href);
      }

      toast({
        title: '다운로드 완료',
        description: '차트 이미지가 다운로드되었습니다.',
      });
    } catch (error) {
      console.error('차트 다운로드 오류:', error);
      toast({
        title: '다운로드 실패',
        description: '차트 다운로드 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  }, []);

  // 대표품목 목록 추출 (통계 API에서 가져오기)
  const mainProducts = React.useMemo(() => {
    if (!stats?.mainProducts) return [];
    return stats.mainProducts;
  }, [stats]);

  // 지역 목록 추출 (통계에서 가져오기)
  const regions = React.useMemo(() => {
    if (!stats?.byRegion) return [];
    return stats.byRegion.map((item) => item.region).sort();
  }, [stats]);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const handleCreate = () => {
    setSelectedCertification(null);
    setFormMode('create');
    setFormDrawerOpen(true);
  };

  const handleRowClick = (certification: OrganicCertification) => {
    setSelectedCertificationId(certification.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = () => {
    if (selectedCertificationId) {
      const cert = data?.data?.find((c) => c.id === selectedCertificationId);
      if (cert) {
        setSelectedCertification(cert);
        setFormMode('edit');
        setDetailDrawerOpen(false);
        setFormDrawerOpen(true);
      }
    }
  };

  const handleDelete = () => {
    if (selectedCertificationId) {
      const cert = data?.data?.find((c) => c.id === selectedCertificationId);
      if (cert) {
        setCertificationToDelete(cert);
        setDetailDrawerOpen(false);
        setDeleteDialogOpen(true);
      }
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await api.get('/organic-certifications/export/excel', {
        params: queryParams,
        responseType: 'blob',
      });

      // 파일 다운로드
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `유기축산_인증_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: '다운로드 완료',
        description: '엑셀 파일이 다운로드되었습니다.',
      });
    } catch (err) {
      console.error('엑셀 다운로드 오류:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast({
        title: '다운로드 실패',
        description: error.response?.data?.message || '엑셀 파일 다운로드에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = async () => {
    if (!certificationToDelete) return;
    try {
      await deleteMutation.mutateAsync(certificationToDelete.id);
      toast({
        title: '삭제 완료',
        description: '유기축산 인증 정보를 삭제했습니다.',
      });
      setDeleteDialogOpen(false);
      setCertificationToDelete(null);
      if (selectedCertificationId === certificationToDelete.id) {
        setDetailDrawerOpen(false);
        setSelectedCertificationId(null);
      }
      await refetch();
    } catch {
      toast({
        title: '삭제 실패',
        description: '삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const columns = React.useMemo<ColumnDef<OrganicCertification>[]>(() => {
    return [
      {
        accessorKey: 'companyName',
        header: '업체명',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm font-medium">{row.original.companyName || '-'}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'producer',
        header: '대표자',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm font-medium">{row.original.producer || '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'phone',
        header: '전화번호',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{formatPhone(row.original.phone)}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'mainProduct',
        header: '대표품목',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.mainProduct || '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'certificationType',
        header: '인증분류',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.certificationType || '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'deliveryDestination',
        header: '납품처',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.deliveryDestination || '-'}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'detailProducts',
        header: '세부품목',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{getDetailProductLabels(row.original.detailProducts)}</div>
        ),
        size: 180,
      },
      {
        accessorKey: 'address',
        header: '주소',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.address || '-'}</div>
        ),
        size: 200,
      },
      {
        accessorKey: 'certificationStartDate',
        header: '인증기간',
        enableSorting: true,
        cell: ({ row }) => {
          const start = formatDate(row.original.certificationStartDate);
          const end = formatDate(row.original.certificationEndDate);
          if (start === '-' && end === '-') return '-';
          return (
            <div className="text-sm">
              {start} ~ {end}
            </div>
          );
        },
        size: 180,
      },
      {
        accessorKey: 'livestockCount',
        header: '사육두수',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">{formatNumber(row.original.livestockCount)}</div>
        ),
        size: 100,
      },
      {
        accessorKey: 'cultivationAreaM2',
        header: '재배면적(㎡)',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">{formatNumber(row.original.cultivationAreaM2)}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'annualProductionTarget',
        header: '연간 생산 목표',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">{formatNumber(row.original.annualProductionTarget)}</div>
        ),
        size: 120,
      },
    ];
  }, [getDetailProductLabels]);


  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">유기축산 인증 관리</h1>
            <p className="text-sm text-muted-foreground">유기축산 인증 정보를 조회하고 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExportExcel}>
              <Download className="mr-2 h-4 w-4" />
              엑셀 다운로드
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              인증 추가
            </Button>
          </div>
        </div>

        {/* 통계 그래프 */}
        {/* 첫 번째 행: 지역별 농가수 + 전체 농가수 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>지역별 농가수</CardTitle>
                  <CardDescription>시/도별 유기축산 인증 농가 수 (품목별)</CardDescription>
                </div>
                {!statsLoading && stats && stats.byRegion.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadChart('chart1', '지역별_농가수')}
                    className="h-8"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    다운로드
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex items-center justify-center h-[350px]">
                  <div className="text-2xl font-bold text-muted-foreground">로딩 중...</div>
                </div>
              ) : stats && stats.byRegion.length > 0 ? (
                <Chart
                  type="bar"
                  height={300}
                  series={[
                    {
                      name: '젖소',
                      data: stats.byRegion.map((item) => item.byProduct?.젖소?.farmCount || 0),
                    },
                    {
                      name: '한우',
                      data: stats.byRegion.map((item) => item.byProduct?.한우?.farmCount || 0),
                    },
                  ]}
                  options={{
                    chart: {
                      type: 'bar',
                      toolbar: { show: false },
                      stacked: true,
                      events: {
                        mounted: (chartContext: ApexCharts) => {
                          chartInstances.current.chart1 = chartContext;
                        },
                      },
                    },
                    xaxis: {
                      categories: stats.byRegion.map((item) => item.region),
                      labels: {
                        rotate: -45,
                        rotateAlways: true,
                        style: {
                          fontSize: '12px',
                        },
                      },
                    },
                    yaxis: {
                      title: {
                        text: '농가수',
                      },
                    },
                    dataLabels: {
                      enabled: true,
                      formatter: (val: number) => (val > 0 ? val.toLocaleString() : ''),
                    },
                    tooltip: {
                      y: {
                        formatter: (value: number) => `${value.toLocaleString()}개`,
                      },
                    },
                    colors: ['#3b82f6', '#10b981'],
                    legend: {
                      position: 'bottom',
                    },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="text-muted-foreground">데이터가 없습니다.</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle>전체 농가수</CardTitle>
                  <CardDescription>품목별 비율</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!statsLoading && stats?.farmCountByProduct && (
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {stats.farmCountByProduct.전체.toLocaleString()}
                        <span className="text-base font-normal text-muted-foreground ml-1">개</span>
                      </div>
                    </div>
                  )}
                  {!statsLoading && stats?.farmCountByProduct && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadChart('chart2', '전체_농가수')}
                      className="h-8"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex items-center justify-center h-[250px]">
                  <div className="text-sm text-muted-foreground">로딩 중...</div>
                </div>
              ) : stats?.farmCountByProduct ? (
                <div className="space-y-3">
                  <Chart
                    type="pie"
                    height={300}
                    series={[
                      stats.farmCountByProduct.젖소 || 0,
                      stats.farmCountByProduct.한우 || 0,
                    ]}
                    options={{
                      chart: {
                        type: 'pie',
                        toolbar: { show: false },
                        events: {
                          mounted: (chartContext: ApexCharts) => {
                            chartInstances.current.chart2 = chartContext;
                          },
                        },
                      },
                      labels: ['젖소', '한우'],
                      colors: ['#3b82f6', '#10b981'],
                      legend: {
                        position: 'bottom',
                        fontSize: '12px',
                      },
                      dataLabels: {
                        enabled: true,
                        formatter: (val: number, opts: { w: { globals: { series: number[] } }; seriesIndex: number }) => {
                          const value = opts.w.globals.series[opts.seriesIndex];
                          return `${val.toFixed(1)}% (${value.toLocaleString()}개)`;
                        },
                        style: {
                          fontSize: '16px',
                          fontWeight: 'bold',
                          colors: ['#ffffff'],
                        },
                        offsetY: -30,
                        dropShadow: {
                          enabled: true,
                          blur: 4,
                          opacity: 0.5,
                          color: '#000000',
                        },
                      },
                      tooltip: {
                        y: {
                          formatter: (value: number) => `${value.toLocaleString()}개`,
                        },
                      },
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-[250px]">
                  <div className="text-muted-foreground text-sm">데이터가 없습니다.</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 두 번째 행: 지역별 사육두수 + 전체 사육두수 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>지역별 사육두수</CardTitle>
                  <CardDescription>시/도별 유기축산 인증 사육두수 (품목별)</CardDescription>
                </div>
                {!statsLoading && stats && stats.byRegion.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadChart('chart3', '지역별_사육두수')}
                    className="h-8"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    다운로드
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex items-center justify-center h-[350px]">
                  <div className="text-2xl font-bold text-muted-foreground">로딩 중...</div>
                </div>
              ) : stats && stats.byRegion.length > 0 ? (
                <Chart
                  type="bar"
                  height={300}
                  series={[
                    {
                      name: '젖소',
                      data: stats.byRegion.map((item) => item.byProduct?.젖소?.livestockCount || 0),
                    },
                    {
                      name: '한우',
                      data: stats.byRegion.map((item) => item.byProduct?.한우?.livestockCount || 0),
                    },
                  ]}
                  options={{
                    chart: {
                      type: 'bar',
                      toolbar: { show: false },
                      stacked: true,
                      events: {
                        mounted: (chartContext: ApexCharts) => {
                          chartInstances.current.chart3 = chartContext;
                        },
                      },
                    },
                    xaxis: {
                      categories: stats.byRegion.map((item) => item.region),
                      labels: {
                        rotate: -45,
                        rotateAlways: true,
                        style: {
                          fontSize: '12px',
                        },
                      },
                    },
                    yaxis: {
                      title: {
                        text: '사육두수',
                      },
                    },
                    dataLabels: {
                      enabled: true,
                      formatter: (val: number) => (val > 0 ? val.toLocaleString() : ''),
                    },
                    tooltip: {
                      y: {
                        formatter: (value: number) => `${value.toLocaleString()}두`,
                      },
                    },
                    colors: ['#3b82f6', '#10b981'],
                    legend: {
                      position: 'bottom',
                    },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="text-muted-foreground">데이터가 없습니다.</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle>전체 사육두수</CardTitle>
                  <CardDescription>품목별 비율</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!statsLoading && stats?.livestockCountByProduct && (
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {stats.livestockCountByProduct.전체.toLocaleString()}
                        <span className="text-base font-normal text-muted-foreground ml-1">두</span>
                      </div>
                    </div>
                  )}
                  {!statsLoading && stats?.livestockCountByProduct && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadChart('chart4', '전체_사육두수')}
                      className="h-8"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex items-center justify-center h-[350px]">
                  <div className="text-sm text-muted-foreground">로딩 중...</div>
                </div>
              ) : stats?.livestockCountByProduct ? (
                <div className="space-y-3">
                  <Chart
                    type="pie"
                    height={300}
                    series={[
                      stats.livestockCountByProduct.젖소 || 0,
                      stats.livestockCountByProduct.한우 || 0,
                    ]}
                    options={{
                      chart: {
                        type: 'pie',
                        toolbar: { show: false },
                        events: {
                          mounted: (chartContext: ApexCharts) => {
                            chartInstances.current.chart4 = chartContext;
                          },
                        },
                      },
                      labels: ['젖소', '한우'],
                      colors: ['#3b82f6', '#10b981'],
                      legend: {
                        position: 'bottom',
                        fontSize: '12px',
                      },
                      dataLabels: {
                        enabled: true,
                        formatter: (val: number, opts: { w: { globals: { series: number[] } }; seriesIndex: number }) => {
                          const value = opts.w.globals.series[opts.seriesIndex];
                          return `${val.toFixed(1)}% (${value.toLocaleString()}두)`;
                        },
                        style: {
                          fontSize: '16px',
                          fontWeight: 'bold',
                          colors: ['#ffffff'],
                        },
                        offsetY: -30,
                        dropShadow: {
                          enabled: true,
                          blur: 4,
                          opacity: 0.5,
                          color: '#000000',
                        },
                      },
                      tooltip: {
                        y: {
                          formatter: (value: number) => `${value.toLocaleString()}두`,
                        },
                      },
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-[250px]">
                  <div className="text-muted-foreground text-sm">데이터가 없습니다.</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          filterControls={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex w-full items-center gap-2 md:w-auto">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">대표품목</Label>
                <Select
                  value={selectedMainProduct}
                  onValueChange={(value) => {
                    setSelectedMainProduct(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40" size="sm">
                    <SelectValue placeholder="대표품목 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {mainProducts.map((product) => (
                      <SelectItem key={product} value={product || ''}>
                        {product}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full items-center gap-2 md:w-auto">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">지역</Label>
                <Select
                  value={selectedRegion}
                  onValueChange={(value) => {
                    setSelectedRegion(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40" size="sm">
                    <SelectValue placeholder="지역 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {regions.map((region) => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          }
          manualPagination
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          totalPages={data?.totalPages ?? 0}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(columnId, order) => {
            setSortBy(columnId);
            setSortOrder(order);
            setPage(1);
          }}
          onRowClick={handleRowClick}
        />
      </div>

      {/* Form Drawer */}
      <OrganicCertificationFormDrawer
        open={formDrawerOpen}
        onOpenChange={(open) => {
          setFormDrawerOpen(open);
          if (!open) {
            setSelectedCertification(null);
          }
        }}
        certification={selectedCertification}
        mode={formMode}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* Detail Drawer */}
      <OrganicCertificationDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={(open) => {
          setDetailDrawerOpen(open);
          if (!open) {
            setSelectedCertificationId(null);
          }
        }}
        certificationId={selectedCertificationId}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>인증 정보를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제된 정보는 복구할 수 없습니다. 계속 진행하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

