'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { useUsers } from '@/lib/hooks/use-users';
import { User } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

// 사용자 테이블 컬럼 정의
const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'email',
    header: '이메일',
    cell: ({ row }) => {
      return <div className="font-medium">{row.getValue('email')}</div>;
    },
  },
  {
    accessorKey: 'name',
    header: '이름',
    cell: ({ row }) => {
      return <div>{row.getValue('name') || '-'}</div>;
    },
  },
  {
    accessorKey: 'isActive',
    header: '상태',
    cell: ({ row }) => {
      const isActive = (row.original as any).isActive !== false;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? '활성' : '비활성'}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: '가입일',
    cell: ({ row }) => {
      const date = (row.original as any).createdAt;
      if (!date) return '-';
      try {
        return format(new Date(date), 'yyyy-MM-dd HH:mm', { locale: ko });
      } catch {
        return '-';
      }
    },
  },
  {
    id: 'actions',
    header: '작업',
    cell: ({ row }) => {
      const user = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">메뉴 열기</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              수정
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function UsersPage() {
  const { data: users, isLoading, error } = useUsers();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">에러가 발생했습니다.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">사용자 관리</h1>
          <p className="text-muted-foreground mt-1">
            시스템 사용자 목록을 확인하고 관리할 수 있습니다.
          </p>
        </div>
        <Button>사용자 추가</Button>
      </div>

      <DataTable
        columns={columns}
        data={users?.data || []}
        searchKey="email"
        searchPlaceholder="이메일로 검색..."
      />
    </div>
  );
}

