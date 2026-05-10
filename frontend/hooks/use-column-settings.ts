'use client';

import * as React from 'react';
import Cookies from 'js-cookie';

function loadFromCookie<T>(key: string, parse: (s: string) => T | null): T | null {
  if (typeof window === 'undefined') return null;
  const saved = Cookies.get(key);
  if (!saved) return null;
  try {
    return parse(saved);
  } catch {
    return null;
  }
}

/** 페이지별 컬럼 설정(표시/숨김, 너비, 순서)을 쿠키로 관리하는 훅 */
export function useColumnSettings(cookieKeyPrefix: string) {
  const [visibleColumns, setVisibleColumns] = React.useState<string[] | undefined>(undefined);
  const [columnSizing, setColumnSizing] = React.useState<Record<string, number>>({});
  const [columnOrder, setColumnOrder] = React.useState<string[] | undefined>(undefined);

  // SSR 시 useState 초기화에서 window/cookie 접근 불가 → 마운트 후 useEffect에서 로드
  React.useEffect(() => {
    const visible = loadFromCookie(`${cookieKeyPrefix}-visible-columns`, (s) => {
      const parsed = JSON.parse(s) as string[];
      if (!Array.isArray(parsed)) return null;
      return parsed.length === 0 ? null : parsed;
    });
    if (visible) setVisibleColumns(visible);

    const sizing = loadFromCookie(`${cookieKeyPrefix}-column-sizes`, (s) => {
      const parsed = JSON.parse(s) as Record<string, number>;
      if (!parsed || typeof parsed !== 'object') return null;
      const valid: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && v > 0) valid[k] = v;
      }
      return Object.keys(valid).length > 0 ? valid : null;
    });
    if (sizing) setColumnSizing(sizing);

    const order = loadFromCookie(`${cookieKeyPrefix}-column-order`, (s) => {
      const parsed = JSON.parse(s) as string[];
      if (!Array.isArray(parsed)) return null;
      return parsed.length === 0 ? null : parsed;
    });
    if (order) setColumnOrder(order);
  }, [cookieKeyPrefix]);

  const columnSizingSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVisibleColumnsChange = React.useCallback(
    (cols: string[]) => {
      setVisibleColumns(cols);
      Cookies.set(`${cookieKeyPrefix}-visible-columns`, JSON.stringify(cols), { expires: 30 });
    },
    [cookieKeyPrefix]
  );

  const handleColumnSizingChange = React.useCallback(
    (sizing: Record<string, number>) => {
      setColumnSizing(sizing);
      if (columnSizingSaveRef.current) clearTimeout(columnSizingSaveRef.current);
      columnSizingSaveRef.current = setTimeout(() => {
        Cookies.set(`${cookieKeyPrefix}-column-sizes`, JSON.stringify(sizing), { expires: 30 });
        columnSizingSaveRef.current = null;
      }, 300);
    },
    [cookieKeyPrefix]
  );

  const handleColumnOrderChange = React.useCallback(
    (order: string[]) => {
      setColumnOrder(order);
      Cookies.set(`${cookieKeyPrefix}-column-order`, JSON.stringify(order), { expires: 30 });
    },
    [cookieKeyPrefix]
  );

  React.useEffect(
    () => () => {
      if (columnSizingSaveRef.current) clearTimeout(columnSizingSaveRef.current);
    },
    []
  );

  return {
    visibleColumns,
    onVisibleColumnsChange: handleVisibleColumnsChange,
    columnSizing,
    onColumnSizingChange: handleColumnSizingChange,
    columnOrder,
    onColumnOrderChange: handleColumnOrderChange,
  };
}
