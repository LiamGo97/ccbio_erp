'use client';

import * as React from 'react';
// @ts-expect-error no types for react-month-picker
import Picker from 'react-month-picker';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import './month-picker.css';

export type MonthPickerValue = { year: number; month: number };

interface MonthPickerProps {
  /** 값 형식: "yyyy-MM" (예: "2025-04") 또는 빈 문자열 */
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function parseValue(str: string | undefined): MonthPickerValue | undefined {
  if (!str || !str.trim()) return undefined;
  const t = str.trim();
  // yyyy-MM
  let match = t.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  // MM/dd or MM/yyyy -> 해당 월만 사용 (년은 현재년)
  match = t.match(/^(\d{1,2})\/(\d{1,4})$/);
  if (match) {
    const month = parseInt(match[1], 10);
    if (month >= 1 && month <= 12) {
      const second = parseInt(match[2], 10);
      const year = second >= 1900 && second <= 2100 ? second : new Date().getFullYear();
      return { year, month };
    }
  }
  return undefined;
}

function formatValue(ym: MonthPickerValue | undefined): string | undefined {
  if (!ym) return undefined;
  const m = String(ym.month).padStart(2, '0');
  return `${ym.year}-${m}`;
}

const KOREAN_MONTHS = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];

export function MonthPicker({
  value,
  onChange,
  placeholder = '년/월 선택',
  className,
  disabled = false,
}: MonthPickerProps) {
  const pickerRef = React.useRef<{ show: () => void; dismiss: () => void }>(null);
  const justSelectedRef = React.useRef(false);
  const pickerValue = React.useMemo(() => parseValue(value) ?? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }, [value]);

  const handleMonthChange = React.useCallback(
    (year: number, month: number) => {
      justSelectedRef.current = true;
      onChange(formatValue({ year, month }));
      setTimeout(() => pickerRef.current?.dismiss(), 0);
    },
    [onChange]
  );

  const handleDismiss = React.useCallback(
    (val: MonthPickerValue | MonthPickerValue[] | { from: MonthPickerValue; to: MonthPickerValue } | null) => {
      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }
      if (val == null) {
        onChange(undefined);
        return;
      }
      const single: MonthPickerValue | undefined = Array.isArray(val)
        ? val[0]
        : 'from' in val && val.from
          ? val.from
          : 'year' in val && 'month' in val
            ? (val as MonthPickerValue)
            : undefined;
      if (single && single.year >= 1900 && single.year <= 2100 && single.month >= 1 && single.month <= 12) {
        onChange(formatValue(single));
      } else if (!single) {
        onChange(undefined);
      }
    },
    [onChange]
  );

  const displayText = React.useMemo(() => {
    const ym = parseValue(value);
    if (ym) return formatValue(ym) ?? placeholder;
    return placeholder;
  }, [value, placeholder]);

  return (
    <div className={cn('relative w-full', className)}>
      <Picker
        ref={pickerRef}
        value={pickerValue}
        onChange={handleMonthChange}
        onDismiss={handleDismiss}
        years={{ min: 2020, max: new Date().getFullYear() + 2 }}
        lang={KOREAN_MONTHS}
        theme="light"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal pr-9',
            !value && 'text-muted-foreground'
          )}
          onClick={() => pickerRef.current?.show()}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {displayText}
        </Button>
      </Picker>
      {value && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(undefined);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
