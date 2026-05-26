'use client';

import * as React from 'react';

export const formatActivityDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export const formatActivityNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (num % 1 === 0) return num.toLocaleString('ko-KR');
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const formatLedgerDateLabel = (dateStr: string) => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  return `${y}. ${m}. ${d}.`;
};

export function ActivityDetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 text-sm ${className ?? ''}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground break-words">{value ?? '-'}</p>
    </div>
  );
}
