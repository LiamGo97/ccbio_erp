import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 숫자를 3자리마다 콤마로 포맷팅하고 소수점 2자리까지 반올림하여 표시
 * 소수점이 없으면 정수로 표시하고, 소수점이 있으면 최대 2자리까지 표시
 * @param value - 포맷팅할 숫자 값 (string, number, undefined)
 * @returns 포맷팅된 문자열 (예: "1,234" 또는 "1,234.56")
 */
export function formatNumberWithDecimals(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '';
  // 반올림 처리: 소수점 3자리에서 반올림하여 2자리로 표시
  const rounded = Math.round(num * 100) / 100;
  // 소수점이 있으면 최대 2자리까지, 없으면 정수로 표시
  const hasDecimal = rounded % 1 !== 0;
  if (hasDecimal) {
    return rounded.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }
  return rounded.toLocaleString('ko-KR');
}

/**
 * 포맷팅된 문자열(콤마 포함)을 숫자로 변환
 * @param value - 파싱할 문자열 (콤마 포함 가능)
 * @returns 파싱된 숫자 또는 undefined
 */
export function parseNumber(value: string): number | undefined {
  const cleaned = value.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * 숫자를 3자리마다 콤마로 포맷팅 (소수점 없이 정수로 표시)
 * @param value - 포맷팅할 숫자 값 (string, number, undefined)
 * @param decimals - 표시할 소수점 자릿수 (기본값: 0, 정수로 표시)
 * @returns 포맷팅된 문자열 (예: "1,234" 또는 "1,234.56")
 */
export function formatNumber(value: string | number | undefined | null, decimals: number = 0): string {
  if (value === undefined || value === null || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * DB NUMERIC 등에서 오는 "40.0000" → "40", "40.5000" → "40.5" 처럼 불필요한 소수 0만 제거.
 * 숫자로 해석되지 않으면 원문을 그대로 반환.
 */
export function formatDecimalTrimTrailingZeros(
  value: string | number | null | undefined
): string {
  if (value === undefined || value === null) return '';
  const raw = String(value).trim();
  if (raw === '') return '';
  const normalized = raw.replace(/,/g, '');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return raw;
  if (/^-?\d+\.\d+$/.test(normalized)) {
    return normalized.replace(/\.?0+$/, '') || '0';
  }
  if (/^-?\d+$/.test(normalized)) {
    return normalized;
  }
  return new Intl.NumberFormat('en-US', {
    useGrouping: false,
    maximumFractionDigits: 20,
  }).format(n);
}

/** GCS 버킷 내부 경로 → Public URL 변환 (계근증 등) */
const GCS_BUCKET = process.env.NEXT_PUBLIC_GCS_BUCKET || 'ccbio-erp-files';
export function getGcsPublicUrl(path: string): string {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  return `https://storage.googleapis.com/${GCS_BUCKET}/${trimmed}`;
}
