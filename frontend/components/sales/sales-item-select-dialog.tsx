'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SalesDetail } from '@/lib/hooks/use-sales';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export interface SalesItemForInvoice {
  id: string;
  salesId: string;
  productName: string;
  specification?: string | null;
  weight?: number | null;
  unitPrice?: number | null;
  containerNo?: string | null;
  sales?: {
    id: string;
    customer?: {
      companyName?: string | null;
    } | null;
  };
}

export interface SalesItemSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesList: SalesDetail[];
  onSelect?: (item: SalesItemForInvoice) => void;
}

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export function SalesItemSelectDialog({
  open,
  onOpenChange,
  salesList,
  onSelect,
}: SalesItemSelectDialogProps) {
  const [selectedItem, setSelectedItem] = React.useState<SalesItemForInvoice | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  // 판매 완료된 항목만 필터링 (SALES_ITEM_COMPLETED)
  const availableItems = React.useMemo(() => {
    const items: SalesItemForInvoice[] = [];
    
    salesList.forEach((sales) => {
      if (sales.items) {
        sales.items.forEach((item) => {
          // 판매 완료 상태만 필터링
          if (item.status === 'SALES_ITEM_COMPLETED') {
            items.push({
              id: item.id,
              salesId: sales.id,
              productName: item.container?.product || '-',
              specification: item.container?.specification || null,
              weight: item.cargoWeight ? Number(item.cargoWeight) : null,
              unitPrice: item.salesUnitPrice ? Number(item.salesUnitPrice) : null,
              containerNo: item.container?.containerNo || null,
              sales: {
                id: sales.id,
                customer: sales.customer,
              },
            });
          }
        });
      }
    });

    return items;
  }, [salesList]);

  // 검색 필터링
  const filteredItems = React.useMemo(() => {
    if (!searchQuery) return availableItems;

    const query = searchQuery.toLowerCase();
    return availableItems.filter(
      (item) =>
        item.productName?.toLowerCase().includes(query) ||
        item.specification?.toLowerCase().includes(query) ||
        item.containerNo?.toLowerCase().includes(query) ||
        item.sales?.customer?.companyName?.toLowerCase().includes(query) ||
        item.sales?.id?.toString().includes(query)
    );
  }, [availableItems, searchQuery]);

  // 항목 선택
  const handleSelectItem = (item: SalesItemForInvoice) => {
    setSelectedItem(item);
  };

  // 확인 버튼 클릭
  const handleConfirm = () => {
    if (selectedItem && onSelect) {
      onSelect(selectedItem);
      onOpenChange(false);
      // 초기화
      setSelectedItem(null);
      setSearchQuery('');
    }
  };

  // 다이얼로그 닫기 시 초기화
  React.useEffect(() => {
    if (!open) {
      setSelectedItem(null);
      setSearchQuery('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>판매 항목 선택</DialogTitle>
          <DialogDescription>
            판매 완료된 항목 중에서 거래명세서에 포함할 항목을 선택하세요.
          </DialogDescription>
        </DialogHeader>

        {/* 검색 영역 */}
        <div className="flex items-center gap-2 pb-4 border-b">
          <Label className="whitespace-nowrap">검색</Label>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="상품명, 규격, 컨테이너 번호, 고객명, 판매번호로 검색"
            className="flex-1"
          />
        </div>

        {/* 항목 목록 */}
        <ScrollArea className="flex-1 min-h-0">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {availableItems.length === 0
                ? '선택 가능한 판매 항목이 없습니다.'
                : '검색 결과가 없습니다.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>판매번호</TableHead>
                  <TableHead>고객명</TableHead>
                  <TableHead>상품명</TableHead>
                  <TableHead>규격</TableHead>
                  <TableHead>중량 (KG)</TableHead>
                  <TableHead>단가</TableHead>
                  <TableHead>컨테이너</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow
                    key={item.id}
                    className={selectedItem?.id === item.id ? 'bg-muted' : ''}
                    onClick={() => handleSelectItem(item)}
                    style={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <input
                        type="radio"
                        checked={selectedItem?.id === item.id}
                        onChange={() => handleSelectItem(item)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.sales?.id}</TableCell>
                    <TableCell>{item.sales?.customer?.companyName || '-'}</TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell>{item.specification || '-'}</TableCell>
                    <TableCell>
                      {item.weight != null ? formatNumber(Math.round(item.weight * 1000), 0) + ' KG' : '-'}
                    </TableCell>
                    <TableCell>
                      {item.unitPrice ? formatNumber(item.unitPrice, 0) + '원' : '-'}
                    </TableCell>
                    <TableCell>{item.containerNo || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        {/* 선택된 항목 정보 */}
        {selectedItem && (
          <div className="p-4 bg-muted rounded-lg space-y-2 border-t">
            <div className="text-sm font-medium">선택된 항목 정보</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">판매번호:</span> {selectedItem.sales?.id}
              </div>
              <div>
                <span className="text-muted-foreground">고객명:</span>{' '}
                {selectedItem.sales?.customer?.companyName || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">상품명:</span> {selectedItem.productName}
              </div>
              <div>
                <span className="text-muted-foreground">규격:</span>{' '}
                {selectedItem.specification || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">중량 (KG):</span>{' '}
                {selectedItem.weight != null ? formatNumber(Math.round(selectedItem.weight * 1000), 0) + ' KG' : '-'}
              </div>
              <div>
                <span className="text-muted-foreground">단가:</span>{' '}
                {selectedItem.unitPrice ? formatNumber(selectedItem.unitPrice, 0) + '원' : '-'}
              </div>
            </div>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedItem}>
            선택
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

