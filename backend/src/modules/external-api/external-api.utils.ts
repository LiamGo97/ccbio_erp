/** 베일·중량 모두 0인 컨테이너 제외 (외부 API 전용) */
export function filterZeroBalesWeight<
  T extends { bales?: number; salesBales?: number; tradeBales?: number; weight?: number },
>(arr: T[]): T[] {
  return arr.filter((c) => {
    const b = Number(c.bales ?? c.salesBales ?? c.tradeBales ?? 0) || 0;
    const w = Number(c.weight ?? 0) || 0;
    return b > 0 || w >= 0.01;
  });
}
