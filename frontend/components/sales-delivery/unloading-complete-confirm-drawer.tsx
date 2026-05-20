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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SalesDelivery } from '@/lib/hooks/use-sales-delivery';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { Loader2, CheckCircle2, X, AlertTriangle, Info, Plus, Trash2, Search, PanelRight, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, getGcsPublicUrl } from '@/lib/utils';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useQuery } from '@tanstack/react-query';

interface ActualApplyItem {
  loadingItemId: string;
  actualBL: string;
  actualContainer: string;
  /** 컨테이너 ID (동일 containerNo·다른 순번 [1]/[2] 구분용) */
  actualContainerId?: string;
  actualType: 'CONTAINER' | 'CARGO';
  actualBales: string;
  actualWeight: string;
  actualNotes: string;
}

/** 하차완료 시 계근증 관련 추가 데이터 */
export interface WeighingCertData {
  infoText?: string;
  imageFiles?: File[];
  /** 기존 이미지 경로 (하차완료정보 수정 시 유지용) */
  existingImagePaths?: string[];
}

interface UnloadingCompleteConfirmDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: SalesDelivery | null;
  onConfirm: (
    actualApplyItems?: ActualApplyItem[],
    removedItemIds?: string[],
    addedRowIds?: string[],
    weighingCertData?: WeighingCertData,
  ) => Promise<void>;
  isSubmitting?: boolean;
}

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

const formatNumber = (value?: number | null, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

const normStr = (s: string | null | undefined) => (s ?? '').trim();

/** GET /containers/:id 의 container 객체를 목록 API 행과 호환되는 형태로 변환 (제외·완판 컨이 목록에 없을 때 병합용) */
function mapContainerDetailToListShape(c: Record<string, unknown>) {
  const weight = c.weight != null ? Number(c.weight) : 0;
  const salesBales =
    c.salesBales != null && c.salesBales !== '' ? Number(c.salesBales) : null;
  const tradeBales =
    c.tradeBales != null && c.tradeBales !== '' ? Number(c.tradeBales) : null;
  const bales = c.bales != null ? Number(c.bales) : salesBales ?? tradeBales ?? 0;
  return {
    id: String(c.id ?? ''),
    containerNo: (c.containerNo as string) ?? '',
    bl: normStr(c.bl as string | null | undefined),
    orderId: c.orderId ?? null,
    sequence: c.sequence ?? 0,
    product: c.product ?? null,
    productName: (c.productName as string) ?? null,
    salesBales,
    tradeBales,
    bales,
    weight,
    availableBales: 0,
    availableWeight: 0,
    inventoryStatus: c.inventoryStatus ?? null,
    excludeFromInventory: c.excludeFromInventory === true,
  };
}

interface SalesHistoryItem {
  id: string;
  salesId: string | null;
  salesNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  status: string | null;
  statusName: string | null;
  containerType: string | null;
  cargoBales: number;
  cargoWeight: number;
  salesUnitPriceStage: string | null;
  salesUnitPrice: number | null;
  margin: number | null;
  reservationDate: string | null;
  salesDate: string | null;
  registeredByName: string | null;
}

/** 인라인 판매 이력 (테이블 안에 테이블로 표시) */
function ContainerSalesHistoryInline({
  containerId,
  getStatusBadgeStyle,
}: {
  containerId: string;
  getStatusBadgeStyle: (status?: string | null) => string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['container-sales-history', containerId],
    queryFn: async () => {
      const res = await api.get(`/trade/contracts/containers/${containerId}`);
      return res.data as { container: unknown; salesHistory: SalesHistoryItem[] };
    },
    enabled: !!containerId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const salesHistory = data?.salesHistory ?? [];
  if (salesHistory.length === 0) {
    return <p className="text-sm text-muted-foreground py-3">판매 이력이 없습니다.</p>;
  }

  return (
    <>
    <div className="rounded-md border border-border overflow-x-auto overflow-y-visible bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[60px]">번호</TableHead>
              <TableHead className="w-[140px]">고객명</TableHead>
              <TableHead className="w-[90px]">상태</TableHead>
              <TableHead className="w-[80px]">타입</TableHead>
              <TableHead className="w-[80px] text-right">베일</TableHead>
              <TableHead className="w-[100px] text-right">중량</TableHead>
              <TableHead className="w-[80px]">구분</TableHead>
              <TableHead className="w-[100px] text-right">판매단가</TableHead>
              <TableHead className="w-[90px] text-right">마진</TableHead>
              <TableHead className="w-[90px]">예약일</TableHead>
              <TableHead className="w-[90px]">판매일</TableHead>
              <TableHead className="w-[90px]">등록자</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salesHistory.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>{item.customerName || '-'}</TableCell>
                <TableCell>
                  {item.status ? (
                    <Badge variant="outline" className={cn('text-xs', getStatusBadgeStyle(item.status))}>
                      {item.statusName || item.status}
                    </Badge>
                  ) : '-'}
                </TableCell>
                <TableCell>
                  {item.containerType === 'CONTAINER' ? '컨테이너' : item.containerType === 'CARGO' ? '카고' : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {item.cargoBales !== 0
                    ? (item.cargoBales < 0 ? '-' : '') + formatNumber(Math.abs(item.cargoBales), 4)
                    : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {item.cargoWeight !== 0
                    ? (item.cargoWeight < 0 ? '-' : '') + formatNumber(Math.abs(item.cargoWeight) * 1000, 0) + ' kg'
                    : '-'}
                </TableCell>
                <TableCell>
                  {item.salesUnitPriceStage ? (
                    <Badge
                      variant="outline"
                      className={
                        item.salesUnitPriceStage === 'LOADING'
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                          : item.salesUnitPriceStage === 'ARRIVAL'
                            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            : item.salesUnitPriceStage === 'UNLOADING'
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : ''
                      }
                    >
                      {item.salesUnitPriceStage === 'LOADING'
                        ? '상차'
                        : item.salesUnitPriceStage === 'ARRIVAL'
                          ? '도착'
                          : item.salesUnitPriceStage === 'UNLOADING'
                            ? '도착하역'
                            : item.salesUnitPriceStage}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {item.salesUnitPrice != null ? formatNumber(item.salesUnitPrice, 2) : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {item.margin != null ? formatNumber(item.margin, 2) : '-'}
                </TableCell>
                <TableCell>{formatDate(item.reservationDate)}</TableCell>
                <TableCell>{formatDate(item.salesDate)}</TableCell>
                <TableCell>{item.registeredByName || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-2 text-sm text-muted-foreground px-1">
        합계: 베일 {formatNumber(salesHistory.reduce((s, h) => s + (h.cargoBales ?? 0), 0), 4)} / 중량{' '}
        {formatNumber(salesHistory.reduce((s, h) => s + ((h.cargoWeight ?? 0) * 1000), 0), 0)} kg
      </div>
    </>
  );
}

export const UnloadingCompleteConfirmDrawer: React.FC<UnloadingCompleteConfirmDrawerProps> = ({
  open,
  onOpenChange,
  delivery,
  onConfirm,
  isSubmitting = false,
}) => {
  const isMobile = useIsMobile();
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');

  const productMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (productCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [productCodes]);

  const getProductName = React.useCallback((productCode?: string | null) => {
    if (!productCode) return '-';
    return productMap.get(productCode.trim()) || productCode;
  }, [productMap]);

  const warehouseMap = React.useMemo(() => {
    const map = new Map<number | string, string>();
    warehouses.forEach((wh) => {
      if (wh.id) map.set(wh.id, wh.name || '');
    });
    // 문자열 warehouse 이름도 매핑
    warehouses.forEach((wh) => {
      if (wh.name) map.set(wh.name.trim(), wh.name);
    });
    return map;
  }, [warehouses]);

  const getWarehouseName = (warehouseId: number | string | null | undefined): string => {
    if (!warehouseId) return '-';
    const name = warehouseMap.get(warehouseId);
    if (name) return name;
    // 문자열인 경우 그대로 반환
    if (typeof warehouseId === 'string') {
      return warehouseId.trim();
    }
    return '-';
  };

  // 컨테이너 목록 상태
  const [containers, setContainers] = React.useState<any[]>([]);
  const [containersLoading, setContainersLoading] = React.useState(false);

  // 컨테이너 목록 조회
  React.useEffect(() => {
    if (!open) return;

    const fetchContainers = async () => {
      try {
        setContainersLoading(true);
        // 요청/작업/실제 컨테이너 모두 수집 → 상차완료 복구 후 재고 0(SELLING)인 컨테이너도 목록에 포함되도록
        const requestContainers = Array.from(
          new Set(
            (delivery?.loadingItems || []).flatMap((item) => {
              const req = item.requestContainer ?? item.salesItem?.container?.containerNo ?? '';
              const work = item.workContainer ?? '';
              const actual = item.actualContainer ?? '';
              return [req, work, actual].filter((cn): cn is string => !!cn?.trim());
            })
          )
        );

        // bls 미지정 → 입고 확정된 모든 BL의 컨테이너 조회 (팝업에서 모든 컨테이너 선택 가능)
        // includeExcluded: 재고관리에서 '목록 제외' 처리된 컨도 실제 BL/컨 선택에 필요 (판매완료·정정 시 누락 방지)
        const params: any = {
          inboundStatus: 'CONFIRMED', // 확정 재고만
          excludeSoldOut: false,
          availableOnly: false, // 모든 컨테이너 (재고 유무 관계없이)
          includeExcluded: true,
          requestedContainers: requestContainers.length > 0 ? requestContainers.join(',') : undefined, // 요청된 컨테이너 (재고 없어도 포함)
        };
        const response = await api.get('/trade/contracts/containers', { params });
        const containerList: any[] = Array.isArray(response.data) ? response.data : [];

        // 목록 API에 안 나오는 행(제외·집계 경계 등): 배송 상차 행에 연결된 컨테이너는 상세 API로 보강
        const idsFromDelivery = new Set<string>();
        (delivery?.loadingItems ?? []).forEach((li) => {
          const cid = li.salesItem?.container?.id;
          if (cid != null && String(cid).trim()) idsFromDelivery.add(String(cid).trim());
        });
        const existingIds = new Set(containerList.map((c) => String(c.id ?? '').trim()));
        const missingIds = [...idsFromDelivery].filter((id) => id && !existingIds.has(id));
        const merged: any[] = [...containerList];
        await Promise.all(
          missingIds.map(async (id) => {
            try {
              const res = await api.get(`/trade/contracts/containers/${id}`);
              const raw = res.data?.container as Record<string, unknown> | undefined;
              if (raw && typeof raw === 'object') {
                merged.push(mapContainerDetailToListShape(raw));
              }
            } catch {
              // 단건 실패는 무시 (목록만으로 진행)
            }
          }),
        );
        const byId = new Map<string, any>();
        for (const row of merged) {
          const id = String(row?.id ?? '').trim();
          if (!id) continue;
          if (!byId.has(id)) byId.set(id, row);
        }
        setContainers([...byId.values()]);
      } catch (error) {
        console.error('컨테이너 목록 조회 실패:', error);
        setContainers([]);
      } finally {
        setContainersLoading(false);
      }
    };

    void fetchContainers();
  }, [open, delivery?.id, delivery?.loadingItems]);

  // 실제 적용할 정보 상태 관리
  const [actualApplyItems, setActualApplyItems] = React.useState<Record<string, ActualApplyItem>>({});
  // 행 삭제한 loadingItem id (확정 시 목록에서 제외)
  const [removedIds, setRemovedIds] = React.useState<Set<string>>(new Set());
  // 새로 추가한 행 (temp id 목록, 확정 시 백엔드에 새 행으로 전달)
  const [addedRowIds, setAddedRowIds] = React.useState<string[]>([]);

  /** 배송이 바뀌거나 Drawer를 다시 열 때만 추가 행 초기화 (컨테이너 목록 로드마다 초기화하면 '컨테이너 추가'가 즉시 사라짐) */
  const addedRowsResetKeyRef = React.useRef<string>('');
  React.useEffect(() => {
    if (!open || !delivery?.id) {
      if (!open) addedRowsResetKeyRef.current = '';
      return;
    }
    const key = String(delivery.id);
    if (addedRowsResetKeyRef.current !== key) {
      addedRowsResetKeyRef.current = key;
      setAddedRowIds([]);
    }
  }, [open, delivery?.id]);

  // 재고 컨테이너가 있는 모든 BL 반환 + 해당 상차 행의 요청/작업 BL은 목록에 없어도 옵션에 포함
  const getAvailableBLsForItem = React.useCallback((item: any) => {
    const fromApi = Array.from(
      new Set(containers.map((c) => normStr(c.bl)).filter((bl): bl is string => !!bl)),
    ).sort();
    const requestBL = normStr(item?.requestBL ?? item?.salesItem?.container?.order?.bl ?? '');
    const workBL = normStr(item?.workBL ?? '');
    const merged = new Set(fromApi);
    if (requestBL) merged.add(requestBL);
    if (workBL) merged.add(workBL);
    const sorted = [...merged].sort();
    if (requestBL && sorted.includes(requestBL)) {
      return [requestBL, ...sorted.filter((b) => b !== requestBL)];
    }
    return sorted;
  }, [containers]);

  // BL별 제품명 목록 (실제 BL Select 옵션에 표시용)
  const getProductLabelsForBL = React.useCallback((bl: string): string => {
    const blNorm = normStr(bl);
    const conts = containers.filter((c) => normStr(c.bl) === blNorm);
    const labels = [
      ...new Set(
        conts
          .map((c) => (c as { productName?: string; product?: string }).productName ?? getProductName((c as { product?: string }).product) ?? '')
          .filter((l): l is string => l !== '' && l !== '-')
      ),
    ];
    return labels.length > 0 ? labels.join(', ') : '';
  }, [containers, getProductName]);

  // BL에 따른 컨테이너 목록 조회 함수 (백엔드에서 이미 필터링된 데이터 사용 + 다른 상차지에서 선택된 컨테이너 제외)
  const getContainersByBL = React.useCallback((bl: string, itemId: string) => {
    const norm = normStr;
    const idStr = (x: unknown) => String(x ?? '').trim();
    const blNorm = norm(bl);
    const filteredByBL = containers.filter((c) => norm(c.bl) === blNorm);
    const currentRow = actualApplyItems[itemId];
    const currentRowActual = norm(currentRow?.actualContainer);
    const currentRowActualId = norm(currentRow?.actualContainerId);

    // 다른 행(상차 행 + 추가 행 new-*)에서 이미 선택된 컨테이너 제외
    const selectedIdsByOthers = new Set<string>();
    const selectedNosByOthers = new Set<string>();
    Object.entries(actualApplyItems).forEach(([rowId, entry]) => {
      if (idStr(rowId) === idStr(itemId)) return;
      if (!entry) return;
      if (entry.actualContainerId) selectedIdsByOthers.add(idStr(entry.actualContainerId));
      if (entry.actualContainer) selectedNosByOthers.add(norm(entry.actualContainer));
    });

    // 다른 행에서 선택된 컨테이너는 제외. 현재 행의 선택값은 항상 목록에 포함
    return filteredByBL.filter((c) => {
      const cId = idStr(c.id);
      const no = norm(c.containerNo);
      const isCurrentSelection =
        (currentRowActualId && cId === currentRowActualId) || (currentRowActual && no === currentRowActual);
      const takenByOther = selectedIdsByOthers.has(cId) || selectedNosByOthers.has(no);
      return isCurrentSelection || !takenByOther;
    });
  }, [containers, actualApplyItems]);

  // 초기값 설정 및 차이 감지
  React.useEffect(() => {
    if (!delivery?.loadingItems) return;

    const items: Record<string, ActualApplyItem> = {};
    let hasDifference = false;

    delivery.loadingItems.forEach((item) => {
      const salesItem = item.salesItem;
      const container = salesItem?.container;
      const order = container?.order;
      
      // 요청 정보: request 필드가 있으면 우선 사용, 없으면 fallback
      const requestBL = item.requestBL ?? order?.bl ?? '';
      const requestContainer = item.requestContainer ?? container?.containerNo ?? '';
      const requestBalesRaw = item.requestBales ?? salesItem?.cargoBales ?? (container?.salesBales ?? container?.tradeBales ?? null);
      const requestBales = requestBalesRaw ? String(requestBalesRaw) : '';
      const requestWeightRaw = item.requestWeight ?? salesItem?.cargoWeight ?? container?.weight ?? null;
      const requestWeight = requestWeightRaw ? String(requestWeightRaw) : '';
      const requestContainerType = item.requestContainerType ?? salesItem?.containerType ?? 'CONTAINER';
      
      // 작업 정보
      const workBL = item.workBL || '';
      const workContainer = item.workContainer || '';
      let workBales = item.workBales != null ? String(item.workBales) : '';
      let workWeight = item.workWeight != null ? String(item.workWeight) : '';
      const workContainerType = item.workContainerType || requestContainerType;
      const workNotes = ''; // 작업 정보 비고는 work_line에서 표시

      // 카고 타입이고, 베일/중량 일치 처리 (상차업체 수기 입력으로 인한 수치 불일치 보정)
      if (workContainerType === 'CARGO' && containers.length > 0) {
        const selectedContainer = workContainer 
          ? containers.find((c) => c.containerNo === workContainer)
          : null;
        
        if (selectedContainer) {
          const totalBales = (selectedContainer.salesBales ?? selectedContainer.tradeBales) != null ? Number(selectedContainer.salesBales ?? selectedContainer.tradeBales) : 0;
          const totalWeight = selectedContainer.weight != null ? Number(selectedContainer.weight) : 0;
          const weightPerBale = totalBales > 0 ? totalWeight / totalBales : 0;
          
          const workBalesNum = workBales ? parseFloat(workBales) : 0;
          const workWeightNum = workWeight ? parseFloat(workWeight) : 0;
          
          if (weightPerBale > 0) {
            // 베일만 있고 중량이 없으면 중량 계산
            if (workBalesNum > 0 && workWeightNum === 0) {
              const calculatedWeight = workBalesNum * weightPerBale;
              workWeight = String(Number(calculatedWeight.toFixed(3)));
            }
            // 중량만 있고 베일이 없으면 베일 계산 (소수 베일 허용, DB scale 4와 맞춤)
            else if (workWeightNum > 0 && workBalesNum === 0) {
              const calculatedBales = workWeightNum / weightPerBale;
              workBales = String(Number(calculatedBales.toFixed(4)));
              const recalculatedWeight = calculatedBales * weightPerBale;
              workWeight = String(Number(recalculatedWeight.toFixed(3)));
            }
            // 베일과 중량 둘 다 있는 경우: 베일 수를 기준으로 중량 재계산 (수기 입력으로 인한 불일치 보정)
            else if (workBalesNum > 0 && workWeightNum > 0) {
              // 베일 수를 기준으로 중량 재계산
              const recalculatedWeight = workBalesNum * weightPerBale;
              workWeight = String(Number(recalculatedWeight.toFixed(3)));
            }
          }
        }
      }

      // 차이 확인
      const isDifferent = 
        requestBL !== workBL ||
        requestContainer !== workContainer ||
        requestContainerType !== workContainerType ||
        requestBales !== workBales ||
        requestWeight !== workWeight;

      if (isDifferent) {
        hasDifference = true;
      }

      // 기본값 설정: 하차완료 상태면 실제 정보, 아니면 작업 정보 (실제 컨테이너 ID는 salesItem.container.id로 보존)
      // 요청/실제는 컨테이너번호만 저장. 작업(work)은 자유텍스트 가능하므로 workContainer에 "21랩+스몰1랩" 등이 있으면 사용하지 않음
      const isUnloadingCompleted = delivery.status === 'UNLOADING_COMPLETED';
      const cleanContainerNo =
        (container?.containerNo ?? (requestContainer && containers.some((c) => c.containerNo === requestContainer) ? requestContainer : '')) || '';
      const workMatchesContainer = workContainer && containers.some((c) => c.containerNo === workContainer);
      const actualMatchesContainer = item.actualContainer && containers.some((c) => c.containerNo === item.actualContainer);
      let initialActualContainer: string;
      if (isUnloadingCompleted && item.actualContainer && actualMatchesContainer) {
        initialActualContainer = item.actualContainer;
      } else if (isUnloadingCompleted && item.actualContainer && !actualMatchesContainer && cleanContainerNo) {
        initialActualContainer = cleanContainerNo; // DB에 저장된 actual이 작업텍스트로 오염된 경우 → 컨테이너번호로 보정
      } else if (workMatchesContainer) {
        initialActualContainer = workContainer;
      } else {
        initialActualContainer = cleanContainerNo || workContainer; // 작업에 자유텍스트 있으면 컨테이너번호 우선
      }
      const initialActualContainerId = item.salesItem?.container?.id != null ? String(item.salesItem.container.id) : undefined;
      items[item.id] = {
        loadingItemId: item.id,
        actualBL: isUnloadingCompleted && item.actualBL ? item.actualBL : workBL,
        actualContainer: initialActualContainer,
        ...(initialActualContainerId ? { actualContainerId: initialActualContainerId } : {}),
        actualType: (isUnloadingCompleted && item.actualContainerType ? item.actualContainerType : workContainerType) as 'CONTAINER' | 'CARGO',
        actualBales: isUnloadingCompleted && item.actualBales != null ? String(item.actualBales) : workBales,
        actualWeight: isUnloadingCompleted && item.actualWeight != null ? String(item.actualWeight) : workWeight,
        actualNotes: '',
      };
    });

    setConfirmError(null);
    // 이미 하차완료된 배송에서만: 실제 확정이 모두 비어 있는 항목은 이전에 "행 삭제"된 것으로 간주 → 하차 제외 상태로 표시
    // 상차완료 등 다른 상태에서는 제외 없음(기본은 모두 입력 가능)
    const excludedIds =
      delivery.status === 'UNLOADING_COMPLETED'
        ? new Set(
            delivery.loadingItems
              .filter(
                (li) =>
                  !li.actualBL &&
                  !li.actualContainer &&
                  li.actualBales == null &&
                  li.actualWeight == null,
              )
              .map((li) => String(li.id)),
          )
        : new Set<string>();
    setRemovedIds(excludedIds);
    setActualApplyItems((prev) => {
      const next = { ...items };
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith('new-')) {
          next[k] = v;
        }
      }
      return next;
    });
  }, [delivery, containers]);

  const handleActualApplyChange = (
    itemId: string,
    field: keyof ActualApplyItem,
    value: string
  ) => {
    setActualApplyItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  // 계근증 관련 정보 (하차완료 시 저장용)
  const [weighingCertInfoText, setWeighingCertInfoText] = React.useState('');
  const [weighingCertImageFiles, setWeighingCertImageFiles] = React.useState<File[]>([]);
  const weighingCertFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleConfirm = async () => {
    setConfirmError(null);
    const itemsArray = Object.values(actualApplyItems).filter(
      (a) => !removedIds.has(String(a.loadingItemId))
    );
    // 모든 상차 행에 실제 BL·컨테이너 필수 (실수로 하차완료 시 잘못된 값 저장 방지)
    const missingActual = itemsArray.find(
      (a) =>
        !a.actualBL?.trim() ||
        (!a.actualContainer?.trim() && !a.actualContainerId?.trim())
    );
    if (missingActual) {
      setConfirmError('모든 상차 행에 실제 BL과 컨테이너를 확인하고 선택해 주세요.');
      return;
    }
    // 추가한 행이 비어있으면 저장 불가 (BL·컨테이너 미입력 시 빈 loadingItem 생성 방지)
    const emptyAddedRow = (addedRowIds ?? []).find((newId) => {
      const actualItem = actualApplyItems[newId];
      if (!actualItem) return true;
      const hasBL = !!actualItem.actualBL?.trim();
      const hasContainer = !!actualItem.actualContainer?.trim() || !!actualItem.actualContainerId?.trim();
      return !hasBL && !hasContainer;
    });
    if (emptyAddedRow) {
      setConfirmError('추가한 행에 실제 BL과 컨테이너를 입력하거나, 해당 행을 삭제해 주세요.');
      return;
    }
    let existingPaths: string[] = [];
    try {
      if (delivery?.weighingCertImagePaths) {
        const parsed = JSON.parse(delivery.weighingCertImagePaths) as string[];
        if (Array.isArray(parsed)) existingPaths = parsed;
      }
    } catch {
      // ignore
    }
    await onConfirm(itemsArray, Array.from(removedIds), addedRowIds, {
      infoText: weighingCertInfoText.trim() || undefined,
      imageFiles: weighingCertImageFiles.length > 0 ? weighingCertImageFiles : undefined,
      existingImagePaths: existingPaths.length > 0 ? existingPaths : undefined,
    });
  };

  const handleRemoveRow = (itemId: string) => {
    if (itemId == null || itemId === '') return;
    if (addedRowIds.includes(itemId)) {
      setAddedRowIds((prev) => prev.filter((id) => id !== itemId));
      setActualApplyItems((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } else {
      // 기존 행: 목록에서 숨기지 않고 실제 확정만 "하차 제외" 처리 (요청·작업 정보는 계속 표시)
      setRemovedIds((prev) => new Set(prev).add(String(itemId)));
    }
  };

  const handleRestoreRow = (itemId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(String(itemId));
      return next;
    });
  };

  /** 하차 제외가 아닌 첫 행; 모두 제외면 첫 상차 행으로 BL/타입 기본값만 참고 */
  const templateLoadingItem =
    delivery?.loadingItems?.find((item) => !removedIds.has(String(item.id))) ?? delivery?.loadingItems?.[0];
  const handleAddRow = () => {
    const newId = `new-${Date.now()}`;
    setAddedRowIds((prev) => [...prev, newId]);
    const defaultBL = templateLoadingItem?.workBL || templateLoadingItem?.requestBL || '';
    const defaultType = (templateLoadingItem?.workContainerType ||
      templateLoadingItem?.requestContainerType ||
      'CONTAINER') as 'CONTAINER' | 'CARGO';
    setActualApplyItems((prev) => ({
      ...prev,
      [newId]: {
        loadingItemId: newId,
        actualBL: defaultBL,
        actualContainer: '',
        actualType: defaultType,
        actualBales: '',
        actualWeight: '',
        actualNotes: '',
      },
    }));
  };

  // 컨테이너 팝업 선택 (어떤 item의 컨테이너를 선택 중인지)
  const [containerSelectPopupItemId, setContainerSelectPopupItemId] = React.useState<string | null>(null);
  // 컨테이너 패널 선택 (Drawer 내부 패널로 선택 - 비교용)
  const [containerSelectPanelItemId, setContainerSelectPanelItemId] = React.useState<string | null>(null);

  // 팝업 내 판매 이력 펼침 (테이블 안에 테이블)
  const [popupExpandedContainerId, setPopupExpandedContainerId] = React.useState<string | null>(null);
  // 패널 내 판매 이력 펼침
  const [panelExpandedContainerId, setPanelExpandedContainerId] = React.useState<string | null>(null);

  // Drawer 닫을 때 패널/팝업 및 계근증 입력 초기화
  React.useEffect(() => {
    if (!open) {
      setContainerSelectPopupItemId(null);
      setContainerSelectPanelItemId(null);
      setPopupExpandedContainerId(null);
      setPanelExpandedContainerId(null);
      setWeighingCertInfoText('');
      setWeighingCertImageFiles([]);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (containerSelectPopupItemId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setContainerSelectPopupItemId(null);
        setPopupExpandedContainerId(null);
        return;
      }
      if (containerSelectPanelItemId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setContainerSelectPanelItemId(null);
        setPanelExpandedContainerId(null);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    open,
    onOpenChange,
    containerSelectPopupItemId,
    containerSelectPanelItemId,
  ]);

  // 하차완료정보 수정 시 기존 계근증 데이터 로드
  React.useEffect(() => {
    if (open && delivery) {
      setWeighingCertInfoText(delivery.weighingCertInfo ?? '');
    }
  }, [open, delivery?.id, delivery?.weighingCertInfo]);

  // 계근증 이미지 미리보기 URL 정리 (메모리 누수 방지)
  const weighingCertPreviewUrls = React.useMemo(() => {
    return weighingCertImageFiles.map((f) => URL.createObjectURL(f));
  }, [weighingCertImageFiles]);
  React.useEffect(() => {
    return () => {
      weighingCertPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [weighingCertPreviewUrls]);

  // 재고 상태 라벨 매핑 (sales-form-drawer.tsx 참고)
  const inventoryStatusLabels: Record<string, string> = {
    AVAILABLE: '가용',
    RESERVED: '예약됨',
    PARTIALLY_RESERVED: '부분 예약',
    PARTIALLY_SOLD: '부분 판매중',
    PARTIALLY_SOLD_COMPLETED: '부분 판매완료',
    SELLING: '판매중',
    SOLD_OUT: '판매 완료',
  };

  const getSalesHistoryStatusBadgeStyle = (status?: string | null) => {
    if (!status) return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
    const s = status.trim().toUpperCase();
    if (s === 'SALES_ITEM_RESERVED') return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
    if (s === 'SALES_ITEM_SOLD') return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
    if (s === 'SALES_ITEM_COMPLETED') return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
    if (s === 'SALES_ITEM_CANCELLED') return 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300';
    if (s === 'INVENTORY_INBOUND' || s === 'INVENTORY_CONSUMPTION') return 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300';
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  };

  const inventoryStatusStyles: Record<string, string> = {
    AVAILABLE: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
    RESERVED: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
    PARTIALLY_RESERVED: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
    PARTIALLY_SOLD: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
    PARTIALLY_SOLD_COMPLETED: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
    SELLING: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
    SOLD_OUT: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
  };

  const applyContainerSelection = React.useCallback((itemId: string, sel: { id: number; containerNo: string; availableBales?: number | null; availableWeight?: number | null } & Record<string, unknown>) => {
    handleActualApplyChange(itemId, 'actualContainerId', String(sel.id));
    handleActualApplyChange(itemId, 'actualContainer', sel.containerNo ?? '');
    const item = delivery?.loadingItems?.find((li) => li.id === itemId);
    const requestContainer = item?.requestContainer ?? item?.salesItem?.container?.containerNo;
    const requestContainerType = item?.requestContainerType ?? item?.salesItem?.containerType ?? 'CONTAINER';
    const workContainerType = item?.workContainerType || requestContainerType;
    if (sel.containerNo === requestContainer) {
      handleActualApplyChange(itemId, 'actualType', workContainerType);
    } else if (sel) {
      const availableBales = sel.availableBales != null ? Number(sel.availableBales) : 0;
      const availableWeight = sel.availableWeight != null ? Number(sel.availableWeight) : 0;
      const hasNoAvailableBales = availableBales === 0 || availableBales == null;
      const hasNoAvailableWeight = availableWeight === 0 || availableWeight == null;
      if (hasNoAvailableBales && hasNoAvailableWeight) {
        // 가용 0(타 판매 사용 등)이어도 카고로 강제하지 않음 — 작업/요청 타입 사용, 이후 판매에서 정합 맞춤
        handleActualApplyChange(itemId, 'actualType', workContainerType);
      } else {
        handleActualApplyChange(itemId, 'actualType', 'CONTAINER');
      }
    }
  }, [delivery?.loadingItems]);

  const handleApplyContainerFromPopup = React.useCallback((itemId: string, sel: Parameters<typeof applyContainerSelection>[1]) => {
    applyContainerSelection(itemId, sel);
    setContainerSelectPopupItemId(null);
  }, [applyContainerSelection]);

  const handleApplyContainerFromPanel = React.useCallback((itemId: string, sel: Parameters<typeof applyContainerSelection>[1]) => {
    applyContainerSelection(itemId, sel);
    setContainerSelectPanelItemId(null);
  }, [applyContainerSelection]);

  if (!delivery) return null;

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full flex flex-col"
        style={{
          width: isMobile ? '100%' : (containerSelectPanelItemId ? '1500px' : '900px'),
          maxWidth: '95vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      >
        <div className="flex h-full flex-1 min-h-0">
          {/* 컨테이너 선택 패널 (Drawer 내부 확장 - 비교용) */}
          {!isMobile && containerSelectPanelItemId && (
            <div className="w-[700px] flex-shrink-0 border-r flex flex-col bg-muted/30">
              <div className="p-3 border-b flex items-center justify-between">
                <h4 className="text-sm font-semibold">컨테이너 선택 (패널)</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setContainerSelectPanelItemId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-3">
                {(() => {
                  const actualItem = actualApplyItems[containerSelectPanelItemId] || {};
                  const bl = actualItem.actualBL;
                  const list = bl ? getContainersByBL(bl, containerSelectPanelItemId) : [];
                  if (!bl) return <p className="text-sm text-muted-foreground">BL을 먼저 선택하세요.</p>;
                  if (list.length === 0) return <p className="text-sm text-muted-foreground">선택 가능한 컨테이너가 없습니다.</p>;
                  return (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left p-2 font-medium w-10"></th>
                            <th className="text-left p-2 font-medium">컨테이너</th>
                            <th className="text-left p-2 font-medium">순번</th>
                            <th className="text-left p-2 font-medium">제품</th>
                            <th className="text-left p-2 font-medium">재고 상태</th>
                            <th className="text-right p-2 font-medium">가용 베일</th>
                            <th className="text-right p-2 font-medium">가용 중량</th>
                            <th className="p-2 w-20 text-center">선택</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((c) => {
                            const productLabel = (c as { productName?: string; product?: string }).productName ?? (c as { product?: string }).product ?? '-';
                            const status = (c as { inventoryStatus?: string }).inventoryStatus;
                            const statusLabel = status ? inventoryStatusLabels[status] ?? status : '-';
                            const statusClass = status ? inventoryStatusStyles[status] ?? '' : '';
                            const availB = (c as { availableBales?: number | null }).availableBales;
                            const availW = (c as { availableWeight?: number | null }).availableWeight;
                            const availBales = availB != null ? Number(availB) : '-';
                            const availWeight = availW != null ? Number(availW).toFixed(3).replace(/\.?0+$/, '') : '-';
                            const isExpanded = panelExpandedContainerId === String(c.id);
                            const isSelected = actualItem.actualContainerId === String(c.id);
                            return (
                              <React.Fragment key={c.id}>
                                <tr
                                  className={cn(
                                    'border-b hover:bg-muted/50 cursor-pointer',
                                    isSelected && 'bg-primary/5'
                                  )}
                                  onClick={() => setPanelExpandedContainerId((prev) => (prev === String(c.id) ? null : String(c.id)))}
                                >
                                  <td className="p-1" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => setPanelExpandedContainerId((prev) => (prev === String(c.id) ? null : String(c.id)))}
                                      title={isExpanded ? '판매 이력 접기' : '판매 이력 펼치기'}
                                    >
                                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                  </td>
                                  <td className="p-2 font-medium">{c.containerNo}</td>
                                  <td className="p-2">{c.sequence != null ? `[${c.sequence}]` : '-'}</td>
                                  <td className="p-2">{productLabel}</td>
                                  <td className="p-2">
                                    {status ? (
                                      <Badge variant="outline" className={cn('text-xs', statusClass)}>
                                        {statusLabel}
                                      </Badge>
                                    ) : '-'}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">{typeof availBales === 'number' ? availBales.toLocaleString() : availBales}</td>
                                  <td className="p-2 text-right tabular-nums">{availWeight} KG</td>
                                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      type="button"
                                      variant={isSelected ? 'default' : 'outline'}
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => handleApplyContainerFromPanel(containerSelectPanelItemId, c)}
                                    >
                                      {isSelected ? <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> : null}
                                      선택
                                    </Button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={8} className="p-0 align-top bg-muted/20">
                                      <div className="p-3">
                                        <p className="text-xs font-medium text-muted-foreground mb-2">판매 이력 - {c.containerNo}</p>
                                        <ContainerSalesHistoryInline
                                          containerId={String(c.id)}
                                          getStatusBadgeStyle={getSalesHistoryStatusBadgeStyle}
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <DrawerHeader>
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle>
                {delivery.status === 'UNLOADING_COMPLETED' ? '하차완료정보 수정' : '하차완료 확인'}
              </DrawerTitle>
              <DrawerDescription>
                {delivery.status === 'UNLOADING_COMPLETED' 
                  ? '하차완료 시 입력한 실제 처리 정보를 수정합니다.'
                  : '상차 정보를 확인하고 하차완료로 변경합니다. 실제 처리된 정보로 재고가 반영됩니다.'}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <div className="px-4 py-4">
              <div className="space-y-6">
                {/* 컨테이너 추가 버튼 */}
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={handleAddRow}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    컨테이너 추가
                  </Button>
                </div>
            {(delivery.loadingItems && delivery.loadingItems.length > 0) || addedRowIds.length > 0 ? (
              <>
              {(delivery.loadingItems ?? []).map((item, index) => {
                const isExcluded = removedIds.has(String(item.id));
                // 상차지: 입고확정 시 설정한 창고 (백엔드에서 item.loadingWarehouse로 채움)
                const warehouseName = item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId) || '-';
                const salesItem = item.salesItem;
                const container = salesItem?.container;
                const order = container?.order;
                
                // 요청 정보: request 필드가 있으면 우선 사용, 없으면 fallback
                const requestBL = item.requestBL ?? order?.bl ?? '-';
                const requestContainer = item.requestContainer ?? container?.containerNo ?? '-';
                // 요청 컨테이너 순번: 백엔드 requestContainerSequence 우선 (추가 컨테이너 행은 salesItem.container가 첫 번째 컨테이너라 잘못된 순번 방지)
                const requestContainerSequence =
                  (item as { requestContainerSequence?: number | null }).requestContainerSequence ??
                  (requestContainer !== '-' && container?.containerNo != null && String(container.containerNo) === String(requestContainer)
                    ? container.sequence
                    : undefined);
                const requestBalesRaw = item.requestBales ?? salesItem?.cargoBales ?? (container?.salesBales ?? container?.tradeBales ?? null);
                const requestBales = requestBalesRaw 
                  ? (parseFloat(String(requestBalesRaw)) % 1 === 0 
                      ? parseFloat(String(requestBalesRaw)).toFixed(0) 
                      : String(requestBalesRaw))
                  : '-';
                const requestWeightRaw = item.requestWeight ?? salesItem?.cargoWeight ?? container?.weight ?? null;
                const requestWeight = requestWeightRaw 
                  ? (parseFloat(String(requestWeightRaw)) % 1 === 0 
                      ? parseFloat(String(requestWeightRaw)).toFixed(0) 
                      : parseFloat(String(requestWeightRaw)).toFixed(3).replace(/\.?0+$/, ''))
                  : '-';
                const requestContainerType = item.requestContainerType ?? salesItem?.containerType ?? 'CONTAINER';
                const requestContainerTypeLabel = requestContainerType === 'CARGO' ? '카고' : '컨테이너';

                // 실제 적용할 정보에서 선택된 컨테이너 정보 (ID 우선, 없으면 containerNo로 조회)
                const actualItem = actualApplyItems[item.id] || {};
                const actualType = actualItem.actualType || 'CONTAINER';
                const selectedContainer = actualItem.actualContainerId
                  ? containers.find((c) => String(c.id) === actualItem.actualContainerId)
                  : (actualItem.actualContainer ? containers.find((c) => c.containerNo === actualItem.actualContainer) : null);
                
                // 요청 정보 (위에서 이미 정의된 변수 재사용)
                const requestContainerNo = item.requestContainer ?? container?.containerNo ?? null;
                const requestBalesNum = requestBalesRaw != null ? Number(requestBalesRaw) : 0;
                const requestWeightNum = requestWeightRaw != null ? Number(requestWeightRaw) : 0;
                
                // 작업 정보
                const workBales = item.workBales != null ? Number(item.workBales) : 0;
                const workWeight = item.workWeight != null ? Number(item.workWeight) : 0;
                
                // 남은 수량 계산
                const baseAvailableBales = selectedContainer?.availableBales != null 
                  ? Number(selectedContainer.availableBales) 
                  : null;
                const baseAvailableWeight = selectedContainer?.availableWeight != null 
                  ? Number(selectedContainer.availableWeight) 
                  : null;
                
                // 요청한 컨테이너인 경우: 남은 수량 + 요청한 수량
                // 요청하지 않은 컨테이너인 경우: 남은 수량 그대로
                const isRequestedContainer = (actualItem.actualContainerId != null && container?.id != null && String(actualItem.actualContainerId) === String(container.id))
                  || actualItem.actualContainer === requestContainerNo;
                let calculatedAvailableBales = baseAvailableBales;
                let calculatedAvailableWeight = baseAvailableWeight;
                
                if (isRequestedContainer) {
                  // 요청한 컨테이너: 남은 수량 + 요청한 수량
                  calculatedAvailableBales = baseAvailableBales != null && requestBalesNum > 0
                    ? baseAvailableBales + requestBalesNum
                    : baseAvailableBales;
                  calculatedAvailableWeight = baseAvailableWeight != null && requestWeightNum > 0
                    ? baseAvailableWeight + requestWeightNum
                    : baseAvailableWeight;
                }
                // 요청하지 않은 컨테이너는 baseAvailableBales/baseAvailableWeight 그대로 사용
                
                // 남은 수량 포맷팅: 베일은 소수점 이하 0이면 제거, 중량은 소수점이 있으면 표시
                const availableBales = calculatedAvailableBales != null
                  ? (calculatedAvailableBales % 1 === 0 ? calculatedAvailableBales : Number(calculatedAvailableBales.toFixed(4).replace(/\.?0+$/, '')))
                  : null;
                const availableWeight = calculatedAvailableWeight != null
                  ? (calculatedAvailableWeight % 1 === 0 ? calculatedAvailableWeight : Number(calculatedAvailableWeight.toFixed(3).replace(/\.?0+$/, '')))
                  : null;

                // 작업 정보
                const workBL = item.workBL || '-';
                const workContainer = item.workContainer || '-';
                const workBalesFormatted = item.workBales != null 
                  ? (parseFloat(String(item.workBales)) % 1 === 0 
                      ? parseFloat(String(item.workBales)).toFixed(0) 
                      : String(item.workBales))
                  : '-';
                const workWeightFormatted = item.workWeight != null 
                  ? (parseFloat(String(item.workWeight)) % 1 === 0 
                      ? parseFloat(String(item.workWeight)).toFixed(0) 
                      : parseFloat(String(item.workWeight)).toFixed(3).replace(/\.?0+$/, ''))
                  : '-';
                const workContainerType = item.workContainerType || requestContainerType;
                const workContainerTypeLabel = workContainerType === 'CARGO' ? '카고' : '컨테이너';
                // 작업 정보 비고: work_line에 저장된 상차 업체 작성 내용 (order로 매칭)
                const workNotes = delivery?.workLines?.[index]?.notes?.trim() || '-';
                const productName = getProductName(container?.product);

                // 차이 확인
                const isDifferent = 
                  requestBL !== workBL ||
                  requestContainer !== workContainer ||
                  requestContainerType !== workContainerType ||
                  String(requestBalesRaw || '') !== String(item.workBales ?? '') ||
                  String(requestWeightRaw || '') !== String(item.workWeight ?? '');

                // 실제 적용할 정보 (위에서 이미 선언됨)

                return (
                  <div key={item.id} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold">
                        상차지 {index + 1}: {warehouseName}
                        {productName !== '-' ? ` · ${productName}` : ''}
                      </h4>
                      <div className="flex items-center gap-2">
                        {isDifferent && (
                          <div className="flex items-center gap-1 text-amber-600 text-xs">
                            <AlertTriangle className="h-3 w-3" />
                            <span>요청과 작업 정보가 다릅니다</span>
                          </div>
                        )}
                        {isExcluded ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => handleRestoreRow(String(item.id))}
                          >
                            복원
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveRow(String(item.id))}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            행 삭제
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* 첫 번째 줄: 요청 정보 */}
                      <div>
                        <h5 className="text-xs font-semibold text-muted-foreground mb-2">요청 정보</h5>
                        <div className="grid gap-4 md:grid-cols-5">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">요청 BL</span>
                            <span className="text-sm font-medium">{requestBL}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">요청 컨테이너</span>
                            <span className="text-sm font-medium">
                              {requestContainer}
                              {requestContainerSequence != null ? ` [${requestContainerSequence}]` : ''}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">요청 타입</span>
                            <span className="text-sm font-medium">{requestContainerTypeLabel}</span>
                          </div>
                          {/* 타입이 카고일 때만 요청 베일/중량 표시 */}
                          {requestContainerType === 'CARGO' && (
                            <>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 베일</span>
                                <span className="text-sm font-medium">{requestBales}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 중량 (KG)</span>
                                <span className="text-sm font-medium">
                                  {requestWeightRaw != null && String(requestWeightRaw).trim() !== ''
                                    ? (() => {
                                        const num = parseFloat(String(requestWeightRaw).trim().replace(/,/g, ''));
                                        return Number.isNaN(num) ? String(requestWeightRaw).trim() : Math.round(num * 1000).toLocaleString('ko-KR');
                                      })()
                                    : '-'}
                                </span>
                              </div>
                            </>
                          )}
                          {requestContainerType !== 'CARGO' && (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground"></span>
                              <span className="text-sm"></span>
                            </div>
                          )}
                        </div>
                        {/* 요청 정보 비고 */}
                        {item.requestNotes?.trim() && (
                          <div className="mt-2 flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">비고</span>
                            <span className="text-sm font-medium whitespace-pre-wrap">{item.requestNotes.trim()}</span>
                          </div>
                        )}
                      </div>

                      {/* 두 번째 줄: 작업 정보 */}
                      <div>
                        <h5 className="text-xs font-semibold text-muted-foreground mb-2">작업 정보</h5>
                        <div className="grid gap-4 md:grid-cols-5">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">작업 BL</span>
                            <span className={cn("text-sm font-medium", isDifferent && requestBL !== workBL && "text-amber-600")}>
                              {workBL}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">작업 컨테이너</span>
                            <span className={cn("text-sm font-medium", isDifferent && requestContainer !== workContainer && "text-amber-600")}>
                              {workContainer}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">작업 타입</span>
                            <span className={cn("text-sm font-medium", isDifferent && requestContainerType !== workContainerType && "text-amber-600")}>
                              {workContainerTypeLabel}
                            </span>
                          </div>
                          {/* 작업 타입이 카고일 때만 작업 베일/중량 표시 */}
                          {workContainerType === 'CARGO' && (
                            <>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 베일</span>
                                <span className={cn("text-sm font-medium", isDifferent && String(requestBalesRaw || '') !== String(item.workBales ?? '') && "text-amber-600")}>
                                  {workBalesFormatted}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 중량 (KG)</span>
                                <span className={cn("text-sm font-medium", isDifferent && String(requestWeightRaw || '') !== String(item.workWeight ?? '') && "text-amber-600")}>
                                  {item.workWeight != null ? Math.round(parseFloat(String(item.workWeight)) * 1000).toLocaleString('ko-KR') : '-'}
                                </span>
                              </div>
                            </>
                          )}
                          {workContainerType !== 'CARGO' && (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground"></span>
                              <span className="text-sm"></span>
                            </div>
                          )}
                        </div>
                        {/* 작업 정보 비고 (상차 업체 입력 · 행 삭제해도 유지되어 표시됨) */}
                        {(workNotes && workNotes !== '-') && (
                          <div className="mt-2 flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">비고</span>
                            <span className="text-sm font-medium whitespace-pre-wrap">{workNotes}</span>
                          </div>
                        )}
                      </div>

                      {/* 세 번째 줄: 실제 확정 정보 또는 하차 제외 */}
                      {isExcluded ? (
                        <>
                          <Separator />
                          <div className="border rounded-lg p-4 bg-muted/50 text-muted-foreground text-sm">
                            이 컨테이너는 <strong>하차 제외</strong> 상태입니다. 실제 확정 정보가 재고에 반영되지 않으며, 요청·작업 정보는 위와 같이 보존됩니다. 복원하려면 오른쪽 상단 [복원] 버튼을 누르세요.
                          </div>
                        </>
                      ) : actualItem ? (
                        <>
                          <Separator />
                          <div className={cn(
                            "border rounded-lg p-4",
                            "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800"
                          )}>
                            <div className="flex items-center gap-2 mb-3">
                              <Info className="h-4 w-4 text-blue-600" />
                              <h5 className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                                실제 확정 정보 (관리자 입력 · 컨테이너/수량 수정 가능)
                              </h5>
                            </div>
                            <div className="space-y-3">
                              <div
                                className="grid gap-4"
                                style={{
                                  gridTemplateColumns: 'minmax(0, 1.5fr) minmax(140px, 2.25fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1fr)',
                                }}
                              >
                                <div className="flex flex-col gap-1 min-w-0">
                                  <Label htmlFor={`actual-bl-${item.id}`} className="text-xs">
                                    실제 BL
                                  </Label>
                                  <Select
                                    value={actualItem.actualBL || ''}
                                    onValueChange={(value) => {
                                      handleActualApplyChange(item.id, 'actualBL', value);
                                      handleActualApplyChange(item.id, 'actualContainer', '');
                                      handleActualApplyChange(item.id, 'actualContainerId', '');
                                    }}
                                  >
                                    <SelectTrigger id={`actual-bl-${item.id}`} className="h-8 text-sm">
                                      <SelectValue placeholder="BL 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {containersLoading ? (
                                        <SelectItem value="__loading__" disabled>로딩 중...</SelectItem>
                                      ) : (() => {
                                        const itemBLs = getAvailableBLsForItem(item);
                                        return itemBLs.length === 0 ? (
                                          <SelectItem value="__empty__" disabled>BL 없음</SelectItem>
                                        ) : (
                                          itemBLs.map((bl) => {
                                            const productLabel = getProductLabelsForBL(bl);
                                            return (
                                              <SelectItem key={bl} value={bl}>
                                                {bl}{productLabel ? ` · ${productLabel}` : ''}
                                              </SelectItem>
                                            );
                                          })
                                        );
                                      })()}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <Label htmlFor={`actual-container-${item.id}`} className="text-xs">
                                    실제 컨테이너
                                  </Label>
                                  <div className="flex gap-1.5 items-center">
                                    <Select
                                      value={actualItem.actualContainerId || (selectedContainer ? String(selectedContainer.id) : '') || ''}
                                      onValueChange={(value) => {
                                        const sel = getContainersByBL(actualItem.actualBL, item.id).find((c) => String(c.id) === value);
                                        handleActualApplyChange(item.id, 'actualContainerId', value);
                                        handleActualApplyChange(item.id, 'actualContainer', sel?.containerNo ?? '');
                                        const requestContainer = item.requestContainer ?? item.salesItem?.container?.containerNo;
                                        const requestContainerType = item.requestContainerType ?? item.salesItem?.containerType ?? 'CONTAINER';
                                        const workContainerType = item.workContainerType || requestContainerType;
                                        if (sel?.containerNo === requestContainer) {
                                          handleActualApplyChange(item.id, 'actualType', workContainerType);
                                        } else if (sel) {
                                          const availableBales = sel.availableBales != null ? Number(sel.availableBales) : 0;
                                          const availableWeight = sel.availableWeight != null ? Number(sel.availableWeight) : 0;
                                          const hasNoAvailableBales = availableBales === 0 || availableBales == null;
                                          const hasNoAvailableWeight = availableWeight === 0 || availableWeight == null;
                                          if (hasNoAvailableBales && hasNoAvailableWeight) {
                                            handleActualApplyChange(item.id, 'actualType', workContainerType);
                                          } else {
                                            handleActualApplyChange(item.id, 'actualType', 'CONTAINER');
                                          }
                                        }
                                      }}
                                      disabled={!actualItem.actualBL || containersLoading}
                                    >
                                      <SelectTrigger id={`actual-container-${item.id}`} className="h-8 text-sm flex-1 min-w-0">
                                        <SelectValue placeholder={actualItem.actualBL ? "컨테이너 선택" : "BL을 먼저 선택하세요"} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {!actualItem.actualBL ? (
                                          <SelectItem value="__no_bl__" disabled>BL을 먼저 선택하세요</SelectItem>
                                        ) : containersLoading ? (
                                          <SelectItem value="__loading__" disabled>로딩 중...</SelectItem>
                                        ) : getContainersByBL(actualItem.actualBL, item.id).length === 0 ? (
                                          <SelectItem value="__empty__" disabled>컨테이너 없음</SelectItem>
                                        ) : (
                                          getContainersByBL(actualItem.actualBL, item.id).map((c) => {
                                            const productLabel = (c as { productName?: string; product?: string }).productName ?? (c as { product?: string }).product ?? '-';
                                            // 실제 컨테이너와 일치할 때 백엔드 displayContainerSequence 사용 (동일 containerNo가 여러 주문에 있을 때 배송 주문 기준 순번 표시)
                                            const actualNo = actualItem.actualContainer || item.actualContainer;
                                            const displaySeq =
                                              actualNo && String(c.containerNo).trim() === String(actualNo).trim() && (item as { displayContainerSequence?: number | null }).displayContainerSequence != null
                                                ? (item as { displayContainerSequence: number }).displayContainerSequence
                                                : c.sequence;
                                            return (
                                              <SelectItem key={c.id} value={String(c.id)}>
                                                {c.containerNo}{displaySeq != null ? ` [${displaySeq}]` : ''}
                                                {productLabel !== '-' ? ` · ${productLabel}` : ''}
                                              </SelectItem>
                                            );
                                          })
                                        )}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 shrink-0"
                                      disabled={!actualItem.actualBL || containersLoading || getContainersByBL(actualItem.actualBL, item.id).length === 0}
                                      onClick={() => setContainerSelectPopupItemId(item.id)}
                                      title="팝업에서 재고 상태를 확인하며 선택"
                                    >
                                      <Search className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 shrink-0 hidden"
                                      disabled={!actualItem.actualBL || containersLoading || getContainersByBL(actualItem.actualBL, item.id).length === 0}
                                      onClick={() => setContainerSelectPanelItemId(item.id)}
                                      title="패널에서 재고 상태를 확인하며 선택 (비교용)"
                                    >
                                      <PanelRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  {selectedContainer && (selectedContainer as { productName?: string }).productName && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      제품: {(selectedContainer as { productName: string }).productName}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <Label htmlFor={`actual-type-${item.id}`} className="text-xs">
                                    실제 타입
                                  </Label>
                                  <Select
                                    value={actualItem.actualType}
                                    onValueChange={(value) => handleActualApplyChange(item.id, 'actualType', value)}
                                  >
                                    <SelectTrigger id={`actual-type-${item.id}`} className="h-8 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="CONTAINER">컨테이너</SelectItem>
                                      <SelectItem value="CARGO">카고</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {actualType === 'CARGO' && (() => {
                                  // 베일당 중량 계산 (컨테이너의 전체 중량 / 전체 베일)
                                  const totalBales = (selectedContainer?.salesBales ?? selectedContainer?.tradeBales) != null ? Number(selectedContainer?.salesBales ?? selectedContainer?.tradeBales) : 0;
                                  const totalWeight = selectedContainer?.weight != null ? Number(selectedContainer.weight) : 0;
                                  const weightPerBale = totalBales > 0 ? totalWeight / totalBales : 0;
                                  
                                  return (
                                    <>
                                      <div className="flex flex-col gap-1 min-w-0">
                                        <Label htmlFor={`actual-bales-${item.id}`} className="text-xs">
                                          실제 베일
                                        </Label>
                                        <NumberInput
                                          id={`actual-bales-${item.id}`}
                                          value={(() => {
                                            const balesValue = actualItem.actualBales;
                                            if (!balesValue) return 0;
                                            const numValue = parseFloat(String(balesValue));
                                            return isNaN(numValue) ? 0 : numValue;
                                          })()}
                                          onChange={(value) => {
                                            const cargoBales = value ?? 0;
                                            handleActualApplyChange(item.id, 'actualBales', String(cargoBales));
                                          }}
                                          decimals={4}
                                          className="h-8 text-xs"
                                        />
                                        {availableBales != null && (
                                          <span className="text-xs text-muted-foreground">
                                            남은 수량: {availableBales % 1 === 0 ? availableBales.toLocaleString() : availableBales.toFixed(4).replace(/\.?0+$/, '')}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-col gap-1 min-w-0">
                                        <Label htmlFor={`actual-weight-${item.id}`} className="text-xs">
                                          실제 중량 (KG)
                                        </Label>
                                        <NumberInput
                                          id={`actual-weight-${item.id}`}
                                          value={(() => {
                                            const weightValue = actualItem.actualWeight;
                                            if (!weightValue) return 0;
                                            const numValue = parseFloat(String(weightValue));
                                            return isNaN(numValue) ? 0 : Math.round(numValue * 1000);
                                          })()}
                                          onChange={(value) => {
                                            const kg = value ?? 0;
                                            handleActualApplyChange(item.id, 'actualWeight', String(Number((kg / 1000).toFixed(3))));
                                          }}
                                          decimals={0}
                                          className="h-8 text-xs"
                                        />
                                        {availableWeight != null && (
                                          <span className="text-xs text-muted-foreground">
                                            남은 수량: {Math.round(availableWeight * 1000).toLocaleString('ko-KR')} KG
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label htmlFor={`actual-notes-${item.id}`} className="text-xs">
                                  비고
                                </Label>
                                <Input
                                  id={`actual-notes-${item.id}`}
                                  value={actualItem.actualNotes}
                                  onChange={(e) => handleActualApplyChange(item.id, 'actualNotes', e.target.value)}
                                  className="h-8 text-sm"
                                  placeholder="비고"
                                />
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {/* 새로 추가한 행 (실제 확정 정보만 입력) */}
              {addedRowIds.map((newId) => {
                const actualItem = actualApplyItems[newId] || {};
                const actualType = actualItem.actualType || 'CONTAINER';
                const selectedContainer = actualItem.actualContainer
                  ? containers.find((c) => c.containerNo === actualItem.actualContainer)
                  : null;
                const availableBales = selectedContainer?.availableBales != null ? Number(selectedContainer.availableBales) : null;
                const availableWeight = selectedContainer?.availableWeight != null ? Number(selectedContainer.availableWeight) : null;
                const refItem = templateLoadingItem;
                const itemBLs = refItem ? getAvailableBLsForItem(refItem) : getAvailableBLsForItem({});
                return (
                  <div key={newId} className="border rounded-lg p-4 space-y-4 border-dashed border-blue-300 dark:border-blue-700">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300">추가 컨테이너 (신규)</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveRow(newId)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        행 삭제
                      </Button>
                    </div>
                    <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                      <h5 className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-3">실제 확정 정보 (관리자 입력)</h5>
                      <div className="space-y-3">
                        <div
                          className="grid gap-4"
                          style={{
                            gridTemplateColumns: 'minmax(0, 1.5fr) minmax(140px, 2.25fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1fr)',
                          }}
                        >
                          <div className="flex flex-col gap-1 min-w-0">
                            <Label className="text-xs">실제 BL</Label>
                            <Select
                              value={actualItem.actualBL || ''}
                              onValueChange={(v) => { handleActualApplyChange(newId, 'actualBL', v); handleActualApplyChange(newId, 'actualContainer', ''); handleActualApplyChange(newId, 'actualContainerId', ''); }}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="BL 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {itemBLs.length === 0 ? <SelectItem value="__empty__" disabled>BL 없음</SelectItem> : itemBLs.map((bl) => {
                                const productLabel = getProductLabelsForBL(bl);
                                return <SelectItem key={bl} value={bl}>{bl}{productLabel ? ` · ${productLabel}` : ''}</SelectItem>;
                              })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-1 min-w-0">
                            <Label className="text-xs">실제 컨테이너</Label>
                            {(() => {
                              const addedRowContainers = actualItem.actualBL ? getContainersByBL(actualItem.actualBL, newId) : [];
                              const addedRowSelectedContainer = actualItem.actualContainerId
                                ? addedRowContainers.find((c) => String(c.id) === actualItem.actualContainerId)
                                : (actualItem.actualContainer ? addedRowContainers.find((c) => c.containerNo === actualItem.actualContainer) : null);
                              return (
                            <div className="flex gap-1.5 items-center">
                            <Select
                              value={actualItem.actualContainerId || (addedRowSelectedContainer ? String(addedRowSelectedContainer.id) : '') || ''}
                              onValueChange={(v) => {
                                const sel = getContainersByBL(actualItem.actualBL, newId).find((c) => String(c.id) === v);
                                handleActualApplyChange(newId, 'actualContainerId', v);
                                handleActualApplyChange(newId, 'actualContainer', sel?.containerNo ?? '');
                                if (sel) {
                                  const workType = (refItem?.workContainerType || refItem?.requestContainerType || 'CONTAINER') as 'CONTAINER' | 'CARGO';
                                  const availableBales = sel.availableBales != null ? Number(sel.availableBales) : 0;
                                  const availableWeight = sel.availableWeight != null ? Number(sel.availableWeight) : 0;
                                  const hasNoAvailable = (availableBales === 0 || availableBales == null) && (availableWeight === 0 || availableWeight == null);
                                  handleActualApplyChange(newId, 'actualType', hasNoAvailable ? workType : 'CONTAINER');
                                }
                              }}
                              disabled={!actualItem.actualBL || containersLoading}
                            >
                              <SelectTrigger className="h-8 text-sm flex-1 min-w-0">
                                <SelectValue placeholder={actualItem.actualBL ? '컨테이너 선택' : 'BL 먼저 선택'} />
                              </SelectTrigger>
                              <SelectContent>
                                {!actualItem.actualBL ? <SelectItem value="__no_bl__" disabled>BL 먼저 선택</SelectItem> : addedRowContainers.length === 0 ? <SelectItem value="__empty__" disabled>컨테이너 없음</SelectItem> : addedRowContainers.map((c) => {
                                  const productLabel = (c as { productName?: string; product?: string }).productName ?? (c as { product?: string }).product ?? '-';
                                  return <SelectItem key={c.id} value={String(c.id)}>{c.containerNo}{c.sequence != null ? ` [${c.sequence}]` : ''}{productLabel !== '-' ? ` · ${productLabel}` : ''}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0"
                              disabled={!actualItem.actualBL || containersLoading || addedRowContainers.length === 0}
                              onClick={() => setContainerSelectPopupItemId(newId)}
                              title="팝업에서 재고 상태를 확인하며 선택"
                            >
                              <Search className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0 hidden"
                              disabled={!actualItem.actualBL || containersLoading || addedRowContainers.length === 0}
                              onClick={() => setContainerSelectPanelItemId(newId)}
                              title="패널에서 재고 상태를 확인하며 선택 (비교용)"
                            >
                              <PanelRight className="h-4 w-4" />
                            </Button>
                            </div>
                            ); })()}
                            {(() => {
                              const addedRowContainersForLabel = actualItem.actualBL ? getContainersByBL(actualItem.actualBL, newId) : [];
                              const addedRowSelectedForLabel = actualItem.actualContainerId
                                ? addedRowContainersForLabel.find((c) => String(c.id) === actualItem.actualContainerId)
                                : (actualItem.actualContainer ? addedRowContainersForLabel.find((c) => c.containerNo === actualItem.actualContainer) : null);
                              return addedRowSelectedForLabel && (addedRowSelectedForLabel as { productName?: string }).productName ? <p className="text-xs text-muted-foreground mt-1">제품: {(addedRowSelectedForLabel as { productName: string }).productName}</p> : null;
                            })()}
                          </div>
                          <div className="flex flex-col gap-1 min-w-0">
                            <Label className="text-xs">실제 타입</Label>
                            <Select value={actualItem.actualType} onValueChange={(v) => handleActualApplyChange(newId, 'actualType', v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CONTAINER">컨테이너</SelectItem>
                                <SelectItem value="CARGO">카고</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {actualType === 'CARGO' && (
                            <>
                              <div className="flex flex-col gap-1 min-w-0">
                                <Label className="text-xs">실제 베일</Label>
                                <NumberInput value={actualItem.actualBales ? parseFloat(actualItem.actualBales) : 0} onChange={(v) => handleActualApplyChange(newId, 'actualBales', String(v ?? 0))} decimals={4} className="h-8 text-xs" />
                                {availableBales != null && <span className="text-xs text-muted-foreground">남은 수량: {availableBales}</span>}
                              </div>
                              <div className="flex flex-col gap-1 min-w-0">
                                <Label className="text-xs">실제 중량 (KG)</Label>
                                <NumberInput value={actualItem.actualWeight ? Math.round(parseFloat(actualItem.actualWeight) * 1000) : 0} onChange={(v) => handleActualApplyChange(newId, 'actualWeight', String(Number(((v ?? 0) / 1000).toFixed(3))))} decimals={0} className="h-8 text-xs" />
                                {availableWeight != null && <span className="text-xs text-muted-foreground">남은: {Math.round(availableWeight * 1000).toLocaleString('ko-KR')} KG</span>}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">비고</Label>
                          <Input value={actualItem.actualNotes} onChange={(e) => handleActualApplyChange(newId, 'actualNotes', e.target.value)} className="h-8 text-sm" placeholder="비고" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                상차 정보가 없습니다.
              </div>
            )}

            {/* 계근증 관련 정보 (하차완료 시 저장용) */}
            <div className="mt-6 space-y-4">
              <Separator />
              <h3 className="text-sm font-semibold text-foreground">계근증 관련 정보</h3>
              <p className="text-xs text-muted-foreground">
                하차완료 시 카톡/문자 내용과 계근증 이미지를 저장하고 추후 확인할 수 있습니다.
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="weighing-cert-info">계근증 관련 정보 텍스트</Label>
                  <Textarea
                    id="weighing-cert-info"
                    value={weighingCertInfoText}
                    onChange={(e) => setWeighingCertInfoText(e.target.value)}
                    placeholder="계근증 관련 메모, 카톡/문자 내용 등을 입력하세요"
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>계근증 이미지</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      ref={weighingCertFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          setWeighingCertImageFiles((prev) => [...prev, ...Array.from(files)]);
                        }
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => weighingCertFileInputRef.current?.click()}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      이미지 추가
                    </Button>
                  </div>
                  {(() => {
                    const existingPaths: string[] = [];
                    try {
                      if (delivery.weighingCertImagePaths) {
                        const p = JSON.parse(delivery.weighingCertImagePaths) as string[];
                        if (Array.isArray(p)) existingPaths.push(...p);
                      }
                    } catch {
                      // ignore
                    }
                    const hasImages = existingPaths.length > 0 || weighingCertImageFiles.length > 0;
                    if (!hasImages) return null;
                    return (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {existingPaths.map((path, idx) => (
                          <div key={path} className="relative group border rounded-lg overflow-hidden bg-muted/50 w-20 h-20">
                            <a href={getGcsPublicUrl(path)} target="_blank" rel="noopener noreferrer">
                              <img
                                src={getGcsPublicUrl(path)}
                                alt={`저장된 계근증 ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </a>
                            <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 truncate">
                              저장됨
                            </span>
                          </div>
                        ))}
                        {weighingCertImageFiles.map((file, idx) => (
                          <div
                            key={`${file.name}-${idx}`}
                            className="relative group border rounded-lg overflow-hidden bg-muted/50 w-20 h-20"
                          >
                            <img
                              src={weighingCertPreviewUrls[idx]}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                setWeighingCertImageFiles((prev) => prev.filter((_, i) => i !== idx));
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                            <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 truncate">
                              {file.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="border-t border-border p-4 flex-shrink-0">
          {confirmError && (
            <p className="text-destructive text-sm mb-2">{confirmError}</p>
          )}
          <div className="flex items-center justify-end gap-2 flex-wrap">
              <DrawerClose asChild>
                <Button variant="outline" disabled={isSubmitting}>
                  취소
                </Button>
              </DrawerClose>
              <Button
              onClick={handleConfirm}
                disabled={
                isSubmitting ||
                (() => {
                  const keptCount = (delivery.loadingItems ?? []).filter((item) => !removedIds.has(String(item.id))).length;
                  return keptCount + addedRowIds.length === 0;
                })()
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  처리 중...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {delivery.status === 'UNLOADING_COMPLETED' ? '수정 완료' : '하차완료로 변경'}
                </>
              )}
            </Button>
          </div>
        </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>

    {/* 컨테이너 선택 팝업 (가로 넓게, 테이블 안에 판매 이력 테이블) */}
    <Dialog open={!!containerSelectPopupItemId} onOpenChange={(open) => !open && (setContainerSelectPopupItemId(null), setPopupExpandedContainerId(null))}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>컨테이너 선택 (팝업)</DialogTitle>
        </DialogHeader>
        {containerSelectPopupItemId && (() => {
          const actualItem = actualApplyItems[containerSelectPopupItemId] || {};
          const bl = actualItem.actualBL;
          const list = bl ? getContainersByBL(bl, containerSelectPopupItemId) : [];
          return (
            <div className="flex-1 overflow-auto -mx-6 px-6">
              {!bl ? (
                <p className="text-sm text-muted-foreground">BL을 먼저 선택하세요.</p>
              ) : list.length === 0 ? (
                <p className="text-sm text-muted-foreground">선택 가능한 컨테이너가 없습니다.</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left p-2 font-medium w-10"></th>
                        <th className="text-left p-2 font-medium">컨테이너</th>
                        <th className="text-left p-2 font-medium">순번</th>
                        <th className="text-left p-2 font-medium">제품</th>
                        <th className="text-left p-2 font-medium">재고 상태</th>
                        <th className="text-right p-2 font-medium">가용 베일</th>
                        <th className="text-right p-2 font-medium">가용 중량</th>
                        <th className="p-2 w-20 text-center">선택</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((c) => {
                        const productLabel = (c as { productName?: string; product?: string }).productName ?? (c as { product?: string }).product ?? '-';
                        const status = (c as { inventoryStatus?: string }).inventoryStatus;
                        const statusLabel = status ? inventoryStatusLabels[status] ?? status : '-';
                        const statusClass = status ? inventoryStatusStyles[status] ?? '' : '';
                        const availB = (c as { availableBales?: number | null }).availableBales;
                        const availW = (c as { availableWeight?: number | null }).availableWeight;
                        const availBales = availB != null ? Number(availB) : '-';
                        const availWeight = availW != null ? Number(availW).toFixed(3).replace(/\.?0+$/, '') : '-';
                        const isExpanded = popupExpandedContainerId === String(c.id);
                        const isSelected = actualItem.actualContainerId === String(c.id);
                        return (
                          <React.Fragment key={c.id}>
                            <tr
                              className={cn(
                                'border-b hover:bg-muted/30 cursor-pointer',
                                isSelected && 'bg-primary/5'
                              )}
                              onClick={() => setPopupExpandedContainerId((prev) => (prev === String(c.id) ? null : String(c.id)))}
                            >
                              <td className="p-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => setPopupExpandedContainerId((prev) => (prev === String(c.id) ? null : String(c.id)))}
                                  title={isExpanded ? '판매 이력 접기' : '판매 이력 펼치기'}
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </td>
                              <td className="p-2 font-medium">{c.containerNo}</td>
                              <td className="p-2">{c.sequence != null ? `[${c.sequence}]` : '-'}</td>
                              <td className="p-2">{productLabel}</td>
                              <td className="p-2">
                                {status ? (
                                  <Badge variant="outline" className={cn('text-xs', statusClass)}>
                                    {statusLabel}
                                  </Badge>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="p-2 text-right tabular-nums">{typeof availBales === 'number' ? availBales.toLocaleString() : availBales}</td>
                              <td className="p-2 text-right tabular-nums">{availWeight} KG</td>
                              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  type="button"
                                  variant={isSelected ? 'default' : 'outline'}
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleApplyContainerFromPopup(containerSelectPopupItemId, c)}
                                >
                                  {isSelected ? <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> : null}
                                  선택
                                </Button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="p-0 align-top bg-muted/20">
                                  <div className="p-4">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">판매 이력 - {c.containerNo}</p>
                                    <ContainerSalesHistoryInline
                                      containerId={String(c.id)}
                                      getStatusBadgeStyle={getSalesHistoryStatusBadgeStyle}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  </>
  );
};
