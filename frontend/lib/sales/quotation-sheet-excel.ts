import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  SRS_ROW_INDEX_HEADER,
  type SrsImportRow,
} from '@/lib/sales/product-reservations-sheet-excel';

/** 구보내기(13열) 식별 */
export const QUOTATION_EXPORT_FORMAT_MARKER_V1 =
  'CCBIO_QUOTATION_SHEET_EXPORT_V1';

/** 중간본(14열, 비고 옆 「환율」열 포함) — 복구 시 해당 열 제거 */
export const QUOTATION_EXPORT_FORMAT_MARKER_V2 =
  'CCBIO_QUOTATION_SHEET_EXPORT_V2';

/** 현재 견적서(13열, 환율 계산 직접 저장) */
export const QUOTATION_EXPORT_FORMAT_MARKER =
  'CCBIO_QUOTATION_SHEET_EXPORT_V3';

export const QUOTATION_DATA_COL_COUNT = 13;

/** 구 13열 헤더 — V1 파일 복구용 */
export function quotationExportHeaderLabelsV1(): string[] {
  return [
    'BL',
    'ETA',
    '통화단위',
    '단가',
    '수출국',
    '상품',
    '등급',
    '패킹',
    '비고',
    '환율 계산',
    '원가',
    '마진',
    '판매가',
  ];
}

/** V2(14열): 비고 다음에 「환율」열이 있던 양식 */
export function quotationExportHeaderLabelsV2(): string[] {
  return [
    'BL',
    'ETA',
    '통화단위',
    '단가',
    '수출국',
    '상품',
    '등급',
    '패킹',
    '비고',
    '환율',
    '환율 계산',
    '원가',
    '마진',
    '판매가',
  ];
}

/** 헤더 2행: 행번호 + 견적 그리드 열 (`columnHeaderLabel`과 동일) */
export function quotationExportHeaderLabels(): string[] {
  return quotationExportHeaderLabelsV1();
}

/** V2 행(14값) → 그리드 13값(「환율」열 제거) */
export function collapseV2QuotationRowTo13(values: string[]): string[] {
  const v = values.slice(0, 14);
  while (v.length < 14) v.push('');
  return [...v.slice(0, 9), ...v.slice(10, 14)];
}

function normalizeHeaderKey(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function cellToString(x: unknown): string {
  if (x == null || x === '') return '';
  if (x instanceof Date && !Number.isNaN(x.getTime())) {
    return format(x, 'yyyy-MM-dd');
  }
  if (typeof x === 'number' && Number.isFinite(x)) {
    return String(x);
  }
  return String(x).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

const ROW_INDEX_HEADER_KEYS = new Set([
  normalizeHeaderKey(SRS_ROW_INDEX_HEADER),
  'rowindex',
  'row',
  'no',
  '#',
  '행',
]);

function findQuotationDataColumnIndices(
  headerRow: unknown[],
  dataHeaderLabels: string[],
): { rowIndexCol: number; dataCols: number[] } | null {
  const norms = headerRow.map((h) => normalizeHeaderKey(String(h ?? '')));

  let rowIndexCol = -1;
  for (let i = 0; i < norms.length; i++) {
    if (ROW_INDEX_HEADER_KEYS.has(norms[i]!)) {
      rowIndexCol = i;
      break;
    }
  }
  if (rowIndexCol < 0) return null;

  const dataCols: number[] = [];
  for (const label of dataHeaderLabels) {
    const want = normalizeHeaderKey(label);
    let found = -1;
    for (let i = 0; i < norms.length; i++) {
      if (norms[i] === want) {
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    dataCols.push(found);
  }

  return { rowIndexCol, dataCols };
}

export function quotationBuildExportAoA(opts: {
  rowCount: number;
  getCell: (r: number, c: number) => string;
}): (string | number)[][] {
  const dataLabels = quotationExportHeaderLabels();
  const headers = [SRS_ROW_INDEX_HEADER, ...dataLabels];
  const aoa: (string | number)[][] = [
    [QUOTATION_EXPORT_FORMAT_MARKER],
    headers,
  ];
  for (let r = 0; r < opts.rowCount; r++) {
    const row: string[] = [String(r)];
    for (let c = 0; c < QUOTATION_DATA_COL_COUNT; c++) {
      row.push(opts.getCell(r, c));
    }
    aoa.push(row);
  }
  return aoa;
}

export function quotationDownloadXlsx(
  aoa: (string | number)[][],
  filename: string,
): void {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '견적서');
  XLSX.writeFile(
    wb,
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
  );
}

/** 견적서 양식(마커 + 헤더)에서 행 복구 */
export function quotationParseImportFromArrayBuffer(
  ab: ArrayBuffer,
):
  | { ok: true; rows: SrsImportRow[] }
  | { ok: false; message: string } {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(ab, { type: 'array', cellDates: true });
  } catch {
    return { ok: false, message: '엑셀 파일을 읽지 못했습니다.' };
  }

  const name = wb.SheetNames[0];
  if (!name) return { ok: false, message: '시트가 비어 있습니다.' };
  const ws = wb.Sheets[name];
  if (!ws) return { ok: false, message: '시트가 비어 있습니다.' };

  const data = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
  }) as unknown[][];

  if (data.length < 2) {
    return { ok: false, message: '데이터가 없습니다.' };
  }

  const a00 = cellToString(data[0]?.[0]);
  const legacyV1 = a00 === QUOTATION_EXPORT_FORMAT_MARKER_V1;
  const legacyV2 = a00 === QUOTATION_EXPORT_FORMAT_MARKER_V2;
  const modern = a00 === QUOTATION_EXPORT_FORMAT_MARKER;
  if (!legacyV1 && !legacyV2 && !modern) {
    return { ok: false, message: '견적서보내기 양식이 아닙니다.' };
  }

  const headerRow = data[1];
  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    return { ok: false, message: '헤더 행을 찾을 수 없습니다.' };
  }

  const dataLabels = legacyV1
    ? quotationExportHeaderLabelsV1()
    : legacyV2
      ? quotationExportHeaderLabelsV2()
      : quotationExportHeaderLabels();
  const dataColCount = legacyV2 ? 14 : QUOTATION_DATA_COL_COUNT;
  const mapping = findQuotationDataColumnIndices(headerRow, dataLabels);
  if (!mapping) {
    return {
      ok: false,
      message:
        '필수 열(행번호, BL, ETA 등)을 찾을 수 없습니다. 다운로드한 양식의 헤더를 유지해 주세요.',
    };
  }

  const rows: SrsImportRow[] = [];
  for (let i = 2; i < data.length; i++) {
    const line = data[i];
    if (!Array.isArray(line)) continue;
    if (line.every((x) => cellToString(x).trim() === '')) continue;

    const riRaw = line[mapping.rowIndexCol];
    const ri = parseInt(String(riRaw ?? '').trim(), 10);
    if (!Number.isFinite(ri) || ri < 0) continue;

    const values: string[] = [];
    for (let g = 0; g < dataColCount; g++) {
      const colIdx = mapping.dataCols[g]!;
      values.push(
        colIdx < line.length ? cellToString(line[colIdx]) : '',
      );
    }
    rows.push({
      rowIndex: ri,
      values: legacyV2 ? collapseV2QuotationRowTo13(values) : values,
    });
  }

  if (rows.length === 0) {
    return { ok: false, message: '반영할 데이터 행이 없습니다.' };
  }

  return { ok: true, rows };
}
