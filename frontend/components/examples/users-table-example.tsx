'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { useUsers } from '@/lib/hooks/use-users';
import { User } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// 사용자 테이블 컬럼 정의 예제
const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'email',
    header: '이메일',
  },
  {
    accessorKey: 'name',
    header: '이름',
    cell: ({ row }) => {
      return <div>{row.getValue('name') || '-'}</div>;
    },
  },
  {
    accessorKey: 'id',
    header: '상태',
    cell: ({ row }) => {
      return <Badge variant="outline">활성</Badge>;
    },
  },
  {
    id: 'actions',
    header: '작업',
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            수정
          </Button>
          <Button variant="destructive" size="sm">
            삭제
          </Button>
        </div>
      );
    },
  },
];

export function UsersTableExample() {
  const { data: users, isLoading, error } = useUsers();

  if (isLoading) {
    return <div>로딩 중...</div>;
  }

  if (error) {
    return <div>에러가 발생했습니다.</div>;
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">사용자 목록</h1>
      <DataTable
        columns={columns}
        data={users?.data || []}
        searchKey="email"
        searchPlaceholder="이메일로 검색..."
      />
    </div>
  );
}

