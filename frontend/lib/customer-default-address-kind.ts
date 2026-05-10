import type { Customer } from '@/lib/hooks/use-customers';

function normalizeAddrForKind(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function inferDefaultKindFromLegacy(
  legacy: string,
  road: string,
  jibun: string,
): 'ROAD' | 'JIBUN' | null {
  const s = normalizeAddrForKind(legacy);
  if (!s) return null;
  const r = normalizeAddrForKind(road);
  const j = normalizeAddrForKind(jibun);
  const minLen = 4;
  const matchR = r.length >= minLen && (s === r || s.includes(r) || r.includes(s));
  const matchJ = j.length >= minLen && (s === j || s.includes(j) || j.includes(s));
  if (matchR && !matchJ) return 'ROAD';
  if (matchJ && !matchR) return 'JIBUN';
  if (matchR && matchJ) {
    if (s === r) return 'ROAD';
    if (s === j) return 'JIBUN';
  }
  return null;
}

/** cu_address_default_type + 레거시 주소(cu_address)·단일 줄 입력으로 기본 주소 구분 */
export function resolveDefaultAddressKind(data: Customer): 'ROAD' | 'JIBUN' | null {
  const rawOriginal = data.addressDefaultType?.trim() || '';
  const raw = rawOriginal.toUpperCase();

  if (
    raw === 'ROAD' ||
    raw === 'ROAD_ADDR' ||
    raw === 'DORO' ||
    raw === 'R' ||
    raw === 'ROADNAME' ||
    raw === 'NEW_ADDR' ||
    raw === 'NEW_ADDRESS'
  ) {
    return 'ROAD';
  }
  if (
    raw === 'JIBUN' ||
    raw === 'LOT' ||
    raw === 'JIBEON' ||
    raw === 'J' ||
    raw === 'OLD_ADDR' ||
    raw === 'OLD_ADDRESS' ||
    raw === 'LAND'
  ) {
    return 'JIBUN';
  }

  const compact = rawOriginal.replace(/\s+/g, '');
  if (/도로명|도로|신주소|새주소/i.test(compact)) return 'ROAD';
  if (/지번|구주소|옛주소/i.test(compact)) return 'JIBUN';

  const road = data.addressRoad?.trim() || '';
  const jibun = data.addressJibun?.trim() || '';
  const legacy = data.address?.trim() || '';

  if (road && !jibun) return 'ROAD';
  if (jibun && !road) return 'JIBUN';

  return inferDefaultKindFromLegacy(legacy, road, jibun);
}

/** 고객 목록 등: 기본으로 선택된 도로명 또는 지번 한 줄 (상세 drawer 기본 뱃지와 동일 기준) */
export function formatCustomerListDefaultAddress(c: Customer): string {
  const road = c.addressRoad?.trim() || '';
  const jibun = c.addressJibun?.trim() || '';
  const legacy = c.address?.trim() || '';
  const kind = resolveDefaultAddressKind(c);
  if (kind === 'ROAD') return road || jibun || legacy;
  if (kind === 'JIBUN') return jibun || road || legacy;
  return road || jibun || legacy;
}
