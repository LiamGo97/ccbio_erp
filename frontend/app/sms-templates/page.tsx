'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { FileText } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useSmsTemplates, SmsTemplate } from '@/lib/hooks/use-sms-templates';
import { useCodes } from '@/lib/hooks/use-codes';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { SmsTemplateFormDrawer } from '@/components/sms/sms-template-form-drawer';
import { SmsTemplateDetailDrawer } from '@/components/sms/sms-template-detail-drawer';
import Cookies from 'js-cookie';
import { useColumnSettings } from '@/hooks/use-column-settings';

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

function SmsTemplatesPageContent() {
  const columnSettings = useColumnSettings('sms-templates');
  const [user, setUser] = React.useState<User | null>(null);
  const [selectedType, setSelectedType] = React.useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<string>('');
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<number | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = React.useState<SmsTemplate | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);

  // 템플릿 타입 코드 조회
  const { data: templateTypes } = useCodes({ group: 'SMS_TEMPLATE_TYPE' });

  // 타입 코드를 라벨로 변환하는 헬퍼 함수
  const getTypeLabel = React.useCallback((typeValue: string | null | undefined): string => {
    if (!typeValue) return '-';
    
    const codes = templateTypes?.data || [];
    
    // 1. value로 먼저 찾기 (정확한 매칭)
    const foundByValue = codes.find(
      (code) => code.value && code.value.trim() === typeValue.trim()
    );
    if (foundByValue?.name) {
      return foundByValue.name;
    }
    
    // 2. name으로 찾기 (하위 호환성)
    const foundByName = codes.find(
      (code) => code.name && code.name.trim() === typeValue.trim()
    );
    if (foundByName?.name) {
      return foundByName.name;
    }
    
    // 3. 둘 다 없으면 원본 값 반환
    return typeValue;
  }, [templateTypes]);

  // 공급자 목록 조회
  const { data: suppliers = [] } = useSuppliers({ status: true });

  // 템플릿 목록 조회
  const supplierIdNum = selectedSupplierId === 'all' || selectedSupplierId === '' 
    ? undefined 
    : selectedSupplierId === 'null' 
      ? null 
      : parseInt(selectedSupplierId, 10);
  
  const { data: templatesData, isLoading } = useSmsTemplates({
    type: selectedType || undefined,
    supplierId: supplierIdNum,
    page,
    limit: pageSize,
  });

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 타입 또는 공급자 변경 시 페이지를 1로 리셋
  React.useEffect(() => {
    setPage(1);
  }, [selectedType, selectedSupplierId]);

  const handleRowClick = (template: SmsTemplate) => {
    setSelectedTemplateId(template.id);
    setDetailDrawerOpen(true);
  };

  const handleEdit = (template: SmsTemplate) => {
    setSelectedTemplateForEdit(template);
    setEditDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleEditSuccess = () => {
    setEditDrawerOpen(false);
    setSelectedTemplateForEdit(null);
  };

  const columns: ColumnDef<SmsTemplate>[] = React.useMemo(
    () => [
      {
        accessorKey: 'name',
        header: '템플릿 이름',
        cell: ({ row }) => {
          return <span className="font-medium">{row.original.name}</span>;
        },
        size: 200,
      },
      {
        accessorKey: 'type',
        header: '타입',
        cell: ({ row }) => {
          const typeLabel = getTypeLabel(row.original.type);
          return <div className="text-sm">{typeLabel}</div>;
        },
        size: 120,
      },
      {
        accessorKey: 'supplier',
        header: '공급사',
        cell: ({ row }) => {
          return <div className="text-sm">{row.original.supplier?.companyName || '-'}</div>;
        },
        size: 150,
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
        size: 120,
      },
      {
        accessorKey: 'createdBy',
        header: '등록자',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.createdBy?.name || '-'}</div>
        ),
        size: 120,
      },
    ],
    [templateTypes, getTypeLabel],
  );

  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">타입</Label>
        <Select
          value={selectedType || 'all'}
          onValueChange={(value) => {
            setSelectedType(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {templateTypes?.data?.map((code) => {
              const codeValue = code.value || code.name;
              return codeValue ? (
                <SelectItem key={code.id} value={codeValue}>
                  {code.name}
                </SelectItem>
              ) : null;
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">공급사</Label>
        <Select
          value={selectedSupplierId || 'all'}
          onValueChange={(value) => {
            setSelectedSupplierId(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="null">기본 템플릿</SelectItem>
            {suppliers.map((supplier) => (
              <SelectItem key={supplier.id} value={String(supplier.id)}>
                {supplier.companyName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SMS 템플릿 관리</h1>
            <p className="hidden text-muted-foreground md:block">
              SMS 발송에 사용할 템플릿을 관리합니다.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={templatesData?.data || []}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={templatesData?.total || 0}
          totalPages={templatesData?.totalPages || 0}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            Cookies.set('data-table-page-size', size.toString());
          }}
          filterControls={filterControls}
          manualPagination={true}
          enableSorting={false}
          rowClassName="h-10"
        />

        {/* 템플릿 상세 Drawer */}
        {selectedTemplateId && (
          <SmsTemplateDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                setSelectedTemplateId(null);
              }
            }}
            templateId={selectedTemplateId}
            onEdit={handleEdit}
          />
        )}

        {/* 템플릿 수정 Drawer */}
        {selectedTemplateForEdit && (
          <SmsTemplateFormDrawer
            open={editDrawerOpen}
            onOpenChange={(open) => {
              setEditDrawerOpen(open);
              if (!open) {
                setSelectedTemplateForEdit(null);
              }
            }}
            mode="edit"
            template={selectedTemplateForEdit}
            onSuccess={handleEditSuccess}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function SmsTemplatesPage() {
  return (
    <Suspense fallback={
      <AppLayout user={null}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    }>
      <SmsTemplatesPageContent />
    </Suspense>
  );
}
