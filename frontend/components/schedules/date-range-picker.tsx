'use client';

import * as React from 'react';
import { DateRangePicker as RDRDateRangePicker, RangeKeyDict, defaultStaticRanges, defaultInputRanges, createStaticRanges } from 'react-date-range';
import { ko } from 'date-fns/locale';
import { format, startOfToday, endOfToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths, isSameDay, differenceInCalendarDays } from 'date-fns';
import { Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

interface DateRangePickerProps {
  startDate?: Date;
  endDate?: Date;
  onChange: (startDate: Date | undefined, endDate: Date | undefined) => void;
  className?: string;
  /** 날짜 미선택 시 버튼에 표시할 문구 (기본: 기간 선택) */
  placeholder?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  className,
  placeholder = '기간 선택',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState({
    startDate: startDate || new Date(),
    endDate: endDate || new Date(),
    key: 'selection',
  });

  React.useEffect(() => {
    if (startDate || endDate) {
      setDateRange({
        startDate: startDate || new Date(),
        endDate: endDate || new Date(),
        key: 'selection',
      });
    }
  }, [startDate, endDate]);

  const handleSelect = (ranges: RangeKeyDict) => {
    const selection = ranges.selection;
    if (selection.startDate && selection.endDate) {
      const newRange = {
        startDate: selection.startDate,
        endDate: selection.endDate,
        key: 'selection',
      };
      setDateRange(newRange);
      // preset range를 선택하면 즉시 적용
      onChange(selection.startDate, selection.endDate);
    }
  };

  const displayText = React.useMemo(() => {
    if (startDate && endDate) {
      return `${format(startDate, 'yyyy-MM-dd', { locale: ko })} ~ ${format(endDate, 'yyyy-MM-dd', { locale: ko })}`;
    }
    return placeholder;
  }, [startDate, endDate, placeholder]);

  // 한국어로 static ranges 정의
  const staticRanges = createStaticRanges([
    {
      label: '오늘',
      range: () => ({
        startDate: startOfToday(),
        endDate: endOfToday(),
      }),
    },
    {
      label: '어제',
      range: () => ({
        startDate: subDays(startOfToday(), 1),
        endDate: subDays(endOfToday(), 1),
      }),
    },
    {
      label: '이번 주',
      range: () => ({
        startDate: startOfWeek(new Date(), { locale: ko }),
        endDate: endOfWeek(new Date(), { locale: ko }),
      }),
    },
    {
      label: '지난 주',
      range: () => {
        const lastWeek = subWeeks(new Date(), 1);
        return {
          startDate: startOfWeek(lastWeek, { locale: ko }),
          endDate: endOfWeek(lastWeek, { locale: ko }),
        };
      },
    },
    {
      label: '이번 달',
      range: () => ({
        startDate: startOfMonth(new Date()),
        endDate: endOfMonth(new Date()),
      }),
    },
    {
      label: '지난 달',
      range: () => {
        const lastMonth = subMonths(new Date(), 1);
        return {
          startDate: startOfMonth(lastMonth),
          endDate: endOfMonth(lastMonth),
        };
      },
    },
  ]);

  // 한국어로 input ranges 정의
  const inputRanges = [
    {
      label: '오늘까지 N일',
      range: (value: number) => {
        const days = Math.max(value, 1);
        return {
          startDate: subDays(startOfToday(), days - 1),
          endDate: endOfToday(),
        };
      },
      getCurrentValue: (range: { startDate?: Date; endDate?: Date }) => {
        if (!range.endDate || !isSameDay(range.endDate, endOfToday())) return '-';
        if (!range.startDate) return '∞';
        return String(differenceInCalendarDays(endOfToday(), range.startDate) + 1);
      },
    },
    {
      label: '오늘부터 N일',
      range: (value: number) => {
        const days = Math.max(value, 1);
        return {
          startDate: startOfToday(),
          endDate: subDays(endOfToday(), -(days - 1)),
        };
      },
      getCurrentValue: (range: { startDate?: Date; endDate?: Date }) => {
        if (!range.startDate || !isSameDay(range.startDate, startOfToday())) return '-';
        if (!range.endDate) return '∞';
        return String(differenceInCalendarDays(range.endDate, startOfToday()) + 1);
      },
    },
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <div className="relative w-[260px]">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-full justify-start text-left font-normal pr-9 h-8 text-sm',
              !startDate && !endDate && 'text-muted-foreground',
              className
            )}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {displayText}
          </Button>
        </PopoverTrigger>
        {startDate && endDate && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(undefined, undefined);
              setDateRange({
                startDate: new Date(),
                endDate: new Date(),
                key: 'selection',
              });
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start" side="right">
        <RDRDateRangePicker
          ranges={[dateRange]}
          onChange={handleSelect}
          locale={ko}
          showDateDisplay={true}
          showMonthAndYearPickers={true}
          staticRanges={staticRanges}
          inputRanges={inputRanges}
          direction="horizontal"
        />
      </PopoverContent>
    </Popover>
  );
}

