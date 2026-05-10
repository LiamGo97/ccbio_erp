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
import { Loader2, Edit, X, Trash2, CheckCircle2, ExternalLink } from 'lucide-react';
import { useTradeContract, TradeContract } from '@/lib/hooks/use-trade-contracts';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQueryClient } from '@tanstack/react-query';
import { ContractConfirmationDrawer } from '../trade-order/contract-confirmation-drawer';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useUpdateTradeContract } from '@/lib/hooks/use-trade-contracts';
import { TradeContractDetailContent } from './trade-contract-detail-content';
import { TradeContractFormDrawer } from './trade-contract-form-drawer';
import { useRouter } from 'next/navigation';


interface TradeContractDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string | null;
  onEdit?: (contract: TradeContract) => void;
  onDelete?: (contract: TradeContract) => void;
}

export function TradeContractDetailDrawer({
  open,
  onOpenChange,
  contractId,
  onEdit,
  onDelete,
}: TradeContractDetailDrawerProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { data, isLoading, refetch } = useTradeContract(contractId ?? undefined);
  const queryClient = useQueryClient();
  
  // contractId 변경 시 로그
  React.useEffect(() => {
    console.log('[계약 상세] contractId 변경:', contractId);
  }, [contractId]);
  
  // 데이터 로드 완료 시 로그
  React.useEffect(() => {
    if (data) {
      console.log('[계약 상세] 데이터 로드 완료:', {
        id: data.id,
        contractId: data.contractId,
        contractNo: data.contractNo,
        status: data.status,
      });
    }
  }, [data]);
  
  // 로딩 상태 변경 시 로그
  React.useEffect(() => {
    console.log('[계약 상세] 로딩 상태:', isLoading);
  }, [isLoading]);
  const updateContractMutation = useUpdateTradeContract();
  const { data: contractStatusCodes = [] } = useCodeMastersByGroup('TRADE_CONTRACT_STATUS');

  const [confirmContractDrawerOpen, setConfirmContractDrawerOpen] = React.useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editDrawerOpen) {
        e.preventDefault();
        setEditDrawerOpen(false);
        return;
      }
      if (confirmContractDrawerOpen) {
        e.preventDefault();
        setConfirmContractDrawerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, editDrawerOpen, confirmContractDrawerOpen, onOpenChange]);

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    console.log('[계약 상세] drawer 상태 변경:', {
      open,
      contractId,
      isLoading,
      hasData: !!data,
    });
    
    if (open && contractId) {
      console.log('[계약 상세] 데이터 갱신 시작 - contractId:', contractId);
      refetch();
    }
  }, [open, contractId, refetch, isLoading, data]);

  const handleContractConfirmationSuccess = async () => {
    await refetch();
    onOpenChange(false);
  };

  const handleContractStatusChange = async (newStatus: string) => {
    if (!data || !data.id) return;

    try {
      await updateContractMutation.mutateAsync({
        id: data.id,
        data: { status: newStatus === 'NULL' ? null : newStatus },
      });
      toastSuccess('계약 상태 변경 완료', '계약 상태가 변경되었습니다.');
      await refetch();
    } catch (error: any) {
      console.error('계약 상태 변경 오류:', error);
      toastApiError(error, '계약 상태 변경 실패');
    }
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

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="h-full"
          style={{ 
            width: isMobile ? '100%' : '85%', 
            maxWidth: '1200px',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DrawerTitle>
                  {data?.status === 'CONTRACT' || data?.status === 'PARTIALLY_COMPLETED' || data?.status === 'COMPLETED'
                    ? '계약 상세정보'
                    : '발주 상세정보'}
                </DrawerTitle>
                <DrawerDescription>
                  {data?.status === 'CONTRACT' || data?.status === 'PARTIALLY_COMPLETED' || data?.status === 'COMPLETED'
                    ? '계약 정보를 확인하고 관리합니다.'
                    : '발주 정보를 확인하고 관리합니다.'}
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

          <div 
            className="flex-1 overflow-y-auto p-4"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            onDoubleClick={handleDoubleClick}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !data ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                데이터를 불러올 수 없습니다.
              </div>
            ) : (
              <TradeContractDetailContent
                data={data}
                showTotalOrderCount={true}
                showContractInfo={true}
                showContractStatusManagement={true}
                onContractStatusChange={handleContractStatusChange}
                contractStatusCodes={contractStatusCodes.map(c => ({ value: c.value ?? null, name: c.name ?? '' }))}
                updateContractMutation={updateContractMutation}
              />
            )}
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-between items-center w-full">
              {/* 물류 관리 페이지로 이동 버튼 - footer 영역 가장 왼쪽 */}
              <div>
                {data?.contractNo && (
                  <Button
                    variant="outline"
                    disabled={!data}
                    onClick={() => {
                      if (data?.contractNo) {
                        router.push(`/logistics/management?contractNo=${encodeURIComponent(data.contractNo)}`);
                        onOpenChange(false);
                      }
                    }}
                  >
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                    물류 관리 보기
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
                {onDelete && (
                  <Button
                    variant="destructive"
                    disabled={!data}
                    onClick={() => {
                      if (data && onDelete) {
                        onDelete(data);
                      }
                    }}
                    className="bg-destructive hover:bg-destructive/90 text-white"
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    삭제
                  </Button>
                )}
                {/* 계약 확정 버튼: 계약 상태가 ORDER이거나 null인 경우 표시 */}
                {(!data?.contractStatus || data?.contractStatus === 'ORDER') && (
                  <Button
                    variant="default"
                    disabled={!data}
                    onClick={() => setConfirmContractDrawerOpen(true)}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    계약 확정
                  </Button>
                )}
                {onEdit && (
                  <Button
                    variant="default"
                    disabled={!data}
                    onClick={() => {
                      if (data) {
                        setEditDrawerOpen(true);
                      }
                    }}
                  >
                    <Edit className="mr-1.5 h-4 w-4" />
                    수정
                  </Button>
                )}
              </div>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* 계약 확정 Drawer - TradeContract에서 계약 확정 */}
      <ContractConfirmationDrawer
        open={confirmContractDrawerOpen}
        onOpenChange={setConfirmContractDrawerOpen}
        tradeContract={data}
        onSuccess={handleContractConfirmationSuccess}
      />

      {/* 수정 Drawer - 중첩으로 열림 */}
      {data && (
        <TradeContractFormDrawer
          open={editDrawerOpen}
          onOpenChange={(open) => {
            setEditDrawerOpen(open);
            if (!open) {
              // 수정 drawer가 닫힐 때 상세 drawer는 유지하고 데이터만 갱신
              refetch();
            }
          }}
          mode="edit"
          contract={data}
          onSubmit={async () => {
            setEditDrawerOpen(false);
            await refetch();
            // 페이지의 데이터도 갱신하기 위해 queryClient 사용
            await queryClient.invalidateQueries({ queryKey: ['trade-contracts'] });
          }}
          onCancel={() => {
            setEditDrawerOpen(false);
          }}
        />
      )}
    </>
  );
}

