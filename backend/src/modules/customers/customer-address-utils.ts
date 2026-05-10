/** 공백·대소문자 무시 비교용 (도로명/지번·기본주소 매칭) */
export function normalizeCustomerAddr(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/**
 * 저장된 기본주소(cu_address)가 도로명/지번 중 어디에 해당하는지 (쇼핑몰 기본주소 구분용)
 */
export function inferStoredAddressKind(
  storedMain: string | null | undefined,
  road: string | null,
  jibun: string | null,
): 'ROAD' | 'JIBUN' | 'UNKNOWN' {
  const s = normalizeCustomerAddr(storedMain || '');
  if (!s) return 'UNKNOWN';
  const r = normalizeCustomerAddr(road || '');
  const j = normalizeCustomerAddr(jibun || '');
  const minLen = 4;
  const matchR = r.length >= minLen && (s === r || s.includes(r) || r.includes(s));
  const matchJ = j.length >= minLen && (s === j || s.includes(j) || j.includes(s));
  if (matchR && !matchJ) return 'ROAD';
  if (matchJ && !matchR) return 'JIBUN';
  if (matchR && matchJ) {
    if (s === r) return 'ROAD';
    if (s === j) return 'JIBUN';
    return 'UNKNOWN';
  }
  return 'UNKNOWN';
}
