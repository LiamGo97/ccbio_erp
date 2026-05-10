'use client';

import * as React from 'react';
import { Input } from './input';
import { formatNumberWithDecimals, parseNumber } from '@/lib/utils';

interface NumberInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value?: number | null;
  onChange?: (value: number | undefined) => void;
  decimals?: number; // 소수점 자리수 (기본값: 2)
  allowNegative?: boolean; // 음수 허용 여부 (기본값: false)
}

/**
 * 숫자 입력 필드 컴포넌트
 * - 입력 중에도 3자리마다 콤마 표시
 * - 소수점 입력 가능
 * - 소수점은 2자리까지 표시하고 반올림 처리
 */
export function NumberInput({
  value,
  onChange,
  decimals = 2,
  allowNegative = false,
  onFocus,
  onBlur,
  ...props
}: NumberInputProps) {
  const [inputValue, setInputValue] = React.useState<string>('');
  const [isFocused, setIsFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 입력 중 콤마를 포함한 값 포맷팅 (소수점은 그대로 유지)
  const formatInputValue = React.useCallback((val: string): string => {
    if (!val) return '';
    
    // 음수 허용 여부에 따라 정규식 변경
    const regex = allowNegative ? /[^0-9.-]/g : /[^0-9.]/g;
    let cleaned = val.replace(regex, '');
    
    // 음수인 경우 마이너스 기호는 맨 앞에만 허용
    if (allowNegative) {
      const hasMinus = cleaned.startsWith('-');
      cleaned = cleaned.replace(/-/g, '');
      if (hasMinus) {
        cleaned = '-' + cleaned;
      }
    }
    
    // 소수점이 여러 개인 경우 첫 번째만 유지
    const parts = cleaned.split('.');
    const integerPart = parts[0] || '';
    const decimalPart = parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, decimals) : '';
    
    // 정수 부분에 콤마 추가 (마이너스 기호 고려)
    const isNegative = integerPart.startsWith('-');
    const absIntegerPart = isNegative ? integerPart.slice(1) : integerPart;
    const formattedInteger = absIntegerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    return (isNegative ? '-' : '') + formattedInteger + decimalPart;
  }, [decimals, allowNegative]);

  // 숫자 값 포맷팅 (포커스 아웃 시 사용)
  const formatDisplayValue = React.useCallback(
    (val: number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const num = val;
      if (isNaN(num)) return '';
      // 반올림 처리: 소수점 decimals+1자리에서 반올림하여 decimals자리로 표시
      const multiplier = Math.pow(10, decimals);
      const rounded = Math.round(num * multiplier) / multiplier;
      // 소수점이 있으면 최대 decimals자리까지, 없으면 정수로 표시
      const hasDecimal = rounded % 1 !== 0;
      if (hasDecimal) {
        return rounded.toLocaleString('ko-KR', { maximumFractionDigits: decimals });
      }
      return rounded.toLocaleString('ko-KR');
    },
    [decimals]
  );

  // 포커스 시 원본 값으로 시작
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (value !== null && value !== undefined) {
      // 포맷팅된 값에서 콤마 제거하여 입력 시작
      const formatted = formatDisplayValue(value);
      setInputValue(formatted.replace(/,/g, ''));
    } else {
      setInputValue('');
    }
    onFocus?.(e);
  };

  // 포커스 아웃 시 포맷팅 적용 및 반올림
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    
    // 입력값을 숫자로 변환하고 반올림
    const num = parseNumber(inputValue);
    if (num !== undefined) {
      const multiplier = Math.pow(10, decimals);
      const rounded = Math.round(num * multiplier) / multiplier;
      onChange?.(rounded);
      setInputValue('');
    } else {
      onChange?.(undefined);
      setInputValue('');
    }
    onBlur?.(e);
  };

  // 입력 변경 처리
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    
    // 음수 허용 여부에 따라 정규식 변경
    const regex = allowNegative ? /[^0-9.-]/g : /[^0-9.]/g;
    let cleaned = rawValue.replace(regex, '');
    
    // 음수인 경우 마이너스 기호는 맨 앞에만 허용
    if (allowNegative) {
      const hasMinus = cleaned.startsWith('-');
      cleaned = cleaned.replace(/-/g, '');
      if (hasMinus) {
        cleaned = '-' + cleaned;
      }
    }
    
    // 소수점이 여러 개인 경우 첫 번째만 유지
    const parts = cleaned.split('.');
    const integerPart = parts[0] || '';
    const decimalPart = parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, decimals) : '';
    
    const newValue = integerPart + decimalPart;
    setInputValue(newValue);
    
    // 실시간으로 숫자 값 업데이트 (반올림 없이)
    const num = parseNumber(newValue);
    onChange?.(num);
  };

  // 표시할 값 결정
  const displayValue = React.useMemo(() => {
    if (isFocused && inputValue !== '') {
      // 입력 중: 콤마 포함하여 표시
      return formatInputValue(inputValue);
    } else if (isFocused) {
      // 포커스 중이지만 입력값이 없음
      return '';
    } else {
      // 포커스 아웃: 포맷팅된 값 표시
      return formatDisplayValue(value);
    }
  }, [isFocused, inputValue, value, formatInputValue, formatDisplayValue]);

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

