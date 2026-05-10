'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumberInput } from '@/components/ui/number-input';
import { Loader2, X, Save } from 'lucide-react';
import { useTradeOrder, type TradeOrder, useUpdateTradeOrder, type TradeContainerDto } from '@/lib/hooks/use-trade-orders';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface InboundSalesGradeEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: string | null;
  onSuccess?: () => void;
}

export function InboundSalesGradeEditDrawer({
  open,
  onOpenChange,
  orderId,
  onSuccess,
}: InboundSalesGradeEditDrawerProps) {
  const isMobile = useIsMobile();
  const { data: order, isLoading, refetch } = useTradeOrder(orderId ?? undefined);
  const { data: salesGradeCodes = [] } = useCodeMastersByGroup('SALES_GRADE');
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const updateMutation = useUpdateTradeOrder();

  // 컨테이너별 영업 등급 상태 관리
  const [salesGrades, setSalesGrades] = React.useState<Record<string, string>>({});
  
  // 컨테이너별 순번 상태 관리
  const [sequences, setSequences] = React.useState<Record<string, number | null>>({});

  // 컨테이너별 영업 베일 상태 관리
  const [salesBalesMap, setSalesBalesMap] = React.useState<Record<string, number | null | undefined>>({});

  // 전체 적용용 베일(영업) 입력값 (blur 시 적용)
  const [applySalesBalesInput, setApplySalesBalesInput] = React.useState<number | undefined>(undefined);
  const applySalesBalesValueRef = React.useRef<number | undefined>(undefined);

  // drawer가 열릴 때마다 데이터 갱신 및 초기값 설정
  React.useEffect(() => {
    if (open && orderId) {
      refetch();
      setApplySalesBalesInput(undefined);
    }
  }, [open, orderId, refetch]);

  // order 데이터가 로드되면 초기값 설정
  React.useEffect(() => {
    if (order?.containers) {
      const initialGrades: Record<string, string> = {};
      const initialSequences: Record<string, number | null> = {};
      const initialSalesBales: Record<string, number | null | undefined> = {};
      
      order.containers.forEach((container, index) => {
        if (container.containerNo) {
          initialGrades[container.containerNo] = container.salesGrade || '';
          // 순번이 있으면 사용, 없으면 인덱스+1로 자동 할당
          const containerSequence = (container as any).sequence;
          initialSequences[container.containerNo] = containerSequence !== null && containerSequence !== undefined 
            ? containerSequence 
            : (index + 1);
          initialSalesBales[container.containerNo] = container.salesBales ?? container.tradeBales ?? undefined;
        }
      });
      
      setSalesGrades(initialGrades);
      setSequences(initialSequences);
      setSalesBalesMap(initialSalesBales);
    }
  }, [order]);

  const handleGradeChange = (containerNo: string, grade: string) => {
    setSalesGrades((prev) => ({
      ...prev,
      [containerNo]: grade,
    }));
  };

  const handleSequenceChange = (containerNo: string, value: string) => {
    const numValue = value === '' ? null : parseInt(value, 10);
    
    // 유효성 검사: 양수만 허용
    if (numValue !== null && (isNaN(numValue) || numValue < 1)) {
      return;
    }
    
    setSequences((prev) => ({
      ...prev,
      [containerNo]: numValue,
    }));
  };

  const handleSalesBalesChange = (containerNo: string, value: number | undefined) => {
    setSalesBalesMap((prev) => ({
      ...prev,
      [containerNo]: value ?? null,
    }));
  };

  // 순번 중복 검증
  const getSequenceError = (containerNo: string, sequence: number | null): string | null => {
    if (sequence === null) return null;
    
    const duplicates = Object.entries(sequences).filter(
      ([no, seq]) => no !== containerNo && seq === sequence
    );
    
    return duplicates.length > 0 ? '순번이 중복됩니다' : null;
  };

  // 순번 기준으로 정렬된 컨테이너 목록
  const sortedContainers = React.useMemo(() => {
    if (!order?.containers) return [];
    
    return [...order.containers].sort((a, b) => {
      const seqA = sequences[a.containerNo || ''] ?? (a as any).sequence ?? 9999;
      const seqB = sequences[b.containerNo || ''] ?? (b as any).sequence ?? 9999;
      
      if (seqA === null && seqB === null) return 0;
      if (seqA === null) return 1;
      if (seqB === null) return -1;
      
      return seqA - seqB;
    });
  }, [order?.containers, sequences]);

  const handleApplyToAll = (grade: string) => {
    if (!order?.containers) return;
    
    const newGrades: Record<string, string> = {};
    order.containers.forEach((container) => {
      if (container.containerNo) {
        newGrades[container.containerNo] = grade === '__none__' ? '' : grade;
      }
    });
    setSalesGrades(newGrades);
  };

  const handleApplySalesBalesToAll = (value: number | undefined) => {
    if (!order?.containers) return;
    
    const newSalesBales: Record<string, number | null> = {};
    order.containers.forEach((container) => {
      if (container.containerNo) {
        newSalesBales[container.containerNo] = value ?? null;
      }
    });
    setSalesBalesMap(newSalesBales);
  };

  // 전체 적용용 현재 값 (모든 컨테이너가 동일한 값인지 확인)
  const getCommonGrade = React.useMemo(() => {
    if (!order?.containers || order.containers.length === 0) return '__none__';
    
    const grades = new Set<string>();
    order.containers.forEach((container) => {
      if (container.containerNo) {
        const grade = salesGrades[container.containerNo] || container.salesGrade || '';
        grades.add(grade || '__none__');
      }
    });
    
    // 모든 컨테이너가 동일한 등급을 가지고 있으면 그 값을 반환
    if (grades.size === 1) {
      return Array.from(grades)[0];
    }
    return '__none__';
  }, [order, salesGrades]);

  // 전체 적용용 베일(영업) - 모든 컨테이너가 동일한 값이면 해당 값, 아니면 undefined
  const getCommonSalesBales = React.useMemo(() => {
    if (!order?.containers || order.containers.length === 0) return undefined;
    
    const values = new Set<number | null>();
    order.containers.forEach((container) => {
      if (container.containerNo) {
        const v = salesBalesMap[container.containerNo];
        values.add(v !== undefined ? v : null);
      }
    });
    
    if (values.size === 1) {
      const val = Array.from(values)[0];
      return val ?? undefined;
    }
    return undefined;
  }, [order, salesBalesMap]);

  const handleSubmit = async () => {
    if (!order?.id || !order.containers) {
      toast({
        title: '오류',
        description: '주문 정보를 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    // 변경사항이 있는지 확인 (영업 등급, 순번, 영업 베일 변경)
    const hasChanges = order.containers.some((container) => {
      if (!container.containerNo) return false;
      
      // 영업 등급 변경 확인
      const currentGrade = container.salesGrade || '';
      const newGrade = salesGrades[container.containerNo] || '';
      const gradeChanged = currentGrade !== newGrade;
      
      // 순번 변경 확인
      const currentSequence = (container as any).sequence ?? null;
      const newSequence = sequences[container.containerNo] ?? null;
      const sequenceChanged = currentSequence !== newSequence;
      
      // 영업 베일 변경 확인
      const currentSalesBales = container.salesBales ?? container.tradeBales ?? undefined;
      const newSalesBales = salesBalesMap[container.containerNo];
      const salesBalesChanged = (currentSalesBales ?? null) !== (newSalesBales ?? null);
      
      return gradeChanged || sequenceChanged || salesBalesChanged;
    });

    if (!hasChanges) {
      toast({
        title: '알림',
        description: '변경된 내용이 없습니다.',
      });
      return;
    }

    try {
      // 기존 컨테이너 정보를 유지하면서 salesGrade와 sequence 업데이트
      const updatedContainers: TradeContainerDto[] = order.containers.map((container) => {
        if (!container.containerNo) {
          return {
            id: container.id ?? undefined,
            containerNo: container.containerNo || null,
            product: container.product || null,
            tradeGrade: container.tradeGrade || null,
            salesGrade: container.salesGrade || null,
            packingType: container.packingType || null,
            currency: container.currency || null,
            unitPrice: container.unitPrice || null,
            weight: container.weight || null,
            tradeBales: container.tradeBales ?? null,
            salesBales: container.salesBales ?? null,
            sequence: (container as any).sequence ?? null,
          };
        }

        const newSalesGrade = salesGrades[container.containerNo] || '';
        const newSequence = sequences[container.containerNo] ?? (container as any).sequence ?? null;
        const newSalesBales = salesBalesMap[container.containerNo];
        
        return {
          id: container.id ?? undefined,
          containerNo: container.containerNo,
          product: container.product || null,
          tradeGrade: container.tradeGrade || null,
          salesGrade: newSalesGrade.trim() || null,
          packingType: container.packingType || null,
          currency: container.currency || null,
          unitPrice: container.unitPrice || null,
          weight: container.weight || null,
          tradeBales: container.tradeBales ?? null,
          salesBales: newSalesBales !== undefined && newSalesBales !== null ? newSalesBales : (container.salesBales ?? null),
          sequence: newSequence,
        };
      });

      await updateMutation.mutateAsync({
        id: order.id,
        data: {
          containers: updatedContainers,
        },
      });

      toast({
        title: '성공',
        description: '영업 등급이 수정되었습니다.',
      });

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('영업 등급 수정 오류:', error);
      toast({
        title: '오류',
        description: error?.response?.data?.message || '영업 등급 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const salesGradeOptions = React.useMemo(() => {
    return salesGradeCodes.map((code) => ({
      value: code.value || code.name,
      label: code.name,
    }));
  }, [salesGradeCodes]);

  const getSalesGradeName = (value?: string | null) => {
    if (!value) return '-';
    const code = salesGradeCodes.find((c) => c.value === value || c.name === value);
    return code?.name || value;
  };

  const getProductName = (value?: string | null) => {
    if (!value) return '-';
    const code = productCodes.find((c) => c.value === value || c.name === value);
    return code?.name || value;
  };

  // 텍스트 선택을 위한 핸들러
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    // 텍스트 선택 중일 때는 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 텍스트 선택이 이미 시작된 경우에만 드래그 방지
    // 더블클릭으로 텍스트 선택을 시작하는 경우는 허용
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  // 더블클릭으로 텍스트 선택을 허용하기 위한 핸들러
  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    // 더블클릭 시 텍스트 선택이 가능하도록 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 더블클릭으로 텍스트 선택을 시작할 수 있도록 드래그 제스처 방지
    e.stopPropagation();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{ 
          width: isMobile ? '100%' : '600px', 
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>영업 등급 수정</DrawerTitle>
              <DrawerDescription>
                컨테이너별 영업 등급을 확인하고 수정할 수 있습니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <ScrollArea 
          className="flex-1"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          onDoubleClick={handleDoubleClick}
        >
          <div className="p-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !order ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                데이터를 불러올 수 없습니다.
              </div>
            ) : !order.containers || order.containers.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                컨테이너 정보가 없습니다.
              </div>
            ) : (
              <>
                {/* 전체 적용 */}
                <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                  <Label className="text-sm font-semibold">전체 적용</Label>
                  <p className="text-xs text-muted-foreground">
                    모든 컨테이너에 동일한 영업 등급·베일(영업)을 한 번에 적용할 수 있습니다.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">등급(영업)</Label>
                      <Select
                        value={getCommonGrade}
                        onValueChange={handleApplyToAll}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="전체 적용할 등급 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">- (개별 설정)</SelectItem>
                          {salesGradeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">베일(영업)</Label>
                      <NumberInput
                        value={applySalesBalesInput !== undefined ? applySalesBalesInput : getCommonSalesBales}
                        onChange={(value) => {
                          setApplySalesBalesInput(value);
                          applySalesBalesValueRef.current = value;
                        }}
                        onBlur={() => {
                          const val = applySalesBalesValueRef.current ?? getCommonSalesBales;
                          if (val !== undefined) {
                            handleApplySalesBalesToAll(val);
                          }
                          setApplySalesBalesInput(undefined);
                          applySalesBalesValueRef.current = undefined;
                        }}
                        placeholder="전체 적용할 베일 입력"
                        decimals={4}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-4">
                  {sortedContainers.map((container, index) => {
                    const containerNo = container.containerNo || `컨테이너 ${index + 1}`;
                    const currentGrade = salesGrades[container.containerNo || ''] || container.salesGrade || '';
                    const currentSequence = sequences[container.containerNo || ''] ?? (container as any).sequence ?? (index + 1);
                    const productName = getProductName(container.product);
                    const tradeGrade = container.tradeGrade || '-';
                    const sequenceError = getSequenceError(container.containerNo || '', currentSequence);

                    return (
                      <div key={container.containerNo || index} className="space-y-3 rounded-lg border border-border p-4">
                        {/* 첫 번째 줄: 컨테이너번호, 상품, 등급(무역), 베일(무역) - 읽기 전용 */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="space-y-1 min-w-0">
                            <Label className="text-xs text-muted-foreground">컨테이너 번호</Label>
                            <p className="text-sm font-medium font-mono truncate">{container.containerNo || '-'}</p>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <Label className="text-xs text-muted-foreground">상품</Label>
                            <p className="text-sm font-medium truncate">{productName}</p>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <Label className="text-xs text-muted-foreground">등급(무역)</Label>
                            <p className="text-sm font-medium">{tradeGrade}</p>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <Label className="text-xs text-muted-foreground">베일(무역)</Label>
                            <p className="text-sm font-medium">
                              {(container.tradeBales) != null
                                ? Number(container.tradeBales).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
                                : '-'}
                            </p>
                          </div>
                        </div>
                        
                        {/* 두 번째 줄: (빈칸) 순번, 등급(영업), 베일(영업) - 4칸 한 줄, 첫 칸 비워서 세로 정렬 */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="min-w-0" aria-hidden />
                          <div className="space-y-1 min-w-0">
                            <Label htmlFor={`sequence-${container.containerNo || index}`} className="text-xs text-muted-foreground">순번</Label>
                            <Input
                              id={`sequence-${container.containerNo || index}`}
                              type="number"
                              min="1"
                              value={currentSequence ?? ''}
                              onChange={(e) => {
                                if (container.containerNo) {
                                  handleSequenceChange(container.containerNo, e.target.value);
                                }
                              }}
                              className={`h-9 w-full ${sequenceError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                              placeholder="순번"
                            />
                            {sequenceError && (
                              <p className="text-xs text-red-500 mt-1">{sequenceError}</p>
                            )}
                          </div>
                          <div className="space-y-1 min-w-0">
                            <Label htmlFor={`sales-grade-${container.containerNo || index}`} className="text-xs text-muted-foreground">등급(영업)</Label>
                            <Select
                              value={currentGrade || '__none__'}
                              onValueChange={(value) => {
                                if (container.containerNo) {
                                  handleGradeChange(container.containerNo, value === '__none__' ? '' : value);
                                }
                              }}
                            >
                              <SelectTrigger id={`sales-grade-${container.containerNo || index}`} className="h-9 w-full">
                                <SelectValue placeholder="등급 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">-</SelectItem>
                                {salesGradeOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <Label htmlFor={`sales-bales-${container.containerNo || index}`} className="text-xs text-muted-foreground">베일(영업)</Label>
                            <NumberInput
                              id={`sales-bales-${container.containerNo || index}`}
                              value={salesBalesMap[container.containerNo || ''] ?? container.salesBales ?? container.tradeBales ?? undefined}
                              onChange={(value) => {
                                if (container.containerNo) {
                                  handleSalesBalesChange(container.containerNo, value);
                                }
                              }}
                              placeholder="0"
                              decimals={4}
                              className="h-9 w-full"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DrawerFooter className="border-t border-border">
          <div className="flex justify-end gap-2">
            <DrawerClose asChild>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || updateMutation.isPending || !order?.containers || order.containers.length === 0}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-4 w-4" />
                  저장
                </>
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

