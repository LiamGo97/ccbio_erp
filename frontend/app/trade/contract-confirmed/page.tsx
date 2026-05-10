'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import {
  TradeContract,
  useTradeContracts,
  useDeleteTradeContract,
} from '@/lib/hooks/use-trade-contracts';
import { TradeContractFormDrawer } from '@/components/trade-contract/trade-contract-form-drawer';
import { TradeContractDetailDrawer } from '@/components/trade-contract/trade-contract-detail-drawer';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
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

function ContractConfirmedPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('edit');
  const [selectedTradeContract, setSelectedTradeContract] = React.useState<TradeContract | null>(null);
  const [selectedTradeContractId, setSelectedTradeContractId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [tradeContractToDelete, setTradeContractToDelete] = React.useState<TradeContract | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [selectedProduct, setSelectedProduct] = React.useState<string>('__all__');
  const [selectedContractStatus, setSelectedContractStatus] = React.useState<string>('__all__');

  const deleteMutation = useDeleteTradeContract();
  const { data: contractStatusCodes = [] } = useCodeMastersByGroup('TRADE_CONTRACT_STATUS');
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 필터링된 계약 목록 조회
  const { data: tradeContracts = [], isLoading, refetch } = useTradeContracts({
    contractStatus: selectedContractStatus,
    productName: selectedProduct,
  });

  // 필터 옵션용 제품 목록 조회 (필터 없이 모든 계약에서 추출)
  const { data: allContractsForProducts = [] } = useTradeContracts({});

  // 계약 목록에서 실제로 사용되는 제품 목록 추출 (필터 옵션용)
  const availableProducts = React.useMemo(() => {
    const productSet = new Set<string>();
    allContractsForProducts.forEach((contract) => {
      // ORDER 상태가 아닌 계약만 포함
      if (contract.productName && contract.contractStatus && contract.contractStatus !== 'ORDER') {
        productSet.add(contract.productName);
      }
    });
    return Array.from(productSet).sort();
  }, [allContractsForProducts]);

  // 백엔드에서 이미 필터링된 결과를 사용
  const filteredContracts = tradeContracts;

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString('ko-KR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const columns: ColumnDef<TradeContract>[] = React.useMemo(() => [
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
      accessorKey: 'orderDate',
      header: '발주일',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.orderDate)}</div>,
      size: 100,
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
      header: '상품',
      cell: ({ row }) => {
        const productCode = productCodes.find((code) => code.value === row.original.productName);
        return <div className="text-sm">{productCode ? productCode.name : row.original.productName || '-'}</div>;
      },
      size: 150,
    },
    {
      accessorKey: 'grade',
      header: '등급',
      cell: ({ row }) => <div className="text-sm">{row.original.gradeName || row.original.grade || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'packingType',
      header: '패킹',
      cell: ({ row }) => <div className="text-sm">{row.original.packingName || row.original.packingType || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'unitPrice',
      header: '단가',
      cell: ({ row }) => (
        <div className="text-sm text-right">
          {row.original.unitPrice != null ? formatNumber(row.original.unitPrice) : '-'}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: 'currencyName',
      header: '통화단위',
      cell: ({ row }) => <div className="text-sm">{row.original.currencyName || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'commissionDollar',
      header: '커미션 $',
      cell: ({ row }) => <div className="text-sm">{row.original.commissionDollar || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'quota',
      header: '쿼터',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.quota === 'Y' ? '예' : row.original.quota === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'fumigation',
      header: '훈증',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.fumigation === 'Y' ? '예' : row.original.fumigation === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'customsDuty',
      header: '관세',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.customsDuty === 'Y' ? '예' : row.original.customsDuty === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'destinationName',
      header: '도착항',
      cell: ({ row }) => <div className="text-sm">{row.original.destinationName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'contractStatus',
      header: '계약 상태',
      cell: ({ row }) => {
        const statusCode = contractStatusCodes.find((code) => code.value === row.original.contractStatus);
        return (
          <div className="text-sm">
            {statusCode ? statusCode.name : row.original.contractStatus || '-'}
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'orderCount',
      header: '주문',
      cell: ({ row }) => {
        const orderCount = row.original.orderCount ?? 0;
        const totalCount = row.original.totalOrderCount;
        if (totalCount !== null && totalCount !== undefined) {
          return (
            <div className="text-sm text-center">
              {orderCount} / {totalCount}
            </div>
          );
        }
        return (
          <div className="text-sm text-center">
            {orderCount}
          </div>
        );
      },
      size: 100,
    },
    {
      accessorKey: 'statusOrPlan',
      header: '물류 상태 / 월별 계획',
      cell: ({ row }) => {
        const contract = row.original;
        const totalOrderCount = contract.totalOrderCount;
        const monthlyOrderPlan = contract.monthlyOrderPlan;
        const orderCount = contract.orderCount || 0;

        // 주문이 2개 이상이고 월별 계획이 있으면 월별 계획 표시
        if (
          totalOrderCount !== null &&
          totalOrderCount !== undefined &&
          totalOrderCount >= 2 &&
          monthlyOrderPlan &&
          Object.keys(monthlyOrderPlan).length > 0
        ) {
          // 월별 계획 데이터를 정렬하여 표시
          const sortedEntries = Object.entries(monthlyOrderPlan).sort(([a], [b]) => a.localeCompare(b));
          const monthlyOrderActual = contract.monthlyOrderActual || {};

          // 헤더 텍스트 생성: 첫 번째 컬럼은 년월, 같은 년도가 계속되면 월만, 년도가 바뀌면 다시 년월
          const headerTexts = sortedEntries.map(([yearMonth], index) => {
            const [year, month] = yearMonth.split('-');
            const monthNum = parseInt(month, 10);
            const yearShort = year.slice(-2); // 년도의 마지막 2자리 (예: 2024 -> 24)
            
            if (index === 0) {
              // 첫 번째 컬럼은 항상 년월
              return `${yearShort}년 ${monthNum.toString().padStart(2, '0')}월`;
            }
            
            // 이전 컬럼의 년도 확인
            const [prevYear] = sortedEntries[index - 1][0].split('-');
            
            if (year === prevYear) {
              // 같은 년도면 월만 표시
              return `${monthNum.toString().padStart(2, '0')}월`;
            } else {
              // 년도가 바뀌면 년월 표시
              return `${yearShort}년 ${monthNum.toString().padStart(2, '0')}월`;
            }
          });

          return (
            <div className="py-1">
              <div className="inline-block border border-border rounded overflow-hidden">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      {sortedEntries.map(([yearMonth], index) => (
                        <th key={yearMonth} className="px-2 py-1 text-center border-r border-border last:border-r-0 font-medium text-muted-foreground">
                          {headerTexts[index]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {sortedEntries.map(([yearMonth, plannedCount]) => {
                        const actualCount = monthlyOrderActual[yearMonth] || 0;
                        const isShortage = actualCount < plannedCount;
                        return (
                          <td 
                            key={yearMonth} 
                            className={`px-2 py-1 text-center border-r border-border last:border-r-0 font-medium ${
                              isShortage ? 'text-destructive' : ''
                            }`}
                          >
                            {actualCount}/{plannedCount}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        // 주문이 1건이거나 월별 계획이 없으면 물류 상태 표시
        const summary = contract.orderStatusSummary;
        if (!summary || orderCount === 0) {
          return <div className="text-sm text-muted-foreground">-</div>;
        }

        // 무역 상태 집계 표시 (이미 이름으로 변환되어 있음)
        const statusItems: Array<{ name: string; count: number }> = [];
        Object.entries(summary).forEach(([statusName, count]) => {
          if (count > 0) {
            statusItems.push({ name: statusName, count });
          }
        });

        if (statusItems.length === 0) {
          return <div className="text-sm text-muted-foreground">상태 없음</div>;
        }

        // 상태별 색상 매핑 (부킹 -> 서류처리 -> DO -> 통관 순서)
        const getStatusBadgeStyle = (statusName: string) => {
          const normalizedName = statusName.trim();
          
          if (normalizedName.includes('부킹') || normalizedName === 'BOOKING') {
            return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
          }
          if (normalizedName.includes('서류') || normalizedName.includes('DOCUMENTS')) {
            return 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300';
          }
          if (normalizedName === 'DO' || normalizedName.includes('DO')) {
            return 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300';
          }
          if (normalizedName.includes('통관') || normalizedName === 'CUSTOMS') {
            return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
          }
          if (normalizedName.includes('도착') || normalizedName === 'ARRIVED') {
            return 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300';
          }
          if (normalizedName.includes('검역') || normalizedName === 'QUARANTINE') {
            return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
          }
          if (normalizedName.includes('완료') || normalizedName === 'COMPLETED') {
            return 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300';
          }
          
          // 기본 스타일
          return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
        };

        return (
          <div className="flex flex-wrap gap-1.5">
            {statusItems.map((item, index) => (
              <Badge
                key={index}
                variant="outline"
                className={`text-xs ${getStatusBadgeStyle(item.name)}`}
              >
                {item.name} {item.count > 1 && `(${item.count})`}
              </Badge>
            ))}
          </div>
        );
      },
      size: 300,
    },
    {
      accessorKey: 'createdBy',
      header: '등록자',
      cell: ({ row }) => <div className="text-sm">{row.original.createdBy?.name || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'createdAt',
      header: '등록일',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
      size: 100,
    },
  ], [contractStatusCodes, productCodes]);

  const handleRowClick = (contract: TradeContract) => {
    setSelectedTradeContractId(contract.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (contract: TradeContract) => {
    setSelectedTradeContract(contract);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleCancelEdit = () => {
    setDrawerOpen(false);
    // 상세보기 다시 열기
    if (selectedTradeContract?.id) {
      setSelectedTradeContractId(selectedTradeContract.id);
      setDetailDrawerOpen(true);
    }
    setSelectedTradeContract(null);
  };

  const handleDelete = (contract: TradeContract) => {
    setTradeContractToDelete(contract);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!tradeContractToDelete) return;
    
    try {
      await deleteMutation.mutateAsync(tradeContractToDelete.id);
      toastSuccess('삭제 완료', '계약 항목이 삭제되었습니다.');
      setDeleteDialogOpen(false);
      setTradeContractToDelete(null);
      setDetailDrawerOpen(false);
      await refetch();
    } catch (error: unknown) {
      toastApiError(error as Parameters<typeof toastApiError>[0], '삭제 실패');
    }
  };

  const handleFormSubmit = async () => {
    setDrawerOpen(false);
    
    // 수정 모드인 경우 상세보기 다시 열기
    if (drawerMode === 'edit' && selectedTradeContract?.id) {
      setSelectedTradeContractId(selectedTradeContract.id);
      setDetailDrawerOpen(true);
    }
    
    setSelectedTradeContract(null);
    await refetch();
  };

  const paginatedContracts = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredContracts.slice(start, end);
  }, [filteredContracts, page, pageSize]);

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">계약</h1>
            <p className="hidden text-muted-foreground md:block">
              계약 확정된 발주 정보를 조회하고 관리합니다.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={paginatedContracts}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={filteredContracts.length}
          totalPages={Math.max(1, Math.ceil(filteredContracts.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rowClassName="h-10"
          filterControls={
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
              <Select
                value={selectedProduct}
                onValueChange={(value) => {
                  setSelectedProduct(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40" size="sm">
                  <SelectValue placeholder="상품 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {availableProducts.map((product) => {
                    const productCode = productCodes.find((code) => code.value === product);
                    const productDisplayName = productCode ? productCode.name : product;
                    return (
                      <SelectItem key={product} value={product}>
                        {productDisplayName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">계약 상태</Label>
              <Select
                value={selectedContractStatus}
                onValueChange={(value) => {
                  setSelectedContractStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40" size="sm">
                  <SelectValue placeholder="계약 상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  <SelectItem value="__null__">미지정</SelectItem>
                  {contractStatusCodes.map((code) => (
                    <SelectItem key={code.value} value={code.value || 'NULL'}>
                      {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        <TradeContractFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedTradeContract(null);
            }
          }}
          mode={drawerMode}
          contract={selectedTradeContract}
          onSubmit={handleFormSubmit}
          onCancel={handleCancelEdit}
        />

        <TradeContractDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) {
              setSelectedTradeContractId(null);
            }
          }}
          contractId={selectedTradeContractId}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="계약 삭제"
          description={
            <>
              이 계약 항목을 삭제하시겠습니까?
              <br />
              <span className="font-medium text-destructive">삭제된 데이터는 복구할 수 없습니다.</span>
            </>
          }
          onConfirm={confirmDelete}
          isDeleting={deleteMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}

export default function ContractConfirmedPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ContractConfirmedPageContent />
    </Suspense>
  );
}

