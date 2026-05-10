/**
 * 판매 항목(CONTAINER 타입) 집계·가용 차감용 베일·중량.
 * 베일만 입력 시 중량은 컨 대비 비율로, 중량만 입력 시 베일도 비율로 환산 (부분 예약 시 목록·상세·가용 일치).
 */
export function effectiveSalesBalesFromContainer(c: {
  tradeBales?: string | null;
  salesBales?: string | null;
}): number {
  if (c.salesBales != null && c.salesBales !== '') return Number(c.salesBales);
  return c.tradeBales ? Number(c.tradeBales) : 0;
}

export function resolveContainerTypeSalesItemCargoQuantities(
  container: { tradeBales?: string | null; salesBales?: string | null; weight?: string | null },
  item: { cargoBales?: string | null; cargoWeight?: string | null },
): { bales: number; weight: number } {
  const containerBales = effectiveSalesBalesFromContainer(container);
  const containerWeight =
    container.weight != null && String(container.weight).trim() !== '' ? Number(container.weight) : 0;

  const hasBales = item.cargoBales != null && String(item.cargoBales).trim() !== '';
  const hasWeight = item.cargoWeight != null && String(item.cargoWeight).trim() !== '';

  if (!hasBales && !hasWeight) {
    return { bales: containerBales, weight: containerWeight };
  }

  const balesNum = hasBales ? Number(item.cargoBales) : NaN;
  const weightNum = hasWeight ? Number(item.cargoWeight) : NaN;

  if (hasBales && hasWeight && Number.isFinite(balesNum) && Number.isFinite(weightNum)) {
    return { bales: balesNum, weight: weightNum };
  }
  if (hasBales && Number.isFinite(balesNum)) {
    if (containerBales > 0 && containerWeight > 0) {
      return { bales: balesNum, weight: (containerWeight * balesNum) / containerBales };
    }
    return { bales: balesNum, weight: 0 };
  }
  if (hasWeight && Number.isFinite(weightNum)) {
    if (containerBales > 0 && containerWeight > 0) {
      return { bales: (containerBales * weightNum) / containerWeight, weight: weightNum };
    }
    if (containerWeight > 0) {
      return { bales: 0, weight: weightNum };
    }
    return { bales: containerBales, weight: weightNum };
  }
  return { bales: containerBales, weight: containerWeight };
}
