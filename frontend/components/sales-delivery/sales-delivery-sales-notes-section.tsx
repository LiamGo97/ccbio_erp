'use client';

import { Separator } from '@/components/ui/separator';

interface SalesDeliverySalesNotesSectionProps {
  notes?: string | null;
  /** 비었을 때도 섹션 표시 */
  showWhenEmpty?: boolean;
  /** 하단 Separator 포함 여부 */
  withSeparator?: boolean;
}

export function SalesDeliverySalesNotesSection({
  notes,
  showWhenEmpty = true,
  withSeparator = true,
}: SalesDeliverySalesNotesSectionProps) {
  const text = notes?.trim() || '';
  if (!text && !showWhenEmpty) return null;

  return (
    <>
      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold text-foreground">판매 비고</h3>
        <div className="flex flex-col gap-1">
          {text ? (
            <span className="text-sm font-medium whitespace-pre-wrap">{text}</span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}
        </div>
      </section>
      {withSeparator ? <Separator /> : null}
    </>
  );
}
