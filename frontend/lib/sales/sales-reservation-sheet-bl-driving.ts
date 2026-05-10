/**
 * 판매예약 시트: 행별 BL 후보(blOptionsPerRowIndexed)는 상품열·등급열만 바뀌면 됨.
 * `cells` 전체가 바뀌어도 이 서명이 같으면 무거운 필터/배열 생성을 생략할 수 있다.
 */
export function computeBlOptionsDrivingSignature(
  rowCount: number,
  cells: Record<string, string>,
  cellKey: (row: number, col: number) => string,
  colProduct: number,
  colSalesGrade: number,
): string {
  const parts: string[] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    parts[r] = `${(cells[cellKey(r, colProduct)] ?? '').trim()}\x1e${(cells[cellKey(r, colSalesGrade)] ?? '').trim()}`;
  }
  return parts.join('\x1f');
}
