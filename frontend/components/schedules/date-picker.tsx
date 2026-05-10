'use client';

import * as React from 'react';
import { Calendar as RDRCalendar } from 'react-date-range';
import { ko } from 'date-fns/locale';
import { format, parse, isValid } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

interface DatePickerFooterHelpers {
  select: (date: Date, options?: { close?: boolean }) => void;
  close: () => void;
}

interface DatePickerProps {
  value?: string; // ISO 형식("yyyy-MM-dd") 문자열
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  footer?: (helpers: DatePickerFooterHelpers) => React.ReactNode;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = '날짜 선택',
  className,
  footer,
  disabled = false,
}: DatePickerProps) {
  const parseInputValue = React.useCallback((text?: string | null) => {
    if (!text) {
      return undefined;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return undefined;
    }

    const formats = ['yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy', 'MM/dd'];
    for (const fmt of formats) {
      try {
        const parsed =
          fmt === 'MM/dd'
            ? (() => {
                const tentative = parse(trimmed, fmt, new Date());
                if (!isValid(tentative)) {
                  return null;
                }
                return tentative;
              })()
            : parse(trimmed, fmt, new Date());
        if (parsed && isValid(parsed)) {
          return parsed;
        }
      } catch {
        // ignore and try next format
      }
    }

    const fallback = new Date(trimmed);
    return isValid(fallback) ? fallback : undefined;
  }, []);

  const [isOpen, setIsOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>(() => {
    return parseInputValue(value);
  });

  React.useEffect(() => {
    if (!value) {
      setDate(undefined);
      return;
    }
    const parsed = parseInputValue(value);
    if (parsed) {
      setDate(parsed);
    } else {
      setDate(undefined);
    }
  }, [parseInputValue, value]);

  const applyDate = React.useCallback(
    (selectedDate: Date, shouldClose = true) => {
      setDate(selectedDate);
      const formatted = format(selectedDate, 'yyyy-MM-dd');
      onChange(formatted);
      if (shouldClose) {
        setIsOpen(false);
      }
    },
    [onChange],
  );

  const handleSelect = (selectedDate: Date) => {
    setDate(selectedDate);
    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    onChange(formattedDate);
    setIsOpen(false);
  };

  const displayText = React.useMemo(() => {
    if (value) {
      const parsed = parseInputValue(value);
      if (parsed) {
        return format(parsed, 'yyyy-MM-dd');
      }
      return value;
    }
    return placeholder;
  }, [parseInputValue, placeholder, value]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <div className="relative w-full">
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal pr-9',
              !value && 'text-muted-foreground',
              className
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayText}
          </Button>
        </PopoverTrigger>
        {value && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(undefined);
              setDate(undefined);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <RDRCalendar
          date={date || new Date()}
          onChange={handleSelect}
          locale={ko}
          showDateDisplay={false}
          showMonthAndYearPickers={true}
        />
        {footer && (
          <div className="border-t px-3 py-2">
            {footer({
              select: (selectedDate, options) => {
                applyDate(selectedDate, options?.close ?? true);
              },
              close: () => setIsOpen(false),
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}


