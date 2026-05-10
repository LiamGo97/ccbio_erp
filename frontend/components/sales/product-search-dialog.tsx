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
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, X, ChevronRight } from 'lucide-react';
import { useEcountProducts, EcountProduct } from '@/lib/hooks/use-ecount';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface ProductSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (product: EcountProduct) => void;
}

export function ProductSearchDialog({
  open,
  onOpenChange,
  onSelect,
}: ProductSearchDialogProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [includeDiscontinued, setIncludeDiscontinued] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<EcountProduct | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize] = React.useState(20);

  const { data, isLoading, refetch } = useEcountProducts({
    prodCd: searchQuery || undefined,
  });

  const products = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // 검색 실행
  const handleSearch = () => {
    setCurrentPage(1);
    refetch();
  };

  // Enter 키로 검색
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 품목 선택
  const handleSelectProduct = (product: EcountProduct) => {
    setSelectedProduct(product);
  };

  // 확인 버튼 클릭
  const handleConfirm = () => {
    if (selectedProduct && onSelect) {
      onSelect(selectedProduct);
      onOpenChange(false);
      // 초기화
      setSearchQuery('');
      setSelectedProduct(null);
      setCurrentPage(1);
    }
  };

  // 다이얼로그 닫기 시 초기화
  React.useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedProduct(null);
      setCurrentPage(1);
    }
  }, [open]);

  // 품목명[규격] 형식으로 표시
  const formatProductName = (product: EcountProduct) => {
    const name = product.PROD_DES || '';
    const spec = product.SIZE_DES || '';
    if (spec) {
      return `${name} [${spec}]`;
    }
    return name;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>품목검색</DialogTitle>
          <DialogDescription>
            이카운트 ERP에서 품목을 검색하고 선택할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {/* 검색 영역 */}
        <div className="flex items-center gap-2 pb-4 border-b">
          <Label className="whitespace-nowrap">품목검색</Label>
          <Checkbox
            id="includeDiscontinued"
            checked={includeDiscontinued}
            onCheckedChange={(checked) => setIncludeDiscontinued(checked === true)}
          />
          <Label htmlFor="includeDiscontinued" className="text-sm font-normal cursor-pointer">
            사용중단포함
          </Label>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="품목코드 또는 품목명으로 검색"
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-1" />
                검색(F3)
              </>
            )}
          </Button>
        </div>

        {/* 품목 목록 */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">품목 조회 중...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              검색 결과가 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">선택</TableHead>
                  <TableHead className="cursor-pointer">
                    품목코드 <span className="text-xs">▼</span>
                  </TableHead>
                  <TableHead className="cursor-pointer">
                    품목명[규격] <span className="text-xs">▼</span>
                  </TableHead>
                  <TableHead className="cursor-pointer">
                    검색창내용 <span className="text-xs">▼</span>
                  </TableHead>
                  <TableHead className="cursor-pointer">
                    규격그룹선택 <span className="text-xs">▼</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product, index) => (
                  <TableRow
                    key={product.PROD_CD}
                    className={`cursor-pointer ${
                      selectedProduct?.PROD_CD === product.PROD_CD
                        ? 'bg-muted'
                        : ''
                    }`}
                    onClick={() => handleSelectProduct(product)}
                  >
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                            selectedProduct?.PROD_CD === product.PROD_CD
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {index + 1}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {product.PROD_CD}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatProductName(product)}
                      {product.UNIT && ` ${product.UNIT}`}
                    </TableCell>
                    <TableCell className="text-sm">
                      {product.REMARKS_WIN || '-'}
                    </TableCell>
                    <TableCell className="text-sm">-</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              총 {totalCount}개 품목
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                이전
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Input
                value={`${currentPage}/${totalPages}`}
                readOnly
                className="w-16 text-center"
              />
            </div>
          </div>
        )}

        {/* 하단 버튼 */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              신규(F2)
            </Button>
            <Button variant="outline" size="sm">
              My품목
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedProduct}
            >
              선택
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


