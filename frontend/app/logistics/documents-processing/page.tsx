'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Loader2, FileText } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  TradeOrder,
  useTradeOrders,
  formatOrderSequence,
} from '@/lib/hooks/use-trade-orders';
import { DocumentsProcessingDetailDrawer } from '@/components/logistics/documents-processing-detail-drawer';
import { DocumentsProcessingFormDrawer } from '@/components/trade-order/documents-processing-form-drawer';
import { useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';

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

function DocumentsProcessingPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [selectedTradeOrderId, setSelectedTradeOrderId] = React.useState<string | null>(null);
  const [selectedTradeOrder, setSelectedTradeOrder] = React.useState<TradeOrder | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [selectedProduct, setSelectedProduct] = React.useState<string>('__all__');
  const [certificateRequestFilter, setCertificateRequestFilter] = React.useState<string>('__all__'); // 전체/완료/미완료
  
  const queryClient = useQueryClient();

  // 재무 상태 코드 마스터 조회
  const { data: financeStatusCodes = [] } = useCodeMastersByGroup('FINANCE_STATUS');

  // 코드 이름 가져오기 헬퍼 함수
  const getFinanceStatusName = (value?: string | null) => {
    if (!value) return null;
    const code = financeStatusCodes.find(
      (c) => c.value && c.value.trim().toUpperCase() === value.trim().toUpperCase()
    );
    return code?.name || value;
  };

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 서류 처리 목록만 가져오기 (서버에서 필터링)
  // DOCUMENTS 상태인 주문만 가져오기
  // 제품 필터와 필증신청 필터도 서버에서 처리
  const { data: tradeOrders = [], isLoading } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DOCUMENTS',
    productName: selectedProduct !== '__all__' ? selectedProduct : undefined,
    certificateRequestFilter: certificateRequestFilter !== '__all__' ? certificateRequestFilter : undefined,
  });

  // 백엔드에서 이미 필터링된 결과를 사용
  const filteredOrders = tradeOrders;

  const paginatedOrders = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, page, pageSize]);

  // 서류 처리 목록에서 실제로 사용되는 제품 목록 추출 (필터 전 전체 목록에서 추출)
  // 제품 목록은 별도로 전체 목록을 한 번 가져와서 추출
  const { data: allTradeOrdersForProducts = [] } = useTradeOrders({
    bookingOnly: true,
    tradeStatus: 'DOCUMENTS',
  });

  const availableProducts = React.useMemo(() => {
    const productSet = new Set<string>();
    allTradeOrdersForProducts.forEach((order) => {
      if (order.productName) {
        productSet.add(order.productName);
      }
    });
    return Array.from(productSet).sort();
  }, [allTradeOrdersForProducts]);

  const columns: ColumnDef<TradeOrder>[] = React.useMemo(() => [
    {
      accessorKey: 'contractNo',
      header: '계약번호',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-sm">{row.original.contractNo || '-'}</span>
          {row.original.contractGoogleDriveFileId && (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      ),
      size: 140,
    },
    {
      accessorKey: 'sequence',
      header: '순번',
      cell: ({ row }) => <div className="text-sm font-mono">{formatOrderSequence(row.original.sequence, row.original.sequenceSub)}</div>,
      size: 80,
    },
    {
      accessorKey: 'bk',
      header: 'BK',
      cell: ({ row }) => <div className="text-sm">{row.original.bk || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'bl',
      header: 'BL',
      cell: ({ row }) => <div className="text-sm">{row.original.bl || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'etdDate',
      header: 'ETD',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.etdDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'etaDate',
      header: 'ETA',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.etaDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'exportCountryName',
      header: '수출국',
      cell: ({ row }) => <div className="text-sm">{row.original.exportCountryName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'exporterName',
      header: '수출사',
      cell: ({ row }) => <div className="text-sm">{row.original.exporterName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'shippingLineName',
      header: '선사',
      cell: ({ row }) => <div className="text-sm">{row.original.shippingLineName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'productName',
      header: '제품',
      cell: ({ row }) => <div className="text-sm">{row.original.productName || '-'}</div>,
      size: 150,
    },
    {
      accessorKey: 'grade',
      header: '등급',
      cell: ({ row }) => <div className="text-sm">{row.original.grade || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'containerCount',
      header: '컨테이너 수',
      cell: ({ row }) => {
        const containerCount = row.original.containers?.length ?? 0;
        return <div className="text-sm text-center">{containerCount > 0 ? containerCount : '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'totalBales',
      header: '베일',
      cell: ({ row }) => {
        const containers = row.original.containers || [];
        const totalBales = containers.reduce((sum, container) => {
          return sum + (container.salesBales ?? container.tradeBales ?? 0);
        }, 0);
        return <div className="text-sm text-center">{totalBales > 0 ? totalBales.toLocaleString('ko-KR') : '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'totalWeight',
      header: '중량',
      cell: ({ row }) => {
        const containers = row.original.containers || [];
        const totalWeight = containers.reduce((sum, container) => {
          return sum + (container.weight || 0);
        }, 0);
        return <div className="text-sm text-center">{totalWeight > 0 ? totalWeight.toLocaleString('ko-KR') : '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'certificateNumber',
      header: '필증신청',
      cell: ({ row }) => {
        const certificateNumber = row.original.certificateNumber;
        const hasCertificate = certificateNumber && certificateNumber.trim() !== '';
        
        return (
          <div className="flex items-center justify-center">
            {hasCertificate ? (
              <Badge 
                variant="outline"
                className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300"
              >
                {certificateNumber}
              </Badge>
            ) : (
              <Badge 
                variant="outline"
                className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300"
              >
                미완료
              </Badge>
            )}
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'originalShipment',
      header: '원본발송',
      cell: ({ row }) => {
        const hasOriginalShipment = row.original.hasOriginalShipment === 'Y';
        const originalShipmentDate = row.original.originalShipment;
        
        // 3가지 상태 구분
        // 1. 체크 안함: hasOriginalShipment가 'Y'가 아님
        if (!hasOriginalShipment) {
          return (
            <div className="flex items-center justify-center">
              <Badge 
                variant="outline"
                className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300"
              >
                해당없음
              </Badge>
            </div>
          );
        }
        
        // 2. 체크함 + 날짜 미입력: hasOriginalShipment가 'Y'이고 originalShipment가 없음
        if (hasOriginalShipment && !originalShipmentDate) {
          return (
            <div className="flex items-center justify-center">
              <Badge 
                variant="outline"
                className="border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300"
              >
                발송 예정
              </Badge>
            </div>
          );
        }
        
        // 3. 체크함 + 날짜/텍스트 입력: hasOriginalShipment가 'Y'이고 originalShipment가 있음
        // 원본발송일은 텍스트로 저장되므로 그대로 표시 (날짜 변환하지 않음)
        return (
          <div className="flex items-center justify-center">
            <Badge 
              variant="outline"
              className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300"
            >
              {originalShipmentDate}
            </Badge>
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'financeStatus',
      header: '결제 상태',
      cell: ({ row }) => {
        const financeStatus = row.original.financeStatus;
        
        // financeStatus에 따른 뱃지 표시 (코드 마스터 사용)
        const statusName = getFinanceStatusName(financeStatus);
        
        if (!financeStatus || !statusName) {
          return (
            <div className="flex items-center justify-center">
              <span className="text-sm text-muted-foreground">-</span>
            </div>
          );
        }
        
        // 각 상태별 뱃지 스타일 (원본발송 상태와 동일한 디자인)
        if (financeStatus === 'PAYMENT_PENDING') {
          // 결제 대기: 회색 계열
          return (
            <div className="flex items-center justify-center">
              <Badge 
                variant="outline"
                className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300"
              >
                {statusName}
              </Badge>
            </div>
          );
        } else if (financeStatus === 'PAYMENT_PROCESSING') {
          // 결제 처리 중: 노란색 계열
          return (
            <div className="flex items-center justify-center">
              <Badge 
                variant="outline"
                className="border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300"
              >
                {statusName}
              </Badge>
            </div>
          );
        } else if (financeStatus === 'PAYMENT_COMPLETED') {
          // 결제 완료: 초록색 계열
          return (
            <div className="flex items-center justify-center">
              <Badge 
                variant="outline"
                className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300"
              >
                {statusName}
              </Badge>
            </div>
          );
        }
        
        // 기타 상태: 회색 계열
        return (
          <div className="flex items-center justify-center">
            <Badge 
              variant="outline"
              className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300"
            >
              {statusName}
            </Badge>
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'destinationName',
      header: '도착항',
      cell: ({ row }) => <div className="text-sm">{row.original.destinationName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'managerUser',
      header: '등록자',
      cell: ({ row }) => (
        <div className="text-sm">{row.original.managerUser?.name || '-'}</div>
      ),
      size: 120,
    },
    {
      accessorKey: 'createdAt',
      header: '등록일',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
      size: 120,
    },
  ], [financeStatusCodes]);

  const handleRowClick = (order: TradeOrder) => {
    setSelectedTradeOrderId(order.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (order: TradeOrder) => {
    setSelectedTradeOrder(order);
    setEditDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleCancelEdit = () => {
    setEditDrawerOpen(false);
    // 상세보기 다시 열기
    if (selectedTradeOrder?.id) {
      setSelectedTradeOrderId(selectedTradeOrder.id);
      setDetailDrawerOpen(true);
    }
    setSelectedTradeOrder(null);
  };

  const handleFormSubmit = async () => {
    setEditDrawerOpen(false);
    
    // 수정 완료 후 상세보기 다시 열기
    if (selectedTradeOrder?.id) {
      // 데이터 갱신
      await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-order', selectedTradeOrder.id] });
      
      // 상세보기 다시 열기
      setSelectedTradeOrderId(selectedTradeOrder.id);
      setDetailDrawerOpen(true);
    }
    
    setSelectedTradeOrder(null);
  };


  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">서류 처리</h1>
            <p className="hidden text-muted-foreground md:block">
              서류 처리 정보를 조회하고 관리합니다.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={paginatedOrders}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={filteredOrders.length}
          totalPages={Math.max(1, Math.ceil(filteredOrders.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
          filterControls={
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">제품</Label>
                <Select
                  value={selectedProduct}
                  onValueChange={(value) => {
                    setSelectedProduct(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40" size="sm">
                    <SelectValue placeholder="제품 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {availableProducts.map((product) => (
                      <SelectItem key={product} value={product}>
                        {product}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">필증신청</Label>
                <Select
                  value={certificateRequestFilter}
                  onValueChange={(value) => {
                    setCertificateRequestFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-32" size="sm">
                    <SelectValue placeholder="필증신청 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    <SelectItem value="completed">완료</SelectItem>
                    <SelectItem value="pending">미완료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          }
        />

        <DocumentsProcessingDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open: boolean) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedTradeOrderId(null);
            }
          }}
          tradeOrderId={selectedTradeOrderId}
          onEdit={handleEdit}
          onDelete={() => {}}
        />

        <DocumentsProcessingFormDrawer
          open={editDrawerOpen}
          onOpenChange={(open: boolean) => {
            setEditDrawerOpen(open);
            if (!open) {
              handleCancelEdit();
            }
          }}
          orderId={selectedTradeOrder?.id || null}
          onSubmit={handleFormSubmit}
          onCancel={handleCancelEdit}
        />
      </div>
    </AppLayout>
  );
}

export default function DocumentsProcessingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <DocumentsProcessingPageContent />
    </Suspense>
  );
}


