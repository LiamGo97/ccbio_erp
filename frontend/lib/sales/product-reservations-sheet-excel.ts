import { format } from 'date-fns';
import * as XLSX from 'xlsx';

/** 1행 A열 — 다운로드 양식 식별 */
export const SRS_EXPORT_FORMAT_MARKER =
  'CCBIO_SALES_RESERVATION_SHEET_EXPORT_V2';

/** V1: 등급 열 없음(가져오기 호환) */
export const SRS_EXPORT_FORMAT_MARKER_LEGACY =
  'CCBIO_SALES_RESERVATION_SHEET_EXPORT_V1';

export const SRS_ROW_INDEX_HEADER = '행번호';

export const SRS_DATA_COL_COUNT = 13;

/** 헤더 행 (행번호 + DB 열 순서 13개) — `columnHeaderLabel`과 동일 */
export function srsExportHeaderLabels(): string[] {
  return [
    SRS_ROW_INDEX_HEADER,
    '상품',
    '등급',
    '업체명',
    '상태',
    'BL',
    '담당연락처',
    '요청수량(컨)',
    '차량분류',
    '상차일정',
    '도착일정',
    '비고',
    '단가',
    '참고',
  ];
}

/** V1 엑셀(등급 열 없음) 헤더 — 행번호 제외 12개 */
const SRS_LEGACY_DATA_HEADER_LABELS: string[] = [
  '상품',
  '업체명',
  '상태',
  'BL',
  '담당연락처',
  '요청수량(컨)',
  '차량분류',
  '상차일정',
  '도착일정',
  '비고',
  '단가',
  '참고',
];

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

export function srsBuildExportAoA(opts: {
  rowCount: number;
  getCell: (r: number, c: number) => string;
}): (string | number)[][] {
  const headers = srsExportHeaderLabels();
  const aoa: (string | number)[][] = [[SRS_EXPORT_FORMAT_MARKER], headers];
  for (let r = 0; r < opts.rowCount; r++) {
    const row: string[] = [String(r)];
    for (let c = 0; c < SRS_DATA_COL_COUNT; c++) {
      row.push(opts.getCell(r, c));
    }
    aoa.push(row);
  }
  return aoa;
}

export function srsDownloadXlsx(
  aoa: (string | number)[][],
  filename: string,
): void {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '판매예약');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export type SrsImportRow = { rowIndex: number; values: string[] };

const ROW_INDEX_HEADER_KEYS = new Set([
  normalizeHeaderKey(SRS_ROW_INDEX_HEADER),
  'rowindex',
  'row',
  'no',
  '#',
  '행',
]);

function findHeaderColumnIndicesForLabels(
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

/** 현재(13열) 또는 V1(12열, 등급 생략) 헤더 매핑 */
function findImportHeaderMapping(headerRow: unknown[]):
  | { rowIndexCol: number; gridColToSheetCol: number[] }
  | null {
  const expected = srsExportHeaderLabels();
  const newDataLabels = expected.slice(1);
  const cur = findHeaderColumnIndicesForLabels(headerRow, newDataLabels);
  if (cur) {
    const gridColToSheetCol = newDataLabels.map((_, j) => cur.dataCols[j]!);
    return { rowIndexCol: cur.rowIndexCol, gridColToSheetCol };
  }

  const legacy = findHeaderColumnIndicesForLabels(
    headerRow,
    SRS_LEGACY_DATA_HEADER_LABELS,
  );
  if (!legacy) return null;

  const gridColToSheetCol: number[] = [];
  for (let g = 0; g < SRS_DATA_COL_COUNT; g++) {
    if (g === 1) {
      gridColToSheetCol.push(-1);
    } else {
      const legacyIdx = g < 1 ? 0 : g - 1;
      gridColToSheetCol.push(legacy.dataCols[legacyIdx]!);
    }
  }
  return { rowIndexCol: legacy.rowIndexCol, gridColToSheetCol };
}

export function srsParseImportFromArrayBuffer(
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
  let headerRowIdx = 0;
  let dataStartIdx = 1;

  if (
    a00 === SRS_EXPORT_FORMAT_MARKER ||
    a00 === SRS_EXPORT_FORMAT_MARKER_LEGACY
  ) {
    headerRowIdx = 1;
    dataStartIdx = 2;
  }

  const headerRow = data[headerRowIdx];
  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    return { ok: false, message: '헤더 행을 찾을 수 없습니다.' };
  }

  const mapping = findImportHeaderMapping(headerRow);
  if (!mapping) {
    return {
      ok: false,
      message:
        '필수 열(행번호, 상품, 업체명 등)을 찾을 수 없습니다. 다운로드한 양식의 헤더를 유지해 주세요.',
    };
  }

  const rows: SrsImportRow[] = [];
  for (let i = dataStartIdx; i < data.length; i++) {
    const line = data[i];
    if (!Array.isArray(line)) continue;
    if (line.every((x) => cellToString(x).trim() === '')) continue;

    const riRaw = line[mapping.rowIndexCol];
    const ri = parseInt(String(riRaw ?? '').trim(), 10);
    if (!Number.isFinite(ri) || ri < 0) continue;

    const values: string[] = [];
    for (let g = 0; g < SRS_DATA_COL_COUNT; g++) {
      const colIdx = mapping.gridColToSheetCol[g]!;
      values.push(
        colIdx < 0
          ? ''
          : colIdx < line.length
            ? cellToString(line[colIdx])
            : '',
      );
    }
    rows.push({ rowIndex: ri, values });
  }

  if (rows.length === 0) {
    return { ok: false, message: '반영할 데이터 행이 없습니다.' };
  }

  return { ok: true, rows };
}
