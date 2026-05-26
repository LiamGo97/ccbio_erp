'use client';

import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  SortingState,
  ColumnFiltersState,
  RowSelectionState,
  OnChangeFn,
  useReactTable,
  functionalUpdate,
  type Header,
  type RowData,
  type PaginationState,
  type Table as TanstackTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, ArrowUpDown, ArrowUp, ArrowDown, Settings2, GripVertical } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import Cookies from 'js-cookie';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** 컬럼 설정 패널 표시용. `header`가 렌더 함수일 때는 `meta.headerLabel` 사용 */
function getColumnSettingsLabel<TData extends RowData, TValue>(
  column: ColumnDef<TData, TValue>,
  colId: string,
): string {
  const meta = column.meta as { headerLabel?: string } | undefined;
  if (meta?.headerLabel) return meta.headerLabel;
  if (typeof column.header === 'string') return column.header;
  if (typeof column.header === 'function') return colId;
  return colId;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filterControls?: React.ReactNode;
  filterTabs?: Array<{ label: string; value: string; count?: number }>;
  activeFilter?: string;
  onFilterChange?: (value: string) => void;
  customFilters?: React.ReactNode;
  pageSize?: number;
  page?: number;
  total?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  manualPagination?: boolean;
  enableSorting?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  isLoading?: boolean;
  // 컬럼 표시/숨김 설정
  visibleColumns?: string[];
  onVisibleColumnsChange?: (columns: string[]) => void;
  stickyGroupKey?: string;
  stickyGroupRenderer?: (row: TData) => React.ReactNode;
  onRowClick?: (row: TData) => void;
  /** 이 컬럼 ID들에서는 셀 클릭 시 onRowClick 호출 안 함 (셀 내부 링크/버튼용) */
  noRowClickColumnIds?: string[];
  /**
   * 중첩 테이블·다줄 셀용 — 이 컬럼은 tbody 셀에 `[&>*]:truncate` 래퍼를 쓰지 않음
   * (상품 정보/거래명세서 항목 등: 행 클릭·텍스트 드래그 선택과 레이아웃 유지)
   */
  skipTruncateColumnIds?: string[];
  rowClassName?: string;
  /** 행별 추가 className (행 데이터 기반) */
  getRowClassName?: (row: TData) => string | undefined;
  /** 이 컬럼 ID들의 셀에는 행의 text-decoration(예: 취소선)이 적용되지 않음 */
  excludeRowDecorationColumnIds?: string[];
  showRowNumber?: boolean;
  rowNumberWidth?: number;
  /** No 컬럼: asc = (페이지-1)*pageSize+행번호(1부터). desc = total 기준 역순(서버 total과 현재 표시 행이 일치할 때만 의미 있음) */
  rowNumberOrder?: 'asc' | 'desc';
  pageSizeCookieKey?: string; // 페이지당 행수 쿠키 키 (기본값: 'data-table-page-size')
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowId?: (row: TData, index: number) => string;
  headerRightContent?: React.ReactNode;
  /** tbody 셀에 적용할 className (행 세로 높이 조정용, 예: py-2.5) */
  bodyCellClassName?: string;
  /** 컬럼 가로 리사이즈 활성화 (기본: true) */
  enableColumnResizing?: boolean;
  /** 컬럼 설정 버튼을 아이콘만 표시 (기본: false, true면 필터 바에 아이콘만) */
  columnSettingsIconOnly?: boolean;
  /** 컬럼 너비 (columnId -> px). 전달 시 쿠키 등으로 복원된 값 사용 */
  columnSizing?: Record<string, number>;
  /** 컬럼 너비 변경 시 호출 (저장용) */
  onColumnSizingChange?: (sizing: Record<string, number>) => void;
  /** 컬럼 순서 (columnId[]). 전달 시 드래그로 순서 변경 가능 */
  columnOrder?: string[];
  /** 컬럼 순서 변경 시 호출 */
  onColumnOrderChange?: (order: string[]) => void;
}

const resolveColumnId = <TData, TValue>(col: ColumnDef<TData, TValue>): string => {
  if (col.id) return col.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessorKey = (col as any).accessorKey;
  return accessorKey ? String(accessorKey) : '';
};

function getHeaderCommittedWidth<TData extends RowData>(
  header: Header<TData, unknown>,
): number {
  if (header.subHeaders.length) {
    return header.subHeaders.reduce(
      (sum, sub) => sum + getHeaderCommittedWidth(sub),
      0,
    );
  }
  return header.column.getSize();
}

/** 테이블(첫 열 왼쪽) 기준 leaf 컬럼의 왼쪽 에지까지 px — 리사이즈 가이드 위치용 */
function getDataColumnLeftEdgePx<TData extends RowData>(
  tbl: TanstackTable<TData>,
  columnId: string,
): number | null {
  const headers = tbl.getHeaderGroups()[0]?.headers;
  if (!headers) return null;
  let offset = 0;
  for (const h of headers) {
    if (h.column.id === columnId) return offset;
    offset += getHeaderCommittedWidth(h);
  }
  return null;
}

function ColumnSettingsList<TData, TValue>({
  columns,
  alwaysVisibleColumnIds,
  visibleColumns,
  onVisibleColumnsChange,
  columnOrder,
  onColumnOrderChange,
  resolveColumnId: resolveColumnIdFn,
}: {
  columns: ColumnDef<TData, TValue>[];
  alwaysVisibleColumnIds: string[];
  visibleColumns: string[] | undefined;
  onVisibleColumnsChange?: (columns: string[]) => void;
  columnOrder?: string[];
  onColumnOrderChange?: (order: string[]) => void;
  resolveColumnId: (col: ColumnDef<TData, TValue>) => string;
}) {
  const configurableColumns = columns.filter((c) => {
    const id = resolveColumnIdFn(c);
    if (id === 'select') return false;
    return !alwaysVisibleColumnIds.includes(id);
  });
  const defaultOrder = configurableColumns.map((c) => resolveColumnIdFn(c));
  const orderedIds =
    columnOrder && columnOrder.length > 0
      ? [
          ...columnOrder.filter((id) => configurableColumns.some((c) => resolveColumnIdFn(c) === id)),
          ...configurableColumns
            .map((c) => resolveColumnIdFn(c))
            .filter((id) => !columnOrder.includes(id)),
        ]
      : defaultOrder;
  const orderedColumns = orderedIds
    .map((id) => configurableColumns.find((c) => resolveColumnIdFn(c) === id))
    .filter((c): c is ColumnDef<TData, TValue> => !!c);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && onColumnOrderChange) {
      const oldIndex = orderedIds.indexOf(active.id as string);
      const newIndex = orderedIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        onColumnOrderChange(arrayMove(orderedIds, oldIndex, newIndex));
      }
    }
  };

  const listContent = orderedColumns.map((column) => {
    const colId = resolveColumnIdFn(column);
    const isVisible = !visibleColumns || visibleColumns.length === 0 || visibleColumns.includes(colId);
    if (onColumnOrderChange) {
      return (
        <SortableColumnItem
          key={colId}
          column={column}
          colId={colId}
          isVisible={isVisible}
          visibleColumns={visibleColumns}
          columns={columns}
          alwaysVisibleColumnIds={alwaysVisibleColumnIds}
          onVisibleColumnsChange={onVisibleColumnsChange}
          resolveColumnIdFn={resolveColumnIdFn}
        />
      );
    }
    const header = getColumnSettingsLabel(column, colId);
    return (
      <div
        key={colId}
        className="flex items-start space-x-2 p-1.5 rounded-sm hover:bg-accent cursor-pointer"
        onClick={() => {
          if (!onVisibleColumnsChange) return;
          const currentVisible =
            visibleColumns || columns.map((c) => resolveColumnIdFn(c)).filter((id) => !alwaysVisibleColumnIds.includes(id));
          if (isVisible) {
            onVisibleColumnsChange(currentVisible.filter((id) => id !== colId));
          } else {
            onVisibleColumnsChange([...currentVisible, colId]);
          }
        }}
      >
        <Checkbox
          checked={isVisible}
          onCheckedChange={(checked) => {
            if (!onVisibleColumnsChange) return;
            const currentVisible =
              visibleColumns || columns.map((c) => resolveColumnIdFn(c)).filter((id) => !alwaysVisibleColumnIds.includes(id));
            if (checked) {
              onVisibleColumnsChange([...currentVisible, colId]);
            } else {
              onVisibleColumnsChange(currentVisible.filter((id) => id !== colId));
            }
          }}
        />
        <Label className="text-sm font-normal cursor-pointer flex-1 leading-snug">{header}</Label>
      </div>
    );
  });

  return (
    <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto pr-2">
      {onColumnOrderChange ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            {listContent}
          </SortableContext>
        </DndContext>
      ) : (
        listContent
      )}
    </div>
  );
}

function SortableColumnItem<TData, TValue>({
  column,
  colId,
  isVisible,
  visibleColumns,
  columns,
  alwaysVisibleColumnIds,
  onVisibleColumnsChange,
  resolveColumnIdFn,
}: {
  column: ColumnDef<TData, TValue>;
  colId: string;
  isVisible: boolean;
  visibleColumns: string[] | undefined;
  columns: ColumnDef<TData, TValue>[];
  alwaysVisibleColumnIds: string[];
  onVisibleColumnsChange?: (columns: string[]) => void;
  resolveColumnIdFn: (col: ColumnDef<TData, TValue>) => string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: colId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const header = getColumnSettingsLabel(column, colId);
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 p-1.5 rounded-sm hover:bg-accent cursor-pointer',
        isDragging && 'opacity-50 bg-accent'
      )}
    >
      <div
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div
        className="flex items-center gap-2 flex-1 min-w-0"
        onClick={() => {
          if (!onVisibleColumnsChange) return;
          const currentVisible =
            visibleColumns ||
            columns.map((c) => resolveColumnIdFn(c)).filter((id) => !alwaysVisibleColumnIds.includes(id));
          if (isVisible) {
            onVisibleColumnsChange(currentVisible.filter((id) => id !== colId));
          } else {
            onVisibleColumnsChange([...currentVisible, colId]);
          }
        }}
      >
        <Checkbox
          checked={isVisible}
          onCheckedChange={(checked) => {
            if (!onVisibleColumnsChange) return;
            const currentVisible =
              visibleColumns ||
              columns.map((c) => resolveColumnIdFn(c)).filter((id) => !alwaysVisibleColumnIds.includes(id));
            if (checked) {
              onVisibleColumnsChange([...currentVisible, colId]);
            } else {
              onVisibleColumnsChange(currentVisible.filter((id) => id !== colId));
            }
          }}
        />
        <Label className="text-sm font-normal cursor-pointer flex-1 leading-snug truncate">{header}</Label>
      </div>
    </div>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchValue,
  onSearchChange,
  searchPlaceholder = '검색...',
  filterControls,
  filterTabs,
  activeFilter,
  onFilterChange,
  customFilters,
  pageSize: propPageSize = 10,
  page = 1,
  total = 0,
  totalPages = 0,
  onPageChange,
  onPageSizeChange,
  manualPagination = false,
  enableSorting = true,
  sortBy,
  sortOrder,
  onSortChange,
  isLoading = false,
  visibleColumns,
  onVisibleColumnsChange,
  stickyGroupKey,
  stickyGroupRenderer,
  onRowClick,
  noRowClickColumnIds,
  skipTruncateColumnIds,
  rowClassName,
  getRowClassName,
  excludeRowDecorationColumnIds,
  showRowNumber = true,
  rowNumberWidth = 56,
  rowNumberOrder = 'desc',
  pageSizeCookieKey = 'data-table-page-size',
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  headerRightContent,
  bodyCellClassName,
  enableColumnResizing = true,
  columnSettingsIconOnly = false,
  columnSizing: propColumnSizing,
  onColumnSizingChange: propOnColumnSizingChange,
  columnOrder: propColumnOrder,
  onColumnOrderChange: propOnColumnOrderChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  // 쿠키에서 페이지당 행수 읽기
  const getCookiePageSize = React.useCallback(() => {
    if (typeof window === 'undefined') return null;
    const saved = Cookies.get(pageSizeCookieKey);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) {
        return parsed;
      }
    }
    return null;
  }, [pageSizeCookieKey]);

  // 실제 사용할 pageSize: prop이 명시적으로 전달되면 prop 사용, 아니면 쿠키 값 사용
  const effectivePageSize = React.useMemo(() => {
    // prop이 기본값(10)이 아니거나, 명시적으로 전달된 경우 prop 사용
    // 하지만 초기 마운트 시에는 쿠키 값을 우선 확인
    const cookieValue = getCookiePageSize();
    if (cookieValue !== null && propPageSize === 10) {
      // prop이 기본값이고 쿠키에 값이 있으면 쿠키 값 사용
      return cookieValue;
    }
    return propPageSize;
  }, [propPageSize, getCookiePageSize]);

  // 초기 마운트 시 쿠키 값이 있으면 부모 컴포넌트에 알림
  React.useEffect(() => {
    const cookieValue = getCookiePageSize();
    if (cookieValue !== null && cookieValue !== propPageSize && propPageSize === 10) {
      // 쿠키 값이 있고 prop이 기본값이면 부모에게 알림
      onPageSizeChange?.(cookieValue);
    }
  }, []); // 초기 마운트 시만 실행

  // 페이지당 행수 변경 핸들러
  const pageSize = effectivePageSize;

  const [clientPage, setClientPage] = React.useState(page);
  const [clientPageSize, setClientPageSize] = React.useState(effectivePageSize);

  const usesExternalPageControl = manualPagination || onPageChange != null;
  const activePage = usesExternalPageControl ? page : clientPage;
  const activePageSize = usesExternalPageControl ? pageSize : clientPageSize;

  React.useEffect(() => {
    if (usesExternalPageControl) {
      setClientPage(page);
      setClientPageSize(pageSize);
    }
  }, [usesExternalPageControl, page, pageSize]);

  React.useEffect(() => {
    if (!usesExternalPageControl) {
      setClientPageSize(effectivePageSize);
    }
  }, [usesExternalPageControl, effectivePageSize]);

  const handlePageSizeChange = React.useCallback(
    (newPageSize: number) => {
      Cookies.set(pageSizeCookieKey, String(newPageSize), { expires: 365 });
      onPageSizeChange?.(newPageSize);
      if (!usesExternalPageControl) {
        setClientPageSize(newPageSize);
      }
      if (onPageChange) {
        onPageChange(1);
      } else {
        setClientPage(1);
      }
    },
    [pageSizeCookieKey, onPageSizeChange, onPageChange, usesExternalPageControl],
  );

  // 서버 사이드 정렬이 있으면 사용
  const serverSorting = sortBy && sortOrder ? [{ id: sortBy, desc: sortOrder === 'desc' }] : [];
  
  // 컬럼 ID 추출 헬퍼 함수
  // 컬럼 필터링: visibleColumns가 있으면 해당 컬럼만 표시 (actions 컬럼은 항상 포함)
  const alwaysVisibleColumnIds = React.useMemo(() => {
    const ids = ['actions'];
    if (showRowNumber) {
      ids.unshift('no');
    }
    return ids;
  }, [showRowNumber]);

  const rowNumberColumn = React.useMemo<ColumnDef<TData, TValue> | null>(() => {
    if (!showRowNumber) {
      return null;
    }
    return {
      id: 'no',
      header: 'No',
      size: rowNumberWidth,
      enableSorting: false,
      enableResizing: false,
      cell: ({ row }) => {
        const baseIndex = (activePage - 1) * activePageSize + row.index;
        let number: number;
        if (rowNumberOrder === 'asc') {
          number = baseIndex + 1;
        } else if (typeof total === 'number' && total > 0) {
          const descending = total - baseIndex;
          number = descending > 0 ? descending : 1;
        } else {
          number = baseIndex + 1;
        }
        return <div className="text-xs text-muted-foreground">{number}</div>;
      },
    };
  }, [showRowNumber, rowNumberWidth, rowNumberOrder, activePage, activePageSize, total]);

  const mergedColumns = React.useMemo(() => {
    if (!rowNumberColumn) {
      return columns;
    }
    return [rowNumberColumn, ...columns];
  }, [rowNumberColumn, columns]);

  const filteredColumns = React.useMemo(() => {
    const fixedStart: ColumnDef<TData, TValue>[] = [];
    const configurable: ColumnDef<TData, TValue>[] = [];
    const fixedEnd: ColumnDef<TData, TValue>[] = [];
    for (const col of mergedColumns) {
      const colId = resolveColumnId(col);
      if (colId === 'no') fixedStart.push(col);
      else if (colId === 'select') fixedStart.push(col);
      else if (alwaysVisibleColumnIds.includes(colId)) fixedEnd.push(col);
      else configurable.push(col);
    }
    const filteredConfigurable =
      !visibleColumns || visibleColumns.length === 0
        ? configurable
        : configurable.filter((c) => visibleColumns.includes(resolveColumnId(c)));
    const orderedConfigurable =
      !propColumnOrder || propColumnOrder.length === 0
        ? filteredConfigurable
        : [...filteredConfigurable].sort((a, b) => {
            const orderMap = new Map(propColumnOrder.map((id, i) => [id, i]));
            const ai = orderMap.get(resolveColumnId(a)) ?? 9999;
            const bi = orderMap.get(resolveColumnId(b)) ?? 9999;
            return ai - bi;
          });
    return [...fixedStart, ...orderedConfigurable, ...fixedEnd];
  }, [mergedColumns, visibleColumns, alwaysVisibleColumnIds, propColumnOrder]);

  // 액션/선택 컬럼은 리사이즈 비활성화
  const tableColumns = React.useMemo(() => {
    return filteredColumns.map(col => {
      const id = resolveColumnId(col);
      if (['actions', 'excludeAction', 'select'].includes(id)) {
        return { ...col, enableResizing: false };
      }
      return col;
    });
  }, [filteredColumns]);

  /** 판매예약 그리드와 동일: 드래그 중 열 너비는 고정, 세로 가이드만 DOM+rAF로 이동 */
  const columnSizingRef = React.useRef(propColumnSizing ?? {});
  React.useEffect(() => {
    columnSizingRef.current = propColumnSizing ?? {};
  }, [propColumnSizing]);

  const columnResizeGuideRef = React.useRef<HTMLDivElement | null>(null);
  /** sum: TanStack 너비 누적(테두리·패딩과 어긋날 수 있음). dom: th 실측 오른쪽 기준(권장) */
  const columnResizeSessionRef = React.useRef<{
    anchor: 'dom' | 'sum';
    startW: number;
    startRightInParent?: number;
    leftEdgePx?: number;
  } | null>(null);

  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId: getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    onSortingChange: (updater) => {
      if (manualPagination && onSortChange) {
        // 서버 사이드 정렬
        const newSorting = typeof updater === 'function' ? updater(serverSorting) : updater;
        if (newSorting.length > 0) {
          const sort = newSorting[0];
          onSortChange(sort.id, sort.desc ? 'desc' : 'asc');
        } else {
          // 정렬이 제거되려고 할 때, 현재 정렬 방향을 반대로 바꿈 (asc <-> desc만 순환)
          if (sortBy && sortOrder) {
            onSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc');
          } else {
            // 정렬이 없으면 기본 정렬
            onSortChange('createdAt', 'desc');
          }
        }
      } else {
        // 클라이언트 사이드 정렬
        setSorting(typeof updater === 'function' ? updater(sorting) : updater);
      }
    },
    getSortedRowModel: manualPagination ? undefined : getSortedRowModel(),
    enableSorting,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: manualPagination ? undefined : getFilteredRowModel(),
    enableRowSelection,
    onRowSelectionChange: onRowSelectionChange,
    // 내장 리사이즈 비활성화 → pointermove마다 columnSizingInfo 갱신으로 tbody 전체 리렌더 방지
    enableColumnResizing: false,
    manualPagination,
    pageCount: manualPagination ? totalPages : undefined,
    onPaginationChange: manualPagination
      ? undefined
      : (updater) => {
          const prev: PaginationState = {
            pageIndex: activePage - 1,
            pageSize: activePageSize,
          };
          const next = functionalUpdate(updater, prev);
          if (next.pageIndex !== prev.pageIndex) {
            const newPage = next.pageIndex + 1;
            if (onPageChange) {
              onPageChange(newPage);
            } else {
              setClientPage(newPage);
            }
          }
          if (next.pageSize !== prev.pageSize) {
            handlePageSizeChange(next.pageSize);
          }
        },
    initialState: {
      pagination: {
        pageSize: activePageSize,
        pageIndex: activePage - 1,
      },
      sorting: serverSorting,
      rowSelection: rowSelection || {},
      ...(propColumnSizing && Object.keys(propColumnSizing).length > 0 ? { columnSizing: propColumnSizing } : {}),
    },
    state: {
      sorting: manualPagination ? serverSorting : sorting,
      columnFilters,
      rowSelection: rowSelection || {},
      pagination: {
        pageIndex: activePage - 1,
        pageSize: activePageSize,
      },
      ...(propColumnSizing !== undefined ? { columnSizing: propColumnSizing } : {}),
    },
  });

  const tableRef = React.useRef(table);
  tableRef.current = table;

  const resolvedTotalPages = manualPagination ? totalPages || 1 : Math.max(table.getPageCount(), 1);
  const displayTotal = total > 0 ? total : data.length;
  const tableRows = manualPagination ? table.getRowModel().rows : table.getPaginationRowModel().rows;

  const goToPage = React.useCallback(
    (newPage: number) => {
      const clamped = Math.max(1, Math.min(newPage, resolvedTotalPages));
      if (onPageChange) {
        onPageChange(clamped);
      } else {
        setClientPage(clamped);
      }
    },
    [resolvedTotalPages, onPageChange],
  );

  const onColumnResizePointerDown = React.useCallback(
    (
      columnId: string,
      getStartWidth: () => number,
      minW: number,
      maxW: number,
    ) =>
      (e: React.PointerEvent) => {
        if (!propOnColumnSizingChange) return;
        if (e.button !== 0) return;
        const tbl = tableRef.current;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = getStartWidth();

        const guide = columnResizeGuideRef.current;
        const parentEl = guide?.offsetParent;
        const thEl = (e.currentTarget as HTMLElement | null)?.closest?.('th');
        let session: NonNullable<(typeof columnResizeSessionRef)['current']>;

        if (
          guide &&
          parentEl instanceof HTMLElement &&
          thEl instanceof HTMLTableCellElement
        ) {
          const pr = parentEl.getBoundingClientRect();
          const tr = thEl.getBoundingClientRect();
          session = {
            anchor: 'dom',
            startW,
            startRightInParent: tr.right - pr.left,
          };
        } else {
          const leftEdgePx = getDataColumnLeftEdgePx(tbl, columnId);
          if (leftEdgePx == null) return;
          session = { anchor: 'sum', startW, leftEdgePx };
        }
        columnResizeSessionRef.current = session;

        if (guide) {
          guide.style.visibility = 'visible';
          if (session.anchor === 'dom' && session.startRightInParent != null) {
            guide.style.left = `${session.startRightInParent - 1}px`;
          } else if (session.leftEdgePx != null) {
            guide.style.left = `${session.leftEdgePx + startW - 1}px`;
          }
        }

        let rafId: number | null = null;
        let pendingW: number | null = null;

        const flushGuideFrame = () => {
          rafId = null;
          const pw = pendingW;
          const g = columnResizeGuideRef.current;
          const sess = columnResizeSessionRef.current;
          if (g && sess != null && pw != null) {
            if (sess.anchor === 'dom' && sess.startRightInParent != null) {
              g.style.left = `${sess.startRightInParent + (pw - sess.startW) - 1}px`;
            } else if (sess.leftEdgePx != null) {
              g.style.left = `${sess.leftEdgePx + pw - 1}px`;
            }
          }
        };

        const onMove = (pe: PointerEvent) => {
          const dw = pe.clientX - startX;
          const next = Math.round(Math.min(maxW, Math.max(minW, startW + dw)));
          pendingW = next;
          if (rafId == null) {
            rafId = requestAnimationFrame(flushGuideFrame);
          }
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          if (rafId != null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          const finalW = pendingW != null ? pendingW : startW;
          pendingW = null;
          columnResizeSessionRef.current = null;
          const g = columnResizeGuideRef.current;
          if (g) {
            g.style.visibility = 'hidden';
          }
          propOnColumnSizingChange({
            ...columnSizingRef.current,
            [columnId]: finalW,
          });
        };

        pendingW = startW;
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      },
    [propOnColumnSizingChange],
  );

  const firstRow = table.getRowModel().rows[0]?.original;
  const stickyGroupContent =
    stickyGroupKey && stickyGroupRenderer && firstRow
      ? stickyGroupRenderer(firstRow)
      : null;

  const totalTableMinWidth = table.getHeaderGroups()[0]?.headers.reduce(
    (acc, h) =>
      acc +
      (enableColumnResizing
        ? getHeaderCommittedWidth(h)
        : Number((h.column.columnDef as { size?: number }).size) || 0),
    0,
  ) ?? 0;

  return (
    <Card className="overflow-hidden w-full max-w-full">
      <CardContent className="p-0 max-w-full">
        {/* 검색 및 필터 영역 */}
        {(searchKey || filterControls || onVisibleColumnsChange || (filterTabs && filterTabs.length > 0) || customFilters || headerRightContent) && (
          <div className="border-b border-border px-4 py-3 pt-0 flex-shrink-0">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {filterControls && (
                  <div className="min-w-0 flex-1">
                    {filterControls}
                  </div>
                )}
                {searchKey && (
                  <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      size="sm"
                      placeholder={searchPlaceholder}
                      value={searchValue ?? ''}
                      onChange={(e) => onSearchChange?.(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}
                {filterTabs && filterTabs.length > 0 && (
                  <div className="flex items-center gap-2">
                    {filterTabs.map((tab) => {
                      const isActive =
                        activeFilter !== undefined ? activeFilter === tab.value : false;
                      return (
                        <Button
                          key={tab.value}
                          type="button"
                          size="sm"
                          variant={isActive ? 'default' : 'outline'}
                          onClick={() => onFilterChange?.(tab.value)}
                          className="h-8"
                        >
                          <span>{tab.label}</span>
                          {typeof tab.count === 'number' && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({tab.count})
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {headerRightContent && (
                  <div className="flex-shrink-0">
                    {headerRightContent}
                  </div>
                )}
                {onVisibleColumnsChange && (
                  <div className="flex-shrink-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn(columnSettingsIconOnly && 'p-2')} title="컬럼 설정">
                          <Settings2 className="h-4 w-4" />
                          {!columnSettingsIconOnly && <span className="ml-2">컬럼 설정</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-5" align="end">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-semibold">표시할 컬럼</Label>
                            <div className="flex items-center gap-2">
                              {visibleColumns &&
                                visibleColumns.length <
                                  columns.filter((c) => {
                                    const id = resolveColumnId(c);
                                    if (id === 'select') return false;
                                    return !alwaysVisibleColumnIds.includes(id);
                                  }).length && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-3"
                                  onClick={() => {
                                    if (onVisibleColumnsChange) {
                                      onVisibleColumnsChange(
                                        columns
                                          .map((c) => resolveColumnId(c))
                                          .filter((id) => !alwaysVisibleColumnIds.includes(id) && id !== 'select'),
                                      );
                                    }
                                  }}
                                >
                                  모두 표시
                                </Button>
                              )}
                              {(onVisibleColumnsChange !== undefined || propOnColumnSizingChange !== undefined || propOnColumnOrderChange !== undefined) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-3 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    const allIds = columns
                                      .map((c) => resolveColumnId(c))
                                      .filter((id) => !alwaysVisibleColumnIds.includes(id) && id !== 'select');
                                    if (onVisibleColumnsChange) onVisibleColumnsChange(allIds);
                                    if (propOnColumnSizingChange) propOnColumnSizingChange({});
                                    if (propOnColumnOrderChange) propOnColumnOrderChange(allIds);
                                  }}
                                >
                                  초기화
                                </Button>
                              )}
                            </div>
                          </div>
                          <ColumnSettingsList
                            columns={columns}
                            alwaysVisibleColumnIds={alwaysVisibleColumnIds}
                            visibleColumns={visibleColumns}
                            onVisibleColumnsChange={onVisibleColumnsChange}
                            columnOrder={propColumnOrder}
                            onColumnOrderChange={propOnColumnOrderChange}
                            resolveColumnId={resolveColumnId}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    </div>
                  )}
              </div>
              </div>
              {customFilters && (
                <div className="flex items-center gap-2 flex-wrap">
                  {customFilters}
                </div>
              )}
            </div>
          </div>
        )}

        {stickyGroupContent && (
          <div className="border-b border-border bg-muted/30 px-4 py-3 text-sm sticky top-0 z-30">
            {stickyGroupContent}
          </div>
        )}

        {/* 테이블 영역 - 행 클릭은 mousedown(capture)로 처리. 버튼/링크/input 등은 행 클릭·preventDefault 하지 않음 */}
        <div
          className={cn(
            'overflow-x-auto overflow-y-auto max-h-[70vh]',
            stickyGroupContent && 'pt-0'
          )}
          onMouseDownCapture={(e) => {
            if (!onRowClick || e.target === null) return;
            const t = e.target as HTMLElement;
            // 중첩 테이블(예: 상품정보 내부 테이블) 클릭 시 메인 테이블의 td/tr을 찾기 위해 data-column-id, data-row-index 사용
            const td = t.closest?.('[data-column-id]') ?? t.closest?.('td');
            const colId = td?.getAttribute?.('data-column-id');
            if (colId && noRowClickColumnIds?.includes(colId)) return;
            // 셀 안의 버튼/링크/input 등 클릭 시에는 행 클릭 처리하지 않음 (액션 버튼 클릭이 동작하도록)
            const interactive = td && (t === td ? false : (() => { let el: HTMLElement | null = t; while (el && el !== td) { const tag = el.tagName?.toLowerCase(); const role = el.getAttribute?.('role'); if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || role === 'button' || el.getAttribute?.('contenteditable') === 'true') return true; el = el.parentElement; } return false; })());
            if (interactive) return;
            // 중첩 테이블 내부 tr이 아닌, 메인 테이블 행(data-row-index 있음)을 찾음
            let tr: HTMLElement | null = null;
            let el: HTMLElement | null = t;
            while (el) {
              if (el.tagName === 'TR' && el.getAttribute('data-row-index') != null) {
                tr = el;
                break;
              }
              el = el.parentElement;
            }
            if (!tr) return;
            const idxStr = tr.getAttribute('data-row-index');
            if (idxStr == null) return;
            const idx = parseInt(idxStr, 10);
            if (Number.isNaN(idx)) return;
            const row = tableRows[idx];
            const rowData = row?.original;
            if (rowData == null) return;
            const sel = typeof window !== 'undefined' ? window.getSelection() : null;
            const hasSelection = !!sel?.toString().length;
            const selectionInThisRow = hasSelection && sel?.anchorNode && tr.contains(sel.anchorNode);
            if (selectionInThisRow) return;
            e.stopPropagation();
            e.preventDefault();
            onRowClick(rowData);
          }}
        >
          <div className="relative inline-block min-w-full">
            {enableColumnResizing && propOnColumnSizingChange ? (
              <div
                ref={columnResizeGuideRef}
                className="pointer-events-none absolute top-0 bottom-0 z-[38] w-0.5 bg-primary shadow-[0_0_0_1px_hsl(var(--primary))]"
                style={{ left: 0, visibility: 'hidden' }}
                aria-hidden
              />
            ) : null}
          <Table
            className={totalTableMinWidth ? undefined : 'min-w-full'}
            style={totalTableMinWidth ? { minWidth: `${totalTableMinWidth}px`, tableLayout: 'fixed' } : undefined}
          >
            <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="hover:bg-transparent border-b border-border bg-background"
                >
                  {headerGroup.headers.map((header, index) => {
                    const canSort = enableSorting && header.column.getCanSort();
                    const isSorted = header.column.getIsSorted();
                    const isActionsColumn = header.id === 'actions';
                    const isNoColumn = header.id === 'no' || header.id === 'rowNo';
                    const isFirstColumn = index === 0;
                    const isLastColumn = index === headerGroup.headers.length - 1;
                    const nextHeader = headerGroup.headers[index + 1];
                    /** 구글 시트처럼 경계 중심 히트 — 다음 열이 actions면 오른쪽으로 넘기지 않음 */
                    const resizeStraddleNextColumn =
                      enableColumnResizing &&
                      !!nextHeader &&
                      nextHeader.id !== 'actions';
                    return (
                      <TableHead 
                        key={header.id}
                        className={cn(
                          "bg-muted relative overflow-visible",
                          isFirstColumn && "pl-4",
                          isLastColumn && "pr-4",
                          isNoColumn && "sticky left-0 bg-muted",
                          isActionsColumn && "text-right sticky right-0 bg-muted"
                        )}
                        style={{
                          width: enableColumnResizing
                            ? `${header.getSize()}px`
                            : (header.column.columnDef as { size?: number }).size
                              ? `${(header.column.columnDef as { size?: number }).size}px`
                              : 'auto',
                          minWidth: enableColumnResizing
                            ? `${header.getSize()}px`
                            : (header.column.columnDef as { size?: number }).size
                              ? `${(header.column.columnDef as { size?: number }).size}px`
                              : undefined,
                          ...(isNoColumn && { position: 'sticky', left: 0, zIndex: 50 }),
                          ...(isActionsColumn && { position: 'sticky', right: 0, zIndex: 50 }),
                          ...(!isNoColumn && !isActionsColumn
                            ? {
                                zIndex: headerGroup.headers.length - index,
                              }
                            : {}),
                        }}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={cn(
                              'relative z-0 flex min-w-0 items-center gap-2',
                              isActionsColumn && 'justify-end',
                            )}
                          >
                            {canSort ? (
                              <button
                                className="flex items-center gap-2 hover:text-foreground transition-colors"
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                                {isSorted === 'asc' ? (
                                  <ArrowUp className="h-3 w-3" />
                                ) : isSorted === 'desc' ? (
                                  <ArrowDown className="h-3 w-3" />
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 opacity-50" />
                                )}
                              </button>
                            ) : (
                              flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )
                            )}
                          </div>
                        )}
                        {header.isPlaceholder
                          ? null
                          : enableColumnResizing &&
                            propOnColumnSizingChange &&
                            header.column.columnDef.enableResizing !== false &&
                            !isNoColumn &&
                            !isActionsColumn && (
                              <div
                                role="separator"
                                aria-orientation="vertical"
                                aria-hidden
                                onPointerDown={onColumnResizePointerDown(
                                  header.column.id,
                                  () => header.column.getSize(),
                                  header.column.columnDef.minSize ?? 20,
                                  header.column.columnDef.maxSize ??
                                    Number.MAX_SAFE_INTEGER,
                                )}
                                className={cn(
                                  'pointer-events-auto absolute right-0 top-0 bottom-0 z-[60] w-2 cursor-col-resize touch-none select-none bg-transparent',
                                  'hover:bg-primary/15 active:bg-primary/25',
                                  resizeStraddleNextColumn && 'translate-x-1/2',
                                )}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={mergedColumns.length}
                    className="h-32 text-center text-muted-foreground"
                  >
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : tableRows?.length ? (
                tableRows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  data-row-index={row.index}
                  className={cn(
                    'group border-b transition-colors',
                    rowClassName,
                    getRowClassName?.(row.original),
                    onRowClick && 'hover:bg-muted cursor-pointer',
                  )}
                    data-group-key={
                      stickyGroupKey
                        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          ((row.original as any)?.[stickyGroupKey] as string | undefined) ?? undefined
                        : undefined
                    }
                    onClick={undefined}
                    role={onRowClick ? 'button' : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => {
                      const isActionsCell = cell.column.id === 'actions';
                      const isNoRowClickCell = noRowClickColumnIds?.includes(cell.column.id);
                      const isNoCell = cell.column.id === 'no' || cell.column.id === 'rowNo';
                      const isExcludeActionCell = cell.column.id === 'excludeAction';
                      const isSelectCell = cell.column.id === 'select';
                      const excludeDecoration = excludeRowDecorationColumnIds?.includes(cell.column.id);
                      const shouldTruncate =
                        !isActionsCell &&
                        !isNoCell &&
                        !isExcludeActionCell &&
                        !isSelectCell &&
                        !skipTruncateColumnIds?.includes(cell.column.id);
                      const isFirstCell = cellIndex === 0;
                      const isLastCell = cellIndex === row.getVisibleCells().length - 1;
                      const handleCellClick = (event: React.MouseEvent<HTMLTableCellElement>) => {
                        if (isActionsCell || isNoRowClickCell) {
                          event.stopPropagation();
                          return;
                        }
                      };
                      return (
                        <TableCell 
                          key={cell.id}
                          data-column-id={cell.column.id}
                          className={cn(
                            bodyCellClassName,
                            isFirstCell && "pl-4",
                            isLastCell && "pr-4",
                            isNoCell && "sticky left-0 z-10 bg-background group-hover:bg-muted",
                            isActionsCell && "text-right sticky right-0 z-10 bg-background group-hover:bg-muted",
                            excludeDecoration && "[text-decoration:none] [&_*]:[text-decoration:none]"
                          )}
                          style={{
                            width: enableColumnResizing
                              ? `${cell.column.getSize()}px`
                              : (cell.column.columnDef as { size?: number }).size
                                ? `${(cell.column.columnDef as { size?: number }).size}px`
                                : 'auto',
                            minWidth: enableColumnResizing
                              ? `${cell.column.getSize()}px`
                              : (cell.column.columnDef as { size?: number }).size
                                ? `${(cell.column.columnDef as { size?: number }).size}px`
                                : undefined,
                            ...(isNoCell && { position: 'sticky', left: 0, zIndex: 10 }),
                            ...(isActionsCell && { position: 'sticky', right: 0, zIndex: 10 }),
                          }}
                          onClick={
                            isActionsCell 
                              ? (e: React.MouseEvent<HTMLTableCellElement>) => e.stopPropagation() 
                              : onRowClick 
                                ? handleCellClick
                                : undefined
                          }
                        >
                          {shouldTruncate ? (
                            <div className="min-w-0 overflow-hidden [&>*]:truncate">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </div>
                          ) : (
                            flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )
                          )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={mergedColumns.length}
                    className="h-32 text-center text-muted-foreground"
                  >
                    결과가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </div>

        {/* 페이지네이션 영역 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-2 pb-0 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>페이지당 행 수:</span>
            <Select
              value={`${activePageSize}`}
              onValueChange={(value) => {
                const newPageSize = Number(value);
                handlePageSizeChange(newPageSize);
              }}
            >
              <SelectTrigger size="sm" className="w-[70px]">
                <SelectValue placeholder={activePageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 50, 100].map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-4">
              총 {displayTotal}개 중{' '}
              {displayTotal > 0 ? (activePage - 1) * activePageSize + 1 : 0}-
              {Math.min(activePage * activePageSize, displayTotal)}{' '}
              개 표시
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(1)}
                disabled={activePage <= 1}
                className="h-8 w-8 p-0"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(activePage - 1)}
                disabled={activePage <= 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 px-2">
                <span className="text-sm font-medium">
                  {activePage} / {resolvedTotalPages}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(activePage + 1)}
                disabled={activePage >= resolvedTotalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(resolvedTotalPages)}
                disabled={activePage >= resolvedTotalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

