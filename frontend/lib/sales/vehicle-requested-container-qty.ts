/**
 * 판매예약 그리드: 차량분류(CONSULTATION_REQUEST_WEIGHT 저장값) → 요청수량(컨) 자동입력.
 * 코드값은 코드관리 DB 시드와 맞춤. 미정·추가 코드는 여기 맵만 보완하면 됨.
 */
export const VEHICLE_REQUESTED_CONTAINER_QTY_BY_CODE: Record<string, number> = {
  TRUCK_1T: 0.1,
  TRUCK_3_5T: 0.2,
  TRUCK_5T_CARGO: 0.6,
  TRUCK_25T_CARGO: 0.8,
  CONTAINER: 1,
};

export function normalizeVehicleCodeForLookup(raw: string): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  return t.startsWith('__legacy__:') ? t.slice('__legacy__:'.length).trim() : t;
}

/** 매핑이 있으면 컨 수량, 없으면 undefined (요청수량 자동변경 안 함). */
export function requestedContainerQtyFromVehicleCode(raw: string): number | undefined {
  const v = normalizeVehicleCodeForLookup(raw);
  if (!v) return undefined;
  const n = VEHICLE_REQUESTED_CONTAINER_QTY_BY_CODE[v];
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}

/** 페이지·툴팁 안내용 (한글 라벨 기준) */
export const VEHICLE_REQUESTED_CONTAINER_QTY_HINT_ROWS: {
  vehicleLabel: string;
  qtyLabel: string;
}[] = [
  { vehicleLabel: '1톤', qtyLabel: '0.1' },
  { vehicleLabel: '1.5톤', qtyLabel: '추후' },
  { vehicleLabel: '3.5톤', qtyLabel: '0.2' },
  { vehicleLabel: '5톤카고', qtyLabel: '0.6' },
  { vehicleLabel: '5톤단축카고', qtyLabel: '추후' },
  { vehicleLabel: '5톤초단축카고', qtyLabel: '추후' },
  { vehicleLabel: '25톤카고', qtyLabel: '0.8' },
  { vehicleLabel: '컨테이너', qtyLabel: '1' },
];
