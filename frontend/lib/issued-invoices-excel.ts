import * as XLSX from 'xlsx';
import type { SalesInvoice } from '@/lib/hooks/use-invoices';

function excelDateTime(value?: string | null): string {
  if (!value) return '';
  const s = String(value).trim();
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  const normalized = isIsoLike && !hasTimezone ? s.replace(/\.\d{3}$/, '') + 'Z' : s;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getItemBl(item: Record<string, unknown>): string {
  const anyItem = item as { bl?: string; salesItem?: { container?: { order?: { bl?: string }; bl?: string } } };
  if (anyItem?.bl) return String(anyItem.bl);
  const fromOrder = anyItem?.salesItem?.container?.order?.bl;
  if (fromOrder) return String(fromOrder);
  return '';
}

function getItemContainerNo(item: Record<string, unknown>): string {
  const anyItem = item as { containerNo?: string; salesItem?: { container?: { containerNo?: string } } };
  if (anyItem?.containerNo) return String(anyItem.containerNo);
  const no = anyItem?.salesItem?.container?.containerNo;
  if (no) return String(no);
  return '';
}

function abbreviateSpec(spec: string): string {
  const key = spec.trim().toUpperCase().replace(/\s+/g, '_');
  if (key === 'HEAVY_BALE' || key === 'HEAVY_BALES') return '헤';
  return spec;
}

export type IssuedInvoiceExcelLabelMaps = {
  sms?: Record<string, string>;
  ecount?: Record<string, string>;
};

/**
 * 필터·정렬이 적용된 발행 목록을 품목 단위로 평탄화 (한 거래명세서에 품목이 여러 개면 여러 행).
 * 목록 화면과 동일한 BL·컨테이너·일시 표기 계열.
 */
export function flattenIssuedInvoicesForExcel(
  invoices: SalesInvoice[],
  labelMaps?: IssuedInvoiceExcelLabelMaps,
): Record<string, string | number>[] {
  const smsMap = labelMaps?.sms ?? {};
  const ecMap = labelMaps?.ecount ?? {};
  const rows: Record<string, string | number>[] = [];

  for (const inv of invoices) {
    const smsRaw = inv.smsStatus ?? '';
    const smsLabel =
      smsMap[smsRaw] ??
      (smsRaw === 'NOT_APPLICABLE' ? '해당없음' : smsRaw ? smsRaw : '미발송');
    const ecRaw = inv.ecountProcessingStatus ?? '';
    const ecLabel =
      ecMap[ecRaw] ??
      (ecRaw === 'PROCESSED'
        ? '처리완료'
        : ecRaw === 'NOT_APPLICABLE'
          ? '해당없음'
          : ecRaw === 'NEEDS_CONFIRMATION'
            ? '확인 필요'
            : !ecRaw || ecRaw === 'NOT_PROCESSED'
              ? '미처리'
              : ecRaw);

    const base: Record<string, string | number> = {
      거래명세서_번호: inv.invoiceNumber ?? '',
      명세_취소: inv.invoiceCancelled ? 'Y' : 'N',
      판매취소_연결: inv.salesCancelled ? 'Y' : 'N',
      고객명: inv.customer?.companyName ?? inv.companyName ?? '',
      대표자: inv.customer?.ceo ?? inv.ceo ?? '',
      공급자: inv.supplier?.companyName ?? '',
      발행일시: excelDateTime(inv.issuedAt),
      총금액: inv.invoiceAmount != null ? Number(inv.invoiceAmount) : '',
      SMS발송상태: smsLabel,
      이카운트처리: ecLabel,
      발행자: inv.issuedByUser?.name ?? '',
      수정일시: excelDateTime(inv.updatedAt),
    };

    const items = [...(inv.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (items.length === 0) {
      rows.push({
        ...base,
        항목순번: '',
        품목명: '',
        규격: '',
        BL: '',
        컨테이너: '',
        수량: '',
        단위: '',
        단가: '',
        공급가액: '',
        부가세: '',
      });
      continue;
    }

    items.forEach((item, i) => {
      const raw = item as Record<string, unknown>;
      const specRaw = raw.specification != null ? String(raw.specification) : '';
      const spec = specRaw ? abbreviateSpec(specRaw) : '';
      rows.push({
        ...base,
        항목순번: item.order ?? i + 1,
        품목명: item.productName ?? '',
        규격: spec,
        BL: getItemBl(raw),
        컨테이너: getItemContainerNo(raw),
        수량: item.quantity != null ? Number(item.quantity) : '',
        단위: item.unit ?? '',
        단가: item.unitPrice != null ? Number(item.unitPrice) : '',
        공급가액: item.amount != null ? Number(item.amount) : '',
        부가세: item.vatAmount != null ? Number(item.vatAmount) : '',
      });
    });
  }

  return rows;
}

export function downloadIssuedInvoicesExcel(rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 8 },
    { wch: 10 },
    { wch: 24 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 8 },
    { wch: 28 },
    { wch: 8 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '거래명세서');
  const day = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `거래명세서_관리_${day}.xlsx`);
}
