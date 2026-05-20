'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { ConsultationsDataTable } from '@/components/consultations/consultations-data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Consultation,
  CreateConsultationPayload,
  useConsultations,
  useCreateConsultation,
  useUpdateConsultation,
  useDeleteConsultation,
} from '@/lib/hooks/use-consultations';
import { ConsultationFormDrawer } from '@/components/consultations/consultation-form-drawer';
import { ConsultationDetailDrawer } from '@/components/consultations/consultation-detail-drawer';
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
import { Plus, Trash2, XCircle } from 'lucide-react';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useUsers } from '@/lib/hooks/use-users';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { format } from 'date-fns';
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

export default function ConsultationsPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedConsultation, setSelectedConsultation] = React.useState<Consultation | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedConsultationId, setSelectedConsultationId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [consultationToDelete, setConsultationToDelete] = React.useState<Consultation | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<'consultationDate' | 'companyName' | 'createdAt'>('consultationDate');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [selectedManager, setSelectedManager] = React.useState<string>('__all__');
  const [selectedSource, setSelectedSource] = React.useState<string>('__all__');
  const [selectedReplyStatus, setSelectedReplyStatus] = React.useState<string>('__all__');
  const [startDate, setStartDate] = React.useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = React.useState<Date | undefined>(undefined);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const { data: salesUsersResponse, isLoading: salesUsersLoading } = useUsers({
    page: 1,
    limit: 100,
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
    roleCode: 'ROLE_SALES',
  });

  const salesUsers = salesUsersResponse?.data ?? [];

  // 검색어가 숫자만 있으면 전화번호로, 그 외는 업체/메모로 검색
  const searchParams = React.useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return { search: undefined, phone: undefined };
    }
    
    // 숫자만 있는지 확인 (하이픈, 공백 제거 후 숫자만 남는지)
    const numbersOnly = trimmed.replace(/[^0-9]/g, '');
    if (numbersOnly.length >= 3 && numbersOnly === trimmed.replace(/[\s-]/g, '')) {
      // 숫자만 있거나 하이픈/공백만 포함된 경우 전화번호로 처리
      return { search: undefined, phone: numbersOnly };
    }
    
    // 그 외는 업체/메모 검색으로 처리
    return { search: trimmed, phone: undefined };
  }, [searchQuery]);

  const params = {
    ...searchParams,
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
    managerId: selectedManager !== '__all__' ? Number(selectedManager) : undefined,
    source: selectedSource !== '__all__' ? selectedSource : undefined,
    replyStatus: selectedReplyStatus !== '__all__' ? selectedReplyStatus : undefined,
    startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
    endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
  };

  const { data, isLoading, refetch } = useConsultations(params);
  const createMutation = useCreateConsultation();
  const updateMutation = useUpdateConsultation();
  const deleteMutation = useDeleteConsultation();

  // 코드 데이터 로드
  const { data: requestWeightCodes } = useCodesByCategory('CONSULTATION_REQUEST_WEIGHT');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: salesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: speciesCodes } = useCodesByCategory('SPECIES');
  const { data: operationCodes } = useCodesByCategory('OPERATION_TYPE');
  const { data: operationSubtypeCodes } = useCodesByCategory('OPERATION_SUBTYPE');
  const { data: feedingCodes } = useCodesByCategory('FEEDING_METHOD');
  const { data: chamchamCodes } = useCodesByCategory('CHAMCHAM_STATUS');
  const { data: consultationTypeCodes } = useCodeMastersByGroup('CONSULTATION_TYPE');
  const { data: consultationSourceCodes } = useCodeMastersByGroup('CONSULTATION_SOURCE');
  const { data: replyStatusCodes } = useCodesByCategory('CONSULTATION_REPLY_STATUS');

  // 코드 맵 생성
  const requestWeightMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (requestWeightCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [requestWeightCodes]);

  const typeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (consultationTypeCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [consultationTypeCodes]);

  const sourceMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (consultationSourceCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [consultationSourceCodes]);

  const speciesMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (speciesCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [speciesCodes]);

  const operationMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (operationCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [operationCodes]);

  const operationSubtypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (operationSubtypeCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [operationSubtypeCodes]);

  const feedingMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (feedingCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [feedingCodes]);

  const chamchamMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (chamchamCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [chamchamCodes]);

  const productMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (productCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [productCodes]);

  const salesGradeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (salesGradeCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [salesGradeCodes]);

  const replyStatusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (replyStatusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [replyStatusCodes]);

  const labelOr = React.useCallback((map: Map<string, string>, value?: string | null) => {
    const key = (value ?? '').trim();
    if (!key) return '';
    return map.get(key) ?? key;
  }, []);

  const consultations = data?.data ?? [];
  const total = data?.total ?? 0;
  const effectivePageSize = data?.pageSize ?? pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  const handleCreate = () => {
    setSelectedConsultation(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleRowClick = (consultation: Consultation) => {
    setSelectedConsultationId(consultation.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleDelete = (consultation: Consultation) => {
    setConsultationToDelete(consultation);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!consultationToDelete) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(consultationToDelete.id);
      toast({
        title: '상담 삭제 완료',
        description: `${consultationToDelete.companyName ?? consultationToDelete.phone ?? ''} 상담을 삭제했습니다.`,
      });
      setDeleteDialogOpen(false);
      setConsultationToDelete(null);
      setDetailDrawerOpen(false);
      setSelectedConsultationId(null);
      await refetch();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        err?.response?.data?.message ?? err?.message ?? '상담 삭제 중 오류가 발생했습니다.';
      toast({
        title: '삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : String(message),
      className: 'border border-red-300 text-red-600',
      });
    }
  };

  const handleFormSubmit = async (payload: CreateConsultationPayload) => {
    try {
      if (drawerMode === 'create') {
        await createMutation.mutateAsync(payload);
        toast({
          title: '상담이 등록되었습니다.',
          description: `${payload.companyName || payload.phone} 상담 기록을 추가했습니다.`,
        });
      } else if (selectedConsultation) {
        await updateMutation.mutateAsync({ id: selectedConsultation.id, data: payload });
        toast({
          title: '상담이 수정되었습니다.',
          description: `${payload.companyName || selectedConsultation.companyName || selectedConsultation.phone} 상담 기록을 업데이트했습니다.`,
        });
      }
      setDrawerOpen(false);
      setSelectedConsultation(null);
      await refetch();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: unknown } }; message?: string };
      const message =
        err?.response?.data?.message ?? err?.message ?? '상담 저장 중 오류가 발생했습니다.';
      toast({
        title: '저장 실패',
        description: Array.isArray(message) ? message.join(', ') : String(message),
      className: 'border border-red-300 text-red-600',
      });
      throw error;
    }
  };

  const sortableColumns = React.useMemo(() => new Set(['consultationDate', 'companyName']), []);

  const columns = React.useMemo<ColumnDef<Consultation>[]>(
    () => [
      {
        accessorKey: 'consultationDate',
        header: '상담일',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm font-medium">{row.original.consultationDate || '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'companyName',
        header: '업체/고객',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-semibold">{row.original.companyName || '-'}</div>
            <div className="text-xs text-muted-foreground">{row.original.phone || '-'}</div>
          </div>
        ),
        size: 200,
      },
      {
        accessorKey: 'productName',
        header: '문의 제품',
        enableSorting: false,
        cell: ({ row }) => {
          const consultation = row.original;
          // products 배열이 있으면 그것을 사용, 없으면 기존 productName 사용
          if (consultation.products && consultation.products.length > 0) {
            const firstProduct = consultation.products[0];
            const productName = labelOr(productMap, firstProduct.productName) || '-';
            const gradeName = firstProduct.grade ? labelOr(salesGradeMap, firstProduct.grade) : '';
            const remainingCount = consultation.products.length - 1;
            
            const displayText = gradeName 
              ? `${productName}(${gradeName})`
              : productName;
            
            return (
              <div className="text-sm">
                <div>
                  {displayText}
                  {remainingCount > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">외 {remainingCount}개</span>
                  )}
                </div>
              </div>
            );
          }
          
          // 기존 호환성: productName 사용
          const productName = labelOr(productMap, consultation.productName) || '-';
          const gradeName = consultation.grade ? labelOr(salesGradeMap, consultation.grade) : '';
          const displayText = gradeName 
            ? `${productName}(${gradeName})`
            : productName;
          
          return (
            <div className="text-sm">
              <div>{displayText}</div>
            </div>
          );
        },
        size: 180,
      },
      {
        accessorKey: 'requestedWeight',
        header: '요청 차량',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{labelOr(requestWeightMap, row.original.requestedWeight) || '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'mainProduct',
        header: '주 사용제품',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{labelOr(productMap, row.original.mainProduct) || '-'}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'arrivalPrice',
        header: '도착가',
        enableSorting: false,
        cell: ({ row }) => {
          const price = row.original.arrivalPrice;
          if (!price) return <div className="text-sm">-</div>;
          const numPrice = Number(price.replace(/,/g, ''));
          return (
            <div className="text-sm">
              {isNaN(numPrice) ? price : numPrice.toLocaleString('ko-KR')}
            </div>
          );
        },
        size: 120,
      },
      {
        accessorKey: 'ceo',
        header: '대표자',
        enableSorting: false,
        cell: ({ row }) => <div className="text-sm">{row.original.ceo || '-'}</div>,
        size: 120,
      },
      {
        accessorKey: 'species',
        header: '축종',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">
            {labelOr(speciesMap, row.original.species) || '-'}
          </div>
        ),
        size: 110,
      },
      {
        accessorKey: 'operation',
        header: '운영방식',
        enableSorting: false,
        cell: ({ row }) => {
          const ops = row.original.operations;
          if (ops && ops.length > 0) {
          const formatted = ops
            .map((op) => {
              const mainLabel =
                labelOr(operationMap, op.operation) || op.operation || '-';
              const subLabel = op.operationSub
                ? labelOr(operationSubtypeMap, op.operationSub) || op.operationSub
                : null;
              return subLabel ? `${mainLabel} - ${subLabel}` : mainLabel;
            })
            .join(', ');
          return <div className="text-sm">{formatted}</div>;
          }
          const fallback = labelOr(operationMap, row.original.operation);
          return <div className="text-sm">{fallback || '-'}</div>;
        },
        size: 160,
      },
      {
        accessorKey: 'feeding',
        header: '급여방식',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{labelOr(feedingMap, row.original.feeding) || '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'chamchamStatus',
        header: '참참회원 여부',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{labelOr(chamchamMap, row.original.chamchamStatus) || '-'}</div>
        ),
        size: 140,
      },
      {
        accessorKey: 'proposedPrice',
        header: '제안가',
        enableSorting: false,
        cell: ({ row }) => <div className="text-sm">{row.original.proposedPrice || '-'}</div>,
        size: 120,
      },
      {
        accessorKey: 'inOut',
        header: 'IN/OUT',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.inOut ? (
            <Badge variant="outline">{row.original.inOut}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          ),
        size: 90,
      },
      {
        accessorKey: 'type',
        header: '상담유형',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{labelOr(typeMap, row.original.type) || '-'}</div>
        ),
        size: 110,
      },
      {
        accessorKey: 'source',
        header: '유입경로',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{labelOr(sourceMap, row.original.source) || '-'}</div>
        ),
        size: 110,
      },
      {
        accessorKey: 'managerName',
        header: '담당자',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.managerName ?? row.original.managerId ?? '-'}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'replyStatus',
        header: '답변 진행상태',
        enableSorting: false,
        cell: ({ row }) => {
          const v = row.original.replyStatus;
          const text = v ? labelOr(replyStatusMap, v) || v : '';
          return <div className="text-sm">{text || '-'}</div>;
        },
        size: 120,
      },
      {
        accessorKey: 'replyAssigneeName',
        header: '답변 담당자',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.replyAssigneeName ?? row.original.replyAssigneeId ?? '-'}
          </div>
        ),
        size: 120,
      },
      {
        accessorKey: 'notes',
        header: '메모',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground line-clamp-2">{row.original.notes || '-'}</div>
        ),
      },
    ],
    [
      requestWeightMap,
      productMap,
      salesGradeMap,
      labelOr,
      speciesMap,
      operationMap,
      operationSubtypeMap,
      feedingMap,
      chamchamMap,
      typeMap,
      sourceMap,
      replyStatusMap,
    ],
  );

  const handleSortChange = React.useCallback(
    (columnId: string, order: 'asc' | 'desc') => {
      if (!sortableColumns.has(columnId)) {
        return;
      }
      setSortBy(columnId as 'consultationDate' | 'companyName');
      setSortOrder(order);
      setPage(1);
    },
    [sortableColumns],
  );

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label
          htmlFor="search"
          className="whitespace-nowrap text-sm font-medium text-muted-foreground"
        >
          검색
        </Label>
        <Input
          id="search"
          value={searchQuery}
          placeholder="업체명, 메모, 전화번호 검색"
          className="w-48 md:w-60"
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          상담자
        </Label>
        <Select
          value={selectedManager}
          onValueChange={(value) => {
            setSelectedManager(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48 md:w-60" size="sm">
            <SelectValue placeholder="상담자 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {salesUsers.map((salesUser) => (
              <SelectItem key={salesUser.id} value={String(salesUser.id)}>
                {salesUser.name || salesUser.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          유입경로
        </Label>
        <Select
          value={selectedSource}
          onValueChange={(value) => {
            setSelectedSource(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48 md:w-60" size="sm">
            <SelectValue placeholder="유입경로" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {(consultationSourceCodes ?? []).map((code) => {
              const value = (code.value ?? code.name ?? '').trim();
              if (!value) return null;
              const label = (code.name ?? code.value ?? value).trim() || value;
              return (
                <SelectItem key={code.id} value={value}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          답변 진행상태
        </Label>
        <Select
          value={selectedReplyStatus}
          onValueChange={(value) => {
            setSelectedReplyStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48 md:w-60" size="sm">
            <SelectValue placeholder="답변 진행상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {(replyStatusCodes ?? []).map((code) => {
              const value = (code.value ?? code.name ?? '').trim();
              if (!value) return null;
              const label = (code.name ?? code.value ?? value).trim() || value;
              return (
                <SelectItem key={code.id} value={value}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          검색 기간
        </Label>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
            setPage(1);
          }}
          className="w-48 md:w-60"
        />
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">상담 관리</h1>
            <p className="text-sm text-muted-foreground">전화 상담 기록을 등록하고 고객과 연동합니다.</p>
          </div>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            상담 등록
          </Button>
        </div>

        <ConsultationsDataTable
          columns={columns}
          data={consultations}
          isLoading={isLoading}
          filterControls={filterControls}
          manualPagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onRowClick={handleRowClick}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
        />
      </div>

      <ConsultationFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        mode={drawerMode}
        consultation={selectedConsultation}
        onSubmit={handleFormSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        currentUserId={user?.id ?? null}
        currentUserName={user?.name ?? null}
        onCancel={
          drawerMode === 'edit' && selectedConsultation
            ? () => {
                setDrawerOpen(false);
                setSelectedConsultationId(selectedConsultation.id);
                setDetailDrawerOpen(true);
              }
            : undefined
        }
      />

      <ConsultationDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={(open) => {
          setDetailDrawerOpen(open);
          if (!open) {
            setSelectedConsultationId(null);
          }
        }}
        consultationId={selectedConsultationId}
        onEdit={(consultation) => {
          handleEdit(consultation);
        }}
        onDelete={(consultation) => {
          handleDelete(consultation);
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>상담을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제된 상담은 복구할 수 없습니다. 계속 진행하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <XCircle className="mr-2 h-4 w-4" />
              취소
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
              <Trash2 className="mr-2 h-4 w-4" />
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

