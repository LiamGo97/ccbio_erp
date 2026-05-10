'use client';

import * as React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import {
  SalesReservationSheetGridWithColumnSettings,
  type SalesReservationSheetGridHandle,
} from '@/components/sales/sales-reservation-sheet-grid-with-column-settings';
import type { SheetBlOption } from '@/components/sales/sales-reservation-sheet-grid';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useProductReservationsSheetPresence } from '@/lib/hooks/use-product-reservations-sheet-presence';
import { useSalesReservationSheetRows } from '@/lib/hooks/use-sales-reservation-sheet-rows';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Download, FileUp } from 'lucide-react';

export default function ProductReservationsSheetPage() {
  const sheetGridRef = React.useRef<SalesReservationSheetGridHandle>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [editingCell, setEditingCell] = React.useState<{
    row: number;
    col: number;
  } | null>(null);
  const [selectedProductCodes, setSelectedProductCodes] = React.useState<
    Set<string>
  >(new Set());
  const [selectedStatusCodes, setSelectedStatusCodes] = React.useState<
    Set<string>
  >(new Set());
  const hasInitializedProductFilter = React.useRef(false);
  const hasInitializedStatusFilter = React.useRef(false);
  const { data: productCodes = [], isLoading: productOptionsLoading } =
    useCodeMastersByGroup('PRODUCT');

  const firstColumnProductOptions = React.useMemo(() => {
    const sorted = [...productCodes]
      .map((c) => {
        const v = (c.value || '').trim();
        const n = (c.name || c.value || '').trim();
        return v ? { value: v, label: n || v } : null;
      })
      .filter((x): x is { value: string; label: string } => x != null)
      .sort((a, b) => a.value.localeCompare(b.value, 'ko'));
    return sorted;
  }, [productCodes]);

  /** BL 목록은 BL 편집 시에만 API(상품+등급) — 페이지에서 미리 채우지 않음 */
  const emptyBlOptionsByKey = React.useMemo(
    (): Record<string, SheetBlOption[]> => ({}),
    [],
  );

  /** 등급은 코드 마스터 전체 폴백 */
  const salesGradeOptionsByProductCode = React.useMemo(() => ({}), []);

  const { data: sheetStatusCodes = [], isLoading: statusOptionsLoading } =
    useCodeMastersByGroup('SALES_RESERVATION_SHEET_STATUS');

  const defaultSheetStatusItems = React.useMemo(
    () => [
      { value: '요청', label: '요청' },
      { value: '예약등록', label: '예약등록' },
      { value: '판매등록', label: '판매등록' },
      { value: '배차등록', label: '배차등록' },
      { value: '하차완료', label: '하차완료' },
      { value: '하역확인', label: '하역확인' },
    ],
    [],
  );

  const statusFilterOptions = React.useMemo(() => {
    const fromCodes = sheetStatusCodes
      .map((code) => {
        const v = (code.value || '').trim();
        const n = (code.name || code.value || '').trim();
        return v ? { value: v, label: n || v } : null;
      })
      .filter((x): x is { value: string; label: string } => x != null);
    return fromCodes.length > 0 ? fromCodes : defaultSheetStatusItems;
  }, [sheetStatusCodes, defaultSheetStatusItems]);

  const { foreignCellLocks, acquireLock, releaseLock, heartbeat } =
    useProductReservationsSheetPresence(user?.id ?? null);

  const { remoteCells, remoteVersion, persistRow } =
    useSalesReservationSheetRows(!!user);

  const handlePersistRow = React.useCallback(
    async (row: number, values: string[]) => {
      await persistRow({ rowIndex: row, values });
    },
    [persistRow],
  );

  const onBeforeEdit = React.useCallback(
    async (row: number, col: number) => {
      try {
        await acquireLock(row, col);
        return true;
      } catch (e: unknown) {
        const ax = e as { response?: { data?: { message?: unknown } } };
        const msg = ax.response?.data?.message;
        const lockedBy =
          typeof msg === 'object' && msg != null && 'lockedBy' in msg
            ? String((msg as { lockedBy?: string }).lockedBy ?? '')
            : '';
        toast({
          title: '편집 불가',
          description: lockedBy
            ? `${lockedBy} 님이 이 셀을 편집 중입니다.`
            : '다른 사용자가 이 셀을 편집 중입니다.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [acquireLock],
  );

  const onAfterEdit = React.useCallback(
    (row: number, col: number) => {
      void releaseLock(row, col);
    },
    [releaseLock],
  );

  React.useEffect(() => {
    if (!editingCell) return;
    const id = window.setInterval(() => {
      void heartbeat(editingCell.row, editingCell.col);
    }, 12_000);
    return () => window.clearInterval(id);
  }, [editingCell, heartbeat]);

  /**
   * 코드 마스터 상품 목록 로딩 타이밍 — 아직 비어 있을 때 필터를 확정하면
   * 이후 추가된 상품이 선택에 안 들어가 "일부만 선택"처럼 보일 수 있음.
   * `productOptionsLoading === false` 이후에만 최초 전체 선택.
   */
  React.useEffect(() => {
    if (productOptionsLoading) return;

    const validValues = firstColumnProductOptions.map((o) => o.value);
    const validSet = new Set(validValues);

    if (firstColumnProductOptions.length === 0) {
      if (!hasInitializedProductFilter.current) {
        hasInitializedProductFilter.current = true;
        setSelectedProductCodes(new Set());
      }
      return;
    }

    if (!hasInitializedProductFilter.current) {
      hasInitializedProductFilter.current = true;
      setSelectedProductCodes(new Set(validValues));
      return;
    }

    setSelectedProductCodes((prev) => {
      const next = new Set<string>();
      let changed = false;
      for (const c of prev) {
        if (validSet.has(c)) next.add(c);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [firstColumnProductOptions, productOptionsLoading]);

  React.useEffect(() => {
    if (statusOptionsLoading) return;

    const validValues = statusFilterOptions.map((o) => o.value);
    const validSet = new Set(validValues);

    if (statusFilterOptions.length === 0) {
      if (!hasInitializedStatusFilter.current) {
        hasInitializedStatusFilter.current = true;
        setSelectedStatusCodes(new Set());
      }
      return;
    }

    if (!hasInitializedStatusFilter.current) {
      hasInitializedStatusFilter.current = true;
      setSelectedStatusCodes(new Set(validValues));
      return;
    }

    setSelectedStatusCodes((prev) => {
      const next = new Set<string>();
      let changed = false;
      for (const c of prev) {
        if (validSet.has(c)) next.add(c);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [statusFilterOptions, statusOptionsLoading]);

  const allProductsSelected =
    firstColumnProductOptions.length > 0 &&
    selectedProductCodes.size === firstColumnProductOptions.length &&
    firstColumnProductOptions.every((o) =>
      selectedProductCodes.has(o.value),
    );

  const noProductsSelected = selectedProductCodes.size === 0;

  const allStatusesSelected =
    statusFilterOptions.length > 0 &&
    selectedStatusCodes.size === statusFilterOptions.length &&
    statusFilterOptions.every((o) => selectedStatusCodes.has(o.value));

  const noStatusesSelected = selectedStatusCodes.size === 0;

  const sheetFilterExplainerVisible =
    (firstColumnProductOptions.length > 0 &&
      !noProductsSelected &&
      !allProductsSelected) ||
    (statusFilterOptions.length > 0 &&
      !noStatusesSelected &&
      !allStatusesSelected);

  const visibleProductCodesForGrid = React.useMemo(() => {
    if (allProductsSelected) return undefined;
    if (noProductsSelected) return [] as const;
    return Array.from(selectedProductCodes);
  }, [allProductsSelected, noProductsSelected, selectedProductCodes]);

  const visibleStatusCodesForGrid = React.useMemo(() => {
    if (allStatusesSelected) return undefined;
    if (noStatusesSelected) return [] as const;
    return Array.from(selectedStatusCodes);
  }, [allStatusesSelected, noStatusesSelected, selectedStatusCodes]);

  /** 그리드에 넘길 때 매 렌더 새 배열을 만들면 `SalesReservationSheetGrid`의 header memo가 매번 깨져, 실시간 동기화 시 점점 무거워질 수 있음 */
  const productHeaderSelectedCodesArr = React.useMemo(
    () => Array.from(selectedProductCodes).sort((a, b) => a.localeCompare(b, 'ko')),
    [selectedProductCodes],
  );
  const statusHeaderSelectedCodesArr = React.useMemo(
    () => Array.from(selectedStatusCodes).sort((a, b) => a.localeCompare(b, 'ko')),
    [selectedStatusCodes],
  );

  React.useEffect(() => {
    void auth.getCurrentUser().then(setUser);
  }, []);

  return (
    <AppLayout user={user}>
      <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex shrink-0 flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between gap-2 md:items-start">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight">
                판매예약
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                스프레드시트처럼 바로 입력할 수 있으며, 셀 확정 시 저장되고 변경 내용은
                다른 사용자 화면에 즉시 반영됩니다.
              </p>
              {sheetFilterExplainerVisible ? (
                <p className="text-sm text-amber-700 dark:text-amber-500/90 mt-2">
                  표 상단의 상품·상태 필터로 일부만 고르면, 조건에 맞지 않는 행은 화면에서
                  숨겨집니다. 데이터가 삭제된 것이 아니라, 필터에서 전체를 선택하면 다시
                  보입니다. 필터를 쓰면 왼쪽 번호는 1부터 다시 매겨지며, 셀에 마우스를 올리면
                  실제 행 번호(저장·토스트 기준)를 확인할 수 있습니다.
                </p>
              ) : null}
            </div>
            {user ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => sheetGridRef.current?.exportExcel()}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden />
                  엑셀 다운로드
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => sheetGridRef.current?.openExcelImportPicker()}
                >
                  <FileUp className="mr-2 h-4 w-4" aria-hidden />
                  엑셀로 복구
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SalesReservationSheetGridWithColumnSettings
          ref={sheetGridRef}
          firstColumnProductOptions={firstColumnProductOptions}
          firstColumnProductOptionsLoading={productOptionsLoading}
          blOptionsByProductCode={emptyBlOptionsByKey}
          salesGradeOptionsByProductCode={salesGradeOptionsByProductCode}
          foreignCellLocks={foreignCellLocks}
          onBeforeEdit={onBeforeEdit}
          onAfterEdit={onAfterEdit}
          onEditingCellChange={setEditingCell}
          onPersistRow={handlePersistRow}
          remoteCells={remoteCells}
          remoteVersion={remoteVersion}
          visibleProductCodes={visibleProductCodesForGrid}
          visibleStatusCodes={visibleStatusCodesForGrid}
          productHeaderFilterOptions={firstColumnProductOptions}
          productHeaderSelectedCodes={productHeaderSelectedCodesArr}
          onProductHeaderFilterChange={(codes) =>
            setSelectedProductCodes(new Set(codes))
          }
          statusHeaderFilterOptions={statusFilterOptions}
          statusHeaderSelectedCodes={statusHeaderSelectedCodesArr}
          onStatusHeaderFilterChange={(codes) =>
            setSelectedStatusCodes(new Set(codes))
          }
        />
        </div>
      </div>
    </AppLayout>
  );
}
